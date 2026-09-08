const {
    GOAL, RISK, DURATION, BUDGET, EXPERIENCE, APPROACH, INTEREST,
    RISK_LEVEL, EXPERIENCE_LEVEL, INVESTMENT_HORIZON, SECTOR
} = require("../constants/domain");

/**
 * Profile Calculator
 *
 * Turns raw onboarding answers into the computed investor profile that drives
 * the recommendation engine.
 *
 * REWRITTEN because the original silently defaulted on every unrecognised
 * value. Three separate vocabulary mismatches meant investment horizon always
 * collapsed to one value, sector preferences were always empty, and two of the
 * five goals fell through to "long term growth" — including "preserve capital",
 * which is its opposite. Every user ended up with one of only three possible
 * profiles.
 *
 * The fix is structural, not cosmetic: this module now reads its vocabulary
 * from constants/domain.js, and `computeProfile` THROWS on an unknown value
 * rather than quietly substituting a default. A loud failure during onboarding
 * is far cheaper than silently giving someone the wrong investment strategy.
 */

// ---------------------------------------------------------------------------
// Budget bands
// ---------------------------------------------------------------------------

/**
 * Representative monthly investable amount per band, in NAIRA.
 * These mirror the bands shown in the onboarding UI:
 *   low    = under N20,000/month
 *   medium = N20,000 - N100,000/month
 *   high   = N100,000+/month
 */
const MONTHLY_BUDGET_NGN = Object.freeze({
    [BUDGET.LOW]: 20000,
    [BUDGET.MEDIUM]: 60000,   // midpoint of the band
    [BUDGET.HIGH]: 250000
});

/**
 * Compute budget constraints, converting Naira to USD so they can be compared
 * against real share prices.
 *
 * The financial reasoning that matters here: at ~N1,350/USD a "low" band user
 * has roughly $15/month. They cannot buy a single share of most large caps
 * (AAPL alone is >$300). Rather than filter those stocks out and leave them
 * with nothing, we flag that they need fractional investing and push them
 * toward broad ETFs — one ETF share gives them diversification that would
 * otherwise cost thousands of dollars to assemble.
 */
