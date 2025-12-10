const cron = require("node-cron");
const { monitorWatchlistPrices, cleanupOldNotifications } = require("./priceMonitoring.service");

/**
 * Initialize all scheduled jobs
 */
exports.initializeScheduler = () => {
    console.log("⏰ Initializing background jobs...");

    // Price monitoring - Every 15 minutes during market hours (9 AM - 4 PM EST, Mon-Fri)
    // Cron: At minute 0, 15, 30, and 45 past every hour from 9 through 16 on Mon-Fri
    cron.schedule("0,15,30,45 9-16 * * 1-5", async () => {
        console.log("⏰ Running scheduled price monitoring...");
        await monitorWatchlistPrices();
    });

    // Cleanup old notifications - Daily at 2 AM
    cron.schedule("0 2 * * *", async () => {
        console.log("⏰ Running scheduled notification cleanup...");
        await cleanupOldNotifications();
    });

    console.log("✅ Background jobs initialized:");
    console.log("   - Price monitoring: Every 15 min (9 AM - 4 PM EST, Mon-Fri)");
    console.log("   - Notification cleanup: Daily at 2 AM");
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
