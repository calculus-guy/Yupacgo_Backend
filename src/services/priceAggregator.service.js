const providerManager = require("./providerManager.service");
const smartCache = require("./smartCache.service");
const stockNameEnrichment = require("./stockNameEnrichment.service");

/**
 * Price Aggregator Service (Optimized)
 * Now uses Provider Manager for intelligent fallback instead of parallel fetching
 * Eliminates redundant price comparison while maintaining backward compatibility
 */
class PriceAggregatorService {
    constructor() {
        console.log("✅ Price Aggregator Service initialized with Provider Manager integration");
    }

    /**
     * Get single quote (now uses Provider Manager instead of comparison)
     * @param {String} symbol - Stock symbol
     * @returns {Promise<Object>} Single provider quote with metadata
     */
    async getPriceComparison(symbol) {
        try {
            console.log(`🔄 Getting optimized quote for ${symbol}...`);

            // Use Provider Manager for intelligent single-provider fetching
            const quote = await providerManager.getQuote(symbol);

            if (!quote) {
                throw new Error(`No quote data available for ${symbol}`);
            }

            // Transform to maintain backward compatibility with existing API
            const result = {
                symbol: symbol,
                name: quote.name || symbol,
                exchange: quote.exchange || "Unknown",
                price: quote.price,
                priceType: quote.priceType || "last",
                provider: quote.metadata?.provider || "unknown",
                confidence: quote.metadata?.confidence || "high",
                timestamp: quote.timestamp || new Date().toISOString(),
                
                // Maintain backward compatibility
                prices: [quote], // Single provider instead of multiple
                best: {
                    provider: quote.metadata?.provider || "unknown",
                    price: quote.price,
                    priceType: quote.priceType,
                    timestamp: quote.timestamp
                },
                priceVariance: 0, // No variance with single provider
                
                // Enhanced metadata
                metadata: {
                    ...quote.metadata,
                    optimized: true,
                    singleProvider: true,
                    eliminatedParallelFetching: true
                }
            };

            console.log(`✅ Optimized quote for ${symbol} from ${quote.metadata?.provider}`);
            return result;

        } catch (error) {
            console.error("Error in getPriceComparison:", error.message);
            throw error;
        }
    }

    /**
     * Get single aggregated quote (now optimized with Provider Manager)
     * @param {String} symbol - Stock symbol
     * @returns {Promise<Object>} Aggregated quote
     */
    async getAggregatedQuote(symbol) {
        try {
            // Use Provider Manager directly
            const quote = await providerManager.getQuote(symbol);

            if (!quote) {
                throw new Error(`No quote data available for ${symbol}`);
            }

            // Enrich with company name if needed
            let enrichedQuote = quote;
            if (!quote.name || quote.name === symbol || quote.name === null || quote.name.trim() === "") {
                try {
                    const profile = await providerManager.getCompanyProfile(symbol);
                    if (profile && profile.name) {
                        enrichedQuote = {
                            ...quote,
                            name: profile.name,
                            exchange: profile.exchange || quote.exchange
                        };
                    }
                } catch (profileError) {
                    console.warn(`Could not enrich ${symbol} with profile data:`, profileError.message);
                }
            }

            console.log(`✅ Aggregated quote for ${symbol} from ${quote.metadata?.provider}`);
            return enrichedQuote;

        } catch (error) {
            console.error("Error in getAggregatedQuote:", error.message);
            throw error;
        }
    }

