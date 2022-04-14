require("dotenv").config();
var validator = require("email-validator");
const express = require("express");
const app = express();
const ejs = require("ejs");
const passwordValidator = require("password-validator");
var schema = new passwordValidator();
schema
  .is()
  .min(8)
  .is()
  .max(16)
  .has()
  .uppercase()
  .has()
  .lowercase()
  .has()
  .digits(2)
  .has()
  .not()
  .spaces();
const User = require("./db/mongo-setup");
const mongoose = require("mongoose");
var cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const md5 = require("md5");
const Cryptr = require("cryptr");
const cryptr = new Cryptr(process.env.CRYPTRKEY);
const bcrypt = require("bcrypt");
const saltrounds = 10;
const nodemailer = require("nodemailer");

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function (req, res, next) {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "-1");
  next();
});
app.use(cookieParser());

// app.use(isloggedin());

async function checkLogin(req, res, next) {
  let { loggedin, user, p } = req.cookies;
  try {
    var objID = cryptr.decrypt(user);
    var password = cryptr.decrypt(p);
  } catch (e) {
    var objID = null;
    var password = null;
  }

  if (loggedin === "1" && objID !== null) {
    let userInfo = await User.findOne({ _id: objID, password: password });
    if (userInfo) {
      let key = cryptr.encrypt(userInfo._id);
      let key2 = cryptr.encrypt(userInfo.password);
      res.cookie("user", key, { maxAge: 300000, httpOnly: true });
      res.cookie("p", key2, { maxAge: 300000, httpOnly: true });
      res.locals.userInfo = userInfo;

      next();
    } else {
      res.clearCookie("user");
      res.clearCookie("loggedin");
      res.clearCookie("p");
      res.clearCookie("newEmail");
      res.redirect("/");
    }
  } else {
    res.clearCookie("user");
    res.clearCookie("loggedin");
    res.clearCookie("p");
    res.clearCookie("newEmail");
    res.redirect("/login");
  }
}

async function isVerified(req, res, next) {
  let { firstname, emailVerified, email } = res.locals.userInfo;
  if (emailVerified === true) {
    next();
  } else {
    let code = Math.floor(100000 + Math.random() * 900000);
    let filter = { email: email };
    let update = { lastCode: code };
    await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
    let transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.GMAILID, // generated ethereal user
        pass: process.env.GMAILPASS, // generated ethereal password
      },
    });
    let info = await transporter.sendMail({
      from: '"Andrew Pandey"', // sender address
      to: email, // list of receivers
      subject: "Verify Email for Login", // Subject line
      text: "To verify your email, please enter the code :- " + code, // plain text body
      // html: "<b>Hello world?</b>", // html body
    });

    res.render("verifyEmail", { email: email, wrongCode: false });
  }
}
async function redirect(req, res, next) {
  let { loggedin, user } = req.cookies;
  try {
    var objID = cryptr.decrypt(user);
  } catch (e) {
    var objID = null;
  }

  if (loggedin === "1" && objID !== null) {
    let userInfo = await User.findById({ _id: objID });
    if (userInfo !== null) {
      res.locals.firstname = userInfo.firstname;
      res.locals.emailVerified = userInfo.emailVerified;
      res.locals.email = userInfo.email;
      res.redirect("/userProfile");
    } else {
      res.clearCookie("user");
      res.clearCookie("loggedin");
      res.clearCookie("p");
      res.clearCookie("newEmail");
      next();
    }
  } else {
    res.clearCookie("user");
    res.clearCookie("loggedin");
    res.clearCookie("newEmail");
    res.clearCookie("p");
    next();
  }
}

var server_host = process.env.YOUR_HOST || "0.0.0.0";
app.listen(process.env.PORT || 3000, server_host, function () {
  console.log("Server started on port 3000");
});

mongoose.connect(process.env.MONGOURL, function () {
  console.log("Connected to database");
});

app.get("/", redirect, function (req, res) {
  res.render("home");
});

