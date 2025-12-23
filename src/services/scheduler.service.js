const cron = require("node-cron");
const { monitorWatchlistPrices, cleanupOldNotifications } = require("./priceMonitoring.service");

/**
 * Initialize all scheduled jobs
 */
exports.initializeScheduler = () => {
    console.log("⏰ Initializing background jobs...");

    // 24/7 Price monitoring - Every 5 minutes (more frequent for better responsiveness)
    // This covers crypto, international markets, after-hours trading, and pre-market
    cron.schedule("*/5 * * * *", async () => {
        console.log("⏰ Running 24/7 price monitoring...");
        await monitorWatchlistPrices();
    });

    // Additional frequent monitoring during US market hours (9 AM - 4 PM EST, Mon-Fri)
    // Every 2 minutes for more responsive alerts during active trading
    cron.schedule("*/2 9-16 * * 1-5", async () => {
        console.log("⏰ Running enhanced market hours monitoring...");
        await monitorWatchlistPrices();
    });

    // Extended hours monitoring (4 PM - 9 AM EST, Mon-Fri) - Every 10 minutes
    // Covers after-hours and pre-market trading
    cron.schedule("*/10 0-8,17-23 * * 1-5", async () => {
        console.log("⏰ Running extended hours monitoring...");
        await monitorWatchlistPrices();
    });

    // Weekend monitoring - Every 15 minutes (for crypto and international markets)
    cron.schedule("*/15 * * * 0,6", async () => {
        console.log("⏰ Running weekend monitoring...");
        await monitorWatchlistPrices();
    });

    // Cleanup old notifications - Daily at 2 AM
    cron.schedule("0 2 * * *", async () => {
        console.log("⏰ Running scheduled notification cleanup...");
        await cleanupOldNotifications();
    });

    console.log("✅ Background jobs initialized:");
    console.log("   - 24/7 Base monitoring: Every 5 minutes");
    console.log("   - Market hours (9AM-4PM EST, Mon-Fri): Every 2 minutes");
    console.log("   - Extended hours (4PM-9AM EST, Mon-Fri): Every 10 minutes");
    console.log("   - Weekend monitoring: Every 15 minutes");
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
