const validator = require("validator");
const AppError = require("./AppError");

// ONLY these fields can be changed through the edit route.
// Anything else (emailId, password, _id, createdAt, a made-up "isAdmin"...) is rejected.
const EDITABLE_FIELDS = ["firstName", "lastName", "age", "gender", "about", "skills", "photoUrl"];
const GENDERS = ["male", "female", "other"];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateProfileUpdate(body) {
  if (!isPlainObject(body) || Object.keys(body).length === 0)
    throw new AppError("Send at least one field to update", 400);

  // Reject the whole request if it contains a field we do not allow.
  // Silently ignoring it would hide client bugs and attacks.
  const unknown = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k));
  if (unknown.length > 0)
    throw new AppError(`These fields cannot be edited: ${unknown.join(", ")}`, 400);

  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const updates = {};

  if (has("firstName")) {
    const v = body.firstName;
    if (typeof v !== "string" || v.trim().length < 2 || v.trim().length > 50)
      throw new AppError("First name must be 2 to 50 characters", 400);
    updates.firstName = v.trim();
  }

  if (has("lastName")) {
    const v = body.lastName;
    if (typeof v !== "string" || v.trim().length > 50)
      throw new AppError("Last name must be at most 50 characters", 400);
    updates.lastName = v.trim();
  }

  if (has("age")) {
    const v = body.age;
    // typeof number, so the string "21" is rejected, not silently converted
    if (!Number.isInteger(v) || v < 18 || v > 100)
      throw new AppError("Age must be a whole number from 18 to 100", 400);
    updates.age = v;
  }

  if (has("gender")) {
    if (!GENDERS.includes(body.gender))
      throw new AppError(`Gender must be one of: ${GENDERS.join(", ")}`, 400);
    updates.gender = body.gender;
  }

  if (has("about")) {
    const v = body.about;
    if (typeof v !== "string" || v.trim().length > 500)
      throw new AppError("About must be at most 500 characters", 400);
    updates.about = v.trim();
  }

  if (has("skills")) {
    const v = body.skills;
    if (!Array.isArray(v) || v.length > 10)
      throw new AppError("Skills must be a list of at most 10 items", 400);
    const seen = new Set();
    const cleaned = [];
    for (const s of v) {
      if (typeof s !== "string" || s.trim().length < 1 || s.trim().length > 30)
        throw new AppError("Each skill must be 1 to 30 characters", 400);
      const key = s.trim().toLowerCase();
      if (!seen.has(key)) {          // drop duplicates like "node" and "Node"
        seen.add(key);
        cleaned.push(s.trim());
      }
    }
    updates.skills = cleaned;
  }

  if (has("photoUrl")) {
    const v = body.photoUrl;
    if (typeof v !== "string" || v.trim().length > 500)
      throw new AppError("Photo URL must be at most 500 characters", 400);
    const url = v.trim();
    // An empty string clears the photo. Only http(s) URLs are allowed, so something
    // like "javascript:alert(1)" can never be stored and later rendered as a link.
    if (url !== "" && !validator.isURL(url, { protocols: ["http", "https"], require_protocol: true }))
      throw new AppError("Photo URL must be a valid http or https URL", 400);
    updates.photoUrl = url;
  }

  return updates;
}

function validatePasswordChange(body) {
  const { currentPassword, newPassword } = body || {};

  if (typeof currentPassword !== "string" || currentPassword.length === 0 || currentPassword.length > 72)
    throw new AppError("Current password is required", 400);
  if (typeof newPassword !== "string" || !validator.isStrongPassword(newPassword))
    throw new AppError(
      "New password must be at least 8 characters with a lowercase letter, an uppercase letter, a number and a symbol",
      400
    );
  if (newPassword.length > 72) throw new AppError("New password must be at most 72 characters", 400);
  if (newPassword === currentPassword)
    throw new AppError("New password must be different from the current one", 400);

  return { currentPassword, newPassword };
}

module.exports = { validateProfileUpdate, validatePasswordChange };