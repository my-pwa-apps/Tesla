// Tesla Dashboard App

// Tesla OAuth Configuration
const TESLA_OAUTH_CONFIG = {
    // Client ID - Get from backend to ensure it matches
    // This will be fetched from backend on load
    clientId: null,
    
    // ⚠️ NEVER include client secret in frontend!
    // It's stored securely in backend/.env
    
    // Redirect URI - must match exactly what's registered in Tesla Developer Portal
    // Use Vercel backend callback since Fleet API is registered there
    redirectUri: 'https://bart-gilt-delta.vercel.app/callback.html',
    authUrl: 'https://auth.tesla.com/oauth2/v3/authorize',
    
    // Use backend proxy for token exchange (avoids CORS and keeps secret secure)
    useBackend: true,
    // Backend URL - Vercel deployment
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://bart-gilt-delta.vercel.app/api',
    
    // Direct API URLs (not used when useBackend is true)
    tokenUrl: 'https://auth.tesla.com/oauth2/v3/token',
    apiUrl: 'https://owner-api.teslamotors.com/api/1',
    
    scope: 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds'
};

// Fetch Client ID from backend on load
async function initializeOAuthConfig() {
    try {
        const response = await fetch(`${TESLA_OAUTH_CONFIG.backendUrl}/config`);
        if (response.ok) {
            const config = await response.json();
            TESLA_OAUTH_CONFIG.clientId = config.clientId;
            console.log('OAuth config loaded from backend');
        } else {
            console.error('Failed to load config from backend');
        }
    } catch (error) {
        console.error('Backend not available:', error);
    }
}

// Tesla API Configuration
const TESLA_CONFIG = {
    accessToken: localStorage.getItem('tesla_access_token') || null,
    refreshToken: localStorage.getItem('tesla_refresh_token') || null,
    tokenExpiry: localStorage.getItem('tesla_token_expiry') || null,
    vehicleId: localStorage.getItem('tesla_vehicle_id') || null,
    useMockData: !localStorage.getItem('tesla_access_token')
};

// Mock Tesla data for demo purposes
const MOCK_TESLA_DATA = {
    battery_level: 78,
    battery_range: 245.2,
    charging_state: "Disconnected",
    charge_limit_soc: 90,
    est_battery_range: 245.2,
    inside_temp: 68.5,
    outside_temp: 55.2,
    is_climate_on: false,
    odometer: 15234.7,
    vehicle_name: "Model 3 Highland",
    shift_state: "P",
    speed: 0,
    latitude: 52.5781,
    longitude: 4.6937,
    locked: true,
    sentry_mode: true
};

// User preferences
const USER_PREFERENCES = {
    temperatureUnit: localStorage.getItem('temp_unit') || 'auto', // 'auto', 'celsius', 'fahrenheit'
    userLocation: null
};

// Auto-detect temperature unit based on location
function getTemperatureUnit(latitude) {
    if (USER_PREFERENCES.temperatureUnit !== 'auto') {
        return USER_PREFERENCES.temperatureUnit;
    }
    
    // Countries that primarily use Fahrenheit (USA, some Caribbean nations)
    // Approximate: USA is between latitudes 25°N and 49°N, longitudes -125°W and -65°W
    // For simplicity, we'll use a more global approach
    const fahrenheitCountries = ['US', 'BS', 'BZ', 'KY', 'PW'];
    
    // Default to Celsius for most of the world
    return 'celsius';
}

function celsiusToFahrenheit(celsius) {
    return (celsius * 9/5) + 32;
}

function formatTemperature(celsius, unit = null) {
    const tempUnit = unit || USER_PREFERENCES.temperatureUnit;
    
    if (tempUnit === 'fahrenheit') {
        return `${Math.round(celsiusToFahrenheit(celsius))}°F`;
    }
    return `${Math.round(celsius)}°C`;
}

// Update time display
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('currentTime').textContent = timeString;
}

updateTime();
setInterval(updateTime, 1000);

