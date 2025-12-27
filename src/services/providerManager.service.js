const FinnhubAdapter = require("./adapters/finnhubAdapter");
const AlphaVantageAdapter = require("./adapters/alphaVantageAdapter");
const TwelveDataAdapter = require("./adapters/twelveDataAdapter");
const { getCache, setCache } = require("../config/redis");

/**
 * Provider Manager Service
 * Handles intelligent provider fallback and eliminates parallel fetching
 * Priority: Finnhub → TwelveData → AlphaVantage → Cache
 */
class ProviderManagerService {
    constructor() {
        // Provider priority order (primary to tertiary)
        this.providers = [
            {
                name: "finnhub",
                adapter: new FinnhubAdapter(process.env.FINNHUB_API_KEY),
                priority: 1,
                status: "healthy",
                healthScore: 1.0,
                lastError: null,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                responseTimeSum: 0,
                responseTimeCount: 0,
                errorCount: 0,
                successCount: 0
            },
            {
                name: "twelvedata",
                adapter: new TwelveDataAdapter(process.env.TWELVEDATA_API_KEY),
                priority: 2,
                status: "healthy",
                healthScore: 1.0,
                lastError: null,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                responseTimeSum: 0,
                responseTimeCount: 0,
                errorCount: 0,
                successCount: 0
            },
            {
                name: "alphavantage",
                adapter: new AlphaVantageAdapter(process.env.ALPHAVANTAGE_API_KEY),
                priority: 3,
                status: "healthy",
                healthScore: 1.0,
                lastError: null,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                responseTimeSum: 0,
                responseTimeCount: 0,
                errorCount: 0,
                successCount: 0
            }
        ];

        // Cache TTL configurations (in seconds)
        this.cacheTTL = {
            quote: 300,        // 5 minutes for real-time quotes
            search: 1800,      // 30 minutes for search results
            profile: 86400,    // 24 hours for company profiles
            monitoring: 600    // 10 minutes for monitoring data
        };
    }

