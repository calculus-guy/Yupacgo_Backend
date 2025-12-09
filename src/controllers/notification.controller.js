const notificationService = require("../services/notification.service");

/**
 * Get all notifications for user
 * GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 50 } = req.query;

        const notifications = await notificationService.getUserNotifications(
            userId,
            parseInt(limit)
        );

        return res.json({
            status: "success",
            data: notifications
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;

        const count = await notificationService.getUnreadCount(userId);

        return res.json({
            status: "success",
            data: { count }
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const notification = await notificationService.markAsRead(id, userId);

        if (!notification) {
            return res.status(404).json({
                status: "error",
                message: "Notification not found"
            });
        }

        return res.json({
            status: "success",
            message: "Notification marked as read",
            data: notification
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.userId;

        await notificationService.markAllAsRead(userId);

        return res.json({
            status: "success",
            message: "All notifications marked as read"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
exports.deleteNotification = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const notification = await notificationService.deleteNotification(id, userId);

        if (!notification) {
            return res.status(404).json({
                status: "error",
                message: "Notification not found"
            });
        }

        return res.json({
            status: "success",
            message: "Notification deleted"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
exports.getPreferences = async (req, res) => {
    try {
        const userId = req.user.userId;

        const preferences = await notificationService.getOrCreatePreferences(userId);

        return res.json({
            status: "success",
            data: preferences
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
exports.updatePreferences = async (req, res) => {
    try {
        const userId = req.user.userId;
        const updates = req.body;

        const preferences = await notificationService.updatePreferences(userId, updates);

        return res.json({
            status: "success",
            message: "Preferences updated",
            data: preferences
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
