// ============================================================
//  Tesla Dashboard – app.js
// ============================================================
'use strict';

// ── Scroll guard ──────────────────────────────────────────────
// Suppress clicks/taps that occur during or right after a scroll gesture.
// Prevents accidental button activations when the user is just scrolling
// through the dashboard on touch devices.
let _isScrolling = false;
let _scrollTimer = null;
window.addEventListener('scroll', () => {
    _isScrolling = true;
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => { _isScrolling = false; }, 300);
}, { passive: true });

// Returns true if a touch event looks like it was part of a scroll gesture
function isScrollTap() { return _isScrolling; }

// ── Confirm-tap pattern ───────────────────────────────────────
// Critical buttons require a second tap within 3 s to actually fire.
// First tap changes the label to "Tap to confirm" / the i18n equivalent.
const _confirmTimers = new WeakMap();
function requireConfirmTap(btn, callback) {
    btn.addEventListener('click', e => {
        if (isScrollTap()) return;           // swipe, not a tap
        if (btn.disabled) return;

        // Already in confirmation state → execute
        if (btn.dataset.confirming === '1') {
            btn.dataset.confirming = '';
            btn.classList.remove('ctrl-confirm');
            clearTimeout(_confirmTimers.get(btn));
            // Restore original label (stored on first tap)
            btn.textContent = btn.dataset.origLabel || btn.textContent;
            callback();
            return;
        }

        // First tap → enter confirmation state
        btn.dataset.origLabel = btn.textContent;
        btn.dataset.confirming = '1';
        btn.textContent = t('tap_confirm');
        btn.classList.add('ctrl-confirm');

        // Auto-cancel after 3 s
        const timer = setTimeout(() => {
            btn.dataset.confirming = '';
            btn.classList.remove('ctrl-confirm');
            btn.textContent = btn.dataset.origLabel || btn.textContent;
        }, 3000);
        _confirmTimers.set(btn, timer);
    });
}

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
    temperatureUnit: localStorage.getItem('temp_unit')    || 'celsius',
    distanceUnit   : localStorage.getItem('dist_unit')    || 'km',
    timeFormat     : localStorage.getItem('time_format')  || '24h',
    uiLanguage     : localStorage.getItem('ui_lang')      || 'en',
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
let _lastFetchTime = 0;   // timestamp of last successful vehicle_data fetch
const DATA_TTL = 60_000;  // consider data fresh for 60 seconds

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
        showModal(t('connect_tesla'), t('backend_unavail'), [{ label: t('ok_btn') }]);
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
        audience              : TESLA_OAUTH.audience,
        prompt                : 'consent'   // force consent screen even if previously authorized
    });

    window.open(`${TESLA_OAUTH.authUrl}?${params}`, 'tesla_auth',
        'width=560,height=720,left=400,top=100');
}

// Receive code back from callback popup
const CALLBACK_ORIGINS = new Set([
    'https://my-pwa-apps.github.io',
    'https://bart-gilt-delta.vercel.app',
    'http://localhost:5500',
    'http://localhost:3000'
]);
window.addEventListener('message', async e => {
    if (e.data?.type !== 'tesla_oauth_callback') return;
    if (!CALLBACK_ORIGINS.has(e.origin)) return;
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
        if (!r.ok) {
            const errBody = await r.json().catch(() => ({}));
            console.error('loadVehicles error', r.status, JSON.stringify(errBody));
            // 412 = token missing Fleet API audience — must re-authenticate
            if (r.status === 412) {
                console.warn('Token lacks Fleet API audience — clearing auth, please reconnect.');
                AUTH.clear();
                updateConnectUI('idle');
                showModal(t('connect_tesla'), t('session_expired'), [{ label: t('ok_btn') }]);
            }
            return;
        }
        const data = await r.json();
        const list = data.response || data;
        if (!Array.isArray(list) || !list.length) return;

        // If multiple vehicles, let user pick
        if (list.length > 1) {
            await showVehiclePicker(list);
        } else {
            const v = list[0];
            const id = v.id_s || String(v.id);
            localStorage.setItem('tesla_vehicle_id',   id);
            localStorage.setItem('tesla_vehicle_name', v.display_name || 'Tesla');
        }
    } catch { /* ignore */ }
}

// ── Authenticated fetch ───────────────────────────────────────

async function authedFetch(url, opts = {}) {
    if (AUTH.isExpired()) await AUTH.refresh();
    const token = AUTH.getAccessToken();
    if (!token) throw new Error('No access token');
    return fetch(url, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });
}

// ── Vehicle data fetch ────────────────────────────────────────

/**
 * Fetch vehicle data from Tesla API.
 * @param {boolean} force - bypass freshness check
 * Returns raw API response or null on failure.
 */
async function fetchLiveData(force = false) {
    const vid = AUTH.getVehicleId();
    if (!vid) return null;
    // Skip if data is still fresh (saves API calls = money)
    if (!force && LIVE_DATA && (Date.now() - _lastFetchTime) < DATA_TTL) {
        return null; // null signals "no new data" — caller keeps existing LIVE_DATA
    }
    try {
        const r = await authedFetch(`${BACKEND_URL}/api/vehicles/${vid}/vehicle_data`);
        if (!r.ok) return null;
        const json = await r.json();
        _lastFetchTime = Date.now();
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
        inside_temp              : cl.inside_temp,
        outside_temp             : cl.outside_temp,
        is_climate_on            : cl.is_climate_on,
        is_auto_conditioning_on  : cl.is_auto_conditioning_on,
        is_preconditioning       : cl.is_preconditioning,
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
        software_update     : vs.software_update       || null,
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
            ${escapeHtml(AUTH.getVehicleName())}`;
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
            ${t('connect_tesla')}`;
        btn.classList.remove('is-connected');
        btn.onclick = connectTesla;
    }
}

function disconnectTesla() {
    showModal(t('disconnect_title'), t('disconnect_msg'), [
        { label: t('cancel_btn') },
        { label: t('disconnect_btn'), cls: 'modal-btn-danger', action: () => {
            AUTH.clear();
            updateConnectUI('idle');
            LIVE_DATA = null;
            loadAllTeslaData(true);
        }}
    ]);
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

function escapeHtml(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
}

// ── Clock ──────────────────────────────────────────────────────

const LANG_LOCALE_MAP = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };

