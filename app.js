// ============================================================
//  Tesla Dashboard – app.js
// ============================================================

// ── Configuration ────────────────────────────────────────────

const BACKEND_URL = (() => {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://bart-gilt-delta.vercel.app';
})();

const TESLA_OAUTH = {
    authUrl        : 'https://auth.tesla.com/oauth2/v3/authorize',
    clientId       : null,   // loaded from backend /api/config
    redirectUri    : null,   // set after clientId loads
    scopes         : 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds',
    audience       : 'https://fleet-api.prd.eu.vn.cloud.tesla.com'
};

const USER_PREFERENCES = {
    temperatureUnit: localStorage.getItem('temp_unit') || 'celsius',
    distanceUnit   : localStorage.getItem('dist_unit') || 'km',
    userLocation   : null
};

// ── Mock / fallback data ─────────────────────────────────────

const MOCK_TESLA_DATA = {
    // charge_state
    battery_level        : 78,
    battery_range        : 245.2,
    charging_state       : 'Disconnected',
    charge_limit_soc     : 90,
    charge_rate          : 0,
    time_to_full_charge  : 0,
    charge_energy_added  : 0,
    charger_power        : 0,
    charger_voltage      : 0,
    // climate_state
    inside_temp          : 20.3,
    outside_temp         : 12.8,
    is_climate_on        : false,
    is_preconditioning   : false,
    driver_temp_setting  : 21,
    fan_status           : 0,
    // drive_state
    speed                : 0,
    shift_state          : 'P',
    power                : 0,
    latitude             : null,
    longitude            : null,
    heading              : 0,
    // vehicle_state
    odometer             : 15234.7,
    locked               : true,
    sentry_mode          : true,
    software_version     : 'Demo',
    tpms_pressure_fl     : 2.9,
    tpms_pressure_fr     : 2.9,
    tpms_pressure_rl     : 2.9,
    tpms_pressure_rr     : 2.9,
    df: 0, dr: 0, pf: 0, pr: 0,
    // vehicle_config
    car_type             : 'model3',
    // top-level
    vehicle_name         : 'Model 3 Highland'
};

// Live data cache – populated from real API when connected
let LIVE_DATA = null;

// ── Token helpers ────────────────────────────────────────────

const AUTH = {
    getAccessToken()   { return localStorage.getItem('tesla_access_token');  },
    getRefreshToken()  { return localStorage.getItem('tesla_refresh_token'); },
    getExpiry()        { return parseInt(localStorage.getItem('tesla_token_expiry') || '0', 10); },
    getVehicleId()     { return localStorage.getItem('tesla_vehicle_id');    },
    getVehicleName()   { return localStorage.getItem('tesla_vehicle_name') || 'My Tesla'; },

    save(data) {
        localStorage.setItem('tesla_access_token',  data.access_token);
        localStorage.setItem('tesla_refresh_token', data.refresh_token);
        localStorage.setItem('tesla_token_expiry',  Date.now() + data.expires_in * 1000);
    },

    clear() {
        ['tesla_access_token','tesla_refresh_token','tesla_token_expiry',
         'tesla_vehicle_id','tesla_vehicle_name'].forEach(k => localStorage.removeItem(k));
        LIVE_DATA = null;
    },

    isLoggedIn() { return !!AUTH.getAccessToken(); },

    isExpired() {
        const e = AUTH.getExpiry();
        return e > 0 && Date.now() > e - 60_000;   // refresh 1 min before expiry
    },

    async refresh() {
        const rt = AUTH.getRefreshToken();
        if (!rt) return false;
        try {
            const r = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ refresh_token: rt })
            });
            if (!r.ok) { AUTH.clear(); return false; }
            AUTH.save(await r.json());
            return true;
        } catch { return false; }
    }
};

// ── PKCE helpers ─────────────────────────────────────────────

