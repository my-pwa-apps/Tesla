// Tesla OAuth Configuration
// ⚠️ NEVER commit real credentials to Git!
// These should be set via environment variables or a backend

const TESLA_OAUTH_CONFIG = {
    // Option 1: For local development only (not secure for production)
    clientId: process.env.TESLA_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
    
    // ⚠️ NEVER store client secret in frontend code!
    // This must be on a backend server
    // clientSecret is not included here intentionally
    
    redirectUri: window.location.origin + '/callback.html',
    authUrl: 'https://auth.tesla.com/oauth2/v3/authorize',
    tokenUrl: 'https://auth.tesla.com/oauth2/v3/token',
    apiUrl: 'https://owner-api.teslamotors.com/api/1',
    scope: 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds',
    
    // Backend proxy URL (recommended approach)
    useBackendProxy: true,
    backendUrl: '/api' // Your backend endpoint
};

export default TESLA_OAUTH_CONFIG;
