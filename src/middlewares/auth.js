const jwt = require("jsonwebtoken");
const User = require("../models/user");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token) throw new AppError("Please log in", 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw new AppError("Session is invalid or expired, please log in again", 401);
  }

  // Look the user up every time, so a deleted account stops working immediately
  const user = await User.findById(payload.id);
  if (!user) throw new AppError("Please log in", 401);

  req.user = user;
  next();
});

module.exports = { requireAuth };