function randomString(len = 64) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256b64url(str) {
    const enc  = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Connect / OAuth ──────────────────────────────────────────

async function initOAuth() {
    if (TESLA_OAUTH.clientId) return;
    try {
        const r = await fetch(`${BACKEND_URL}/api/config`);
        const d = await r.json();
        TESLA_OAUTH.clientId   = d.clientId;
        // Always redirect to the Vercel-hosted callback (stable, registered URL)
        // For local dev fall back to the local backend callback
        const h = window.location.hostname;
        TESLA_OAUTH.redirectUri = (h === 'localhost' || h === '127.0.0.1')
            ? 'http://localhost:3000/callback.html'
            : 'https://bart-gilt-delta.vercel.app/callback.html';
    } catch { /* backend unavailable */ }
}

async function connectTesla() {
    await initOAuth();
    if (!TESLA_OAUTH.clientId) {
        alert('Backend unavailable – cannot connect.');
        return;
    }

    const verifier  = randomString(64);
    const challenge = await sha256b64url(verifier);
    const state     = randomString(16);

    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('oauth_state',   state);

    const params = new URLSearchParams({
        response_type         : 'code',
        client_id             : TESLA_OAUTH.clientId,
        redirect_uri          : TESLA_OAUTH.redirectUri,
        scope                 : TESLA_OAUTH.scopes,
        state,
        code_challenge        : challenge,
        code_challenge_method : 'S256',
        audience              : TESLA_OAUTH.audience
    });

    window.open(`${TESLA_OAUTH.authUrl}?${params}`, 'tesla_auth',
        'width=560,height=720,left=400,top=100');
}

// Receive code back from callback popup
window.addEventListener('message', async e => {
    if (e.data?.type !== 'tesla_oauth_callback') return;
    const { code, state } = e.data;

    const savedState   = sessionStorage.getItem('oauth_state');
    const codeVerifier = sessionStorage.getItem('pkce_verifier');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_verifier');

    if (state !== savedState || !code || !codeVerifier) {
        console.error('OAuth state mismatch');
        return;
    }

    updateConnectUI('connecting');

    try {
        const r = await fetch(`${BACKEND_URL}/api/auth/token`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({
                code,
                code_verifier: codeVerifier,
                redirect_uri : TESLA_OAUTH.redirectUri
            })
        });
        const tokenData = await r.json();
        if (!r.ok) {
            console.error('Token exchange error response:', tokenData);
            throw new Error(tokenData.error || tokenData.error_description || 'Token exchange failed');
        }
        AUTH.save(tokenData);

        await loadVehicles();
        updateConnectUI('connected');
        loadAllTeslaData();
    } catch (err) {
        console.error(err);
        updateConnectUI('idle');
    }
});

// ── Vehicle selection ────────────────────────────────────────

async function loadVehicles() {
    try {
        const r = await authedFetch(`${BACKEND_URL}/api/vehicles`);
        if (!r.ok) return;
        const data = await r.json();
        const list = data.response || data;
        if (!Array.isArray(list) || !list.length) return;

        // Auto-select first vehicle
        const v = list[0];
        const id = v.id_s || String(v.id);
        localStorage.setItem('tesla_vehicle_id',   id);
        localStorage.setItem('tesla_vehicle_name', v.display_name || 'Tesla');
    } catch { /* ignore */ }
}

// ── Authenticated fetch ───────────────────────────────────────

async function authedFetch(url, opts = {}) {
    if (AUTH.isExpired()) await AUTH.refresh();
    const token = AUTH.getAccessToken();
    return fetch(url, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });
}

// ── Vehicle data fetch ────────────────────────────────────────

async function fetchLiveData() {
    const vid = AUTH.getVehicleId();
    if (!vid) return null;
    try {
        const r = await authedFetch(`${BACKEND_URL}/api/vehicles/${vid}/vehicle_data`);
        if (!r.ok) return null;
        const json = await r.json();
        return json.response || json;
    } catch { return null; }
}

// Flatten all sub-states into a single object (mirrors MOCK_TESLA_DATA shape)
function flattenVehicleData(v) {
    if (!v) return null;
    const cs = v.charge_state   || {};
    const cl = v.climate_state  || {};
    const ds = v.drive_state    || {};
    const vs = v.vehicle_state  || {};
    const vc = v.vehicle_config || {};
    return {
        // charge_state
        battery_level       : cs.battery_level,
        battery_range       : cs.battery_range,
        charging_state      : cs.charging_state,
        charge_limit_soc    : cs.charge_limit_soc,
        charge_rate         : cs.charge_rate         || 0,
        time_to_full_charge : cs.time_to_full_charge || 0,
        charge_energy_added : cs.charge_energy_added || 0,
        charger_power       : cs.charger_power        || 0,
        charger_voltage     : cs.charger_voltage      || 0,
        // climate_state
        inside_temp         : cl.inside_temp,
        outside_temp        : cl.outside_temp,
        is_climate_on       : cl.is_climate_on,
        is_preconditioning  : cl.is_preconditioning,
        driver_temp_setting : cl.driver_temp_setting,
        fan_status          : cl.fan_status           || 0,
        // drive_state
        speed               : ds.speed               || 0,
        shift_state         : ds.shift_state          || 'P',
        power               : ds.power               || 0,
        latitude            : ds.latitude,
        longitude           : ds.longitude,
        heading             : ds.heading             || 0,
        // vehicle_state
        odometer            : vs.odometer,
        locked              : vs.locked,
        sentry_mode         : vs.sentry_mode,
        software_version    : vs.car_version          || vs.software_update?.status || '--',
        tpms_pressure_fl    : vs.tpms_pressure_fl,
        tpms_pressure_fr    : vs.tpms_pressure_fr,
        tpms_pressure_rl    : vs.tpms_pressure_rl,
        tpms_pressure_rr    : vs.tpms_pressure_rr,
        df: vs.df, dr: vs.dr, pf: vs.pf, pr: vs.pr,
        // vehicle_config
        car_type            : vc.car_type,
        // top-level
        vehicle_name        : v.display_name          || AUTH.getVehicleName()
    };
}

