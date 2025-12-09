const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
    requestPasswordChange,
    verifyOTP,
    changePassword,
    updateProfile,
    getSettings,
    deleteAccount
} = require("../controllers/profileManagement.controller");

// All profile management routes require authentication
router.post("/request-password-change", auth, requestPasswordChange);
router.post("/verify-otp", auth, verifyOTP);
router.post("/change-password", auth, changePassword);
router.put("/update", auth, updateProfile);
router.get("/settings", auth, getSettings);
router.delete("/delete-account", auth, deleteAccount);

module.exports = router;
