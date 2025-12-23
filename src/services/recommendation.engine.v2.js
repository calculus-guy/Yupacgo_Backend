const UserProfile = require("../models/userProfile.models");
const RecommendationSession = require("../models/recommendationSession.models");
const FinnhubAdapter = require("./adapters/finnhubAdapter");
const AlphaVantageAdapter = require("./adapters/alphaVantageAdapter");
const TwelveDataAdapter = require("./adapters/twelveDataAdapter");
const { getCache, setCache } = require("../config/redis");
const stockNameEnrichment = require("./stockNameEnrichment.service");

/**
 * API-Driven Recommendation Engine
 * Fetches stocks directly from APIs, no database seeding required
 */
class RecommendationEngineV2 {
    constructor() {
        this.adapters = {
            finnhub: new FinnhubAdapter(process.env.FINNHUB_API_KEY),
            alphavantage: new AlphaVantageAdapter(process.env.ALPHAVANTAGE_API_KEY),
            twelvedata: new TwelveDataAdapter(process.env.TWELVEDATA_API_KEY)
        };
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

            // Enrich stocks with company names
            const adapters = {
                finnhub: this.adapters.finnhub
            };
            candidateStocks = await stockNameEnrichment.enrichStockNames(candidateStocks, adapters);

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
     * Fetch candidate stocks from APIs based on profile
     * @param {Object} profile - User profile
     * @returns {Promise<Array>} Array of stocks
     */
    async fetchCandidateStocks(profile) {
        try {
            // Check cache first
            const cacheKey = `stocks:profile:${profile.profileType}`;
            const cached = await getCache(cacheKey);
            if (cached) {
                console.log("✅ Using cached stocks");
                return cached;
            }

            console.log("🔄 Fetching stocks from ALL 3 APIs...");

            const stocks = [];

            // Fetch from ALL providers in parallel for better coverage
            const fetchPromises = [];

            // 1. Fetch by preferred sectors (from Finnhub)
            if (profile.preferredSectors && profile.preferredSectors.length > 0) {
                for (const sector of profile.preferredSectors.slice(0, 2)) {
                    fetchPromises.push(
                        this.adapters.finnhub.getStocksBySector(sector)
                            .catch(err => {
                                console.error(`Finnhub sector ${sector} error:`, err.message);
                                return [];
                            })
                    );
                }
            }

            // 2. Fetch popular stocks from Twelve Data
            fetchPromises.push(
                this.adapters.twelvedata.getPopularStocks()
                    .catch(err => {
                        console.error("Twelve Data error:", err.message);
                        return [];
                    })
            );

            // 3. Fetch popular stocks from Finnhub (different set)
            fetchPromises.push(
                this.adapters.finnhub.getPopularStocks()
                    .catch(err => {
                        console.error("Finnhub popular error:", err.message);
                        return [];
                    })
            );

            // 4. Fetch trending from Alpha Vantage (for all profiles, not just aggressive)
            fetchPromises.push(
                this.adapters.alphavantage.getTrending()
                    .catch(err => {
                        console.error("Alpha Vantage error:", err.message);
                        return [];
                    })
            );

            // Wait for all fetches to complete
            const results = await Promise.all(fetchPromises);

            // Flatten all results
            results.forEach(result => {
                if (Array.isArray(result)) {
                    stocks.push(...result);
                }
            });

            // Deduplicate by symbol
            const uniqueStocks = [];
            const seen = new Set();
            const providerCount = { finnhub: 0, alphavantage: 0, twelvedata: 0 };

            for (const stock of stocks) {
                if (stock && stock.symbol && !seen.has(stock.symbol)) {
                    seen.add(stock.symbol);
                    uniqueStocks.push(stock);
                    
                    // Track provider distribution
                    if (stock.provider) {
                        providerCount[stock.provider] = (providerCount[stock.provider] || 0) + 1;
                    }
                }
            }

            // Cache for 5 minutes
            await setCache(cacheKey, uniqueStocks, 300);

            console.log(`✅ Fetched ${uniqueStocks.length} unique stocks from APIs`);
            console.log(`   - Finnhub: ${providerCount.finnhub} stocks`);
            console.log(`   - Alpha Vantage: ${providerCount.alphavantage} stocks`);
            console.log(`   - Twelve Data: ${providerCount.twelvedata} stocks`);
            
            return uniqueStocks;
        } catch (error) {
            console.error("Error fetching candidate stocks:", error.message);
            return [];
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
