// Tesla Dashboard App

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
            
            // Get location name
            const locationResponse = await fetch(
                `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`
            );
            const locationData = await locationResponse.json();
            
            // Get weather data
            const weatherResponse = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=fahrenheit`
            );
            const weatherData = await weatherResponse.json();
            
            const weather = weatherData.current_weather;
            
            document.querySelector('#weatherTile .loading').classList.add('hidden');
            document.querySelector('#weatherTile .weather-info').classList.remove('hidden');
            document.getElementById('temperature').textContent = `${Math.round(weather.temperature)}°F`;
            document.getElementById('condition').textContent = getWeatherDescription(weather.weathercode);
            document.getElementById('location').textContent = locationData.results?.[0]?.name || 'Your Location';
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

// Quote API (quotable.io - Free, no API key)
async function loadQuote() {
    try {
        const response = await fetch('https://api.quotable.io/random?tags=technology|inspirational|success');
        const data = await response.json();
        
        document.querySelector('#quoteTile .loading').classList.add('hidden');
        document.querySelector('#quoteTile .quote-content').classList.remove('hidden');
        document.getElementById('quoteText').textContent = `"${data.content}"`;
        document.getElementById('quoteAuthor').textContent = `— ${data.author}`;
    } catch (error) {
        console.error('Quote error:', error);
        document.querySelector('#quoteTile .loading').textContent = 'Quote unavailable';
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

// Initialize all tiles
loadWeather();
loadNews();
loadQuote();
loadNASAPhoto();
loadFact();
