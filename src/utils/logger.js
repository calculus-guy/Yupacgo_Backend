const env = require("../config/env");

/**
 * Structured logger.
 *
 * Emits single-line JSON in production so Render's log search and any future
 * log aggregator can actually query it; falls back to readable text locally.
 * Replaces ~200 scattered emoji console.log calls that were impossible to
 * filter, correlate, or alert on.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (env.isProd ? LEVELS.info : LEVELS.debug);

/** Keys whose values must never reach the logs. */
const REDACT = [
    "password", "newPassword", "confirmPassword", "token", "accessToken",
    "refreshToken", "otp", "authorization", "apiKey", "secret"
];

function redact(value, depth = 0) {
    if (depth > 4 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[REDACT.includes(k) ? k : k] = REDACT.includes(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
}

function emit(level, message, meta = {}) {
    if (LEVELS[level] > threshold) return;

    const safe = redact(meta);

    if (env.isProd) {
        console[level === "debug" ? "log" : level](
            JSON.stringify({ ts: new Date().toISOString(), level, message, ...safe })
        );
        return;
    }

    const detail = Object.keys(safe).length ? " " + JSON.stringify(safe) : "";
    console[level === "debug" ? "log" : level](`[${level}] ${message}${detail}`);
}

module.exports = {
    error: (m, meta) => emit("error", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    info: (m, meta) => emit("info", m, meta),
    debug: (m, meta) => emit("debug", m, meta),

    /** Log a thrown error with its stack, without leaking it to the client. */
    exception: (m, err, meta = {}) =>
        emit("error", m, { ...meta, err: err?.message, stack: err?.stack })
};
