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
const { getRedisClient } = require("../config/redis");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

const VALID_PROVIDERS = ["finnhub", "twelvedata", "alphavantage"];

function assertValidProvider(provider) {
    if (!VALID_PROVIDERS.includes(provider)) {
        throw AppError.badRequest("Invalid provider name");
    }
}

function enrichName(item) {
    return { ...item, name: stockNameEnrichment.staticNames[item._id] || item.name || item._id };
}

/**
 * Get admin dashboard overview
 * GET /api/admin/dashboard
 */
exports.getDashboard = asyncHandler(async (req, res) => {
    const [
        totalUsers, totalWatchlists, totalPortfolios, totalNotifications, totalRecommendations, activityStats
    ] = await Promise.all([
        User.countDocuments({ role: "user" }),
        Watchlist.countDocuments(),
        VirtualPortfolio.countDocuments(),
        Notification.countDocuments(),
        RecommendationSession.countDocuments(),
        getActivityStats(7)
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: today }, role: "user" });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await User.countDocuments({ updatedAt: { $gte: sevenDaysAgo }, role: "user" });

    const systemHealth = {
        database: "connected",
        redis: getRedisClient()?.status === "ready" ? "connected" : "disconnected",
        backgroundJobs: "running"
    };

    return res.json({
        status: "success",
        data: {
            overview: { totalUsers, newUsersToday, activeUsers, totalWatchlists, totalPortfolios, totalNotifications, totalRecommendations },
            activityStats,
            systemHealth
        }
    });
});

/**
 * Get all users with pagination
 * GET /api/admin/users
 */
exports.getUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const [users, totalUsers] = await Promise.all([
        User.find({ role: "user" })
            .select("-password")
            .populate("onboarding", "goal risk duration budget experience approach")
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip),
        User.countDocuments({ role: "user" })
    ]);

    const usersWithStats = await Promise.all(
        users.map(async (user) => {
            const [watchlistCount, portfolioCount, notificationCount] = await Promise.all([
                Watchlist.countDocuments({ userId: user._id }),
                VirtualPortfolio.countDocuments({ userId: user._id }),
                Notification.countDocuments({ userId: user._id })
            ]);
            return { ...user.toObject(), stats: { watchlistCount, portfolioCount, notificationCount } };
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
});

/**
 * Get recent activities
 * GET /api/admin/activities
 */
exports.getActivities = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = parseInt(req.query.skip, 10) || 0;

    const activities = await getRecentActivities(limit, skip);
    return res.json({ status: "success", data: activities });
});

/**
 * Get system health status
 * GET /api/admin/system-health
 */
exports.getSystemHealth = asyncHandler(async (req, res) => {
    const redisClient = getRedisClient();
    const health = {
        database: "connected",
        redis: redisClient?.status === "ready" ? "connected" : "disconnected",
        backgroundJobs: "running",
        timestamp: new Date().toISOString()
    };

    if (redisClient) {
        try {
            await redisClient.ping();
            health.redis = "connected";
        } catch {
            health.redis = "error";
        }
    } else {
        health.redis = "not_configured";
    }

    return res.json({ status: "success", data: health });
});

exports.triggerPriceMonitoring = asyncHandler(async (req, res) => {
    const result = await triggerPriceMonitoring();
    return res.json({ status: "success", message: "Price monitoring triggered", data: result });
});

exports.triggerCleanup = asyncHandler(async (req, res) => {
    const result = await triggerCleanup();
    return res.json({ status: "success", message: "Cleanup triggered", data: result });
});

/**
 * Get stocks management data
 * GET /api/admin/stocks
 */
exports.getStocks = asyncHandler(async (req, res) => {
    const recommendedStocks = await RecommendationSession.aggregate([
        { $unwind: "$recommendations" },
        { $group: {
            _id: "$recommendations.symbol",
            name: { $first: "$recommendations.name" },
            count: { $sum: 1 },
            avgScore: { $avg: "$recommendations.matchScore" },
            lastRecommended: { $max: "$generatedAt" }
        } },
        { $sort: { count: -1 } },
        { $limit: 50 }
    ]);

    const watchedStocks = await Watchlist.aggregate([
        { $group: {
            _id: "$symbol",
            name: { $first: "$name" },
            count: { $sum: 1 },
            alertsEnabled: { $sum: { $cond: ["$priceAlert.enabled", 1, 0] } }
        } },
        { $sort: { count: -1 } },
        { $limit: 50 }
    ]);

    const tradedStocks = await VirtualPortfolio.aggregate([
        { $unwind: "$transactions" },
        { $group: {
            _id: "$transactions.symbol",
            totalTransactions: { $sum: 1 },
            totalVolume: { $sum: "$transactions.quantity" },
            avgPrice: { $avg: "$transactions.price" }
        } },
        { $sort: { totalTransactions: -1 } },
        { $limit: 50 }
    ]);

    return res.json({
        status: "success",
        data: {
            recommended: recommendedStocks.map(enrichName),
            watched: watchedStocks.map(enrichName),
            traded: tradedStocks.map(enrichName)
        }
    });
});

