const axios = require("axios");
const BaseAdapter = require("./baseAdapter");

/**
 * Twelve Data Adapter
 * Integrates with Twelve Data API for stock data
 * Docs: https://twelvedata.com/docs
 */
class TwelveDataAdapter extends BaseAdapter {
    constructor(apiKey) {
        super(apiKey);
        this.providerName = "twelvedata";
        this.baseUrl = "https://api.twelvedata.com";
    }

    /**
     * Search for stocks
     */
    async searchSymbol(query) {
        try {
            const response = await axios.get(`${this.baseUrl}/symbol_search`, {
                params: {
                    symbol: query,
                    apikey: this.apiKey
                }
            });

            if (!response.data || !response.data.data) {
                return [];
            }

            return response.data.data.map(item => ({
                symbol: item.symbol,
                name: item.instrument_name,
                type: item.instrument_type,
                exchange: item.exchange,
                country: item.country,
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
                    apikey: this.apiKey
                }
            });

            const data = response.data;

            if (!data || !data.close) {
                return null;
            }

            return this.normalizeQuote({
                symbol: data.symbol,
                name: data.name,
                exchange: data.exchange,
                price: parseFloat(data.close),
                high: parseFloat(data.high),
                low: parseFloat(data.low),
                open: parseFloat(data.open),
                previousClose: parseFloat(data.previous_close),
                change: parseFloat(data.change),
                changePercent: parseFloat(data.percent_change),
                volume: parseInt(data.volume),
                timestamp: data.datetime
            });
        } catch (error) {
            this.handleError(error, "getQuote");
            return null;
        }
    }

    /**
     * Get batch quotes (Twelve Data supports this natively)
     */
    async getBatchQuotes(symbols) {
        try {
            const symbolString = symbols.join(",");
            const response = await axios.get(`${this.baseUrl}/quote`, {
                params: {
                    symbol: symbolString,
                    apikey: this.apiKey
                }
            });

            if (!response.data) {
                return [];
            }

            // Handle both single and multiple responses
            const data = Array.isArray(response.data) ? response.data : [response.data];

            return data
                .filter(item => item.close)
                .map(item => this.normalizeQuote({
                    symbol: item.symbol,
                    name: item.name,
                    exchange: item.exchange,
                    price: parseFloat(item.close),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    open: parseFloat(item.open),
                    previousClose: parseFloat(item.previous_close),
                    change: parseFloat(item.change),
                    changePercent: parseFloat(item.percent_change),
                    volume: parseInt(item.volume),
                    timestamp: item.datetime
                }));
        } catch (error) {
            this.handleError(error, "getBatchQuotes");
            return [];
        }
    }

    /**
     * Get popular US stocks
     */
    async getPopularStocks() {
        try {
            const popularSymbols = [
                "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
                "META", "NVDA", "JPM", "V", "WMT",
                "JNJ", "PG", "MA", "HD", "DIS",
                "BAC", "XOM", "KO", "PFE", "CSCO",
                "SPY", "VOO", "QQQ", "VTI", "IVV"
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
     * Get trending stocks (use market movers)
     */
    async getTrending() {
        try {
            // Twelve Data has a market movers endpoint (premium feature)
            // For free tier, we'll return popular symbols
            const popularSymbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "JPM", "V", "WMT"];
            return await this.getBatchQuotes(popularSymbols);
        } catch (error) {
            this.handleError(error, "getTrending");
            return [];
        }
    }

    /**
     * Normalize Twelve Data response to standard format
     */
    normalizeQuote(rawData) {
        return {
            provider: this.providerName,
            providerSymbol: rawData.symbol,
            symbol: rawData.symbol,
            name: rawData.name,
            exchange: rawData.exchange,
            price: rawData.price,
            bid: null,
            ask: null,
            priceType: "last",
            change: rawData.change,
            changePercent: rawData.changePercent,
            volume: rawData.volume,
            currency: "USD",
            timestamp: rawData.timestamp 
                ? new Date(rawData.timestamp).toISOString()
                : new Date().toISOString(),
            detailUrl: `https://twelvedata.com/stocks/${rawData.symbol}`,
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
     */
    generateBuyLinks(symbol) {
        return {
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

module.exports = TwelveDataAdapter;
