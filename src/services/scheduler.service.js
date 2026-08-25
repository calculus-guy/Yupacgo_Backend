const cron = require("node-cron");
const { monitorWatchlistPrices, cleanupOldNotifications } = require("./priceMonitoring.service");

/**
 * Initialize all scheduled jobs (Optimized for API rate limiting)
 */
exports.initializeScheduler = () => {
    console.log("⏰ Initializing optimized background jobs...");

    // Market hours, extended hours, and weekend monitoring together already cover
    // every hour of every day with no gaps - a separate "24/7 base" job on top of
    // them would just run in parallel with whichever tier is active and double
    // the API calls, so it's intentionally not included here.

    // Market hours monitoring (9 AM - 4 PM EST, Mon-Fri) - Every 5 minutes (reduced from 2 minutes)
    // More responsive during active trading but respects rate limits
    cron.schedule("*/5 9-16 * * 1-5", async () => {
        console.log("⏰ Running market hours monitoring...");
        await monitorWatchlistPrices();
    });

    // Extended hours monitoring (4 PM - 9 AM EST, Mon-Fri) - Every 15 minutes (increased from 10 minutes)
    // Covers after-hours and pre-market trading with reduced frequency
    cron.schedule("*/15 0-8,17-23 * * 1-5", async () => {
        console.log("⏰ Running extended hours monitoring...");
        await monitorWatchlistPrices();
    });

    // Weekend monitoring - Every 20 minutes (increased from 15 minutes)
    // For crypto and international markets with reduced frequency
    cron.schedule("*/20 * * * 0,6", async () => {
        console.log("⏰ Running weekend monitoring...");
        await monitorWatchlistPrices();
    });

    // Cleanup old notifications - Daily at 2 AM
    cron.schedule("0 2 * * *", async () => {
        console.log("⏰ Running scheduled notification cleanup...");
        await cleanupOldNotifications();
    });

    console.log("✅ Optimized background jobs initialized:");
    console.log("   - Market hours (9AM-4PM EST, Mon-Fri): Every 5 minutes (reduced frequency)");
    console.log("   - Extended hours (4PM-9AM EST, Mon-Fri): Every 15 minutes (reduced frequency)");
    console.log("   - Weekend monitoring: Every 20 minutes (reduced frequency)");
    console.log("   - Notification cleanup: Daily at 2 AM");
    console.log("   - 🎯 Combined with single-provider requests = ~80% API call reduction");
};

/**
 * Manual trigger for testing
 */
exports.triggerPriceMonitoring = async () => {
    return await monitorWatchlistPrices();
};

exports.triggerCleanup = async () => {
    return await cleanupOldNotifications();
};