function computeBudgetConstraints(budget, ngnPerUsd) {
    const monthlyNgn = MONTHLY_BUDGET_NGN[budget];
    const monthlyUsd = monthlyNgn / ngnPerUsd;

    // How many distinct positions is it sensible to split this budget across?
    // Splitting $15 across ten holdings is not diversification, it is noise.
    let maxPositionsCount;
    let preferFractional;
    let minPositionUsd;

    if (budget === BUDGET.LOW) {
        maxPositionsCount = 3;
        preferFractional = true;
        minPositionUsd = Math.max(2, monthlyUsd * 0.2);
    } else if (budget === BUDGET.MEDIUM) {
        maxPositionsCount = 6;
        preferFractional = true;
        minPositionUsd = Math.max(5, monthlyUsd * 0.12);
    } else {
        maxPositionsCount = 12;
        preferFractional = false;
        minPositionUsd = Math.max(20, monthlyUsd * 0.06);
    }

    return {
        budgetLevel: budget,
        monthlyBudgetNgn: monthlyNgn,
        monthlyBudgetUsd: round2(monthlyUsd),
        fxRateUsed: ngnPerUsd,

        // No hard share-price ceiling when fractional investing is viable.
        // Kept as an explicit null (not undefined) so consumers must handle it.
        maxSharePriceUsd: preferFractional ? null : round2(monthlyUsd * 2),

        preferFractional,
        minPositionUsd: round2(minPositionUsd),
        maxPositionsCount,

        // Small budgets get diversification from ETFs, not from many positions.
        stronglyPreferETFs: budget === BUDGET.LOW,
        recommendETFs: budget !== BUDGET.HIGH
    };
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

const RISK_BASE = Object.freeze({
    [RISK.LOW]: 1,
    [RISK.MEDIUM]: 2,
    [RISK.HIGH]: 3
});

const EXPERIENCE_MODIFIER = Object.freeze({
    [EXPERIENCE.BEGINNER]: -0.3,
    [EXPERIENCE.INTERMEDIATE]: 0,
    [EXPERIENCE.ADVANCED]: 0.3
});

/**
 * Longer horizons tolerate more volatility, because there is time to recover
 * from a drawdown. Short horizons must not.
 */
const DURATION_MODIFIER = Object.freeze({
    [DURATION.SHORT]: -0.5,     // < 1yr: capital must be there when needed
    [DURATION.MID]: -0.1,
    [DURATION.LONG]: 0.2,
    [DURATION.VERY_LONG]: 0.4
});

function calculateRiskScore({ risk, experience, duration }) {
    const score = clamp(
        RISK_BASE[risk] + EXPERIENCE_MODIFIER[experience] + DURATION_MODIFIER[duration],
        1,
        3
    );

    let riskLevel;
    if (score <= 1.6) riskLevel = RISK_LEVEL.CONSERVATIVE;
    else if (score <= 2.3) riskLevel = RISK_LEVEL.BALANCED;
    else riskLevel = RISK_LEVEL.AGGRESSIVE;

    return { riskScore: round2(score), riskLevel };
}

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

/**
 * Goal-driven constraints. Every key in domain.GOAL is represented — there is
 * deliberately no `||` fallback, so adding a goal without adding constraints
 * fails loudly in `computeProfile`.
 */
const GOAL_CONSTRAINTS = Object.freeze({
    [GOAL.RETIREMENT]: {
        minDiversification: 8,
        preferDividends: true,
        preferStableGrowth: true,
        avoidHighVolatility: true,
        canHandleVolatility: false,
        liquidityPriority: "low",
        recommendETFs: true
    },
    [GOAL.EDUCATION]: {
        minDiversification: 5,
        preferGrowth: true,
        preferStableGrowth: true,
        avoidHighVolatility: true,
        liquidityImportant: true,
        liquidityPriority: "medium",
        recommendETFs: true
    },
    [GOAL.SHORT_TERM]: {
        minDiversification: 3,
        preferLiquidity: true,
        avoidHighVolatility: true,
        avoidLongLockup: true,
        liquidityPriority: "high",
        recommendETFs: false
    },
    [GOAL.WEALTH_BUILDING]: {
        minDiversification: 6,
        preferGrowth: true,
        preferCompounding: true,
        canHandleVolatility: true,
        liquidityPriority: "low",
        recommendETFs: true
    },
    // The one the old code got dangerously wrong: this used to fall through to
    // long-term growth constraints, i.e. the opposite of preserving capital.
    [GOAL.CAPITAL_PRESERVATION]: {
        minDiversification: 10,
        preferStable: true,
        preferDividends: true,
        avoidVolatility: true,
        avoidHighVolatility: true,
        canHandleVolatility: false,
        liquidityPriority: "medium",
        recommendETFs: true
    }
});

// ---------------------------------------------------------------------------
// Diversification & cadence
// ---------------------------------------------------------------------------

const DIVERSIFICATION = Object.freeze({
    [RISK_LEVEL.CONSERVATIVE]: { level: "high", minAssets: 8, maxAssets: 15 },
    [RISK_LEVEL.BALANCED]: { level: "medium", minAssets: 5, maxAssets: 10 },
    [RISK_LEVEL.AGGRESSIVE]: { level: "low", minAssets: 3, maxAssets: 7 }
});

const DIVERSIFICATION_COPY = Object.freeze({
    high: "Spread widely across sectors and asset types to smooth out volatility",
    medium: "Balanced across a handful of sectors with room for conviction picks",
    low: "Concentrated in a small number of high-conviction positions"
});

/**
 * NOTE: returns a fresh object every call. The original mutated a shared module
 * -level constant when adjusting for beginners, so one beginner permanently
 * changed the minimum asset count for every subsequent user until restart.
 */
function computeDiversificationLevel(riskLevel, experience, budgetConstraints) {
    const base = DIVERSIFICATION[riskLevel];

    let minAssets = base.minAssets;
    let maxAssets = base.maxAssets;

    // Beginners get more diversification regardless of stated risk appetite.
    if (experience === EXPERIENCE.BEGINNER) {
        minAssets = Math.max(minAssets, 6);
    }

    // A budget can't support more positions than it can meaningfully fund.
    // When that bites, diversification has to come from ETFs instead.
    const cap = budgetConstraints.maxPositionsCount;
    const budgetLimited = minAssets > cap;

    maxAssets = Math.min(maxAssets, cap);
    minAssets = Math.min(minAssets, cap);

    return {
        level: base.level,
        minAssets,
        maxAssets,
        budgetLimited,
        description: budgetLimited
            ? `${DIVERSIFICATION_COPY[base.level]} — at your budget this is best achieved through diversified funds rather than many individual holdings`
            : DIVERSIFICATION_COPY[base.level]
    };
}

const REBALANCING = Object.freeze({
    [APPROACH.PASSIVE]: {
        [RISK_LEVEL.CONSERVATIVE]: { frequency: "quarterly", days: 90 },
        [RISK_LEVEL.BALANCED]: { frequency: "quarterly", days: 90 },
        [RISK_LEVEL.AGGRESSIVE]: { frequency: "monthly", days: 30 }
    },
    [APPROACH.ACTIVE]: {
        [RISK_LEVEL.CONSERVATIVE]: { frequency: "monthly", days: 30 },
        [RISK_LEVEL.BALANCED]: { frequency: "bi-weekly", days: 14 },
        [RISK_LEVEL.AGGRESSIVE]: { frequency: "weekly", days: 7 }
    }
});

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

const EXPERIENCE_LABEL = Object.freeze({
    [EXPERIENCE.BEGINNER]: EXPERIENCE_LEVEL.BEGINNER,
    [EXPERIENCE.INTERMEDIATE]: EXPERIENCE_LEVEL.INTERMEDIATE,
    [EXPERIENCE.ADVANCED]: EXPERIENCE_LEVEL.ADVANCED
});

const HORIZON = Object.freeze({
    [DURATION.SHORT]: INVESTMENT_HORIZON.SHORT_TERM,
    [DURATION.MID]: INVESTMENT_HORIZON.MEDIUM_TERM,
    [DURATION.LONG]: INVESTMENT_HORIZON.LONG_TERM,
    [DURATION.VERY_LONG]: INVESTMENT_HORIZON.VERY_LONG_TERM
});

const HORIZON_LABEL = Object.freeze({
    [INVESTMENT_HORIZON.SHORT_TERM]: "ShortTerm",
    [INVESTMENT_HORIZON.MEDIUM_TERM]: "MediumTerm",
    [INVESTMENT_HORIZON.LONG_TERM]: "LongTerm",
    [INVESTMENT_HORIZON.VERY_LONG_TERM]: "VeryLongTerm"
});

/**
 * Asset-class interests -> sector/asset tags used by the scoring engine.
 *
 * The original never ran: the frontend posted display labels like
 * "Stocks (local & international)" straight through, and every lookup missed,
 * so `preferredSectors` was `[]` for every user on the platform. Normalising
 * here as well as at the API boundary makes that failure mode impossible.
 */
const INTEREST_SECTORS = Object.freeze({
    [INTEREST.STOCKS]: [SECTOR.TECH, SECTOR.FINANCE, SECTOR.HEALTHCARE, SECTOR.CONSUMER, SECTOR.INDUSTRIALS],
    [INTEREST.ETF]: [SECTOR.DIVERSIFIED],
    [INTEREST.MUTUAL_FUNDS]: [SECTOR.DIVERSIFIED],
    [INTEREST.CRYPTO]: [SECTOR.TECH],          // no crypto instruments in the universe yet
    [INTEREST.BONDS]: [SECTOR.FIXED_INCOME]
});

function mapPreferredSectors(interests) {
    if (!Array.isArray(interests)) return [];

    const sectors = new Set();
    for (const item of interests) {
        for (const sector of INTEREST_SECTORS[item] || []) sectors.add(sector);
    }
    return Array.from(sectors);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute the full investor profile.
 *
 * @param {Object} onboarding - already-validated onboarding answers
 * @param {Object} opts
 * @param {number} opts.ngnPerUsd - live FX rate; caller fetches it (keeps this
 *                                  function synchronous and unit-testable)
 * @throws {Error} if any answer is outside the domain vocabulary
 */
function computeProfile(onboarding, { ngnPerUsd } = {}) {
    if (!ngnPerUsd || ngnPerUsd <= 0) {
        throw new Error("computeProfile requires a positive ngnPerUsd rate");
    }

    const { goal, risk, duration, budget, experience, approach, interest } = onboarding;

    // Fail loudly rather than silently substituting a default. This is the
    // single most important behavioural change in this file.
    assertKnown("goal", goal, GOAL_CONSTRAINTS);
    assertKnown("risk", risk, RISK_BASE);
    assertKnown("duration", duration, DURATION_MODIFIER);
    assertKnown("budget", budget, MONTHLY_BUDGET_NGN);
    assertKnown("experience", experience, EXPERIENCE_MODIFIER);
    assertKnown("approach", approach, REBALANCING);

    const { riskScore, riskLevel } = calculateRiskScore({ risk, experience, duration });

    const budgetConstraints = computeBudgetConstraints(budget, ngnPerUsd);
    const goalConstraints = { ...GOAL_CONSTRAINTS[goal] };
    const diversificationLevel = computeDiversificationLevel(riskLevel, experience, budgetConstraints);
    const rebalancingFrequency = REBALANCING[approach][riskLevel];

    const experienceLevel = EXPERIENCE_LABEL[experience];
    const investmentHorizon = HORIZON[duration];
    const preferredSectors = mapPreferredSectors(interest);

    return {
        riskScore,
        riskLevel,
        experienceLevel,
        investmentHorizon,
        goal,
        preferredSectors,
        monthlyBudget: budget,
        approach,
        profileType: `${riskLevel}-${HORIZON_LABEL[investmentHorizon]}`,

        goalConstraints,
        budgetConstraints,
        diversificationLevel,
        rebalancingFrequency
    };
}

function assertKnown(field, value, table) {
    if (!Object.prototype.hasOwnProperty.call(table, value)) {
        throw new Error(
            `Unsupported onboarding value for '${field}': ${JSON.stringify(value)}. ` +
            `Expected one of: ${Object.keys(table).join(", ")}`
        );
    }
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = (n) => Math.round(n * 100) / 100;

module.exports = {
    computeProfile,
    calculateRiskScore,
    computeBudgetConstraints,
    computeDiversificationLevel,
    mapPreferredSectors,
    MONTHLY_BUDGET_NGN,
    GOAL_CONSTRAINTS
};
