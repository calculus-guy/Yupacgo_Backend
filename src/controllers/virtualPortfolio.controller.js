const VirtualPortfolio = require("../models/virtualPortfolio.models");
const priceAggregator = require("../services/priceAggregator.service");
const stockNameEnrichment = require("../services/stockNameEnrichment.service");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Get or create portfolio
 */
async function getOrCreatePortfolio(userId) {
    let portfolio = await VirtualPortfolio.findOne({ userId });
    if (!portfolio) portfolio = await VirtualPortfolio.create({ userId });
    return portfolio;
}

/**
 * Calculate portfolio value with current prices
 */
async function calculatePortfolioValue(portfolio) {
    if (portfolio.holdings.length === 0) {
        return { totalValue: portfolio.availableCash, totalReturn: 0, totalReturnPercent: 0, holdings: [] };
    }

    const symbols = portfolio.holdings.map((h) => h.symbol);
    const quotes = await Promise.all(
        symbols.map((symbol) => priceAggregator.getAggregatedQuote(symbol).catch(() => null))
    );

    const enrichedHoldings = portfolio.holdings.map((holding, index) => {
        const quote = quotes[index];
        const currentPrice = quote?.price || holding.averagePrice;
        const currentValue = holding.quantity * currentPrice;
        const totalReturn = currentValue - holding.totalCost;
        const returnPercent = (totalReturn / holding.totalCost) * 100;

        return { ...holding.toObject(), currentPrice, currentValue, totalReturn, returnPercent };
    });

    const holdingsValue = enrichedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalValue = holdingsValue + portfolio.availableCash;
    const totalReturn = totalValue - portfolio.initialCash;
    const totalReturnPercent = (totalReturn / portfolio.initialCash) * 100;

    return { totalValue, totalReturn, totalReturnPercent, holdings: enrichedHoldings };
}

/**
 * Get stock name — the old code instantiated a fresh FinnhubAdapter directly
 * from `process.env` for this, bypassing providerManager entirely just to
 * reach the same static-name-map fallback that stockNameEnrichment already
 * checks first. This just uses the static map directly.
 */
async function resolveStockName(symbol) {
    const enriched = await stockNameEnrichment.enrichStockName({ symbol, name: symbol });
    return enriched.name;
}

/**
 * Get portfolio overview
 * GET /api/portfolio/overview
 */
exports.getOverview = asyncHandler(async (req, res) => {
    const portfolio = await getOrCreatePortfolio(req.user.userId);
    const calculated = await calculatePortfolioValue(portfolio);

    return res.json({
        status: "success",
        data: {
            initialCash: portfolio.initialCash,
            availableCash: portfolio.availableCash,
            totalValue: calculated.totalValue,
            totalReturn: calculated.totalReturn,
            totalReturnPercent: calculated.totalReturnPercent,
            holdingsCount: portfolio.holdings.length,
            transactionsCount: portfolio.transactions.length
        }
    });
});

/**
 * Get portfolio holdings
 * GET /api/portfolio/holdings
 */
exports.getHoldings = asyncHandler(async (req, res) => {
    const portfolio = await getOrCreatePortfolio(req.user.userId);
    const calculated = await calculatePortfolioValue(portfolio);

    return res.json({
        status: "success",
        data: { holdings: calculated.holdings, availableCash: portfolio.availableCash, totalValue: calculated.totalValue }
    });
});

/**
 * Add holding (buy stock)
 * POST /api/portfolio/holdings
 */
exports.addHolding = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { symbol, quantity, price } = req.body;

    if (!symbol || !quantity || !price) throw AppError.badRequest("Symbol, quantity, and price are required");
    if (quantity <= 0 || price <= 0) throw AppError.badRequest("Quantity and price must be positive");

    const portfolio = await getOrCreatePortfolio(userId);
    const totalCost = quantity * price;

    if (totalCost > portfolio.availableCash) throw AppError.badRequest("Insufficient cash");

    const name = await resolveStockName(symbol);
    const existingHolding = portfolio.holdings.find((h) => h.symbol === symbol);

    if (existingHolding) {
        const newTotalCost = existingHolding.totalCost + totalCost;
        const newQuantity = existingHolding.quantity + quantity;
        existingHolding.quantity = newQuantity;
        existingHolding.averagePrice = newTotalCost / newQuantity;
        existingHolding.totalCost = newTotalCost;
    } else {
        portfolio.holdings.push({ symbol, name, quantity, averagePrice: price, totalCost });
    }

    portfolio.availableCash -= totalCost;
    portfolio.transactions.push({ type: "buy", symbol, name, quantity, price, total: totalCost });
    await portfolio.save();

    return res.json({ status: "success", message: "Stock added to portfolio", data: portfolio });
});

/**
 * Remove holding (sell stock)
 * DELETE /api/portfolio/holdings/:symbol
 */
exports.removeHolding = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { symbol } = req.params;
    const { quantity, price } = req.body;

    if (!quantity || !price) throw AppError.badRequest("Quantity and price are required");

    const portfolio = await getOrCreatePortfolio(userId);
    const holding = portfolio.holdings.find((h) => h.symbol === symbol);
    if (!holding) throw AppError.notFound("Holding not found");
    if (quantity > holding.quantity) throw AppError.badRequest("Cannot sell more than you own");

    const totalProceeds = quantity * price;

    if (quantity === holding.quantity) {
        portfolio.holdings = portfolio.holdings.filter((h) => h.symbol !== symbol);
    } else {
        holding.quantity -= quantity;
        holding.totalCost = holding.quantity * holding.averagePrice;
    }

    portfolio.availableCash += totalProceeds;
    portfolio.transactions.push({ type: "sell", symbol, name: holding.name, quantity, price, total: totalProceeds });
    await portfolio.save();

    return res.json({ status: "success", message: "Stock sold", data: portfolio });
});

/**
 * Get transaction history
 * GET /api/portfolio/transactions
 */
exports.getTransactions = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const portfolio = await getOrCreatePortfolio(req.user.userId);

    const transactions = portfolio.transactions
        .sort((a, b) => b.date - a.date)
        .slice(0, limit);

    return res.json({ status: "success", data: transactions });
});

/**
 * Reset portfolio
 * POST /api/portfolio/reset
 */
exports.resetPortfolio = asyncHandler(async (req, res) => {
    await VirtualPortfolio.findOneAndUpdate(
        { userId: req.user.userId },
        { availableCash: 10000, holdings: [], transactions: [], totalValue: 10000, totalReturn: 0, totalReturnPercent: 0 },
        { upsert: true }
    );

    return res.json({ status: "success", message: "Portfolio reset successfully" });
});
