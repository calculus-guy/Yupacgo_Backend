const express = require("express");
const router = express.Router();
const { 
    getDashboard, 
    getUsers, 
    getActivities, 
    getSystemHealth,
    getStocks,
    getNotifications,
    getRecommendationAnalytics,
    getWatchlistAnalytics,
    getPortfolioAnalytics,
    triggerPriceMonitoring, 
    triggerCleanup 
} = require("../controllers/admin.controller");
const { adminAuth } = require("../middleware/adminAuth");

// Admin dashboard routes (all require admin authentication)
router.get("/dashboard", adminAuth, getDashboard);
router.get("/users", adminAuth, getUsers);
router.get("/activities", adminAuth, getActivities);
router.get("/system-health", adminAuth, getSystemHealth);

// Analytics routes
router.get("/stocks", adminAuth, getStocks);
router.get("/notifications", adminAuth, getNotifications);
router.get("/recommendations", adminAuth, getRecommendationAnalytics);
router.get("/watchlist-analytics", adminAuth, getWatchlistAnalytics);
router.get("/portfolio-analytics", adminAuth, getPortfolioAnalytics);

// Manual triggers for testing
router.post("/trigger-price-monitoring", adminAuth, triggerPriceMonitoring);
router.post("/trigger-cleanup", adminAuth, triggerCleanup);

module.exports = router;
