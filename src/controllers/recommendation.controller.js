const recommendationEngine = require("../services/recommendation.engine.v2");
const FinnhubAdapter = require("../services/adapters/finnhubAdapter");
const AlphaVantageAdapter = require("../services/adapters/alphaVantageAdapter");
const { createRecommendationNotification } = require("../services/notification.service");

/**
 * Generate new personalized recommendations
 * POST /api/recommendations/generate
 */
exports.generateRecommendations = async (req, res) => {
    try {
        const userId = req.user.userId;

        const session = await recommendationEngine.generateRecommendations(userId);

        // Create notification
        await createRecommendationNotification(
            userId,
            session.recommendations.length,
            session._id
        );

        return res.json({
            status: "success",
            message: "Recommendations generated successfully",
            data: session
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get latest recommendations for user
 * GET /api/recommendations
 */
exports.getRecommendations = async (req, res) => {
    try {
        const userId = req.user.userId;

        const recommendations = await recommendationEngine.getLatestRecommendations(userId);

        if (!recommendations) {
            return res.status(404).json({
                status: "error",
                message: "No recommendations found. Generate recommendations first."
            });
        }

        return res.json({
            status: "success",
            data: recommendations
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get recommendation history
 * GET /api/recommendations/history
 */
exports.getRecommendationHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 10 } = req.query;

        const history = await recommendationEngine.getRecommendationHistory(
            userId,
            parseInt(limit)
        );

        return res.json({
            status: "success",
            data: history
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get trending stocks
 * GET /api/recommendations/trending
 */
exports.getTrending = async (req, res) => {
    try {
        // Use Alpha Vantage for trending (has top gainers endpoint)
        const alphaVantage = new AlphaVantageAdapter(process.env.ALPHAVANTAGE_API_KEY);
        
        const trending = await alphaVantage.getTrending();

        if (!trending || trending.length === 0) {
            // Fallback to Finnhub if Alpha Vantage fails
            const finnhub = new FinnhubAdapter(process.env.FINNHUB_API_KEY);
            const fallbackTrending = await finnhub.getTrending();
            
            return res.json({
                status: "success",
                data: fallbackTrending,
                source: "finnhub"
            });
        }

        return res.json({
            status: "success",
            data: trending,
            source: "alphavantage"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Mark recommendation session as viewed
 * PUT /api/recommendations/:sessionId/view
 */
exports.markAsViewed = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.userId;

        const RecommendationSession = require("../models/recommendationSession.models");
        
        const session = await RecommendationSession.findOneAndUpdate(
            { _id: sessionId, userId },
            { viewed: true, viewedAt: new Date() },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({
                status: "error",
                message: "Recommendation session not found"
            });
        }

        return res.json({
            status: "success",
            message: "Marked as viewed",
            data: session
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Clear recommendation cache (for testing/debugging)
 * DELETE /api/recommendations/cache
 */
exports.clearCache = async (req, res) => {
    try {
        const { profileType } = req.query;

        const success = await recommendationEngine.clearRecommendationCache(profileType);

        if (success) {
            return res.json({
                status: "success",
                message: profileType 
                    ? `Cache cleared for profile type: ${profileType}`
                    : "All recommendation caches cleared"
            });
        } else {
            return res.status(500).json({
                status: "error",
                message: "Failed to clear cache"
            });
        }
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
