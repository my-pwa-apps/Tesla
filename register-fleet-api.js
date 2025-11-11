// Tesla Fleet API Registration Script
const fs = require('fs');
const crypto = require('crypto');

const CLIENT_ID = process.env.TESLA_CLIENT_ID || '98115f27-6ac6-4a11-9bc8-c256cce5f8cc';
const CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET || 'ta-secret.@vN5q2MiuF+S$yZR';
// Tesla expects the domain for partner registration, public key must be at domain/.well-known/
const DOMAIN = 'tesla-gilt-delta.vercel.app';
// But public key is actually at my-pwa-apps.github.io/Tesla/.well-known/
const PUBLIC_KEY_URL = 'https://my-pwa-apps.github.io/Tesla/.well-known/appspecific/com.tesla.3p.public-key.pem';
const REGION = 'eu'; // Europe, Middle East, Africa
const FLEET_API_BASE = `https://fleet-api.prd.${REGION}.vn.cloud.tesla.com`;

console.log('🔐 Tesla Fleet API Registration\n');
console.log(`Region: ${REGION.toUpperCase()}`);
console.log(`Fleet API: ${FLEET_API_BASE}\n`);
console.log('📋 Manual Registration Steps:\n');
console.log('1. Verify your public key is accessible at:');
console.log(`   https://${DOMAIN}/Tesla/.well-known/appspecific/com.tesla.3p.public-key.pem\n`);
console.log('2. Get a partner authentication token by logging in:');
console.log('   a. Go to: https://developer.tesla.com/');
console.log('   b. Sign in with your Tesla account');
console.log('   c. Navigate to your app settings');
console.log('   d. Look for "Register for Fleet API" or similar option\n');
console.log('3. Tesla may automatically register your app when you:');
console.log('   - Complete the OAuth flow from your web app');
console.log('   - Or use the Tesla Developer Portal interface\n');
console.log('💡 Alternative: Try using the OAuth flow in your app.');
console.log('   The first successful OAuth login may trigger automatic Fleet API registration.\n');

async function checkPublicKey() {
    console.log('✅ Checking if public key is accessible...\n');
    try {
        const response = await fetch(PUBLIC_KEY_URL);
        if (response.ok) {
            console.log('✅ Public key is accessible!');
            const content = await response.text();
            console.log('📄 Public key preview:');
            console.log(content.substring(0, 100) + '...\n');
            return true;
        } else {
            console.log('❌ Public key not accessible (Status: ' + response.status + ')');
            console.log('   Wait a few minutes for GitHub Pages to update, then try again.\n');
            return false;
        }
    } catch (error) {
        console.log('❌ Error checking public key:', error.message, '\n');
        return false;
    }
}

async function registerFleetAPI() {
    const keyAccessible = await checkPublicKey();
    
    if (!keyAccessible) {
        console.log('⏳ Waiting for GitHub Pages to deploy the public key...');
        console.log('   Run this script again in 2-3 minutes.\n');
        return;
    }
    
    console.log('📝 Attempting to get partner token and register...\n');
    
    try {
        // Step 1: Get partner token using the correct endpoint
        console.log('Step 1: Getting partner authentication token...');
        const tokenResponse = await fetch('https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
                audience: FLEET_API_BASE
            })
        });
        
        if (!tokenResponse.ok) {
            const error = await tokenResponse.json();
            console.error('❌ Failed to get token:', JSON.stringify(error, null, 2));
            console.log('\n💡 If this fails, it may mean:');
            console.log('1. Your app needs approval from Tesla');
            console.log('2. Fleet API registration must be done through Developer Portal');
            console.log('3. Your account may not have access to Fleet API yet\n');
            return;
        }
        
        const { access_token } = await tokenResponse.json();
        console.log('✅ Got partner token!\n');
        
        // Step 2: Register with Fleet API
        console.log('Step 2: Registering domain with Fleet API...');
        const registerResponse = await fetch(`${FLEET_API_BASE}/api/1/partner_accounts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                domain: DOMAIN
            })
        });
        
        if (!registerResponse.ok) {
            const error = await registerResponse.json();
            console.error('❌ Registration failed:', JSON.stringify(error, null, 2));
            console.log('\n📝 Make sure your public key is accessible at:');
            console.log(`   https://${DOMAIN}/Tesla/.well-known/appspecific/com.tesla.3p.public-key.pem\n`);
            return;
        }
        
        const result = await registerResponse.json();
        console.log('✅ Registration successful!');
        console.log('\n📋 Registration details:', JSON.stringify(result, null, 2));
        console.log('\n🎉 Your app is now registered with Tesla Fleet API!');
        console.log('You can now use OAuth to get third-party tokens.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

registerFleetAPI().catch(console.error);
