const priceAggregator = require("../services/priceAggregator.service");

/**
 * Search for stocks
 * GET /api/stocks/search?q=query
 */
exports.searchStocks = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                status: "error",
                message: "Search query must be at least 2 characters"
            });
        }

        const results = await priceAggregator.searchStocks(q.trim());

        return res.json({
            status: "success",
            data: results
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get stock details by symbol
 * GET /api/stocks/:symbol
 */
exports.getStockDetails = async (req, res) => {
    try {
        const { symbol } = req.params;

        // Get quote from API
        const quote = await priceAggregator.getAggregatedQuote(symbol);

        return res.json({
            status: "success",
            data: quote
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get price comparison for a stock
 * GET /api/stocks/:symbol/prices
 */
exports.getPriceComparison = async (req, res) => {
    try {
        const { symbol } = req.params;

        const comparison = await priceAggregator.getPriceComparison(symbol);

        return res.json({
            status: "success",
            data: comparison
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get single aggregated quote
 * GET /api/stocks/:symbol/quote
 */
exports.getQuote = async (req, res) => {
    try {
        const { symbol } = req.params;

        const quote = await priceAggregator.getAggregatedQuote(symbol);

        return res.json({
            status: "success",
            data: quote
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get popular stocks from APIs
 * GET /api/stocks/popular
 */
exports.getPopularStocks = async (req, res) => {
    try {
        const FinnhubAdapter = require("../services/adapters/finnhubAdapter");
        const finnhub = new FinnhubAdapter(process.env.FINNHUB_API_KEY);

        const popularStocks = await finnhub.getPopularStocks();

        return res.json({
            status: "success",
            data: popularStocks
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