    /**
     * Get stock quote with intelligent provider fallback
     * @param {String} symbol - Stock symbol
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Stock quote with metadata
     */
    async getQuote(symbol, options = {}) {
        const cacheKey = `quote:${symbol}`;
        const startTime = Date.now();

        try {
            // Check cache first
            const cached = await getCache(cacheKey);
            if (cached && !options.skipCache) {
                console.log(`✅ Cache hit for quote ${symbol}`);
                return this._addMetadata(cached, {
                    provider: cached.provider || "cache",
                    cached: true,
                    cacheAge: Math.floor((Date.now() - new Date(cached.timestamp).getTime()) / 1000),
                    staleness: this._calculateStaleness(cached.timestamp, this.cacheTTL.quote)
                });
            }

            // Try providers in priority order
            const availableProviders = this._getAvailableProviders();
            let lastError = null;
            let fallbackUsed = false;

            for (const provider of availableProviders) {
                try {
                    console.log(`🔄 Trying ${provider.name} for quote ${symbol}`);
                    const requestStart = Date.now();
                    
                    const quote = await Promise.race([
                        provider.adapter.getQuote(symbol),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Request timeout')), 10000)
                        )
                    ]);

                    const responseTime = Date.now() - requestStart;
                    
                    if (quote && quote.price) {
                        // Record success metrics
                        this._recordProviderMetrics(provider.name, responseTime, true);
                        
                        // Normalize and cache the response
                        const normalizedQuote = this._normalizeQuoteResponse(quote, provider.name);
                        await setCache(cacheKey, normalizedQuote, this.cacheTTL.quote);
                        
                        console.log(`✅ Successfully got quote for ${symbol} from ${provider.name} in ${responseTime}ms`);
                        
                        return this._addMetadata(normalizedQuote, {
                            provider: provider.name,
                            cached: false,
                            cacheAge: 0,
                            staleness: "fresh",
                            fallbackUsed,
                            responseTime
                        });
                    }
                } catch (error) {
                    const responseTime = Date.now() - requestStart;
                    lastError = error;
                    fallbackUsed = true;
                    
                    // Record failure metrics
                    this._recordProviderMetrics(provider.name, responseTime, false);
                    
                    console.warn(`⚠️ ${provider.name} failed for quote ${symbol}: ${error.message}`);
                    
                    // Check if this is a rate limiting error
                    if (error.message.includes('429') || error.message.includes('rate limit')) {
                        console.log(`🚫 Rate limiting detected on ${provider.name}, switching to next provider`);
                        continue;
                    }
                    
                    // For other errors, continue to next provider
                    continue;
                }
            }

            // All providers failed, try to serve stale cache data
            if (cached) {
                console.log(`⚠️ All providers failed for ${symbol}, serving stale cache data`);
                return this._addMetadata(cached, {
                    provider: cached.provider || "cache",
                    cached: true,
                    cacheAge: Math.floor((Date.now() - new Date(cached.timestamp).getTime()) / 1000),
                    staleness: "stale",
                    fallbackUsed: true,
                    warning: "Data may be outdated due to provider issues"
                });
            }

            // No cache available, throw error
            throw new Error(`All providers failed for ${symbol}. Last error: ${lastError?.message || 'Unknown error'}`);

        } catch (error) {
            console.error(`❌ Failed to get quote for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Search for stocks with provider fallback
     * @param {String} query - Search query
     * @param {Object} options - Request options
     * @returns {Promise<Array>} Search results
     */
    async searchSymbol(query, options = {}) {
        const cacheKey = `search:${query.toLowerCase()}`;

        try {
            // Check cache first
            const cached = await getCache(cacheKey);
            if (cached && !options.skipCache) {
                console.log(`✅ Cache hit for search "${query}"`);
                return cached.map(result => this._addMetadata(result, {
                    provider: result.provider || "cache",
                    cached: true,
                    staleness: this._calculateStaleness(result.timestamp, this.cacheTTL.search)
                }));
            }

            // Try providers in priority order
            const availableProviders = this._getAvailableProviders();
            let lastError = null;

            for (const provider of availableProviders) {
                try {
                    console.log(`🔍 Searching "${query}" with ${provider.name}`);
                    const requestStart = Date.now();
                    
                    const results = await Promise.race([
                        provider.adapter.searchSymbol(query),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Search timeout')), 15000)
                        )
                    ]);

                    const responseTime = Date.now() - requestStart;
                    
                    if (results && Array.isArray(results) && results.length > 0) {
                        // Record success metrics
                        this._recordProviderMetrics(provider.name, responseTime, true);
                        
                        // Normalize and cache results
                        const normalizedResults = results.map(result => 
                            this._normalizeSearchResponse(result, provider.name)
                        );
                        
                        await setCache(cacheKey, normalizedResults, this.cacheTTL.search);
                        
                        console.log(`✅ Found ${results.length} results for "${query}" from ${provider.name}`);
                        
                        return normalizedResults.map(result => this._addMetadata(result, {
                            provider: provider.name,
                            cached: false,
                            staleness: "fresh",
                            responseTime
                        }));
                    }
                } catch (error) {
                    const responseTime = Date.now() - requestStart;
                    lastError = error;
                    
                    // Record failure metrics
                    this._recordProviderMetrics(provider.name, responseTime, false);
                    
                    console.warn(`⚠️ ${provider.name} search failed for "${query}": ${error.message}`);
                    continue;
                }
            }

            // All providers failed, return empty array or cached results
            if (cached) {
                console.log(`⚠️ All providers failed for search "${query}", serving stale cache`);
                return cached.map(result => this._addMetadata(result, {
                    provider: result.provider || "cache",
                    cached: true,
                    staleness: "stale",
                    warning: "Search results may be outdated"
                }));
            }

            console.log(`❌ No search results found for "${query}"`);
            return [];

        } catch (error) {
            console.error(`❌ Search failed for "${query}":`, error.message);
            return [];
        }
    }

    /**
     * Get company profile with provider fallback
     * @param {String} symbol - Stock symbol
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Company profile
     */
    async getCompanyProfile(symbol, options = {}) {
        const cacheKey = `profile:${symbol}`;

        try {
            // Check cache first (24-hour TTL for profiles)
            const cached = await getCache(cacheKey);
            if (cached && !options.skipCache) {
                console.log(`✅ Cache hit for profile ${symbol}`);
                return this._addMetadata(cached, {
                    provider: cached.provider || "cache",
                    cached: true,
                    staleness: this._calculateStaleness(cached.timestamp, this.cacheTTL.profile)
                });
            }

            // Try providers in priority order (Finnhub is best for company profiles)
            const availableProviders = this._getAvailableProviders();
            let lastError = null;

            for (const provider of availableProviders) {
                try {
                    console.log(`🏢 Getting profile for ${symbol} from ${provider.name}`);
                    const requestStart = Date.now();
                    
                    const profile = await Promise.race([
                        provider.adapter.getCompanyProfile(symbol),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Profile timeout')), 10000)
                        )
                    ]);

                    const responseTime = Date.now() - requestStart;
                    
                    if (profile && (profile.name || profile.description)) {
                        // Record success metrics
                        this._recordProviderMetrics(provider.name, responseTime, true);
                        
                        // Normalize and cache profile
                        const normalizedProfile = this._normalizeProfileResponse(profile, provider.name);
                        await setCache(cacheKey, normalizedProfile, this.cacheTTL.profile);
                        
                        console.log(`✅ Got profile for ${symbol} from ${provider.name}`);
                        
                        return this._addMetadata(normalizedProfile, {
                            provider: provider.name,
                            cached: false,
                            staleness: "fresh",
                            responseTime
                        });
                    }
                } catch (error) {
                    const responseTime = Date.now() - requestStart;
                    lastError = error;
                    
                    // Record failure metrics
                    this._recordProviderMetrics(provider.name, responseTime, false);
                    
                    console.warn(`⚠️ ${provider.name} profile failed for ${symbol}: ${error.message}`);
                    continue;
                }
            }

            // All providers failed, try stale cache
            if (cached) {
                console.log(`⚠️ All providers failed for profile ${symbol}, serving stale cache`);
                return this._addMetadata(cached, {
                    provider: cached.provider || "cache",
                    cached: true,
                    staleness: "stale",
                    warning: "Profile data may be outdated"
                });
            }

            throw new Error(`No profile data available for ${symbol}`);

        } catch (error) {
            console.error(`❌ Failed to get profile for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Get available providers sorted by health and priority
     * @returns {Array} Available providers
     */
    _getAvailableProviders() {
        return this.providers
            .filter(provider => provider.status !== "disabled")
            .sort((a, b) => {
                // Sort by health score first, then by priority
                if (a.healthScore !== b.healthScore) {
                    return b.healthScore - a.healthScore;
                }
                return a.priority - b.priority;
            });
    }

    /**
     * Record provider metrics for health tracking
     * @param {String} providerName - Provider name
     * @param {Number} responseTime - Response time in ms
     * @param {Boolean} success - Whether request was successful
     */
    _recordProviderMetrics(providerName, responseTime, success) {
        const provider = this.providers.find(p => p.name === providerName);
        if (!provider) return;

        // Update response time metrics
        provider.responseTimeSum += responseTime;
        provider.responseTimeCount++;

        // Update success/error counts
        if (success) {
            provider.successCount++;
            provider.consecutiveSuccesses++;
            provider.consecutiveFailures = 0;
            
            // Gradually improve health score on success
            if (provider.healthScore < 1.0) {
                provider.healthScore = Math.min(1.0, provider.healthScore + 0.1);
            }
        } else {
            provider.errorCount++;
            provider.consecutiveFailures++;
            provider.consecutiveSuccesses = 0;
            provider.lastError = new Date().toISOString();
            
            // Degrade health score on failure
            provider.healthScore = Math.max(0.0, provider.healthScore - 0.2);
        }

        // Update provider status based on health score
        if (provider.healthScore >= 0.8) {
            provider.status = "healthy";
        } else if (provider.healthScore >= 0.5) {
            provider.status = "degraded";
        } else {
            provider.status = "failing";
        }

        console.log(`📊 ${providerName} metrics: health=${provider.healthScore.toFixed(2)}, status=${provider.status}, consecutive_failures=${provider.consecutiveFailures}`);
    }

    /**
     * Calculate data staleness
     * @param {String} timestamp - Data timestamp
     * @param {Number} maxAge - Maximum age in seconds
     * @returns {String} Staleness indicator
     */
    _calculateStaleness(timestamp, maxAge) {
        if (!timestamp) return "unknown";
        
        const age = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        
        if (age <= maxAge) return "fresh";
        if (age <= maxAge * 2) return "stale";
        return "very_stale";
    }

    /**
     * Add metadata to response
     * @param {Object} data - Response data
     * @param {Object} metadata - Metadata to add
     * @returns {Object} Data with metadata
     */
    _addMetadata(data, metadata) {
        return {
            ...data,
            metadata: {
                timestamp: new Date().toISOString(),
                confidence: this._calculateConfidence(metadata),
                ...metadata
            }
        };
    }

    /**
     * Calculate confidence level based on metadata
     * @param {Object} metadata - Response metadata
     * @returns {String} Confidence level
     */
    _calculateConfidence(metadata) {
        if (metadata.staleness === "very_stale") return "low";
        if (metadata.staleness === "stale" || metadata.fallbackUsed) return "medium";
        return "high";
    }

    /**
     * Normalize quote response from different providers
     * @param {Object} quote - Raw quote data
     * @param {String} providerName - Provider name
     * @returns {Object} Normalized quote
     */
    _normalizeQuoteResponse(quote, providerName) {
        return {
            symbol: quote.symbol,
            price: quote.price || quote.ask || quote.last,
            name: quote.name || quote.displayName || quote.symbol,
            exchange: quote.exchange || "Unknown",
            currency: quote.currency || "USD",
            change: quote.change || quote.changeAmount || null,
            changePercent: quote.changePercent || quote.changePercentage || null,
            volume: quote.volume || null,
            timestamp: new Date().toISOString(),
            provider: providerName
        };
    }

    /**
     * Normalize search response from different providers
     * @param {Object} result - Raw search result
     * @param {String} providerName - Provider name
     * @returns {Object} Normalized search result
     */
    _normalizeSearchResponse(result, providerName) {
        return {
            symbol: result.symbol,
            name: result.name || result.displayName || result.symbol,
            type: result.type || "stock",
            exchange: result.exchange || "Unknown",
            currency: result.currency || "USD",
            timestamp: new Date().toISOString(),
            provider: providerName
        };
    }

    /**
     * Normalize profile response from different providers
     * @param {Object} profile - Raw profile data
     * @param {String} providerName - Provider name
     * @returns {Object} Normalized profile
     */
    _normalizeProfileResponse(profile, providerName) {
        return {
            symbol: profile.symbol || profile.ticker,
            name: profile.name || profile.companyName,
            description: profile.description || profile.businessSummary,
            industry: profile.industry || profile.sector,
            sector: profile.sector || profile.industry,
            exchange: profile.exchange || "Unknown",
            country: profile.country || "Unknown",
            website: profile.website || profile.weburl,
            employees: profile.employees || profile.fullTimeEmployees,
            marketCap: profile.marketCap || profile.marketCapitalization,
            timestamp: new Date().toISOString(),
            provider: providerName
        };
    }

    /**
     * Get provider health statistics
     * @returns {Object} Provider health stats
     */
    getProviderHealth() {
        return this.providers.map(provider => ({
            name: provider.name,
            status: provider.status,
            healthScore: provider.healthScore,
            priority: provider.priority,
            responseTime: {
                average: provider.responseTimeCount > 0 
                    ? Math.round(provider.responseTimeSum / provider.responseTimeCount)
                    : 0,
                samples: provider.responseTimeCount
            },
            errorRate: provider.successCount + provider.errorCount > 0
                ? provider.errorCount / (provider.successCount + provider.errorCount)
                : 0,
            consecutiveFailures: provider.consecutiveFailures,
            consecutiveSuccesses: provider.consecutiveSuccesses,
            lastError: provider.lastError,
            totalRequests: provider.successCount + provider.errorCount,
            successCount: provider.successCount,
            errorCount: provider.errorCount
        }));
    }

    /**
     * Reset provider health metrics
     * @param {String} providerName - Provider name to reset
     */
    resetProviderHealth(providerName) {
        const provider = this.providers.find(p => p.name === providerName);
        if (provider) {
            provider.healthScore = 1.0;
            provider.status = "healthy";
            provider.consecutiveFailures = 0;
            provider.consecutiveSuccesses = 0;
            provider.responseTimeSum = 0;
            provider.responseTimeCount = 0;
            provider.errorCount = 0;
            provider.successCount = 0;
            provider.lastError = null;
            console.log(`🔄 Reset health metrics for ${providerName}`);
        }
    }

    /**
     * Disable a provider temporarily
     * @param {String} providerName - Provider name to disable
     */
    disableProvider(providerName) {
        const provider = this.providers.find(p => p.name === providerName);
        if (provider) {
            provider.status = "disabled";
            console.log(`🚫 Disabled provider ${providerName}`);
        }
    }

    /**
     * Enable a provider
     * @param {String} providerName - Provider name to enable
     */
    enableProvider(providerName) {
        const provider = this.providers.find(p => p.name === providerName);
        if (provider) {
            provider.status = "healthy";
            provider.healthScore = 1.0;
            console.log(`✅ Enabled provider ${providerName}`);
        }
    }
}

module.exports = new ProviderManagerService();