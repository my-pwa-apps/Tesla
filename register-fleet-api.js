// Tesla Fleet API Registration Script
const fs = require('fs');
const crypto = require('crypto');

const CLIENT_ID = process.env.TESLA_CLIENT_ID || '98115f27-6ac6-4a11-9bc8-c256cce5f8cc';
const CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET || 'ta-secret.@vN5q2MiuF+S';
const DOMAIN = 'my-pwa-apps.github.io';
const REGION = 'eu'; // Europe, Middle East, Africa

console.log('🔐 Tesla Fleet API Registration\n');
console.log('⚠️  IMPORTANT: Fleet API registration requires you to authenticate with your Tesla account first.\n');
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
        const response = await fetch(`https://${DOMAIN}/Tesla/.well-known/appspecific/com.tesla.3p.public-key.pem`);
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
    
    console.log('📝 Next Steps:\n');
    console.log('Since client_credentials grant is not working, you need to:');
    console.log('1. Try connecting through your web app (OAuth authorization code flow)');
    console.log('2. Or register through Tesla Developer Portal directly');
    console.log('3. Tesla may auto-register your app on first successful OAuth login\n');
    console.log('� Try accessing your app at:');
    console.log(`   https://${DOMAIN}/Tesla/\n`);
    console.log('Click "Connect Tesla Account" and complete the OAuth flow.');
    console.log('This may automatically register your app with Fleet API.\n');
}

registerFleetAPI().catch(console.error);
