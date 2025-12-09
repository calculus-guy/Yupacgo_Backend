const mongoose = require("mongoose");

/**
 * Notification Preferences Model
 * User preferences for notifications
 */
const NotificationPreferencesSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },

        // Email notifications
        emailNotifications: {
            type: Boolean,
            default: true
        },

        // Notification types preferences
        types: {
            priceAlerts: {
                type: Boolean,
                default: true
            },
            recommendations: {
                type: Boolean,
                default: true
            },
            watchlistUpdates: {
                type: Boolean,
                default: true
            },
            profileUpdates: {
                type: Boolean,
                default: true
            },
            systemAnnouncements: {
                type: Boolean,
                default: true
            }
        },

        // Price alert settings
        priceAlertThreshold: {
            type: Number,
            default: 2.5, // Alert if price changes by 2.5% or more
            min: 0.5,
            max: 10
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("NotificationPreferences", NotificationPreferencesSchema);
