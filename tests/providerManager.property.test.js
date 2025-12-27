const fc = require('fast-check');
const providerManager = require('../src/services/providerManager.service');

/**
 * Property-based tests for Provider Manager Service
 * **Feature: api-provider-optimization, Property 1: Provider Fallback Chain**
 * 
 * For any stock data request, when providers fail in sequence, 
 * the system should automatically try the next provider in priority order 
 * (Finnhub → TwelveData → AlphaVantage → Cache)
 */

describe('Provider Manager - Property-Based Tests', () => {
    beforeEach(() => {
        // Reset all provider health before each test
        providerManager.resetProviderHealth('finnhub');
        providerManager.resetProviderHealth('twelvedata');
        providerManager.resetProviderHealth('alphavantage');
    });

    describe('Property 1: Provider Fallback Chain', () => {
        /**
         * **Feature: api-provider-optimization, Property 1: Provider Fallback Chain**
         * **Validates: Requirements 1.1, 1.2, 1.4**
         */
        test('should follow provider priority order when providers fail', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)), // Valid stock symbols
                    fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), // Provider availability [finnhub, twelvedata, alphavantage]
                    async (symbol, providerAvailability) => {
                        // Arrange: Set up provider availability
                        const [finnhubAvailable, twelvedataAvailable, alphavantageAvailable] = providerAvailability;
                        
                        // Mock provider responses based on availability
                        const originalAdapters = {};
                        const providers = providerManager.providers;
                        
                        providers.forEach((provider, index) => {
                            originalAdapters[provider.name] = provider.adapter.getQuote;
                            
                            if (providerAvailability[index]) {
                                // Provider is available - return mock data
                                provider.adapter.getQuote = jest.fn().mockResolvedValue({
                                    symbol: symbol,
                                    price: 100 + Math.random() * 50,
                                    name: `${symbol} Inc.`,
                                    exchange: 'NASDAQ',
                                    provider: provider.name
                                });
                            } else {
                                // Provider fails - throw error
                                provider.adapter.getQuote = jest.fn().mockRejectedValue(
                                    new Error(`${provider.name} service unavailable`)
                                );
                            }
                        });

                        try {
                            // Act: Try to get quote
                            let result;
                            let error;
                            
                            try {
                                result = await providerManager.getQuote(symbol, { skipCache: true });
                            } catch (e) {
                                error = e;
                            }

                            // Assert: Verify fallback behavior
                            if (providerAvailability.some(available => available)) {
                                // At least one provider is available
                                expect(result).toBeDefined();
                                expect(result.symbol).toBe(symbol);
                                expect(result.metadata).toBeDefined();
                                expect(result.metadata.provider).toBeDefined();
                                
                                // Verify the provider used is the highest priority available
                                const expectedProvider = finnhubAvailable ? 'finnhub' : 
                                                       twelvedataAvailable ? 'twelvedata' : 'alphavantage';
                                expect(result.metadata.provider).toBe(expectedProvider);
                                
                                // Verify fallback flag is set correctly
                                const fallbackExpected = !finnhubAvailable && (twelvedataAvailable || alphavantageAvailable);
                                expect(result.metadata.fallbackUsed).toBe(fallbackExpected);
                                
                            } else {
                                // All providers failed
                                expect(error).toBeDefined();
                                expect(error.message).toContain('All providers failed');
                            }

                            // Verify providers were called in correct order
                            let callOrder = [];
                            providers.forEach(provider => {
                                if (provider.adapter.getQuote.mock.calls.length > 0) {
                                    callOrder.push(provider.name);
                                }
                            });

                            // Should try providers in priority order until one succeeds
                            if (callOrder.length > 0) {
                                expect(callOrder[0]).toBe('finnhub'); // Always try primary first
                                
                                if (callOrder.length > 1) {
                                    expect(callOrder[1]).toBe('twelvedata'); // Then secondary
                                }
                                
                                if (callOrder.length > 2) {
                                    expect(callOrder[2]).toBe('alphavantage'); // Finally tertiary
                                }
                            }

                        } finally {
                            // Cleanup: Restore original adapters
                            providers.forEach(provider => {
                                provider.adapter.getQuote = originalAdapters[provider.name];
                            });
                        }
                    }
                ),
                { numRuns: 100 } // Run 100 iterations as specified in design
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 1: Provider Fallback Chain**
         * Test provider recovery behavior
         */
        test('should resume using higher priority providers when they recover', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                    fc.integer({ min: 1, max: 5 }), // Number of recovery attempts
                    async (symbol, recoveryAttempts) => {
                        // Arrange: Make primary provider fail initially
                        const finnhubProvider = providerManager.providers.find(p => p.name === 'finnhub');
                        const twelvedataProvider = providerManager.providers.find(p => p.name === 'twelvedata');
                        
                        const originalFinnhubAdapter = finnhubProvider.adapter.getQuote;
                        const originalTwelvedataAdapter = twelvedataProvider.adapter.getQuote;
                        
                        // Initially, finnhub fails and twelvedata works
                        finnhubProvider.adapter.getQuote = jest.fn().mockRejectedValue(
                            new Error('Finnhub temporarily unavailable')
                        );
                        twelvedataProvider.adapter.getQuote = jest.fn().mockResolvedValue({
                            symbol: symbol,
                            price: 100,
                            name: `${symbol} Inc.`,
                            provider: 'twelvedata'
                        });

                        try {
                            // Act: Make initial request (should use twelvedata)
                            const initialResult = await providerManager.getQuote(symbol, { skipCache: true });
                            expect(initialResult.metadata.provider).toBe('twelvedata');
                            
                            // Simulate finnhub recovery after some failures
                            for (let i = 0; i < recoveryAttempts; i++) {
                                // Make finnhub fail a few more times to degrade health
                                try {
                                    await providerManager.getQuote(symbol, { skipCache: true });
                                } catch (e) {
                                    // Expected to use twelvedata
                                }
                            }
                            
                            // Now make finnhub work again
                            finnhubProvider.adapter.getQuote = jest.fn().mockResolvedValue({
                                symbol: symbol,
                                price: 105,
                                name: `${symbol} Inc.`,
                                provider: 'finnhub'
                            });
                            
                            // Reset health to simulate recovery
                            providerManager.resetProviderHealth('finnhub');
                            
                            // Act: Make request after recovery
                            const recoveredResult = await providerManager.getQuote(symbol, { skipCache: true });
                            
                            // Assert: Should use primary provider again
                            expect(recoveredResult.metadata.provider).toBe('finnhub');
                            
                        } finally {
                            // Cleanup
                            finnhubProvider.adapter.getQuote = originalFinnhubAdapter;
                            twelvedataProvider.adapter.getQuote = originalTwelvedataAdapter;
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 1: Provider Fallback Chain**
         * Test rate limiting specific fallback
         */
        test('should immediately switch providers on 429 rate limiting errors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                    async (symbol) => {
                        // Arrange: Make primary provider return 429 error
                        const finnhubProvider = providerManager.providers.find(p => p.name === 'finnhub');
                        const twelvedataProvider = providerManager.providers.find(p => p.name === 'twelvedata');
                        
                        const originalFinnhubAdapter = finnhubProvider.adapter.getQuote;
                        const originalTwelvedataAdapter = twelvedataProvider.adapter.getQuote;
                        
                        finnhubProvider.adapter.getQuote = jest.fn().mockRejectedValue(
                            new Error('HTTP 429: Rate limit exceeded')
                        );
                        twelvedataProvider.adapter.getQuote = jest.fn().mockResolvedValue({
                            symbol: symbol,
                            price: 100,
                            name: `${symbol} Inc.`,
                            provider: 'twelvedata'
                        });

                        try {
                            // Act: Make request
                            const result = await providerManager.getQuote(symbol, { skipCache: true });
                            
                            // Assert: Should immediately fallback to secondary provider
                            expect(result.metadata.provider).toBe('twelvedata');
                            expect(result.metadata.fallbackUsed).toBe(true);
                            
                            // Verify both providers were called
                            expect(finnhubProvider.adapter.getQuote).toHaveBeenCalledWith(symbol);
                            expect(twelvedataProvider.adapter.getQuote).toHaveBeenCalledWith(symbol);
                            
                        } finally {
                            // Cleanup
                            finnhubProvider.adapter.getQuote = originalFinnhubAdapter;
                            twelvedataProvider.adapter.getQuote = originalTwelvedataAdapter;
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    describe('Property 2: Single Provider Request', () => {
        /**
         * **Feature: api-provider-optimization, Property 2: Single Provider Request**
         * **Validates: Requirements 2.1, 3.1, 3.3**
         */
        test('should fetch data from only one provider at a time', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                    async (symbol) => {
                        // Arrange: Mock all providers to track calls
                        const providers = providerManager.providers;
                        const originalAdapters = {};
                        const callCounts = {};
                        
                        providers.forEach(provider => {
                            originalAdapters[provider.name] = provider.adapter.getQuote;
                            callCounts[provider.name] = 0;
                            
                            provider.adapter.getQuote = jest.fn().mockImplementation(async () => {
                                callCounts[provider.name]++;
                                return {
                                    symbol: symbol,
                                    price: 100,
                                    name: `${symbol} Inc.`,
                                    provider: provider.name
                                };
                            });
                        });

                        try {
                            // Act: Make request
                            const result = await providerManager.getQuote(symbol, { skipCache: true });
                            
                            // Assert: Only one provider should be called (the primary)
                            const totalCalls = Object.values(callCounts).reduce((sum, count) => sum + count, 0);
                            expect(totalCalls).toBe(1);
                            expect(callCounts.finnhub).toBe(1);
                            expect(callCounts.twelvedata).toBe(0);
                            expect(callCounts.alphavantage).toBe(0);
                            
                            expect(result.metadata.provider).toBe('finnhub');
                            
                        } finally {
                            // Cleanup
                            providers.forEach(provider => {
                                provider.adapter.getQuote = originalAdapters[provider.name];
                            });
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
    });
});

// Mock fast-check if not available in test environment
if (typeof fc === 'undefined') {
    global.fc = {
        assert: async (property, options) => {
            // Run the property a few times for basic testing
            const numRuns = options?.numRuns || 10;
            for (let i = 0; i < Math.min(numRuns, 10); i++) {
                await property.predicate();
            }
        },
        asyncProperty: (...args) => {
            const predicate = args[args.length - 1];
            return { predicate };
        },
        string: (options) => ({
            filter: (fn) => 'AAPL' // Return a valid stock symbol for testing
        }),
        array: (generator, options) => [true, false, false], // Mock array generator
        boolean: () => true,
        integer: (options) => options?.min || 1
    };
}