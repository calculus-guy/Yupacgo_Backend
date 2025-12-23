const VirtualPortfolio = require("../models/virtualPortfolio.models");
const priceAggregator = require("../services/priceAggregator.service");
const stockNameEnrichment = require("../services/stockNameEnrichment.service");

/**
 * Get or create portfolio
 */
async function getOrCreatePortfolio(userId) {
    let portfolio = await VirtualPortfolio.findOne({ userId });
    
    if (!portfolio) {
        portfolio = await VirtualPortfolio.create({ userId });
    }
    
    return portfolio;
}

/**
 * Calculate portfolio value with current prices
 */
async function calculatePortfolioValue(portfolio) {
    if (portfolio.holdings.length === 0) {
        return {
            totalValue: portfolio.availableCash,
            totalReturn: 0,
            totalReturnPercent: 0,
            holdings: []
        };
    }

    // Fetch current prices for all holdings
    const symbols = portfolio.holdings.map(h => h.symbol);
    const quotes = await Promise.all(
        symbols.map(symbol => 
            priceAggregator.getAggregatedQuote(symbol)
                .catch(() => null)
        )
    );

    // Calculate current value for each holding
    const enrichedHoldings = portfolio.holdings.map((holding, index) => {
        const quote = quotes[index];
        const currentPrice = quote?.price || holding.averagePrice;
        const currentValue = holding.quantity * currentPrice;
        const totalReturn = currentValue - holding.totalCost;
        const returnPercent = (totalReturn / holding.totalCost) * 100;

        return {
            ...holding.toObject(),
            currentPrice,
            currentValue,
            totalReturn,
            returnPercent
        };
    });

    // Calculate total portfolio value
    const holdingsValue = enrichedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalValue = holdingsValue + portfolio.availableCash;
    const totalReturn = totalValue - portfolio.initialCash;
    const totalReturnPercent = (totalReturn / portfolio.initialCash) * 100;

    return {
        totalValue,
        totalReturn,
        totalReturnPercent,
        holdings: enrichedHoldings
    };
}

/**
 * Get portfolio overview
 * GET /api/portfolio/overview
 */
exports.getOverview = async (req, res) => {
    try {
        const userId = req.user.userId;
        const portfolio = await getOrCreatePortfolio(userId);

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
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get portfolio holdings
 * GET /api/portfolio/holdings
 */
exports.getHoldings = async (req, res) => {
    try {
        const userId = req.user.userId;
        const portfolio = await getOrCreatePortfolio(userId);

        const calculated = await calculatePortfolioValue(portfolio);

        return res.json({
            status: "success",
            data: {
                holdings: calculated.holdings,
                availableCash: portfolio.availableCash,
                totalValue: calculated.totalValue
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Add holding (buy stock)
 * POST /api/portfolio/holdings
 */
exports.addHolding = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { symbol, quantity, price } = req.body;

        // Validation
        if (!symbol || !quantity || !price) {
            return res.status(400).json({
                status: "error",
                message: "Symbol, quantity, and price are required"
            });
        }

        if (quantity <= 0 || price <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Quantity and price must be positive"
            });
        }

        const portfolio = await getOrCreatePortfolio(userId);

        const totalCost = quantity * price;

        // Check if user has enough cash
        if (totalCost > portfolio.availableCash) {
            return res.status(400).json({
                status: "error",
                message: "Insufficient cash"
            });
        }

        // Get stock name
        const FinnhubAdapter = require("../services/adapters/finnhubAdapter");
        const adapters = {
            finnhub: new FinnhubAdapter(process.env.FINNHUB_API_KEY)
        };
        const enriched = await stockNameEnrichment.enrichStockName({ symbol, name: symbol }, adapters);

        // Check if holding already exists
        const existingHolding = portfolio.holdings.find(h => h.symbol === symbol);

        if (existingHolding) {
            // Update existing holding (average price)
            const newTotalCost = existingHolding.totalCost + totalCost;
            const newQuantity = existingHolding.quantity + quantity;
            const newAveragePrice = newTotalCost / newQuantity;

            existingHolding.quantity = newQuantity;
            existingHolding.averagePrice = newAveragePrice;
            existingHolding.totalCost = newTotalCost;
        } else {
            // Add new holding
            portfolio.holdings.push({
                symbol,
                name: enriched.name,
                quantity,
                averagePrice: price,
                totalCost
            });
        }

        // Deduct cash
        portfolio.availableCash -= totalCost;

        // Add transaction
        portfolio.transactions.push({
            type: "buy",
            symbol,
            name: enriched.name,
            quantity,
            price,
            total: totalCost
        });

        await portfolio.save();

        return res.json({
            status: "success",
            message: "Stock added to portfolio",
            data: portfolio
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Remove holding (sell stock)
 * DELETE /api/portfolio/holdings/:symbol
 */
exports.removeHolding = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { symbol } = req.params;
        const { quantity, price } = req.body;

        if (!quantity || !price) {
            return res.status(400).json({
                status: "error",
                message: "Quantity and price are required"
            });
        }

        const portfolio = await getOrCreatePortfolio(userId);

        const holding = portfolio.holdings.find(h => h.symbol === symbol);

        if (!holding) {
            return res.status(404).json({
                status: "error",
                message: "Holding not found"
            });
        }

        if (quantity > holding.quantity) {
            return res.status(400).json({
                status: "error",
                message: "Cannot sell more than you own"
            });
        }

        const totalProceeds = quantity * price;

        // Update or remove holding
        if (quantity === holding.quantity) {
            // Remove entire holding
            portfolio.holdings = portfolio.holdings.filter(h => h.symbol !== symbol);
        } else {
            // Reduce quantity
            holding.quantity -= quantity;
            holding.totalCost = holding.quantity * holding.averagePrice;
        }

        // Add cash
        portfolio.availableCash += totalProceeds;

        // Add transaction
        portfolio.transactions.push({
            type: "sell",
            symbol,
            name: holding.name,
            quantity,
            price,
            total: totalProceeds
        });

        await portfolio.save();

        return res.json({
            status: "success",
            message: "Stock sold",
            data: portfolio
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get transaction history
 * GET /api/portfolio/transactions
 */
exports.getTransactions = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 50 } = req.query;

        const portfolio = await getOrCreatePortfolio(userId);

        const transactions = portfolio.transactions
            .sort((a, b) => b.date - a.date)
            .slice(0, parseInt(limit));

        return res.json({
            status: "success",
            data: transactions
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Reset portfolio
 * POST /api/portfolio/reset
 */
exports.resetPortfolio = async (req, res) => {
    try {
        const userId = req.user.userId;

        await VirtualPortfolio.findOneAndUpdate(
            { userId },
            {
                availableCash: 10000,
                holdings: [],
                transactions: [],
                totalValue: 10000,
                totalReturn: 0,
                totalReturnPercent: 0
            },
            { upsert: true }
        );

        return res.json({
            status: "success",
            message: "Portfolio reset successfully"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