function getTeslaData() {
    return LIVE_DATA || MOCK_TESLA_DATA;
}

// ── Connect UI button ────────────────────────────────────────

function updateConnectUI(state) {
    const btn = document.getElementById('connectTeslaBtn');
    if (!btn) return;
    if (state === 'connected') {
        btn.innerHTML = `
            <span class="connect-dot connected"></span>
            ${AUTH.getVehicleName()}`;
        btn.classList.add('is-connected');
        btn.title = 'Click to disconnect';
        btn.onclick = disconnectTesla;
    } else if (state === 'connecting') {
        btn.innerHTML = '<span class="connect-dot pulse"></span>Connecting…';
        btn.classList.remove('is-connected');
        btn.onclick = null;
    } else {
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/>
            </svg>
            Connect Tesla`;
        btn.classList.remove('is-connected');
        btn.onclick = connectTesla;
    }
}

function disconnectTesla() {
    if (!confirm('Disconnect Tesla account?')) return;
    AUTH.clear();
    updateConnectUI('idle');
    LIVE_DATA = null;
    // Re-render all tiles with demo data
    loadAllTeslaData(true);
}

// ── Utilities ─────────────────────────────────────────────────

function celsiusToFahrenheit(c) { return (c * 9 / 5) + 32; }

function formatTemperature(celsius) {
    if (celsius == null) return '--';
    if (USER_PREFERENCES.temperatureUnit === 'fahrenheit') {
        return `${Math.round(celsiusToFahrenheit(celsius))}\u00b0F`;
    }
    return `${Math.round(celsius)}\u00b0C`;
}

function formatDistance(km) {
    if (km == null) return '--';
    if (USER_PREFERENCES.distanceUnit === 'miles') {
        return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
}

// ── Clock ──────────────────────────────────────────────────────

function updateTime() {
    document.getElementById('currentTime').textContent = new Date().toLocaleString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}
updateTime();
setInterval(updateTime, 1000);

// ── Weather ────────────────────────────────────────────────────

async function loadWeather() {
    try {
        if (!navigator.geolocation) throw new Error('no geolocation');
        navigator.geolocation.getCurrentPosition(async pos => {
            const { latitude: lat, longitude: lon } = pos.coords;
            USER_PREFERENCES.userLocation = { lat, lon };
            await renderWeather(lat, lon, null);
        }, () => renderWeather(52.3676, 4.9041, 'Amsterdam'));
    } catch {
        renderWeather(52.3676, 4.9041, 'Amsterdam');
    }
}

async function renderWeather(lat, lon, label) {
    try {
        const resp = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const { current_weather: w } = await resp.json();
        document.querySelector('#weatherTile .loading').classList.add('hidden');
        document.querySelector('#weatherTile .weather-info').classList.remove('hidden');
        document.getElementById('temperature').textContent = formatTemperature(w.temperature);
        document.getElementById('condition').textContent   = getWeatherDescription(w.weathercode);
        document.getElementById('location').textContent    = label || `${lat.toFixed(2)}\u00b0, ${lon.toFixed(2)}\u00b0`;
    } catch {
        document.querySelector('#weatherTile .loading').textContent = 'Weather unavailable';
    }
}

function getWeatherDescription(code) {
    const map = {
        0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
        45:'Fog',48:'Fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
        61:'Light rain',63:'Rain',65:'Heavy rain',
        71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',
        80:'Light showers',81:'Showers',82:'Heavy showers',
        85:'Snow showers',86:'Heavy snow showers',
        95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail'
    };
    return map[code] || 'Unknown';
}

// ── Tesla: Battery & Charging ─────────────────────────────────

function loadTeslaBattery() {
    const d = getTeslaData();
    document.querySelector('#teslaBatteryTile .loading').classList.add('hidden');
    document.querySelector('#teslaBatteryTile .tesla-battery-info').classList.remove('hidden');

    const lvl = d.battery_level ?? 0;
    document.getElementById('batteryLevel').textContent  = `${lvl}%`;
    document.getElementById('batteryRange').textContent  = formatDistance(
        (d.battery_range || 0) * (USER_PREFERENCES.distanceUnit === 'miles' ? 1 : 1.60934)
    );
    document.getElementById('chargingStatus').textContent = d.charging_state || '--';

    const fill = document.querySelector('.battery-bar-fill');
    fill.style.width      = `${lvl}%`;
    fill.style.background = lvl > 50 ? 'var(--c-white)' : lvl > 20 ? '#f59e0b' : 'var(--c-red)';

    // Extra charge details — show when connected or actively charging
    const chargeEl = document.getElementById('chargeDetails');
    if (chargeEl) {
        const showDetails = LIVE_DATA || d.charging_state === 'Charging';
        chargeEl.classList.toggle('hidden', !showDetails);

        const charger_kw   = d.charger_power || 0;
        const timeToFull   = d.time_to_full_charge || 0;
        const energyAdded  = d.charge_energy_added || 0;
        const limit        = d.charge_limit_soc || '--';

        document.getElementById('chargerPower').textContent     = charger_kw > 0 ? `${charger_kw} kW` : '--';
        document.getElementById('timeToFull').textContent       = timeToFull > 0
            ? timeToFull < 1 ? `${Math.round(timeToFull * 60)} min` : `${timeToFull.toFixed(1)} h`
            : '--';
        document.getElementById('chargeEnergyAdded').textContent = energyAdded > 0 ? `${energyAdded.toFixed(1)} kWh` : '--';
        document.getElementById('chargeLimitDisplay').textContent = `${limit}%`;
    }
}

// ── Tesla: Climate ────────────────────────────────────────────

function loadTeslaClimate() {
    const d = getTeslaData();
    document.querySelector('#teslaClimateTile .loading').classList.add('hidden');
    document.querySelector('#teslaClimateTile .tesla-climate-info').classList.remove('hidden');

    document.getElementById('insideTemp').textContent  = formatTemperature(d.inside_temp);
    document.getElementById('outsideTemp').textContent = formatTemperature(d.outside_temp);

    const status = document.getElementById('climateStatus');
    const label  = d.is_preconditioning ? 'Pre-conditioning'
                 : d.is_climate_on      ? 'Climate On'
                 : 'Climate Off';
    status.textContent = label;
    status.style.color = (d.is_climate_on || d.is_preconditioning) ? '#fff' : 'var(--c-text-muted)';

    const setTemp = document.getElementById('setTempDisplay');
    if (setTemp && d.driver_temp_setting != null) {
        setTemp.textContent = `Set: ${formatTemperature(d.driver_temp_setting)}`;
    }
}

// ── Tesla: Vehicle info ───────────────────────────────────────

function loadTeslaVehicleInfo() {
    const d = getTeslaData();
    document.querySelector('#teslaVehicleTile .loading').classList.add('hidden');
    document.querySelector('#teslaVehicleTile .tesla-vehicle-info').classList.remove('hidden');

    document.getElementById('vehicleName').textContent  = d.vehicle_name || '--';
    document.getElementById('odometer').textContent     =
        d.odometer != null ? formatDistance(d.odometer * 1.60934) : '--';
    document.getElementById('lockStatus').textContent   = d.locked   ? 'Locked'  : 'Unlocked';
    document.getElementById('sentryStatus').textContent = d.sentry_mode ? 'Active' : 'Off';

    document.getElementById('lockStatus').style.color   = d.locked ? 'var(--c-text)' : '#f59e0b';
    document.getElementById('sentryStatus').style.color = d.sentry_mode ? 'var(--c-text)' : 'var(--c-text-muted)';

    // Firmware version
    const fwEl = document.getElementById('firmwareVersion');
    if (fwEl) fwEl.textContent = d.software_version || '--';

    // Tire pressures
    const tiresEl = document.getElementById('tiresSection');
    if (tiresEl) {
        const fl = d.tpms_pressure_fl, fr = d.tpms_pressure_fr;
        const rl = d.tpms_pressure_rl, rr = d.tpms_pressure_rr;

        function tireColor(bar) {
            if (bar == null) return 'var(--c-text-muted)';
            return bar < 2.5 || bar > 3.4 ? 'var(--c-red)' : 'var(--c-text)';
        }
        function tireText(bar) { return bar != null ? `${bar.toFixed(1)}` : '--'; }

        document.getElementById('tpmsFL').textContent = tireText(fl);
        document.getElementById('tpmsFR').textContent = tireText(fr);
        document.getElementById('tpmsRL').textContent = tireText(rl);
        document.getElementById('tpmsRR').textContent = tireText(rr);
        document.getElementById('tpmsFL').style.color = tireColor(fl);
        document.getElementById('tpmsFR').style.color = tireColor(fr);
        document.getElementById('tpmsRL').style.color = tireColor(rl);
        document.getElementById('tpmsRR').style.color = tireColor(rr);
    }
}

// ── Tesla: Drive state ────────────────────────────────────────

function loadDriveState() {
    const d   = getTeslaData();
    const el  = document.getElementById('driveStateSection');
    if (!el) return;

    const speed     = d.speed || 0;
    const gear      = d.shift_state || 'P';
    const power     = d.power || 0;   // kW, negative = regen
    const isDriving = gear !== 'P' && gear !== null;

    el.classList.toggle('hidden', !isDriving && !LIVE_DATA);

    document.getElementById('driveSpeed').textContent = isDriving
        ? formatDistance(speed * 1.60934).replace(' km', '').replace(' mi', '') + (USER_PREFERENCES.distanceUnit === 'miles' ? ' mph' : ' km/h')
        : '0';
    document.getElementById('driveGear').textContent  = gear || 'P';
    document.getElementById('drivePower').textContent = power !== 0
        ? `${power > 0 ? '+' : ''}${power} kW`
        : '--';

    // Update car location on nav map if available
    if (d.latitude && d.longitude && NAV.map) {
        updateCarLocationOnMap(d.latitude, d.longitude, d.heading);
    }
}

// Show car's real GPS position on the nav map
function updateCarLocationOnMap(lat, lon, heading) {
    if (!NAV.map) return;
    if (!NAV.carMarker) {
        NAV.carMarker = L.marker([lat, lon], { icon: carIcon(heading) }).addTo(NAV.map);
    } else {
        NAV.carMarker.setLatLng([lat, lon]);
        NAV.carMarker.setIcon(carIcon(heading));
    }
}

function carIcon(heading) {
    return L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:#e31937;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(227,25,55,0.8);transform:rotate(${heading}deg)"></div>`,
        iconAnchor: [6, 6]
    });
}

