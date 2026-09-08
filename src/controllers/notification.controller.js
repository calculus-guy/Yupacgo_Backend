const notificationService = require("../services/notification.service");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Get all notifications for user
 * GET /api/notifications
 */
exports.getNotifications = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const notifications = await notificationService.getUserNotifications(req.user.userId, limit);
    return res.json({ status: "success", data: notifications });
});

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
exports.getUnreadCount = asyncHandler(async (req, res) => {
    const count = await notificationService.getUnreadCount(req.user.userId);
    return res.json({ status: "success", data: { count } });
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
exports.markAsRead = asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(req.params.id, req.user.userId);
    if (!notification) throw AppError.notFound("Notification not found");

    return res.json({ status: "success", message: "Notification marked as read", data: notification });
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
exports.markAllAsRead = asyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.user.userId);
    return res.json({ status: "success", message: "All notifications marked as read" });
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
exports.deleteNotification = asyncHandler(async (req, res) => {
    const notification = await notificationService.deleteNotification(req.params.id, req.user.userId);
    if (!notification) throw AppError.notFound("Notification not found");

    return res.json({ status: "success", message: "Notification deleted" });
});

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
exports.getPreferences = asyncHandler(async (req, res) => {
    const preferences = await notificationService.getOrCreatePreferences(req.user.userId);
    return res.json({ status: "success", data: preferences });
});

/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
exports.updatePreferences = asyncHandler(async (req, res) => {
    const preferences = await notificationService.updatePreferences(req.user.userId, req.body);
    return res.json({ status: "success", message: "Preferences updated", data: preferences });
});
