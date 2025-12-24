const Notification = require("../models/notification.models");
const NotificationPreferences = require("../models/notificationPreferences.models");
const User = require("../models/user.models");
const { sendNotificationEmail } = require("./email.service");

/**
 * Notification Service
 * Creates and manages user notifications
 */

/**
 * Create a notification
 * @param {String} userId - User ID
 * @param {String} type - Notification type
 * @param {String} title - Notification title
 * @param {String} message - Notification message
 * @param {Object} data - Additional data
 * @returns {Promise<Object>} Created notification
 */
async function createNotification(userId, type, title, message, data = {}) {
    try {
        // Check user preferences
        const preferences = await NotificationPreferences.findOne({ userId });
        
        if (preferences) {
            // Check if this type of notification is enabled
            const typeMap = {
                price_alert: "priceAlerts",
                recommendation: "recommendations",
                watchlist: "watchlistUpdates",
                portfolio: "portfolioUpdates",
                profile: "profileUpdates",
                system: "systemAnnouncements"
            };

            const prefKey = typeMap[type];
            if (prefKey && !preferences.types[prefKey]) {
                console.log(`Notification type ${type} disabled for user ${userId}`);
                return null;
            }
        }

        // Create notification
        const notification = await Notification.create({
            userId,
            type,
            title,
            message,
            data
        });

        // Send email if enabled
        if (preferences && preferences.emailNotifications) {
            const user = await User.findById(userId);
            if (user) {
                await sendNotificationEmail(user.email, title, message);
            }
        }

        return notification;
    } catch (error) {
        console.error("Error creating notification:", error.message);
        return null;
    }
}

/**
 * Create price alert notification
 */
async function createPriceAlert(userId, symbol, currentPrice, targetPrice, condition, priceChange) {
    const title = `🚨 Price Alert: ${symbol}`;
    const percentageChange = priceChange ? ` (${priceChange})` : '';
    const message = condition === "above" 
        ? `${symbol} has reached $${currentPrice.toFixed(2)}${percentageChange} - Target: Above $${targetPrice}`
        : `${symbol} has dropped to $${currentPrice.toFixed(2)}${percentageChange} - Target: Below $${targetPrice}`;
    
    return await createNotification(userId, "price_alert", title, message, {
        symbol,
        currentPrice,
        targetPrice,
        condition,
        priceChange
    });
}

/**
 * Create recommendation notification
 */
async function createRecommendationNotification(userId, count, sessionId) {
    const title = "New Recommendations Available";
    const message = `We've generated ${count} new stock recommendations based on your profile`;
    
    return await createNotification(userId, "recommendation", title, message, {
        count,
        sessionId
    });
}

/**
 * Create watchlist update notification
 */
async function createWatchlistNotification(userId, message) {
    const title = "Watchlist Update";
    
    return await createNotification(userId, "watchlist", title, message, {});
}

/**
 * Create portfolio update notification
 */
async function createPortfolioNotification(userId, message, data = {}) {
    const title = "Portfolio Update";
    
    return await createNotification(userId, "portfolio", title, message, data);
}

/**
 * Create system notification
 */
async function createSystemNotification(userId, title, message, data = {}) {
    return await createNotification(userId, "system", title, message, data);
}

/**
 * Create welcome notification
 */
async function createWelcomeNotification(userId, name) {
    const title = "Welcome to Yupacgo! 🎉";
    const message = `Hi ${name}! Welcome to your personalized investment platform. Complete your onboarding to get started with personalized recommendations.`;
    
    return await createNotification(userId, "system", title, message, {
        type: "welcome",
        name
    });
}

/**
 * Get user notifications
 */
async function getUserNotifications(userId, limit = 50) {
    return await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit);
}

/**
 * Get unread count
 */
async function getUnreadCount(userId) {
    return await Notification.countDocuments({ userId, read: false });
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId, userId) {
    return await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { read: true, readAt: new Date() },
        { new: true }
    );
}

/**
 * Mark all as read
 */
async function markAllAsRead(userId) {
    return await Notification.updateMany(
        { userId, read: false },
        { read: true, readAt: new Date() }
    );
}

/**
 * Delete notification
 */
async function deleteNotification(notificationId, userId) {
    return await Notification.findOneAndDelete({ _id: notificationId, userId });
}

/**
 * Get or create notification preferences
 */
async function getOrCreatePreferences(userId) {
    let preferences = await NotificationPreferences.findOne({ userId });
    
    if (!preferences) {
        preferences = await NotificationPreferences.create({ userId });
    }
    
    return preferences;
}

/**
 * Update notification preferences
 */
async function updatePreferences(userId, updates) {
    return await NotificationPreferences.findOneAndUpdate(
        { userId },
        updates,
        { new: true, upsert: true }
    );
}

module.exports = {
    createNotification,
    createPriceAlert,
    createRecommendationNotification,
    createWatchlistNotification,
    createPortfolioNotification,
    createSystemNotification,
    createWelcomeNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getOrCreatePreferences,
    updatePreferences
};