app.get("/login", redirect, function (req, res) {
  res.render("login", { valid: true });
});

app.get("/register", redirect, function (req, res) {
  res.render("register", {
    emailValid: true,
    userExists: false,
    validPass: true,
    success: false,
  });
});

app.post("/register", async function (req, res) {
  let { firstname, lastname, email, password } = req.body;
  var validPass = schema.validate(password);
  let userExists = await User.findOne({ email: email });
  let validEmail = validator.validate(email);
  if (validEmail === true) {
    if (userExists === null) {
      if (validPass === true) {
        password = await bcrypt.hash(password, saltrounds);
        const newUser = new User({
          firstname: firstname,
          lastname: lastname,
          email: email,
          password: password,
        });

        await newUser
          .save()
          .then((data) => {
            res.render("register", {
              emailValid: true,
              userExists: false,
              validPass: true,
              success: true,
            });
          })
          .catch((err) => console.log(err));
      } else {
        res.render("register", {
          emailValid: true,
          userExists: false,
          validPass: false,
          success: false,
        });
      }
    } else {
      res.render("register", {
        emailValid: true,
        userExists: true,
        validPass: true,
        success: false,
      });
    }
  } else {
    res.render("register", {
      emailValid: false,
      userExists: false,
      validPass: true,
      success: false,
    });
  }
});

app.post("/login", async function (req, res) {
  let { email, password } = req.body;
  let userExists = await User.findOne({ email: email });
  if (userExists) {
    var checkPass = await bcrypt.compare(password, userExists.password);
  } else {
    var checkPass = false;
  }
  if (userExists !== null && checkPass === true) {
    // if (userExists !== null) {
    let key = cryptr.encrypt(userExists.id);
    let key2 = cryptr.encrypt(userExists.password);
    res.cookie("user", key, { maxAge: 300000, httpOnly: true });
    res.cookie("loggedin", "1", { maxAge: 300000, httpOnly: true });
    res.cookie("p", key2, { maxAge: 300000, httpOnly: true });
    res.redirect("/userProfile");
  } else {
    res.render("login", { valid: false });
  }
  // } else {
  //   res.render("login", { valid: false });
  // }
});

app.get("/userProfile", checkLogin, isVerified, async function (req, res) {
  let { firstname, emailVerified, email } = res.locals.userInfo;
  res.render("userProfile", {
    user: firstname,
    email: email,
  });
});

app.get("/userProfileEdit", checkLogin, isVerified, async function (req, res) {
  let { firstname, lastname, email, emailVerified, gender, birthday } =
    res.locals.userInfo;
  res.render("userProfileEdit", {
    firstName: firstname,
    lastName: lastname,
    email: email,
    gender: gender,
    birthday: birthday,
  });
});

