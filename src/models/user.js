const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    lastName: { type: String, trim: true, maxlength: 50 },
    emailId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select: false means queries never return the hash unless asked for explicitly
    password: { type: String, required: true, select: false },

    // Profile fields (all optional; the user fills them in after signup)
    age: { type: Number, min: 18, max: 100 },
    gender: { type: String, enum: ["male", "female", "other"] },
    about: { type: String, trim: true, maxlength: 500, default: "" },
    skills: {
      type: [String],
      default: [],
      validate: { validator: (arr) => arr.length <= 10, message: "At most 10 skills" },
    },
    photoUrl: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);