const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { otpRequestLimiter, otpVerifyLimiter } = require("../middleware/ratelimit");
const {
    requestPasswordChange,
    verifyOTP,
    changePassword,
    updateProfile,
    getSettings,
    deleteAccount
} = require("../controllers/profileManagement.controller");

// All profile management routes require authentication
router.post("/request-password-change", auth, otpRequestLimiter, requestPasswordChange);
router.post("/verify-otp", auth, otpVerifyLimiter, verifyOTP);
router.post("/change-password", auth, otpVerifyLimiter, changePassword);
router.put("/update", auth, updateProfile);
router.get("/settings", auth, getSettings);
router.delete("/delete-account", auth, deleteAccount);

module.exports = router;
