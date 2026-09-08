/**
 * Domain Vocabulary — SINGLE SOURCE OF TRUTH
 *
 * Every enum the onboarding questionnaire can produce lives here, and every
 * consumer (profile calculator, recommendation engine, Mongoose schemas,
 * request validators) reads from this file.
 *
 * WHY THIS FILE EXISTS:
 * The original code defined these vocabularies independently in at least four
 * places — the frontend mappers, profileCalculator.service.js, the UserProfile
 * schema, and the API type comments. They drifted. The result was that every
 * user's investment horizon silently collapsed to one value and their sector
 * preferences silently became an empty array, so everyone received identical
 * recommendations.
 *
 * RULE: never inline one of these string literals anywhere else. Import it.
 */

/** Investment goal. Drives goal constraints (liquidity, volatility tolerance). */
const GOAL = Object.freeze({
    RETIREMENT: "retirement",
    EDUCATION: "education",
    SHORT_TERM: "short_term",
    WEALTH_BUILDING: "wealth_building",
    CAPITAL_PRESERVATION: "capital_preservation"
});

/** Self-reported risk tolerance. */
const RISK = Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high"
});

/**
 * Investment time horizon.
 * NOTE: these are the *canonical* values. The old code had the frontend sending
 * `medium_term` while the backend looked up `mid`, so the lookup always missed.
 */
const DURATION = Object.freeze({
    SHORT: "short",          // < 1 year
    MID: "mid",              // 1-3 years
    LONG: "long",            // 3-7 years
    VERY_LONG: "very_long"   // 7+ years
});

/** Monthly investable budget band. Amounts are NGN — see fx.service.js. */
const BUDGET = Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high"
});

/** Prior investing experience. */
const EXPERIENCE = Object.freeze({
    BEGINNER: "beginner",
    INTERMEDIATE: "intermediate",
    ADVANCED: "advanced"
});

/** How hands-on the user wants to be. */
const APPROACH = Object.freeze({
    PASSIVE: "passive",
    ACTIVE: "active"
});

/**
 * Asset-class interests (multi-select).
 * These map to sector/asset tags on the stock universe.
 */
const INTEREST = Object.freeze({
    STOCKS: "stocks",
    ETF: "etf",
    MUTUAL_FUNDS: "mutualfunds",
    CRYPTO: "crypto",
    BONDS: "bonds"
});

/** Derived risk classification (computed, never user-supplied). */
const RISK_LEVEL = Object.freeze({
    CONSERVATIVE: "Conservative",
    BALANCED: "Balanced",
    AGGRESSIVE: "Aggressive"
});

/** Derived experience label (computed). */
const EXPERIENCE_LEVEL = Object.freeze({
    BEGINNER: "Beginner",
    INTERMEDIATE: "Intermediate",
    ADVANCED: "Advanced"
});

/** Derived horizon label (computed). */
const INVESTMENT_HORIZON = Object.freeze({
    SHORT_TERM: "short_term",
    MEDIUM_TERM: "medium_term",
    LONG_TERM: "long_term",
    VERY_LONG_TERM: "very_long_term"
});

/**
 * Canonical sector taxonomy.
 * Finnhub returns free-text `finnhubIndustry` values; stockUniverse.service.js
 * normalises those onto this list so scoring has a stable vocabulary.
 */
const SECTOR = Object.freeze({
    TECH: "tech",
    FINANCE: "finance",
    HEALTHCARE: "healthcare",
    CONSUMER: "consumer",
    ENERGY: "energy",
    INDUSTRIALS: "industrials",
    UTILITIES: "utilities",
    REAL_ESTATE: "real_estate",
    MATERIALS: "materials",
    COMMUNICATION: "communication",
    DIVERSIFIED: "diversified",   // broad-market ETFs
    FIXED_INCOME: "fixed_income", // bond ETFs
    OTHER: "other"
});

/** Instrument type within our universe. */
const ASSET_TYPE = Object.freeze({
    STOCK: "stock",
    ETF: "etf"
});

const values = (o) => Object.freeze(Object.values(o));

/** Frozen arrays for Mongoose `enum:` and validator `z.enum()`. */
const GOALS = values(GOAL);
const RISKS = values(RISK);
const DURATIONS = values(DURATION);
const BUDGETS = values(BUDGET);
const EXPERIENCES = values(EXPERIENCE);
const APPROACHES = values(APPROACH);
const INTERESTS = values(INTEREST);
const RISK_LEVELS = values(RISK_LEVEL);
const EXPERIENCE_LEVELS = values(EXPERIENCE_LEVEL);
const INVESTMENT_HORIZONS = values(INVESTMENT_HORIZON);
const SECTORS = values(SECTOR);
const ASSET_TYPES = values(ASSET_TYPE);

module.exports = {
    GOAL, RISK, DURATION, BUDGET, EXPERIENCE, APPROACH, INTEREST,
    RISK_LEVEL, EXPERIENCE_LEVEL, INVESTMENT_HORIZON, SECTOR, ASSET_TYPE,

    GOALS, RISKS, DURATIONS, BUDGETS, EXPERIENCES, APPROACHES, INTERESTS,
    RISK_LEVELS, EXPERIENCE_LEVELS, INVESTMENT_HORIZONS, SECTORS, ASSET_TYPES
};
