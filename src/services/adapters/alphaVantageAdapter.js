const axios = require("axios");
const BaseAdapter = require("./baseAdapter");

/**
 * Alpha Vantage Adapter
 * Integrates with Alpha Vantage API for stock data
 * Docs: https://www.alphavantage.co/documentation/
 */
class AlphaVantageAdapter extends BaseAdapter {
    constructor(apiKey) {
        super(apiKey);
        this.providerName = "alphavantage";
        this.baseUrl = "https://www.alphavantage.co/query";
    }

    /**
     * Search for stocks
     */
    async searchSymbol(query) {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: "SYMBOL_SEARCH",
                    keywords: query,
                    apikey: this.apiKey
                }
            });

            if (!response.data || !response.data.bestMatches) {
                return [];
            }

            return response.data.bestMatches.map(item => ({
                symbol: item["1. symbol"],
                name: item["2. name"],
                type: item["3. type"],
                region: item["4. region"],
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
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: "GLOBAL_QUOTE",
                    symbol: symbol,
                    apikey: this.apiKey
                }
            });

            const data = response.data["Global Quote"];

            if (!data || !data["05. price"]) {
                return null;
            }

            return this.normalizeQuote({
                symbol: data["01. symbol"],
                price: parseFloat(data["05. price"]),
                high: parseFloat(data["03. high"]),
                low: parseFloat(data["04. low"]),
                open: parseFloat(data["02. open"]),
                previousClose: parseFloat(data["08. previous close"]),
                change: parseFloat(data["09. change"]),
                changePercent: parseFloat(data["10. change percent"].replace("%", "")),
                volume: parseInt(data["06. volume"]),
                latestTradingDay: data["07. latest trading day"]
            });
        } catch (error) {
            this.handleError(error, "getQuote");
            return null;
        }
    }

    /**
     * Get trending stocks (top gainers)
     */
    async getTrending() {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: "TOP_GAINERS_LOSERS",
                    apikey: this.apiKey
                }
            });

            if (!response.data || !response.data.top_gainers) {
                return [];
            }

            // Return top 10 gainers
            return response.data.top_gainers.slice(0, 10).map(item => 
                this.normalizeQuote({
                    symbol: item.ticker,
                    price: parseFloat(item.price),
                    change: parseFloat(item.change_amount),
                    changePercent: parseFloat(item.change_percentage.replace("%", "")),
                    volume: parseInt(item.volume)
                })
            );
        } catch (error) {
            this.handleError(error, "getTrending");
            return [];
        }
    }

    /**
     * Normalize Alpha Vantage response to standard format
     */
    normalizeQuote(rawData) {
        return {
            provider: this.providerName,
            providerSymbol: rawData.symbol,
            symbol: rawData.symbol,
            name: null,
            exchange: null,
            price: rawData.price,
            bid: null,
            ask: null,
            priceType: "last",
            change: rawData.change,
            changePercent: rawData.changePercent,
            volume: rawData.volume,
            currency: "USD",
            timestamp: rawData.latestTradingDay 
                ? new Date(rawData.latestTradingDay).toISOString()
                : new Date().toISOString(),
            detailUrl: `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${rawData.symbol}`,
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

module.exports = AlphaVantageAdapter;
