const UserProfile = require("../models/userProfile.models");
const RecommendationSession = require("../models/recommendationSession.models");
const providerManager = require("./providerManager.service");
const smartCache = require("./smartCache.service");
const stockNameEnrichment = require("./stockNameEnrichment.service");

/**
 * API-Driven Recommendation Engine (Optimized)
 * Now uses Provider Manager for intelligent single-provider requests
 * Eliminates parallel fetching to prevent rate limiting
 */
class RecommendationEngineV2 {
    constructor() {
        console.log("✅ Recommendation Engine V2 initialized with Provider Manager integration");
    }

    /**
     * Generate personalized recommendations for a user
     * @param {String} userId - User ID
     * @returns {Promise<Object>} Recommendation session
     */
    async generateRecommendations(userId) {
        try {
            // Get user profile
            const profile = await UserProfile.findOne({ userId });

            if (!profile) {
                throw new Error("User profile not found. Please complete onboarding first.");
            }

            // Fetch stocks from APIs based on profile
            let candidateStocks = await this.fetchCandidateStocks(profile);

            if (candidateStocks.length === 0) {
                throw new Error("No stocks available from APIs at the moment");
            }

            // Enrich stocks with company names using Provider Manager
            candidateStocks = await this.enrichStockNames(candidateStocks);

            // Filter stocks by profile constraints
            const filteredStocks = this.filterStocksByProfile(candidateStocks, profile);

            if (filteredStocks.length === 0) {
                throw new Error("No stocks match your profile criteria");
            }

            // Score and rank stocks
            const scoredStocks = filteredStocks.map(stock => ({
                stock,
                score: this.calculateMatchScore(stock, profile)
            }));

            // Sort by score (descending)
            scoredStocks.sort((a, b) => b.score.total - a.score.total);

            // Select top recommendations based on diversification level
            const recommendationCount = Math.min(
                profile.diversificationLevel.maxAssets,
                Math.max(
                    profile.diversificationLevel.minAssets,
                    scoredStocks.length
                )
            );

            const topStocks = scoredStocks.slice(0, recommendationCount);

            // Build recommendations
            const recommendations = topStocks.map((item, index) => {
                const allocation = this.calculateAllocation(
                    index,
                    recommendationCount,
                    profile.riskLevel
                );

                return {
                    symbol: item.stock.symbol,
                    name: item.stock.name || item.stock.symbol,
                    exchange: item.stock.exchange,
                    matchScore: item.score.total,
                    matchReasons: item.score.reasons,
                    recommendedPrice: item.stock.price,
                    currency: item.stock.currency || "USD",
                    suggestedAllocation: allocation,
                    suggestedPositionSize: this.calculatePositionSize(
                        allocation,
                        profile.budgetConstraints.minPositionSize
                    ),
                    matchedTags: item.score.matchedTags,
                    priceChange: item.stock.change,
                    priceChangePercent: item.stock.changePercent,
                    provider: item.stock.provider
                };
            });

            // Create recommendation session
            const session = await RecommendationSession.create({
                userId,
                profileSnapshot: {
                    profileType: profile.profileType,
                    riskLevel: profile.riskLevel,
                    investmentHorizon: profile.investmentHorizon,
                    goal: profile.goal
                },
                recommendations,
                sessionType: "personalized"
            });

            return session;
        } catch (error) {
            console.error("Error generating recommendations:", error.message);
            throw error;
        }
    }

