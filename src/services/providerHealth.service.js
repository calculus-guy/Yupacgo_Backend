const { getCache, setCache } = require("../config/redis");

/**
 * Provider Health Service
 * Monitors provider performance and manages health scoring
 */
class ProviderHealthService {
    constructor() {
        this.healthMetrics = new Map();
        this.healthThresholds = {
            healthy: 0.8,
            degraded: 0.5,
            failing: 0.2
        };
        
        // Health calculation weights
        this.weights = {
            responseTime: 0.3,
            errorRate: 0.4,
            availability: 0.3
        };
        
        // Performance benchmarks (in milliseconds)
        this.responseBenchmarks = {
            excellent: 200,
            good: 500,
            acceptable: 1000,
            poor: 2000
        };
    }

    /**
     * Record a provider response for health tracking
     * @param {String} provider - Provider name
     * @param {Number} responseTime - Response time in milliseconds
     * @param {Boolean} success - Whether the request was successful
     * @param {String} errorType - Type of error if failed (optional)
     */
    async recordResponse(provider, responseTime, success, errorType = null) {
        try {
            const now = Date.now();
            const metrics = await this.getProviderMetrics(provider);
            
            // Update response time metrics
            metrics.responseTimes.push({
                time: responseTime,
                timestamp: now
            });
            
            // Keep only last 100 response times for rolling average
            if (metrics.responseTimes.length > 100) {
                metrics.responseTimes = metrics.responseTimes.slice(-100);
            }
            
            // Update success/error tracking
            metrics.requests.push({
                success,
                timestamp: now,
                errorType: errorType
            });
            
            // Keep only last 200 requests for rolling metrics
            if (metrics.requests.length > 200) {
                metrics.requests = metrics.requests.slice(-200);
            }
            
            // Update consecutive counters
            if (success) {
                metrics.consecutiveSuccesses++;
                metrics.consecutiveFailures = 0;
            } else {
                metrics.consecutiveFailures++;
                metrics.consecutiveSuccesses = 0;
                metrics.lastError = {
                    timestamp: now,
                    type: errorType,
                    responseTime
                };
            }
            
            // Calculate and update health score
            const healthScore = this.calculateHealthScore(metrics);
            metrics.healthScore = healthScore;
            metrics.status = this.getStatusFromScore(healthScore);
            metrics.lastUpdated = now;
            
            // Cache updated metrics
            await this.cacheProviderMetrics(provider, metrics);
            
            console.log(`📊 ${provider} health updated: score=${healthScore.toFixed(3)}, status=${metrics.status}, consecutive_failures=${metrics.consecutiveFailures}`);
            
            return metrics;
            
        } catch (error) {
            console.error(`❌ Error recording response for ${provider}:`, error.message);
        }
    }

    /**
     * Calculate health score based on multiple factors
     * @param {Object} metrics - Provider metrics
     * @returns {Number} Health score between 0 and 1
     */
    calculateHealthScore(metrics) {
        if (metrics.requests.length === 0) {
            return 1.0; // Default to healthy if no data
        }
        
        // Calculate error rate (last 50 requests for recent performance)
        const recentRequests = metrics.requests.slice(-50);
        const errorRate = recentRequests.filter(r => !r.success).length / recentRequests.length;
        const errorScore = Math.max(0, 1 - (errorRate * 2)); // Penalize errors heavily
        
        // Calculate response time score
        const recentResponseTimes = metrics.responseTimes.slice(-20);
        const avgResponseTime = recentResponseTimes.length > 0
            ? recentResponseTimes.reduce((sum, r) => sum + r.time, 0) / recentResponseTimes.length
            : 500; // Default to acceptable
            
        let responseScore = 1.0;
        if (avgResponseTime > this.responseBenchmarks.poor) {
            responseScore = 0.2;
        } else if (avgResponseTime > this.responseBenchmarks.acceptable) {
            responseScore = 0.5;
        } else if (avgResponseTime > this.responseBenchmarks.good) {
            responseScore = 0.8;
        } else if (avgResponseTime <= this.responseBenchmarks.excellent) {
            responseScore = 1.0;
        }
        
        // Calculate availability score (based on recent uptime)
        const recentWindow = Date.now() - (30 * 60 * 1000); // Last 30 minutes
        const recentRequestsInWindow = metrics.requests.filter(r => r.timestamp > recentWindow);
        const availabilityScore = recentRequestsInWindow.length > 0
            ? recentRequestsInWindow.filter(r => r.success).length / recentRequestsInWindow.length
            : 1.0;
        
        // Apply consecutive failure penalty
        let consecutiveFailurePenalty = 1.0;
        if (metrics.consecutiveFailures > 0) {
            consecutiveFailurePenalty = Math.max(0.1, 1 - (metrics.consecutiveFailures * 0.2));
        }
        
        // Weighted health score
        const baseScore = (
            errorScore * this.weights.errorRate +
            responseScore * this.weights.responseTime +
            availabilityScore * this.weights.availability
        );
        
        return Math.max(0, Math.min(1, baseScore * consecutiveFailurePenalty));
    }

