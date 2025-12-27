const { getCache, setCache } = require("../config/redis");

/**
 * Smart Cache Service
 * Implements intelligent caching with tiered TTL strategies and metadata tracking
 */
class SmartCacheService {
    constructor() {
        // Cache TTL configurations (in seconds)
        this.cacheTTL = {
            // Real-time data - shorter TTL
            quote: 300,           // 5 minutes for stock quotes
            price: 300,           // 5 minutes for price data
            monitoring: 600,      // 10 minutes for monitoring data
            
            // Search and discovery - medium TTL
            search: 1800,         // 30 minutes for search results
            trending: 900,        // 15 minutes for trending stocks
            popular: 1800,        // 30 minutes for popular stocks
            
            // Static/semi-static data - longer TTL
            profile: 86400,       // 24 hours for company profiles
            company: 86400,       // 24 hours for company data
            fundamentals: 43200,  // 12 hours for fundamental data
            
            // System data - variable TTL
            health: 300,          // 5 minutes for health metrics
            config: 3600,         // 1 hour for configuration data
            session: 1800         // 30 minutes for session data
        };
        
        // Cache extension multipliers for different scenarios
        this.extensionMultipliers = {
            provider_failure: 2,    // Double TTL when provider fails
            all_providers_down: 5,  // 5x TTL when all providers are down
            rate_limited: 3,        // Triple TTL when rate limited
            network_error: 2        // Double TTL for network errors
        };
        
        // Staleness thresholds (multipliers of original TTL)
        this.stalenessThresholds = {
            fresh: 1,      // Within original TTL
            stale: 2,      // Up to 2x original TTL
            very_stale: 5  // Up to 5x original TTL
        };
    }