// ── Load all Tesla data ───────────────────────────────────────

async function loadAllTeslaData(forceDemo = false) {
    if (!forceDemo && AUTH.isLoggedIn()) {
        // Try to wake & fetch live data
        const vid = AUTH.getVehicleId();
        if (vid) {
            try {
                // Wake up if needed (fire-and-forget, then fetch)
                authedFetch(`${BACKEND_URL}/api/vehicles/${vid}/wake_up`, { method: 'POST' })
                    .catch(() => {});
            } catch { /* ignore */ }

            // Give it a second to wake, then fetch
            setTimeout(async () => {
                const raw = await fetchLiveData();
                if (raw) {
                    LIVE_DATA = flattenVehicleData(raw);
                    renderAllTiles();
                }
            }, 2500);
        }
    }

    // Render with whatever data is available (live or mock)
    renderAllTiles();
}

function renderAllTiles() {
    loadTeslaBattery();
    loadTeslaClimate();
    loadTeslaVehicleInfo();
    loadDriveState();
}

// ── Charging Stations ──────────────────────────────────────────

async function findChargers() {
    const btn  = document.getElementById('findChargersBtn');
    const info = document.getElementById('chargingInfo');
    btn.textContent = 'Finding...';
    btn.disabled    = true;

    try {
        const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej)
        );
        const { latitude: lat, longitude: lon } = pos.coords;

        const resp = await fetch(
            `https://api.openchargemap.io/v3/poi/?output=json&latitude=${lat}&longitude=${lon}` +
            `&distance=10&maxresults=5&compact=true&verbose=false`
        );
        const data = await resp.json();

        info.classList.remove('hidden');
        info.innerHTML = '';

        if (!data.length) {
            info.innerHTML = '<p style="text-align:center;padding:20px;color:var(--c-text-muted)">No chargers found nearby</p>';
        } else {
            data.forEach(s => {
                const el = document.createElement('div');
                el.className = 'charger-item';
                el.innerHTML = `
                    <div class="charger-name">${s.AddressInfo.Title}</div>
                    <div class="charger-distance">${s.AddressInfo.AddressLine1 || 'Address unavailable'}</div>
                `;
                info.appendChild(el);
            });
        }

        btn.textContent = 'Refresh';
        btn.disabled    = false;
    } catch {
        info.innerHTML  = '<p style="text-align:center;padding:20px;color:var(--c-text-muted)">Enable location services to find chargers</p>';
        info.classList.remove('hidden');
        btn.textContent = 'Find Chargers';
        btn.disabled    = false;
    }
}

