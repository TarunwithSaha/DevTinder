const AppError = require("../utils/AppError");

function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// Express recognises an error handler by its four parameters
function errorHandler(err, req, res, next) {
  let status = 500;
  let message = "Something went wrong";

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
  } else if (err.code === 11000) {
    // Duplicate key. Say which kind, instead of assuming it is always an email.
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0];
    message = field === "emailId" ? "Email is already registered" : "That record already exists";
  } else if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  } else if (err.name === "CastError") {
    status = 400;
    message = "Invalid id or value format";
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Request body is not valid JSON";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large";
  }

  // Log real bugs, but never send internal details to the client
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };