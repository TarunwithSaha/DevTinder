const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    lastName: { type: String, trim: true, maxlength: 50 },
    emailId: {
      type: String,
      required: true,
      unique: true,      // creates a unique index: the database itself rejects duplicates
      lowercase: true,
      trim: true,
    },
    // select: false means queries never return the hash unless we ask for it explicitly
    password: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);