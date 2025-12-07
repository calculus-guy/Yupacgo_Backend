/**
 * Base Adapter Interface
 * All market data adapters must implement these methods
 * Ensures consistent interface across different providers
 */

class BaseAdapter {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.providerName = "base";
    }

    /**
     * Search for stocks by query string
     * @param {String} query - Search query (symbol or company name)
     * @returns {Promise<Array>} Array of search results
     */
    async searchSymbol(query) {
        throw new Error("searchSymbol() must be implemented by adapter");
    }

    /**
     * Get quote for a single symbol
     * @param {String} symbol - Stock symbol
     * @returns {Promise<Object>} Normalized quote object
     */
    async getQuote(symbol) {
        throw new Error("getQuote() must be implemented by adapter");
    }

    /**
     * Get quotes for multiple symbols (batch)
     * @param {Array<String>} symbols - Array of stock symbols
     * @returns {Promise<Array>} Array of normalized quote objects
     */
    async getBatchQuotes(symbols) {
        // Default implementation: call getQuote for each symbol
        const promises = symbols.map(symbol => this.getQuote(symbol));
        const results = await Promise.allSettled(promises);
        return results
            .filter(r => r.status === "fulfilled")
            .map(r => r.value);
    }

    /**
     * Get popular stocks
     * @returns {Promise<Array>} Array of popular stocks
     */
    async getPopularStocks() {
        throw new Error("getPopularStocks() must be implemented by adapter");
    }

    /**
     * Get stocks by sector
     * @param {String} sector - Sector name
     * @returns {Promise<Array>} Array of stocks in sector
     */
    async getStocksBySector(sector) {
        throw new Error("getStocksBySector() must be implemented by adapter");
    }

    /**
     * Get trending/top gainers
     * @returns {Promise<Array>} Array of trending stocks
     */
    async getTrending() {
        throw new Error("getTrending() must be implemented by adapter");
    }

    /**
     * Normalize quote response to standard format
     * @param {Object} rawData - Raw API response
     * @returns {Object} Normalized quote
     */
    normalizeQuote(rawData) {
        return {
            provider: this.providerName,
            providerSymbol: null,
            symbol: null,
            name: null,
            exchange: null,
            price: null,
            bid: null,
            ask: null,
            priceType: "last", // "last" | "bid" | "ask" | "mid"
            change: null,
            changePercent: null,
            volume: null,
            currency: "USD",
            timestamp: new Date().toISOString(),
            detailUrl: null,
            marketCap: null,
            high: null,
            low: null,
            open: null,
            previousClose: null
        };
    }

    /**
     * Handle API errors consistently
     * @param {Error} error - Error object
     * @param {String} context - Context where error occurred
     */
    handleError(error, context) {
        console.error(`[${this.providerName}] Error in ${context}:`, error.message);
        return null;
    }
}

module.exports = BaseAdapter;
