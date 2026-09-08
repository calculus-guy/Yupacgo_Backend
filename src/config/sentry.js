const Sentry = require("@sentry/node");
const env = require("./env");

/**
 * Error reporting, gated entirely on SENTRY_DSN.
 *
 * WHY THIS EXISTS: every bug in this codebase's history was found by a
 * client filing a complaint — there was no monitoring on either side of the
 * stack. This is a no-op until a DSN is configured; it does not require
 * signing up for Sentry before this code can ship. When ready: create a
 * Node project at sentry.io (free tier covers this app's scale), copy its
 * DSN into Render's environment variables as SENTRY_DSN, redeploy.
 *
 * Must be called as early as possible — before other modules are required —
 * so Sentry's auto-instrumentation can patch Node's http/express internals.
 * That's why this is required as literally the second line of server.js.
 */
function initSentry() {
    if (!env.SENTRY_DSN) return false;

    Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        tracesSampleRate: 0.1
    });
    return true;
}

module.exports = { initSentry, Sentry };
