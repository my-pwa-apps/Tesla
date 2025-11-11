// Tesla Dashboard App

// Initialize Firebase
let firebaseInitialized = false;
let firebaseFunctions = null;

if (typeof window.firebaseApp !== 'undefined') {
    firebaseInitialized = window.firebaseApp.init();
    if (firebaseInitialized) {
        firebaseFunctions = firebase.functions();
    }
}

// Tesla API Configuration
const TESLA_CONFIG = {
    useFirebase: firebaseInitialized, // Use Firebase if available
    useMockData: !firebaseInitialized // Use mock data only if Firebase isn't available
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

// Tesla API Functions with Firebase Integration
async function getTeslaVehicleData() {
    // If Firebase is configured, use Cloud Functions
    if (TESLA_CONFIG.useFirebase && firebaseFunctions) {
        try {
            const getTeslaData = firebaseFunctions.httpsCallable('getTeslaVehicleData');
            const result = await getTeslaData();
            return result.data;
        } catch (error) {
            console.error('Firebase function error:', error);
            // Try to get cached data from Firestore
            try {
                const db = window.firebaseApp.getDb();
                const auth = window.firebaseApp.getAuth();
                const user = auth.currentUser;
                
                if (user) {
                    const cacheDoc = await db.collection('tesla_cache').doc(user.uid).get();
                    if (cacheDoc.exists) {
                        const cacheData = cacheDoc.data();
                        console.log('Using cached Tesla data');
                        return cacheData.data;
                    }
                }
            } catch (cacheError) {
                console.error('Cache retrieval error:', cacheError);
            }
            // Fallback to mock data
            return MOCK_TESLA_DATA;
        }
    }
    
    // Fallback to mock data if Firebase not configured
    if (TESLA_CONFIG.useMockData) {
        return MOCK_TESLA_DATA;
    }
    
    return MOCK_TESLA_DATA;
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

// Setup Tesla API authentication with Firebase
function setupTeslaAuth() {
    const authBtn = document.getElementById('teslaAuthBtn');
    const authInfo = document.getElementById('teslaAuthInfo');
    
    if (!TESLA_CONFIG.useFirebase) {
        authInfo.textContent = 'Using demo data (Firebase not configured)';
        authInfo.style.color = '#fbbf24';
        authBtn.textContent = 'Setup Firebase';
        
        authBtn.addEventListener('click', () => {
            showFirebaseSetupInstructions();
        });
        return;
    }
    
    // Check Firebase auth state
    const auth = window.firebaseApp.getAuth();
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // User is signed in
            const db = window.firebaseApp.getDb();
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists && userDoc.data().teslaAccessToken) {
                authBtn.textContent = 'Disconnect Tesla';
                authInfo.textContent = 'Connected to your Tesla';
                authInfo.style.color = '#4ade80';
            } else {
                authBtn.textContent = 'Link Tesla Account';
                authInfo.textContent = 'Signed in - Link your Tesla';
                authInfo.style.color = '#fbbf24';
            }
        } else {
            // User is not signed in
            authBtn.textContent = 'Sign In with Google';
            authInfo.textContent = 'Sign in to connect Tesla';
            authInfo.style.color = '#888';
        }
    });
    
    authBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        
        if (!user) {
            // Sign in with Google
            const provider = new firebase.auth.GoogleAuthProvider();
            try {
                await auth.signInWithPopup(provider);
            } catch (error) {
                console.error('Sign in error:', error);
                alert('Sign in failed: ' + error.message);
            }
        } else {
            // Check if Tesla is linked
            const db = window.firebaseApp.getDb();
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists && userDoc.data().teslaAccessToken) {
                // Disconnect Tesla
                if (confirm('Disconnect your Tesla account?')) {
                    await db.collection('users').doc(user.uid).update({
                        teslaAccessToken: firebase.firestore.FieldValue.delete(),
                        teslaRefreshToken: firebase.firestore.FieldValue.delete(),
                        teslaVehicleId: firebase.firestore.FieldValue.delete()
                    });
                    authInfo.textContent = 'Tesla disconnected';
                    authInfo.style.color = '#888';
                }
            } else {
                // Link Tesla account
                showTeslaLinkInstructions();
            }
        }
    });
}

function showFirebaseSetupInstructions() {
    const instructions = `
📱 Firebase Setup Instructions:

1. Go to https://console.firebase.google.com/
2. Create a new project (or select existing)
3. Enable Authentication (Google Sign-In)
4. Enable Cloud Firestore
5. Enable Cloud Functions
6. Get your Firebase config from Project Settings
7. Update firebase-config.js with your credentials
8. Deploy Cloud Functions:
   cd functions
   npm install
   firebase deploy --only functions

Benefits:
✅ Secure OAuth handling
✅ No CORS issues
✅ Automatic token refresh
✅ Data caching
✅ Background sync every 5 minutes
    `.trim();
    
    alert(instructions);
}

function showTeslaLinkInstructions() {
    const instructions = `
🚗 Link Tesla Account:

You'll need to use Tesla's OAuth flow. Two options:

OPTION 1 - Use Tessie (Easiest):
1. Sign up at https://my.tessie.com/
2. Link your Tesla account there
3. Get API token from Tessie
4. Store in Firestore (we'll add this flow)

OPTION 2 - Direct Tesla OAuth (Advanced):
1. Register app at https://tesla.com/developers
2. Implement OAuth flow in Firebase Functions
3. Get access token and vehicle ID
4. Store securely in Firestore

For now, the app uses demo data to show functionality.
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

// Initialize all tiles
loadWeather();
loadTeslaBattery();
loadTeslaClimate();
loadTeslaVehicleInfo();
setupTeslaAuth();
setupNavigation();
setupSettings();

// Refresh Tesla data every 30 seconds
setInterval(() => {
    loadTeslaBattery();
    loadTeslaClimate();
    loadTeslaVehicleInfo();
}, 30000);
