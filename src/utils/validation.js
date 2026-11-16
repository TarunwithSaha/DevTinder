const validator = require("validator");
const AppError = require("./AppError");

// Every field is type-checked BEFORE it is used. Without this, a client could send
// {"emailId": {"$ne": null}} and turn the login query into "match any user"
// (NoSQL injection).
function validateSignup(body) {
  const { firstName, lastName, emailId, password } = body || {};

  if (typeof firstName !== "string" || firstName.trim().length < 2 || firstName.trim().length > 50)
    throw new AppError("First name must be 2 to 50 characters", 400);
  if (lastName !== undefined && (typeof lastName !== "string" || lastName.trim().length > 50))
    throw new AppError("Last name must be at most 50 characters", 400);
  if (typeof emailId !== "string" || !validator.isEmail(emailId.trim()))
    throw new AppError("A valid email is required", 400);
  if (typeof password !== "string" || !validator.isStrongPassword(password))
    throw new AppError(
      "Password must be at least 8 characters with a lowercase letter, an uppercase letter, a number and a symbol",
      400
    );
  // bcrypt only uses the first 72 bytes of a password
  if (password.length > 72) throw new AppError("Password must be at most 72 characters", 400);

  // Return only the fields we expect, so extra fields in the body are ignored
  return {
    firstName: firstName.trim(),
    lastName: typeof lastName === "string" ? lastName.trim() : undefined,
    emailId: emailId.trim().toLowerCase(),
    password,
  };
}

function validateLogin(body) {
  const { emailId, password } = body || {};

  if (typeof emailId !== "string" || !validator.isEmail(emailId.trim()))
    throw new AppError("A valid email is required", 400);
  if (typeof password !== "string" || password.length === 0 || password.length > 72)
    throw new AppError("Password is required", 400);

  return { emailId: emailId.trim().toLowerCase(), password };
}

module.exports = { validateSignup, validateLogin };