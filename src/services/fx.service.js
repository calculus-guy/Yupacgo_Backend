const axios = require("axios");
const env = require("../config/env");
const logger = require("../utils/logger");
const { getCache, setCache } = require("../config/redis");

/**
 * FX Service — NGN <-> USD
 *
 * WHY THIS EXISTS:
 * Onboarding collects the user's monthly budget in Naira, but every price the
 * market-data providers return is in US Dollars. The original code compared the
 * two directly (`maxStockPrice: 50000` — meaning N50,000 — was tested against a
 * USD share price like 311), so the budget filter was meaningless.
 *
 * Rates come from open.er-api.com (free, no API key, refreshed daily). This
 * service NEVER throws: if the network call fails we serve the cached rate, and
 * if there is no cache we fall back to a configured constant. A slightly stale
 * FX rate is always better than a failed recommendation request.
 */

const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_KEY = "fx:usd_base";
const CACHE_TTL = 6 * 60 * 60;   // 6h — the upstream only updates daily
const REQUEST_TIMEOUT = 8000;

/** In-process memo so a burst of calls in one request doesn't re-hit Redis. */
let memo = { rate: null, asOf: null, at: 0 };
const MEMO_MS = 60 * 1000;

/**
 * Current NGN per 1 USD.
 * @returns {Promise<{rate:number, source:'live'|'cache'|'memo'|'fallback', asOf:string|null}>}
 */
async function getNgnPerUsd() {
    // `asOf` always carries the upstream source's own timestamp, not the time
    // of our local cache/memo hit — those are two different things, and
    // conflating them made the field misleading on anything but a fresh fetch.
    if (memo.rate && Date.now() - memo.at < MEMO_MS) {
        return { rate: memo.rate, source: "memo", asOf: memo.asOf };
    }

    const cached = await getCache(CACHE_KEY);
    if (cached?.rate) {
        memo = { rate: cached.rate, asOf: cached.asOf, at: Date.now() };
        return { rate: cached.rate, source: "cache", asOf: cached.asOf };
    }

    if (env.OFFLINE) {
        return { rate: env.FX_FALLBACK_NGN_PER_USD, source: "fallback", asOf: null };
    }

    try {
        const { data } = await axios.get(RATES_URL, { timeout: REQUEST_TIMEOUT });
        const rate = data?.rates?.NGN;

        if (!rate || typeof rate !== "number" || rate <= 0) {
            throw new Error("NGN rate missing from FX response");
        }

        const payload = { rate, asOf: data.time_last_update_utc || new Date().toISOString() };
        await setCache(CACHE_KEY, payload, CACHE_TTL);
        memo = { rate, asOf: payload.asOf, at: Date.now() };

        logger.info("FX rate refreshed", { ngnPerUsd: rate });
        return { ...payload, source: "live" };
    } catch (error) {
        logger.warn("FX lookup failed, using fallback rate", {
            err: error.message,
            fallback: env.FX_FALLBACK_NGN_PER_USD
        });
        return { rate: env.FX_FALLBACK_NGN_PER_USD, source: "fallback", asOf: null };
    }
}

/** Convert an NGN amount to USD. */
async function ngnToUsd(amountNgn) {
    const { rate, source, asOf } = await getNgnPerUsd();
    return { amount: amountNgn / rate, rate, source, asOf };
}

/** Convert a USD amount to NGN. */
async function usdToNgn(amountUsd) {
    const { rate, source, asOf } = await getNgnPerUsd();
    return { amount: amountUsd * rate, rate, source, asOf };
}

/**
 * Decorate a USD figure with its Naira equivalent for display.
 * Returns both raw numbers and pre-formatted strings so the client doesn't
 * have to re-implement formatting (and can't drift from it).
 */
async function withNairaEquivalent(amountUsd) {
    const { rate, source, asOf } = await getNgnPerUsd();
    const ngn = amountUsd * rate;

    return {
        usd: round2(amountUsd),
        ngn: Math.round(ngn),
        display: {
            usd: formatUsd(amountUsd),
            ngn: formatNgn(ngn),
            combined: `${formatUsd(amountUsd)} (≈${formatNgn(ngn)})`
        },
        fx: { ngnPerUsd: rate, source, asOf }
    };
}

const round2 = (n) => Math.round(n * 100) / 100;

const formatUsd = (n) =>
    `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Naira amounts are shown whole — kobo precision is noise at these sizes. */
const formatNgn = (n) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** Test seam — lets unit tests pin a rate without network access. */
function __setMemoForTesting(rate) {
    memo = rate === null
        ? { rate: null, asOf: null, at: 0 }
        : { rate, asOf: new Date().toISOString(), at: Date.now() };
}

module.exports = {
    getNgnPerUsd,
    ngnToUsd,
    usdToNgn,
    withNairaEquivalent,
    formatUsd,
    formatNgn,
    __setMemoForTesting
};
