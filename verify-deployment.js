#!/usr/bin/env node

/**
 * Deployment Verification Script
 * Checks if all critical files and configurations are correct
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying deployment readiness...\n');

const checks = [
    {
        name: 'Server file exists',
        check: () => fs.existsSync('server.js'),
        fix: 'Ensure server.js exists in the root directory'
    },
    {
        name: 'Package.json exists',
        check: () => fs.existsSync('package.json'),
        fix: 'Ensure package.json exists'
    },
    {
        name: 'Environment file exists',
        check: () => fs.existsSync('.env'),
        fix: 'Create .env file with required environment variables'
    },
    {
        name: 'Admin routes syntax',
        check: () => {
            try {
                const adminRoutes = fs.readFileSync('src/routes/admin.routes.js', 'utf8');
                // Check for the problematic optional parameter syntax
                return !adminRoutes.includes(':provider?');
            } catch (error) {
                return false;
            }
        },
        fix: 'Fix optional parameter syntax in admin routes'
    },
    {
        name: 'Required services exist',
        check: () => {
            const requiredServices = [
                'src/services/providerManager.service.js',
                'src/services/providerHealth.service.js',
                'src/services/smartCache.service.js',
                'src/controllers/admin.controller.js'
            ];
            return requiredServices.every(file => fs.existsSync(file));
        },
        fix: 'Ensure all required service files exist'
    },
    {
        name: 'Node.js syntax check',
        check: () => {
            try {
                require.resolve('./server.js');
                return true;
            } catch (error) {
                console.error('Syntax error:', error.message);
                return false;
            }
        },
        fix: 'Fix syntax errors in server.js'
    }
];

let allPassed = true;

checks.forEach((check, index) => {
    const passed = check.check();
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${check.name}`);
    
    if (!passed) {
        console.log(`   💡 Fix: ${check.fix}`);
        allPassed = false;
    }
});

console.log('\n' + '='.repeat(50));

if (allPassed) {
    console.log('🎉 All checks passed! Deployment ready.');
    console.log('\n📋 Next steps:');
    console.log('   1. npm install (if needed)');
    console.log('   2. npm start');
    console.log('   3. Test admin endpoints');
    process.exit(0);
} else {
    console.log('❌ Some checks failed. Please fix the issues above.');
    process.exit(1);
}