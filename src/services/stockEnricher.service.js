const FinnhubAdapter = require("./adapters/finnhubAdapter");
const { getCache, setCache } = require("../config/redis");

/**
 * Stock Enricher Service
 * Adds company names and additional info to stock data
 */

// Common stock name mappings (fallback if API fails)
const STOCK_NAMES = {
    // Tech
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.",
    "META": "Meta Platforms Inc.",
    "TSLA": "Tesla Inc.",
    "NVDA": "NVIDIA Corporation",
    "ORCL": "Oracle Corporation",
    "CSCO": "Cisco Systems Inc.",
    "INTC": "Intel Corporation",
    "AMD": "Advanced Micro Devices Inc.",
    "CRM": "Salesforce Inc.",
    "ADBE": "Adobe Inc.",
    "NFLX": "Netflix Inc.",
    
    // Finance
    "JPM": "JPMorgan Chase & Co.",
    "BAC": "Bank of America Corp.",
    "WFC": "Wells Fargo & Company",
    "GS": "Goldman Sachs Group Inc.",
    "MS": "Morgan Stanley",
    "C": "Citigroup Inc.",
    "V": "Visa Inc.",
    "MA": "Mastercard Inc.",
    "AXP": "American Express Company",
    "BLK": "BlackRock Inc.",
    "SCHW": "Charles Schwab Corporation",
    
    // Healthcare
    "JNJ": "Johnson & Johnson",
    "UNH": "UnitedHealth Group Inc.",
    "PFE": "Pfizer Inc.",
    "ABBV": "AbbVie Inc.",
    "TMO": "Thermo Fisher Scientific Inc.",
    "MRK": "Merck & Co. Inc.",
    "ABT": "Abbott Laboratories",
    "DHR": "Danaher Corporation",
    "LLY": "Eli Lilly and Company",
    "BMY": "Bristol-Myers Squibb Company",
    
    // Consumer
    "WMT": "Walmart Inc.",
    "HD": "Home Depot Inc.",
    "MCD": "McDonald's Corporation",
    "NKE": "Nike Inc.",
    "SBUX": "Starbucks Corporation",
    "TGT": "Target Corporation",
    "LOW": "Lowe's Companies Inc.",
    "COST": "Costco Wholesale Corporation",
    "DG": "Dollar General Corporation",
    "DIS": "Walt Disney Company",
    
    // Energy
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
    
    // ETFs
    "SPY": "SPDR S&P 500 ETF Trust",
    "VOO": "Vanguard S&P 500 ETF",
    "QQQ": "Invesco QQQ Trust",
    "VTI": "Vanguard Total Stock Market ETF",
    "IVV": "iShares Core S&P 500 ETF",
    "DIA": "SPDR Dow Jones Industrial Average ETF",
    "IWM": "iShares Russell 2000 ETF",
    "EFA": "iShares MSCI EAFE ETF",
    "VEA": "Vanguard FTSE Developed Markets ETF",
    "AGG": "iShares Core U.S. Aggregate Bond ETF",
    
    // Other
    "PG": "Procter & Gamble Company",
    "KO": "Coca-Cola Company"
};

/**
 * Get company name for a symbol
 * @param {String} symbol - Stock symbol
 * @returns {Promise<String>} Company name
 */
async function getCompanyName(symbol) {
    try {
        // Check cache first
        const cacheKey = `company:name:${symbol}`;
        const cached = await getCache(cacheKey);
        if (cached) {
            return cached;
        }

        // Try fallback mapping first (faster)
        if (STOCK_NAMES[symbol]) {
            await setCache(cacheKey, STOCK_NAMES[symbol], 86400); // Cache for 24 hours
            return STOCK_NAMES[symbol];
        }

        // Try Finnhub API
        const finnhub = new FinnhubAdapter(process.env.FINNHUB_API_KEY);
        const profile = await finnhub.getCompanyProfile(symbol);
        
        if (profile && profile.name) {
            await setCache(cacheKey, profile.name, 86400); // Cache for 24 hours
            return profile.name;
        }

        // Fallback to symbol if all else fails
        return symbol;
    } catch (error) {
        console.error(`Error getting company name for ${symbol}:`, error.message);
        return symbol;
    }
}

/**
 * Enrich stock data with company names
 * @param {Array} stocks - Array of stock objects
 * @returns {Promise<Array>} Enriched stocks
 */
async function enrichStocks(stocks) {
    const enrichedStocks = await Promise.all(
        stocks.map(async (stock) => {
            if (!stock.name || stock.name === stock.symbol) {
                const companyName = await getCompanyName(stock.symbol);
                return {
                    ...stock,
                    name: companyName
                };
            }
            return stock;
        })
    );

    return enrichedStocks;
}

/**
 * Enrich single stock with company name
 * @param {Object} stock - Stock object
 * @returns {Promise<Object>} Enriched stock
 */
async function enrichStock(stock) {
    if (!stock.name || stock.name === stock.symbol) {
        const companyName = await getCompanyName(stock.symbol);
        return {
            ...stock,
            name: companyName
        };
    }
    return stock;
}

module.exports = {
    getCompanyName,
    enrichStocks,
    enrichStock
};
