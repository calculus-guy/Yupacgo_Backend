const { getCache, setCache } = require("../config/redis");

/**
 * Stock Name Enrichment Service
 * Enriches stock symbols with proper company names
 */
class StockNameEnrichmentService {
    constructor() {
        // Static mapping for common stocks when API doesn't provide names
        this.staticNames = {
            // Major Tech Stocks
            "AAPL": "Apple Inc.",
            "MSFT": "Microsoft Corporation",
            "GOOGL": "Alphabet Inc. Class A",
            "GOOG": "Alphabet Inc. Class C",
            "AMZN": "Amazon.com Inc.",
            "TSLA": "Tesla Inc.",
            "META": "Meta Platforms Inc.",
            "NVDA": "NVIDIA Corporation",
            "ORCL": "Oracle Corporation",
            "CSCO": "Cisco Systems Inc.",
            "INTC": "Intel Corporation",
            "AMD": "Advanced Micro Devices Inc.",
            "CRM": "Salesforce Inc.",
            "ADBE": "Adobe Inc.",
            "NFLX": "Netflix Inc.",
            
            // Financial Stocks
            "JPM": "JPMorgan Chase & Co.",
            "BAC": "Bank of America Corporation",
            "WFC": "Wells Fargo & Company",
            "GS": "The Goldman Sachs Group Inc.",
            "MS": "Morgan Stanley",
            "C": "Citigroup Inc.",
            "V": "Visa Inc.",
            "MA": "Mastercard Incorporated",
            "AXP": "American Express Company",
            "BLK": "BlackRock Inc.",
            "BRK.A": "Berkshire Hathaway Inc. Class A",
            "BRK.B": "Berkshire Hathaway Inc. Class B",
            
            // Healthcare Stocks
            "JNJ": "Johnson & Johnson",
            "UNH": "UnitedHealth Group Incorporated",
            "PFE": "Pfizer Inc.",
            "ABBV": "AbbVie Inc.",
            "TMO": "Thermo Fisher Scientific Inc.",
            "MRK": "Merck & Co. Inc.",
            "ABT": "Abbott Laboratories",
            "DHR": "Danaher Corporation",
            "LLY": "Eli Lilly and Company",
            "BMY": "Bristol-Myers Squibb Company",
            
            // Consumer Stocks
            "WMT": "Walmart Inc.",
            "HD": "The Home Depot Inc.",
            "MCD": "McDonald's Corporation",
            "NKE": "NIKE Inc.",
            "SBUX": "Starbucks Corporation",
            "TGT": "Target Corporation",
            "LOW": "Lowe's Companies Inc.",
            "COST": "Costco Wholesale Corporation",
            "DG": "Dollar General Corporation",
            "PG": "The Procter & Gamble Company",
            "KO": "The Coca-Cola Company",
            "PEP": "PepsiCo Inc.",
            "DIS": "The Walt Disney Company",
            
            // Energy Stocks
            "XOM": "Exxon Mobil Corporation",
            "CVX": "Chevron Corporation",
            "COP": "ConocoPhillips",
            "SLB": "Schlumberger Limited",
            "EOG": "EOG Resources Inc.",
            "MPC": "Marathon Petroleum Corporation",
            "PSX": "Phillips 66",
            "VLO": "Valero Energy Corporation",
            "OXY": "Occidental Petroleum Corporation",
            "HAL": "Halliburton Company",
            
            // Popular ETFs
            "SPY": "SPDR S&P 500 ETF Trust",
            "VOO": "Vanguard S&P 500 ETF",
            "QQQ": "Invesco QQQ Trust",
            "VTI": "Vanguard Total Stock Market ETF",
            "IVV": "iShares Core S&P 500 ETF",
            "VEA": "Vanguard FTSE Developed Markets ETF",
            "VWO": "Vanguard FTSE Emerging Markets ETF",
            "BND": "Vanguard Total Bond Market ETF",
            "VNQ": "Vanguard Real Estate ETF",
            "GLD": "SPDR Gold Shares",
            "SLV": "iShares Silver Trust",
            "TLT": "iShares 20+ Year Treasury Bond ETF",
            "EFA": "iShares MSCI EAFE ETF",
            "EEM": "iShares MSCI Emerging Markets ETF",
            "XLF": "Financial Select Sector SPDR Fund",
            "XLK": "Technology Select Sector SPDR Fund",
            "XLE": "Energy Select Sector SPDR Fund",
            "XLV": "Health Care Select Sector SPDR Fund",
            "XLI": "Industrial Select Sector SPDR Fund",
            "XLP": "Consumer Staples Select Sector SPDR Fund",
            "XLY": "Consumer Discretionary Select Sector SPDR Fund",
            "XLU": "Utilities Select Sector SPDR Fund",
            "XLB": "Materials Select Sector SPDR Fund",
            "XLRE": "Real Estate Select Sector SPDR Fund"
        };
    }