app.post("/verifyEmail", checkLogin, async function (req, res) {
  let { email } = res.locals.userInfo;
  if (email !== undefined) {
    let { code } = req.body;
    let codeDB = await User.findOne({ email: email });
    if (codeDB.lastCode == parseInt(code)) {
      let filter = { email: email };
      let update = { emailVerified: true };
      await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
      res.redirect("/userProfile");
    } else {
      res.render("verifyEmail", { email: email, wrongCode: true });
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/logout", function (req, res) {
  res.clearCookie("user");
  res.clearCookie("loggedin");
  res.clearCookie("newEmail");
  res.clearCookie("p");
  res.redirect("/");
});

app.get("/edit", checkLogin, isVerified, async function (req, res) {
  let { firstname, lastname, email, emailVerified, gender, birthday } =
    res.locals.userInfo;
  res.render("edit", {
    firstName: firstname,
    lastName: lastname,
    gender: gender,
    birthday: birthday,
  });
});

app.post("/edit", checkLogin, isVerified, async function (req, res) {
  let { email } = res.locals.userInfo;
  let filter = { email: email };
  let update = {
    firstname: req.body.firstname,
    lastname: req.body.lastname,
    gender: req.body.gender,
    birthday: req.body.birthday,
  };
  await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
  res.redirect("/userProfileEdit");
});

app.get("/editPassword", checkLogin, isVerified, async function (req, res) {
  res.render("editPassword", {
    wrongCurrentPassword: false,
    differentPasswords: false,
    success: false,
    validPass: true,
  });
});

app.post("/editPassword", checkLogin, isVerified, async function (req, res) {
  var { email, password } = res.locals.userInfo;
  var { currentPassword, newPassword, verifyNewPassword } = req.body;
  var validPass = schema.validate(newPassword);
  var checkPass = await bcrypt.compare(currentPassword, password);
  if (checkPass === true) {
    if (newPassword === verifyNewPassword) {
      if (validPass === true) {
        var password = await bcrypt.hash(newPassword, saltrounds);
        let filter = { email: email };
        let update = {
          password: password,
        };
        await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
        res.render("editPassword", {
          wrongCurrentPassword: false,
          differentPasswords: false,
          validPass: true,
          success: true,
        });
      } else {
        res.render("editPassword", {
          wrongCurrentPassword: false,
          differentPasswords: false,
          success: false,
          validPass: false,
        });
      }
    } else {
      res.render("editPassword", {
        wrongCurrentPassword: false,
        differentPasswords: true,
        success: false,
        validPass: true,
      });
    }
  } else {
    res.render("editPassword", {
      wrongCurrentPassword: true,
      differentPasswords: false,
      success: false,
      validPass: true,
    });
  }
});

app.get("/editEmail", checkLogin, isVerified, function (req, res) {
  res.render("editEmail", { alreadyVerified: false, invalidEmail: false });
});

app.post("/editEmail", checkLogin, isVerified, async function (req, res) {
  let { newEmail } = req.body;
  let { email } = res.locals.userInfo;
  let temp = await User.findOne({ email: newEmail });
  if (temp === null) {
    var emailAlreadyUsed = false;
  } else {
    var emailAlreadyUsed = true;
  }
  if (newEmail !== email && emailAlreadyUsed === false) {
    let validEmail = validator.validate(newEmail);
    if (validEmail == true) {
      let code = Math.floor(100000 + Math.random() * 900000);
      let filter = { email: email };
      let update = { lastCode: code };
      await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
      let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
          user: process.env.GMAILID, // generated ethereal user
          pass: process.env.GMAILPASS, // generated ethereal password
        },
      });
      let info = await transporter.sendMail({
        from: '"Andrew Pandey"', // sender address
        to: newEmail, // list of receivers
        subject: "Verify Email", // Subject line
        text: "To verify your new email, please enter the code :- " + code, // plain text body
        // html: "<b>Hello world?</b>", // html body
      });
      res.cookie("newEmail", cryptr.encrypt(newEmail));
      res.render("verifyChangedEmail", { email: newEmail, wrongCode: false });
    } else {
      res.render("editEmail", {
        alreadyVerified: false,
        invalidEmail: true,
        emailAlreadyUsed: false,
      });
    }
  } else {
    res.render("editEmail", {
      alreadyVerified: true,
      invalidEmail: false,
      emailAlreadyUsed: true,
    });
  }
});

app.post(
  "/verifyChangedEmail",
  checkLogin,
  isVerified,
  async function (req, res) {
    let { newEmail } = req.cookies;
    newEmail = cryptr.decrypt(newEmail);
    let { email } = res.locals.userInfo;
    if (email !== undefined) {
      let { code } = req.body;
      let codeDB = await User.findOne({ email: email });
      if (codeDB.lastCode == parseInt(code)) {
        let filter = { email: email };
        let update = { email: newEmail };
        await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
        res.clearCookie("newEmail");
        res.redirect("/userProfile");
      } else {
        res.send(
          "Wrong Code entered, please try <a href='/userProfile'>again!</a>"
        );
      }
    } else {
      res.redirect("/login");
    }
  }
);

app.use("", function (req, res) {
  res.status(404).send("Page not found!");
});
