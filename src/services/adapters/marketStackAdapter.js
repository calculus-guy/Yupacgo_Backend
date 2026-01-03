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
     * @param {String} symbol - Stock symbol (e.g., "DANGCEM", "DANGSUGAR")
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
                    symbols: symbol, // Use symbol without exchange suffix
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
                exchange: "NGX", // Keep NGX as logical exchange for Nigerian stocks
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
            // Nigerian stocks that actually exist in MarketStack (confirmed via debug)
            const popularSymbols = [
                "DANGCEM",      // Dangote Cement - CONFIRMED ✅
                "DANGSUGAR",    // Dangote Sugar Refinery - CONFIRMED ✅
                "NAHCO",        // Nigerian Aviation Handling Co - CONFIRMED ✅
                "ENAMELWA",     // Nigerian Enamelware Co - CONFIRMED ✅
                // Adding more likely Nigerian stocks (to be tested)
                "ZENITHBANK",   // Zenith Bank (might work)
                "GTCO",         // Guaranty Trust (might work)
                "UBA",          // United Bank for Africa (might work)
                "MTNN",         // MTN Nigeria (might work)
                "FBNH",         // FBN Holdings (might work)
                "ACCESSCORP"    // Access Holdings (might work)
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
                finance: ["ZENITHBANK", "GTCO", "FBNH", "UBA", "ACCESSCORP"],
                consumer: ["DANGSUGAR", "ENAMELWA"], // Using confirmed symbols
                tech: ["MTNN"], // MTN Nigeria
                materials: ["DANGCEM"], // Using confirmed symbols
                transport: ["NAHCO"], // Using confirmed symbols
                diversified: ["DANGCEM", "DANGSUGAR"] // Dangote group companies
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
            // Company profiles for confirmed Nigerian stocks
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
                "DANGSUGAR": {
                    name: "Dangote Sugar Refinery Plc",
                    exchange: "NGX",
                    sector: "Consumer",
                    industry: "Food Processing",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading sugar refinery company in Nigeria"
                },
                "NAHCO": {
                    name: "Nigerian Aviation Handling Co Plc",
                    exchange: "NGX",
                    sector: "Transport",
                    industry: "Aviation Services",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading aviation ground handling services in Nigeria"
                },
                "ENAMELWA": {
                    name: "Nigerian Enamelware Co Plc",
                    exchange: "NGX",
                    sector: "Consumer",
                    industry: "Manufacturing",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Enamelware and household products manufacturer"
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
                "UBA": {
                    name: "United Bank for Africa Plc",
                    exchange: "NGX",
                    sector: "Finance",
                    industry: "Banking",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Pan-African financial services group"
                },
                "FBNH": {
                    name: "FBN Holdings Plc",
                    exchange: "NGX",
                    sector: "Finance",
                    industry: "Banking",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading financial services holding company"
                },
                "ACCESSCORP": {
                    name: "Access Holdings Plc",
                    exchange: "NGX",
                    sector: "Finance",
                    industry: "Banking",
                    country: "Nigeria",
                    currency: "NGN",
                    description: "Leading financial services group in Nigeria"
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
            // Return confirmed Nigerian stocks as trending
            const trendingSymbols = [
                "DANGCEM",      // Dangote Cement - confirmed
                "DANGSUGAR",    // Dangote Sugar - confirmed
                "NAHCO",        // Nigerian Aviation - confirmed
                "ENAMELWA",     // Nigerian Enamelware - confirmed
                "MTNN",         // MTN Nigeria
                "ZENITHBANK"    // Zenith Bank
            ];

            return await this.getBatchQuotes(trendingSymbols);
        } catch (error) {
            this.handleError(error, "getTrending");
            return [];
        }
    }
}

module.exports = MarketStackAdapter;