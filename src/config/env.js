require("dotenv").config();

/**
 * Environment Configuration & Validation
 *
 * Fails fast at boot if something required is missing, instead of surfacing as
 * a confusing runtime error hours later. (The original file was empty, and
 * `PORT` had no fallback — `app.listen(undefined)` binds a random port.)
 */

const REQUIRED = ["MONGO_URI", "JWT_SECRET"];

/** Vars that aren't strictly required but degrade a feature when missing. */
const DEGRADES = {
    REDIS_URL: "Caching disabled — every request will hit the market-data providers.",
    RESEND_API_KEY: "Email disabled — OTP, verification and welcome emails will not send.",
    FINNHUB_API_KEY: "Finnhub provider unavailable.",
    TWELVEDATA_API_KEY: "TwelveData provider unavailable.",
    ALPHAVANTAGE_API_KEY: "AlphaVantage provider unavailable."
};

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`FATAL: missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
}

const warnings = Object.entries(DEGRADES)
    .filter(([k]) => !process.env[k])
    .map(([k, why]) => `  - ${k}: ${why}`);

if (warnings.length > 0) {
    console.warn("Environment warnings:\n" + warnings.join("\n"));
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.warn("WARNING: JWT_SECRET is shorter than 32 characters. Use a long random value.");
}

const int = (v, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
};

const env = Object.freeze({
    NODE_ENV: process.env.NODE_ENV || "development",
    isProd: (process.env.NODE_ENV || "development") === "production",
    PORT: int(process.env.PORT, 8080),

    MONGO_URI: process.env.MONGO_URI,
    REDIS_URL: process.env.REDIS_URL || null,

    JWT_SECRET: process.env.JWT_SECRET,
    // Short-lived access token; refresh tokens are persisted and revocable.
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "2h",
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    REFRESH_TOKEN_DAYS: int(process.env.REFRESH_TOKEN_DAYS, 30),

    RESEND_API_KEY: process.env.RESEND_API_KEY || null,
    EMAIL_FROM: process.env.EMAIL_FROM || "hello@yupacgo.com",

    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY || null,
    TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY || null,
    ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY || null,

    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),

    // Base NGN->USD rate used only if the live FX lookup fails. See fx.service.js.
    FX_FALLBACK_NGN_PER_USD: Number(process.env.FX_FALLBACK_NGN_PER_USD) || 1550,

    // Disables outbound network calls in tests.
    OFFLINE: process.env.OFFLINE === "true",

    // Error monitoring. See config/sentry.js — a no-op until this is set.
    SENTRY_DSN: process.env.SENTRY_DSN || null
});

module.exports = env;
