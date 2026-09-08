const priceAggregator = require("../services/priceAggregator.service");
const providerManager = require("../services/providerManager.service");
const stockNameEnrichment = require("../services/stockNameEnrichment.service");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Search stocks by query
 * GET /api/stocks/search?q=query
 */
exports.searchStocks = asyncHandler(async (req, res) => {
    const { q: query } = req.query;
    if (!query || query.trim().length < 1) {
        throw AppError.badRequest("Search query is required");
    }

    const results = await priceAggregator.searchStocks(query.trim());
    return res.json({ status: "success", data: results, query: query.trim() });
});

/**
 * Get stock details with enriched company information
 * GET /api/stocks/:symbol
 */
exports.getStockDetails = asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    if (!symbol) throw AppError.badRequest("Stock symbol is required");

    const quote = await priceAggregator.getAggregatedQuote(symbol.toUpperCase());
    if (!quote) throw AppError.notFound(`Stock data not found for symbol: ${symbol}`);

    let companyProfile = null;
    try {
        companyProfile = await providerManager.getCompanyProfile(symbol.toUpperCase());
    } catch {
        // Optional enrichment — a failure here shouldn't fail the whole request.
    }

    const stockDetails = {
        symbol: quote.symbol,
        name: quote.name || companyProfile?.name || symbol,
        exchange: quote.exchange || companyProfile?.exchange,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        marketCap: quote.marketCap,
        currency: quote.currency || "USD",
        timestamp: quote.timestamp,
        provider: quote.metadata?.provider,
        ...(companyProfile && {
            industry: companyProfile.industry,
            sector: companyProfile.sector,
            country: companyProfile.country,
            description: companyProfile.description,
            website: companyProfile.website,
            employees: companyProfile.employees
        })
    };

    return res.json({ status: "success", data: stockDetails });
});

/**
 * Get price comparison data
 * GET /api/stocks/:symbol/prices
 */
exports.getPriceComparison = asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    if (!symbol) throw AppError.badRequest("Stock symbol is required");

    const priceData = await priceAggregator.getPriceComparison(symbol.toUpperCase());
    return res.json({ status: "success", data: priceData });
});

/**
 * Get simple quote for a stock
 * GET /api/stocks/:symbol/quote
 */
exports.getQuote = asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    if (!symbol) throw AppError.badRequest("Stock symbol is required");

    const quote = await providerManager.getQuote(symbol.toUpperCase());
    if (!quote) throw AppError.notFound(`Quote not found for symbol: ${symbol}`);

    return res.json({ status: "success", data: quote });
});

/**
 * Get popular stocks
 * GET /api/stocks/popular
 *
 * Name enrichment now goes through stockNameEnrichment (static map first,
 * network call only as a last resort) instead of an unconditional per-stock
 * `getCompanyProfile` call — that sequential N+1 pattern was a big part of
 * why this endpoint (hit on every dashboard load) felt slow.
 */
exports.getPopularStocks = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const popularStocks = [];

    for (const provider of providerManager.providers) {
        if (provider.status === "disabled") continue;
        if (!provider.adapter.getPopularStocks) continue;

        try {
            const stocks = await provider.adapter.getPopularStocks();
            if (stocks && stocks.length > 0) {
                popularStocks.push(...stocks.slice(0, limit));
                break; // first successful provider wins
            }
        } catch {
            continue;
        }
    }

    if (popularStocks.length === 0) {
        const defaultSymbols = [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
            "META", "NVDA", "JPM", "V", "WMT",
            "DIS", "NFLX", "ADBE", "CRM", "ORCL",
            "SPY", "QQQ", "VOO", "VTI", "IVV"
        ];

        for (const symbol of defaultSymbols.slice(0, limit)) {
            try {
                const quote = await providerManager.getQuote(symbol);
                if (quote) popularStocks.push(quote);
            } catch {
                continue;
            }
        }
    }

    const enrichedStocks = await stockNameEnrichment.enrichStockNames(popularStocks);

    return res.json({ status: "success", data: enrichedStocks, count: enrichedStocks.length });
});
