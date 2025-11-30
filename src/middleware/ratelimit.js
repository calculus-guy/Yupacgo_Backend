const rateLimit = require("express-rate-limit");

exports.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { status: "error", message: "Too many attempts. Try again later." }
});