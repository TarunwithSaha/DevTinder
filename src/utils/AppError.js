// An error we throw on purpose, with an HTTP status code attached.
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = AppError;