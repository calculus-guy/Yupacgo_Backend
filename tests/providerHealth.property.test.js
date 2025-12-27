const fc = require('fast-check');
const providerHealth = require('../src/services/providerHealth.service');

/**
 * Property-based tests for Provider Health Service
 * **Feature: api-provider-optimization, Property 7: Provider Health Management**
 * 
 * For any provider showing consistent failures, the system should temporarily 
 * deprioritize it and gradually restore priority when health improves
 */

describe('Provider Health - Property-Based Tests', () => {
    beforeEach(async () => {
        // Reset health for all providers before each test
        await providerHealth.resetProviderHealth('finnhub');
        await providerHealth.resetProviderHealth('twelvedata');
        await providerHealth.resetProviderHealth('alphavantage');
    });

    describe('Property 7: Provider Health Management', () => {
        /**
         * **Feature: api-provider-optimization, Property 7: Provider Health Management**
         * **Validates: Requirements 5.1, 5.2, 5.3**
         */
        test('should degrade health score on consecutive failures', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('finnhub', 'twelvedata', 'alphavantage'),
                    fc.integer({ min: 1, max: 10 }), // Number of consecutive failures
                    fc.integer({ min: 100, max: 2000 }), // Response time
                    async (provider, failureCount, responseTime) => {
                        // Arrange: Start with healthy provider
                        const initialHealth = await providerHealth.getHealthScore(provider);
                        expect(initialHealth).toBe(1.0);

                        // Act: Record consecutive failures
                        for (let i = 0; i < failureCount; i++) {
                            await providerHealth.recordResponse(provider, responseTime, false, 'timeout');
                        }

                        // Assert: Health should degrade
                        const degradedHealth = await providerHealth.getHealthScore(provider);
                        expect(degradedHealth).toBeLessThan(initialHealth);
                        
                        // More failures should result in lower health
                        if (failureCount >= 5) {
                            expect(degradedHealth).toBeLessThan(0.5); // Should be degraded
                        }
                        
                        if (failureCount >= 8) {
                            expect(degradedHealth).toBeLessThan(0.2); // Should be failing
                        }

                        // Verify provider should not be used if health is too low
                        const shouldUse = await providerHealth.shouldUseProvider(provider);
                        if (degradedHealth < 0.2 || failureCount >= 5) {
                            expect(shouldUse).toBe(false);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 7: Provider Health Management**
         * Test health recovery on successful responses
         */
        test('should gradually restore health on successful responses', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('finnhub', 'twelvedata', 'alphavantage'),
                    fc.integer({ min: 3, max: 8 }), // Initial failures
                    fc.integer({ min: 5, max: 15 }), // Recovery successes
                    fc.integer({ min: 100, max: 500 }), // Good response time
                    async (provider, initialFailures, recoverySuccesses, responseTime) => {
                        // Arrange: Degrade provider health first
                        for (let i = 0; i < initialFailures; i++) {
                            await providerHealth.recordResponse(provider, 2000, false, 'error');
                        }
                        
                        const degradedHealth = await providerHealth.getHealthScore(provider);
                        expect(degradedHealth).toBeLessThan(1.0);

                        // Act: Record successful responses
                        for (let i = 0; i < recoverySuccesses; i++) {
                            await providerHealth.recordResponse(provider, responseTime, true);
                        }

                        // Assert: Health should improve
                        const recoveredHealth = await providerHealth.getHealthScore(provider);
                        expect(recoveredHealth).toBeGreaterThan(degradedHealth);
                        
                        // With enough successes, should become usable again
                        if (recoverySuccesses >= 10) {
                            const shouldUse = await providerHealth.shouldUseProvider(provider);
                            expect(shouldUse).toBe(true);
                        }
                        
                        // Health should trend toward 1.0 with consistent success
                        if (recoverySuccesses >= 15 && responseTime <= 300) {
                            expect(recoveredHealth).toBeGreaterThan(0.8);
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 7: Provider Health Management**
         * Test response time impact on health
         */
        test('should factor response time into health calculation', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('finnhub', 'twelvedata', 'alphavantage'),
                    fc.integer({ min: 5, max: 20 }), // Number of requests
                    async (provider, requestCount) => {
                        // Arrange & Act: Record responses with different response times
                        const fastResponseTime = 150; // Excellent
                        const slowResponseTime = 2500; // Poor
                        
                        // Test fast responses
                        await providerHealth.resetProviderHealth(provider);
                        for (let i = 0; i < requestCount; i++) {
                            await providerHealth.recordResponse(provider, fastResponseTime, true);
                        }
                        const fastHealth = await providerHealth.getHealthScore(provider);
                        
                        // Test slow responses
                        await providerHealth.resetProviderHealth(provider);
                        for (let i = 0; i < requestCount; i++) {
                            await providerHealth.recordResponse(provider, slowResponseTime, true);
                        }
                        const slowHealth = await providerHealth.getHealthScore(provider);
                        
                        // Assert: Fast responses should result in better health
                        expect(fastHealth).toBeGreaterThan(slowHealth);
                        expect(fastHealth).toBeGreaterThan(0.9); // Should be excellent
                        expect(slowHealth).toBeLessThan(0.8); // Should be degraded due to slow responses
                    }
                ),
                { numRuns: 30 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 7: Provider Health Management**
         * Test error type tracking
         */
        test('should track different error types and their impact', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('finnhub', 'twelvedata', 'alphavantage'),
                    fc.constantFrom('timeout', 'rate_limit', 'auth_error', 'server_error', 'network_error'),
                    fc.integer({ min: 2, max: 8 }),
                    async (provider, errorType, errorCount) => {
                        // Arrange: Start with healthy provider
                        await providerHealth.resetProviderHealth(provider);
                        
                        // Act: Record specific error types
                        for (let i = 0; i < errorCount; i++) {
                            await providerHealth.recordResponse(provider, 1000, false, errorType);
                        }
                        
                        // Assert: Health should degrade and error type should be tracked
                        const stats = await providerHealth.getProviderStats(provider);
                        expect(stats.healthScore).toBeLessThan(1.0);
                        expect(stats.errorTypes[errorType]).toBe(errorCount);
                        expect(stats.errorRate.total).toBe(errorCount);
                        
                        // Different error types might have different impacts
                        if (errorType === 'rate_limit' && errorCount >= 3) {
                            expect(stats.healthScore).toBeLessThan(0.6);
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 7: Provider Health Management**
         * Test health status transitions
         */
        test('should transition status based on health score thresholds', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('finnhub', 'twelvedata', 'alphavantage'),
                    async (provider) => {
                        // Test healthy -> degraded transition
                        await providerHealth.resetProviderHealth(provider);
                        
                        // Record some failures to degrade health
                        for (let i = 0; i < 3; i++) {
                            await providerHealth.recordResponse(provider, 1500, false, 'timeout');
                        }
                        
                        let stats = await providerHealth.getProviderStats(provider);
                        if (stats.healthScore < 0.8 && stats.healthScore >= 0.5) {
                            expect(stats.status).toBe('degraded');
                        }
                        
                        // Record more failures to reach failing status
                        for (let i = 0; i < 4; i++) {
                            await providerHealth.recordResponse(provider, 2000, false, 'error');
                        }
                        
                        stats = await providerHealth.getProviderStats(provider);
                        if (stats.healthScore < 0.5 && stats.healthScore >= 0.2) {
                            expect(stats.status).toBe('failing');
                        }
                        
                        // Record even more failures for critical status
                        for (let i = 0; i < 5; i++) {
                            await providerHealth.recordResponse(provider, 3000, false, 'critical_error');
                        }
                        
                        stats = await providerHealth.getProviderStats(provider);
                        if (stats.healthScore < 0.2) {
                            expect(stats.status).toBe('critical');
                        }
                        
                        // Verify shouldUseProvider respects status
                        const shouldUse = await providerHealth.shouldUseProvider(provider);
                        if (stats.status === 'critical' || stats.consecutiveFailures >= 5) {
                            expect(shouldUse).toBe(false);
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 7: Provider Health Management**
         * Test health metrics persistence and retrieval
         */
        test('should persist and retrieve health metrics correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('finnhub', 'twelvedata', 'alphavantage'),
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 100, max: 1000 }),
                    fc.boolean(),
                    async (provider, requestCount, responseTime, success) => {
                        // Arrange: Reset provider
                        await providerHealth.resetProviderHealth(provider);
                        
                        // Act: Record some responses
                        for (let i = 0; i < requestCount; i++) {
                            await providerHealth.recordResponse(
                                provider, 
                                responseTime + (i * 10), // Vary response time slightly
                                success,
                                success ? null : 'test_error'
                            );
                        }
                        
                        // Assert: Metrics should be retrievable and consistent
                        const stats = await providerHealth.getProviderStats(provider);
                        expect(stats.provider).toBe(provider);
                        expect(stats.totalRequests).toBeGreaterThanOrEqual(requestCount);
                        
                        if (success) {
                            expect(stats.successfulRequests).toBeGreaterThanOrEqual(requestCount);
                            expect(stats.errorRate.total).toBe(0);
                            expect(stats.consecutiveSuccesses).toBeGreaterThanOrEqual(requestCount);
                            expect(stats.consecutiveFailures).toBe(0);
                        } else {
                            expect(stats.errorRate.total).toBeGreaterThanOrEqual(requestCount);
                            expect(stats.consecutiveFailures).toBeGreaterThanOrEqual(requestCount);
                            expect(stats.consecutiveSuccesses).toBe(0);
                        }
                        
                        // Response time should be tracked
                        expect(stats.responseTime.samples).toBeGreaterThanOrEqual(requestCount);
                        expect(stats.responseTime.average).toBeGreaterThan(0);
                    }
                ),
                { numRuns: 40 }
            );
        });
    });

    describe('Health Summary and Alerts', () => {
        test('should generate appropriate health alerts', async () => {
            // Arrange: Create different health scenarios
            await providerHealth.resetProviderHealth('finnhub');
            await providerHealth.resetProviderHealth('twelvedata');
            await providerHealth.resetProviderHealth('alphavantage');
            
            // Make finnhub critical
            for (let i = 0; i < 10; i++) {
                await providerHealth.recordResponse('finnhub', 3000, false, 'critical_error');
            }
            
            // Make twelvedata degraded
            for (let i = 0; i < 4; i++) {
                await providerHealth.recordResponse('twelvedata', 1500, false, 'timeout');
            }
            
            // Keep alphavantage healthy
            for (let i = 0; i < 5; i++) {
                await providerHealth.recordResponse('alphavantage', 200, true);
            }
            
            // Act: Get alerts
            const alerts = await providerHealth.getHealthAlerts();
            
            // Assert: Should have appropriate alerts
            expect(alerts.length).toBeGreaterThan(0);
            
            const criticalAlerts = alerts.filter(a => a.type === 'critical');
            const warningAlerts = alerts.filter(a => a.type === 'warning');
            
            expect(criticalAlerts.some(a => a.provider === 'finnhub')).toBe(true);
            expect(alerts.some(a => a.provider === 'alphavantage')).toBe(false); // Should be healthy
        });

        test('should provide comprehensive health summary', async () => {
            // Arrange: Set up different provider states
            await providerHealth.resetProviderHealth('finnhub');
            await providerHealth.resetProviderHealth('twelvedata');
            await providerHealth.resetProviderHealth('alphavantage');
            
            // Act: Get summary
            const summary = await providerHealth.getHealthSummary();
            
            // Assert: Summary should contain all providers
            expect(summary.providers).toHaveProperty('finnhub');
            expect(summary.providers).toHaveProperty('twelvedata');
            expect(summary.providers).toHaveProperty('alphavantage');
            expect(summary.overall).toHaveProperty('healthy');
            expect(summary.overall).toHaveProperty('degraded');
            expect(summary.overall).toHaveProperty('failing');
            expect(summary.overall).toHaveProperty('critical');
            expect(summary.lastUpdated).toBeDefined();
        });
    });
});

// Mock fast-check if not available
if (typeof fc === 'undefined') {
    global.fc = {
        assert: async (property, options) => {
            const numRuns = Math.min(options?.numRuns || 10, 5);
            for (let i = 0; i < numRuns; i++) {
                await property.predicate();
            }
        },
        asyncProperty: (...args) => {
            const predicate = args[args.length - 1];
            return { predicate };
        },
        constantFrom: (...values) => values[0],
        integer: (options) => options?.min || 1,
        boolean: () => true
    };
}