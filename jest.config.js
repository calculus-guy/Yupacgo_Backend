/**
 * Jest configuration.
 *
 * `moduleNameMapper` substitutes `ioredis-mock` for the real `ioredis`
 * package everywhere in the codebase under test. This is what makes the
 * pre-existing property-based tests actually runnable: they exercise
 * smartCache/providerHealth/providerManager, which all go through
 * `config/redis.js` — without a Redis instance (real or mocked), every
 * cache read/write silently no-ops (by design, for production resilience),
 * which made every assertion about cached data fail. `ioredis-mock` behaves
 * like a real Redis server in-memory, so those code paths run for real.
 */
module.exports = {
    testEnvironment: "node",
    setupFiles: ["<rootDir>/tests/setup.js"],
    moduleNameMapper: {
        "^ioredis$": "ioredis-mock"
    },
    testMatch: ["**/tests/**/*.test.js"],
    testTimeout: 30000,
    // Property-based tests run many iterations sequentially within one test;
    // running test FILES in parallel is still fine and is the default.
    verbose: true,
    clearMocks: true
};
