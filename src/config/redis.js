const Redis = require("ioredis");
const env = require("./env");
const logger = require("../utils/logger");

/**
 * Redis Cache Configuration
 * Used for caching API responses to reduce the use of external API calls.
 * Every read/write here is a soft dependency: cache misses degrade to a
 * slower request, they never fail the request outright.
 */

let redisClient = null;
let consecutiveErrors = 0;

const connectRedis = () => {
    try {
        if (!env.REDIS_URL) {
            logger.warn("REDIS_URL not configured. Caching disabled.");
            return null;
        }

        redisClient = new Redis(env.REDIS_URL, {
            tls: { rejectUnauthorized: false },
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3
        });

        redisClient.on("connect", () => {
            consecutiveErrors = 0;
            logger.info("Redis connected");
        });

        redisClient.on("error", (err) => {
            consecutiveErrors++;
            // ioredis retries indefinitely with backoff; if the host is down for
            // an extended period that would otherwise log every single attempt.
            // Log the first failure immediately, then only every 20th after that.
            if (consecutiveErrors === 1 || consecutiveErrors % 20 === 0) {
                logger.warn("Redis connection error", { err: err.message, consecutiveErrors });
            }
        });

        return redisClient;
    } catch (error) {
        logger.exception("Redis initialization error", error);
        return null;
    }
};

/** @returns {Promise<*|null>} */
const getCache = async (key) => {
    if (!redisClient) return null;
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        logger.debug("Redis get failed", { key, err: error.message });
        return null;
    }
};

/** @param {number} ttl - seconds */
const setCache = async (key, data, ttl = 60) => {
    if (!redisClient) return;
    try {
        await redisClient.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
        logger.debug("Redis set failed", { key, err: error.message });
    }
};

const deleteCache = async (key) => {
    if (!redisClient) return;
    try {
        await redisClient.del(key);
    } catch (error) {
        logger.debug("Redis delete failed", { key, err: error.message });
    }
};

/** @param {string} pattern - e.g. "quote:*" */
const deleteCachePattern = async (pattern) => {
    if (!redisClient) return;
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) await redisClient.del(...keys);
    } catch (error) {
        logger.debug("Redis delete-pattern failed", { pattern, err: error.message });
    }
};

/**
 * Get the current Redis client instance (or null if not configured/connected).
 * Exposed as a function since redisClient is reassigned after connectRedis() runs.
 */
const getRedisClient = () => redisClient;

/** For graceful shutdown. */
const disconnectRedis = async () => {
    if (redisClient) await redisClient.quit().catch(() => {});
};

module.exports = {
    connectRedis,
    getCache,
    setCache,
    deleteCache,
    deleteCachePattern,
    getRedisClient,
    disconnectRedis
};
