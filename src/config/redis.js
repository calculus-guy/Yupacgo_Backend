const Redis = require("ioredis");

/**
 * Redis Cache Configuration
 * Used for caching API responses to reduce the use of external API calls
 */

let redisClient = null;

const connectRedis = () => {
    try {
        // Check if Redis URL is configured
        if (!process.env.REDIS_URL) {
            console.log("  Redis URL not configured. Caching disabled.");
            return null;
        }

        redisClient = new Redis(process.env.REDIS_URL, {
            tls: {
                rejectUnauthorized: false
            },
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3
        });

        redisClient.on("connect", () => {
            console.log("✅ Redis connected successfully");
        });

        redisClient.on("error", (err) => {
            console.error("❌ Redis connection error:", err.message);
        });

        return redisClient;
    } catch (error) {
        console.error("❌ Redis initialization error:", error.message);
        return null;
    }
};

/**
 * Get cached data
 * @param {String} key - Cache key
 * @returns {Promise<Object|null>} Cached data or null
 */
const getCache = async (key) => {
    if (!redisClient) return null;

    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error("Redis get error:", error.message);
        return null;
    }
};

/**
 * Set cache data with TTL
 * @param {String} key - Cache key
 * @param {Object} data - Data to cache
 * @param {Number} ttl - Time to live in seconds (default: 60)
 */
const setCache = async (key, data, ttl = 60) => {
    if (!redisClient) return;

    try {
        await redisClient.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
        console.error("Redis set error:", error.message);
    }
};

/**
 * Delete cache by key
 * @param {String} key - Cache key
 */
const deleteCache = async (key) => {
    if (!redisClient) return;

    try {
        await redisClient.del(key);
    } catch (error) {
        console.error("Redis delete error:", error.message);
    }
};

/**
 * Delete cache by pattern
 * @param {String} pattern - Cache key pattern (e.g., "quote:*")
 */
const deleteCachePattern = async (pattern) => {
    if (!redisClient) return;

    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
    } catch (error) {
        console.error("Redis delete pattern error:", error.message);
    }
};

module.exports = {
    connectRedis,
    getCache,
    setCache,
    deleteCache,
    deleteCachePattern
};
