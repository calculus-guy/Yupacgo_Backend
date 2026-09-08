const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const env = require("../config/env");
const { Sentry } = require("../config/sentry");

/**
 * Wraps an async route handler so rejected promises reach Express's error
 * pipeline instead of hanging the request. Express 5 forwards rejections
 * automatically, but this keeps intent explicit and stays correct if the
 * handler is ever mounted somewhere that doesn't.
 */
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** 404 for unmatched routes — previously returned Express's default HTML page. */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        status: "error",
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
};

/**
 * Terminal error handler.
 *
 * Translates known failure shapes into clean status codes and *never* leaks an
 * unexpected error's message to the client in production.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies this by arity (4 args)
const errorHandler = (err, req, res, next) => {
    let error = err;

    // --- Normalise well-known non-AppError failures -------------------------
    if (!(error instanceof AppError)) {
        if (err?.name === "ValidationError" && err?.errors) {
            // Mongoose schema validation
            const details = Object.values(err.errors).map((e) => e.message);
            error = AppError.badRequest("Validation failed", { details });
        } else if (err?.name === "CastError") {
            error = AppError.badRequest(`Invalid value for '${err.path}'`);
        } else if (err?.code === 11000) {
            const field = Object.keys(err.keyValue || {})[0] || "field";
            error = AppError.conflict(`That ${field} is already in use`);
        } else if (err?.name === "JsonWebTokenError") {
            error = AppError.unauthorized("Invalid authentication token");
        } else if (err?.name === "TokenExpiredError") {
            error = AppError.unauthorized("Your session has expired. Please sign in again.");
        } else if (err?.type === "entity.too.large") {
            error = AppError.badRequest("Request body is too large");
        } else if (err?.type === "entity.parse.failed") {
            error = AppError.badRequest("Malformed JSON in request body");
        }
    }

    const isKnown = error instanceof AppError;
    const statusCode = isKnown ? error.statusCode : 500;

    if (statusCode >= 500) {
        logger.exception("Unhandled request error", err, {
            method: req.method,
            path: req.originalUrl,
            userId: req.user?.userId
        });
        // No-op if SENTRY_DSN isn't configured — safe to call unconditionally.
        Sentry.captureException(err, { extra: { path: req.originalUrl, userId: req.user?.userId } });
    } else {
        logger.warn("Request failed", {
            method: req.method,
            path: req.originalUrl,
            statusCode,
            message: error.message,
            userId: req.user?.userId
        });
    }

    const body = {
        status: "error",
        // Unknown 500s get a generic message; operational errors are safe to echo.
        message: isKnown ? error.message : "Something went wrong on our end. Please try again."
    };

    if (isKnown && error.details) body.details = error.details;
    if (isKnown && error.code) body.code = error.code;
    // Stack only ever in non-production, and only for genuine 500s.
    if (!env.isProd && statusCode >= 500) body.stack = err?.stack;

    res.status(statusCode).json(body);
};

module.exports = { asyncHandler, notFoundHandler, errorHandler };