/**
 * Get notification management data
 * GET /api/admin/notifications
 */
exports.getNotifications = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const [notifications, totalNotifications] = await Promise.all([
        Notification.find()
            .populate("userId", "firstname lastname email")
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip),
        Notification.countDocuments()
    ]);

    const stats = await Notification.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 }, readCount: { $sum: { $cond: ["$read", 1, 0] } } } }
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await Notification.countDocuments({ createdAt: { $gte: today } });

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
});

/**
 * Get recommendation analytics
 * GET /api/admin/recommendations
 */
exports.getRecommendationAnalytics = asyncHandler(async (req, res) => {
    const totalRecommendations = await RecommendationSession.countDocuments();

    const byRiskLevel = await RecommendationSession.aggregate([
        { $group: { _id: "$profileSnapshot.riskLevel", count: { $sum: 1 } } }
    ]);

    const topStocks = await RecommendationSession.aggregate([
        { $unwind: "$recommendations" },
        { $group: {
            _id: "$recommendations.symbol",
            name: { $first: "$recommendations.name" },
            count: { $sum: 1 },
            avgScore: { $avg: "$recommendations.matchScore" }
        } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    const recentRecommendations = await RecommendationSession.find()
        .populate("userId", "firstname lastname email")
        .sort({ generatedAt: -1 })
        .limit(10);

    return res.json({
        status: "success",
        data: {
            totalRecommendations,
            byRiskLevel,
            topStocks: topStocks.map(enrichName),
            recentRecommendations
        }
    });
});

/**
 * Get watchlist analytics
 * GET /api/admin/watchlist-analytics
 */
exports.getWatchlistAnalytics = asyncHandler(async (req, res) => {
    const totalWatchlists = await Watchlist.countDocuments();

    const topWatchedStocks = await Watchlist.aggregate([
        { $group: {
            _id: "$symbol",
            name: { $first: "$name" },
            count: { $sum: 1 },
            alertsEnabled: { $sum: { $cond: ["$priceAlert.enabled", 1, 0] } }
        } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    const alertStats = await Watchlist.aggregate([
        { $group: {
            _id: null,
            totalWatchlists: { $sum: 1 },
            withAlerts: { $sum: { $cond: ["$priceAlert.enabled", 1, 0] } },
            alertsAbove: { $sum: { $cond: [{ $eq: ["$priceAlert.condition", "above"] }, 1, 0] } },
            alertsBelow: { $sum: { $cond: [{ $eq: ["$priceAlert.condition", "below"] }, 1, 0] } }
        } }
    ]);

    return res.json({
        status: "success",
        data: {
            totalWatchlists,
            topWatchedStocks: topWatchedStocks.map(enrichName),
            alertStats: alertStats[0] || {}
        }
    });
});

/**
 * Get portfolio analytics
 * GET /api/admin/portfolio-analytics
 */
exports.getPortfolioAnalytics = asyncHandler(async (req, res) => {
    const totalPortfolios = await VirtualPortfolio.countDocuments();

    const portfolioStats = await VirtualPortfolio.aggregate([
        { $group: {
            _id: null,
            totalCash: { $sum: "$availableCash" },
            avgCash: { $avg: "$availableCash" },
            totalTransactions: { $sum: { $size: "$transactions" } }
        } }
    ]);

    const topTradedStocks = await VirtualPortfolio.aggregate([
        { $unwind: "$transactions" },
        { $group: {
            _id: "$transactions.symbol",
            totalTransactions: { $sum: 1 },
            totalVolume: { $sum: "$transactions.quantity" },
            avgPrice: { $avg: "$transactions.price" },
            buyTransactions: { $sum: { $cond: [{ $eq: ["$transactions.type", "buy"] }, 1, 0] } },
            sellTransactions: { $sum: { $cond: [{ $eq: ["$transactions.type", "sell"] }, 1, 0] } }
        } },
        { $sort: { totalTransactions: -1 } },
        { $limit: 10 }
    ]);

    const recentTransactions = await VirtualPortfolio.aggregate([
        { $unwind: "$transactions" },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $sort: { "transactions.timestamp": -1 } },
        { $limit: 10 },
        { $project: {
            "transactions.symbol": 1, "transactions.type": 1, "transactions.quantity": 1,
            "transactions.price": 1, "transactions.timestamp": 1,
            "user.firstname": 1, "user.lastname": 1, "user.email": 1
        } }
    ]);

    return res.json({
        status: "success",
        data: {
            totalPortfolios,
            portfolioStats: portfolioStats[0] || {},
            topTradedStocks: topTradedStocks.map(enrichName),
            recentTransactions: recentTransactions.map((t) => ({
                ...t,
                transactions: {
                    ...t.transactions,
                    name: stockNameEnrichment.staticNames[t.transactions.symbol] || t.transactions.symbol
                }
            }))
        }
    });
});

/**
 * Get price monitoring analytics
 * GET /api/admin/monitoring-stats
 */
exports.getMonitoringStats = asyncHandler(async (req, res) => {
    const stats = await getMonitoringStats();
    if (!stats) throw AppError.unavailable("Failed to get monitoring statistics");

    const alertsWithDetails = await Watchlist.aggregate([
        { $match: { "priceAlert.enabled": true, "priceAlert.targetPrice": { $exists: true, $ne: null } } },
        { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $group: { _id: "$priceAlert.condition", count: { $sum: 1 }, symbols: { $addToSet: "$symbol" } } }
    ]);

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAlertPerformance = await Notification.aggregate([
        { $match: { type: "price_alert", createdAt: { $gte: last24Hours } } },
        { $group: { _id: { hour: { $hour: "$createdAt" }, symbol: "$data.symbol" }, count: { $sum: 1 } } },
        { $group: { _id: "$_id.hour", alertCount: { $sum: "$count" }, uniqueSymbols: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    return res.json({
        status: "success",
        data: {
            ...stats,
            alertsByCondition: alertsWithDetails,
            recentAlertPerformance,
            monitoringStatus: "24/7 Active",
            schedules: {
                marketHours: "Every 5 minutes (9AM-4PM EST, Mon-Fri)",
                extendedHours: "Every 15 minutes (4PM-9AM EST, Mon-Fri)",
                weekends: "Every 20 minutes (Sat-Sun)"
            }
        }
    });
});

exports.getProviderHealth = asyncHandler(async (req, res) => {
    const [summary, providers, alerts] = await Promise.all([
        providerHealth.getHealthSummary(),
        providerHealth.getProviderStats(),
        providerHealth.getHealthAlerts()
    ]);

    return res.json({ status: "success", data: { summary, providers, alerts, lastUpdated: new Date().toISOString() } });
});

exports.getProviderStats = asyncHandler(async (req, res) => {
    const stats = await providerHealth.getProviderStats(req.params.provider);
    return res.json({ status: "success", data: stats });
});

exports.resetProviderHealth = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    assertValidProvider(provider);

    await providerHealth.resetProviderHealth(provider);
    providerManager.resetProviderHealth(provider);

    return res.json({ status: "success", message: `Health metrics reset for ${provider}` });
});

exports.disableProvider = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    assertValidProvider(provider);

    providerManager.disableProvider(provider);
    return res.json({ status: "success", message: `Provider ${provider} disabled` });
});

exports.enableProvider = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    assertValidProvider(provider);

    providerManager.enableProvider(provider);
    return res.json({ status: "success", message: `Provider ${provider} enabled` });
});

exports.getCacheStats = asyncHandler(async (req, res) => {
    const [stats, config] = await Promise.all([smartCache.getStats(), smartCache.getConfig()]);
    return res.json({ status: "success", data: { statistics: stats, configuration: config, lastUpdated: new Date().toISOString() } });
});

/**
 * Test provider connectivity
 * POST /api/admin/test-provider/:provider
 *
 * NOTE: this temporarily disables every OTHER provider platform-wide to force
 * the test through the one being checked, then re-enables them. That's a
 * pre-existing tradeoff (an admin test call briefly affects all live
 * traffic) rather than something introduced here — flagging it because it's
 * surprising, not because this pass changed it.
 */
exports.testProvider = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const { symbol = "AAPL" } = req.body;
    assertValidProvider(provider);

    const otherProviders = VALID_PROVIDERS.filter((p) => p !== provider);
    const startTime = Date.now();

    otherProviders.forEach((p) => providerManager.disableProvider(p));
    try {
        const quote = await providerManager.getQuote(symbol, { skipCache: true });
        return res.json({
            status: "success",
            data: { provider, symbol, responseTime: Date.now() - startTime, quote, testTime: new Date().toISOString() }
        });
    } catch (testError) {
        return res.json({
            status: "error",
            data: { provider, symbol, responseTime: Date.now() - startTime, error: testError.message, testTime: new Date().toISOString() }
        });
    } finally {
        otherProviders.forEach((p) => providerManager.enableProvider(p));
    }
});

exports.getOptimizationMetrics = asyncHandler(async (req, res) => {
    const [providerStats, cacheStats] = await Promise.all([providerHealth.getProviderStats(), smartCache.getStats()]);

    const totalRequests = Object.values(providerStats).reduce((sum, p) => sum + (p.totalRequests || 0), 0);
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
                estimatedOldRequests,
                savedRequests: estimatedOldRequests - totalRequests
            },
            providers: providerStats,
            cache: cacheStats,
            generatedAt: new Date().toISOString()
        }
    });
});
