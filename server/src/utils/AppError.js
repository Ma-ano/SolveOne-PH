export class AppError extends Error {
  constructor({ statusCode, code, message, details, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}