    /**
     * Enrich a single stock with company name
     * @param {Object} stock - Stock object with symbol
     * @param {Object} adapters - Available API adapters
     * @returns {Promise<Object>} Stock with enriched name
     */
    async enrichStockName(stock, adapters = {}) {
        try {
            // If name already exists and is not null/empty, return as is
            if (stock.name && stock.name.trim() && stock.name !== "null") {
                return stock;
            }

            const symbol = stock.symbol;
            if (!symbol) {
                return stock;
            }

            // Check cache first
            const cacheKey = `stock:name:${symbol}`;
            const cachedName = await getCache(cacheKey);
            if (cachedName) {
                return { ...stock, name: cachedName };
            }

            let enrichedName = null;

            // Try to get name from API adapters
            if (adapters.finnhub) {
                try {
                    const profile = await adapters.finnhub.getCompanyProfile(symbol);
                    if (profile && profile.name) {
                        enrichedName = profile.name;
                    }
                } catch (error) {
                    console.log(`Failed to get name from Finnhub for ${symbol}:`, error.message);
                }
            }

            // If no name from API, use static mapping
            if (!enrichedName) {
                enrichedName = this.staticNames[symbol] || symbol;
            }

            // Cache the result for 24 hours
            await setCache(cacheKey, enrichedName, 86400);

            return { ...stock, name: enrichedName };
        } catch (error) {
            console.error(`Error enriching name for ${stock.symbol}:`, error.message);
            // Fallback to static name or symbol
            return { 
                ...stock, 
                name: this.staticNames[stock.symbol] || stock.symbol 
            };
        }
    }

    /**
     * Enrich multiple stocks with company names
     * @param {Array} stocks - Array of stock objects
     * @param {Object} adapters - Available API adapters
     * @returns {Promise<Array>} Stocks with enriched names
     */
    async enrichStockNames(stocks, adapters = {}) {
        if (!Array.isArray(stocks) || stocks.length === 0) {
            return stocks;
        }

        // Process in parallel for better performance
        const enrichmentPromises = stocks.map(stock => 
            this.enrichStockName(stock, adapters)
        );

        return await Promise.all(enrichmentPromises);
    }

    /**
     * Get company name for a symbol (utility method)
     * @param {String} symbol - Stock symbol
     * @param {Object} adapters - Available API adapters
     * @returns {Promise<String>} Company name
     */
    async getCompanyName(symbol, adapters = {}) {
        const enrichedStock = await this.enrichStockName({ symbol }, adapters);
        return enrichedStock.name;
    }

    /**
     * Add a new static name mapping
     * @param {String} symbol - Stock symbol
     * @param {String} name - Company name
     */
    addStaticName(symbol, name) {
        this.staticNames[symbol] = name;
    }

    /**
     * Get all static name mappings
     * @returns {Object} Static name mappings
     */
    getStaticNames() {
        return { ...this.staticNames };
    }
}

module.exports = new StockNameEnrichmentService();