    /**
     * Get status from health score
     * @param {Number} healthScore - Health score between 0 and 1
     * @returns {String} Status string
     */
    getStatusFromScore(healthScore) {
        if (healthScore >= this.healthThresholds.healthy) return "healthy";
        if (healthScore >= this.healthThresholds.degraded) return "degraded";
        if (healthScore >= this.healthThresholds.failing) return "failing";
        return "critical";
    }

    /**
     * Get provider metrics from cache or initialize new ones
     * @param {String} provider - Provider name
     * @returns {Promise<Object>} Provider metrics
     */
    async getProviderMetrics(provider) {
        const cacheKey = `provider_health:${provider}`;
        let metrics = await getCache(cacheKey);
        
        if (!metrics) {
            metrics = {
                provider,
                healthScore: 1.0,
                status: "healthy",
                responseTimes: [],
                requests: [],
                consecutiveSuccesses: 0,
                consecutiveFailures: 0,
                lastError: null,
                lastUpdated: Date.now(),
                createdAt: Date.now()
            };
        }
        
        return metrics;
    }

    /**
     * Cache provider metrics
     * @param {String} provider - Provider name
     * @param {Object} metrics - Metrics to cache
     */
    async cacheProviderMetrics(provider, metrics) {
        const cacheKey = `provider_health:${provider}`;
        // Cache for 24 hours
        await setCache(cacheKey, metrics, 86400);
    }

    /**
     * Get health score for a specific provider
     * @param {String} provider - Provider name
     * @returns {Promise<Number>} Health score
     */
    async getHealthScore(provider) {
        const metrics = await this.getProviderMetrics(provider);
        return metrics.healthScore;
    }

    /**
     * Check if provider should be used based on health
     * @param {String} provider - Provider name
     * @returns {Promise<Boolean>} Whether provider should be used
     */
    async shouldUseProvider(provider) {
        const metrics = await this.getProviderMetrics(provider);
        
        // Don't use if health is critical or has too many consecutive failures
        if (metrics.healthScore < this.healthThresholds.failing) {
            return false;
        }
        
        if (metrics.consecutiveFailures >= 5) {
            return false;
        }
        
        return true;
    }

    /**
     * Get comprehensive provider statistics
     * @param {String} provider - Provider name (optional)
     * @returns {Promise<Object>} Provider statistics
     */
    async getProviderStats(provider = null) {
        if (provider) {
            return await this.getSingleProviderStats(provider);
        }
        
        // Get stats for all known providers
        const providers = ['finnhub', 'twelvedata', 'alphavantage'];
        const stats = {};
        
        for (const providerName of providers) {
            stats[providerName] = await this.getSingleProviderStats(providerName);
        }
        
        return stats;
    }

    /**
     * Get statistics for a single provider
     * @param {String} provider - Provider name
     * @returns {Promise<Object>} Provider statistics
     */
    async getSingleProviderStats(provider) {
        const metrics = await this.getProviderMetrics(provider);
        
        // Calculate response time statistics
        const responseTimes = metrics.responseTimes.map(r => r.time);
        const responseStats = this.calculateResponseTimeStats(responseTimes);
        
        // Calculate error rate statistics
        const recentRequests = metrics.requests.slice(-100);
        const totalRequests = recentRequests.length;
        const successfulRequests = recentRequests.filter(r => r.success).length;
        const errorRate = totalRequests > 0 ? (totalRequests - successfulRequests) / totalRequests : 0;
        
        // Calculate uptime (last 24 hours)
        const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
        const recentRequestsIn24h = metrics.requests.filter(r => r.timestamp > last24Hours);
        const uptime = recentRequestsIn24h.length > 0
            ? recentRequestsIn24h.filter(r => r.success).length / recentRequestsIn24h.length
            : 1.0;
        
        // Error type breakdown
        const errorTypes = {};
        metrics.requests
            .filter(r => !r.success && r.errorType)
            .forEach(r => {
                errorTypes[r.errorType] = (errorTypes[r.errorType] || 0) + 1;
            });
        
        return {
            provider,
            healthScore: metrics.healthScore,
            status: metrics.status,
            responseTime: responseStats,
            errorRate: {
                current: errorRate,
                total: totalRequests - successfulRequests,
                percentage: Math.round(errorRate * 100)
            },
            uptime: {
                percentage: Math.round(uptime * 100),
                last24h: uptime
            },
            consecutiveFailures: metrics.consecutiveFailures,
            consecutiveSuccesses: metrics.consecutiveSuccesses,
            totalRequests: metrics.requests.length,
            successfulRequests: metrics.requests.filter(r => r.success).length,
            lastError: metrics.lastError,
            lastUpdated: metrics.lastUpdated,
            errorTypes,
            recommendations: this.getProviderRecommendations(metrics)
        };
    }