function updateTime() {
    const use12h = USER_PREFERENCES.timeFormat === '12h';
    const locale = LANG_LOCALE_MAP[USER_PREFERENCES.uiLanguage] || 'en-GB';
    document.getElementById('currentTime').textContent = new Date().toLocaleString(locale, {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit',
        hour12: use12h
    });
}
let _clockInterval = null;
function startClock() {
    if (_clockInterval) return;
    updateTime();
    _clockInterval = setInterval(updateTime, 1000);
}
function stopClock() {
    if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
}
document.addEventListener('visibilitychange', () => {
    document.hidden ? stopClock() : startClock();
});
startClock();

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
        0:'w_clear',1:'w_mainly_clear',2:'w_partly_cloudy',3:'w_overcast',
        45:'w_fog',48:'w_fog',51:'w_drizzle_light',53:'w_drizzle',55:'w_drizzle_heavy',
        61:'w_rain_light',63:'w_rain',65:'w_rain_heavy',
        71:'w_snow_light',73:'w_snow',75:'w_snow_heavy',77:'w_snow_grains',
        80:'w_showers_light',81:'w_showers',82:'w_showers_heavy',
        85:'w_snow_showers',86:'w_snow_showers_h',
        95:'w_thunderstorm',96:'w_thunder_hail',99:'w_thunder_hail_h'
    };
    return t(map[code] || 'w_unknown');
}

// ── Tesla: Battery & Charging ─────────────────────────────────

function loadTeslaBattery() {
    const d = getTeslaData();
    document.querySelector('#teslaBatteryTile .loading').classList.add('hidden');
    document.querySelector('#teslaBatteryTile .tesla-battery-info').classList.remove('hidden');

    const lvl = d.battery_level ?? 0;
    document.getElementById('batteryLevel').textContent  = `${lvl}%`;
    // battery_range from API is always in miles; convert to km for formatDistance
    document.getElementById('batteryRange').textContent = formatDistance((d.battery_range || 0) * 1.60934);
    document.getElementById('chargingStatus').textContent = d.charging_state || '--';

    const fill = document.querySelector('.battery-bar-fill');
    fill.style.width      = `${lvl}%`;
    fill.style.background = lvl > 50 ? 'var(--c-white)' : lvl > 20 ? '#f59e0b' : 'var(--c-red)';

    // Extra charge details — show when connected or actively charging
    const chargeEl = document.getElementById('chargeDetails');
    if (chargeEl) {
        // Show charge details only when a charger is actually connected
        const showDetails = d.charging_state && d.charging_state !== 'Disconnected';
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
    const label  = d.is_preconditioning ? t('pre_conditioning')
                 : d.is_climate_on      ? t('climate_on_label')
                 : t('climate_off_label');
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
    document.getElementById('lockStatus').textContent   = d.locked ? t('status_locked') : t('status_unlocked');
    document.getElementById('sentryStatus').textContent = d.sentry_mode ? t('status_active') : t('status_off');

    document.getElementById('lockStatus').style.color   = d.locked ? 'var(--c-text)' : '#f59e0b';
    document.getElementById('sentryStatus').style.color = d.sentry_mode ? 'var(--c-text)' : 'var(--c-text-muted)';

    // Door open warnings
    const doorWarningEl = document.getElementById('doorWarnings');
    if (doorWarningEl) {
        const openDoors = [];
        if (d.df) openDoors.push(t('door_fl'));
        if (d.pf) openDoors.push(t('door_fr'));
        if (d.dr) openDoors.push(t('door_rl'));
        if (d.pr) openDoors.push(t('door_rr'));
        if (openDoors.length) {
            doorWarningEl.textContent = `⚠ ${openDoors.join(', ')} ${t('door_open_warning').toLowerCase()}`;
            doorWarningEl.classList.remove('hidden');
        } else {
            doorWarningEl.classList.add('hidden');
        }
    }

    // Firmware version
    const fwEl = document.getElementById('firmwareVersion');
    if (fwEl) fwEl.textContent = d.software_version || '--';

    // Firmware update status
    const su = d.software_update;
    const fwBar = document.getElementById('fwUpdateBar');
    if (fwBar && su && su.status && su.status !== '') {
        const fwInfo = document.getElementById('fwUpdateInfo');
        const labels = { available: '⬆ Update available', scheduled: '⏱ Update scheduled',
                         downloading: '⬇ Downloading…', installing: '⚙ Installing…' };
        fwInfo.textContent = (labels[su.status] || su.status) + (su.version ? ` — v${su.version}` : '') +
            (su.download_perc > 0 && su.download_perc < 100 ? ` (${su.download_perc}%)` : '') +
            (su.install_perc  > 0 && su.install_perc  < 100 ? ` (${su.install_perc}%)`  : '');
        document.getElementById('fwInstallBtn').classList.toggle('hidden', su.status !== 'available');
        fwBar.classList.remove('hidden');
    } else if (fwBar) {
        fwBar.classList.add('hidden');
    }

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

    // speed from API is mph; convert to display unit
    const displaySpeed = USER_PREFERENCES.distanceUnit === 'miles'
        ? Math.round(speed)
        : Math.round(speed * 1.60934);
    const speedSuffix = USER_PREFERENCES.distanceUnit === 'miles' ? ' mph' : ' km/h';
    document.getElementById('driveSpeed').textContent = isDriving ? `${displaySpeed}${speedSuffix}` : '0';
    document.getElementById('driveGear').textContent  = gear || 'P';
    document.getElementById('drivePower').textContent = power !== 0
        ? `${power > 0 ? '+' : ''}${power} kW`
        : '--';

    // Update car location on nav map if available
    if (d.latitude && d.longitude && NAV.map) {
        updateCarLocationOnMap(d.latitude, d.longitude, d.heading);
    }
}

// ── Performance tile ────────────────────────────────────────

function loadPerformance() {
    const d       = getTeslaData();
    const isMiles = USER_PREFERENCES.distanceUnit === 'miles';

    // Speed
    const rawSpeed = d.speed || 0;  // API value is mph
    const speed    = isMiles ? rawSpeed : rawSpeed * 1.60934;
    const speedEl  = document.getElementById('speedDisplay');
    const unitEl   = document.getElementById('speedUnit');
    if (speedEl) speedEl.textContent = Math.round(speed);
    if (unitEl)  unitEl.textContent  = isMiles ? 'mph' : 'km/h';

    // Estimated range from battery tile data
    const rangeEl  = document.getElementById('rangeEstimate');
    if (rangeEl) {
        const rangeKm = (d.battery_range || 0) * 1.60934;
        rangeEl.textContent = formatDistance(rangeKm);
    }

    // Power (kW from API, negative = regen)
    const power    = d.power || 0;
    const powerEl  = document.getElementById('powerValue');
    if (powerEl) powerEl.textContent = power !== 0 ? `${power > 0 ? '+' : ''}${power} kW` : '0 kW';

    const barEl = document.getElementById('powerBarFill');
    if (barEl) {
        const pct = Math.min(Math.abs(power) / 200 * 100, 100);
        barEl.style.width      = `${pct}%`;
        barEl.style.background = power < 0 ? '#22c55e' : 'var(--c-red)';
    }

    // Trip Computer — update with real data
    const effEl = document.getElementById('avgEfficiency');
    if (effEl) {
        const wh = parseFloat(effEl.dataset.whkm) || 245;
        effEl.textContent = isMiles ? `${Math.round(wh * 1.60934)} Wh/mi` : `${Math.round(wh)} Wh/km`;
    }

    const distEl = document.getElementById('distanceToday');
    if (distEl) {
        if (!distEl.dataset.km) distEl.dataset.km = '0';
        distEl.textContent = formatDistance(parseFloat(distEl.dataset.km));
    }

    // Update trip data from live odometer (skip for mock data)
    if (LIVE_DATA) updateTripComputer(d);
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
        const vid = AUTH.getVehicleId();
        if (vid) {
            // Render immediately with demo/cached data while we wake the car
            renderAllTiles();

            try {
                showToast(t('waking_vehicle'), 35000);
                const wr = await authedFetch(
                    `${BACKEND_URL}/api/vehicles/${vid}/wake_up`, { method: 'POST' }
                );
                const wj = await wr.json().catch(() => ({}));
                // wj.online === true  → backend confirmed online
                // wj.online === false → timed out; still try vehicle_data
                if (!wr.ok && wj.online == null) {
                    dismissToast();
                    showToast('Could not reach vehicle');
                    return;
                }
            } catch { /* network error: still try vehicle_data */ }

            dismissToast();
            const raw = await fetchLiveData(true); // force — first fetch after wake
            if (raw) {
                LIVE_DATA = flattenVehicleData(raw);
                renderAllTiles();
            } else {
                showToast(t('vehicle_unreachable'), 5000);
            }
            return;
        }
    }

    // Not logged in or no vehicle ID — render with demo data
    renderAllTiles();
}

