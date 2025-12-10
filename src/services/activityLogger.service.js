const ActivityLog = require("../models/activityLog.models");

/**
 * Log user activity
 * @param {Object} params - Activity parameters
 * @param {string} params.userId - User ID
 * @param {string} params.action - Action type
 * @param {Object} params.details - Additional details
 * @param {Object} params.userInfo - User info snapshot
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 */
exports.logActivity = async ({ userId, action, details = {}, userInfo = {}, ipAddress, userAgent }) => {
    try {
        await ActivityLog.create({
            userId,
            action,
            details,
            userInfo,
            ipAddress,
            userAgent
        });
    } catch (error) {
        // Don't throw errors for logging failures - just log them
        console.error("Failed to log activity:", error.message);
    }
};

/**
 * Get recent activities with pagination
 */
exports.getRecentActivities = async (limit = 50, skip = 0) => {
    try {
        const activities = await ActivityLog.find()
            .populate("userId", "firstname lastname email")
            .sort({ timestamp: -1 })
            .limit(limit)
            .skip(skip)
            .lean();

        return activities;
    } catch (error) {
        throw new Error("Failed to fetch activities: " + error.message);
    }
};

/**
 * Get activity statistics
 */
exports.getActivityStats = async (days = 30) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const stats = await ActivityLog.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: "$action",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        // Get total activities today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayCount = await ActivityLog.countDocuments({
            timestamp: { $gte: today }
        });

        return {
            byAction: stats,
            todayTotal: todayCount,
            periodDays: days
        };
    } catch (error) {
        throw new Error("Failed to get activity stats: " + error.message);
    }
};

/**
 * Get user activity history
 */
exports.getUserActivities = async (userId, limit = 20) => {
    try {
        const activities = await ActivityLog.find({ userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return activities;
    } catch (error) {
        throw new Error("Failed to fetch user activities: " + error.message);
    }
};