// Tesla Fleet API Registration Script
const fs = require('fs');

const CLIENT_ID = process.env.TESLA_CLIENT_ID || '98115f27-6ac6-4a11-9bc8-c256cce5f8cc';
const CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET || 'ta-secret.@vN5q2MiuF+S';
const DOMAIN = 'my-pwa-apps.github.io';
const REGION = 'na'; // North America - change to 'eu' for Europe, 'cn' for China

async function registerFleetAPI() {
    console.log('🚀 Registering with Tesla Fleet API...\n');
    
    // Step 1: Get partner authentication token
    console.log('Step 1: Getting partner authentication token...');
    const tokenResponse = await fetch('https://auth.tesla.com/oauth2/v3/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds'
        })
    });
    
    if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('❌ Failed to get token:', error);
        return;
    }
    
    const { access_token } = await tokenResponse.json();
    console.log('✅ Got access token');
    
    // Step 2: Register with Fleet API
    console.log('\nStep 2: Registering domain with Fleet API...');
    const registerResponse = await fetch(`https://fleet-api.prd.${REGION}.vn.cloud.tesla.com/api/1/partner_accounts`, {
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
        const error = await registerResponse.text();
        console.error('❌ Registration failed:', error);
        console.log('\n📝 Make sure your public key is accessible at:');
        console.log(`   https://${DOMAIN}/Tesla/.well-known/appspecific/com.tesla.3p.public-key.pem`);
        return;
    }
    
    const result = await registerResponse.json();
    console.log('✅ Registration successful!');
    console.log('\n📋 Registration details:', JSON.stringify(result, null, 2));
    console.log('\n🎉 You can now use Tesla Fleet API!');
}

registerFleetAPI().catch(console.error);
