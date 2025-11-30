const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { saveOnboarding, getOnboarding } = require("../controllers/onboarding.controller");

router.post("/save", auth, saveOnboarding);
router.get("/get", auth, getOnboarding);

module.exports = router;