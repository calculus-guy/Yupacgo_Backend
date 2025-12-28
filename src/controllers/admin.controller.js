const { triggerPriceMonitoring, triggerCleanup } = require("../services/scheduler.service");
const { getRecentActivities, getActivityStats } = require("../services/activityLogger.service");
const { getMonitoringStats } = require("../services/priceMonitoring.service");
const providerManager = require("../services/providerManager.service");
const providerHealth = require("../services/providerHealth.service");
const smartCache = require("../services/smartCache.service");
const stockNameEnrichment = require("../services/stockNameEnrichment.service");
const User = require("../models/user.models");
const Watchlist = require("../models/watchlist.models");
const VirtualPortfolio = require("../models/virtualPortfolio.models");
const Notification = require("../models/notification.models");
const RecommendationSession = require("../models/recommendationSession.models");
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
            RecommendationSession.countDocuments(),
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
        const recommendedStocks = await RecommendationSession.aggregate([
            {
                $unwind: "$recommendations"
            },
            {
                $group: {
                    _id: "$recommendations.symbol",
                    name: { $first: "$recommendations.name" },
                    count: { $sum: 1 },
                    avgScore: { $avg: "$recommendations.matchScore" },
                    lastRecommended: { $max: "$generatedAt" }
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

        // Enrich all stock names using the stock name enrichment service
        const enrichRecommendedStocks = recommendedStocks.map(stock => ({
            ...stock,
            name: stockNameEnrichment.staticNames[stock._id] || stock.name || stock._id
        }));

        const enrichWatchedStocks = watchedStocks.map(stock => ({
            ...stock,
            name: stockNameEnrichment.staticNames[stock._id] || stock.name || stock._id
        }));

        const enrichTradedStocks = tradedStocks.map(stock => ({
            ...stock,
            name: stockNameEnrichment.staticNames[stock._id] || stock._id
        }));

        return res.json({
            status: "success",
            data: {
                recommended: enrichRecommendedStocks,
                watched: enrichWatchedStocks,
                traded: enrichTradedStocks
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
        const totalRecommendations = await RecommendationSession.countDocuments();
        
        // Get recommendations by risk level
        const byRiskLevel = await RecommendationSession.aggregate([
            {
                $group: {
                    _id: "$profileSnapshot.riskLevel",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get most recommended stocks
        const topStocks = await RecommendationSession.aggregate([
            {
                $unwind: "$recommendations"
            },
            {
                $group: {
                    _id: "$recommendations.symbol",
                    name: { $first: "$recommendations.name" },
                    count: { $sum: 1 },
                    avgScore: { $avg: "$recommendations.matchScore" }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Enrich stock names
        const enrichedTopStocks = topStocks.map(stock => ({
            ...stock,
            name: stockNameEnrichment.staticNames[stock._id] || stock.name || stock._id
        }));

        // Get recent recommendations
        const recentRecommendations = await RecommendationSession.find()
            .populate("userId", "firstname lastname email")
            .sort({ generatedAt: -1 })
            .limit(10);

        return res.json({
            status: "success",
            data: {
                totalRecommendations,
                byRiskLevel,
                topStocks: enrichedTopStocks,
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

        // Enrich stock names
        const enrichedTopWatchedStocks = topWatchedStocks.map(stock => ({
            ...stock,
            name: stockNameEnrichment.staticNames[stock._id] || stock.name || stock._id
        }));

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
                topWatchedStocks: enrichedTopWatchedStocks,
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

        // Enrich stock names for traded stocks
        const enrichedTopTradedStocks = topTradedStocks.map(stock => ({
            ...stock,
            name: stockNameEnrichment.staticNames[stock._id] || stock._id
        }));

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

        // Enrich stock names in recent transactions
        const enrichedRecentTransactions = recentTransactions.map(transaction => ({
            ...transaction,
            transactions: {
                ...transaction.transactions,
                name: stockNameEnrichment.staticNames[transaction.transactions.symbol] || transaction.transactions.symbol
            }
        }));

        return res.json({
            status: "success",
            data: {
                totalPortfolios,
                portfolioStats: portfolioStats[0] || {},
                topTradedStocks: enrichedTopTradedStocks,
                recentTransactions: enrichedRecentTransactions
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get price monitoring analytics
 * GET /api/admin/monitoring-stats
 */
exports.getMonitoringStats = async (req, res) => {
    try {
        const stats = await getMonitoringStats();
        
        if (!stats) {
            return res.status(500).json({
                status: "error",
                message: "Failed to get monitoring statistics"
            });
        }

        // Get additional monitoring details
        const alertsWithDetails = await Watchlist.aggregate([
            {
                $match: {
                    "priceAlert.enabled": true,
                    "priceAlert.targetPrice": { $exists: true, $ne: null }
                }
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
                $group: {
                    _id: "$priceAlert.condition",
                    count: { $sum: 1 },
                    symbols: { $addToSet: "$symbol" }
                }
            }
        ]);

        // Get recent alert performance
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentAlertPerformance = await Notification.aggregate([
            {
                $match: {
                    type: "price_alert",
                    createdAt: { $gte: last24Hours }
                }
            },
            {
                $group: {
                    _id: {
                        hour: { $hour: "$createdAt" },
                        symbol: "$metadata.symbol"
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.hour",
                    alertCount: { $sum: "$count" },
                    uniqueSymbols: { $sum: 1 }
                }
            },
            {
                $sort: { "_id": 1 }
            }
        ]);

        return res.json({
            status: "success",
            data: {
                ...stats,
                alertsByCondition: alertsWithDetails,
                recentAlertPerformance,
                monitoringStatus: "24/7 Active",
                schedules: {
                    base: "Every 5 minutes (24/7)",
                    marketHours: "Every 2 minutes (9AM-4PM EST, Mon-Fri)",
                    extendedHours: "Every 10 minutes (4PM-9AM EST, Mon-Fri)",
                    weekends: "Every 15 minutes (Sat-Sun)"
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get provider health information
 * GET /api/admin/provider-health
 */
exports.getProviderHealth = async (req, res) => {
    try {
        const healthSummary = await providerHealth.getHealthSummary();
        const providerStats = await providerHealth.getProviderStats();
        const alerts = await providerHealth.getHealthAlerts();
        
        return res.json({
            status: "success",
            data: {
                summary: healthSummary,
                providers: providerStats,
                alerts,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get detailed provider statistics
 * GET /api/admin/provider-stats/:provider?
 */
exports.getProviderStats = async (req, res) => {
    try {
        const { provider } = req.params;
        const stats = await providerHealth.getProviderStats(provider);
        
        return res.json({
            status: "success",
            data: stats
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Reset provider health metrics
 * POST /api/admin/provider/:provider/reset-health
 */
exports.resetProviderHealth = async (req, res) => {
    try {
        const { provider } = req.params;
        
        if (!['finnhub', 'twelvedata', 'alphavantage'].includes(provider)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid provider name"
            });
        }
        
        await providerHealth.resetProviderHealth(provider);
        providerManager.resetProviderHealth(provider);
        
        return res.json({
            status: "success",
            message: `Health metrics reset for ${provider}`
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Disable a provider temporarily
 * POST /api/admin/provider/:provider/disable
 */
exports.disableProvider = async (req, res) => {
    try {
        const { provider } = req.params;
        
        if (!['finnhub', 'twelvedata', 'alphavantage'].includes(provider)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid provider name"
            });
        }
        
        providerManager.disableProvider(provider);
        
        return res.json({
            status: "success",
            message: `Provider ${provider} disabled`
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Enable a provider
 * POST /api/admin/provider/:provider/enable
 */
exports.enableProvider = async (req, res) => {
    try {
        const { provider } = req.params;
        
        if (!['finnhub', 'twelvedata', 'alphavantage'].includes(provider)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid provider name"
            });
        }
        
        providerManager.enableProvider(provider);
        
        return res.json({
            status: "success",
            message: `Provider ${provider} enabled`
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get cache statistics
 * GET /api/admin/cache-stats
 */
exports.getCacheStats = async (req, res) => {
    try {
        const stats = await smartCache.getStats();
        const config = smartCache.getConfig();
        
        return res.json({
            status: "success",
            data: {
                statistics: stats,
                configuration: config,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Test provider connectivity
 * POST /api/admin/test-provider/:provider
 */
exports.testProvider = async (req, res) => {
    try {
        const { provider } = req.params;
        const { symbol = 'AAPL' } = req.body;
        
        if (!['finnhub', 'twelvedata', 'alphavantage'].includes(provider)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid provider name"
            });
        }
        
        const startTime = Date.now();
        
        try {
            // Force use specific provider by temporarily disabling others
            const otherProviders = ['finnhub', 'twelvedata', 'alphavantage'].filter(p => p !== provider);
            otherProviders.forEach(p => providerManager.disableProvider(p));
            
            const quote = await providerManager.getQuote(symbol, { skipCache: true });
            const responseTime = Date.now() - startTime;
            
            // Re-enable other providers
            otherProviders.forEach(p => providerManager.enableProvider(p));
            
            return res.json({
                status: "success",
                data: {
                    provider,
                    symbol,
                    responseTime,
                    quote,
                    testTime: new Date().toISOString()
                }
            });
            
        } catch (testError) {
            // Re-enable other providers even if test failed
            const otherProviders = ['finnhub', 'twelvedata', 'alphavantage'].filter(p => p !== provider);
            otherProviders.forEach(p => providerManager.enableProvider(p));
            
            const responseTime = Date.now() - startTime;
            
            return res.json({
                status: "error",
                data: {
                    provider,
                    symbol,
                    responseTime,
                    error: testError.message,
                    testTime: new Date().toISOString()
                }
            });
        }
        
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * Get API optimization metrics
 * GET /api/admin/optimization-metrics
 */
exports.getOptimizationMetrics = async (req, res) => {
    try {
        const providerStats = await providerHealth.getProviderStats();
        const cacheStats = await smartCache.getStats();
        
        // Calculate estimated API call reduction
        const totalRequests = Object.values(providerStats).reduce((sum, provider) => 
            sum + (provider.totalRequests || 0), 0
        );
        
        // Estimate what it would have been with parallel fetching (3x)
        const estimatedOldRequests = totalRequests * 3;
        const apiCallReduction = totalRequests > 0 
            ? Math.round(((estimatedOldRequests - totalRequests) / estimatedOldRequests) * 100)
            : 0;
        
        return res.json({
            status: "success",
            data: {
                optimization: {
                    apiCallReduction: `${apiCallReduction}%`,
                    currentRequests: totalRequests,
                    estimatedOldRequests: estimatedOldRequests,
                    savedRequests: estimatedOldRequests - totalRequests
                },
                providers: providerStats,
                cache: cacheStats,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};