const UserProfile = require("../models/userProfile.models");
const RecommendationSession = require("../models/recommendationSession.models");
const providerManager = require("./providerManager.service");
const stockUniverse = require("./stockUniverse.service");
const stockNameEnrichment = require("./stockNameEnrichment.service");
const fx = require("./fx.service");
const { deleteCachePattern } = require("../config/redis");
const { RISK_LEVEL } = require("../constants/domain");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Recommendation Engine
 *
 * REWRITTEN. The previous version drew from ~25 hardcoded symbols shared by a
 * candidate-list cache keyed only on `profileType` — and because of separate
 * bugs in profileCalculator.service.js, `profileType` could only ever take 3
 * values platform-wide. Two accounts landing in the same risk bucket got
 * byte-identical recommendations, because they WERE reading the same cached
 * list.
 *
 * This version:
 *  - samples a candidate pool from stockUniverse.service (thousands of real
 *    symbols), seeded per-user-per-day, so two accounts diverge even at the
 *    same risk level
 *  - fetches quotes in bounded-concurrency batches instead of one huge
 *    sequential loop with a per-symbol company-profile lookup (the old N+1
 *    that made onboarding take 30-60s)
 *  - only enriches the FINAL selected picks' names (via the static map that
 *    existed but was never wired up), not the whole candidate pool
 *  - enforces a soft per-sector cap so results are actually diversified, not
 *    just the top-N by raw score
 *  - works entirely in USD internally (profile budget constraints are already
 *    converted from NGN at profile-compute time) and attaches a Naira display
 *    figure per recommendation for the client
 */

const CANDIDATE_POOL_SIZE = 60;
const QUOTE_FETCH_CONCURRENCY = 8;
const QUOTE_FETCH_TIMEOUT_MS = 10000;
const MIN_QUALITY_PRICE_USD = 1;

class RecommendationEngine {
    /**
     * Generate personalized recommendations for a user.
     * @param {String} userId
     * @returns {Promise<Object>} the saved RecommendationSession
     */
    async generateRecommendations(userId) {
        const profile = await UserProfile.findOne({ userId });
        if (!profile) {
            throw AppError.badRequest("Please complete onboarding before generating recommendations");
        }

        const seed = `${userId}:${todayBucket()}`;

        const candidateSymbols = await stockUniverse.sampleCandidates({
            seed,
            preferredSectors: profile.preferredSectors,
            total: CANDIDATE_POOL_SIZE
        });

        if (candidateSymbols.length === 0) {
            throw AppError.unavailable(
                "The stock universe is temporarily unavailable. Please try again shortly."
            );
        }

        const quoted = await this._fetchQuotesBounded(candidateSymbols);

        if (quoted.length === 0) {
            throw AppError.unavailable(
                "Market data providers are temporarily unavailable. Please try again shortly."
            );
        }

        const eligible = this._filterByProfile(quoted, profile);
        if (eligible.length === 0) {
            throw AppError.notFound(
                "No stocks currently match your profile's constraints. Try adjusting your budget or risk tolerance."
            );
        }

        const scored = eligible
            .map((stock) => ({ stock, score: this._scoreStock(stock, profile) }))
            .sort((a, b) => b.score.total - a.score.total);

        const picks = this._selectDiversified(scored, profile.diversificationLevel);

        const enriched = await stockNameEnrichment.enrichStockNames(picks.map((p) => p.stock));

        const recommendations = await Promise.all(
            picks.map(async (item, index) => {
                const stock = { ...item.stock, ...enriched[index] };
                const allocation = this._calculateAllocation(index, picks.length, profile.riskLevel);
                const positionSizeUsd = this._calculatePositionSize(allocation, profile.budgetConstraints);
                const priceInfo = await fx.withNairaEquivalent(stock.price);

                return {
                    symbol: stock.symbol,
                    name: stock.name || stock.symbol,
                    exchange: stock.exchange,
                    matchScore: item.score.total,
                    matchReasons: item.score.reasons,
                    recommendedPrice: round2(stock.price),
                    recommendedPriceNgn: priceInfo.ngn,
                    currency: "USD",
                    suggestedAllocation: allocation,
                    suggestedPositionSize: round2(positionSizeUsd),
                    suggestedPositionSizeNgn: Math.round(positionSizeUsd * priceInfo.fx.ngnPerUsd),
                    matchedTags: item.score.matchedTags,
                    priceChange: stock.change,
                    priceChangePercent: stock.changePercent,
                    provider: stock.provider,
                    assetType: stock.assetType,
                    sector: stock.sector
                };
            })
        );

        // Only one session should ever be "the latest" for a user — the old
        // code never flipped this flag, so the collection grew unbounded with
        // every past session still marked active.
        await RecommendationSession.updateMany({ userId, isActive: true }, { isActive: false });

        return RecommendationSession.create({
            userId,
            profileSnapshot: {
                profileType: profile.profileType,
                riskLevel: profile.riskLevel,
                investmentHorizon: profile.investmentHorizon,
                goal: profile.goal
            },
            recommendations,
            sessionType: "personalized",
            isActive: true
        });
    }

