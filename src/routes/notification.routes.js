const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getPreferences,
    updatePreferences
} = require("../controllers/notification.controller");

// All notification routes require authentication
router.get("/", auth, getNotifications);
router.get("/unread-count", auth, getUnreadCount);
router.put("/:id/read", auth, markAsRead);
router.put("/read-all", auth, markAllAsRead);
router.delete("/:id", auth, deleteNotification);
router.get("/preferences", auth, getPreferences);
router.put("/preferences", auth, updatePreferences);

module.exports = router;