    /**
     * Calculate response time statistics
     * @param {Array} responseTimes - Array of response times
     * @returns {Object} Response time statistics
     */
    calculateResponseTimeStats(responseTimes) {
        if (responseTimes.length === 0) {
            return {
                average: 0,
                median: 0,
                p95: 0,
                p99: 0,
                min: 0,
                max: 0,
                samples: 0
            };
        }
        
        const sorted = [...responseTimes].sort((a, b) => a - b);
        const sum = responseTimes.reduce((a, b) => a + b, 0);
        
        return {
            average: Math.round(sum / responseTimes.length),
            median: Math.round(sorted[Math.floor(sorted.length / 2)]),
            p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
            p99: Math.round(sorted[Math.floor(sorted.length * 0.99)]),
            min: Math.round(Math.min(...responseTimes)),
            max: Math.round(Math.max(...responseTimes)),
            samples: responseTimes.length
        };
    }

    /**
     * Get recommendations for provider health improvement
     * @param {Object} metrics - Provider metrics
     * @returns {Array} Array of recommendations
     */
    getProviderRecommendations(metrics) {
        const recommendations = [];
        
        if (metrics.healthScore < this.healthThresholds.degraded) {
            recommendations.push("Provider health is degraded. Consider temporary deprioritization.");
        }
        
        if (metrics.consecutiveFailures >= 3) {
            recommendations.push("Multiple consecutive failures detected. Check provider status.");
        }
        
        const recentResponseTimes = metrics.responseTimes.slice(-10);
        if (recentResponseTimes.length > 0) {
            const avgResponseTime = recentResponseTimes.reduce((sum, r) => sum + r.time, 0) / recentResponseTimes.length;
            if (avgResponseTime > this.responseBenchmarks.acceptable) {
                recommendations.push("Response times are slower than acceptable. Monitor provider performance.");
            }
        }
        
        const recentRequests = metrics.requests.slice(-20);
        const recentErrorRate = recentRequests.filter(r => !r.success).length / recentRequests.length;
        if (recentErrorRate > 0.2) {
            recommendations.push("High error rate detected. Investigate provider issues.");
        }
        
        if (recommendations.length === 0) {
            recommendations.push("Provider is performing well.");
        }
        
        return recommendations;
    }

    /**
     * Reset health metrics for a provider
     * @param {String} provider - Provider name
     */
    async resetProviderHealth(provider) {
        const cacheKey = `provider_health:${provider}`;
        const metrics = {
            provider,
            healthScore: 1.0,
            status: "healthy",
            responseTimes: [],
            requests: [],
            consecutiveSuccesses: 0,
            consecutiveFailures: 0,
            lastError: null,
            lastUpdated: Date.now(),
            createdAt: Date.now()
        };
        
        await this.cacheProviderMetrics(provider, metrics);
        console.log(`🔄 Reset health metrics for ${provider}`);
    }

    /**
     * Get provider health summary for dashboard
     * @returns {Promise<Object>} Health summary
     */
    async getHealthSummary() {
        const providers = ['finnhub', 'twelvedata', 'alphavantage'];
        const summary = {
            overall: {
                healthy: 0,
                degraded: 0,
                failing: 0,
                critical: 0
            },
            providers: {},
            lastUpdated: Date.now()
        };
        
        for (const provider of providers) {
            const stats = await this.getSingleProviderStats(provider);
            summary.providers[provider] = {
                healthScore: stats.healthScore,
                status: stats.status,
                responseTime: stats.responseTime.average,
                errorRate: stats.errorRate.percentage,
                uptime: stats.uptime.percentage
            };
            
            summary.overall[stats.status]++;
        }
        
        return summary;
    }

    /**
     * Check if any provider needs attention
     * @returns {Promise<Array>} Array of alerts
     */
    async getHealthAlerts() {
        const providers = ['finnhub', 'twelvedata', 'alphavantage'];
        const alerts = [];
        
        for (const provider of providers) {
            const metrics = await this.getProviderMetrics(provider);
            
            if (metrics.healthScore < this.healthThresholds.failing) {
                alerts.push({
                    type: 'critical',
                    provider,
                    message: `${provider} health is critical (${(metrics.healthScore * 100).toFixed(1)}%)`,
                    timestamp: Date.now()
                });
            } else if (metrics.consecutiveFailures >= 5) {
                alerts.push({
                    type: 'warning',
                    provider,
                    message: `${provider} has ${metrics.consecutiveFailures} consecutive failures`,
                    timestamp: Date.now()
                });
            } else if (metrics.healthScore < this.healthThresholds.degraded) {
                alerts.push({
                    type: 'info',
                    provider,
                    message: `${provider} performance is degraded (${(metrics.healthScore * 100).toFixed(1)}%)`,
                    timestamp: Date.now()
                });
            }
        }
        
        return alerts;
    }
}

module.exports = new ProviderHealthService();