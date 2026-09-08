const axios = require("axios");
const env = require("../config/env");
const logger = require("../utils/logger");
const { getCache, setCache } = require("../config/redis");
const { SECTOR, ASSET_TYPE } = require("../constants/domain");

/**
 * Stock Universe Service
 *
 * WHY THIS EXISTS:
 * The old recommendation engine drew from ~25 hardcoded symbols, so every user
 * of a given risk level saw the same list. This service builds a REAL candidate
 * universe (~4,700 common stocks + ~6,400 ETFs on NASDAQ/NYSE/ARCA/BATS, fetched
 * from Finnhub's free `/stock/symbol` endpoint) and samples from it with a
 * per-user seed, so two accounts with the same risk profile draw from the same
 * large pool but land on different candidates.
 *
 * SECTOR CLASSIFICATION HONESTY NOTE:
 * Free-tier market-data APIs don't provide bulk sector data — getting it per
 * symbol costs one HTTP call each, and calling that for 11,000 symbols isn't
 * viable on a free plan (Finnhub free tier: 60 calls/minute). So sector tagging
 * here is a curated map (~340 well-known liquid tickers across 10 sectors,
 * researched for this rebuild — a meaningful expansion of the old ~50-ticker
 * map, but still curated, not exhaustive). Anything outside the map scores 0 on
 * sector-match rather than guessing. If/when a paid provider with bulk sector
 * data is adopted (flagged in the audit as a Phase 4 decision), swap the lookup
 * in `inferSector` for a real classification call — nothing else needs to change.
 */

const FINNHUB_SYMBOL_URL = "https://finnhub.io/api/v1/stock/symbol";
const UNIVERSE_CACHE_KEY = "universe:us:v1";
const UNIVERSE_TTL = 7 * 24 * 60 * 60; // symbol lists change rarely — 7 days

// Mainstream, liquid exchanges only. Excludes OOTC (over-the-counter), where
// most penny-stock / delisting risk lives — wrong for a beginner-first product.
const ALLOWED_MIC = new Set(["XNAS", "XNYS", "ARCX", "BATS", "XASE"]);

let memo = null; // in-process cache so a burst of requests shares one fetch

// ---------------------------------------------------------------------------
// Sector map
// ---------------------------------------------------------------------------

const SECTOR_SEEDS = Object.freeze({
    [SECTOR.TECH]: [
        "AAPL", "MSFT", "GOOGL", "GOOG", "META", "NVDA", "ORCL", "CSCO", "INTC", "AMD",
        "CRM", "ADBE", "NFLX", "IBM", "QCOM", "TXN", "AVGO", "NOW", "INTU", "PANW",
        "SNPS", "CDNS", "ADSK", "WDAY", "TEAM", "ZS", "CRWD", "DDOG", "NET", "MDB",
        "SHOP", "UBER", "ABNB", "SNOW", "PLTR", "ANET", "FTNT", "MU", "LRCX", "KLAC"
    ],
    [SECTOR.FINANCE]: [
        "JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP", "BLK",
        "SCHW", "SPGI", "CB", "PGR", "MMC", "ICE", "CME", "USB", "PNC", "TFC",
        "COF", "BK", "AON", "TRV", "AFL", "MET", "PRU", "ALL", "AIG", "FIS"
    ],
    [SECTOR.HEALTHCARE]: [
        "JNJ", "UNH", "PFE", "ABBV", "TMO", "MRK", "ABT", "DHR", "LLY", "BMY",
        "AMGN", "CVS", "MDT", "GILD", "CI", "ISRG", "VRTX", "REGN", "ZTS", "BSX",
        "SYK", "HCA", "ELV", "MCK", "HUM", "IDXX", "IQV", "BIIB", "DXCM", "MRNA"
    ],
    [SECTOR.CONSUMER]: [
        "AMZN", "WMT", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "COST", "DG",
        "PG", "KO", "PEP", "DIS", "TJX", "BKNG", "CMG", "MAR", "YUM", "EL",
        "CL", "KMB", "GIS", "HSY", "MDLZ", "ROST", "DPZ", "ORLY", "AZO", "LULU"
    ],
    [SECTOR.ENERGY]: [
        "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HAL",
        "WMB", "KMI", "OKE", "BKR", "DVN", "HES", "FANG", "TRGP", "CTRA", "EQT"
    ],
    [SECTOR.INDUSTRIALS]: [
        "CAT", "BA", "HON", "UNP", "UPS", "RTX", "LMT", "DE", "GE", "MMM",
        "NOC", "GD", "EMR", "ETN", "ITW", "PH", "CSX", "NSC", "WM", "FDX"
    ],
    [SECTOR.UTILITIES]: [
        "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "XEL", "ED", "WEC",
        "PEG", "ES", "AEE", "CMS", "DTE", "PPL", "FE", "ATO", "CNP", "NI"
    ],
    [SECTOR.REAL_ESTATE]: [
        "PLD", "AMT", "EQIX", "PSA", "O", "WELL", "SPG", "DLR", "CCI", "AVB",
        "EQR", "VTR", "ARE", "IRM", "SBAC", "EXR", "MAA", "ESS", "UDR", "CBRE"
    ],
    [SECTOR.MATERIALS]: [
        "LIN", "APD", "SHW", "FCX", "ECL", "NEM", "DOW", "NUE", "DD", "PPG",
        "VMC", "MLM", "IFF", "ALB", "CTVA", "CE", "FMC", "MOS", "CF", "STLD"
    ],
    [SECTOR.COMMUNICATION]: [
        "GOOGL", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "CHTR", "EA",
        "TTWO", "WBD", "OMC", "IPG", "LYV", "PARA"
    ],
    // Broad-market / diversified ETFs
    [SECTOR.DIVERSIFIED]: [
        "SPY", "VOO", "IVV", "VTI", "QQQ", "DIA", "IWM", "SCHB", "SPLG", "RSP",
        "VXUS", "VEA", "VWO", "EFA", "IEFA", "ITOT", "SCHX", "SPTM"
    ],
    // Bond / fixed-income ETFs
    [SECTOR.FIXED_INCOME]: [
        "AGG", "BND", "TLT", "IEF", "SHY", "LQD", "HYG", "MUB", "TIP", "VCIT",
        "BNDX", "GOVT", "SCHZ", "VTEB", "BSV"
    ]
});

