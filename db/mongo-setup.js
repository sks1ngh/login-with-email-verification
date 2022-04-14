require("dotenv").config();
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = Schema({
  firstname: {
    type: String,
    required: [true, "No firstname specified"],
  },
  lastname: {
    type: String,
    required: [true, "No lastname specified"],
  },
  email: {
    type: String,
    required: [true, "No email specified"],
  },
  password: {
    type: String,
    required: [true, "No password specified"],
  },
  gender: {
    type: String,
    default: "-",
  },
  birthday: {
    type: String,
    default: "-",
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  lastCode: {
    type: Number,
  },
});

const User = mongoose.model("user", UserSchema);

module.exports = User;