function renderAllTiles() {
    loadTeslaBattery();
    loadTeslaClimate();
    loadTeslaVehicleInfo();
    loadDriveState();
    updateControlsUI();
    loadPerformance();
    updateLastUpdated();
    updateRangeRing();
}

// ── Charging Stations ──────────────────────────────────────────

// ── Charger helpers ─────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNearbyChargers(lat, lon, radiusKm = 25) {
    const r = radiusKm * 1000;
    const query = `[out:json][timeout:15];
(
  node["amenity"="charging_station"](around:${r},${lat},${lon});
  way["amenity"="charging_station"](around:${r},${lat},${lon});
);
out center tags;`;

    // Try multiple Overpass mirrors — the primary often times out
    const mirrors = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.openstreetmap.fr/api/interpreter'
    ];

    for (const mirror of mirrors) {
        try {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), 12000);
            const resp = await fetch(mirror, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                signal: ac.signal
            });
            clearTimeout(timer);
            if (!resp.ok) continue;
            const d = await resp.json();
            return d.elements.map(el => {
                const t = el.tags || {};
                const network  = t.network  || t.operator || t.brand || '';
                const name     = t.name     || t.operator || t.brand || t.network || 'Charging Station';
                return {
                    lat    : el.lat ?? el.center?.lat,
                    lon    : el.lon ?? el.center?.lon,
                    name,
                    network,
                    sockets: t.capacity || t['charging:count'] || null
                };
            }).filter(s => s.lat && s.lon);
        } catch {
            // Try next mirror
            continue;
        }
    }
    // All mirrors failed
    throw new Error('All Overpass mirrors timed out');
}

// Commands that change vehicle state and warrant a data re-fetch
const STATE_CHANGING_CMDS = new Set([
    'auto_conditioning_start', 'auto_conditioning_stop',
    'set_temps', 'set_charge_limit',
    'charge_start', 'charge_stop',
    'door_lock', 'door_unlock',
    'set_sentry_mode', 'schedule_software_update',
    'actuate_trunk'
]);

async function sendCarCommand(command, params = {}) {
    const id = localStorage.getItem('tesla_vehicle_id');
    if (!id || !AUTH.isLoggedIn()) { showToast(t('connect_first')); return { ok: false }; }
    try {
        const r = await authedFetch(`${BACKEND_URL}/api/vehicles/${id}/command`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ command, ...params })
        });
        const data = await r.json().catch(() => ({}));
        const ok = data.response?.result === true || r.ok;
        return { ok, error: data.response?.reason };
    } catch (e) { return { ok: false, error: e.message }; }
}

function getChargerPrefs() {
    return JSON.parse(localStorage.getItem('charger_prefs') || '["supercharger","fastned","other"]');
}
function saveChargerPrefs(prefs) { localStorage.setItem('charger_prefs', JSON.stringify(prefs)); }
function matchesPref(network) {
    const prefs = getChargerPrefs();
    if (/tesla|supercharger/i.test(network)) return prefs.includes('supercharger');
    if (/fastned/i.test(network))            return prefs.includes('fastned');
    return prefs.includes('other');
}

// Returns { cls, label } badge info for a charger network string
function chargerBadge(network) {
    if (/tesla|supercharger/i.test(network)) return { cls: 'badge-tesla',   label: 'Supercharger' };
    if (/fastned/i.test(network))            return { cls: 'badge-fastned', label: 'Fastned' };
    return { cls: 'badge-other', label: network || 'Charger' };
}

async function preconditionBattery() {
    const res = await sendCarCommand('auto_conditioning_start');
    return res.ok;
}

function showToast(msg, duration = 3500) {
    let toast = document.getElementById('appToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('toast-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('toast-visible'), duration);
}

function dismissToast() {
    const toast = document.getElementById('appToast');
    if (toast) {
        clearTimeout(toast._timer);
        toast.classList.remove('toast-visible');
    }
}

async function navigateToCharger(lat, lon, name) {
    // Switch to nav tile search tab and route on the map
    switchNavTab('search');
    document.getElementById('navPaneSearch').classList.remove('hidden');
    await selectDestination({ lat, lon, name, address: name });

    // Just show the route — do NOT auto-precondition.
    // Preconditioning heats the battery/cabin and should only happen
    // when the user explicitly taps "Precondition" in Car Controls.
    showToast(name);
}