/** Reverse index: symbol -> sector, built once from SECTOR_SEEDS. */
const SYMBOL_TO_SECTOR = (() => {
    const map = new Map();
    for (const [sector, symbols] of Object.entries(SECTOR_SEEDS)) {
        for (const symbol of symbols) if (!map.has(symbol)) map.set(symbol, sector);
    }
    return map;
})();

const KNOWN_ETFS = new Set([
    ...SECTOR_SEEDS[SECTOR.DIVERSIFIED],
    ...SECTOR_SEEDS[SECTOR.FIXED_INCOME]
]);

/** @returns {string|null} canonical sector, or null if not in the curated map */
function inferSector(symbol) {
    return SYMBOL_TO_SECTOR.get(symbol) || null;
}

function isKnownETF(symbol) {
    return KNOWN_ETFS.has(symbol);
}

// ---------------------------------------------------------------------------
// Universe fetch / cache
// ---------------------------------------------------------------------------

/**
 * Fetch + filter the full US symbol list. Cached for a week (in-process +
 * Redis) since this changes rarely and the raw payload is ~7MB.
 */
async function fetchRawUniverse() {
    if (!env.FINNHUB_API_KEY) {
        logger.warn("stockUniverse: FINNHUB_API_KEY missing, universe unavailable");
        return [];
    }

    const { data } = await axios.get(FINNHUB_SYMBOL_URL, {
        params: { exchange: "US", token: env.FINNHUB_API_KEY },
        timeout: 20000
    });

    if (!Array.isArray(data)) return [];

    return data
        .filter((s) => ALLOWED_MIC.has(s.mic) && (s.type === "Common Stock" || s.type === "ETP"))
        .map((s) => ({
            symbol: s.symbol,
            name: s.description || s.symbol,
            assetType: s.type === "ETP" ? ASSET_TYPE.ETF : ASSET_TYPE.STOCK,
            exchange: s.mic
        }))
        // De-duplicate: some symbols legitimately appear on more than one venue.
        .filter((s, i, arr) => arr.findIndex((x) => x.symbol === s.symbol) === i);
}

/**
 * Get the full filtered universe, cached.
 * @returns {Promise<Array<{symbol,name,assetType,exchange}>>}
 */
async function getUniverse() {
    if (memo) return memo;

    const cached = await getCache(UNIVERSE_CACHE_KEY);
    if (cached && Array.isArray(cached) && cached.length > 0) {
        memo = cached;
        return cached;
    }

    try {
        const universe = await fetchRawUniverse();
        if (universe.length === 0) return [];

        await setCache(UNIVERSE_CACHE_KEY, universe, UNIVERSE_TTL);
        memo = universe;
        logger.info("Stock universe built", { count: universe.length });
        return universe;
    } catch (error) {
        logger.exception("Failed to build stock universe", error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/** Deterministic 32-bit hash of a string, for seeding the PRNG below. */
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** mulberry32 — small, fast, seedable PRNG (Math.random has no seed param). */
function mulberry32(seed) {
    let a = seed;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Deterministically shuffle an array using a seeded PRNG (Fisher-Yates).
 * Same seed always produces the same order — different seeds diverge.
 */
function seededShuffle(array, seed) {
    const rng = mulberry32(hashSeed(seed));
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * Sample a candidate pool for one recommendation request.
 *
 * @param {Object} opts
 * @param {string} opts.seed - unique per user+day (e.g. `${userId}:${YYYY-MM-DD}`)
 *   so a user's pool is stable across a day but two users diverge, and the same
 *   user sees fresh candidates day to day rather than a frozen list forever.
 * @param {string[]} opts.preferredSectors - sectors to over-sample from
 * @param {number} opts.total - total candidates to return
 * @param {number} opts.sectorBoostRatio - fraction of `total` drawn preferentially
 *   from preferredSectors when possible (default 0.5)
 */
async function sampleCandidates({ seed, preferredSectors = [], total = 60, sectorBoostRatio = 0.5 }) {
    const universe = await getUniverse();
    if (universe.length === 0) return [];

    const sectorTarget = preferredSectors.length > 0 ? Math.round(total * sectorBoostRatio) : 0;
    const generalTarget = total - sectorTarget;

    const sectorSymbols = new Set(preferredSectors.flatMap((s) => SECTOR_SEEDS[s] || []));
    const inSector = universe.filter((s) => sectorSymbols.has(s.symbol));
    const rest = universe.filter((s) => !sectorSymbols.has(s.symbol));

    const pickedSector = seededShuffle(inSector, seed + ":sector").slice(0, sectorTarget);
    const pickedGeneral = seededShuffle(rest, seed + ":general")
        .slice(0, generalTarget + Math.max(0, sectorTarget - pickedSector.length));

    return seededShuffle([...pickedSector, ...pickedGeneral], seed + ":final");
}

module.exports = {
    getUniverse,
    sampleCandidates,
    inferSector,
    isKnownETF,
    SECTOR_SEEDS,
    // exported for tests
    __hashSeed: hashSeed,
    __seededShuffle: seededShuffle
};
