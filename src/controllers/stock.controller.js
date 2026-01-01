const priceAggregator = require("../services/priceAggregator.service");
const providerManager = require("../services/providerManager.service");

/**
 * Search stocks by query
 * GET /api/stocks/search?q=query
 */
exports.searchStocks = async (req, res) => {
    try {
        const { q: query } = req.query;

        if (!query || query.trim().length < 1) {
            return res.status(400).json({
                status: "error",
                message: "Search query is required"
            });
        }

        const results = await priceAggregator.searchStocks(query.trim());

        return res.json({
            status: "success",
            data: results,
            query: query.trim()
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get stock details with enriched company information
 * GET /api/stocks/:symbol
 */
exports.getStockDetails = async (req, res) => {
    try {
        const { symbol } = req.params;

        if (!symbol) {
            return res.status(400).json({
                status: "error",
                message: "Stock symbol is required"
            });
        }

        // Get quote with enriched data
        const quote = await priceAggregator.getAggregatedQuote(symbol.toUpperCase());

        if (!quote) {
            return res.status(404).json({
                status: "error",
                message: `Stock data not found for symbol: ${symbol}`
            });
        }

        // Get company profile for additional details
        let companyProfile = null;
        try {
            companyProfile = await providerManager.getCompanyProfile(symbol.toUpperCase());
        } catch (profileError) {
            console.warn(`Could not fetch company profile for ${symbol}:`, profileError.message);
        }

        // Combine quote and profile data
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
            
            // Additional company details if available
            ...(companyProfile && {
                industry: companyProfile.industry,
                sector: companyProfile.sector,
                country: companyProfile.country,
                description: companyProfile.description,
                website: companyProfile.website,
                employees: companyProfile.employees
            })
        };

        return res.json({
            status: "success",
            data: stockDetails
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get price comparison data
 * GET /api/stocks/:symbol/prices
 */
exports.getPriceComparison = async (req, res) => {
    try {
        const { symbol } = req.params;

        if (!symbol) {
            return res.status(400).json({
                status: "error",
                message: "Stock symbol is required"
            });
        }

        const priceData = await priceAggregator.getPriceComparison(symbol.toUpperCase());

        return res.json({
            status: "success",
            data: priceData
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get simple quote for a stock
 * GET /api/stocks/:symbol/quote
 */
exports.getQuote = async (req, res) => {
    try {
        const { symbol } = req.params;

        if (!symbol) {
            return res.status(400).json({
                status: "error",
                message: "Stock symbol is required"
            });
        }

        const quote = await providerManager.getQuote(symbol.toUpperCase());

        if (!quote) {
            return res.status(404).json({
                status: "error",
                message: `Quote not found for symbol: ${symbol}`
            });
        }

        return res.json({
            status: "success",
            data: quote
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get popular stocks
 * GET /api/stocks/popular
 */
exports.getPopularStocks = async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        // Get popular stocks from provider
        const popularStocks = [];
        
        // Try to get from providers
        const providers = providerManager.providers;
        
        for (const provider of providers) {
            if (provider.status === 'disabled') continue;
            
            try {
                if (provider.adapter.getPopularStocks) {
                    const stocks = await provider.adapter.getPopularStocks();
                    if (stocks && stocks.length > 0) {
                        popularStocks.push(...stocks.slice(0, parseInt(limit)));
                        break; // Use first successful provider
                    }
                }
            } catch (error) {
                console.warn(`${provider.name} failed for popular stocks:`, error.message);
                continue;
            }
        }

        // Fallback to default popular stocks if no provider worked
        if (popularStocks.length === 0) {
            const defaultSymbols = [
                'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
                'META', 'NVDA', 'JPM', 'V', 'WMT',
                'DIS', 'NFLX', 'ADBE', 'CRM', 'ORCL',
                'SPY', 'QQQ', 'VOO', 'VTI', 'IVV'
            ];

            for (const symbol of defaultSymbols.slice(0, parseInt(limit))) {
                try {
                    const quote = await providerManager.getQuote(symbol);
                    if (quote) {
                        popularStocks.push(quote);
                    }
                } catch (error) {
                    console.warn(`Failed to get quote for ${symbol}:`, error.message);
                }
            }
        }

        // Enrich with company names
        const enrichedStocks = [];
        for (const stock of popularStocks) {
            if (!stock.name || stock.name === stock.symbol || stock.name === null || stock.name.trim() === "") {
                try {
                    const profile = await providerManager.getCompanyProfile(stock.symbol);
                    if (profile && profile.name) {
                        enrichedStocks.push({
                            ...stock,
                            name: profile.name,
                            exchange: profile.exchange || stock.exchange
                        });
                    } else {
                        enrichedStocks.push(stock);
                    }
                } catch (profileError) {
                    enrichedStocks.push(stock);
                }
            } else {
                enrichedStocks.push(stock);
            }
        }

        return res.json({
            status: "success",
            data: enrichedStocks,
            count: enrichedStocks.length
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};