document.getElementById('findChargersBtn').addEventListener('click', findChargers);

// ── Navigation ─────────────────────────────────────────────────

const NAV = {
    map:         null,
    userMarker:  null,
    carMarker:   null,
    destMarker:  null,
    routeLayer:  null,
    currentDest: null,
    userLocation: null
};

const userIcon = () => L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#3e6ae1;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(62,106,225,0.7)"></div>',
    iconAnchor: [7, 7]
});

const destIcon = () => L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#e31937;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(227,25,55,0.6)"></div>',
    iconAnchor: [7, 7]
});

function initNavMap() {
    if (NAV.map) return;

    NAV.map = L.map('navMap', {
        zoomControl:       false,
        attributionControl: false
    }).setView([52.3676, 4.9041], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, subdomains: 'abcd'
    }).addTo(NAV.map);

    L.control.zoom({ position: 'bottomright' }).addTo(NAV.map);

    L.control.attribution({ position: 'bottomleft', prefix: false })
        .addAttribution('<a href="https://www.openstreetmap.org/copyright" style="color:#555;font-size:9px">OSM</a>')
        .addTo(NAV.map);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            NAV.userLocation = { lat, lon: lng };
            NAV.map.setView([lat, lng], 13);
            if (NAV.userMarker) NAV.map.removeLayer(NAV.userMarker);
            NAV.userMarker = L.marker([lat, lng], { icon: userIcon() })
                .addTo(NAV.map)
                .bindTooltip('You are here', { direction: 'top', offset: [0, -8] });
        }, () => {});
    }

    setTimeout(() => NAV.map && NAV.map.invalidateSize(), 350);
}

