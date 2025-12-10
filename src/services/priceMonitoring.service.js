const Watchlist = require("../models/watchlist.models");
const Notification = require("../models/notification.models");
const priceAggregator = require("./priceAggregator.service");

/**
 * Check all watchlists and send alerts for price changes
 */
exports.monitorWatchlistPrices = async () => {
    try {
        console.log("🔍 Starting price monitoring...");
        
        // Get all watchlists with price alerts enabled
        const watchlists = await Watchlist.find({
            "priceAlert.enabled": true,
            "priceAlert.targetPrice": { $exists: true, $ne: null }
        }).populate("userId", "firstname email");

        let alertsCreated = 0;

        for (const watchlist of watchlists) {
            // Skip if no alert set
            if (!watchlist.priceAlert || !watchlist.priceAlert.enabled) continue;

            try {
                // Get current price
                const priceData = await priceAggregator.getAggregatedQuote(watchlist.symbol);
                const currentPrice = priceData.price;
                const targetPrice = watchlist.priceAlert.targetPrice;
                const condition = watchlist.priceAlert.condition;

                let alertTriggered = false;
                let alertMessage = "";

                // Check alert condition
                if (condition === "above" && currentPrice >= targetPrice) {
                    alertTriggered = true;
                    alertMessage = `${watchlist.symbol} has reached $${currentPrice.toFixed(2)} (Alert: Above $${targetPrice})`;
                } else if (condition === "below" && currentPrice <= targetPrice) {
                    alertTriggered = true;
                    alertMessage = `${watchlist.symbol} has dropped to $${currentPrice.toFixed(2)} (Alert: Below $${targetPrice})`;
                }

                if (alertTriggered) {
                    // Create notification
                    await Notification.create({
                        userId: watchlist.userId._id,
                        type: "price_alert",
                        title: `Price Alert: ${watchlist.symbol}`,
                        message: alertMessage,
                        metadata: {
                            symbol: watchlist.symbol,
                            currentPrice,
                            targetPrice,
                            condition
                        }
                    });

                    alertsCreated++;
                    console.log(`✅ Alert created for ${watchlist.userId.firstname}: ${alertMessage}`);

                    // Optional: Disable alert after triggering (one-time alert)
                    // You can uncomment this if you want alerts to trigger only once
                    /*
                    watchlist.priceAlert.enabled = false;
                    await watchlist.save();
                    */
                }
            } catch (error) {
                console.error(`Error checking ${watchlist.symbol}:`, error.message);
            }
        }

        console.log(`✅ Price monitoring complete. ${alertsCreated} alerts created.`);
        return { success: true, alertsCreated };
    } catch (error) {
        console.error("❌ Price monitoring error:", error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Clean up old notifications (older than 30 days)
 */
exports.cleanupOldNotifications = async () => {
    try {
        console.log("🧹 Cleaning up old notifications...");
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await Notification.deleteMany({
            createdAt: { $lt: thirtyDaysAgo }
        });

        console.log(`✅ Deleted ${result.deletedCount} old notifications`);
        return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("❌ Cleanup error:", error.message);
        return { success: false, error: error.message };
    }
};