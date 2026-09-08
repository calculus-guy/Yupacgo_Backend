const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

/**
 * Rate limiters.
 *
 * IMPORTANT: these only work correctly with `app.set('trust proxy', ...)` set
 * in server.js. Render sits behind a proxy; without that setting, Express
 * resolves every request's IP to the proxy's address, so ALL traffic shared
 * one bucket — the audit's root-cause for OTP requests failing under load
 * that had nothing to do with genuine abuse.
 */

const respond = (message) => (req, res) =>
    res.status(429).json({ status: "error", message });

/** General auth actions: login, signup, admin-login. */
exports.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: respond("Too many attempts. Please try again in a few minutes.")
});

/**
 * Requesting an OTP (forgot-password, password-change request).
 * Keyed by email+IP so one person spamming their own inbox doesn't also
 * exhaust the general auth bucket for everyone behind the same NAT/proxy, and
 * so someone can't email-bomb a victim by hammering just the IP-based key.
 */
exports.otpRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    // Must use the ipKeyGenerator helper rather than raw req.ip when combining
    // it into a composite key — it normalises IPv6 addresses so one caller
    // can't cheaply cycle through addresses within their own /64 to dodge the limit.
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body?.email || "").toLowerCase()}`,
    handler: respond("Too many reset codes requested. Please wait before requesting another.")
});

/**
 * OTP verification / password-reset submission.
 * This is defense-in-depth on top of the per-OTP attempt counter enforced in
 * the controller (see otp.models.js) — a 6-digit code has only 1,000,000
 * combinations, so both layers matter.
 */
exports.otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Must use the ipKeyGenerator helper rather than raw req.ip when combining
    // it into a composite key — it normalises IPv6 addresses so one caller
    // can't cheaply cycle through addresses within their own /64 to dodge the limit.
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body?.email || "").toLowerCase()}`,
    handler: respond("Too many attempts. Please request a new code.")
});
