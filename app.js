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
            
            // Get weather data directly without reverse geocoding to avoid CORS
            const weatherResponse = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit`
            );
            const weatherData = await weatherResponse.json();
            
            const weather = weatherData.current_weather;
            
            document.querySelector('#weatherTile .loading').classList.add('hidden');
            document.querySelector('#weatherTile .weather-info').classList.remove('hidden');
            document.getElementById('temperature').textContent = `${Math.round(weather.temperature)}°F`;
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
        const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current_weather=true&temperature_unit=fahrenheit`
        );
        const weatherData = await weatherResponse.json();
        const weather = weatherData.current_weather;
        
        document.querySelector('#weatherTile .loading').classList.add('hidden');
        document.querySelector('#weatherTile .weather-info').classList.remove('hidden');
        document.getElementById('temperature').textContent = `${Math.round(weather.temperature)}°F`;
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

// News API (NewsAPI.org - Free tier available, or use public RSS feeds)
async function loadNews() {
    try {
        // Using a public news API alternative (no key required)
        const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/world/rss.xml');
        const data = await response.json();
        
        document.querySelector('#newsTile .loading').classList.add('hidden');
        const newsList = document.getElementById('newsList');
        newsList.classList.remove('hidden');
        
        data.items.slice(0, 5).forEach(article => {
            const newsItem = document.createElement('div');
            newsItem.className = 'news-item';
            newsItem.innerHTML = `
                <div class="news-title">${article.title}</div>
                <div class="news-source">BBC News</div>
            `;
            newsItem.onclick = () => window.open(article.link, '_blank');
            newsList.appendChild(newsItem);
        });
    } catch (error) {
        console.error('News error:', error);
        document.querySelector('#newsTile .loading').textContent = 'News unavailable';
    }
}

// Quote API - Using built-in quotes as fallback for CORS issues
async function loadQuote() {
    const fallbackQuotes = [
        { content: "The best way to predict the future is to invent it.", author: "Alan Kay" },
        { content: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
        { content: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
        { content: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
        { content: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
        { content: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
        { content: "The secret of getting ahead is getting started.", author: "Mark Twain" },
        { content: "It always seems impossible until it's done.", author: "Nelson Mandela" },
        { content: "Technology is best when it brings people together.", author: "Matt Mullenweg" },
        { content: "Any sufficiently advanced technology is indistinguishable from magic.", author: "Arthur C. Clarke" }
    ];
    
    try {
        const response = await fetch('https://api.quotable.io/quotes/random?tags=technology,inspirational,success&limit=1');
        const data = await response.json();
        
        if (data && data[0]) {
            document.querySelector('#quoteTile .loading').classList.add('hidden');
            document.querySelector('#quoteTile .quote-content').classList.remove('hidden');
            document.getElementById('quoteText').textContent = `"${data[0].content}"`;
            document.getElementById('quoteAuthor').textContent = `— ${data[0].author}`;
        } else {
            throw new Error('No quote data');
        }
    } catch (error) {
        console.log('Using fallback quote');
        // Use fallback quotes
        const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
        document.querySelector('#quoteTile .loading').classList.add('hidden');
        document.querySelector('#quoteTile .quote-content').classList.remove('hidden');
        document.getElementById('quoteText').textContent = `"${randomQuote.content}"`;
        document.getElementById('quoteAuthor').textContent = `— ${randomQuote.author}`;
    }
}

// NASA API (NASA APOD - Free with DEMO_KEY)
async function loadNASAPhoto() {
    try {
        const response = await fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
        const data = await response.json();
        
        document.querySelector('#nasaTile .loading').classList.add('hidden');
        document.querySelector('#nasaTile .nasa-content').classList.remove('hidden');
        
        if (data.media_type === 'image') {
            document.getElementById('nasaImage').src = data.url;
            document.getElementById('nasaTitle').textContent = data.title;
        } else {
            document.querySelector('#nasaTile .nasa-content').innerHTML = 
                '<p style="text-align: center; padding: 20px;">Video content - visit NASA website</p>';
        }
    } catch (error) {
        console.error('NASA error:', error);
        document.querySelector('#nasaTile .loading').textContent = 'NASA photo unavailable';
    }
}

// Random Facts API (uselessfacts.jsph.pl - Free, no key)
async function loadFact() {
    try {
        const response = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await response.json();
        
        document.querySelector('#factsTile .loading').classList.add('hidden');
        document.querySelector('#factsTile .fact-content').classList.remove('hidden');
        document.getElementById('factText').textContent = data.text;
    } catch (error) {
        console.error('Facts error:', error);
        document.querySelector('#factsTile .loading').textContent = 'Fact unavailable';
    }
}

document.getElementById('newFactBtn').addEventListener('click', loadFact);

// Currency Converter (exchangerate-api.com - Free tier)
async function convertCurrency() {
    const amount = document.getElementById('amount').value;
    const from = document.getElementById('fromCurrency').value;
    const to = document.getElementById('toCurrency').value;
    
    try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
        const data = await response.json();
        
        const rate = data.rates[to];
        const result = (amount * rate).toFixed(2);
        
        const resultDiv = document.getElementById('conversionResult');
        resultDiv.classList.remove('hidden');
        resultDiv.textContent = `${amount} ${from} = ${result} ${to}`;
    } catch (error) {
        console.error('Currency error:', error);
        alert('Currency conversion unavailable');
    }
}

document.getElementById('convertBtn').addEventListener('click', convertCurrency);

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
        
        document.getElementById('insideTemp').textContent = `${Math.round(insideTemp * 9/5 + 32)}°F`;
        document.getElementById('outsideTemp').textContent = `${Math.round(outsideTemp * 9/5 + 32)}°F`;
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

// Initialize all tiles
loadWeather();
loadNews();
loadQuote();
loadNASAPhoto();
loadFact();
loadTeslaBattery();
loadTeslaClimate();
loadTeslaVehicleInfo();
setupTeslaAuth();

// Refresh Tesla data every 30 seconds
setInterval(() => {
    loadTeslaBattery();
    loadTeslaClimate();
    loadTeslaVehicleInfo();
}, 30000);