async function findChargers() {
    const btn  = document.getElementById('findChargersBtn');
    const info = document.getElementById('chargingInfo');
    btn.textContent = t('finding');
    btn.disabled    = true;

    try {
        const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
        );
        const { latitude: lat, longitude: lon } = pos.coords;

        let stations = await fetchNearbyChargers(lat, lon, 30);
        stations = stations.filter(s => matchesPref(s.network));
        stations.forEach(s => { s.dist = haversineKm(lat, lon, s.lat, s.lon); });
        stations.sort((a, b) => a.dist - b.dist);

        info.classList.remove('hidden');
        info.innerHTML = '';

        if (!stations.length) {
            info.innerHTML = `<p class="charger-empty">${t('no_chargers')}</p>`;
        } else {
            stations.slice(0, 12).forEach(s => {
                const { cls: badgeClass, label: badgeLabel } = chargerBadge(s.network);

                const el = document.createElement('div');
                el.className = 'charger-item';
                el.innerHTML = `
                    <div class="charger-item-header">
                        <span class="charger-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
                        <span class="charger-dist">${formatDistance(s.dist)}</span>
                    </div>
                    <div class="charger-name">${escapeHtml(s.name)}</div>
                    ${s.sockets ? `<div class="charger-distance">${escapeHtml(String(s.sockets))} sockets</div>` : ''}
                `;
                const navBtn = document.createElement('button');
                navBtn.className = 'charger-nav-btn';
                navBtn.textContent = t('nav_precondition');
                navBtn.addEventListener('click', () => navigateToCharger(s.lat, s.lon, s.name));
                el.appendChild(navBtn);
                info.appendChild(el);
            });
        }

        btn.textContent = t('refresh');
        btn.disabled    = false;
    } catch (e) {
        info.innerHTML = `<p class="charger-empty">${e.code === 1 ? t('chargers_no_loc') : t('chargers_error')}</p>`;
        info.classList.remove('hidden');
        btn.textContent = t('find_chargers');
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
                .bindTooltip(t('you_are_here'), { direction: 'top', offset: [0, -8] });
            // Show range ring once we have location
            updateRangeRing();
        }, () => {});
    }

    setTimeout(() => NAV.map && NAV.map.invalidateSize(), 350);
}

async function searchDestination(query) {
    const q = (query || '').trim();
    if (!q) return;

    const resultsEl = document.getElementById('navResults');
    resultsEl.innerHTML = `<div class="nav-result-loading">${t('searching')}</div>`;

    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
            `&format=json&limit=5&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const data = await resp.json();
        resultsEl.innerHTML = '';

        if (!data.length) {
            resultsEl.innerHTML = `<p class="no-results">${t('no_results')}</p>`;
            return;
        }

        data.forEach(place => {
            const parts   = place.display_name.split(', ');
            const name    = parts[0];
            const subtext = parts.slice(1, 3).join(', ');

            const el = document.createElement('div');
            el.className = 'nav-result-item';
            el.innerHTML = `
                <div class="result-name">${escapeHtml(name)}</div>
                <div class="result-coords">${escapeHtml(subtext)}</div>
            `;
            el.addEventListener('click', () => selectDestination({
                lat: parseFloat(place.lat), lon: parseFloat(place.lon), name, address: place.display_name
            }));
            resultsEl.appendChild(el);
        });
    } catch {
        resultsEl.innerHTML = `<p class="error">${t('search_unavailable')}</p>`;
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

        // Arrival SoC estimation
        updateArrivalSoC(distKm);

        recommendChargerForRoute(to, distKm);

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
        // ABRP deep link with real vehicle data when available
        const abrpParams = new URLSearchParams({ destination: enc });
        if (LIVE_DATA) {
            abrpParams.set('soc_perc', LIVE_DATA.battery_level || '');
            abrpParams.set('car_model', LIVE_DATA.car_type || 'tesla:m3:20:60:other');
            if (NAV.userLocation) {
                abrpParams.set('origin_lat', NAV.userLocation.lat);
                abrpParams.set('origin_lon', NAV.userLocation.lon);
            }
        }
        url = {
            google: `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}`,
            waze  : `https://waze.com/ul?ll=${dest.lat},${dest.lon}&navigate=yes`,
            here  : `https://share.here.com/r/${dest.lat},${dest.lon},${enc}`,
            abrp  : `https://abetterrouteplanner.com/?${abrpParams.toString()}`
        }[app];
    } else {
        url = { google:'https://maps.google.com', waze:'https://waze.com',
                here:'https://wego.here.com', abrp:'https://abetterrouteplanner.com' }[app];
    }

    if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        // Start preconditioning when user actually launches navigation with a destination
        if (dest && AUTH.isLoggedIn()) {
            preconditionBattery().then(ok => {
                if (ok) showToast(t('precond_started'));
            });
        }
    }
}

// ── Send destination to Tesla in-car nav ─────────────────────

async function sendToTesla() {
    const dest = NAV.currentDest;
    if (!dest) return;
    if (!AUTH.isLoggedIn()) { showToast(t('connect_first')); return; }
    const res = await sendCarCommand('navigation_request', {
        type: 'share_ext_content_raw',
        value: { 'android.intent.extra.TEXT': `${dest.name} ${dest.lat},${dest.lon}` },
        locale: 'en-US',
        timestamp_ms: Date.now().toString()
    });
    showToast(res.ok ? t('sent_to_tesla') : (res.error || t('cmd_failed')));
}

// ── Arrival SoC estimation ─────────────────────────────────

function updateArrivalSoC(routeDistKm) {
    const el = document.getElementById('arrivalSoC');
    if (!el) return;

    if (!LIVE_DATA || !LIVE_DATA.battery_range) {
        el.classList.add('hidden');
        return;
    }

    const rangeKm = LIVE_DATA.battery_range * 1.60934;
    const currentSoC = LIVE_DATA.battery_level || 0;
    // Proportional: if range covers X km at current SoC, how much SoC for this trip?
    const socPerKm = currentSoC / rangeKm;
    const tripSoC = Math.round(routeDistKm * socPerKm);
    const arrivalPct = Math.max(0, currentSoC - tripSoC);

    el.classList.remove('hidden');
    const arrivalEl = document.getElementById('arrivalPct');
    if (arrivalEl) {
        arrivalEl.textContent = `${arrivalPct}%`;
        arrivalEl.style.color = arrivalPct > 20 ? '#4ade80' : arrivalPct > 10 ? '#f59e0b' : 'var(--c-red)';
    }
}

// ── Range ring on map ─────────────────────────────────────

function updateRangeRing() {
    if (!NAV.map) return;
    // Remove old ring
    if (NAV.rangeRing) { NAV.map.removeLayer(NAV.rangeRing); NAV.rangeRing = null; }

    const loc = NAV.userLocation;
    if (!loc || !LIVE_DATA || !LIVE_DATA.battery_range) return;

    const rangeKm = LIVE_DATA.battery_range * 1.60934;
    // Apply 85% efficiency factor for real-world range
    const realRangeM = rangeKm * 0.85 * 1000;

    NAV.rangeRing = L.circle([loc.lat, loc.lon], {
        radius: realRangeM,
        color: 'rgba(74, 222, 128, 0.3)',
        fillColor: 'rgba(74, 222, 128, 0.05)',
        fillOpacity: 1,
        weight: 1.5,
        dashArray: '6 4',
        interactive: false
    }).addTo(NAV.map);
}

// ── Home / Work shortcuts ─────────────────────────────────

function getHomeLocation() { return JSON.parse(localStorage.getItem('nav_home') || 'null'); }
function getWorkLocation() { return JSON.parse(localStorage.getItem('nav_work') || 'null'); }

function setHomeLocation() {
    const dest = NAV.currentDest;
    if (!dest) { showToast(t('no_results')); return; }
    localStorage.setItem('nav_home', JSON.stringify(dest));
    showToast(`🏠 ${t('saved')}`);
    updateHomeWorkButtons();
}

