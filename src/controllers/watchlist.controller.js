const Watchlist = require("../models/watchlist.models");
const priceAggregator = require("../services/priceAggregator.service");
const { logActivity } = require("../services/activityLogger.service");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Add stock to watchlist
 * POST /api/watchlist
 */
exports.addToWatchlist = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { symbol, name, exchange, notes, priceAlert } = req.body;

    if (!symbol || !name) throw AppError.badRequest("Symbol and name are required");

    const existing = await Watchlist.findOne({ userId, symbol });
    if (existing) throw AppError.conflict("Stock already in watchlist");

    const watchlistItem = await Watchlist.create({ userId, symbol, name, exchange, notes, priceAlert });

    logActivity({
        userId,
        action: "watchlist_add",
        details: { symbol, name, hasAlert: !!priceAlert?.enabled },
        userInfo: { email: req.user.email, firstname: req.user.firstname, lastname: req.user.lastname },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
    }).catch(() => {});

    return res.status(201).json({ status: "success", message: "Added to watchlist", data: watchlistItem });
});

/**
 * Get user's watchlist with comprehensive stock data
 * GET /api/watchlist
 */
exports.getWatchlist = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });

    const enrichedWatchlist = await Promise.all(
        watchlist.map(async (item) => {
            try {
                const quote = await priceAggregator.getAggregatedQuote(item.symbol);
                return {
                    _id: item._id,
                    userId: item.userId,
                    addedAt: item.addedAt,
                    notes: item.notes,
                    priceAlert: item.priceAlert,
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
                    alertStatus: alertStatusFor(item, quote.price)
                };
            } catch {
                return {
                    _id: item._id,
                    userId: item.userId,
                    symbol: item.symbol,
                    name: item.name,
                    exchange: item.exchange,
                    addedAt: item.addedAt,
                    notes: item.notes,
                    priceAlert: item.priceAlert,
                    price: null, change: null, changePercent: null, priceType: null,
                    provider: null, confidence: "low", timestamp: null, alertStatus: "error"
                };
            }
        })
    );

    return res.json({ status: "success", data: enrichedWatchlist });
});

/**
 * Get watchlist with comprehensive price comparison data
 * GET /api/watchlist/with-prices
 */
exports.getWatchlistWithPrices = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });

    const enrichedWatchlist = await Promise.all(
        watchlist.map(async (item) => {
            try {
                const pc = await priceAggregator.getPriceComparison(item.symbol);
                return {
                    _id: item._id,
                    userId: item.userId,
                    addedAt: item.addedAt,
                    notes: item.notes,
                    priceAlert: item.priceAlert,
                    symbol: pc.symbol,
                    name: pc.name,
                    exchange: pc.exchange,
                    price: pc.best.price,
                    change: pc.best.change,
                    changePercent: pc.best.changePercent,
                    priceType: pc.best.priceType,
                    provider: pc.best.provider,
                    timestamp: pc.best.timestamp,
                    prices: pc.prices,
                    priceVariance: pc.priceVariance,
                    confidence: pc.confidence,
                    alertStatus: alertStatusFor(item, pc.best.price),
                    alertAnalysis: alertAnalysisFor(item, pc.best.price)
                };
            } catch {
                return {
                    _id: item._id,
                    userId: item.userId,
                    symbol: item.symbol,
                    name: item.name,
                    exchange: item.exchange,
                    addedAt: item.addedAt,
                    notes: item.notes,
                    priceAlert: item.priceAlert,
                    price: null, change: null, changePercent: null, priceType: null,
                    provider: null, prices: [], priceVariance: 0, confidence: "low",
                    timestamp: null, alertStatus: "error", alertAnalysis: null
                };
            }
        })
    );

    return res.json({ status: "success", data: enrichedWatchlist });
});

/**
 * Remove stock from watchlist
 * DELETE /api/watchlist/:id
 */
exports.removeFromWatchlist = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { id } = req.params;

    const item = await Watchlist.findOneAndDelete({ _id: id, userId });
    if (!item) throw AppError.notFound("Watchlist item not found");

    logActivity({
        userId,
        action: "watchlist_remove",
        details: { symbol: item.symbol, name: item.name },
        userInfo: { email: req.user.email, firstname: req.user.firstname, lastname: req.user.lastname },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
    }).catch(() => {});

    return res.json({ status: "success", message: "Removed from watchlist" });
});

/**
 * Update watchlist item (notes, alerts)
 * PUT /api/watchlist/:id
 */
exports.updateWatchlistItem = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { id } = req.params;
    const { notes, priceAlert } = req.body;

    const item = await Watchlist.findOneAndUpdate({ _id: id, userId }, { notes, priceAlert }, { new: true });
    if (!item) throw AppError.notFound("Watchlist item not found");

    return res.json({ status: "success", message: "Watchlist item updated", data: item });
});

function alertStatusFor(item, currentPrice) {
    if (!item.priceAlert?.enabled || currentPrice == null) return "none";
    const { condition, targetPrice } = item.priceAlert;
    const triggered = (condition === "above" && currentPrice >= targetPrice) ||
        (condition === "below" && currentPrice <= targetPrice);
    return triggered ? "triggered" : "active";
}

function alertAnalysisFor(item, currentPrice) {
    if (!item.priceAlert?.enabled || currentPrice == null) return null;
    const { condition, targetPrice } = item.priceAlert;
    return {
        targetPrice,
        condition,
        currentPrice,
        difference: condition === "above" ? currentPrice - targetPrice : targetPrice - currentPrice,
        percentageToTarget: condition === "above"
            ? ((currentPrice - targetPrice) / targetPrice) * 100
            : ((targetPrice - currentPrice) / targetPrice) * 100
    };
}