    /**
     * Fetch candidate stocks using Provider Manager (optimized)
     * @param {Object} profile - User profile
     * @returns {Promise<Array>} Array of stocks
     */
    async fetchCandidateStocks(profile) {
        try {
            // Check cache first
            const cacheKey = smartCache.generateKey('recommendations', profile.profileType);
            const cached = await smartCache.get(cacheKey);
            if (cached && !cached.metadata.isStale) {
                console.log("✅ Using cached recommendation stocks");
                return cached.data;
            }

            console.log("🔄 Fetching stocks using Provider Manager (single provider approach)...");

            const stocks = [];

            // Strategy: Use Provider Manager to fetch different types of stocks
            // This eliminates parallel fetching while maintaining diversity

            // 1. Fetch by preferred sectors (using primary available provider)
            if (profile.preferredSectors && profile.preferredSectors.length > 0) {
                for (const sector of profile.preferredSectors.slice(0, 2)) {
                    try {
                        console.log(`🔍 Fetching ${sector} sector stocks...`);
                        const sectorStocks = await this.fetchStocksBySector(sector);
                        if (sectorStocks && sectorStocks.length > 0) {
                            stocks.push(...sectorStocks.slice(0, 10)); // Limit per sector
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch ${sector} stocks:`, error.message);
                    }
                }
            }

            // 2. Fetch popular stocks (using primary available provider)
            try {
                console.log("🔍 Fetching popular stocks...");
                const popularStocks = await this.fetchPopularStocks();
                if (popularStocks && popularStocks.length > 0) {
                    stocks.push(...popularStocks.slice(0, 15));
                }
            } catch (error) {
                console.warn("Failed to fetch popular stocks:", error.message);
            }

            // 3. Fetch trending stocks (using primary available provider)
            try {
                console.log("🔍 Fetching trending stocks...");
                const trendingStocks = await this.fetchTrendingStocks();
                if (trendingStocks && trendingStocks.length > 0) {
                    stocks.push(...trendingStocks.slice(0, 10));
                }
            } catch (error) {
                console.warn("Failed to fetch trending stocks:", error.message);
            }

            // 4. Add some default high-quality stocks if we don't have enough
            if (stocks.length < 10) {
                const defaultStocks = await this.fetchDefaultStocks();
                stocks.push(...defaultStocks);
            }

            // Deduplicate by symbol
            const uniqueStocks = [];
            const seen = new Set();

            for (const stock of stocks) {
                if (stock && stock.symbol && !seen.has(stock.symbol)) {
                    seen.add(stock.symbol);
                    uniqueStocks.push({
                        ...stock,
                        source: 'provider_manager',
                        fetchedAt: new Date().toISOString()
                    });
                }
            }

            // Cache the results
            await smartCache.set(cacheKey, uniqueStocks, 300); // 5 minutes cache

            console.log(`✅ Fetched ${uniqueStocks.length} unique stocks using optimized approach`);
            
            return uniqueStocks;
        } catch (error) {
            console.error("Error fetching candidate stocks:", error.message);
            
            // Try to return cached data even if stale
            const staleCache = await smartCache.getStale(cacheKey);
            if (staleCache) {
                console.log("⚠️ Returning stale cached stocks due to fetch error");
                return staleCache.data;
            }
            
            return [];
        }
    }

    /**
     * Fetch stocks by sector using Provider Manager
     * @param {String} sector - Sector name
     * @returns {Promise<Array>} Sector stocks
     */
    async fetchStocksBySector(sector) {
        try {
            // Use Provider Manager to get sector stocks from the best available provider
            const providers = providerManager.providers;
            
            for (const provider of providers) {
                if (provider.status === 'disabled') continue;
                
                try {
                    if (provider.adapter.getStocksBySector) {
                        const stocks = await provider.adapter.getStocksBySector(sector);
                        if (stocks && stocks.length > 0) {
                            console.log(`✅ Got ${stocks.length} ${sector} stocks from ${provider.name}`);
                            return stocks.map(stock => ({
                                ...stock,
                                provider: provider.name,
                                source: 'sector_fetch'
                            }));
                        }
                    }
                } catch (error) {
                    console.warn(`${provider.name} failed for sector ${sector}:`, error.message);
                    continue;
                }
            }
            
            return [];
        } catch (error) {
            console.error(`Error fetching ${sector} stocks:`, error.message);
            return [];
        }
    }

    /**
     * Fetch popular stocks using Provider Manager
     * @returns {Promise<Array>} Popular stocks
     */
    async fetchPopularStocks() {
        try {
            const providers = providerManager.providers;
            
            for (const provider of providers) {
                if (provider.status === 'disabled') continue;
                
                try {
                    if (provider.adapter.getPopularStocks) {
                        const stocks = await provider.adapter.getPopularStocks();
                        if (stocks && stocks.length > 0) {
                            console.log(`✅ Got ${stocks.length} popular stocks from ${provider.name}`);
                            return stocks.map(stock => ({
                                ...stock,
                                provider: provider.name,
                                source: 'popular_fetch'
                            }));
                        }
                    }
                } catch (error) {
                    console.warn(`${provider.name} failed for popular stocks:`, error.message);
                    continue;
                }
            }
            
            return [];
        } catch (error) {
            console.error("Error fetching popular stocks:", error.message);
            return [];
        }
    }

    /**
     * Fetch trending stocks using Provider Manager
     * @returns {Promise<Array>} Trending stocks
     */
    async fetchTrendingStocks() {
        try {
            const providers = providerManager.providers;
            
            for (const provider of providers) {
                if (provider.status === 'disabled') continue;
                
                try {
                    if (provider.adapter.getTrending) {
                        const stocks = await provider.adapter.getTrending();
                        if (stocks && stocks.length > 0) {
                            console.log(`✅ Got ${stocks.length} trending stocks from ${provider.name}`);
                            return stocks.map(stock => ({
                                ...stock,
                                provider: provider.name,
                                source: 'trending_fetch'
                            }));
                        }
                    }
                } catch (error) {
                    console.warn(`${provider.name} failed for trending stocks:`, error.message);
                    continue;
                }
            }
            
            return [];
        } catch (error) {
            console.error("Error fetching trending stocks:", error.message);
            return [];
        }
    }

    /**
     * Get default high-quality stocks as fallback
     * @returns {Promise<Array>} Default stocks
     */
    async fetchDefaultStocks() {
        const defaultSymbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
            'META', 'NVDA', 'JPM', 'V', 'WMT',
            'DIS', 'NFLX', 'ADBE', 'CRM', 'ORCL'
        ];

        const stocks = [];
        
        for (const symbol of defaultSymbols.slice(0, 10)) {
            try {
                const quote = await providerManager.getQuote(symbol);
                if (quote) {
                    stocks.push({
                        symbol: quote.symbol,
                        name: quote.name,
                        price: quote.price,
                        exchange: quote.exchange,
                        provider: quote.metadata?.provider,
                        source: 'default_fallback'
                    });
                }
            } catch (error) {
                console.warn(`Failed to get default stock ${symbol}:`, error.message);
            }
        }

        console.log(`✅ Got ${stocks.length} default fallback stocks`);
        return stocks;
    }

    /**
     * Enrich stock names using Provider Manager
     * @param {Array} stocks - Array of stocks to enrich
     * @returns {Promise<Array>} Enriched stocks
     */
    async enrichStockNames(stocks) {
        try {
            const enrichedStocks = [];
            
            for (const stock of stocks) {
                if (!stock.name || stock.name === stock.symbol || stock.name.trim() === "") {
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
                    } catch (error) {
                        enrichedStocks.push(stock);
                    }
                } else {
                    enrichedStocks.push(stock);
                }
            }
            
            return enrichedStocks;
        } catch (error) {
            console.error("Error enriching stock names:", error.message);
            return stocks;
        }
    }

    /**
     * Filter stocks by profile constraints
     * @param {Array} stocks - Array of stocks
     * @param {Object} profile - User profile
     * @returns {Array} Filtered stocks
     */
    filterStocksByProfile(stocks, profile) {
        return stocks.filter(stock => {
            // Filter by budget constraints
            if (profile.budgetConstraints.maxStockPrice && stock.price) {
                if (stock.price > profile.budgetConstraints.maxStockPrice) {
                    return false;
                }
            }

            // Filter by volatility if goal requires it
            if (profile.goalConstraints.avoidHighVolatility) {
                // Avoid stocks with high price change percentage
                if (stock.changePercent && Math.abs(stock.changePercent) > 5) {
                    return false;
                }
            }

            // Must have valid price
            if (!stock.price || stock.price <= 0) {
                return false;
            }

            return true;
        });
    }

    /**
     * Calculate match score for a stock against user profile
     * @param {Object} stock - Stock data from API
     * @param {Object} profile - User profile
     * @returns {Object} Score breakdown
     */
    calculateMatchScore(stock, profile) {
        let score = 0;
        const reasons = [];
        const matchedTags = [];

        // Sector match (20 points) - infer from symbol
        const stockSector = this.inferSector(stock.symbol);
        if (profile.preferredSectors.includes(stockSector)) {
            score += 20;
            reasons.push(`Matches your interest in ${stockSector}`);
            matchedTags.push(stockSector);
        }

        // Risk alignment based on volatility (25 points)
        const volatility = this.inferVolatility(stock);
        const riskAlignment = this.getRiskAlignment(volatility, profile.riskLevel);
        score += riskAlignment.score;
        if (riskAlignment.score > 0) {
            reasons.push(riskAlignment.reason);
        }

        // Price stability (25 points)
        if (stock.changePercent !== null && stock.changePercent !== undefined) {
            const absChange = Math.abs(stock.changePercent);
            
            if (profile.goalConstraints.preferStableGrowth && absChange < 2) {
                score += 15;
                reasons.push("Stable price movement (good for long-term goals)");
                matchedTags.push("stable");
            }

            if (profile.goalConstraints.preferGrowth && stock.changePercent > 0) {
                score += 10;
                reasons.push("Positive price momentum");
                matchedTags.push("growth");
            }
        }

        // Liquidity (15 points) - high volume stocks
        if (stock.volume && stock.volume > 1000000) {
            score += 15;
            reasons.push("Highly liquid (easy to buy/sell)");
            matchedTags.push("liquid");
        }

        // ETF preference (15 points)
        const isETF = this.isETF(stock.symbol);
        if (profile.budgetConstraints.recommendETFs && isETF) {
            score += 15;
            reasons.push("ETF (diversified and budget-friendly)");
            matchedTags.push("etf");
        }

        // Affordable (10 points bonus)
        if (stock.price && stock.price < profile.budgetConstraints.maxStockPrice * 0.5) {
            score += 10;
            reasons.push("Well within your budget");
        }

        return {
            total: score,
            reasons,
            matchedTags
        };
    }

    /**
     * Infer sector from stock symbol
     */
    inferSector(symbol) {
        const sectorMap = {
            tech: ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "ORCL", "CSCO", "INTC", "AMD", "CRM", "ADBE", "NFLX"],
            finance: ["JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP", "BLK", "SCHW"],
            healthcare: ["JNJ", "UNH", "PFE", "ABBV", "TMO", "MRK", "ABT", "DHR", "LLY", "BMY"],
            consumer: ["AMZN", "WMT", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "COST", "DG", "DIS"],
            energy: ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HAL"],
            diversified: ["SPY", "VOO", "QQQ", "VTI", "IVV", "DIA", "IWM"]
        };

        for (const [sector, symbols] of Object.entries(sectorMap)) {
            if (symbols.includes(symbol)) {
                return sector;
            }
        }

        return "other";
    }

    /**
     * Infer volatility from price change
     */
    inferVolatility(stock) {
        if (!stock.changePercent) return "medium";

        const absChange = Math.abs(stock.changePercent);
        if (absChange < 2) return "low";
        if (absChange < 5) return "medium";
        return "high";
    }

    /**
     * Check if symbol is an ETF
     */
    isETF(symbol) {
        const etfs = ["SPY", "VOO", "QQQ", "VTI", "IVV", "DIA", "IWM", "EFA", "VEA", "AGG"];
        return etfs.includes(symbol);
    }

    /**
     * Get risk alignment score
     */
    getRiskAlignment(stockVolatility, userRiskLevel) {
        const alignmentMatrix = {
            Conservative: {
                low: { score: 25, reason: "Low volatility matches your conservative profile" },
                medium: { score: 10, reason: "Moderate volatility acceptable" },
                high: { score: 0, reason: "" }
            },
            Balanced: {
                low: { score: 15, reason: "Low volatility provides stability" },
                medium: { score: 25, reason: "Moderate volatility matches your balanced profile" },
                high: { score: 10, reason: "Some volatility acceptable" }
            },
            Aggressive: {
                low: { score: 10, reason: "Low volatility provides balance" },
                medium: { score: 15, reason: "Moderate volatility acceptable" },
                high: { score: 25, reason: "High volatility matches your aggressive profile" }
            }
        };

        return alignmentMatrix[userRiskLevel]?.[stockVolatility] || { score: 0, reason: "" };
    }

    /**
     * Calculate allocation percentage
     */
    calculateAllocation(index, total, riskLevel) {
        if (riskLevel === "Conservative") {
            return parseFloat((100 / total).toFixed(2));
        }

        if (riskLevel === "Balanced") {
            const weight = 100 / (total * (1 + index * 0.1));
            return parseFloat(weight.toFixed(2));
        }

        const weight = 100 / (total * (1 + index * 0.3));
        return parseFloat(weight.toFixed(2));
    }

    /**
     * Calculate position size
     */
    calculatePositionSize(allocation, minPositionSize) {
        return Math.max(minPositionSize, minPositionSize * (allocation / 10));
    }

    /**
     * Clear recommendation cache to force fresh fetch
     * @param {String} profileType - Profile type to clear (optional)
     * @returns {Promise<Boolean>} Success status
     */
    async clearRecommendationCache(profileType = null) {
        try {
            if (profileType) {
                const cacheKey = smartCache.generateKey('recommendations', profileType);
                await smartCache.delete(cacheKey);
                console.log(`🗑️ Cleared recommendation cache for profile type: ${profileType}`);
            } else {
                // Clear all recommendation caches
                const profileTypes = ['Conservative', 'Balanced', 'Aggressive'];
                for (const type of profileTypes) {
                    const cacheKey = smartCache.generateKey('recommendations', type);
                    await smartCache.delete(cacheKey);
                }
                console.log("🗑️ Cleared all recommendation caches");
            }
            return true;
        } catch (error) {
            console.error("Error clearing recommendation cache:", error.message);
            return false;
        }
    }

    /**
     * Get user's recommendation history
     */
    async getRecommendationHistory(userId, limit = 10) {
        return await RecommendationSession.find({ userId })
            .sort({ generatedAt: -1 })
            .limit(limit);
    }

    /**
     * Get latest recommendations
     */
    async getLatestRecommendations(userId) {
        return await RecommendationSession.findOne({ userId, isActive: true })
            .sort({ generatedAt: -1 });
    }
}

module.exports = new RecommendationEngineV2();
