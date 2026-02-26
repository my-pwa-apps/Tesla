/**
 * Tesla Fleet API – Partner Registration Script
 *
 * Usage:
 *   node register-fleet-api.js
 *
 * Pre-requisites:
 *   - TESLA_CLIENT_ID  (env var or hard-coded below)
 *   - TESLA_CLIENT_SECRET (env var or hard-coded below)
 *   - Public key deployed at: https://<DOMAIN>/.well-known/appspecific/com.tesla.3p.public-key.pem
 */

const CLIENT_ID     = process.env.TESLA_CLIENT_ID     || 'c790e3ef-4ff3-4394-9b23-06905f757946';
const CLIENT_SECRET = process.env.TESLA_CLIENT_SECRET || 'ta-secret.ht72nLMCdJ-2&9_w';
const DOMAIN        = 'bart-gilt-delta.vercel.app';
const REGION        = 'eu'; // eu | na | cn

const PUBLIC_KEY_URL  = `https://${DOMAIN}/.well-known/appspecific/com.tesla.3p.public-key.pem`;
const FLEET_API_BASE  = `https://fleet-api.prd.${REGION}.vn.cloud.tesla.com`;
const AUTH_TOKEN_URL  = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';

// ---------------------------------------------------------------------------

function printHeader() {
    console.log('Tesla Fleet API – Partner Registration');
    console.log('======================================');
    console.log(`Region  : ${REGION.toUpperCase()}`);
    console.log(`Endpoint: ${FLEET_API_BASE}`);
    console.log(`Key URL : ${PUBLIC_KEY_URL}`);
    console.log('');
}

function printManualSteps() {
    console.log('Manual Registration Steps');
    console.log('-------------------------');
    console.log('1. Confirm your public key is live at:');
    console.log(`   ${PUBLIC_KEY_URL}`);
    console.log('');
    console.log('2. Obtain a partner authentication token:');
    console.log('   a. Visit https://developer.tesla.com/');
    console.log('   b. Sign in with your Tesla developer account.');
    console.log('   c. Open your app settings and locate "Register for Fleet API".');
    console.log('');
    console.log('3. Alternatively, complete the OAuth flow from the web app;');
    console.log('   a successful login usually triggers automatic Fleet API registration.');
    console.log('');
}

// ---------------------------------------------------------------------------

async function checkPublicKey() {
    console.log('Checking public key accessibility...');

    try {
        const response = await fetch(PUBLIC_KEY_URL);

        if (response.ok) {
            const content = await response.text();
            console.log('  OK – Public key is accessible.');
            console.log(`  Preview: ${content.substring(0, 64).trim()}...`);
            console.log('');
            return true;
        }

        console.error(`  FAIL – HTTP ${response.status}. Wait a few minutes for the CDN to propagate, then retry.`);
        console.log('');
        return false;
    } catch (err) {
        console.error(`  ERROR – ${err.message}`);
        console.log('');
        return false;
    }
}

async function getPartnerToken() {
    console.log('Step 1 – Requesting partner authentication token...');

    const response = await fetch(AUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type:    'client_credentials',
            client_id:     CLIENT_ID,
            client_secret: CLIENT_SECRET,
            scope:         'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
            audience:      FLEET_API_BASE
        })
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.error('  FAIL – Could not obtain token.');
        console.error('  Response:', JSON.stringify(body, null, 4));
        console.log('');
        console.log('  Possible reasons:');
        console.log('  - App has not been approved by Tesla yet.');
        console.log('  - Fleet API access must be requested via the Developer Portal.');
        console.log('  - Account does not have Fleet API permissions.');
        return null;
    }

    const { access_token } = await response.json();
    console.log('  OK – Token received.');
    console.log('');
    return access_token;
}

async function registerDomain(token) {
    console.log('Step 2 – Registering domain with Fleet API...');

    const response = await fetch(`${FLEET_API_BASE}/api/1/partner_accounts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json'
        },
        body: JSON.stringify({ domain: DOMAIN })
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.error('  FAIL – Domain registration rejected.');
        console.error('  Response:', JSON.stringify(body, null, 4));
        console.log('');
        console.log(`  Confirm the public key is served at: ${PUBLIC_KEY_URL}`);
        return;
    }

    const result = await response.json();
    console.log('  OK – Domain registered successfully.');
    console.log('  Details:', JSON.stringify(result, null, 4));
    console.log('');
    console.log('Your app is now registered with Tesla Fleet API.');
    console.log('You can use the OAuth flow to obtain third-party access tokens.');
}

// ---------------------------------------------------------------------------

async function main() {
    printHeader();
    printManualSteps();

    const keyAccessible = await checkPublicKey();

    if (!keyAccessible) {
        console.log('Halted – public key not reachable. Re-run this script once the key is deployed.');
        return;
    }

    const token = await getPartnerToken();
    if (!token) return;

    await registerDomain(token);
}

main().catch((err) => {
    console.error('Unhandled error:', err.message);
    process.exit(1);
});