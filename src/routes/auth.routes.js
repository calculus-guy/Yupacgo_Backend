const express = require("express");
const router = express.Router();
const {
    signup, login, logout, adminLogin, refreshToken,
    forgotPassword, verifyResetOTP, resetPassword
} = require("../controllers/auth.controllers");
const { authLimiter, otpRequestLimiter, otpVerifyLimiter } = require("../middleware/ratelimit");

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/admin-login", authLimiter, adminLogin);
router.post("/refresh-token", authLimiter, refreshToken);
router.post("/logout", logout);

// Password recovery — separately limited from general auth traffic (see
// ratelimit.js): request is capped per email+IP, verify/reset is capped
// per email+IP AND per-OTP attempt-limited at the data layer (otp.service.js).
router.post("/forgot-password", otpRequestLimiter, forgotPassword);
router.post("/verify-reset-otp", otpVerifyLimiter, verifyResetOTP);
router.post("/reset-password", otpVerifyLimiter, resetPassword);

module.exports = router;
