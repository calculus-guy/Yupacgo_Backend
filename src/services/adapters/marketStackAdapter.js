const axios = require("axios");
const BaseAdapter = require("./baseAdapter");

/**
 * MarketStack Adapter for Nigerian Stock Exchange (NGX)
 * Provides Nigerian stock data to complement US stocks in recommendations
 */
class MarketStackAdapter extends BaseAdapter {
    constructor(apiKey) {
        super("MarketStack");
        this.apiKey = apiKey;
        this.baseUrl = "http://api.marketstack.com/v1";
        this.exchange = "XNGS"; // Nigerian Stock Exchange code
        this.currency = "NGN";
        
        if (!apiKey) {
            console.warn("⚠️ MarketStack API key not provided");
        }
    }

    /**
     * Get quote for Nigerian stock symbol
     * @param {String} symbol - Stock symbol (e.g., "DANGCEM", "MTNN")
     * @returns {Promise<Object>} Normalized quote object
     */
    async getQuote(symbol) {
        if (!this.apiKey) {
            throw new Error("MarketStack API key is required");
        }

        try {
            const response = await axios.get(`${this.baseUrl}/eod/latest`, {
                params: {
                    access_key: this.apiKey,
                    symbols: `${symbol}.${this.exchange}`,
                    limit: 1
                },
                timeout: 10000
            });

            if (!response.data || !response.data.data || response.data.data.length === 0) {
                return null;
            }

            const data = response.data.data[0];

            return this.normalizeQuote({
                symbol: symbol,
                name: null, // Will be enriched later
                price: data.close,
                change: data.close - data.open,
                changePercent: ((data.close - data.open) / data.open) * 100,
                volume: data.volume,
                exchange: "NGX",
                currency: this.currency,
                timestamp: data.date,
                open: data.open,
                high: data.high,
                low: data.low,
                previousClose: data.adj_close
            });

        } catch (error) {
            this.handleError(error, "getQuote");
            return null;
        }
    }

    /**
     * Get popular Nigerian stocks
     * @returns {Promise<Array>} Array of popular Nigerian stocks
     */
    async getPopularStocks() {
        try {
            // Top Nigerian stocks by market cap and liquidity
            const popularSymbols = [
                "DANGCEM",  // Dangote Cement
                "MTNN",     // MTN Nigeria
                "ZENITHBANK", // Zenith Bank
                "GTCO",     // Guaranty Trust Holding Company
                "BUACEMENT", // BUA Cement
                "AIRTELAFRI", // Airtel Africa
                "SEPLAT",   // Seplat Energy
                "FBNH",     // FBN Holdings
                "UBA",      // United Bank for Africa
                "ACCESSCORP", // Access Holdings
                "NESTLE",   // Nestle Nigeria
                "FLOURMILL", // Flour Mills of Nigeria
                "OANDO",    // Oando
                "STANBIC",  // Stanbic IBTC Holdings
                "WAPCO"     // Lafarge Africa (WAPCO)
            ];

            return await this.getBatchQuotes(popularSymbols);
        } catch (error) {
            this.handleError(error, "getPopularStocks");
            return [];
        }
    }

    /**
     * Get Nigerian stocks by sector
     * @param {String} sector - Sector name
     * @returns {Promise<Array>} Sector stocks
     */
    async getStocksBySector(sector) {
        try {
            const sectorMap = {
                finance: ["ZENITHBANK", "GTCO", "FBNH", "UBA", "ACCESSCORP", "STANBIC"],
                consumer: ["NESTLE", "FLOURMILL", "DANGSUGAR", "NASCON", "CADBURY"],
                tech: ["MTNN", "AIRTELAFRI", "INTERSWITCH"],
                energy: ["SEPLAT", "OANDO", "TOTALENERGIES", "CONOIL"],
                materials: ["DANGCEM", "BUACEMENT", "WAPCO", "LAFARGE"],
                diversified: ["DANGOTE", "BUA", "TRANSCORP"]
            };

            const symbols = sectorMap[sector.toLowerCase()] || [];
            if (symbols.length === 0) return [];

            return await this.getBatchQuotes(symbols);
        } catch (error) {
            this.handleError(error, "getStocksBySector");
            return [];
        }
    }