// Weather API (Open-Meteo - Free, no API key required)
async function loadWeather() {
    try {
        // Get user location
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            USER_PREFERENCES.userLocation = { latitude, longitude };
            
            // Auto-detect temperature unit based on location
            const tempUnit = getTemperatureUnit(latitude);
            
            // Get weather data
            const weatherResponse = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
            );
            const weatherData = await weatherResponse.json();
            
            const weather = weatherData.current_weather;
            
            document.querySelector('#weatherTile .loading').classList.add('hidden');
            document.querySelector('#weatherTile .weather-info').classList.remove('hidden');
            document.getElementById('temperature').textContent = formatTemperature(weather.temperature, tempUnit);
            document.getElementById('condition').textContent = getWeatherDescription(weather.weathercode);
            document.getElementById('location').textContent = `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
        }, (error) => {
            // Fallback to default location if geolocation fails
            loadDefaultWeather();
        });
    } catch (error) {
        console.error('Weather error:', error);
        loadDefaultWeather();
    }
}

async function loadDefaultWeather() {
    try {
        // Default to San Francisco
        const lat = 37.7749;
        const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=-122.4194&current_weather=true`
        );
        const weatherData = await weatherResponse.json();
        const weather = weatherData.current_weather;
        
        // Auto-detect temperature unit
        const tempUnit = getTemperatureUnit(lat);
        
        document.querySelector('#weatherTile .loading').classList.add('hidden');
        document.querySelector('#weatherTile .weather-info').classList.remove('hidden');
        document.getElementById('temperature').textContent = formatTemperature(weather.temperature, tempUnit);
        document.getElementById('condition').textContent = getWeatherDescription(weather.weathercode);
        document.getElementById('location').textContent = 'San Francisco, CA';
    } catch (error) {
        console.error('Default weather error:', error);
        document.querySelector('#weatherTile .loading').textContent = 'Weather unavailable';
    }
}

function getWeatherDescription(code) {
    const weatherCodes = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Foggy',
        51: 'Light drizzle',
        53: 'Drizzle',
        55: 'Heavy drizzle',
        61: 'Light rain',
        63: 'Rain',
        65: 'Heavy rain',
        71: 'Light snow',
        73: 'Snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Light showers',
        81: 'Showers',
        82: 'Heavy showers',
        85: 'Light snow showers',
        86: 'Snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with hail',
        99: 'Thunderstorm with heavy hail'
    };
    return weatherCodes[code] || 'Unknown';
}

// Navigation functionality
function setupNavigation() {
    const searchBtn = document.getElementById('navSearchBtn');
    const searchInput = document.getElementById('navSearch');
    const destButtons = document.querySelectorAll('.dest-btn');
    
    searchBtn.addEventListener('click', () => searchDestination(searchInput.value));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchDestination(searchInput.value);
    });
    
    destButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const dest = btn.dataset.dest;
            handleQuickDestination(dest);
        });
    });
}

async function searchDestination(query) {
    if (!query.trim()) return;
    
    const resultsDiv = document.getElementById('navResults');
    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
    resultsDiv.classList.remove('hidden');
    
    try {
        // Using Nominatim for geocoding (free, no API key)
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`
        );
        const data = await response.json();
        
        if (data.length === 0) {
            resultsDiv.innerHTML = '<p class="no-results">No results found</p>';
            return;
        }
        
        resultsDiv.innerHTML = '';
        data.forEach(place => {
            const resultItem = document.createElement('div');
            resultItem.className = 'nav-result-item';
            resultItem.innerHTML = `
                <div class="result-name">${place.display_name}</div>
                <div class="result-coords">${parseFloat(place.lat).toFixed(4)}°, ${parseFloat(place.lon).toFixed(4)}°</div>
            `;
            resultItem.onclick = () => navigateToLocation(place.lat, place.lon, place.display_name);
            resultsDiv.appendChild(resultItem);
        });
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<p class="error">Search failed</p>';
    }
}

function navigateToLocation(lat, lon, name) {
    // Open in Tesla browser or Google Maps
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, '_blank');
    
    // Show confirmation
    const resultsDiv = document.getElementById('navResults');
    resultsDiv.innerHTML = `<div class="nav-success">Opening navigation to ${name}...</div>`;
}

function handleQuickDestination(dest) {
    const messages = {
        'home': 'Opening navigation to Home...',
        'work': 'Opening navigation to Work...',
        'supercharger': 'Finding nearest Supercharger...',
        'service': 'Finding nearest Service Center...'
    };
    
    const resultsDiv = document.getElementById('navResults');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `<div class="nav-success">${messages[dest]}</div>`;
    
    // For superchargers, open Tesla's website
    if (dest === 'supercharger') {
        setTimeout(() => {
            window.open('https://www.tesla.com/findus?v=2&bounds=90,-180,-90,180&zoom=4&filters=supercharger', '_blank');
        }, 1000);
    }
    
    // For service centers
    if (dest === 'service') {
        setTimeout(() => {
            window.open('https://www.tesla.com/findus?v=2&bounds=90,-180,-90,180&zoom=4&filters=service', '_blank');
        }, 1000);
    }
}

// Charging Stations (OpenChargeMap - Free API)
async function findChargers() {
    const btn = document.getElementById('findChargersBtn');
    btn.textContent = 'Finding...';
    btn.disabled = true;
    
    try {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            
            const response = await fetch(
                `https://api.openchargemap.io/v3/poi/?output=json&latitude=${latitude}&longitude=${longitude}&distance=10&maxresults=5&compact=true&verbose=false`
            );
            const data = await response.json();
            
            const chargingInfo = document.getElementById('chargingInfo');
            chargingInfo.classList.remove('hidden');
            chargingInfo.innerHTML = '';
            
            if (data.length === 0) {
                chargingInfo.innerHTML = '<p style="text-align: center; padding: 20px;">No chargers found nearby</p>';
            } else {
                data.forEach(station => {
                    const chargerItem = document.createElement('div');
                    chargerItem.className = 'charger-item';
                    chargerItem.innerHTML = `
                        <div class="charger-name">${station.AddressInfo.Title}</div>
                        <div class="charger-distance">${station.AddressInfo.AddressLine1 || 'Address unavailable'}</div>
                    `;
                    chargingInfo.appendChild(chargerItem);
                });
            }
            
            btn.textContent = 'Refresh';
            btn.disabled = false;
        }, (error) => {
            console.error('Geolocation error:', error);
            alert('Unable to get location. Please enable location services.');
            btn.textContent = 'Find Chargers';
            btn.disabled = false;
        });
    } catch (error) {
        console.error('Charging stations error:', error);
        alert('Unable to find charging stations');
        btn.textContent = 'Find Chargers';
        btn.disabled = false;
    }
}