function setWorkLocation() {
    const dest = NAV.currentDest;
    if (!dest) { showToast(t('no_results')); return; }
    localStorage.setItem('nav_work', JSON.stringify(dest));
    showToast(`🏢 ${t('saved')}`);
    updateHomeWorkButtons();
}

function updateHomeWorkButtons() {
    const homeBtn = document.getElementById('navHomeBtn');
    const workBtn = document.getElementById('navWorkBtn');
    const home = getHomeLocation();
    const work = getWorkLocation();
    if (homeBtn) {
        homeBtn.textContent = home ? `🏠 ${home.name}` : `🏠 ${t('nav_set_home')}`;
        homeBtn.dataset.hasLocation = home ? '1' : '0';
    }
    if (workBtn) {
        workBtn.textContent = work ? `🏢 ${work.name}` : `🏢 ${t('nav_set_work')}`;
        workBtn.dataset.hasLocation = work ? '1' : '0';
    }
}

// ── Saved / Recent ────────────────────────────────────────────

function getSaved()  { return JSON.parse(localStorage.getItem('nav_saved')  || '[]'); }
function getRecent() { return JSON.parse(localStorage.getItem('nav_recent') || '[]'); }

function saveLocation(dest) {
    const saved = getSaved();
    if (saved.find(s => s.lat === dest.lat && s.lon === dest.lon)) {
        const btn = document.getElementById('saveToFavBtn');
        btn.textContent = t('already_saved');
        setTimeout(() => btn.textContent = t('nav_save_fav'), 2000);
        return;
    }
    saved.unshift({ ...dest, id: Date.now() });
    localStorage.setItem('nav_saved', JSON.stringify(saved.slice(0, 30)));
    renderSaved();
    const btn = document.getElementById('saveToFavBtn');
    btn.textContent = t('saved');
    setTimeout(() => btn.textContent = t('nav_save_fav'), 2000);
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

// navGoTo / navDelete / navSave removed — inline onclick handlers replaced with addEventListener

function renderSaved() {
    const items = getSaved();
    const list  = document.getElementById('savedList');
    const empty = document.getElementById('savedEmpty');
    if (!items.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    list.innerHTML = items.map((s, i) => `
        <div class="nav-list-item">
            <div class="nav-list-body">
                <div class="nav-list-name">${escapeHtml(s.name)}</div>
                <div class="nav-list-sub">${escapeHtml(s.address.split(', ').slice(1, 3).join(', '))}</div>
            </div>
            <div class="nav-list-actions">
                <button class="nav-list-btn go-btn" data-idx="${i}">${t('go')}</button>
                <button class="nav-list-btn del-btn" data-id="${s.id}">&#215;</button>
            </div>
        </div>`).join('');
    list.querySelectorAll('.go-btn').forEach(btn => {
        btn.addEventListener('click', () => selectDestinationAndSwitch(items[parseInt(btn.dataset.idx)]));
    });
    list.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteSaved(parseInt(btn.dataset.id)));
    });
}

function renderRecent() {
    const items = getRecent();
    const list  = document.getElementById('recentList');
    const empty = document.getElementById('recentEmpty');
    if (!items.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    list.innerHTML = items.map((r, i) => `
        <div class="nav-list-item">
            <div class="nav-list-body">
                <div class="nav-list-name">${escapeHtml(r.name)}</div>
                <div class="nav-list-sub">${escapeHtml(r.address.split(', ').slice(1, 3).join(', '))}</div>
            </div>
            <div class="nav-list-actions">
                <button class="nav-list-btn go-btn" data-idx="${i}">${t('go')}</button>
                <button class="nav-list-btn save-btn" data-idx="${i}">${t('save_btn')}</button>
            </div>
        </div>`).join('');
    list.querySelectorAll('.go-btn').forEach(btn => {
        btn.addEventListener('click', () => selectDestinationAndSwitch(items[parseInt(btn.dataset.idx)]));
    });
    list.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveLocation(items[parseInt(btn.dataset.idx)]));
    });
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

    // Send to Tesla button
    const sendToTeslaBtn = document.getElementById('sendToTeslaBtn');
    if (sendToTeslaBtn) sendToTeslaBtn.addEventListener('click', sendToTesla);

    // Set Home / Set Work buttons
    const setHomeBtn = document.getElementById('setHomeBtn');
    const setWorkBtn = document.getElementById('setWorkBtn');
    if (setHomeBtn) setHomeBtn.addEventListener('click', setHomeLocation);
    if (setWorkBtn) setWorkBtn.addEventListener('click', setWorkLocation);

    // Home / Work quick-nav
    const homeBtn = document.getElementById('navHomeBtn');
    const workBtn = document.getElementById('navWorkBtn');
    if (homeBtn) homeBtn.addEventListener('click', () => {
        const home = getHomeLocation();
        if (home) selectDestinationAndSwitch(home);
        else showToast(t('nav_set_home_hint'));
    });
    if (workBtn) workBtn.addEventListener('click', () => {
        const work = getWorkLocation();
        if (work) selectDestinationAndSwitch(work);
        else showToast(t('nav_set_work_hint'));
    });

    renderSaved();
    renderRecent();
    updateHomeWorkButtons();
    setTimeout(initNavMap, 150);
}

function switchNavTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.nav-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('navPane' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
    if (tab === 'search' && NAV.map) setTimeout(() => NAV.map.invalidateSize(), 60);
}

function handleQuickDestination(dest) {
    if (dest === 'service') {
        window.open('https://www.tesla.com/findus?v=2&filters=service', '_blank', 'noopener,noreferrer');
        return;
    }
    const matchFn = dest === 'supercharger'
        ? n => /tesla|supercharger/i.test(n)
        : dest === 'fastned' ? n => /fastned/i.test(n) : null;
    if (!matchFn) return;

    navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;
        showToast(t('searching'));
        try {
            const stations = await fetchNearbyChargers(lat, lon, 50);
            const filtered = stations.filter(s => matchFn(s.network));
            filtered.forEach(s => { s.dist = haversineKm(lat, lon, s.lat, s.lon); });
            filtered.sort((a, b) => a.dist - b.dist);
            if (filtered.length) {
                await navigateToCharger(filtered[0].lat, filtered[0].lon, filtered[0].name);
            } else {
                showToast(t('none_found_50km'));
            }
        } catch {
            showToast(t('chargers_error'));
        }
    }, () => showToast(t('enable_location')), { timeout: 8000 });
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
        loadTeslaVehicleInfo();
        loadDriveState();
        loadPerformance();
    });

    const timeSel = document.getElementById('timeFormat');
    if (timeSel) {
        timeSel.value = USER_PREFERENCES.timeFormat;
        timeSel.addEventListener('change', e => {
            USER_PREFERENCES.timeFormat = e.target.value;
            localStorage.setItem('time_format', e.target.value);
            updateTime();
        });
    }

    const langSel = document.getElementById('uiLanguage');
    if (langSel) {
        langSel.value = USER_PREFERENCES.uiLanguage;
        langSel.addEventListener('change', e => {
            USER_PREFERENCES.uiLanguage = e.target.value;
            localStorage.setItem('ui_lang', e.target.value);
            applyLanguage(e.target.value);
        });
    }

    refreshBtn.addEventListener('click', async () => {
        refreshBtn.textContent = t('refreshing');
        refreshBtn.disabled    = true;
        if (AUTH.isLoggedIn()) {
            const raw = await fetchLiveData(true); // explicit user action → force
            if (raw) LIVE_DATA = flattenVehicleData(raw);
        }
        loadWeather();
        renderAllTiles();
        setTimeout(() => { refreshBtn.textContent = t('refresh_data'); refreshBtn.disabled = false; }, 1500);
    });
}

