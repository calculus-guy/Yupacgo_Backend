const { triggerPriceMonitoring, triggerCleanup } = require("../services/scheduler.service");
const { getRecentActivities, getActivityStats } = require("../services/activityLogger.service");
const User = require("../models/user.models");
const Watchlist = require("../models/watchlist.models");
const VirtualPortfolio = require("../models/virtualPortfolio.models");
const Notification = require("../models/notification.models");
const Recommendation = require("../models/recommendation.models");
const { redisClient } = require("../config/redis");

/**
 * Get admin dashboard overview
 * GET /api/admin/dashboard
 */
exports.getDashboard = async (req, res) => {
    try {
        // Get basic counts
        const [
            totalUsers,
            totalWatchlists,
            totalPortfolios,
            totalNotifications,
            totalRecommendations,
            activityStats
        ] = await Promise.all([
            User.countDocuments({ role: "user" }),
            Watchlist.countDocuments(),
            VirtualPortfolio.countDocuments(),
            Notification.countDocuments(),
            Recommendation.countDocuments(),
            getActivityStats(7) // Last 7 days
        ]);

        // Get new users today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: today },
            role: "user"
        });

        // Get active users (users with activity in last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const activeUsers = await User.countDocuments({
            updatedAt: { $gte: sevenDaysAgo },
            role: "user"
        });

        // System health checks
        const systemHealth = {
            database: "connected",
            redis: redisClient?.isOpen ? "connected" : "disconnected",
            backgroundJobs: "running" // Assume running if no errors
        };

        return res.json({
            status: "success",
            data: {
                overview: {
                    totalUsers,
                    newUsersToday,
                    activeUsers,
                    totalWatchlists,
                    totalPortfolios,
                    totalNotifications,
                    totalRecommendations
                },
                activityStats,
                systemHealth
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get all users with pagination
 * GET /api/admin/users
 */
exports.getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [users, totalUsers] = await Promise.all([
            User.find({ role: "user" })
                .select("-password")
                .populate("onboarding", "riskTolerance investmentGoals")
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip(skip),
            User.countDocuments({ role: "user" })
        ]);

        // Get additional stats for each user
        const usersWithStats = await Promise.all(
            users.map(async (user) => {
                const [watchlistCount, portfolioCount, notificationCount] = await Promise.all([
                    Watchlist.countDocuments({ userId: user._id }),
                    VirtualPortfolio.countDocuments({ userId: user._id }),
                    Notification.countDocuments({ userId: user._id })
                ]);

                return {
                    ...user.toObject(),
                    stats: {
                        watchlistCount,
                        portfolioCount,
                        notificationCount
                    }
                };
            })
        );

        return res.json({
            status: "success",
            data: {
                users: usersWithStats,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalUsers / limit),
                    totalUsers,
                    hasNext: page * limit < totalUsers,
                    hasPrev: page > 1
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get recent activities
 * GET /api/admin/activities
 */
exports.getActivities = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;

        const activities = await getRecentActivities(limit, skip);

        return res.json({
            status: "success",
            data: activities
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get system health status
 * GET /api/admin/system-health
 */
exports.getSystemHealth = async (req, res) => {
    try {
        const health = {
            database: "connected", // If we reach here, DB is connected
            redis: redisClient?.isOpen ? "connected" : "disconnected",
            backgroundJobs: "running",
            timestamp: new Date().toISOString()
        };

        // Test Redis connection
        try {
            await redisClient.ping();
            health.redis = "connected";
        } catch (error) {
            health.redis = "error";
        }

        return res.json({
            status: "success",
            data: health
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Manually trigger price monitoring (for testing)
 */
exports.triggerPriceMonitoring = async (req, res) => {
    try {
        const result = await triggerPriceMonitoring();
        
        return res.json({
            status: "success",
            message: "Price monitoring triggered",
            data: result
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Manually trigger notification cleanup (for testing)
 */
exports.triggerCleanup = async (req, res) => {
    try {
        const result = await triggerCleanup();
        
        return res.json({
            status: "success",
            message: "Cleanup triggered",
            data: result
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};
/**
 * Get stocks management data
 * GET /api/admin/stocks
 */
exports.getStocks = async (req, res) => {
    try {
        // Get most recommended stocks
        const recommendedStocks = await Recommendation.aggregate([
            {
                $unwind: "$recommendations"
            },
            {
                $group: {
                    _id: "$recommendations.symbol",
                    name: { $first: "$recommendations.name" },
                    count: { $sum: 1 },
                    avgScore: { $avg: "$recommendations.score" },
                    lastRecommended: { $max: "$createdAt" }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 50
            }
        ]);

        // Get most watched stocks
        const watchedStocks = await Watchlist.aggregate([
            {
                $group: {
                    _id: "$symbol",
                    name: { $first: "$name" },
                    count: { $sum: 1 },
                    alertsEnabled: {
                        $sum: {
                            $cond: ["$priceAlert.enabled", 1, 0]
                        }
                    }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 50
            }
        ]);

        // Get most traded stocks (virtual portfolio)
        const tradedStocks = await VirtualPortfolio.aggregate([
            {
                $unwind: "$transactions"
            },
            {
                $group: {
                    _id: "$transactions.symbol",
                    totalTransactions: { $sum: 1 },
                    totalVolume: { $sum: "$transactions.quantity" },
                    avgPrice: { $avg: "$transactions.price" }
                }
            },
            {
                $sort: { totalTransactions: -1 }
            },
            {
                $limit: 50
            }
        ]);

        return res.json({
            status: "success",
            data: {
                recommended: recommendedStocks,
                watched: watchedStocks,
                traded: tradedStocks
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get notification management data
 * GET /api/admin/notifications
 */
exports.getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Get recent notifications
        const [notifications, totalNotifications] = await Promise.all([
            Notification.find()
                .populate("userId", "firstname lastname email")
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip(skip),
            Notification.countDocuments()
        ]);

        // Get notification statistics
        const stats = await Notification.aggregate([
            {
                $group: {
                    _id: "$type",
                    count: { $sum: 1 },
                    readCount: {
                        $sum: { $cond: ["$read", 1, 0] }
                    }
                }
            }
        ]);

        // Get today's notifications
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = await Notification.countDocuments({
            createdAt: { $gte: today }
        });

        return res.json({
            status: "success",
            data: {
                notifications,
                stats,
                todayCount,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalNotifications / limit),
                    totalNotifications,
                    hasNext: page * limit < totalNotifications,
                    hasPrev: page > 1
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get recommendation analytics
 * GET /api/admin/recommendations
 */
exports.getRecommendationAnalytics = async (req, res) => {
    try {
        // Get recommendation statistics
        const totalRecommendations = await Recommendation.countDocuments();
        
        // Get recommendations by risk level
        const byRiskLevel = await Recommendation.aggregate([
            {
                $group: {
                    _id: "$riskLevel",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get most recommended stocks
        const topStocks = await Recommendation.aggregate([
            {
                $unwind: "$recommendations"
            },
            {
                $group: {
                    _id: "$recommendations.symbol",
                    name: { $first: "$recommendations.name" },
                    count: { $sum: 1 },
                    avgScore: { $avg: "$recommendations.score" }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Get recent recommendations
        const recentRecommendations = await Recommendation.find()
            .populate("userId", "firstname lastname email")
            .sort({ createdAt: -1 })
            .limit(10);

        return res.json({
            status: "success",
            data: {
                totalRecommendations,
                byRiskLevel,
                topStocks,
                recentRecommendations
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get watchlist analytics
 * GET /api/admin/watchlist-analytics
 */
exports.getWatchlistAnalytics = async (req, res) => {
    try {
        const totalWatchlists = await Watchlist.countDocuments();
        
        // Get most watched stocks
        const topWatchedStocks = await Watchlist.aggregate([
            {
                $group: {
                    _id: "$symbol",
                    name: { $first: "$name" },
                    count: { $sum: 1 },
                    alertsEnabled: {
                        $sum: { $cond: ["$priceAlert.enabled", 1, 0] }
                    }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Get alert statistics
        const alertStats = await Watchlist.aggregate([
            {
                $group: {
                    _id: null,
                    totalWatchlists: { $sum: 1 },
                    withAlerts: {
                        $sum: { $cond: ["$priceAlert.enabled", 1, 0] }
                    },
                    alertsAbove: {
                        $sum: { 
                            $cond: [
                                { $eq: ["$priceAlert.condition", "above"] }, 
                                1, 
                                0
                            ] 
                        }
                    },
                    alertsBelow: {
                        $sum: { 
                            $cond: [
                                { $eq: ["$priceAlert.condition", "below"] }, 
                                1, 
                                0
                            ] 
                        }
                    }
                }
            }
        ]);

        return res.json({
            status: "success",
            data: {
                totalWatchlists,
                topWatchedStocks,
                alertStats: alertStats[0] || {}
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get portfolio analytics
 * GET /api/admin/portfolio-analytics
 */
exports.getPortfolioAnalytics = async (req, res) => {
    try {
        const totalPortfolios = await VirtualPortfolio.countDocuments();
        
        // Get portfolio statistics
        const portfolioStats = await VirtualPortfolio.aggregate([
            {
                $group: {
                    _id: null,
                    totalCash: { $sum: "$cash" },
                    avgCash: { $avg: "$cash" },
                    totalTransactions: { $sum: { $size: "$transactions" } }
                }
            }
        ]);

        // Get most traded stocks
        const topTradedStocks = await VirtualPortfolio.aggregate([
            {
                $unwind: "$transactions"
            },
            {
                $group: {
                    _id: "$transactions.symbol",
                    totalTransactions: { $sum: 1 },
                    totalVolume: { $sum: "$transactions.quantity" },
                    avgPrice: { $avg: "$transactions.price" },
                    buyTransactions: {
                        $sum: { $cond: [{ $eq: ["$transactions.type", "buy"] }, 1, 0] }
                    },
                    sellTransactions: {
                        $sum: { $cond: [{ $eq: ["$transactions.type", "sell"] }, 1, 0] }
                    }
                }
            },
            {
                $sort: { totalTransactions: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Get recent transactions
        const recentTransactions = await VirtualPortfolio.aggregate([
            {
                $unwind: "$transactions"
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            {
                $unwind: "$user"
            },
            {
                $sort: { "transactions.timestamp": -1 }
            },
            {
                $limit: 10
            },
            {
                $project: {
                    "transactions.symbol": 1,
                    "transactions.type": 1,
                    "transactions.quantity": 1,
                    "transactions.price": 1,
                    "transactions.timestamp": 1,
                    "user.firstname": 1,
                    "user.lastname": 1,
                    "user.email": 1
                }
            }
        ]);

        return res.json({
            status: "success",
            data: {
                totalPortfolios,
                portfolioStats: portfolioStats[0] || {},
                topTradedStocks,
                recentTransactions
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};