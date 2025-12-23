const Watchlist = require("../models/watchlist.models");
const Notification = require("../models/notification.models");
const priceAggregator = require("./priceAggregator.service");

/**
 * Check all watchlists and send alerts for price changes
 */
exports.monitorWatchlistPrices = async () => {
    try {
        const startTime = new Date();
        console.log(`🔍 Starting price monitoring at ${startTime.toISOString()}...`);
        
        // Get all watchlists with price alerts enabled
        const watchlists = await Watchlist.find({
            "priceAlert.enabled": true,
            "priceAlert.targetPrice": { $exists: true, $ne: null }
        }).populate("userId", "firstname email");

        if (watchlists.length === 0) {
            console.log("ℹ️ No active price alerts to monitor");
            return { success: true, alertsCreated: 0, watchlistsChecked: 0 };
        }

        console.log(`📊 Monitoring ${watchlists.length} watchlists with active alerts...`);

        let alertsCreated = 0;
        let successfulChecks = 0;
        let failedChecks = 0;

        // Process watchlists in batches to avoid overwhelming APIs
        const batchSize = 5;
        for (let i = 0; i < watchlists.length; i += batchSize) {
            const batch = watchlists.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (watchlist) => {
                try {
                    // Skip if no alert set (double check)
                    if (!watchlist.priceAlert || !watchlist.priceAlert.enabled) {
                        return;
                    }

                    // Get current price with timeout
                    const priceData = await Promise.race([
                        priceAggregator.getAggregatedQuote(watchlist.symbol),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Price fetch timeout')), 10000)
                        )
                    ]);

                    if (!priceData || !priceData.price) {
                        console.warn(`⚠️ No price data for ${watchlist.symbol}`);
                        failedChecks++;
                        return;
                    }

                    const currentPrice = priceData.price;
                    const targetPrice = watchlist.priceAlert.targetPrice;
                    const condition = watchlist.priceAlert.condition;

                    let alertTriggered = false;
                    let alertMessage = "";
                    let priceChange = "";

                    // Check alert condition with more detailed messaging
                    if (condition === "above" && currentPrice >= targetPrice) {
                        alertTriggered = true;
                        const percentageIncrease = ((currentPrice - targetPrice) / targetPrice * 100).toFixed(2);
                        priceChange = `+${percentageIncrease}%`;
                        alertMessage = `${watchlist.name || watchlist.symbol} has reached $${currentPrice.toFixed(2)} (${priceChange}) - Target: Above $${targetPrice}`;
                    } else if (condition === "below" && currentPrice <= targetPrice) {
                        alertTriggered = true;
                        const percentageDecrease = ((targetPrice - currentPrice) / targetPrice * 100).toFixed(2);
                        priceChange = `-${percentageDecrease}%`;
                        alertMessage = `${watchlist.name || watchlist.symbol} has dropped to $${currentPrice.toFixed(2)} (${priceChange}) - Target: Below $${targetPrice}`;
                    }

                    if (alertTriggered) {
                        // Check if we already sent this alert recently (prevent spam)
                        const recentAlert = await Notification.findOne({
                            userId: watchlist.userId._id,
                            type: "price_alert",
                            "metadata.symbol": watchlist.symbol,
                            "metadata.targetPrice": targetPrice,
                            "metadata.condition": condition,
                            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Within last hour
                        });

                        if (!recentAlert) {
                            // Create notification
                            await Notification.create({
                                userId: watchlist.userId._id,
                                type: "price_alert",
                                title: `🚨 Price Alert: ${watchlist.name || watchlist.symbol}`,
                                message: alertMessage,
                                metadata: {
                                    symbol: watchlist.symbol,
                                    name: watchlist.name,
                                    currentPrice,
                                    targetPrice,
                                    condition,
                                    priceChange,
                                    provider: priceData.provider,
                                    confidence: priceData.confidence,
                                    timestamp: new Date().toISOString()
                                }
                            });

                            alertsCreated++;
                            console.log(`✅ Alert created for ${watchlist.userId.firstname}: ${alertMessage}`);

                            // Optional: Disable alert after triggering (uncomment for one-time alerts)
                            // watchlist.priceAlert.enabled = false;
                            // await watchlist.save();
                        } else {
                            console.log(`⏭️ Skipping duplicate alert for ${watchlist.symbol} (sent within last hour)`);
                        }
                    }

                    successfulChecks++;
                } catch (error) {
                    console.error(`❌ Error checking ${watchlist.symbol}:`, error.message);
                    failedChecks++;
                }
            }));

            // Small delay between batches to be respectful to APIs
            if (i + batchSize < watchlists.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const endTime = new Date();
        const duration = endTime - startTime;

        console.log(`✅ Price monitoring complete in ${duration}ms:`);
        console.log(`   - Watchlists checked: ${watchlists.length}`);
        console.log(`   - Successful checks: ${successfulChecks}`);
        console.log(`   - Failed checks: ${failedChecks}`);
        console.log(`   - Alerts created: ${alertsCreated}`);

        return { 
            success: true, 
            alertsCreated, 
            watchlistsChecked: watchlists.length,
            successfulChecks,
            failedChecks,
            duration
        };
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

/**
 * Get monitoring statistics
 */
exports.getMonitoringStats = async () => {
    try {
        const activeAlerts = await Watchlist.countDocuments({
            "priceAlert.enabled": true,
            "priceAlert.targetPrice": { $exists: true, $ne: null }
        });

        const recentAlerts = await Notification.countDocuments({
            type: "price_alert",
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        });

        const totalNotifications = await Notification.countDocuments({
            type: "price_alert"
        });

        return {
            activeAlerts,
            recentAlerts,
            totalNotifications
        };
    } catch (error) {
        console.error("❌ Error getting monitoring stats:", error.message);
        return null;
    }
};