// ── Car Controls ──────────────────────────────────────────────

let _ctrlTemp = 21;

function updateControlsUI() {
    const climateBtn = document.getElementById('ctrlClimateToggle');
    if (!climateBtn) return;

    const disconnected = !AUTH.isLoggedIn() || !LIVE_DATA;

    // Disable all control buttons when not connected
    const allCtrlBtns = document.querySelectorAll('#controlsTile .ctrl-btn, #controlsTile .ctrl-icon-btn');
    const overlay = document.getElementById('ctrlOverlay');
    if (disconnected) {
        allCtrlBtns.forEach(b => b.disabled = true);
        if (overlay) overlay.classList.remove('hidden');
        climateBtn.textContent = `${t('ctrl_climate')}: ---`;
        document.getElementById('ctrlTempDisplay').textContent = '---';
        document.getElementById('ctrlChargeSlider').disabled = true;
        return;
    }
    allCtrlBtns.forEach(b => b.disabled = false);
    document.getElementById('ctrlChargeSlider').disabled = false;
    if (overlay) overlay.classList.add('hidden');

    const on = LIVE_DATA.is_climate_on || LIVE_DATA.is_auto_conditioning_on;
    climateBtn.textContent = `${t('ctrl_climate')}: ${on ? t('status_on') : t('status_off')}`;
    climateBtn.classList.toggle('ctrl-active', !!on);

    const temp = LIVE_DATA.driver_temp_setting ?? LIVE_DATA.inside_temp ?? 21;
    _ctrlTemp  = parseFloat(temp);
    document.getElementById('ctrlTempDisplay').textContent = formatTemperature(_ctrlTemp);

    const limit = LIVE_DATA.charge_limit_soc ?? 80;
    document.getElementById('ctrlChargeSlider').value = limit;
    document.getElementById('ctrlChargeVal').textContent = `${limit}%`;

    // Sentry toggle state
    const sentryBtn = document.getElementById('ctrlSentry');
    if (sentryBtn) {
        sentryBtn.textContent = `${t('ctrl_sentry')}: ${LIVE_DATA.sentry_mode ? t('status_on') : t('status_off')}`;
        sentryBtn.classList.toggle('ctrl-active', !!LIVE_DATA.sentry_mode);
    }

    // Charge start/stop visibility
    const startChargeBtn = document.getElementById('ctrlStartCharge');
    const stopChargeBtn = document.getElementById('ctrlStopCharge');
    if (startChargeBtn && stopChargeBtn) {
        const charging = LIVE_DATA.charging_state === 'Charging';
        const pluggedIn = LIVE_DATA.charging_state && LIVE_DATA.charging_state !== 'Disconnected';
        startChargeBtn.classList.toggle('hidden', charging || !pluggedIn);
        stopChargeBtn.classList.toggle('hidden', !charging);
    }
}