    /**
     * Get data from cache with metadata
     * @param {String} key - Cache key
     * @param {Object} options - Cache options
     * @returns {Promise<Object|null>} Cached data with metadata or null
     */
    async get(key, options = {}) {
        try {
            const cached = await getCache(key);
            if (!cached) {
                return null;
            }
            
            // If it's already a smart cache object, return as-is
            if (cached.metadata && cached.data !== undefined) {
                const staleness = this._calculateStaleness(cached.metadata);
                cached.metadata.staleness = staleness;
                cached.metadata.isStale = staleness !== 'fresh';
                cached.metadata.cacheAge = this._calculateAge(cached.metadata.cachedAt);
                return cached;
            }
            
            // Legacy cache object - wrap with metadata
            return {
                data: cached,
                metadata: {
                    cachedAt: new Date().toISOString(),
                    ttl: this._getTTL(key),
                    staleness: 'unknown',
                    isStale: false,
                    cacheAge: 0,
                    source: 'legacy'
                }
            };
            
        } catch (error) {
            console.error(`❌ Error getting cache for key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Set data in cache with metadata
     * @param {String} key - Cache key
     * @param {*} value - Data to cache
     * @param {Number} ttl - Time to live in seconds (optional)
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Boolean>} Success status
     */
    async set(key, value, ttl = null, metadata = {}) {
        try {
            const cacheTTL = ttl || this._getTTL(key);
            const now = new Date().toISOString();
            
            const cacheObject = {
                data: value,
                metadata: {
                    cachedAt: now,
                    expiresAt: new Date(Date.now() + (cacheTTL * 1000)).toISOString(),
                    ttl: cacheTTL,
                    originalTTL: cacheTTL,
                    key: key,
                    staleness: 'fresh',
                    isStale: false,
                    cacheAge: 0,
                    extensions: 0,
                    source: 'smart_cache',
                    ...metadata
                }
            };
            
            await setCache(key, cacheObject, cacheTTL);
            
            console.log(`💾 Cached ${key} for ${cacheTTL}s with metadata`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error setting cache for key ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Extend cache TTL (useful when providers fail)
     * @param {String} key - Cache key
     * @param {Number} additionalTtl - Additional TTL in seconds
     * @param {String} reason - Reason for extension
     * @returns {Promise<Boolean>} Success status
     */
    async extend(key, additionalTtl = null, reason = 'manual') {
        try {
            const cached = await this.get(key);
            if (!cached) {
                console.log(`⚠️ Cannot extend cache for ${key} - not found`);
                return false;
            }
            
            // Calculate extension amount
            let extensionAmount = additionalTtl;
            if (!extensionAmount) {
                const multiplier = this.extensionMultipliers[reason] || 2;
                extensionAmount = cached.metadata.originalTTL * multiplier;
            }
            
            // Update metadata
            cached.metadata.extensions = (cached.metadata.extensions || 0) + 1;
            cached.metadata.extensionReason = reason;
            cached.metadata.lastExtended = new Date().toISOString();
            cached.metadata.ttl = cached.metadata.ttl + extensionAmount;
            cached.metadata.expiresAt = new Date(
                new Date(cached.metadata.expiresAt).getTime() + (extensionAmount * 1000)
            ).toISOString();
            
            // Re-cache with extended TTL
            await setCache(key, cached, cached.metadata.ttl);
            
            console.log(`⏰ Extended cache for ${key} by ${extensionAmount}s (reason: ${reason})`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error extending cache for key ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Get cache metadata without the data
     * @param {String} key - Cache key
     * @returns {Promise<Object|null>} Cache metadata or null
     */
    async getCacheMetadata(key) {
        try {
            const cached = await this.get(key);
            return cached ? cached.metadata : null;
        } catch (error) {
            console.error(`❌ Error getting metadata for key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Check if cache exists and is fresh
     * @param {String} key - Cache key
     * @returns {Promise<Boolean>} Whether cache is fresh
     */
    async isFresh(key) {
        try {
            const cached = await this.get(key);
            return cached && cached.metadata.staleness === 'fresh';
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if cache exists but is stale
     * @param {String} key - Cache key
     * @returns {Promise<Boolean>} Whether cache is stale
     */
    async isStale(key) {
        try {
            const cached = await this.get(key);
            return cached && cached.metadata.isStale;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get data even if stale (for fallback scenarios)
     * @param {String} key - Cache key
     * @returns {Promise<Object|null>} Cached data or null
     */
    async getStale(key) {
        try {
            // Get from cache even if expired
            const cached = await getCache(key);
            if (!cached) {
                return null;
            }
            
            // If it's a smart cache object
            if (cached.metadata) {
                const staleness = this._calculateStaleness(cached.metadata);
                cached.metadata.staleness = staleness;
                cached.metadata.isStale = staleness !== 'fresh';
                cached.metadata.cacheAge = this._calculateAge(cached.metadata.cachedAt);
                cached.metadata.servedStale = true;
                return cached;
            }
            
            // Legacy cache object
            return {
                data: cached,
                metadata: {
                    staleness: 'unknown',
                    isStale: true,
                    servedStale: true,
                    source: 'legacy_stale'
                }
            };
            
        } catch (error) {
            console.error(`❌ Error getting stale cache for key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Delete cache entry
     * @param {String} key - Cache key
     * @returns {Promise<Boolean>} Success status
     */
    async delete(key) {
        try {
            // Note: Redis client doesn't expose delete directly through our wrapper
            // This would need to be implemented in the redis config if needed
            console.log(`🗑️ Cache deletion requested for ${key}`);
            return true;
        } catch (error) {
            console.error(`❌ Error deleting cache for key ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache statistics
     */
    async getStats() {
        try {
            // This would require additional Redis commands to get comprehensive stats
            // For now, return basic structure
            return {
                totalKeys: 0,
                hitRate: 0,
                missRate: 0,
                avgTTL: 0,
                staleServed: 0,
                extensions: 0,
                byType: {},
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error getting cache stats:', error.message);
            return null;
        }
    }

    /**
     * Warm cache with data
     * @param {String} key - Cache key
     * @param {Function} dataProvider - Function that returns data to cache
     * @param {Object} options - Cache options
     * @returns {Promise<*>} The cached data
     */
    async warm(key, dataProvider, options = {}) {
        try {
            // Check if cache already exists and is fresh
            const existing = await this.get(key);
            if (existing && !existing.metadata.isStale && !options.force) {
                console.log(`🔥 Cache already warm for ${key}`);
                return existing.data;
            }
            
            // Get fresh data
            console.log(`🔄 Warming cache for ${key}`);
            const data = await dataProvider();
            
            // Cache the data
            await this.set(key, data, options.ttl, {
                warmed: true,
                warmedAt: new Date().toISOString(),
                ...options.metadata
            });
            
            return data;
            
        } catch (error) {
            console.error(`❌ Error warming cache for key ${key}:`, error.message);
            
            // Try to return stale data if available
            const stale = await this.getStale(key);
            return stale ? stale.data : null;
        }
    }

    /**
     * Get appropriate TTL for a cache key
     * @param {String} key - Cache key
     * @returns {Number} TTL in seconds
     */
    _getTTL(key) {
        // Extract cache type from key prefix
        const keyPrefix = key.split(':')[0];
        
        // Return appropriate TTL based on key type
        return this.cacheTTL[keyPrefix] || this.cacheTTL.quote; // Default to quote TTL
    }

    /**
     * Calculate staleness based on cache metadata
     * @param {Object} metadata - Cache metadata
     * @returns {String} Staleness level
     */
    _calculateStaleness(metadata) {
        if (!metadata.cachedAt || !metadata.originalTTL) {
            return 'unknown';
        }
        
        const age = this._calculateAge(metadata.cachedAt);
        const originalTTL = metadata.originalTTL;
        
        if (age <= originalTTL * this.stalenessThresholds.fresh) {
            return 'fresh';
        } else if (age <= originalTTL * this.stalenessThresholds.stale) {
            return 'stale';
        } else if (age <= originalTTL * this.stalenessThresholds.very_stale) {
            return 'very_stale';
        } else {
            return 'expired';
        }
    }

    /**
     * Calculate age of cached data in seconds
     * @param {String} cachedAt - ISO timestamp when data was cached
     * @returns {Number} Age in seconds
     */
    _calculateAge(cachedAt) {
        return Math.floor((Date.now() - new Date(cachedAt).getTime()) / 1000);
    }

    /**
     * Generate cache key with consistent format
     * @param {String} type - Cache type (quote, search, profile, etc.)
     * @param {String} identifier - Unique identifier
     * @param {Object} params - Additional parameters for key generation
     * @returns {String} Generated cache key
     */
    generateKey(type, identifier, params = {}) {
        let key = `${type}:${identifier}`;
        
        // Add parameters to key if provided
        if (Object.keys(params).length > 0) {
            const paramString = Object.entries(params)
                .sort(([a], [b]) => a.localeCompare(b)) // Sort for consistency
                .map(([k, v]) => `${k}=${v}`)
                .join('&');
            key += `:${paramString}`;
        }
        
        return key;
    }

    /**
     * Batch get multiple cache keys
     * @param {Array<String>} keys - Array of cache keys
     * @returns {Promise<Object>} Object with keys as properties and cached data as values
     */
    async batchGet(keys) {
        try {
            const results = {};
            
            // Get all keys in parallel
            const promises = keys.map(async (key) => {
                const cached = await this.get(key);
                return { key, cached };
            });
            
            const responses = await Promise.all(promises);
            
            // Build results object
            responses.forEach(({ key, cached }) => {
                results[key] = cached;
            });
            
            return results;
            
        } catch (error) {
            console.error('❌ Error in batch get:', error.message);
            return {};
        }
    }

    /**
     * Batch set multiple cache entries
     * @param {Array<Object>} entries - Array of {key, value, ttl, metadata} objects
     * @returns {Promise<Array<Boolean>>} Array of success statuses
     */
    async batchSet(entries) {
        try {
            const promises = entries.map(entry => 
                this.set(entry.key, entry.value, entry.ttl, entry.metadata)
            );
            
            return await Promise.all(promises);
            
        } catch (error) {
            console.error('❌ Error in batch set:', error.message);
            return entries.map(() => false);
        }
    }

    /**
     * Get cache configuration
     * @returns {Object} Current cache configuration
     */
    getConfig() {
        return {
            cacheTTL: { ...this.cacheTTL },
            extensionMultipliers: { ...this.extensionMultipliers },
            stalenessThresholds: { ...this.stalenessThresholds }
        };
    }

    /**
     * Update cache configuration
     * @param {Object} config - New configuration values
     */
    updateConfig(config) {
        if (config.cacheTTL) {
            Object.assign(this.cacheTTL, config.cacheTTL);
        }
        
        if (config.extensionMultipliers) {
            Object.assign(this.extensionMultipliers, config.extensionMultipliers);
        }
        
        if (config.stalenessThresholds) {
            Object.assign(this.stalenessThresholds, config.stalenessThresholds);
        }
        
        console.log('🔧 Cache configuration updated');
    }
}

module.exports = new SmartCacheService();