const Watchlist = require("../models/watchlist.models");
const priceAggregator = require("../services/priceAggregator.service");
const { logActivity } = require("../services/activityLogger.service");

/**
 * Add stock to watchlist
 * POST /api/watchlist
 */
exports.addToWatchlist = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { symbol, name, exchange, notes, priceAlert } = req.body;

        if (!symbol || !name) {
            return res.status(400).json({
                status: "error",
                message: "Symbol and name are required"
            });
        }

        // Check if already in watchlist
        const existing = await Watchlist.findOne({ userId, symbol });
        if (existing) {
            return res.status(400).json({
                status: "error",
                message: "Stock already in watchlist"
            });
        }

        const watchlistItem = await Watchlist.create({
            userId,
            symbol,
            name,
            exchange,
            notes,
            priceAlert
        });

        // Log activity
        logActivity({
            userId,
            action: "watchlist_add",
            details: { symbol, name, hasAlert: !!priceAlert?.enabled },
            userInfo: { email: req.user.email, firstname: req.user.firstname, lastname: req.user.lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.status(201).json({
            status: "success",
            message: "Added to watchlist",
            data: watchlistItem
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get user's watchlist with comprehensive stock data
 * GET /api/watchlist
 */
exports.getWatchlist = async (req, res) => {
    try {
        const userId = req.user.userId;

        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });

        // Fetch comprehensive stock data for all symbols
        const enrichedWatchlist = await Promise.all(
            watchlist.map(async (item) => {
                try {
                    // Get comprehensive quote data
                    const quote = await priceAggregator.getAggregatedQuote(item.symbol);
                    
                    return {
                        // Watchlist specific data
                        _id: item._id,
                        userId: item.userId,
                        addedAt: item.addedAt,
                        notes: item.notes,
                        priceAlert: item.priceAlert,
                        
                        // Comprehensive stock data
                        symbol: quote.symbol,
                        name: quote.name,
                        exchange: quote.exchange,
                        price: quote.price,
                        change: quote.change,
                        changePercent: quote.changePercent,
                        priceType: quote.priceType,
                        provider: quote.provider,
                        confidence: quote.confidence,
                        timestamp: quote.timestamp,
                        
                        // Additional calculated fields
                        alertStatus: item.priceAlert?.enabled ? 
                            (item.priceAlert.condition === "above" && quote.price >= item.priceAlert.targetPrice) ||
                            (item.priceAlert.condition === "below" && quote.price <= item.priceAlert.targetPrice) 
                            ? "triggered" : "active" 
                            : "none"
                    };
                } catch (error) {
                    console.error(`Error fetching data for ${item.symbol}:`, error.message);
                    // Return basic watchlist data if stock data fetch fails
                    return {
                        _id: item._id,
                        userId: item.userId,
                        symbol: item.symbol,
                        name: item.name,
                        exchange: item.exchange,
                        addedAt: item.addedAt,
                        notes: item.notes,
                        priceAlert: item.priceAlert,
                        price: null,
                        change: null,
                        changePercent: null,
                        priceType: null,
                        provider: null,
                        confidence: "low",
                        timestamp: null,
                        alertStatus: "error"
                    };
                }
            })
        );

        return res.json({
            status: "success",
            data: enrichedWatchlist
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get watchlist with comprehensive price comparison data
 * GET /api/watchlist/with-prices
 */
exports.getWatchlistWithPrices = async (req, res) => {
    try {
        const userId = req.user.userId;

        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });

        // Fetch comprehensive price comparison data for all symbols
        const enrichedWatchlist = await Promise.all(
            watchlist.map(async (item) => {
                try {
                    // Get comprehensive price comparison data
                    const priceComparison = await priceAggregator.getPriceComparison(item.symbol);
                    
                    return {
                        // Watchlist specific data
                        _id: item._id,
                        userId: item.userId,
                        addedAt: item.addedAt,
                        notes: item.notes,
                        priceAlert: item.priceAlert,
                        
                        // Comprehensive stock data with price comparison
                        symbol: priceComparison.symbol,
                        name: priceComparison.name,
                        exchange: priceComparison.exchange,
                        
                        // Best price data
                        price: priceComparison.best.price,
                        change: priceComparison.best.change,
                        changePercent: priceComparison.best.changePercent,
                        priceType: priceComparison.best.priceType,
                        provider: priceComparison.best.provider,
                        timestamp: priceComparison.best.timestamp,
                        
                        // Price comparison data
                        prices: priceComparison.prices,
                        priceVariance: priceComparison.priceVariance,
                        confidence: priceComparison.confidence,
                        
                        // Alert analysis
                        alertStatus: item.priceAlert?.enabled ? 
                            (item.priceAlert.condition === "above" && priceComparison.best.price >= item.priceAlert.targetPrice) ||
                            (item.priceAlert.condition === "below" && priceComparison.best.price <= item.priceAlert.targetPrice) 
                            ? "triggered" : "active" 
                            : "none",
                            
                        // Price alert details
                        alertAnalysis: item.priceAlert?.enabled ? {
                            targetPrice: item.priceAlert.targetPrice,
                            condition: item.priceAlert.condition,
                            currentPrice: priceComparison.best.price,
                            difference: item.priceAlert.condition === "above" 
                                ? priceComparison.best.price - item.priceAlert.targetPrice
                                : item.priceAlert.targetPrice - priceComparison.best.price,
                            percentageToTarget: item.priceAlert.condition === "above"
                                ? ((priceComparison.best.price - item.priceAlert.targetPrice) / item.priceAlert.targetPrice) * 100
                                : ((item.priceAlert.targetPrice - priceComparison.best.price) / item.priceAlert.targetPrice) * 100
                        } : null
                    };
                } catch (error) {
                    console.error(`Error fetching price data for ${item.symbol}:`, error.message);
                    // Return basic watchlist data if price data fetch fails
                    return {
                        _id: item._id,
                        userId: item.userId,
                        symbol: item.symbol,
                        name: item.name,
                        exchange: item.exchange,
                        addedAt: item.addedAt,
                        notes: item.notes,
                        priceAlert: item.priceAlert,
                        price: null,
                        change: null,
                        changePercent: null,
                        priceType: null,
                        provider: null,
                        prices: [],
                        priceVariance: 0,
                        confidence: "low",
                        timestamp: null,
                        alertStatus: "error",
                        alertAnalysis: null
                    };
                }
            })
        );

        return res.json({
            status: "success",
            data: enrichedWatchlist
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Remove stock from watchlist
 * DELETE /api/watchlist/:id
 */
exports.removeFromWatchlist = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const item = await Watchlist.findOneAndDelete({ _id: id, userId });

        if (!item) {
            return res.status(404).json({
                status: "error",
                message: "Watchlist item not found"
            });
        }

        // Log activity
        logActivity({
            userId,
            action: "watchlist_remove",
            details: { symbol: item.symbol, name: item.name },
            userInfo: { email: req.user.email, firstname: req.user.firstname, lastname: req.user.lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Removed from watchlist"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Update watchlist item (notes, alerts)
 * PUT /api/watchlist/:id
 */
exports.updateWatchlistItem = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { notes, priceAlert } = req.body;

        const item = await Watchlist.findOneAndUpdate(
            { _id: id, userId },
            { notes, priceAlert },
            { new: true }
        );

        if (!item) {
            return res.status(404).json({
                status: "error",
                message: "Watchlist item not found"
            });
        }

        return res.json({
            status: "success",
            message: "Watchlist item updated",
            data: item
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
