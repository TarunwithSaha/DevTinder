const bcrypt = require("bcryptjs");
const User = require("../models/user");
const AppError = require("../utils/AppError");
const { validateProfileUpdate, validatePasswordChange } = require("../utils/profileValidation");
const { publicProfile } = require("../utils/serializers");

const SALT_ROUNDS = 10; // same cost factor as signup

exports.view = (req, res) => {
  res.json({ user: publicProfile(req.user) });
};

exports.edit = async (req, res) => {
  const updates = validateProfileUpdate(req.body);
  // Load, set, save: schema validators and middleware run on save()
  req.user.set(updates);
  await req.user.save();
  res.json({ message: "Profile updated", user: publicProfile(req.user) });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = validatePasswordChange(req.body);

  // requireAuth loaded the user WITHOUT the hash, so fetch it explicitly here
  const user = await User.findById(req.user._id).select("+password");
  const matches = await bcrypt.compare(currentPassword, user.password);
  if (!matches) throw new AppError("Current password is incorrect", 400);

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();
  res.json({ message: "Password changed" });
};