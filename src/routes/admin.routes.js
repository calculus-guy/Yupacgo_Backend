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
    getMonitoringStats,
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
router.get("/monitoring-stats", adminAuth, getMonitoringStats);

// Manual triggers for testing
router.post("/trigger-price-monitoring", adminAuth, triggerPriceMonitoring);
router.post("/trigger-cleanup", adminAuth, triggerCleanup);

// Email testing endpoint (temporary)
router.post("/test-email", async (req, res) => {
    try {
        const { sendOTP } = require("../services/email.service");
        const testOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        console.log(`🧪 Testing email with OTP: ${testOTP}`);
        
        const result = await sendOTP("sakariyauabdullateef993@gmail.com", testOTP, "password_reset");
        
        if (result) {
            res.json({
                status: "success",
                message: "Test email sent successfully",
                otp: testOTP
            });
        } else {
            res.status(500).json({
                status: "error",
                message: "Failed to send test email"
            });
        }
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

module.exports = router;