async function searchDestination(query) {
    const q = (query || '').trim();
    if (!q) return;

    const resultsEl = document.getElementById('navResults');
    resultsEl.innerHTML = '<div class="nav-result-loading">Searching...</div>';

    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
            `&format=json&limit=5&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const data = await resp.json();
        resultsEl.innerHTML = '';

        if (!data.length) {
            resultsEl.innerHTML = '<p class="no-results">No results found</p>';
            return;
        }

        data.forEach(place => {
            const parts   = place.display_name.split(', ');
            const name    = parts[0];
            const subtext = parts.slice(1, 3).join(', ');

            const el = document.createElement('div');
            el.className = 'nav-result-item';
            el.innerHTML = `
                <div class="result-name">${name}</div>
                <div class="result-coords">${subtext}</div>
            `;
            el.addEventListener('click', () => selectDestination({
                lat: parseFloat(place.lat), lon: parseFloat(place.lon), name, address: place.display_name
            }));
            resultsEl.appendChild(el);
        });
    } catch {
        resultsEl.innerHTML = '<p class="error">Search unavailable</p>';
    }
}

async function selectDestination(dest) {
    NAV.currentDest = dest;
    document.getElementById('navResults').innerHTML = '';

    if (NAV.destMarker) NAV.map.removeLayer(NAV.destMarker);
    if (NAV.routeLayer) NAV.map.removeLayer(NAV.routeLayer);

    NAV.destMarker = L.marker([dest.lat, dest.lon], { icon: destIcon() })
        .addTo(NAV.map)
        .bindTooltip(dest.name, { direction: 'top', offset: [0, -8] });

    if (NAV.userLocation) {
        NAV.map.fitBounds(
            [[NAV.userLocation.lat, NAV.userLocation.lon], [dest.lat, dest.lon]],
            { padding: [40, 40], animate: true }
        );
        await fetchRoute(NAV.userLocation, dest);
    } else {
        NAV.map.setView([dest.lat, dest.lon], 13, { animate: true });
        document.getElementById('destDuration').textContent = '--';
        document.getElementById('destDistance').textContent = '--';
    }

    document.getElementById('destInfoName').textContent    = dest.name;
    document.getElementById('destInfoAddress').textContent =
        dest.address.split(', ').slice(1, 4).join(', ');
    document.getElementById('destInfo').classList.remove('hidden');

    addToRecent(dest);
}

async function fetchRoute(from, to) {
    try {
        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${from.lon},${from.lat};${to.lon},${to.lat}` +
            `?overview=full&geometries=geojson`;

        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code !== 'Ok' || !data.routes.length) return;

        const route  = data.routes[0];
        const distKm = route.distance / 1000;
        const hours  = Math.floor(route.duration / 3600);
        const mins   = Math.round((route.duration % 3600) / 60);

        document.getElementById('destDuration').textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
        document.getElementById('destDistance').textContent = formatDistance(distKm);

        if (NAV.routeLayer) NAV.map.removeLayer(NAV.routeLayer);
        NAV.routeLayer = L.geoJSON(route.geometry, {
            style: { color: '#3e6ae1', weight: 3.5, opacity: 0.85 }
        }).addTo(NAV.map);
    } catch { /* silent */ }
}

