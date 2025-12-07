const mongoose = require("mongoose");

/**
 * Watchlist Model - User-saved stocks
 * Stores stocks that users want to track/save for later
 */
const WatchlistSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        // Stock information (from API)
        symbol: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        exchange: {
            type: String
        },

        // When user added it
        addedAt: {
            type: Date,
            default: Date.now
        },

        // Optional notes
        notes: String,

        // Alert settings (for future notifications)
        priceAlert: {
            enabled: Boolean,
            targetPrice: Number,
            condition: {
                type: String,
                enum: ["above", "below"]
            }
        }
    },
    { timestamps: true }
);

// Compound index to prevent duplicates
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });

module.exports = mongoose.model("Watchlist", WatchlistSchema);
