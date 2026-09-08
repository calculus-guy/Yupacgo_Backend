const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AppError = require("../utils/AppError");

/**
 * Standardised on 401 for every auth failure here (missing / malformed /
 * expired token). The original returned 403 for a bad token — but the
 * frontend's axios interceptor only clears the session and redirects on 401,
 * so an expired token silently produced unhandled failures instead of a
 * clean re-login prompt.
 */
module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return next(AppError.unauthorized("No token provided"));
    }

    try {
        req.user = jwt.verify(token, env.JWT_SECRET);
        next();
    } catch (err) {
        const message = err.name === "TokenExpiredError"
            ? "Your session has expired. Please sign in again."
            : "Invalid authentication token";
        next(AppError.unauthorized(message));
    }
};
