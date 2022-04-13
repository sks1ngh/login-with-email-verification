require("dotenv").config();
var validator = require("email-validator");
const express = require("express");
const app = express();
const ejs = require("ejs");
const User = require("./db/mongo-setup");
const mongoose = require("mongoose");
var cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const md5 = require("md5");
const Cryptr = require("cryptr");
const cryptr = new Cryptr(process.env.CRYPTRKEY);
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
  let { loggedin, user } = req.cookies;
  try {
    var objID = cryptr.decrypt(user);
  } catch (e) {
    var objID = null;
  }

  if (loggedin === "1" && objID !== null) {
    let userInfo = await User.findById({ _id: objID });
    if (userInfo) {
      res.locals.firstname = userInfo.firstname;
      res.locals.emailVerified = userInfo.emailVerified;
      res.locals.email = userInfo.email;
      next();
    } else {
      res.clearCookie("user");
      res.clearCookie("loggedin");
      res.redirect("/register");
    }
  } else {
    res.clearCookie("user");
    res.clearCookie("loggedin");
    res.redirect("/login");
  }
}

async function isVerified(req, res, next) {
  let { firstname, emailVerified, email } = res.locals;
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
      to: res.locals.email, // list of receivers
      subject: "Verify Email for Login", // Subject line
      text: "To verify your email, please enter the code :- " + code, // plain text body
      // html: "<b>Hello world?</b>", // html body
    });

    res.render("verifyEmail", { email: email });
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
    res.locals.firstname = userInfo.firstname;
    res.locals.emailVerified = userInfo.emailVerified;
    res.locals.email = userInfo.email;
    res.redirect("/userProfile");
  } else {
    res.clearCookie("user");
    res.clearCookie("loggedin");
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
  res.render("register", { emailValid: true, userExists: false });
});

app.post("/register", async function (req, res) {
  let { firstname, lastname, email, password } = req.body;
  let userExists = await User.findOne({ email: email });
  let validEmail = validator.validate(email);
  console.log(validEmail);
  if (!validEmail) {
    res.render("register", { emailValid: validEmail, userExists: false });
  } else {
    if (userExists === null) {
      const newUser = new User({
        firstname: firstname,
        lastname: lastname,
        email: email,
        password: password,
      });

      await newUser
        .save()
        .then((data) => {
          res.send(
            "User registered successfully, please <a href='/login'>login!</a>"
          );
        })
        .catch((err) => console.log(err));
    } else {
      res.render("register", {
        emailValid: true,
        userExists: true,
      });
    }
  }
});

app.post("/login", async function (req, res) {
  let { email, password } = req.body;
  let userExists = await User.findOne({ email: email, password: password });
  if (userExists !== null) {
    key = cryptr.encrypt(userExists.id);
    res.cookie("user", key);
    res.cookie("loggedin", "1");
    res.redirect("/userProfile");
  } else {
    res.render("login", { valid: false });
  }
});

app.get("/userProfile", checkLogin, isVerified, async function (req, res) {
  let { firstname, emailVerified, email } = res.locals;
  res.render("userProfile", { user: firstname });
});

app.post("/verifyEmail", checkLogin, async function (req, res) {
  let email = res.locals.email;
  if (email !== undefined) {
    let { code } = req.body;
    let codeDB = await User.findOne({ email: email });
    if (codeDB.lastCode == parseInt(code)) {
      let filter = { email: email };
      let update = { emailVerified: true };
      await User.findOneAndUpdate(filter, update, [[(overwrite = true)]]);
      res.redirect("/userProfile");
    } else {
      res.send(
        "Wrong Code entered, please try <a href='/userProfile'>again!</a>"
      );
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/logout", function (req, res) {
  res.clearCookie("user");
  res.clearCookie("loggedin");
  res.render("logout");
});

app.use("", function (req, res) {
  res.status(404).send("Page not found!");
});