function openInApp(app) {
    const dest = NAV.currentDest;
    let url;

    if (dest) {
        const enc = encodeURIComponent(dest.name);
        url = {
            google: `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}`,
            waze  : `https://waze.com/ul?ll=${dest.lat},${dest.lon}&navigate=yes`,
            here  : `https://share.here.com/r/${dest.lat},${dest.lon},${enc}`,
            abrp  : `https://abetterrouteplanner.com/?destination=${enc}`
        }[app];
    } else {
        url = { google:'https://maps.google.com', waze:'https://waze.com',
                here:'https://wego.here.com', abrp:'https://abetterrouteplanner.com' }[app];
    }

    if (url) window.open(url, '_blank', 'noopener');
}

// ── Saved / Recent ────────────────────────────────────────────

function getSaved()  { return JSON.parse(localStorage.getItem('nav_saved')  || '[]'); }
function getRecent() { return JSON.parse(localStorage.getItem('nav_recent') || '[]'); }

function saveLocation(dest) {
    const saved = getSaved();
    if (saved.find(s => s.lat === dest.lat && s.lon === dest.lon)) {
        const btn = document.getElementById('saveToFavBtn');
        btn.textContent = 'Already saved';
        setTimeout(() => btn.textContent = 'Save to Favourites', 2000);
        return;
    }
    saved.unshift({ ...dest, id: Date.now() });
    localStorage.setItem('nav_saved', JSON.stringify(saved.slice(0, 30)));
    renderSaved();
    const btn = document.getElementById('saveToFavBtn');
    btn.textContent = 'Saved!';
    setTimeout(() => btn.textContent = 'Save to Favourites', 2000);
}

function deleteSaved(id) {
    localStorage.setItem('nav_saved', JSON.stringify(getSaved().filter(s => s.id !== id)));
    renderSaved();
}

function addToRecent(dest) {
    const recent = getRecent().filter(r => !(r.lat === dest.lat && r.lon === dest.lon));
    recent.unshift({ ...dest, ts: Date.now() });
    localStorage.setItem('nav_recent', JSON.stringify(recent.slice(0, 12)));
    renderRecent();
}

function clearRecent() {
    localStorage.removeItem('nav_recent');
    renderRecent();
}

window.navGoTo  = destJson => selectDestinationAndSwitch(JSON.parse(decodeURIComponent(destJson)));
window.navDelete = deleteSaved;
window.navSave  = destJson => saveLocation(JSON.parse(decodeURIComponent(destJson)));

function destAttr(dest) {
    return encodeURIComponent(JSON.stringify({ lat: dest.lat, lon: dest.lon, name: dest.name, address: dest.address }));
}

