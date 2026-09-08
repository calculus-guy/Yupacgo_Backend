const jwt = require("jsonwebtoken");
const User = require("../models/user.models");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { asyncHandler } = require("./errorHandler");

/**
 * Admin authentication middleware — verifies JWT and requires role 'admin'.
 * Standardised on 401 for auth failures / 403 only for "authenticated but not
 * an admin", matching auth.middleware.js.
 */
exports.adminAuth = asyncHandler(async (req, res, next) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) throw AppError.unauthorized("Access denied. No token provided.");

    let decoded;
    try {
        decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
        const message = err.name === "TokenExpiredError"
            ? "Your session has expired. Please sign in again."
            : "Invalid authentication token";
        throw AppError.unauthorized(message);
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) throw AppError.unauthorized("Invalid token. User not found.");
    if (user.role !== "admin") throw AppError.forbidden("Admin privileges required.");

    req.user = {
        userId: user._id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role
    };

    next();
});