    /**
     * Search Nigerian stocks by symbol or name
     * @param {String} query - Search query
     * @returns {Promise<Array>} Search results
     */
    async searchSymbol(query) {
        try {
            // Simple symbol matching for Nigerian stocks
            const allSymbols = [
                { symbol: "DANGCEM", name: "Dangote Cement Plc", exchange: "NGX" },
                { symbol: "MTNN", name: "MTN Nigeria Communications Plc", exchange: "NGX" },
                { symbol: "ZENITHBANK", name: "Zenith Bank Plc", exchange: "NGX" },
                { symbol: "GTCO", name: "Guaranty Trust Holding Company Plc", exchange: "NGX" },
                { symbol: "BUACEMENT", name: "BUA Cement Plc", exchange: "NGX" },
                { symbol: "AIRTELAFRI", name: "Airtel Africa Plc", exchange: "NGX" },
                { symbol: "SEPLAT", name: "Seplat Energy Plc", exchange: "NGX" },
                { symbol: "FBNH", name: "FBN Holdings Plc", exchange: "NGX" },
                { symbol: "UBA", name: "United Bank for Africa Plc", exchange: "NGX" },
                { symbol: "ACCESSCORP", name: "Access Holdings Plc", exchange: "NGX" },
                { symbol: "NESTLE", name: "Nestle Nigeria Plc", exchange: "NGX" },
                { symbol: "FLOURMILL", name: "Flour Mills of Nigeria Plc", exchange: "NGX" },
                { symbol: "OANDO", name: "Oando Plc", exchange: "NGX" },
                { symbol: "STANBIC", name: "Stanbic IBTC Holdings Plc", exchange: "NGX" },
                { symbol: "WAPCO", name: "Lafarge Africa Plc", exchange: "NGX" }
            ];

            const queryLower = query.toLowerCase();
            return allSymbols.filter(stock => 
                stock.symbol.toLowerCase().includes(queryLower) ||
                stock.name.toLowerCase().includes(queryLower)
            ).slice(0, 10);

        } catch (error) {
            this.handleError(error, "searchSymbol");
            return [];
        }
    }

    /**
     * Get company profile for Nigerian stocks
     * @param {String} symbol - Stock symbol
     * @returns {Promise<Object>} Company profile
     */
    async getCompanyProfile(symbol) {
        try {
            // Static company profiles for major Nigerian stocks
            const profiles = {
                "DANGCEM": {
                    name: "Dangote Cement Plc",
                    exchange: "NGX",
                    sector: "Materials",
                    industry: "Cement",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading cement manufacturer in Africa"
                },
                "MTNN": {
                    name: "MTN Nigeria Communications Plc",
                    exchange: "NGX",
                    sector: "Technology",
                    industry: "Telecommunications",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading telecommunications company in Nigeria"
                },
                "ZENITHBANK": {
                    name: "Zenith Bank Plc",
                    exchange: "NGX",
                    sector: "Finance",
                    industry: "Banking",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading commercial bank in Nigeria"
                },
                "GTCO": {
                    name: "Guaranty Trust Holding Company Plc",
                    exchange: "NGX",
                    sector: "Finance",
                    industry: "Banking",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading financial services group in Nigeria"
                },
                "BUACEMENT": {
                    name: "BUA Cement Plc",
                    exchange: "NGX",
                    sector: "Materials",
                    industry: "Cement",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Major cement manufacturer in Nigeria"
                }
            };

            return profiles[symbol] || null;
        } catch (error) {
            this.handleError(error, "getCompanyProfile");
            return null;
        }
    }

    /**
     * Get trending Nigerian stocks (most active)
     * @returns {Promise<Array>} Trending stocks
     */
    async getTrending() {
        try {
            // Return most liquid/active Nigerian stocks
            const trendingSymbols = [
                "DANGCEM", "MTNN", "ZENITHBANK", "GTCO", "BUACEMENT",
                "AIRTELAFRI", "FBNH", "UBA", "ACCESSCORP", "NESTLE"
            ];

            return await this.getBatchQuotes(trendingSymbols);
        } catch (error) {
            this.handleError(error, "getTrending");
            return [];
        }
    }
}

module.exports = MarketStackAdapter;