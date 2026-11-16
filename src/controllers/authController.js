const authService = require("../services/authService");
const { validateSignup, validateLogin } = require("../utils/validation");

const COOKIE_NAME = "token";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// httpOnly: JavaScript in the page cannot read the cookie (limits damage from XSS).
// sameSite lax: the browser does not send it on cross-site POSTs (limits CSRF).
// secure: only over HTTPS, switched on in production.
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
});

exports.signup = async (req, res) => {
  const data = validateSignup(req.body);
  const user = await authService.signup(data);
  res.status(201).json({ message: "Signup successful", user: authService.toPublic(user) });
};

exports.login = async (req, res) => {
  const { emailId, password } = validateLogin(req.body);
  const user = await authService.login(emailId, password);
  const token = authService.createToken(user);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: WEEK_MS });
  res.json({ message: "Login successful", user: authService.toPublic(user) });
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ message: "Logged out" });
};

exports.profile = (req, res) => {
  res.json({ user: authService.toPublic(req.user) });
};