const axios = require("axios");
const BaseAdapter = require("./baseAdapter");

/**
 * Finnhub Adapter
 * Integrates with Finnhub API for real-time stock data
 * Docs: https://finnhub.io/docs/api
 */
class FinnhubAdapter extends BaseAdapter {
    constructor(apiKey) {
        super(apiKey);
        this.providerName = "finnhub";
        this.baseUrl = "https://finnhub.io/api/v1";
    }

    /**
     * Search for stocks
     */
    async searchSymbol(query) {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    q: query,
                    token: this.apiKey
                }
            });

            if (!response.data || !response.data.result) {
                return [];
            }

            return response.data.result.map(item => ({
                symbol: item.symbol,
                name: item.description,
                type: item.type,
                provider: this.providerName
            }));
        } catch (error) {
            this.handleError(error, "searchSymbol");
            return [];
        }
    }

    /**
     * Get quote for single symbol
     */
    async getQuote(symbol) {
        try {
            const response = await axios.get(`${this.baseUrl}/quote`, {
                params: {
                    symbol: symbol,
                    token: this.apiKey
                }
            });

            const data = response.data;

            if (!data || data.c === 0) {
                return null;
            }

            return this.normalizeQuote({
                symbol: symbol,
                current: data.c,
                high: data.h,
                low: data.l,
                open: data.o,
                previousClose: data.pc,
                change: data.d,
                changePercent: data.dp,
                timestamp: data.t
            });
        } catch (error) {
            this.handleError(error, "getQuote");
            return null;
        }
    }

    /**
     * Get popular US stocks (commonly traded)
     */
    async getPopularStocks() {
        try {
            // Return popular US stocks that are commonly recommended
            const popularSymbols = [
                "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
                "META", "NVDA", "JPM", "V", "WMT",
                "JNJ", "PG", "MA", "HD", "DIS",
                "BAC", "XOM", "KO", "PFE", "CSCO",
                "SPY", "VOO", "QQQ", "VTI", "IVV" // ETFs
            ];

            return await this.getBatchQuotes(popularSymbols);
        } catch (error) {
            this.handleError(error, "getPopularStocks");
            return [];
        }
    }

    /**
     * Get stocks by sector
     */
    async getStocksBySector(sector) {
        try {
            const sectorStocks = {
                tech: ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "ORCL", "CSCO", "INTC", "AMD", "CRM"],
                finance: ["JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP", "BLK"],
                healthcare: ["JNJ", "UNH", "PFE", "ABBV", "TMO", "MRK", "ABT", "DHR", "LLY", "BMY"],
                consumer: ["AMZN", "WMT", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "COST", "DG"],
                energy: ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HAL"]
            };

            const symbols = sectorStocks[sector] || sectorStocks.tech;
            return await this.getBatchQuotes(symbols);
        } catch (error) {
            this.handleError(error, "getStocksBySector");
            return [];
        }
    }

    /**
     * Get company profile (includes name)
     */
    async getCompanyProfile(symbol) {
        try {
            const response = await axios.get(`${this.baseUrl}/stock/profile2`, {
                params: {
                    symbol: symbol,
                    token: this.apiKey
                }
            });

            if (!response.data || !response.data.name) {
                return null;
            }

            return {
                symbol: symbol,
                name: response.data.name,
                exchange: response.data.exchange,
                industry: response.data.finnhubIndustry,
                logo: response.data.logo
            };
        } catch (error) {
            this.handleError(error, "getCompanyProfile");
            return null;
        }
    }

    /**
     * Get trending stocks (top gainers from US market)
     */
    async getTrending() {
        try {
            // Finnhub doesn't have a direct trending endpoint
            // We'll use market news sentiment as proxy
            const response = await axios.get(`${this.baseUrl}/news`, {
                params: {
                    category: "general",
                    token: this.apiKey
                }
            });

            if (!response.data) {
                return [];
            }

            // Extract unique symbols from news
            const symbols = new Set();
            response.data.slice(0, 20).forEach(news => {
                if (news.related) {
                    news.related.split(",").forEach(s => symbols.add(s.trim()));
                }
            });

            // Get quotes for these symbols
            const trendingSymbols = Array.from(symbols).slice(0, 10);
            return await this.getBatchQuotes(trendingSymbols);
        } catch (error) {
            this.handleError(error, "getTrending");
            return [];
        }
    }

    /**
     * Normalize Finnhub response to standard format
     */
    normalizeQuote(rawData) {
        return {
            provider: this.providerName,
            providerSymbol: rawData.symbol,
            symbol: rawData.symbol,
            name: null, // Finnhub quote doesn't include name
            exchange: null,
            price: rawData.current,
            bid: null,
            ask: null,
            priceType: "last",
            change: rawData.change,
            changePercent: rawData.changePercent,
            volume: null,
            currency: "USD",
            timestamp: rawData.timestamp 
                ? new Date(rawData.timestamp * 1000).toISOString()
                : new Date().toISOString(),
            detailUrl: `https://finnhub.io/quote/${rawData.symbol}`,
            buyLinks: this.generateBuyLinks(rawData.symbol),
            marketCap: null,
            high: rawData.high,
            low: rawData.low,
            open: rawData.open,
            previousClose: rawData.previousClose
        };
    }

    /**
     * Generate buy links for different platforms
     * Note: Nigerian platforms don't support direct stock URLs
     */
    generateBuyLinks(symbol) {
        return {
            // Nigerian platforms (require login, no direct stock URLs)
            bamboo: {
                url: "https://app.bamboo.app/",
                type: "app_required",
                instructions: `Open Bamboo app → Search "${symbol}" → Buy`,
                available: true
            },
            chaka: {
                url: "https://chaka.com/",
                type: "app_required",
                instructions: `Open Chaka app → Search "${symbol}" → Buy`,
                available: true
            },
            trove: {
                url: "https://trove.ng/",
                type: "app_required",
                instructions: `Open Trove app → Search "${symbol}" → Buy`,
                available: true
            },
            risevest: {
                url: "https://risevest.com/",
                type: "app_required",
                instructions: `Open Risevest app → Search "${symbol}" → Buy`,
                available: true
            },
            
            // US platforms (direct stock URLs work)
            robinhood: {
                url: `https://robinhood.com/stocks/${symbol}`,
                type: "direct_link",
                instructions: `Direct link to ${symbol} on Robinhood`,
                available: true
            },
            webull: {
                url: `https://www.webull.com/quote/${symbol}`,
                type: "direct_link",
                instructions: `Direct link to ${symbol} on Webull`,
                available: true
            },
            
            // Fallback options
            yahoo: {
                url: `https://finance.yahoo.com/quote/${symbol}`,
                type: "info_only",
                instructions: `View ${symbol} details and find broker links`,
                available: true
            },
            google: {
                url: `https://www.google.com/search?q=buy+${symbol}+stock+nigeria`,
                type: "search",
                instructions: `Search for platforms to buy ${symbol}`,
                available: true
            }
        };
    }
}

module.exports = FinnhubAdapter;