function setupControls() {
    const climateBtn   = document.getElementById('ctrlClimateToggle');
    const precondBtn   = document.getElementById('ctrlPrecondition');
    const tempDownBtn  = document.getElementById('ctrlTempDown');
    const tempUpBtn    = document.getElementById('ctrlTempUp');
    const chargeSlider = document.getElementById('ctrlChargeSlider');
    const chargeVal    = document.getElementById('ctrlChargeVal');
    const chargeSet    = document.getElementById('ctrlChargeSet');
    const lockBtn      = document.getElementById('ctrlLock');
    const unlockBtn    = document.getElementById('ctrlUnlock');
    const flashBtn     = document.getElementById('ctrlFlash');
    const honkBtn      = document.getElementById('ctrlHonk');
    const sentryBtn    = document.getElementById('ctrlSentry');
    const trunkBtn     = document.getElementById('ctrlTrunk');
    const frunkBtn     = document.getElementById('ctrlFrunk');
    const startChargeBtn = document.getElementById('ctrlStartCharge');
    const stopChargeBtn  = document.getElementById('ctrlStopCharge');

    async function runCmd(btn, command, params, successMsg) {
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '…';
        const res = await sendCarCommand(command, params);
        showToast(res.ok ? successMsg : (res.error || t('cmd_failed')));
        btn.textContent = orig;
        btn.disabled = false;
        // Only re-fetch vehicle data for commands that change state
        // flash_lights, honk_horn etc. don't need a re-read (saves API calls)
        if (res.ok && STATE_CHANGING_CMDS.has(command)) {
            const raw = await fetchLiveData(true);
            if (raw) { LIVE_DATA = flattenVehicleData(raw); updateControlsUI(); }
        }
    }

    requireConfirmTap(climateBtn, async () => {
        const on = climateBtn.classList.contains('ctrl-active');
        await runCmd(climateBtn, on ? 'auto_conditioning_stop' : 'auto_conditioning_start', {}, on ? t('climate_off') : t('climate_on'));
    });

    requireConfirmTap(precondBtn, async () => {
        const ok = await preconditionBattery();
        showToast(ok ? t('precond_started') : t('precond_failed'));
    });

    function adjustTemp(delta) {
        _ctrlTemp = Math.max(15, Math.min(30, _ctrlTemp + delta));
        document.getElementById('ctrlTempDisplay').textContent = formatTemperature(_ctrlTemp);
    }

    tempDownBtn.addEventListener('click', () => { if (!isScrollTap()) adjustTemp(-0.5); });
    tempUpBtn.addEventListener('click',   () => { if (!isScrollTap()) adjustTemp(0.5); });

    let _tempTimer;
    [tempDownBtn, tempUpBtn].forEach(btn => {
        const delta = btn === tempDownBtn ? -0.5 : 0.5;
        btn.addEventListener('mousedown', () => { if (!isScrollTap()) _tempTimer = setInterval(() => adjustTemp(delta), 180); });
        btn.addEventListener('touchstart', e => { if (isScrollTap()) return; e.preventDefault(); _tempTimer = setInterval(() => adjustTemp(delta), 180); }, { passive: false });
        ['mouseup', 'mouseleave', 'touchend'].forEach(ev => btn.addEventListener(ev, () => {
            clearInterval(_tempTimer);
            sendCarCommand('set_temps', { driver_temp: _ctrlTemp, passenger_temp: _ctrlTemp })
                .then(r => { if (r.ok) showToast(t('temp_set', { val: formatTemperature(_ctrlTemp) })); });
        }));
    });

    chargeSlider.addEventListener('input', () => {
        chargeVal.textContent = `${chargeSlider.value}%`;
    });
    requireConfirmTap(chargeSet, () => {
        runCmd(chargeSet, 'set_charge_limit', { percent: parseInt(chargeSlider.value) }, `${t('ctrl_charge_limit')}: ${chargeSlider.value}%`);
    });

    requireConfirmTap(lockBtn,   () => runCmd(lockBtn,   'door_lock',    {}, t('car_locked')));
    requireConfirmTap(unlockBtn, () => runCmd(unlockBtn, 'door_unlock',  {}, t('car_unlocked')));
    requireConfirmTap(flashBtn,  () => runCmd(flashBtn,  'flash_lights', {}, t('lights_flashed')));
    requireConfirmTap(honkBtn,   () => runCmd(honkBtn,   'honk_horn',    {}, t('honked')));

    // Sentry toggle
    if (sentryBtn) {
        requireConfirmTap(sentryBtn, async () => {
            const on = sentryBtn.classList.contains('ctrl-active');
            await runCmd(sentryBtn, 'set_sentry_mode', { on: !on }, on ? t('sentry_off') : t('sentry_on'));
        });
    }

    // Trunk / Frunk
    if (trunkBtn) {
        requireConfirmTap(trunkBtn, () => runCmd(trunkBtn, 'actuate_trunk', { which_trunk: 'rear' }, t('trunk_opened')));
    }
    if (frunkBtn) {
        requireConfirmTap(frunkBtn, () => runCmd(frunkBtn, 'actuate_trunk', { which_trunk: 'front' }, t('frunk_opened')));
    }

    // Charge start/stop
    if (startChargeBtn) {
        requireConfirmTap(startChargeBtn, () => runCmd(startChargeBtn, 'charge_start', {}, t('charge_started')));
    }
    if (stopChargeBtn) {
        requireConfirmTap(stopChargeBtn, () => runCmd(stopChargeBtn, 'charge_stop', {}, t('charge_stopped')));
    }

    // Firmware update buttons
    const checkFwBtn  = document.getElementById('checkFwBtn');
    const fwInstallBtn = document.getElementById('fwInstallBtn');

    if (checkFwBtn) {
        checkFwBtn.addEventListener('click', async () => {
            checkFwBtn.textContent = t('checking');
            checkFwBtn.disabled = true;
            const raw = await fetchLiveData(true); // user-initiated → force
            if (raw) {
                LIVE_DATA = flattenVehicleData(raw);
                loadTeslaVehicleInfo();
                const su = LIVE_DATA.software_update;
                if (!su || !su.status || su.status === '') {
                    showToast(t('up_to_date'));
                } else {
                    showToast(`Update status: ${su.status}${su.version ? ' — v' + su.version : ''}`);
                }
            } else {
                showToast(t('vehicle_unreachable'));
            }
            checkFwBtn.textContent = t('check_updates');
            checkFwBtn.disabled = false;
        });
    }

    if (fwInstallBtn) {
        requireConfirmTap(fwInstallBtn, async () => {
            fwInstallBtn.textContent = t('scheduling');
            fwInstallBtn.disabled = true;
            const res = await sendCarCommand('schedule_software_update', { offset_sec: 0 });
            showToast(res.ok ? t('update_scheduled') : (res.error || t('cmd_failed')));
            fwInstallBtn.textContent = t('install_now');
            fwInstallBtn.disabled = false;
        });
    }
}

// ── Charger Network Preferences ───────────────────────────────

function setupChargerPrefs() {
    const group = document.getElementById('chargerPrefGroup');
    if (!group) return;
    const saved = getChargerPrefs();
    group.querySelectorAll('.pref-toggle').forEach(btn => {
        btn.classList.toggle('active', saved.includes(btn.dataset.net));
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const active = [...group.querySelectorAll('.pref-toggle.active')].map(b => b.dataset.net);
            saveChargerPrefs(active);
        });
    });
}

// ── Smart Charger Route Recommendation ────────────────────────

async function recommendChargerForRoute(dest, routeDistanceKm) {
    const card = document.getElementById('chargeRec');
    const body = document.getElementById('chargeRecBody');
    if (!card || !body) return;

    // battery_range is always miles from API; convert to km for distance comparison
    const rangeKm = LIVE_DATA?.battery_range ? LIVE_DATA.battery_range * 1.60934 : null;
    const buffer = 1.15;

    if (!rangeKm || rangeKm >= routeDistanceKm * buffer) {
        card.classList.add('hidden');
        return;
    }

    let userLat, userLon;
    try {
        const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
        );
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;
    } catch { card.classList.add('hidden'); return; }

    const midLat = (userLat + dest.lat) / 2;
    const midLon = (userLon + dest.lon) / 2;

    let stations = [];
    try {
        const [mid, near] = await Promise.all([
            fetchNearbyChargers(midLat, midLon, 25),
            fetchNearbyChargers(dest.lat, dest.lon, 20)
        ]);
        stations = [...mid, ...near];
    } catch { card.classList.add('hidden'); return; }

    const seen = new Set();
    const filtered = stations.filter(s => {
        const key = `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return matchesPref(s.network);
    });

    filtered.forEach(s => { s.dist = haversineKm(userLat, userLon, s.lat, s.lon); });
    filtered.sort((a, b) => a.dist - b.dist);

    const top = filtered.slice(0, 3);
    if (!top.length) { card.classList.add('hidden'); return; }

    const shortfall = Math.round(routeDistanceKm * buffer - rangeKm);
    body.innerHTML = `<div class="rec-info">Range ~${Math.round(rangeKm)} km · Trip needs ~${Math.round(routeDistanceKm * buffer)} km (${t('charge_short', { shortfall })}):</div>`;

    top.forEach(s => {
        const { cls: badgeClass, label: badgeLabel } = chargerBadge(s.network);

        const el = document.createElement('div');
        el.className = 'rec-item';
        el.innerHTML = `
            <div class="rec-item-header">
                <span class="charger-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
                <span class="charger-dist">${formatDistance(s.dist)}</span>
            </div>
            <div class="rec-item-name">${escapeHtml(s.name)}</div>
        `;
        const navBtn = document.createElement('button');
        navBtn.className = 'charger-nav-btn';
        navBtn.textContent = t('nav_precondition');
        navBtn.addEventListener('click', () => navigateToCharger(s.lat, s.lon, s.name));
        el.appendChild(navBtn);
        body.appendChild(el);
    });

    card.classList.remove('hidden');
}

// ── Custom Modal ───────────────────────────────────────────────

function showModal(title, message, buttons = []) {
    let overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modalOverlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }
    const btnsHtml = buttons.map((b, i) =>
        `<button class="modal-btn ${b.cls || ''}" data-idx="${i}">${escapeHtml(b.label)}</button>`
    ).join('');
    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-title">${escapeHtml(title)}</div>
            <div class="modal-msg">${escapeHtml(message)}</div>
            <div class="modal-btns">${btnsHtml}</div>
        </div>`;
    overlay.classList.add('modal-visible');
    overlay.querySelectorAll('.modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const b = buttons[parseInt(btn.dataset.idx)];
            overlay.classList.remove('modal-visible');
            if (b && b.action) b.action();
        });
    });
}

