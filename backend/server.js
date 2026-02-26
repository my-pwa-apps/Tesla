const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
require('dotenv').config();

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    'https://my-pwa-apps.github.io',
    'https://bart-gilt-delta.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'null'   // file:// protocol for local HTML opens
];

app.use(cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));
app.use(express.static(path.join(__dirname, 'public')));

// ── Tesla config ──────────────────────────────────────────────────────────────
const TESLA = {
    clientId     : process.env.TESLA_CLIENT_ID,
    clientSecret : process.env.TESLA_CLIENT_SECRET,
    tokenUrl     : 'https://auth.tesla.com/oauth2/v3/token',
    fleetApiBase : 'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1'
};

// ── Helper: proxy a Fleet API GET ─────────────────────────────────────────────
async function fleetGet(path, token) {
    const r = await fetch(`${TESLA.fleetApiBase}${path}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return { status: r.status, body: await r.json() };
}

// ── Helper: proxy a Fleet API POST ────────────────────────────────────────────
async function fleetPost(path, token, payload = {}) {
    const r = await fetch(`${TESLA.fleetApiBase}${path}`, {
        method : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
    });
    return { status: r.status, body: await r.json() };
}

// ── Extract bearer token from request ────────────────────────────────────────
function bearerToken(req) {
    return req.headers.authorization?.replace(/^Bearer\s+/i, '') || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC CONFIG
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
    if (!TESLA.clientId) return res.status(500).json({ error: 'Client ID not configured' });
    res.json({ clientId: TESLA.clientId });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH: exchange code for tokens
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/token', async (req, res) => {
    const { code, code_verifier, redirect_uri } = req.body;
    if (!TESLA.clientId || !TESLA.clientSecret) {
        return res.status(500).json({ error: 'Server credentials not configured', hint: 'Set TESLA_CLIENT_ID and TESLA_CLIENT_SECRET in Vercel env vars' });
    }
    try {
        const r = await fetch(TESLA.tokenUrl, {
            method : 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body   : new URLSearchParams({
                grant_type   : 'authorization_code',
                client_id    : TESLA.clientId,
                client_secret: TESLA.clientSecret,
                code, code_verifier, redirect_uri
            }).toString()
        });
        const data = await r.json();
        res.status(r.ok ? 200 : r.status).json(data);
    } catch (e) {
        console.error('Token exchange error:', e);
        res.status(500).json({ error: 'Token exchange failed', detail: e.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH: refresh token
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!TESLA.clientId || !TESLA.clientSecret) {
        return res.status(500).json({ error: 'Server credentials not configured' });
    }
    try {
        const r = await fetch(TESLA.tokenUrl, {
            method : 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body   : new URLSearchParams({
                grant_type   : 'refresh_token',
                client_id    : TESLA.clientId,
                client_secret: TESLA.clientSecret,
                refresh_token
            }).toString()
        });
        const data = await r.json();
        res.status(r.ok ? 200 : r.status).json(data);
    } catch (e) {
        console.error('Token refresh error:', e);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES: list
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    try {
        const { status, body } = await fleetGet('/vehicles', token);
        res.status(status).json(body);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES: full data (all sub-states)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/vehicles/:id/vehicle_data', async (req, res) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const endpoints = 'charge_state;climate_state;drive_state;vehicle_state;vehicle_config';
    try {
        const { status, body } = await fleetGet(
            `/vehicles/${req.params.id}/vehicle_data?endpoints=${encodeURIComponent(endpoints)}`,
            token
        );
        res.status(status).json(body);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch vehicle data' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES: wake up
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/vehicles/:id/wake_up', async (req, res) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    try {
        const { status, body } = await fleetPost(`/vehicles/${req.params.id}/wake_up`, token);
        res.status(status).json(body);
    } catch (e) {
        res.status(500).json({ error: 'Wake up failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES: generic command proxy  (lock, unlock, climate, etc.)
// Body: { command: 'door_lock' | 'door_unlock' | 'auto_conditioning_start' | ... }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/vehicles/:id/command', async (req, res) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    const { command, ...payload } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command is required' });
    try {
        const { status, body } = await fleetPost(
            `/vehicles/${req.params.id}/command/${command}`, token, payload
        );
        res.status(status).json(body);
    } catch (e) {
        res.status(500).json({ error: 'Command failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES: nearby charging sites
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/vehicles/:id/nearby_charging_sites', async (req, res) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });
    try {
        const { status, body } = await fleetGet(
            `/vehicles/${req.params.id}/nearby_charging_sites`, token
        );
        res.status(status).json(body);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch charging sites' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Tesla Dashboard backend → http://127.0.0.1:${PORT}`);
    console.log(`Fleet API base          → ${TESLA.fleetApiBase}`);
    console.log(`Client ID               → ${TESLA.clientId ? TESLA.clientId.substring(0, 8) + '...' : 'NOT SET'}`);
}).on('error', err => {
    console.error('Server error:', err.message);
    if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} already in use.`);
    process.exit(1);
});
