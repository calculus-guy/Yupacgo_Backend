const priceAggregator = require("../services/priceAggregator.service");
const stockNameEnrichment = require("../services/stockNameEnrichment.service");

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

        // Enrich with company name
        const FinnhubAdapter = require("../services/adapters/finnhubAdapter");
        const adapters = {
            finnhub: new FinnhubAdapter(process.env.FINNHUB_API_KEY)
        };
        
        const enrichedQuote = await stockNameEnrichment.enrichStockName(quote, adapters);

        return res.json({
            status: "success",
            data: enrichedQuote
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

        // Enrich with company name
        const FinnhubAdapter = require("../services/adapters/finnhubAdapter");
        const adapters = {
            finnhub: new FinnhubAdapter(process.env.FINNHUB_API_KEY)
        };
        
        const enrichedQuote = await stockNameEnrichment.enrichStockName(quote, adapters);

        return res.json({
            status: "success",
            data: enrichedQuote
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
        const { provider } = req.query; // Optional: specify provider

        const FinnhubAdapter = require("../services/adapters/finnhubAdapter");
        const AlphaVantageAdapter = require("../services/adapters/alphaVantageAdapter");
        const TwelveDataAdapter = require("../services/adapters/twelveDataAdapter");

        // Initialize adapters for name enrichment
        const adapters = {
            finnhub: new FinnhubAdapter(process.env.FINNHUB_API_KEY)
        };

        // If specific provider requested
        if (provider) {
            let adapter;
            if (provider === "finnhub") {
                adapter = new FinnhubAdapter(process.env.FINNHUB_API_KEY);
            } else if (provider === "alphavantage") {
                adapter = new AlphaVantageAdapter(process.env.ALPHAVANTAGE_API_KEY);
            } else if (provider === "twelvedata") {
                adapter = new TwelveDataAdapter(process.env.TWELVEDATA_API_KEY);
            } else {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid provider. Use: finnhub, alphavantage, or twelvedata"
                });
            }

            const stocks = await adapter.getPopularStocks();
            
            // Enrich with company names
            const enrichedStocks = await stockNameEnrichment.enrichStockNames(stocks, adapters);
            
            return res.json({
                status: "success",
                data: enrichedStocks,
                provider: provider
            });
        }

        // Fetch from all providers (default)
        const finnhub = new FinnhubAdapter(process.env.FINNHUB_API_KEY);
        const alphavantage = new AlphaVantageAdapter(process.env.ALPHAVANTAGE_API_KEY);
        const twelvedata = new TwelveDataAdapter(process.env.TWELVEDATA_API_KEY);

        // Fetch in parallel
        const [finnhubStocks, alphavantageStocks, twelvedataStocks] = await Promise.all([
            finnhub.getPopularStocks().catch(() => []),
            alphavantage.getTrending().catch(() => []), // Alpha Vantage has trending
            twelvedata.getPopularStocks().catch(() => [])
        ]);

        // Combine and deduplicate
        const allStocks = [...finnhubStocks, ...alphavantageStocks, ...twelvedataStocks];
        
        // Deduplicate by symbol, keeping first occurrence
        const uniqueStocks = [];
        const seen = new Set();
        
        for (const stock of allStocks) {
            if (stock && stock.symbol && !seen.has(stock.symbol)) {
                seen.add(stock.symbol);
                uniqueStocks.push(stock);
            }
        }

        // Enrich all stocks with company names
        const enrichedStocks = await stockNameEnrichment.enrichStockNames(uniqueStocks, adapters);

        return res.json({
            status: "success",
            data: enrichedStocks,
            sources: {
                finnhub: finnhubStocks.length,
                alphavantage: alphavantageStocks.length,
                twelvedata: twelvedataStocks.length,
                total: enrichedStocks.length
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