document.getElementById('findChargersBtn').addEventListener('click', findChargers);

// Tesla OAuth Functions
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
}

function base64URLEncode(buffer) {
    return btoa(String.fromCharCode.apply(null, buffer))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.subtle.digest('SHA-256', data);
}

async function generateCodeChallenge(verifier) {
    const hashed = await sha256(verifier);
    return base64URLEncode(new Uint8Array(hashed));
}

function initiateOAuthFlow() {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const state = generateCodeVerifier();
    
    // Store for later use
    sessionStorage.setItem('code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);
    
    // Generate code challenge
    generateCodeChallenge(codeVerifier).then(codeChallenge => {
        // Build authorization URL
        const params = new URLSearchParams({
            client_id: TESLA_OAUTH_CONFIG.clientId,
            redirect_uri: TESLA_OAUTH_CONFIG.redirectUri,
            response_type: 'code',
            scope: TESLA_OAUTH_CONFIG.scope,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            audience: 'https://fleet-api.prd.eu.vn.cloud.tesla.com'
        });
        
        // Redirect to Tesla OAuth
        window.location.href = `${TESLA_OAUTH_CONFIG.authUrl}?${params.toString()}`;
    });
}

async function exchangeCodeForToken(code) {
    const codeVerifier = sessionStorage.getItem('code_verifier');
    
    if (!codeVerifier) {
        throw new Error('Code verifier not found');
    }
    
    try {
        // Use backend proxy for secure token exchange
        const response = await fetch(`${TESLA_OAUTH_CONFIG.backendUrl}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                code_verifier: codeVerifier,
                redirect_uri: TESLA_OAUTH_CONFIG.redirectUri
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Token exchange failed');
        }
        
        const data = await response.json();
        
        // Store tokens
        localStorage.setItem('tesla_access_token', data.access_token);
        localStorage.setItem('tesla_refresh_token', data.refresh_token);
        localStorage.setItem('tesla_token_expiry', Date.now() + (data.expires_in * 1000));
        
        TESLA_CONFIG.accessToken = data.access_token;
        TESLA_CONFIG.refreshToken = data.refresh_token;
        TESLA_CONFIG.tokenExpiry = Date.now() + (data.expires_in * 1000);
        TESLA_CONFIG.useMockData = false;
        
        // Clean up session storage
        sessionStorage.removeItem('code_verifier');
        sessionStorage.removeItem('oauth_state');
        
        return data;
    } catch (error) {
        console.error('Token exchange error:', error);
        throw error;
    }
}

async function refreshAccessToken() {
    if (!TESLA_CONFIG.refreshToken) {
        throw new Error('No refresh token available');
    }
    
    try {
        // Use backend proxy for secure token refresh
        const response = await fetch(`${TESLA_OAUTH_CONFIG.backendUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                refresh_token: TESLA_CONFIG.refreshToken
            })
        });
        
        if (!response.ok) {
            throw new Error('Token refresh failed');
        }
        
        const data = await response.json();
        
        // Update stored tokens
        localStorage.setItem('tesla_access_token', data.access_token);
        localStorage.setItem('tesla_refresh_token', data.refresh_token);
        localStorage.setItem('tesla_token_expiry', Date.now() + (data.expires_in * 1000));
        
        TESLA_CONFIG.accessToken = data.access_token;
        TESLA_CONFIG.refreshToken = data.refresh_token;
        TESLA_CONFIG.tokenExpiry = Date.now() + (data.expires_in * 1000);
        
        return data;
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

// Tesla API Functions
async function getTeslaVehicleData() {
    if (TESLA_CONFIG.useMockData) {
        return MOCK_TESLA_DATA;
    }
    
    // Check if token needs refresh
    if (TESLA_CONFIG.tokenExpiry && Date.now() >= TESLA_CONFIG.tokenExpiry) {
        try {
            await refreshAccessToken();
        } catch (error) {
            console.error('Failed to refresh token:', error);
            return MOCK_TESLA_DATA;
        }
    }
    
    try {
        // Get vehicle ID if not set
        if (!TESLA_CONFIG.vehicleId) {
            const vehicles = await getTeslaVehicles();
            if (vehicles && vehicles.length > 0) {
                TESLA_CONFIG.vehicleId = vehicles[0].id_s;
                localStorage.setItem('tesla_vehicle_id', TESLA_CONFIG.vehicleId);
            } else {
                throw new Error('No vehicles found');
            }
        }
        
        // Use backend proxy for API calls
        const response = await fetch(
            `${TESLA_OAUTH_CONFIG.backendUrl}/vehicles/${TESLA_CONFIG.vehicleId}/vehicle_data`,
            {
                headers: {
                    'Authorization': `Bearer ${TESLA_CONFIG.accessToken}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch vehicle data');
        }
        
        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Tesla API error:', error);
        return MOCK_TESLA_DATA;
    }
}

async function getTeslaVehicles() {
    if (!TESLA_CONFIG.accessToken) {
        return [];
    }
    
    try {
        // Use backend proxy for API calls
        const response = await fetch(
            `${TESLA_OAUTH_CONFIG.backendUrl}/vehicles`,
            {
                headers: {
                    'Authorization': `Bearer ${TESLA_CONFIG.accessToken}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch vehicles');
        }
        
        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Failed to fetch vehicles:', error);
        return [];
    }
}

async function loadTeslaBattery() {
    try {
        const data = await getTeslaVehicleData();
        
        document.querySelector('#teslaBatteryTile .loading').classList.add('hidden');
        document.querySelector('#teslaBatteryTile .tesla-battery-info').classList.remove('hidden');
        
        const batteryLevel = data.battery_level || data.charge_state?.battery_level || 0;
        const batteryRange = data.battery_range || data.charge_state?.battery_range || 0;
        const chargingState = data.charging_state || data.charge_state?.charging_state || 'Unknown';
        
        document.getElementById('batteryLevel').textContent = `${batteryLevel}%`;
        document.getElementById('batteryRange').textContent = `${Math.round(batteryRange)} mi`;
        document.getElementById('chargingStatus').textContent = chargingState;
        
        // Update battery bar
        const batteryBar = document.querySelector('.battery-bar-fill');
        batteryBar.style.width = `${batteryLevel}%`;
        
        // Color code based on battery level
        if (batteryLevel > 50) {
            batteryBar.style.background = 'linear-gradient(90deg, #4ade80, #22c55e)';
        } else if (batteryLevel > 20) {
            batteryBar.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
        } else {
            batteryBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        }
    } catch (error) {
        console.error('Tesla battery error:', error);
        document.querySelector('#teslaBatteryTile .loading').textContent = 'Battery data unavailable';
    }
}

async function loadTeslaClimate() {
    try {
        const data = await getTeslaVehicleData();
        
        document.querySelector('#teslaClimateTile .loading').classList.add('hidden');
        document.querySelector('#teslaClimateTile .tesla-climate-info').classList.remove('hidden');
        
        const insideTemp = data.inside_temp || data.climate_state?.inside_temp || 0;
        const outsideTemp = data.outside_temp || data.climate_state?.outside_temp || 0;
        const isClimateOn = data.is_climate_on || data.climate_state?.is_climate_on || false;
        
        document.getElementById('insideTemp').textContent = formatTemperature(insideTemp);
        document.getElementById('outsideTemp').textContent = formatTemperature(outsideTemp);
        document.getElementById('climateStatus').textContent = isClimateOn ? 'Climate On' : 'Climate Off';
        document.getElementById('climateStatus').style.color = isClimateOn ? '#4ade80' : '#888';
    } catch (error) {
        console.error('Tesla climate error:', error);
        document.querySelector('#teslaClimateTile .loading').textContent = 'Climate data unavailable';
    }
}

async function loadTeslaVehicleInfo() {
    try {
        const data = await getTeslaVehicleData();
        
        document.querySelector('#teslaVehicleTile .loading').classList.add('hidden');
        document.querySelector('#teslaVehicleTile .tesla-vehicle-info').classList.remove('hidden');
        
        const vehicleName = data.vehicle_name || data.display_name || 'Model 3';
        const odometer = data.odometer || data.vehicle_state?.odometer || 0;
        const locked = data.locked !== undefined ? data.locked : (data.vehicle_state?.locked || false);
        const sentryMode = data.sentry_mode !== undefined ? data.sentry_mode : (data.vehicle_state?.sentry_mode || false);
        
        document.getElementById('vehicleName').textContent = vehicleName;
        document.getElementById('odometer').textContent = `${Math.round(odometer).toLocaleString()} mi`;
        document.getElementById('lockStatus').textContent = locked ? '🔒 Locked' : '🔓 Unlocked';
        document.getElementById('sentryStatus').textContent = sentryMode ? '👁️ Sentry Active' : '👁️ Sentry Off';
        
        document.getElementById('lockStatus').style.color = locked ? '#4ade80' : '#fbbf24';
        document.getElementById('sentryStatus').style.color = sentryMode ? '#4ade80' : '#888';
    } catch (error) {
        console.error('Tesla vehicle error:', error);
        document.querySelector('#teslaVehicleTile .loading').textContent = 'Vehicle data unavailable';
    }
}

// Setup Tesla API authentication
function setupTeslaAuth() {
    const authBtn = document.getElementById('teslaAuthBtn');
    const authInfo = document.getElementById('teslaAuthInfo');
    
    // Check if client ID is configured
    if (!TESLA_OAUTH_CONFIG.clientId) {
        authInfo.innerHTML = 'Using demo data<br><small>Start backend: cd backend && npm install && npm start</small>';
        authInfo.style.color = '#fbbf24';
        authInfo.style.fontSize = '0.85rem';
        authBtn.textContent = 'How to Connect';
        
        authBtn.addEventListener('click', () => {
            showBackendSetupInstructions();
        });
        return;
    }
    
    // Check if already authenticated
    if (TESLA_CONFIG.accessToken) {
        authBtn.textContent = 'Disconnect Tesla';
        authInfo.textContent = 'Connected to your Tesla';
        authInfo.style.color = '#4ade80';
        
        authBtn.addEventListener('click', () => {
            if (confirm('Disconnect your Tesla account?')) {
                localStorage.removeItem('tesla_access_token');
                localStorage.removeItem('tesla_refresh_token');
                localStorage.removeItem('tesla_token_expiry');
                localStorage.removeItem('tesla_vehicle_id');
                
                TESLA_CONFIG.accessToken = null;
                TESLA_CONFIG.refreshToken = null;
                TESLA_CONFIG.tokenExpiry = null;
                TESLA_CONFIG.vehicleId = null;
                TESLA_CONFIG.useMockData = true;
                
                authBtn.textContent = 'Connect Tesla Account';
                authInfo.textContent = 'Using demo data';
                authInfo.style.color = '#888';
                
                // Reload page to refresh with demo data
                setTimeout(() => location.reload(), 1000);
            }
        });
    } else {
        authBtn.textContent = 'Connect Tesla Account';
        authInfo.textContent = 'Using demo data';
        authInfo.style.color = '#888';
        
        authBtn.addEventListener('click', () => {
            if (!TESLA_OAUTH_CONFIG.clientId) {
                alert('Backend server not running!\n\nPlease start it first:\n\n1. Open terminal\n2. cd backend\n3. npm install\n4. npm start\n5. Refresh this page');
                return;
            }
            initiateOAuthFlow();
        });
    }
    
    // Check for OAuth callback
    handleOAuthCallback();
}

function showBackendSetupInstructions() {
    const instructions = `
🚀 Quick Setup to Use Live Tesla Data:

1. Open a NEW terminal/PowerShell window

2. Navigate to backend folder:
   cd "${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/backend"

3. Install dependencies (first time only):
   npm install

4. Start the backend server:
   npm start

5. Refresh this page

6. Click "Connect Tesla Account"

That's it! Your credentials are already configured in the .env file.

⚡ The backend server proxies Tesla API calls securely and avoids CORS issues.
    `.trim();
    
    alert(instructions);
}

function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    if (error) {
        console.error('OAuth error:', error);
        alert('Authentication failed: ' + error);
        return;
    }
    
    if (code && state) {
        const savedState = sessionStorage.getItem('oauth_state');
        
        if (state !== savedState) {
            console.error('State mismatch');
            alert('Authentication failed: State mismatch');
            return;
        }
        
        // Exchange code for token
        exchangeCodeForToken(code)
            .then(() => {
                // Clear URL parameters
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Reload page to show connected state
                location.reload();
            })
            .catch(error => {
                console.error('Token exchange failed:', error);
                alert('Failed to complete authentication. This may be due to CORS restrictions. Consider using Tessie or a backend proxy.');
            });
    }
}

function showOAuthSetupInstructions() {
    const instructions = `
� Tesla OAuth Setup:

⚠️ IMPORTANT: Direct OAuth from browser has limitations due to CORS.

RECOMMENDED APPROACHES:

1️⃣ USE TESSIE (Easiest - $5/month):
   - Sign up: https://my.tessie.com/
   - Link your Tesla account
   - Get API token
   - Use Tessie's API (no CORS issues)
   
2️⃣ USE TESLAFI:
   - Sign up: https://www.teslafi.com/
   - Similar to Tessie
   - Good logging features

3️⃣ SELF-HOST TESLAMATE:
   - Free & open source
   - Requires Docker/server
   - https://github.com/adriankumpf/teslamate

4️⃣ BUILD BACKEND PROXY:
   - Use Node.js/Python backend
   - Proxy Tesla API calls
   - Handle OAuth securely

TO USE DIRECT OAUTH (Advanced):
1. Register app: https://developer.tesla.com/
2. Get Client ID & Secret
3. Update TESLA_OAUTH_CONFIG in app.js
4. Note: Will still hit CORS issues without backend

Currently using demo data to show functionality.
    `.trim();
    
    alert(instructions);
}

// Settings functionality
function setupSettings() {
    const tempUnitSelect = document.getElementById('tempUnit');
    const refreshBtn = document.getElementById('refreshAllBtn');
    
    // Load saved preference
    tempUnitSelect.value = USER_PREFERENCES.temperatureUnit;
    
    tempUnitSelect.addEventListener('change', (e) => {
        USER_PREFERENCES.temperatureUnit = e.target.value;
        localStorage.setItem('temp_unit', e.target.value);
        
        // Refresh weather and climate to show new units
        loadWeather();
        loadTeslaClimate();
    });
    
    refreshBtn.addEventListener('click', () => {
        loadWeather();
        loadTeslaBattery();
        loadTeslaClimate();
        loadTeslaVehicleInfo();
        refreshBtn.textContent = 'Refreshed!';
        setTimeout(() => {
            refreshBtn.textContent = 'Refresh All Data';
        }, 2000);
    });
}

// Check for OAuth callback from sessionStorage (set by callback page)
async function checkOAuthCallback() {
    const code = sessionStorage.getItem('tesla_oauth_code');
    const state = sessionStorage.getItem('tesla_oauth_state');
    
    if (code && state) {
        // Clear from sessionStorage
        sessionStorage.removeItem('tesla_oauth_code');
        sessionStorage.removeItem('tesla_oauth_state');
        
        // Retrieve stored code verifier
        const codeVerifier = sessionStorage.getItem('tesla_code_verifier');
        const storedState = sessionStorage.getItem('tesla_oauth_state_key');
        
        if (state !== storedState) {
            console.error('State mismatch - possible CSRF attack');
            return;
        }
        
        // Exchange code for token
        await exchangeCodeForToken(code, codeVerifier);
    }
}

// Initialize OAuth config and tiles
initializeOAuthConfig().then(async () => {
    await checkOAuthCallback();
    loadWeather();
    loadTeslaBattery();
    loadTeslaClimate();
    loadTeslaVehicleInfo();
    setupTeslaAuth();
    setupNavigation();
    setupSettings();
});

// Refresh Tesla data every 30 seconds
setInterval(() => {
    loadTeslaBattery();
    loadTeslaClimate();
    loadTeslaVehicleInfo();
}, 30000);
