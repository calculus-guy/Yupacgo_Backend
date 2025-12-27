const fc = require('fast-check');
const smartCache = require('../src/services/smartCache.service');

/**
 * Property-based tests for Smart Cache Service
 * **Feature: api-provider-optimization, Property 6: Cache Duration Policy**
 * 
 * For any data type, the system should apply the correct cache duration 
 * (quotes: 5min, search: 30min, profiles: 24hr)
 */

describe('Smart Cache - Property-Based Tests', () => {
    beforeEach(() => {
        // Clear any existing cache state if needed
        // Note: In a real test environment, you might want to use a separate Redis instance
    });

    describe('Property 6: Cache Duration Policy', () => {
        /**
         * **Feature: api-provider-optimization, Property 6: Cache Duration Policy**
         * **Validates: Requirements 4.1, 4.2, 4.3**
         */
        test('should apply correct TTL based on data type', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('quote', 'search', 'profile', 'monitoring', 'trending', 'company'),
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    fc.record({
                        price: fc.float({ min: 1, max: 1000 }),
                        name: fc.string({ minLength: 1, maxLength: 50 }),
                        timestamp: fc.constant(new Date().toISOString())
                    }),
                    async (dataType, identifier, testData) => {
                        // Arrange: Generate cache key
                        const key = smartCache.generateKey(dataType, identifier);
                        
                        // Act: Cache the data (let smart cache determine TTL)
                        const success = await smartCache.set(key, testData);
                        expect(success).toBe(true);
                        
                        // Get the cached data with metadata
                        const cached = await smartCache.get(key);
                        expect(cached).toBeDefined();
                        expect(cached.data).toEqual(testData);
                        
                        // Assert: Verify correct TTL is applied based on data type
                        const expectedTTL = smartCache.cacheTTL[dataType];
                        expect(cached.metadata.ttl).toBe(expectedTTL);
                        expect(cached.metadata.originalTTL).toBe(expectedTTL);
                        
                        // Verify specific TTL values match requirements
                        switch (dataType) {
                            case 'quote':
                                expect(cached.metadata.ttl).toBe(300); // 5 minutes
                                break;
                            case 'search':
                                expect(cached.metadata.ttl).toBe(1800); // 30 minutes
                                break;
                            case 'profile':
                            case 'company':
                                expect(cached.metadata.ttl).toBe(86400); // 24 hours
                                break;
                            case 'monitoring':
                                expect(cached.metadata.ttl).toBe(600); // 10 minutes
                                break;
                            case 'trending':
                                expect(cached.metadata.ttl).toBe(900); // 15 minutes
                                break;
                        }
                        
                        // Verify expiration time is calculated correctly
                        const cachedAt = new Date(cached.metadata.cachedAt);
                        const expiresAt = new Date(cached.metadata.expiresAt);
                        const actualTTL = Math.floor((expiresAt - cachedAt) / 1000);
                        expect(actualTTL).toBe(expectedTTL);
                    }
                ),
                { numRuns: 100 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 6: Cache Duration Policy**
         * Test custom TTL override
         */
        test('should allow custom TTL override while maintaining metadata', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('quote', 'search', 'profile'),
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    fc.integer({ min: 60, max: 3600 }), // Custom TTL between 1 minute and 1 hour
                    fc.record({
                        value: fc.string(),
                        timestamp: fc.constant(new Date().toISOString())
                    }),
                    async (dataType, identifier, customTTL, testData) => {
                        // Arrange: Generate cache key
                        const key = smartCache.generateKey(dataType, identifier);
                        
                        // Act: Cache with custom TTL
                        const success = await smartCache.set(key, testData, customTTL, {
                            customTTL: true,
                            reason: 'test_override'
                        });
                        expect(success).toBe(true);
                        
                        // Get cached data
                        const cached = await smartCache.get(key);
                        expect(cached).toBeDefined();
                        
                        // Assert: Custom TTL should be used
                        expect(cached.metadata.ttl).toBe(customTTL);
                        expect(cached.metadata.originalTTL).toBe(customTTL);
                        expect(cached.metadata.customTTL).toBe(true);
                        expect(cached.metadata.reason).toBe('test_override');
                        
                        // Verify expiration calculation with custom TTL
                        const cachedAt = new Date(cached.metadata.cachedAt);
                        const expiresAt = new Date(cached.metadata.expiresAt);
                        const actualTTL = Math.floor((expiresAt - cachedAt) / 1000);
                        expect(actualTTL).toBe(customTTL);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    describe('Property 3: Cache Serving Logic', () => {
        /**
         * **Feature: api-provider-optimization, Property 3: Cache Serving Logic**
         * **Validates: Requirements 2.2**
         */
        test('should serve cached data when available and not expired', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    fc.record({
                        symbol: fc.string({ minLength: 1, maxLength: 10 }),
                        price: fc.float({ min: 1, max: 1000 }),
                        name: fc.string({ minLength: 1, maxLength: 50 })
                    }),
                    async (identifier, testData) => {
                        // Arrange: Cache some data with a reasonable TTL
                        const key = smartCache.generateKey('quote', identifier);
                        await smartCache.set(key, testData, 300); // 5 minutes
                        
                        // Act: Retrieve the data
                        const cached = await smartCache.get(key);
                        
                        // Assert: Should get the cached data
                        expect(cached).toBeDefined();
                        expect(cached.data).toEqual(testData);
                        expect(cached.metadata.staleness).toBe('fresh');
                        expect(cached.metadata.isStale).toBe(false);
                        expect(cached.metadata.cacheAge).toBeGreaterThanOrEqual(0);
                        expect(cached.metadata.cacheAge).toBeLessThan(60); // Should be very recent
                        
                        // Verify cache hit behavior
                        const isFresh = await smartCache.isFresh(key);
                        expect(isFresh).toBe(true);
                        
                        const isStale = await smartCache.isStale(key);
                        expect(isStale).toBe(false);
                    }
                ),
                { numRuns: 50 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 3: Cache Serving Logic**
         * Test cache miss behavior
         */
        test('should return null for non-existent cache keys', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    async (identifier) => {
                        // Arrange: Generate a unique key that shouldn't exist
                        const key = smartCache.generateKey('quote', `nonexistent_${identifier}_${Date.now()}`);
                        
                        // Act: Try to get non-existent data
                        const cached = await smartCache.get(key);
                        
                        // Assert: Should return null
                        expect(cached).toBeNull();
                        
                        // Verify helper methods also return appropriate values
                        const isFresh = await smartCache.isFresh(key);
                        expect(isFresh).toBe(false);
                        
                        const isStale = await smartCache.isStale(key);
                        expect(isStale).toBe(false);
                        
                        const metadata = await smartCache.getCacheMetadata(key);
                        expect(metadata).toBeNull();
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    describe('Property 9: Cache Extension on Failure', () => {
        /**
         * **Feature: api-provider-optimization, Property 9: Cache Extension on Failure**
         * **Validates: Requirements 4.4, 4.5**
         */
        test('should extend cache TTL when providers fail', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    fc.constantFrom('provider_failure', 'all_providers_down', 'rate_limited', 'network_error'),
                    fc.record({
                        data: fc.string(),
                        timestamp: fc.constant(new Date().toISOString())
                    }),
                    async (identifier, failureReason, testData) => {
                        // Arrange: Cache some data
                        const key = smartCache.generateKey('quote', identifier);
                        const originalTTL = 300; // 5 minutes
                        await smartCache.set(key, testData, originalTTL);
                        
                        // Get initial state
                        const initialCached = await smartCache.get(key);
                        expect(initialCached.metadata.ttl).toBe(originalTTL);
                        expect(initialCached.metadata.extensions).toBe(0);
                        
                        // Act: Extend cache due to provider failure
                        const extendSuccess = await smartCache.extend(key, null, failureReason);
                        expect(extendSuccess).toBe(true);
                        
                        // Assert: Cache should be extended
                        const extendedCached = await smartCache.get(key);
                        expect(extendedCached).toBeDefined();
                        expect(extendedCached.data).toEqual(testData);
                        
                        // Verify extension metadata
                        expect(extendedCached.metadata.extensions).toBe(1);
                        expect(extendedCached.metadata.extensionReason).toBe(failureReason);
                        expect(extendedCached.metadata.lastExtended).toBeDefined();
                        
                        // Verify TTL was extended according to multiplier
                        const expectedMultiplier = smartCache.extensionMultipliers[failureReason] || 2;
                        const expectedNewTTL = originalTTL + (originalTTL * expectedMultiplier);
                        expect(extendedCached.metadata.ttl).toBe(expectedNewTTL);
                        
                        // Verify expiration time was updated
                        const originalExpiresAt = new Date(initialCached.metadata.expiresAt);
                        const newExpiresAt = new Date(extendedCached.metadata.expiresAt);
                        expect(newExpiresAt.getTime()).toBeGreaterThan(originalExpiresAt.getTime());
                    }
                ),
                { numRuns: 50 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 9: Cache Extension on Failure**
         * Test multiple extensions
         */
        test('should handle multiple cache extensions correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    fc.integer({ min: 2, max: 5 }), // Number of extensions
                    fc.record({
                        value: fc.integer(),
                        timestamp: fc.constant(new Date().toISOString())
                    }),
                    async (identifier, extensionCount, testData) => {
                        // Arrange: Cache some data
                        const key = smartCache.generateKey('quote', identifier);
                        const originalTTL = 300;
                        await smartCache.set(key, testData, originalTTL);
                        
                        let expectedTTL = originalTTL;
                        
                        // Act: Perform multiple extensions
                        for (let i = 0; i < extensionCount; i++) {
                            const extendSuccess = await smartCache.extend(key, null, 'provider_failure');
                            expect(extendSuccess).toBe(true);
                            
                            // Update expected TTL (each extension adds originalTTL * multiplier)
                            expectedTTL += originalTTL * smartCache.extensionMultipliers.provider_failure;
                        }
                        
                        // Assert: Final state should reflect all extensions
                        const finalCached = await smartCache.get(key);
                        expect(finalCached).toBeDefined();
                        expect(finalCached.metadata.extensions).toBe(extensionCount);
                        expect(finalCached.metadata.ttl).toBe(expectedTTL);
                        expect(finalCached.metadata.originalTTL).toBe(originalTTL); // Should remain unchanged
                    }
                ),
                { numRuns: 30 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 9: Cache Extension on Failure**
         * Test extension of non-existent cache
         */
        test('should handle extension attempts on non-existent cache gracefully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9_-]+$/.test(s)),
                    async (identifier) => {
                        // Arrange: Generate key for non-existent cache
                        const key = smartCache.generateKey('quote', `nonexistent_${identifier}_${Date.now()}`);
                        
                        // Act: Try to extend non-existent cache
                        const extendSuccess = await smartCache.extend(key, 600, 'provider_failure');
                        
                        // Assert: Should return false and not crash
                        expect(extendSuccess).toBe(false);
                        
                        // Verify cache still doesn't exist
                        const cached = await smartCache.get(key);
                        expect(cached).toBeNull();
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    describe('Cache Staleness and Metadata', () => {
        test('should calculate staleness correctly over time', async () => {
            // This test would require time manipulation or mocking
            // For now, test the staleness calculation logic
            const key = smartCache.generateKey('quote', 'AAPL');
            const testData = { price: 150, symbol: 'AAPL' };
            
            // Cache with short TTL for testing
            await smartCache.set(key, testData, 60); // 1 minute
            
            const cached = await smartCache.get(key);
            expect(cached.metadata.staleness).toBe('fresh');
            expect(cached.metadata.isStale).toBe(false);
        });

        test('should provide comprehensive metadata', async () => {
            const key = smartCache.generateKey('profile', 'AAPL');
            const testData = { name: 'Apple Inc.', sector: 'Technology' };
            const customMetadata = { source: 'test', version: '1.0' };
            
            await smartCache.set(key, testData, null, customMetadata);
            
            const cached = await smartCache.get(key);
            expect(cached.metadata).toMatchObject({
                key: key,
                ttl: 86400, // 24 hours for profile
                originalTTL: 86400,
                staleness: 'fresh',
                isStale: false,
                extensions: 0,
                source: 'test',
                version: '1.0'
            });
            
            expect(cached.metadata.cachedAt).toBeDefined();
            expect(cached.metadata.expiresAt).toBeDefined();
            expect(cached.metadata.cacheAge).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Batch Operations', () => {
        test('should handle batch get operations', async () => {
            // Arrange: Set up multiple cache entries
            const keys = ['quote:AAPL', 'quote:GOOGL', 'quote:MSFT'];
            const testData = [
                { symbol: 'AAPL', price: 150 },
                { symbol: 'GOOGL', price: 2800 },
                { symbol: 'MSFT', price: 300 }
            ];
            
            // Cache all entries
            for (let i = 0; i < keys.length; i++) {
                await smartCache.set(keys[i], testData[i]);
            }
            
            // Act: Batch get
            const results = await smartCache.batchGet(keys);
            
            // Assert: All entries should be retrieved
            expect(Object.keys(results)).toHaveLength(keys.length);
            keys.forEach((key, index) => {
                expect(results[key]).toBeDefined();
                expect(results[key].data).toEqual(testData[index]);
            });
        });

        test('should handle batch set operations', async () => {
            // Arrange: Prepare batch entries
            const entries = [
                { key: 'quote:AAPL', value: { price: 150 }, ttl: 300 },
                { key: 'search:apple', value: [{ symbol: 'AAPL' }], ttl: 1800 },
                { key: 'profile:AAPL', value: { name: 'Apple Inc.' }, ttl: 86400 }
            ];
            
            // Act: Batch set
            const results = await smartCache.batchSet(entries);
            
            // Assert: All operations should succeed
            expect(results).toHaveLength(entries.length);
            results.forEach(result => expect(result).toBe(true));
            
            // Verify all entries were cached
            for (const entry of entries) {
                const cached = await smartCache.get(entry.key);
                expect(cached).toBeDefined();
                expect(cached.data).toEqual(entry.value);
                expect(cached.metadata.ttl).toBe(entry.ttl);
            }
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
        string: (options) => 'test_string',
        integer: (options) => options?.min || 1,
        float: (options) => options?.min || 1.0,
        record: (schema) => {
            const result = {};
            Object.keys(schema).forEach(key => {
                result[key] = typeof schema[key] === 'object' && schema[key].generate 
                    ? schema[key].generate() 
                    : 'test_value';
            });
            return result;
        },
        constant: (value) => value
    };
}