// ── Vehicle Picker ─────────────────────────────────────────────

function showVehiclePicker(vehicles) {
    return new Promise(resolve => {
        let overlay = document.getElementById('modalOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modalOverlay';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }
        const items = vehicles.map((v, i) => {
            const name = v.display_name || `Vehicle ${i + 1}`;
            const id = v.id_s || String(v.id);
            return `<button class="modal-vehicle-btn" data-id="${escapeHtml(id)}" data-name="${escapeHtml(name)}">
                <span class="modal-vehicle-name">${escapeHtml(name)}</span>
                <span class="modal-vehicle-vin">${escapeHtml(v.vin || '')}</span>
            </button>`;
        }).join('');
        overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-title">${t('select_vehicle')}</div>
                <div class="modal-vehicle-list">${items}</div>
            </div>`;
        overlay.classList.add('modal-visible');
        overlay.querySelectorAll('.modal-vehicle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                localStorage.setItem('tesla_vehicle_id', btn.dataset.id);
                localStorage.setItem('tesla_vehicle_name', btn.dataset.name);
                overlay.classList.remove('modal-visible');
                resolve();
            });
        });
    });
}

// ── Trip Computer ─────────────────────────────────────────────

function updateTripComputer(d) {
    if (!d || d.odometer == null || !LIVE_DATA) return;
    const odoKm = d.odometer * 1.60934; // API returns miles
    const startOdo = parseFloat(localStorage.getItem('trip_start_odo') || '0');
    const startBat = parseFloat(localStorage.getItem('trip_start_bat') || '0');
    const batKwh = (d.battery_level || 0) * 0.75; // ~75 kWh pack

    if (!startOdo) {
        // First time: initialize trip
        localStorage.setItem('trip_start_odo', odoKm.toString());
        localStorage.setItem('trip_start_bat', batKwh.toString());
        return;
    }

    const distKm = Math.max(0, odoKm - startOdo);
    const energyUsed = Math.max(0, startBat - batKwh);
    const efficiency = distKm > 0.5 ? Math.round((energyUsed * 1000) / distKm) : 0;

    const distEl = document.getElementById('distanceToday');
    if (distEl) {
        distEl.dataset.km = distKm.toString();
        distEl.textContent = formatDistance(distKm);
    }

    const effEl = document.getElementById('avgEfficiency');
    if (effEl && efficiency > 0) {
        effEl.dataset.whkm = efficiency.toString();
        const isMiles = USER_PREFERENCES.distanceUnit === 'miles';
        effEl.textContent = isMiles ? `${Math.round(efficiency * 1.60934)} Wh/mi` : `${efficiency} Wh/km`;
    }

    const energyEl = document.getElementById('energyUsed');
    if (energyEl) energyEl.textContent = energyUsed > 0 ? `${energyUsed.toFixed(1)} kWh` : '0 kWh';
}

function resetTrip() {
    if (!LIVE_DATA) { showToast(t('connect_first')); return; }
    const d = getTeslaData();
    if (d.odometer != null) {
        const odoKm = d.odometer * 1.60934;
        const batKwh = (d.battery_level || 0) * 0.75;
        localStorage.setItem('trip_start_odo', odoKm.toString());
        localStorage.setItem('trip_start_bat', batKwh.toString());
    }
    const distEl = document.getElementById('distanceToday');
    if (distEl) { distEl.dataset.km = '0'; distEl.textContent = formatDistance(0); }
    const effEl = document.getElementById('avgEfficiency');
    if (effEl) { effEl.dataset.whkm = '0'; effEl.textContent = '0 Wh/km'; }
    const energyEl = document.getElementById('energyUsed');
    if (energyEl) energyEl.textContent = '0 kWh';
    showToast(t('trip_reset_done'));
}

// ── Offline indicator ─────────────────────────────────────────

function setupOfflineIndicator() {
    const banner = document.getElementById('offlineBanner');
    if (!banner) return;
    function update() {
        banner.classList.toggle('hidden', navigator.onLine);
        banner.textContent = t('offline_banner');
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

// ── Data freshness ───────────────────────────────────────────

function updateLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (!el) return;
    if (!_lastFetchTime) { el.textContent = ''; return; }
    const ago = Math.round((Date.now() - _lastFetchTime) / 60000);
    const timeStr = ago < 1 ? t('just_now') : t('minutes_ago', { min: ago });
    el.textContent = t('last_updated', { time: timeStr });
}

// ── Remove auto temperature option ─────────────────────────
// "Auto" was listed in Settings but never implemented.
// If a user had it selected, default them to celsius.
if (USER_PREFERENCES.temperatureUnit === 'auto') {
    USER_PREFERENCES.temperatureUnit = 'celsius';
    localStorage.setItem('temp_unit', 'celsius');
}

// ── Error handling ─────────────────────────────────────────────────
window.addEventListener('error', e => {
    console.error('Unhandled error:', e.error);
    showToast('An unexpected error occurred');
});
window.addEventListener('unhandledrejection', e => {
    console.error('Unhandled promise rejection:', e.reason);
    showToast('An unexpected error occurred');
});

// ── Init ───────────────────────────────────────────────────────

async function init() {
    // Apply saved language before rendering anything
    applyLanguage(USER_PREFERENCES.uiLanguage);

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
    setupControls();
    setupChargerPrefs();
    setupOfflineIndicator();

    // Wire trip reset button
    const resetTripBtn = document.getElementById('resetTripBtn');
    if (resetTripBtn) resetTripBtn.addEventListener('click', resetTrip);

    // Periodically update the "last updated" display
    setInterval(updateLastUpdated, 30000);

    // Auto-refresh live data every 30 minutes when connected
    // Tesla charges per API call — keep this infrequent
    setInterval(async () => {
        if (!AUTH.isLoggedIn()) return;
        try {
            const raw = await fetchLiveData(); // respects DATA_TTL
            if (raw) { LIVE_DATA = flattenVehicleData(raw); renderAllTiles(); }
        } catch { /* network blip — retry next cycle */ }
    }, 30 * 60 * 1000);
}

init();

