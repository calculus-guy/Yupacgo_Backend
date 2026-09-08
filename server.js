// Load + validate environment FIRST — fails fast on a missing required var
// instead of surfacing as a confusing runtime error later.
const env = require("./src/config/env");

// Must init before express/http are required so Sentry's auto-instrumentation
// can patch them. No-op until SENTRY_DSN is set — see config/sentry.js.
const { initSentry, Sentry } = require("./src/config/sentry");
initSentry();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./src/config/db");
const { connectRedis, disconnectRedis } = require("./src/config/redis");
const { initializeTransporter } = require("./src/services/email.service");
const { initializeScheduler } = require("./src/services/scheduler.service");
const { notFoundHandler, errorHandler } = require("./src/middleware/errorHandler");
const logger = require("./src/utils/logger");

const authRoutes = require("./src/routes/auth.routes");
const onboardingRoutes = require("./src/routes/onboarding.routes");
const profileRoutes = require("./src/routes/profile.routes");
const stockRoutes = require("./src/routes/stock.routes");
const recommendationRoutes = require("./src/routes/recommendation.routes");
const watchlistRoutes = require("./src/routes/watchlist.routes");
const notificationRoutes = require("./src/routes/notification.routes");
const profileManagementRoutes = require("./src/routes/profileManagement.routes");
const virtualPortfolioRoutes = require("./src/routes/virtualPortfolio.routes");
const adminRoutes = require("./src/routes/admin.routes");
const healthRoutes = require("./src/routes/health.routes");

const app = express();

/**
 * CRITICAL: Render (like most PaaS) sits behind a reverse proxy. Without this,
 * Express resolves every request's `req.ip` to the PROXY's address, not the
 * caller's — which meant every rate limiter in the app (auth, OTP request,
 * OTP verify) was sharing ONE bucket across every user on the platform.
 * A handful of users could exhaust the entire limiter, and everyone else's
 * password-reset requests would fail with "too many attempts" for a reset
 * they never even tried. This single line was the root cause of that.
 */
app.set("trust proxy", 1);

// Helmet's defaults assume an HTML-serving app on one origin. This is a pure
// JSON API deliberately called cross-origin (Vercel frontend -> Render
// backend), so CSP is irrelevant here and the default same-origin resource
// policy would fight the CORS config below rather than complement it.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "1mb" }));

const corsOptions = {
    origin(origin, callback) {
        // Allow same-origin/non-browser requests (no Origin header) through.
        if (!origin) return callback(null, true);

        const allowed = new Set([
            "https://yupacgo.vercel.app",
            "https://www.yupacgo.com",
            "https://yupacgo.com",
            "http://localhost:5173",
            ...env.ALLOWED_ORIGINS
        ]);

        if (allowed.has(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
        "Origin", "X-Requested-With", "Content-Type", "Accept",
        "Authorization", "Cache-Control", "Pragma"
    ]
};

app.use(cors(corsOptions));

connectDB();
connectRedis();
initializeTransporter();
initializeScheduler();

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/profile-management", profileManagementRoutes);
app.use("/api/portfolio", virtualPortfolioRoutes);
app.use("/api/admin", adminRoutes);

// Must be registered after every route.
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`, { env: env.NODE_ENV });
});

// Surface what would otherwise be a silent process crash with no trace.
process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.exception("Unhandled promise rejection", error);
    Sentry.captureException(error);
});
process.on("uncaughtException", (err) => {
    logger.exception("Uncaught exception", err);
    Sentry.captureException(err);
    // Give the logger a tick to flush, then let the process manager restart us —
    // continuing after a truly uncaught exception risks running in a corrupted state.
    setTimeout(() => process.exit(1), 100);
});

/** Render sends SIGTERM on redeploy/scale-down; close connections cleanly. */
async function shutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
        await disconnectRedis();
        const mongoose = require("mongoose");
        await mongoose.connection.close();
        logger.info("Shutdown complete");
        process.exit(0);
    });
    // Don't hang forever if something doesn't close.
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
