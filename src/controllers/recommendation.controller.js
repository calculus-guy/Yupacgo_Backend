const recommendationEngine = require("../services/recommendation.engine.v2");
const RecommendationSession = require("../models/recommendationSession.models");
const providerManager = require("../services/providerManager.service");
const { createRecommendationNotification } = require("../services/notification.service");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Generate new personalized recommendations
 * POST /api/recommendations/generate
 *
 * Rewritten to use asyncHandler so the engine's AppError (400/404/503, with a
 * real client-facing reason) reaches the response as-is instead of every
 * failure — including "please finish onboarding first" — being flattened into
 * a generic 500.
 */
exports.generateRecommendations = asyncHandler(async (req, res) => {
    const userId = req.user.userId;

    const session = await recommendationEngine.generateRecommendations(userId);

    // Notification failure must never fail the request that already succeeded.
    createRecommendationNotification(userId, session.recommendations.length, session._id)
        .catch(() => {});

    return res.json({
        status: "success",
        message: "Recommendations generated successfully",
        data: session
    });
});

/**
 * Get latest recommendations for user
 * GET /api/recommendations
 */
exports.getRecommendations = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const recommendations = await recommendationEngine.getLatestRecommendations(userId);

    if (!recommendations) {
        throw AppError.notFound("No recommendations found. Generate recommendations first.");
    }

    return res.json({ status: "success", data: recommendations });
});

/**
 * Get recommendation history
 * GET /api/recommendations/history
 */
exports.getRecommendationHistory = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const history = await recommendationEngine.getRecommendationHistory(userId, limit);
    return res.json({ status: "success", data: history });
});

/**
 * Get trending stocks
 * GET /api/recommendations/trending
 *
 * Rewritten to go through providerManager's priority/fallback list (like every
 * other market-data call in the app) instead of constructing its own adapter
 * instances directly from `process.env` — that bypassed the health tracking,
 * caching, and fallback logic providerManager exists to provide.
 */
exports.getTrending = asyncHandler(async (req, res) => {
    for (const provider of providerManager.providers) {
        if (provider.status === "disabled") continue;
        if (!provider.adapter.getTrending) continue;

        try {
            const trending = await provider.adapter.getTrending();
            if (trending && trending.length > 0) {
                return res.json({ status: "success", data: trending, source: provider.name });
            }
        } catch {
            continue;
        }
    }

    return res.json({ status: "success", data: [], source: "none" });
});

/**
 * Mark recommendation session as viewed
 * PUT /api/recommendations/:sessionId/view
 */
exports.markAsViewed = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const session = await RecommendationSession.findOneAndUpdate(
        { _id: sessionId, userId },
        { viewed: true, viewedAt: new Date() },
        { new: true }
    );

    if (!session) {
        throw AppError.notFound("Recommendation session not found");
    }

    return res.json({ status: "success", message: "Marked as viewed", data: session });
});

/**
 * Clear provider-level caches to force fresh market data on next generation.
 * DELETE /api/recommendations/cache
 *
 * NOTE: there is no longer a shared candidate-list cache to clear — that
 * mechanism (keyed only on profileType) was the reason every user in a risk
 * bucket saw identical recommendations. Each generation now samples fresh
 * from the stock universe; this endpoint clears the underlying quote/profile
 * caches instead.
 */
exports.clearCache = asyncHandler(async (req, res) => {
    const success = await recommendationEngine.clearRecommendationCache();

    if (!success) {
        throw AppError.unavailable("Failed to clear cache");
    }

    return res.json({ status: "success", message: "Provider caches cleared" });
});
