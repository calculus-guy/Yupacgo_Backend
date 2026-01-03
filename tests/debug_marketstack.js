const axios = require('axios');
require('dotenv').config();

async function debugMarketStack() {
    const apiKey = process.env.MARKETSTACK_API_KEY;
    const baseUrl = "http://api.marketstack.com/v1";
    
    console.log('🔬 COMPREHENSIVE MarketStack API Debug Session\n');
    console.log(`API Key: ${apiKey ? 'Present' : 'Missing'}\n`);

    if (!apiKey) {
        console.error('❌ MarketStack API key not found');
        return;
    }

    // TEST 1: Get all available exchanges and find Nigerian ones
    console.log('📋 TEST 1: Analyzing ALL Available Exchanges...\n');
    
    try {
        const response = await axios.get(`${baseUrl}/exchanges`, {
            params: {
                access_key: apiKey,
                limit: 1000 // Get all exchanges
            },
            timeout: 15000
        });

        const exchanges = response.data.data || [];
        console.log(`✅ Found ${exchanges.length} total exchanges\n`);
        
        // Look for any African/Nigerian exchanges
        console.log('🇳🇬 Searching for Nigerian/African exchanges:');
        const africanExchanges = exchanges.filter(ex => 
            ex.name.toLowerCase().includes('nigeria') || 
            ex.name.toLowerCase().includes('lagos') ||
            ex.name.toLowerCase().includes('africa') ||
            ex.country?.toLowerCase().includes('nigeria') ||
            ex.mic.includes('NG') ||
            ex.mic.includes('XN') ||
            ex.mic.includes('AF')
        );
        
        africanExchanges.forEach(ex => {
            console.log(`   📍 ${ex.name} (MIC: ${ex.mic}) - Country: ${ex.country || 'N/A'}`);
            console.log(`      Timezone: ${ex.timezone || 'N/A'}`);
            console.log(`      Currency: ${ex.currency || 'N/A'}`);
            console.log('');
        });
        
        if (africanExchanges.length === 0) {
            console.log('⚠️ No Nigerian/African exchanges found');
            console.log('\n📋 Sample of available exchanges:');
            exchanges.slice(0, 20).forEach(ex => {
                console.log(`   ${ex.name} (${ex.mic}) - ${ex.country || 'N/A'}`);
            });
        }
        
    } catch (error) {
        console.log('❌ Failed to get exchanges');
        console.log(`Error: ${error.response?.data?.error?.message || error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // TEST 2: Search for Nigerian stocks using tickers endpoint
    console.log('\n🔍 TEST 2: Searching for Nigerian stocks using tickers endpoint...\n');
    
    try {
        const response = await axios.get(`${baseUrl}/tickers`, {
            params: {
                access_key: apiKey,
                search: 'nigeria',
                limit: 50
            },
            timeout: 15000
        });

        console.log('✅ Tickers search successful');
        const tickers = response.data.data || [];
        console.log(`Found ${tickers.length} tickers matching "nigeria"`);
        
        tickers.forEach(ticker => {
            console.log(`   📊 ${ticker.symbol} - ${ticker.name}`);
            console.log(`      Exchange: ${ticker.stock_exchange?.name || 'N/A'} (${ticker.stock_exchange?.mic || 'N/A'})`);
            console.log(`      Country: ${ticker.stock_exchange?.country || 'N/A'}`);
            console.log('');
        });
        
    } catch (error) {
        console.log('❌ Tickers search failed');
        console.log(`Error: ${error.response?.data?.error?.message || error.message}`);
        if (error.response?.status === 403) {
            console.log('💡 Tickers endpoint might require paid subscription');
        }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // TEST 3: Try different search terms for Nigerian companies
    console.log('\n🔍 TEST 3: Searching for known Nigerian companies...\n');
    
    const searchTerms = ['dangote', 'mtn', 'zenith', 'gtbank', 'access', 'uba'];
    
    for (const term of searchTerms) {
        try {
            const response = await axios.get(`${baseUrl}/tickers`, {
                params: {
                    access_key: apiKey,
                    search: term,
                    limit: 10
                },
                timeout: 10000
            });

            const tickers = response.data.data || [];
            if (tickers.length > 0) {
                console.log(`✅ Found ${tickers.length} results for "${term}"`);
                tickers.forEach(ticker => {
                    console.log(`   📊 ${ticker.symbol} - ${ticker.name}`);
                    console.log(`      Exchange: ${ticker.stock_exchange?.name || 'N/A'} (${ticker.stock_exchange?.mic || 'N/A'})`);
                });
            } else {
                console.log(`⚠️ No results for "${term}"`);
            }
            
        } catch (error) {
            console.log(`❌ Search failed for "${term}": ${error.response?.data?.error?.message || error.message}`);
        }
        
        console.log('');
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // TEST 4: Test with XNSA exchange code we found
    console.log('\n🔍 TEST 4: Testing with XNSA exchange code...\n');
    
    const testSymbols = ['DANGCEM.XNSA', 'MTNN.XNSA', 'ZENITHBANK.XNSA', 'GTCO.XNSA'];
    
    for (const symbol of testSymbols) {
        try {
            const response = await axios.get(`${baseUrl}/eod/latest`, {
                params: {
                    access_key: apiKey,
                    symbols: symbol,
                    limit: 1
                },
                timeout: 10000
            });

            console.log(`✅ SUCCESS for ${symbol}`);
            if (response.data?.data?.length > 0) {
                const stock = response.data.data[0];
                console.log(`   Price: ${stock.close}, Date: ${stock.date}`);
            }
            
        } catch (error) {
            console.log(`❌ FAILED for ${symbol}: ${error.response?.data?.error?.message || error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // TEST 5: Check what symbols are actually available for XNSA exchange
    console.log('\n🔍 TEST 5: Getting symbols available for XNSA exchange...\n');
    
    try {
        const response = await axios.get(`${baseUrl}/tickers`, {
            params: {
                access_key: apiKey,
                exchange: 'XNSA',
                limit: 100
            },
            timeout: 15000
        });

        console.log('✅ XNSA exchange symbols retrieved');
        const tickers = response.data.data || [];
        console.log(`Found ${tickers.length} symbols on XNSA exchange`);
        
        if (tickers.length > 0) {
            console.log('\n📊 Available Nigerian stocks:');
            tickers.slice(0, 20).forEach(ticker => {
                console.log(`   ${ticker.symbol} - ${ticker.name}`);
            });
            
            // Test one of the actual symbols
            if (tickers.length > 0) {
                const testSymbol = tickers[0].symbol;
                console.log(`\n🧪 Testing actual symbol: ${testSymbol}`);
                
                try {
                    const testResponse = await axios.get(`${baseUrl}/eod/latest`, {
                        params: {
                            access_key: apiKey,
                            symbols: testSymbol,
                            limit: 1
                        },
                        timeout: 10000
                    });

                    console.log(`✅ SUCCESS with actual symbol: ${testSymbol}`);
                    if (testResponse.data?.data?.length > 0) {
                        const stock = testResponse.data.data[0];
                        console.log(`   Symbol: ${stock.symbol}`);
                        console.log(`   Exchange: ${stock.exchange}`);
                        console.log(`   Close: ${stock.close}`);
                        console.log(`   Date: ${stock.date}`);
                    }
                    
                } catch (error) {
                    console.log(`❌ Even actual symbol failed: ${error.response?.data?.error?.message || error.message}`);
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Failed to get XNSA symbols');
        console.log(`Error: ${error.response?.data?.error?.message || error.message}`);
        if (error.response?.status === 403) {
            console.log('💡 Exchange-specific tickers might require paid subscription');
        }
    }

    // TEST 6: Check API usage and limits
    console.log('\n📊 TEST 6: Checking API usage and limits...\n');
    
    try {
        // Make a simple request to see response headers
        const response = await axios.get(`${baseUrl}/exchanges`, {
            params: {
                access_key: apiKey,
                limit: 1
            },
            timeout: 10000
        });

        console.log('📈 API Response Headers:');
        Object.entries(response.headers).forEach(([key, value]) => {
            if (key.toLowerCase().includes('limit') || 
                key.toLowerCase().includes('usage') || 
                key.toLowerCase().includes('remaining') ||
                key.toLowerCase().includes('rate')) {
                console.log(`   ${key}: ${value}`);
            }
        });
        
    } catch (error) {
        console.log('❌ Failed to check API limits');
    }

    console.log('\n🎯 DEBUG SESSION COMPLETED!');
    console.log('\n📋 SUMMARY:');
    console.log('1. Checked all available exchanges');
    console.log('2. Searched for Nigerian companies by name');
    console.log('3. Tested XNSA exchange code');
    console.log('4. Attempted to get XNSA symbols list');
    console.log('5. Checked API usage limits');
    
    process.exit(0);
}

debugMarketStack().catch(console.error);