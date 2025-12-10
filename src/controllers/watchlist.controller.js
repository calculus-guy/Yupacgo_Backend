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
 * Get user's watchlist
 * GET /api/watchlist
 */
exports.getWatchlist = async (req, res) => {
    try {
        const userId = req.user.userId;

        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });

        return res.json({
            status: "success",
            data: watchlist
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get watchlist with live prices
 * GET /api/watchlist/with-prices
 */
exports.getWatchlistWithPrices = async (req, res) => {
    try {
        const userId = req.user.userId;

        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });

        // Fetch live prices for all symbols
        const symbols = watchlist.map(item => item.symbol);
        
        // Fetch quotes (this will use cache if available)
        const quotes = await Promise.all(
            symbols.map(symbol => 
                priceAggregator.searchStocks(symbol)
                    .then(results => results[0])
                    .catch(() => null)
            )
        );

        // Combine watchlist with prices
        const watchlistWithPrices = watchlist.map((item, index) => ({
            ...item.toObject(),
            currentPrice: quotes[index]?.price || null,
            priceChange: quotes[index]?.change || null,
            priceChangePercent: quotes[index]?.changePercent || null
        }));

        return res.json({
            status: "success",
            data: watchlistWithPrices
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
