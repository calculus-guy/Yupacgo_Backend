/**
 * Operational error carrying an HTTP status and a client-safe message.
 *
 * Distinguishes "the user did something invalid" (safe to echo back) from
 * "something broke" (must not leak internals). The old controllers returned
 * `error.message` verbatim on every 500, exposing Mongo errors and stack
 * details to the browser.
 */
class AppError extends Error {
    constructor(statusCode, message, options = {}) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.isOperational = true;
        if (options.code) this.code = options.code;
        if (options.details) this.details = options.details;
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(msg = "Bad request", o) { return new AppError(400, msg, o); }
    static unauthorized(msg = "Authentication required", o) { return new AppError(401, msg, o); }
    static forbidden(msg = "You do not have access to this resource", o) { return new AppError(403, msg, o); }
    static notFound(msg = "Resource not found", o) { return new AppError(404, msg, o); }
    static conflict(msg = "Resource already exists", o) { return new AppError(409, msg, o); }
    static tooMany(msg = "Too many requests", o) { return new AppError(429, msg, o); }
    static unavailable(msg = "Service temporarily unavailable", o) { return new AppError(503, msg, o); }
}

module.exports = AppError;
