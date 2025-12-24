const express = require("express");
const router = express.Router();
const { signup, login, logout, adminLogin, forgotPassword, verifyResetOTP, resetPassword } = require("../controllers/auth.controllers");
const { authLimiter } = require("../middleware/ratelimit");

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/admin-login", authLimiter, adminLogin);
router.post("/logout", logout);

// Password recovery routes
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/verify-reset-otp", authLimiter, verifyResetOTP);
router.post("/reset-password", authLimiter, resetPassword);

module.exports = router;