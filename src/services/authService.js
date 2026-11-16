const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const AppError = require("../utils/AppError");

const SALT_ROUNDS = 10;

// Used when the email does not exist, so the login still does the same slow hash
// comparison. Otherwise "unknown email" would respond faster than "wrong password",
// and an attacker could use the timing to discover which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", SALT_ROUNDS);

async function signup({ firstName, lastName, emailId, password }) {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  return User.create({ firstName, lastName, emailId, password: hash });
}

async function login(emailId, password) {
  const user = await User.findOne({ emailId }).select("+password");
  const matches = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  // Same message for "no such user" and "wrong password"
  if (!user || !matches) throw new AppError("Invalid credentials", 401);
  return user;
}

function createToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

// The only shape of a user that ever leaves the server
function toPublic(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    emailId: user.emailId,
  };
}

module.exports = { signup, login, createToken, toPublic };