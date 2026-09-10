const mongoose = require("mongoose");

/**
 * Activity Log Model - Track all user activities on the platform
 */
const ActivityLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        // Activity details
        action: {
            type: String,
            required: true,
            enum: [
                "user_signup",
                "user_login",
                "user_logout",
                "profile_update",
                "password_change",
                "password_reset_requested",
                "password_reset_completed",
                "onboarding_complete",
                "watchlist_add",
                "watchlist_remove",
                "watchlist_update",
                "portfolio_buy",
                "portfolio_sell",
                "recommendation_generate",
                "recommendation_view",
                "notification_read",
                "notification_create"
            ]
        },

        // Additional context
        details: {
            type: mongoose.Schema.Types.Mixed, // Flexible object for action-specific data
            default: {}
        },

        // User info at time of action (for quick access)
        userInfo: {
            email: String,
            firstname: String,
            lastname: String
        },

        // Request metadata
        ipAddress: String,
        userAgent: String,

        // Timestamp — indexed below via the TTL index, not here, to avoid
        // declaring the same {timestamp:1} index twice.
        timestamp: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Indexes for efficient queries
ActivityLogSchema.index({ action: 1, timestamp: -1 });
ActivityLogSchema.index({ userId: 1, timestamp: -1 });

// Auto-delete logs older than 90 days. `expireAfterSeconds` only works as an
// index option — setting it in the schema's top-level options (as this used
// to) is silently ignored by Mongoose, so logs were never actually expiring.
ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);