function renderSaved() {
    const items = getSaved();
    const list  = document.getElementById('savedList');
    const empty = document.getElementById('savedEmpty');
    if (!items.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    list.innerHTML = items.map(s => `
        <div class="nav-list-item">
            <div class="nav-list-body">
                <div class="nav-list-name">${s.name}</div>
                <div class="nav-list-sub">${s.address.split(', ').slice(1, 3).join(', ')}</div>
            </div>
            <div class="nav-list-actions">
                <button class="nav-list-btn go-btn"  onclick="navGoTo('${destAttr(s)}')">Go</button>
                <button class="nav-list-btn del-btn" onclick="navDelete(${s.id})">&#215;</button>
            </div>
        </div>`).join('');
}

function renderRecent() {
    const items = getRecent();
    const list  = document.getElementById('recentList');
    const empty = document.getElementById('recentEmpty');
    if (!items.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    list.innerHTML = items.map(r => `
        <div class="nav-list-item">
            <div class="nav-list-body">
                <div class="nav-list-name">${r.name}</div>
                <div class="nav-list-sub">${r.address.split(', ').slice(1, 3).join(', ')}</div>
            </div>
            <div class="nav-list-actions">
                <button class="nav-list-btn go-btn"   onclick="navGoTo('${destAttr(r)}')">Go</button>
                <button class="nav-list-btn save-btn" onclick="navSave('${destAttr(r)}')">Save</button>
            </div>
        </div>`).join('');
}

function selectDestinationAndSwitch(dest) {
    switchNavTab('search');
    selectDestination(dest);
}

// ── Navigation setup ───────────────────────────────────────────

function setupNavigation() {
    const searchInput = document.getElementById('navSearch');
    let searchTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = searchInput.value.trim();
        if (q.length < 3) { document.getElementById('navResults').innerHTML = ''; return; }
        searchTimer = setTimeout(() => searchDestination(q), 420);
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(searchTimer); searchDestination(searchInput.value); }
        if (e.key === 'Escape') { searchInput.value = ''; document.getElementById('navResults').innerHTML = ''; }
    });

    document.querySelectorAll('.nav-tab').forEach(t =>
        t.addEventListener('click', () => switchNavTab(t.dataset.tab)));

    document.querySelectorAll('.nav-app-pill').forEach(btn =>
        btn.addEventListener('click', () => openInApp(btn.dataset.app)));

    document.getElementById('saveToFavBtn').addEventListener('click', () => {
        if (NAV.currentDest) saveLocation(NAV.currentDest);
    });

    document.getElementById('clearRecentBtn').addEventListener('click', clearRecent);

    document.getElementById('mapLocateBtn').addEventListener('click', () => {
        if (NAV.userLocation && NAV.map)
            NAV.map.setView([NAV.userLocation.lat, NAV.userLocation.lon], 14, { animate: true });
    });

    document.querySelectorAll('.dest-btn').forEach(btn =>
        btn.addEventListener('click', () => handleQuickDestination(btn.dataset.dest)));

    renderSaved();
    renderRecent();
    setTimeout(initNavMap, 150);
}

function switchNavTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.nav-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('navPane' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
    if (tab === 'search' && NAV.map) setTimeout(() => NAV.map.invalidateSize(), 60);
}

function handleQuickDestination(dest) {
    const urls = {
        supercharger: 'https://www.tesla.com/findus?v=2&bounds=90,-180,-90,180&zoom=4&filters=supercharger',
        service:      'https://www.tesla.com/findus?v=2&bounds=90,-180,-90,180&zoom=4&filters=service'
    };
    if (urls[dest]) window.open(urls[dest], '_blank', 'noopener');
}

// ── Settings ───────────────────────────────────────────────────

function setupSettings() {
    const tempSel    = document.getElementById('tempUnit');
    const distSel    = document.getElementById('distanceUnit');
    const refreshBtn = document.getElementById('refreshAllBtn');

    tempSel.value = USER_PREFERENCES.temperatureUnit;
    distSel.value = USER_PREFERENCES.distanceUnit;

    tempSel.addEventListener('change', e => {
        USER_PREFERENCES.temperatureUnit = e.target.value;
        localStorage.setItem('temp_unit', e.target.value);
        loadWeather();
        loadTeslaClimate();
    });

    distSel.addEventListener('change', e => {
        USER_PREFERENCES.distanceUnit = e.target.value;
        localStorage.setItem('dist_unit', e.target.value);
        loadTeslaBattery();
        loadDriveState();
    });

    refreshBtn.addEventListener('click', async () => {
        refreshBtn.textContent = 'Refreshing…';
        refreshBtn.disabled    = true;
        if (AUTH.isLoggedIn()) {
            const raw = await fetchLiveData();
            if (raw) LIVE_DATA = flattenVehicleData(raw);
        }
        loadWeather();
        renderAllTiles();
        setTimeout(() => { refreshBtn.textContent = 'Refresh All Data'; refreshBtn.disabled = false; }, 1500);
    });
}

// ── Init ───────────────────────────────────────────────────────

async function init() {
    // Restore auth state
    if (AUTH.isLoggedIn()) {
        if (AUTH.isExpired()) await AUTH.refresh();
        if (AUTH.isLoggedIn()) {
            updateConnectUI('connecting');
            // Make sure we have a vehicle ID
            if (!AUTH.getVehicleId()) await loadVehicles();
            updateConnectUI('connected');
        }
    } else {
        updateConnectUI('idle');
    }

    loadWeather();
    loadAllTeslaData();
    setupNavigation();
    setupSettings();

    // Auto-refresh live data every 5 minutes when connected
    setInterval(async () => {
        if (!AUTH.isLoggedIn()) return;
        if (AUTH.isExpired()) await AUTH.refresh();
        const raw = await fetchLiveData();
        if (raw) { LIVE_DATA = flattenVehicleData(raw); renderAllTiles(); }
    }, 5 * 60 * 1000);
}

init();

