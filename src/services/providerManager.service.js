const FinnhubAdapter = require("./adapters/finnhubAdapter");
const AlphaVantageAdapter = require("./adapters/alphaVantageAdapter");
const TwelveDataAdapter = require("./adapters/twelveDataAdapter");
const MarketStackAdapter = require("./adapters/marketStackAdapter");
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
            },
            {
                name: "marketstack",
                adapter: new MarketStackAdapter(process.env.MARKETSTACK_API_KEY),
                priority: 4,
                status: "healthy",
                healthScore: 1.0,
                lastError: null,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                responseTimeSum: 0,
                responseTimeCount: 0,
                errorCount: 0,
                successCount: 0,
                region: "nigeria" // Special flag for Nigerian stocks
            }
        ];

        // Cache TTL configurations (in seconds)
        this.cacheTTL = {
            quote: 300,        // 5 minutes for real-time quotes
            search: 1800,      // 30 minutes for search results
            profile: 86400,    // 24 hours for company profiles
            monitoring: 600,   // 10 minutes for monitoring data
            nigerianStocks: 1800,  // 30 minutes for Nigerian stocks (conserve API calls)
            usStocks: 300,     // 5 minutes for US stocks
            recommendations: 900  // 15 minutes for recommendation candidates
        };

        // Request throttling for rate-limited providers
        this.throttleConfig = {
            marketstack: {
                lastRequest: 0,
                minInterval: 2000, // 2 seconds between requests
                pausedUntil: 0     // Timestamp when provider is paused until
            }
        };

        // Fallback Nigerian stocks (used when API fails) - Using confirmed symbols
        this.fallbackNigerianStocks = [
            { symbol: "DANGCEM", name: "Dangote Cement Plc", exchange: "NGX", currency: "NGN", sector: "materials" },
            { symbol: "DANGSUGAR", name: "Dangote Sugar Refinery Plc", exchange: "NGX", currency: "NGN", sector: "consumer" },
            { symbol: "NAHCO", name: "Nigerian Aviation Handling Co Plc", exchange: "NGX", currency: "NGN", sector: "transport" },
            { symbol: "ENAMELWA", name: "Nigerian Enamelware Co Plc", exchange: "NGX", currency: "NGN", sector: "consumer" },
            { symbol: "MTNN", name: "MTN Nigeria Communications Plc", exchange: "NGX", currency: "NGN", sector: "tech" },
            { symbol: "ZENITHBANK", name: "Zenith Bank Plc", exchange: "NGX", currency: "NGN", sector: "finance" },
            { symbol: "GTCO", name: "Guaranty Trust Holding Company Plc", exchange: "NGX", currency: "NGN", sector: "finance" },
            { symbol: "UBA", name: "United Bank for Africa Plc", exchange: "NGX", currency: "NGN", sector: "finance" },
            { symbol: "FBNH", name: "FBN Holdings Plc", exchange: "NGX", currency: "NGN", sector: "finance" },
            { symbol: "ACCESSCORP", name: "Access Holdings Plc", exchange: "NGX", currency: "NGN", sector: "finance" }
        ];
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
     * Throttle requests to rate-limited providers
     * @param {String} providerName - Provider to throttle
     * @returns {Promise} Resolves when safe to make request
     */
    async throttleRequest(providerName) {
        const config = this.throttleConfig[providerName];
        if (!config) return;

        // Check if provider is paused due to rate limiting
        if (config.pausedUntil > Date.now()) {
            const remainingPause = Math.ceil((config.pausedUntil - Date.now()) / 1000);
            throw new Error(`Provider ${providerName} is paused for ${remainingPause} more seconds due to rate limiting`);
        }

        // Check if we need to wait due to throttling
        const timeSinceLastRequest = Date.now() - config.lastRequest;
        if (timeSinceLastRequest < config.minInterval) {
            const waitTime = config.minInterval - timeSinceLastRequest;
            console.log(`⏳ Throttling ${providerName} request, waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        config.lastRequest = Date.now();
    }

    /**
     * Pause a provider due to rate limiting
     * @param {String} providerName - Provider to pause
     * @param {Number} duration - Pause duration in milliseconds
     */
    pauseProvider(providerName, duration = 3600000) { // Default 1 hour
        const config = this.throttleConfig[providerName];
        if (config) {
            config.pausedUntil = Date.now() + duration;
            console.log(`🚫 Paused ${providerName} for ${duration/1000} seconds due to rate limiting`);
        }
    }

    /**
     * Get Nigerian stocks from MarketStack
     * @param {Object} options - Request options
     * @returns {Promise<Array>} Nigerian stocks
     */
    async getNigerianStocks(options = {}) {
        try {
            const marketStackProvider = this.providers.find(p => p.name === "marketstack");
            
            if (!marketStackProvider || marketStackProvider.status === "disabled") {
                console.warn("⚠️ MarketStack provider not available for Nigerian stocks");
                return [];
            }

            console.log("🇳🇬 Fetching Nigerian stocks from MarketStack...");
            const requestStart = Date.now();
            
            const stocks = await marketStackProvider.adapter.getPopularStocks();
            const responseTime = Date.now() - requestStart;
            
            if (stocks && stocks.length > 0) {
                // Record success metrics
                this._recordProviderMetrics("marketstack", responseTime, true);
                
                console.log(`✅ Got ${stocks.length} Nigerian stocks from MarketStack`);
                return stocks.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    cached: false,
                    staleness: "fresh",
                    responseTime
                }));
            }
            
            return [];
        } catch (error) {
            console.error("❌ Failed to get Nigerian stocks:", error.message);
            this._recordProviderMetrics("marketstack", 0, false);
            return [];
        }
    }

    /**
     * Get Nigerian stocks from MarketStack with fallback
     * @param {Object} options - Request options
     * @returns {Promise<Array>} Nigerian stocks
     */
    async getNigerianStocks(options = {}) {
        const cacheKey = 'nigerian_stocks:popular';
        
        try {
            // Check cache first
            const cached = await getCache(cacheKey);
            if (cached && !options.skipCache) {
                console.log("✅ Cache hit for Nigerian stocks");
                return cached.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    cached: true,
                    staleness: this._calculateStaleness(stock.timestamp, this.cacheTTL.nigerianStocks)
                }));
            }

            const marketStackProvider = this.providers.find(p => p.name === "marketstack");
            
            if (!marketStackProvider || marketStackProvider.status === "disabled") {
                console.warn("⚠️ MarketStack provider not available, using fallback Nigerian stocks");
                return this.getFallbackNigerianStocks();
            }

            // Throttle request to avoid rate limiting
            await this.throttleRequest('marketstack');

            console.log("🇳🇬 Fetching Nigerian stocks from MarketStack...");
            const requestStart = Date.now();
            
            const stocks = await marketStackProvider.adapter.getPopularStocks();
            const responseTime = Date.now() - requestStart;
            
            if (stocks && stocks.length > 0) {
                // Record success metrics
                this._recordProviderMetrics("marketstack", responseTime, true);
                
                // Cache the results
                await setCache(cacheKey, stocks, this.cacheTTL.nigerianStocks);
                
                console.log(`✅ Got ${stocks.length} Nigerian stocks from MarketStack`);
                return stocks.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    cached: false,
                    staleness: "fresh",
                    responseTime
                }));
            }
            
            // No stocks returned, use fallback
            console.warn("⚠️ MarketStack returned no Nigerian stocks, using fallback");
            return this.getFallbackNigerianStocks();
            
        } catch (error) {
            console.error("❌ Failed to get Nigerian stocks:", error.message);
            
            // Handle rate limiting specifically
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                this.pauseProvider('marketstack', 3600000); // Pause for 1 hour
                console.log("🚫 MarketStack rate limited, paused for 1 hour");
            }
            
            this._recordProviderMetrics("marketstack", 0, false);
            
            // Try to return cached data even if stale
            const staleCache = await getCache(cacheKey);
            if (staleCache) {
                console.log("⚠️ Using stale cached Nigerian stocks due to API error");
                return staleCache.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    cached: true,
                    staleness: "stale",
                    warning: "Data may be outdated due to API issues"
                }));
            }
            
            // Final fallback to static data
            console.log("⚠️ Using fallback Nigerian stocks due to API failure");
            return this.getFallbackNigerianStocks();
        }
    }

    /**
     * Get fallback Nigerian stocks (static data)
     * @returns {Array} Fallback Nigerian stocks
     */
    getFallbackNigerianStocks() {
        return this.fallbackNigerianStocks.map(stock => this._addMetadata({
            ...stock,
            price: 100, // Placeholder price
            change: 0,
            changePercent: 0,
            volume: 1000000,
            timestamp: new Date().toISOString()
        }, {
            provider: "fallback",
            region: "nigeria",
            cached: false,
            staleness: "static",
            warning: "Using static fallback data"
        }));
    }

    /**
     * Get Nigerian stocks by sector
     * @param {String} sector - Sector name
     * @returns {Promise<Array>} Nigerian sector stocks
     */
    async getNigerianStocksBySector(sector) {
        try {
            const marketStackProvider = this.providers.find(p => p.name === "marketstack");
            
            if (!marketStackProvider || marketStackProvider.status === "disabled") {
                console.warn("⚠️ MarketStack provider not available for Nigerian sector stocks");
                return [];
            }

            console.log(`🇳🇬 Fetching Nigerian ${sector} stocks from MarketStack...`);
            const requestStart = Date.now();
            
            const stocks = await marketStackProvider.adapter.getStocksBySector(sector);
            const responseTime = Date.now() - requestStart;
            
            if (stocks && stocks.length > 0) {
                // Record success metrics
                this._recordProviderMetrics("marketstack", responseTime, true);
                
                console.log(`✅ Got ${stocks.length} Nigerian ${sector} stocks from MarketStack`);
                return stocks.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    sector: sector,
                    cached: false,
                    staleness: "fresh",
                    responseTime
                }));
            }
            
            return [];
        } catch (error) {
            console.error(`❌ Failed to get Nigerian ${sector} stocks:`, error.message);
            this._recordProviderMetrics("marketstack", 0, false);
            return [];
        }
    }

    /**
     * Get Nigerian stocks by sector with fallback
     * @param {String} sector - Sector name
     * @returns {Promise<Array>} Nigerian sector stocks
     */
    async getNigerianStocksBySector(sector) {
        const cacheKey = `nigerian_stocks:sector:${sector}`;
        
        try {
            // Check cache first
            const cached = await getCache(cacheKey);
            if (cached) {
                console.log(`✅ Cache hit for Nigerian ${sector} stocks`);
                return cached.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    sector: sector,
                    cached: true,
                    staleness: this._calculateStaleness(stock.timestamp, this.cacheTTL.nigerianStocks)
                }));
            }

            const marketStackProvider = this.providers.find(p => p.name === "marketstack");
            
            if (!marketStackProvider || marketStackProvider.status === "disabled") {
                console.warn(`⚠️ MarketStack provider not available for ${sector}, using fallback`);
                return this.getFallbackNigerianStocksBySector(sector);
            }

            // Throttle request
            await this.throttleRequest('marketstack');

            console.log(`🇳🇬 Fetching Nigerian ${sector} stocks from MarketStack...`);
            const requestStart = Date.now();
            
            const stocks = await marketStackProvider.adapter.getStocksBySector(sector);
            const responseTime = Date.now() - requestStart;
            
            if (stocks && stocks.length > 0) {
                // Record success metrics
                this._recordProviderMetrics("marketstack", responseTime, true);
                
                // Cache the results
                await setCache(cacheKey, stocks, this.cacheTTL.nigerianStocks);
                
                console.log(`✅ Got ${stocks.length} Nigerian ${sector} stocks from MarketStack`);
                return stocks.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    sector: sector,
                    cached: false,
                    staleness: "fresh",
                    responseTime
                }));
            }
            
            // No stocks returned, use fallback
            return this.getFallbackNigerianStocksBySector(sector);
            
        } catch (error) {
            console.error(`❌ Failed to get Nigerian ${sector} stocks:`, error.message);
            
            // Handle rate limiting
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                this.pauseProvider('marketstack', 3600000);
            }
            
            this._recordProviderMetrics("marketstack", 0, false);
            
            // Try stale cache
            const staleCache = await getCache(cacheKey);
            if (staleCache) {
                console.log(`⚠️ Using stale cached Nigerian ${sector} stocks`);
                return staleCache.map(stock => this._addMetadata(stock, {
                    provider: "marketstack",
                    region: "nigeria",
                    sector: sector,
                    cached: true,
                    staleness: "stale"
                }));
            }
            
            // Final fallback
            return this.getFallbackNigerianStocksBySector(sector);
        }
    }

    /**
     * Get fallback Nigerian stocks by sector
     * @param {String} sector - Sector name
     * @returns {Array} Fallback sector stocks
     */
    getFallbackNigerianStocksBySector(sector) {
        const sectorStocks = this.fallbackNigerianStocks.filter(stock => 
            stock.sector.toLowerCase() === sector.toLowerCase()
        );
        
        return sectorStocks.map(stock => this._addMetadata({
            ...stock,
            price: 100,
            change: 0,
            changePercent: 0,
            volume: 1000000,
            timestamp: new Date().toISOString()
        }, {
            provider: "fallback",
            region: "nigeria",
            sector: sector,
            cached: false,
            staleness: "static"
        }));
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