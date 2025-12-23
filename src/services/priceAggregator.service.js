const FinnhubAdapter = require("./adapters/finnhubAdapter");
const AlphaVantageAdapter = require("./adapters/alphaVantageAdapter");
const TwelveDataAdapter = require("./adapters/twelveDataAdapter");
const { getCache, setCache } = require("../config/redis");
const stockNameEnrichment = require("./stockNameEnrichment.service");

/**
 * Price Aggregator Service
 * Fetches prices from multiple providers and compares them
 */
class PriceAggregatorService {
    constructor() {
        // Initialize adapters with API keys from environment
        this.adapters = {
            finnhub: new FinnhubAdapter(process.env.FINNHUB_API_KEY),
            alphavantage: new AlphaVantageAdapter(process.env.ALPHAVANTAGE_API_KEY),
            twelvedata: new TwelveDataAdapter(process.env.TWELVEDATA_API_KEY)
        };
    }

    /**
     * Get price comparison for a stock from multiple providers
     * @param {String} symbol - Stock symbol
     * @returns {Promise<Object>} Price comparison data
     */
    async getPriceComparison(symbol) {
        try {
            // Check cache first
            const cacheKey = `price:comparison:${symbol}`;
            const cached = await getCache(cacheKey);
            if (cached) {
                console.log(`✅ Using cached price comparison for ${symbol}`);
                return cached;
            }

            console.log(`🔄 Fetching price comparison for ${symbol} from APIs...`);

            // Fetch quotes from all providers in parallel
            const quotePromises = Object.values(this.adapters).map(async (adapter) => {
                try {
                    const quote = await adapter.getQuote(symbol);
                    return quote;
                } catch (error) {
                    console.error(`Error fetching from ${adapter.providerName}:`, error.message);
                    return null;
                }
            });

            const quotes = (await Promise.all(quotePromises)).filter(q => q !== null);

            if (quotes.length === 0) {
                throw new Error("No price data available from any provider");
            }

            // Calculate best price (prefer ask, fallback to last)
            const validPrices = quotes
                .map(q => ({
                    provider: q.provider,
                    price: q.ask || q.price,
                    priceType: q.ask ? "ask" : q.priceType,
                    timestamp: q.timestamp,
                    detailUrl: q.detailUrl
                }))
                .filter(p => p.price > 0);

            // Sort by price (ascending)
            validPrices.sort((a, b) => a.price - b.price);

            const bestPrice = validPrices[0];
            const worstPrice = validPrices[validPrices.length - 1];

            // Calculate price variance
            const priceVariance = validPrices.length > 1
                ? ((worstPrice.price - bestPrice.price) / bestPrice.price) * 100
                : 0;

            // Determine confidence level
            let confidence = "high";
            if (priceVariance > 1) confidence = "low";
            else if (priceVariance > 0.2) confidence = "medium";

            const result = {
                symbol: symbol,
                name: quotes[0]?.name || symbol,
                exchange: quotes[0]?.exchange || "Unknown",
                prices: quotes,
                best: bestPrice,
                priceVariance: parseFloat(priceVariance.toFixed(2)),
                confidence,
                timestamp: new Date().toISOString()
            };

            // Cache for 60 seconds
            await setCache(cacheKey, result, 60);

            return result;
        } catch (error) {
            console.error("Error in getPriceComparison:", error.message);
            throw error;
        }
    }

    /**
     * Get single aggregated quote (best price from all providers)
     * @param {String} symbol - Stock symbol
     * @returns {Promise<Object>} Aggregated quote
     */
    async getAggregatedQuote(symbol) {
        // Check cache first
        const cacheKey = `quote:${symbol}`;
        const cached = await getCache(cacheKey);
        if (cached) {
            return cached;
        }

        const comparison = await this.getPriceComparison(symbol);
        
        let result = {
            symbol: comparison.symbol,
            name: comparison.name,
            exchange: comparison.exchange,
            price: comparison.best.price,
            priceType: comparison.best.priceType,
            provider: comparison.best.provider,
            timestamp: comparison.best.timestamp,
            confidence: comparison.confidence
        };

        // Enrich with company name if not already present
        if (!result.name || result.name === symbol) {
            const adapters = {
                finnhub: this.adapters.finnhub
            };
            result = await stockNameEnrichment.enrichStockName(result, adapters);
        }

        // Cache for 60 seconds
        await setCache(cacheKey, result, 60);

        return result;
    }

    /**
     * Get batch quotes for multiple stocks
     * @param {Array<String>} symbols - Array of stock symbols
     * @returns {Promise<Array>} Array of aggregated quotes
     */
    async getBatchAggregatedQuotes(symbols) {
        const promises = symbols.map(symbol => 
            this.getAggregatedQuote(symbol).catch(err => {
                console.error(`Error fetching quote for ${symbol}:`, err.message);
                return null;
            })
        );

        const results = await Promise.all(promises);
        const validResults = results.filter(r => r !== null);

        // Enrich all results with company names
        const adapters = {
            finnhub: this.adapters.finnhub
        };
        
        return await stockNameEnrichment.enrichStockNames(validResults, adapters);
    }

    /**
     * Search stocks across providers
     * @param {String} query - Search query
     * @returns {Promise<Array>} Search results
     */
    async searchStocks(query) {
        try {
            // Check cache first
            const cacheKey = `search:${query.toLowerCase()}`;
            const cached = await getCache(cacheKey);
            if (cached) {
                console.log(`✅ Using cached search results for "${query}"`);
                return cached;
            }

            console.log(`🔍 Searching for "${query}" across APIs...`);

            // Search via adapters
            const searchPromises = Object.values(this.adapters).map(adapter =>
                adapter.searchSymbol(query).catch(() => [])
            );

            const results = await Promise.all(searchPromises);
            const allResults = results.flat();

            // Deduplicate by symbol
            const uniqueResults = [];
            const seen = new Set();

            for (const result of allResults) {
                if (!seen.has(result.symbol)) {
                    seen.add(result.symbol);
                    uniqueResults.push({
                        symbol: result.symbol,
                        name: result.name,
                        type: result.type,
                        exchange: result.exchange,
                        provider: result.provider,
                        source: "api"
                    });
                }
            }

            const finalResults = uniqueResults.slice(0, 10);

            // Cache for 5 minutes
            await setCache(cacheKey, finalResults, 300);

            return finalResults;
        } catch (error) {
            console.error("Error in searchStocks:", error.message);
            return [];
        }
    }
}

module.exports = new PriceAggregatorService();
