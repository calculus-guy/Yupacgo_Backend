const fc = require('fast-check');
const priceAggregator = require('../src/services/priceAggregator.service');
const providerManager = require('../src/services/providerManager.service');

/**
 * Property-based tests for Price Aggregator Service
 * **Feature: api-provider-optimization, Property 2: Single Provider Request**
 * 
 * For any stock data request, the system should fetch data from only one provider 
 * at a time according to priority and availability
 */

describe('Price Aggregator - Property-Based Tests', () => {
    beforeEach(() => {
        // Reset provider health before each test
        providerManager.resetProviderHealth('finnhub');
        providerManager.resetProviderHealth('twelvedata');
        providerManager.resetProviderHealth('alphavantage');
    });

    describe('Property 2: Single Provider Request', () => {
        /**
         * **Feature: api-provider-optimization, Property 2: Single Provider Request**
         * **Validates: Requirements 2.1, 3.1, 3.3**
         */
        test('should fetch quotes from only one provider at a time', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                    async (symbol) => {
                        // Arrange: Mock all provider adapters to track calls
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
                                    price: 100 + Math.random() * 50,
                                    name: `${symbol} Inc.`,
                                    exchange: 'NASDAQ',
                                    provider: provider.name,
                                    timestamp: new Date().toISOString()
                                };
                            });
                        });

                        try {
                            // Act: Get price comparison (should use single provider)
                            const result = await priceAggregator.getPriceComparison(symbol);
                            
                            // Assert: Only one provider should be called
                            const totalCalls = Object.values(callCounts).reduce((sum, count) => sum + count, 0);
                            expect(totalCalls).toBe(1);
                            
                            // Should be the primary provider (finnhub) since all are healthy
                            expect(callCounts.finnhub).toBe(1);
                            expect(callCounts.twelvedata).toBe(0);
                            expect(callCounts.alphavantage).toBe(0);
                            
                            // Verify response structure maintains backward compatibility
                            expect(result).toHaveProperty('symbol', symbol);
                            expect(result).toHaveProperty('price');
                            expect(result).toHaveProperty('provider');
                            expect(result).toHaveProperty('prices');
                            expect(result).toHaveProperty('best');
                            expect(result).toHaveProperty('priceVariance', 0); // No variance with single provider
                            
                            // Verify single provider response
                            expect(result.prices).toHaveLength(1);
                            expect(result.metadata.singleProvider).toBe(true);
                            expect(result.metadata.eliminatedParallelFetching).toBe(true);
                            
                        } finally {
                            // Cleanup: Restore original adapters
                            providers.forEach(provider => {
                                provider.adapter.getQuote = originalAdapters[provider.name];
                            });
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 2: Single Provider Request**
         * Test aggregated quote single provider behavior
         */
        test('should fetch aggregated quotes from only one provider at a time', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                    async (symbol) => {
                        // Arrange: Mock provider adapters
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
                                    price: 100 + Math.random() * 50,
                                    name: `${symbol} Corporation`,
                                    exchange: 'NYSE',
                                    provider: provider.name,
                                    timestamp: new Date().toISOString()
                                };
                            });
                        });

                        try {
                            // Act: Get aggregated quote
                            const result = await priceAggregator.getAggregatedQuote(symbol);
                            
                            // Assert: Only one provider should be called
                            const totalCalls = Object.values(callCounts).reduce((sum, count) => sum + count, 0);
                            expect(totalCalls).toBe(1);
                            
                            // Should use primary provider
                            expect(callCounts.finnhub).toBe(1);
                            expect(callCounts.twelvedata).toBe(0);
                            expect(callCounts.alphavantage).toBe(0);
                            
                            // Verify response structure
                            expect(result).toHaveProperty('symbol', symbol);
                            expect(result).toHaveProperty('price');
                            expect(result).toHaveProperty('name');
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

        /**
         * **Feature: api-provider-optimization, Property 2: Single Provider Request**
         * Test batch quotes single provider behavior
         */
        test('should fetch batch quotes using single provider per request', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(
                        fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                        { minLength: 2, maxLength: 5 }
                    ),
                    async (symbols) => {
                        // Arrange: Mock provider adapters
                        const providers = providerManager.providers;
                        const originalAdapters = {};
                        const callCounts = {};
                        
                        providers.forEach(provider => {
                            originalAdapters[provider.name] = provider.adapter.getQuote;
                            callCounts[provider.name] = 0;
                            
                            provider.adapter.getQuote = jest.fn().mockImplementation(async (symbol) => {
                                callCounts[provider.name]++;
                                return {
                                    symbol: symbol,
                                    price: 100 + Math.random() * 50,
                                    name: `${symbol} Inc.`,
                                    exchange: 'NASDAQ',
                                    provider: provider.name,
                                    timestamp: new Date().toISOString()
                                };
                            });
                        });

                        try {
                            // Act: Get batch quotes
                            const results = await priceAggregator.getBatchAggregatedQuotes(symbols);
                            
                            // Assert: Should call primary provider for each symbol (no parallel fetching)
                            expect(callCounts.finnhub).toBe(symbols.length);
                            expect(callCounts.twelvedata).toBe(0);
                            expect(callCounts.alphavantage).toBe(0);
                            
                            // Total calls should equal number of symbols (one provider per symbol)
                            const totalCalls = Object.values(callCounts).reduce((sum, count) => sum + count, 0);
                            expect(totalCalls).toBe(symbols.length);
                            
                            // Verify results
                            expect(results).toHaveLength(symbols.length);
                            results.forEach(result => {
                                expect(result.metadata.provider).toBe('finnhub');
                            });
                            
                        } finally {
                            // Cleanup
                            providers.forEach(provider => {
                                provider.adapter.getQuote = originalAdapters[provider.name];
                            });
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });

        /**
         * **Feature: api-provider-optimization, Property 2: Single Provider Request**
         * Test search functionality single provider behavior
         */
        test('should search using single provider with fallback', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z0-9\s]+$/.test(s)),
                    async (query) => {
                        // Arrange: Mock provider adapters
                        const providers = providerManager.providers;
                        const originalAdapters = {};
                        const callCounts = {};
                        
                        providers.forEach(provider => {
                            originalAdapters[provider.name] = provider.adapter.searchSymbol;
                            callCounts[provider.name] = 0;
                            
                            provider.adapter.searchSymbol = jest.fn().mockImplementation(async () => {
                                callCounts[provider.name]++;
                                return [
                                    {
                                        symbol: 'TEST',
                                        name: `Test Company for ${query}`,
                                        type: 'stock',
                                        exchange: 'NASDAQ',
                                        provider: provider.name
                                    }
                                ];
                            });
                        });

                        try {
                            // Act: Search stocks
                            const results = await priceAggregator.searchStocks(query);
                            
                            // Assert: Should use only primary provider for search
                            expect(callCounts.finnhub).toBe(1);
                            expect(callCounts.twelvedata).toBe(0);
                            expect(callCounts.alphavantage).toBe(0);
                            
                            // Total calls should be 1
                            const totalCalls = Object.values(callCounts).reduce((sum, count) => sum + count, 0);
                            expect(totalCalls).toBe(1);
                            
                            // Verify results structure
                            expect(Array.isArray(results)).toBe(true);
                            if (results.length > 0) {
                                expect(results[0]).toHaveProperty('symbol');
                                expect(results[0]).toHaveProperty('name');
                                expect(results[0]).toHaveProperty('optimized', true);
                            }
                            
                        } finally {
                            // Cleanup
                            providers.forEach(provider => {
                                provider.adapter.searchSymbol = originalAdapters[provider.name];
                            });
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    describe('Property 4: Metadata Consistency', () => {
        /**
         * **Feature: api-provider-optimization, Property 4: Metadata Consistency**
         * **Validates: Requirements 2.3, 6.1, 6.3**
         */
        test('should include standardized metadata in all responses', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[A-Z]{1,10}$/.test(s)),
                    async (symbol) => {
                        // Arrange: Mock provider to return consistent data
                        const finnhubProvider = providerManager.providers.find(p => p.name === 'finnhub');
                        const originalAdapter = finnhubProvider.adapter.getQuote;
                        
                        finnhubProvider.adapter.getQuote = jest.fn().mockResolvedValue({
                            symbol: symbol,
                            price: 150.25,
                            name: `${symbol} Inc.`,
                            exchange: 'NASDAQ',
                            provider: 'finnhub',
                            timestamp: new Date().toISOString()
                        });

                        try {
                            // Act: Get quote through different methods
                            const [comparisonResult, aggregatedResult] = await Promise.all([
                                priceAggregator.getPriceComparison(symbol),
                                priceAggregator.getAggregatedQuote(symbol)
                            ]);
                            
                            // Assert: Both should have consistent metadata structure
                            const requiredMetadataFields = ['provider', 'timestamp', 'confidence'];
                            
                            // Check price comparison metadata
                            expect(comparisonResult.metadata).toBeDefined();
                            expect(comparisonResult.metadata.singleProvider).toBe(true);
                            expect(comparisonResult.metadata.eliminatedParallelFetching).toBe(true);
                            
                            // Check aggregated quote metadata
                            expect(aggregatedResult.metadata).toBeDefined();
                            expect(aggregatedResult.metadata.provider).toBe('finnhub');
                            expect(aggregatedResult.metadata.timestamp).toBeDefined();
                            
                            // Both should have consistent provider information
                            expect(comparisonResult.provider).toBe(aggregatedResult.metadata.provider);
                            
                        } finally {
                            // Cleanup
                            finnhubProvider.adapter.getQuote = originalAdapter;
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    describe('Backward Compatibility', () => {
        test('should maintain backward compatibility with existing API structure', async () => {
            const symbol = 'AAPL';
            
            // Mock provider response
            const finnhubProvider = providerManager.providers.find(p => p.name === 'finnhub');
            const originalAdapter = finnhubProvider.adapter.getQuote;
            
            finnhubProvider.adapter.getQuote = jest.fn().mockResolvedValue({
                symbol: symbol,
                price: 150.25,
                name: 'Apple Inc.',
                exchange: 'NASDAQ',
                provider: 'finnhub',
                timestamp: new Date().toISOString()
            });

            try {
                // Act: Get price comparison
                const result = await priceAggregator.getPriceComparison(symbol);
                
                // Assert: Should maintain expected API structure
                expect(result).toHaveProperty('symbol');
                expect(result).toHaveProperty('name');
                expect(result).toHaveProperty('exchange');
                expect(result).toHaveProperty('price');
                expect(result).toHaveProperty('provider');
                expect(result).toHaveProperty('confidence');
                expect(result).toHaveProperty('timestamp');
                expect(result).toHaveProperty('prices');
                expect(result).toHaveProperty('best');
                expect(result).toHaveProperty('priceVariance');
                expect(result).toHaveProperty('metadata');
                
                // Verify single provider optimization
                expect(result.prices).toHaveLength(1);
                expect(result.priceVariance).toBe(0);
                expect(result.best.provider).toBe('finnhub');
                
            } finally {
                // Cleanup
                finnhubProvider.adapter.getQuote = originalAdapter;
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
        string: (options) => 'AAPL',
        array: (generator, options) => ['AAPL', 'GOOGL', 'MSFT']
    };
}