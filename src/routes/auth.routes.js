const express = require("express");
const router = express.Router();
const { signup, login } = require("../controllers/auth.controllers");
const { authLimiter } = require("../middleware/ratelimit");

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);

module.exports = router;