    // -------------------------------------------------------------------
    // Candidate fetching
    // -------------------------------------------------------------------

    /**
     * Fetch quotes for a symbol list with bounded concurrency, so we never fire
     * dozens of simultaneous provider requests (the old code's `Promise.all`
     * over an unbounded list) but also don't fetch strictly sequentially (the
     * old code's per-symbol `for...of` that made onboarding take 30-60s).
     */
    async _fetchQuotesBounded(candidates) {
        const results = [];
        for (let i = 0; i < candidates.length; i += QUOTE_FETCH_CONCURRENCY) {
            const batch = candidates.slice(i, i + QUOTE_FETCH_CONCURRENCY);
            const settled = await Promise.allSettled(
                batch.map((c) => this._fetchOneQuote(c))
            );
            for (const r of settled) {
                if (r.status === "fulfilled" && r.value) results.push(r.value);
            }
        }
        return results;
    }

    async _fetchOneQuote(candidate) {
        try {
            const quote = await Promise.race([
                providerManager.getQuote(candidate.symbol),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("quote timeout")), QUOTE_FETCH_TIMEOUT_MS)
                )
            ]);

            if (!quote || !quote.price || quote.price <= 0) return null;

            return {
                symbol: candidate.symbol,
                name: candidate.name,
                assetType: candidate.assetType,
                exchange: quote.exchange || candidate.exchange,
                price: quote.price,
                change: quote.change,
                changePercent: quote.changePercent,
                volume: quote.volume,
                provider: quote.metadata?.provider,
                sector: stockUniverse.inferSector(candidate.symbol)
            };
        } catch (error) {
            logger.debug("Quote fetch failed for candidate", { symbol: candidate.symbol, err: error.message });
            return null;
        }
    }

    // -------------------------------------------------------------------
    // Filtering
    // -------------------------------------------------------------------

    _filterByProfile(stocks, profile) {
        const { budgetConstraints, goalConstraints } = profile;

        return stocks.filter((stock) => {
            // Sub-$1 stocks carry outsized volatility/delisting risk regardless
            // of which major exchange they're technically listed on — wrong
            // default for a beginner-first platform even when "affordable."
            if (stock.price < MIN_QUALITY_PRICE_USD) return false;

            if (budgetConstraints.maxSharePriceUsd && stock.price > budgetConstraints.maxSharePriceUsd) {
                return false;
            }

            if (goalConstraints.avoidHighVolatility && stock.changePercent != null) {
                if (Math.abs(stock.changePercent) > 5) return false;
            }

            return true;
        });
    }

    // -------------------------------------------------------------------
    // Scoring
    // -------------------------------------------------------------------

    _scoreStock(stock, profile) {
        let score = 0;
        const reasons = [];
        const matchedTags = [];

        // Sector match (25 pts) — the signal that was always dead before.
        if (stock.sector && profile.preferredSectors.includes(stock.sector)) {
            score += 25;
            reasons.push(`Matches your interest in ${humanizeSector(stock.sector)}`);
            matchedTags.push(stock.sector);
        }

        // Risk alignment (25 pts)
        const volatility = inferVolatility(stock.changePercent);
        const alignment = riskAlignment(volatility, profile.riskLevel);
        score += alignment.score;
        if (alignment.score > 0) reasons.push(alignment.reason);

        // Price behaviour vs goal (up to 25 pts)
        if (stock.changePercent != null) {
            const abs = Math.abs(stock.changePercent);
            if (profile.goalConstraints.preferStableGrowth && abs < 2) {
                score += 15;
                reasons.push("Stable price movement, fits your goal");
                matchedTags.push("stable");
            }
            if (profile.goalConstraints.preferGrowth && stock.changePercent > 0) {
                score += 10;
                reasons.push("Positive price momentum");
                matchedTags.push("growth");
            }
            if (profile.goalConstraints.preferDividends && stock.assetType === "stock") {
                // We don't have dividend yield from the free-tier quote endpoint;
                // this is a soft nudge toward established large-caps, not a claim.
                score += 5;
            }
        }

        // Liquidity (10 pts)
        if (stock.volume && stock.volume > 500000) {
            score += 10;
            reasons.push("Highly liquid — easy to buy and sell");
            matchedTags.push("liquid");
        }

        // ETF fit for budget-constrained / diversification-seeking profiles (15 pts)
        if (profile.budgetConstraints.stronglyPreferETFs && stock.assetType === "etf") {
            score += 15;
            reasons.push("An ETF gives you diversification your budget can't buy one stock at a time");
            matchedTags.push("etf");
        } else if (profile.budgetConstraints.recommendETFs && stock.assetType === "etf") {
            score += 8;
            matchedTags.push("etf");
        }

        // Comfortably affordable within the position budget (bonus 5 pts)
        if (stock.price < profile.budgetConstraints.minPositionUsd * 3) {
            score += 5;
            reasons.push("Well within your budget");
        }

        return { total: score, reasons, matchedTags };
    }

    // -------------------------------------------------------------------
    // Selection with a diversification cap
    // -------------------------------------------------------------------

    /**
     * Take the top-scored stocks, but cap how many can come from one sector so
     * the result is an actual diversified set rather than "top N by score"
     * (which, for a tech-heavy universe, tended to be all tech).
     */
    _selectDiversified(scoredSorted, diversificationLevel) {
        const { minAssets, maxAssets } = diversificationLevel;
        const maxPerSector = Math.max(2, Math.ceil(maxAssets * 0.4));

        const picks = [];
        const sectorCounts = {};

        for (const item of scoredSorted) {
            if (picks.length >= maxAssets) break;

            const sector = item.stock.sector || "unclassified";
            const count = sectorCounts[sector] || 0;

            if (count >= maxPerSector && picks.length >= minAssets) continue;

            picks.push(item);
            sectorCounts[sector] = count + 1;
        }

        // If the sector cap left us short of the minimum, backfill from the
        // remainder ignoring the cap rather than returning too few picks.
        if (picks.length < minAssets) {
            for (const item of scoredSorted) {
                if (picks.length >= minAssets) break;
                if (!picks.includes(item)) picks.push(item);
            }
        }

        return picks;
    }

    // -------------------------------------------------------------------
    // Sizing
    // -------------------------------------------------------------------

    _calculateAllocation(index, total, riskLevel) {
        if (riskLevel === RISK_LEVEL.CONSERVATIVE) {
            return round2(100 / total);
        }
        if (riskLevel === RISK_LEVEL.BALANCED) {
            return round2(100 / (total * (1 + index * 0.1)));
        }
        return round2(100 / (total * (1 + index * 0.3)));
    }

    _calculatePositionSize(allocationPercent, budgetConstraints) {
        // Position size scales with the user's actual monthly budget, floored at
        // their configured minimum. The old formula used a stray `/ 10` against
        // a field that mixed NGN and USD units.
        const scaled = budgetConstraints.monthlyBudgetUsd * (allocationPercent / 100);
        return Math.max(budgetConstraints.minPositionUsd, scaled);
    }

    // -------------------------------------------------------------------
    // Cache / history
    // -------------------------------------------------------------------

    /**
     * There is no shared candidate-list cache anymore (that was the mechanism
     * behind the "everyone gets the same list" bug) — each request samples
     * fresh from the universe. This clears the underlying provider-level quote
     * and profile caches, which is the useful sense of "give me fresh data."
     */
    async clearRecommendationCache() {
        try {
            await deleteCachePattern("quote:*");
            await deleteCachePattern("profile:*");
            return true;
        } catch (error) {
            logger.exception("Failed to clear provider caches", error);
            return false;
        }
    }

    async getRecommendationHistory(userId, limit = 10) {
        return RecommendationSession.find({ userId }).sort({ generatedAt: -1 }).limit(limit);
    }

    async getLatestRecommendations(userId) {
        return RecommendationSession.findOne({ userId, isActive: true }).sort({ generatedAt: -1 });
    }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function todayBucket() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function inferVolatility(changePercent) {
    if (changePercent == null) return "medium";
    const abs = Math.abs(changePercent);
    if (abs < 2) return "low";
    if (abs < 5) return "medium";
    return "high";
}

function riskAlignment(volatility, riskLevel) {
    const matrix = {
        [RISK_LEVEL.CONSERVATIVE]: {
            low: { score: 25, reason: "Low volatility matches your conservative profile" },
            medium: { score: 10, reason: "Moderate volatility, acceptable but not ideal" },
            high: { score: 0, reason: "" }
        },
        [RISK_LEVEL.BALANCED]: {
            low: { score: 15, reason: "Low volatility adds stability to your balanced profile" },
            medium: { score: 25, reason: "Moderate volatility matches your balanced profile" },
            high: { score: 10, reason: "Some volatility acceptable for a balanced profile" }
        },
        [RISK_LEVEL.AGGRESSIVE]: {
            low: { score: 10, reason: "Low volatility provides some ballast" },
            medium: { score: 15, reason: "Moderate volatility acceptable" },
            high: { score: 25, reason: "High volatility matches your aggressive profile" }
        }
    };
    return matrix[riskLevel]?.[volatility] || { score: 0, reason: "" };
}

function humanizeSector(sector) {
    return sector.replace(/_/g, " ");
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = new RecommendationEngine();
