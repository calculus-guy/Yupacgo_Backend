const express = require("express");
const router = express.Router();
const { signup, login, logout, adminLogin } = require("../controllers/auth.controllers");
const { authLimiter } = require("../middleware/ratelimit");

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/admin-login", authLimiter, adminLogin);
router.post("/logout", logout);

module.exports = router;