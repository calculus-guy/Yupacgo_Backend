const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { getRedisClient } = require("../config/redis");
const { asyncHandler } = require("../middleware/errorHandler");

/**
 * Health check.
 *
 * WHY THIS EXISTS: the README documented `GET /api/health` as existing; it
 * never did. Beyond fixing that gap, this is also what an external uptime
 * pinger (e.g. UptimeRobot / cron-job.org, free) should hit every ~10 minutes
 * to prevent Render's free-tier cold-start sleep — the single biggest thing
 * making the app "feel slow" that no amount of application code can fix
 * without leaving the free tier (see AUDIT_AND_UPGRADE_PLAN.md §2.4/P4).
 *
 * Always returns 200 unless the process itself is unresponsive (that's the
 * point of a liveness check); DB/Redis status are reported, not enforced,
 * because both already degrade gracefully rather than hard-failing requests.
 */
router.get("/", asyncHandler(async (req, res) => {
    const redisClient = getRedisClient();

    let redisStatus = "not_configured";
    if (redisClient) {
        redisStatus = redisClient.status === "ready" ? "connected" : redisClient.status;
    }

    const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];

    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        dependencies: {
            mongo: mongoStates[mongoose.connection.readyState] || "unknown",
            redis: redisStatus
        }
    });
}));

module.exports = router;
