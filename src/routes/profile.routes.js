const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { getProfile, getProfileSummary } = require("../controllers/profile.controller");

// All profile routes require authentication
router.get("/", auth, getProfile);
router.get("/summary", auth, getProfileSummary);

module.exports = router;