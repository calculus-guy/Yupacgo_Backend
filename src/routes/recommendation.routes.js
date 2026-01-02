const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
    generateRecommendations,
    getRecommendations,
    getRecommendationHistory,
    getTrending,
    markAsViewed,
    clearCache
} = require("../controllers/recommendation.controller");

// All recommendation routes require authentication
router.post("/generate", auth, generateRecommendations);
router.get("/", auth, getRecommendations);
router.get("/history", auth, getRecommendationHistory);
router.get("/trending", getTrending); // Public endpoint
router.put("/:sessionId/view", auth, markAsViewed);
router.delete("/cache", auth, clearCache); // Cache clearing for testing

module.exports = router;
