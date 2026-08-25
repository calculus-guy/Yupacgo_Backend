const mongoose = require("mongoose");

/**
 * Notification Model
 * Stores user notifications (price alerts, recommendations, etc.)
 */
const NotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: ["price_alert", "recommendation", "watchlist", "portfolio", "profile", "system"],
            required: true,
            index: true
        },

        title: {
            type: String,
            required: true
        },

        message: {
            type: String,
            required: true
        },

        // Additional data specific to notification type (shape varies by type)
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        read: {
            type: Boolean,
            default: false,
            index: true
        },

        readAt: Date,

        // Auto-delete after 30 days
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            index: true
        }
    },
    { timestamps: true }
);

// Compound indexes
NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

// TTL index for auto-deletion
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Notification", NotificationSchema);