    /**
     * Get batch quotes for multiple stocks (optimized)
     * @param {Array<String>} symbols - Array of stock symbols
     * @returns {Promise<Array>} Array of aggregated quotes
     */
    async getBatchAggregatedQuotes(symbols) {
        try {
            console.log(`🔄 Getting batch quotes for ${symbols.length} symbols...`);

            // Process in smaller batches to avoid overwhelming providers
            const batchSize = 5;
            const results = [];

            for (let i = 0; i < symbols.length; i += batchSize) {
                const batch = symbols.slice(i, i + batchSize);
                
                const batchPromises = batch.map(symbol => 
                    providerManager.getQuote(symbol).catch(err => {
                        console.error(`Error fetching quote for ${symbol}:`, err.message);
                        return null;
                    })
                );

                const batchResults = await Promise.all(batchPromises);
                const validResults = batchResults.filter(r => r !== null);
                
                results.push(...validResults);

                // Small delay between batches to be respectful to APIs
                if (i + batchSize < symbols.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // Enrich all results with company names if needed
            const enrichedResults = [];
            for (const quote of results) {
                if (!quote.name || quote.name === quote.symbol || quote.name === null || quote.name.trim() === "") {
                    try {
                        const profile = await providerManager.getCompanyProfile(quote.symbol);
                        if (profile && profile.name) {
                            enrichedResults.push({
                                ...quote,
                                name: profile.name,
                                exchange: profile.exchange || quote.exchange
                            });
                        } else {
                            enrichedResults.push(quote);
                        }
                    } catch (profileError) {
                        enrichedResults.push(quote);
                    }
                } else {
                    enrichedResults.push(quote);
                }
            }

            console.log(`✅ Batch quotes completed: ${enrichedResults.length}/${symbols.length} successful`);
            return enrichedResults;

        } catch (error) {
            console.error("Error in getBatchAggregatedQuotes:", error.message);
            return [];
        }
    }

    /**
     * Search stocks using Provider Manager
     * @param {String} query - Search query
     * @returns {Promise<Array>} Search results
     */
    async searchStocks(query) {
        try {
            console.log(`🔍 Searching for "${query}" using Provider Manager...`);

            // Use Provider Manager for intelligent search with fallback
            const results = await providerManager.searchSymbol(query);

            // Limit results and add source metadata
            const finalResults = results.slice(0, 10).map(result => ({
                ...result,
                source: "provider_manager",
                optimized: true
            }));

            console.log(`✅ Search completed for "${query}": ${finalResults.length} results`);
            return finalResults;

        } catch (error) {
            console.error("Error in searchStocks:", error.message);
            return [];
        }
    }

    /**
     * Get provider health information
     * @returns {Promise<Object>} Provider health data
     */
    async getProviderHealth() {
        return providerManager.getProviderHealth();
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache statistics
     */
    async getCacheStats() {
        return smartCache.getStats();
    }

    /**
     * Warm up cache for popular symbols
     * @param {Array<String>} symbols - Symbols to warm up
     * @returns {Promise<Object>} Warm up results
     */
    async warmUpCache(symbols = []) {
        try {
            const popularSymbols = symbols.length > 0 ? symbols : [
                'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
                'META', 'NVDA', 'JPM', 'V', 'WMT'
            ];

            console.log(`🔥 Warming up cache for ${popularSymbols.length} popular symbols...`);

            const results = {
                total: popularSymbols.length,
                successful: 0,
                failed: 0,
                symbols: {}
            };

            for (const symbol of popularSymbols) {
                try {
                    const quote = await providerManager.getQuote(symbol, { skipCache: true });
                    if (quote) {
                        results.successful++;
                        results.symbols[symbol] = 'success';
                    } else {
                        results.failed++;
                        results.symbols[symbol] = 'no_data';
                    }
                } catch (error) {
                    results.failed++;
                    results.symbols[symbol] = 'error';
                    console.warn(`Failed to warm up ${symbol}:`, error.message);
                }

                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log(`✅ Cache warm-up completed: ${results.successful}/${results.total} successful`);
            return results;

        } catch (error) {
            console.error("Error in warmUpCache:", error.message);
            return { error: error.message };
        }
    }

    /**
     * Clear cache for specific symbols or patterns
     * @param {String|Array} target - Symbol(s) or pattern to clear
     * @returns {Promise<Object>} Clear results
     */
    async clearCache(target) {
        try {
            if (Array.isArray(target)) {
                // Clear multiple symbols
                const results = {};
                for (const symbol of target) {
                    const key = smartCache.generateKey('quote', symbol);
                    results[symbol] = await smartCache.delete(key);
                }
                return results;
            } else if (typeof target === 'string') {
                if (target.includes('*')) {
                    // Clear by pattern - would need implementation in smartCache
                    console.log(`Pattern clearing not yet implemented: ${target}`);
                    return { message: 'Pattern clearing not implemented' };
                } else {
                    // Clear single symbol
                    const key = smartCache.generateKey('quote', target);
                    return await smartCache.delete(key);
                }
            }
        } catch (error) {
            console.error("Error in clearCache:", error.message);
            return { error: error.message };
        }
    }
}

module.exports = new PriceAggregatorService();
