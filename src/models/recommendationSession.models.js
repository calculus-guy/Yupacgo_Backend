const mongoose = require("mongoose");

/**
 * Recommendation Session Model
 * Stores generated recommendations for users
 * Allows tracking history and viewing past recommendations
 */
const RecommendationSessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        // Profile snapshot at time of generation
        profileSnapshot: {
            profileType: String,
            riskLevel: String,
            investmentHorizon: String,
            goal: String
        },

        // Recommended stocks
        recommendations: [
            {
                stockId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Stock"
                },
                canonicalId: String,
                symbol: String,
                name: String,
                
                // Why this stock was recommended
                matchScore: Number,
                matchReasons: [String],
                
                // Price at time of recommendation
                recommendedPrice: Number,
                currency: String,
                
                // Position sizing suggestion
                suggestedAllocation: Number, // percentage
                suggestedPositionSize: Number, // amount in currency
                
                // Tags that matched
                matchedTags: [String]
            }
        ],

        // Session metadata
        sessionType: {
            type: String,
            enum: ["personalized", "trending", "manual"],
            default: "personalized"
        },

        // Generation details
        generatedAt: {
            type: Date,
            default: Date.now,
            index: true
        },

        // User interaction
        viewed: {
            type: Boolean,
            default: false
        },
        viewedAt: Date,

        // Status
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

// Compound indexes
RecommendationSessionSchema.index({ userId: 1, generatedAt: -1 });
RecommendationSessionSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model("RecommendationSession", RecommendationSessionSchema);
