const mongoose = require("mongoose");
const { RISK_LEVELS, EXPERIENCE_LEVELS, INVESTMENT_HORIZONS, GOALS, BUDGETS, APPROACHES, SECTORS } = require("../constants/domain");

const UserProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },

        riskScore: {
            type: Number,
            required: true,
            min: 1,
            max: 3
        },
        riskLevel: {
            type: String,
            enum: RISK_LEVELS,
            required: true
        },

        experienceLevel: {
            type: String,
            enum: EXPERIENCE_LEVELS,
            required: true
        },
        investmentHorizon: {
            type: String,
            enum: INVESTMENT_HORIZONS,
            required: true
        },

        goal: {
            type: String,
            enum: GOALS,
            required: true
        },
        preferredSectors: {
            type: [String],
            enum: SECTORS,
            default: []
        },

        monthlyBudget: {
            type: String,
            enum: BUDGETS,
            required: true
        },

        approach: {
            type: String,
            enum: APPROACHES,
            required: true
        },

        profileType: {
            type: String,
            required: true
        },

        goalConstraints: {
            minDiversification: Number,
            preferDividends: Boolean,
            avoidHighVolatility: Boolean,
            preferStableGrowth: Boolean,
            preferGrowth: Boolean,
            liquidityImportant: Boolean,
            avoidLongLockup: Boolean,
            preferLiquidity: Boolean,
            canHandleVolatility: Boolean,
            preferCompounding: Boolean,
            preferStable: Boolean,
            avoidVolatility: Boolean,
            recommendETFs: Boolean,
            liquidityPriority: String
        },

        /**
         * Rewritten to actually carry USD figures (converted from the user's
         * NGN budget at profile-compute time) instead of a single ambiguous
         * `maxStockPrice` that was compared against USD prices without ever
         * being converted.
         */
        budgetConstraints: {
            budgetLevel: String,
            monthlyBudgetNgn: Number,
            monthlyBudgetUsd: Number,
            fxRateUsed: Number,
            maxSharePriceUsd: { type: Number, default: null },
            preferFractional: Boolean,
            minPositionUsd: Number,
            maxPositionsCount: Number,
            stronglyPreferETFs: Boolean,
            recommendETFs: Boolean
        },

        diversificationLevel: {
            level: String,
            minAssets: Number,
            maxAssets: Number,
            budgetLimited: Boolean,
            description: String
        },

        rebalancingFrequency: {
            frequency: String,
            days: Number
        }
    },
    { timestamps: true }
);

// No separate index() call needed — `unique: true` on userId above already
// creates one; declaring both is what produced the duplicate-index warning.

module.exports = mongoose.model("UserProfile", UserProfileSchema);
