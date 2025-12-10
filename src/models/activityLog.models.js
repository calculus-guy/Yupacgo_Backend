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

        // Timestamp
        timestamp: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    { 
        timestamps: true,
        // Auto-delete logs older than 90 days
        expireAfterSeconds: 90 * 24 * 60 * 60
    }
);

// Indexes for efficient queries
ActivityLogSchema.index({ action: 1, timestamp: -1 });
ActivityLogSchema.index({ timestamp: -1 });
ActivityLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);