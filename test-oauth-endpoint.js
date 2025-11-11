// Test Tesla OAuth endpoint directly
const https = require('https');

const CLIENT_ID = '98115f27-6ac6-4a11-9bc8-c256cce5f8cc';
const REDIRECT_URI = 'https://my-pwa-apps.github.io/Tesla/callback.html';

// Try to hit the OAuth endpoint and see what happens
const testUrl = `https://auth.tesla.com/oauth2/v3/authorize?${new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds',
    state: 'test123',
    code_challenge: 'test_challenge_12345678901234567890123456789012',
    code_challenge_method: 'S256'
}).toString()}`;

console.log('🔍 Testing Tesla OAuth endpoint...\n');
console.log('Test URL:', testUrl, '\n');

https.get(testUrl, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('\nResponse preview:');
        console.log(data.substring(0, 500));
        
        if (res.statusCode === 302 || res.statusCode === 301) {
            console.log('\n✅ Redirect detected - OAuth endpoint is working!');
            console.log('Location:', res.headers.location);
        } else if (res.statusCode === 400) {
            console.log('\n❌ 400 Bad Request - Something is wrong with the OAuth request');
        } else {
            console.log('\n⚠️ Unexpected status code');
        }
    });
}).on('error', (err) => {
    console.error('❌ Error:', err.message);
});
