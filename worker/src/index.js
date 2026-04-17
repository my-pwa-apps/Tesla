// ============================================================
//  Tesla Dashboard — Cloudflare Worker Backend
//  Port of Express backend/server.js to Workers runtime
// ============================================================

const ALLOWED_ORIGINS = [
    'https://my-pwa-apps.github.io',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

const ALLOWED_COMMANDS = new Set([
    'door_lock', 'door_unlock',
    'auto_conditioning_start', 'auto_conditioning_stop',
    'set_temps', 'set_charge_limit',
    'charge_start', 'charge_stop',
    'flash_lights', 'honk_horn',
    'set_sentry_mode', 'schedule_software_update',
    'actuate_trunk', 'set_preconditioning_max',
    'navigation_request'
]);

const OVERPASS_MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
];

// ── CORS helpers ─────────────────────────────────────────────

function corsHeaders(origin) {
    const allowed = !origin || ALLOWED_ORIGINS.includes(origin);
    return {
        'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}

function json(data, status = 200, origin = '') {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        }
    });
}

// ── Rate limiting (simple in-memory, per-isolate) ────────────

const rateLimits = new Map();

function rateLimit(key, maxRequests, windowMs) {
    const now = Date.now();
    const entry = rateLimits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + windowMs;
    }
    entry.count++;
    rateLimits.set(key, entry);
    return entry.count > maxRequests;
}

// ── Tesla Fleet API helpers ──────────────────────────────────

async function safeJson(r) {
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { error: `Non-JSON response (${r.status})` };
    try { return await r.json(); } catch { return { error: 'JSON parse error' }; }
}

async function fleetGet(env, path, token, timeoutMs = 55000) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const r = await fetch(`${env.FLEET_API_BASE}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: ac.signal
        });
        return { status: r.status, body: await safeJson(r) };
    } finally {
        clearTimeout(timer);
    }
}

async function fleetPost(env, path, token, payload = {}, timeoutMs = 55000) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const r = await fetch(`${env.FLEET_API_BASE}${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ac.signal
        });
        return { status: r.status, body: await safeJson(r) };
    } finally {
        clearTimeout(timer);
    }
}

function bearerToken(request) {
    return request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || null;
}

// ── Route handler ────────────────────────────────────────────

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const path = url.pathname;
        const method = request.method;

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        try {
            // ── GET /api/config ──
            if (method === 'GET' && path === '/api/config') {
                if (!env.TESLA_CLIENT_ID) return json({ error: 'Client ID not configured' }, 500, origin);
                return json({ clientId: env.TESLA_CLIENT_ID }, 200, origin);
            }

            // ── POST /api/auth/token ──
            if (method === 'POST' && path === '/api/auth/token') {
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (rateLimit(`auth:${ip}`, 20, 15 * 60 * 1000)) {
                    return json({ error: 'Too many requests, please try again later' }, 429, origin);
                }
                if (!env.TESLA_CLIENT_ID || !env.TESLA_CLIENT_SECRET) {
                    return json({ error: 'Server credentials not configured' }, 500, origin);
                }
                const { code, code_verifier, redirect_uri } = await request.json();
                const params = new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: env.TESLA_CLIENT_ID,
                    client_secret: env.TESLA_CLIENT_SECRET,
                    code, code_verifier, redirect_uri
                });
                const r = await fetch(env.TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params.toString()
                });
                const ct = r.headers.get('content-type') || '';
                if (!ct.includes('application/json')) {
                    const text = await r.text();
                    return json({ error: 'Tesla returned unexpected response', preview: text.substring(0, 200) }, 502, origin);
                }
                const data = await r.json();
                return json(data, r.ok ? 200 : r.status, origin);
            }

            // ── POST /api/auth/refresh ──
            if (method === 'POST' && path === '/api/auth/refresh') {
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (rateLimit(`auth:${ip}`, 20, 15 * 60 * 1000)) {
                    return json({ error: 'Too many requests' }, 429, origin);
                }
                if (!env.TESLA_CLIENT_ID || !env.TESLA_CLIENT_SECRET) {
                    return json({ error: 'Server credentials not configured' }, 500, origin);
                }
                const { refresh_token } = await request.json();
                const r = await fetch(env.TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        client_id: env.TESLA_CLIENT_ID,
                        client_secret: env.TESLA_CLIENT_SECRET,
                        refresh_token
                    }).toString()
                });
                const ct = r.headers.get('content-type') || '';
                if (!ct.includes('application/json')) {
                    const text = await r.text();
                    return json({ error: 'Tesla returned unexpected response', preview: text.substring(0, 200) }, 502, origin);
                }
                const data = await r.json();
                return json(data, r.ok ? 200 : r.status, origin);
            }

            // ── Vehicle routes (need auth + ID validation) ──
            const vehicleMatch = path.match(/^\/api\/vehicles\/(\d+)(\/.*)?$/);
            if (path.startsWith('/api/vehicles')) {
                const token = bearerToken(request);
                if (!token) return json({ error: 'No access token' }, 401, origin);

                // GET /api/vehicles (list)
                if (method === 'GET' && path === '/api/vehicles') {
                    try {
                        const { status, body } = await fleetGet(env, '/vehicles', token);
                        return json(body, status, origin);
                    } catch (e) {
                        if (e.name === 'AbortError') return json({ error: 'Tesla API timeout' }, 504, origin);
                        return json({ error: 'Failed to fetch vehicles' }, 500, origin);
                    }
                }

                if (!vehicleMatch) return json({ error: 'Invalid path' }, 400, origin);
                const id = vehicleMatch[1];
                const sub = vehicleMatch[2] || '';

                // GET /api/vehicles/:id/vehicle_data
                if (method === 'GET' && sub === '/vehicle_data') {
                    const endpoints = 'charge_state;climate_state;drive_state;vehicle_state;vehicle_config';
                    try {
                        const { status, body } = await fleetGet(env,
                            `/vehicles/${id}/vehicle_data?endpoints=${encodeURIComponent(endpoints)}`, token);
                        return json(body, status, origin);
                    } catch (e) {
                        if (e.name === 'AbortError') return json({ error: 'Tesla API timeout — vehicle may be asleep' }, 504, origin);
                        return json({ error: 'Failed to fetch vehicle data' }, 500, origin);
                    }
                }

                // POST /api/vehicles/:id/wake_up
                if (method === 'POST' && sub === '/wake_up') {
                    try {
                        await fleetPost(env, `/vehicles/${id}/wake_up`, token);
                        const delays = [3000, 4000, 5000, 6000, 7000];
                        for (const ms of delays) {
                            await new Promise(ok => setTimeout(ok, ms));
                            const { status, body } = await fleetGet(env, `/vehicles/${id}`, token);
                            if (body?.response?.state === 'online') return json({ online: true, state: 'online' }, 200, origin);
                            if (status !== 200) break;
                        }
                        return json({ online: false, state: 'asleep' }, 200, origin);
                    } catch (e) {
                        if (e.name === 'AbortError') return json({ error: 'Tesla API timeout during wake' }, 504, origin);
                        return json({ error: 'Wake up failed' }, 500, origin);
                    }
                }

                // POST /api/vehicles/:id/command
                if (method === 'POST' && sub === '/command') {
                    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                    if (rateLimit(`cmd:${ip}`, 30, 60 * 1000)) {
                        return json({ error: 'Too many commands, please slow down' }, 429, origin);
                    }
                    const { command, ...payload } = await request.json();
                    if (!command) return json({ error: 'command is required' }, 400, origin);
                    if (!ALLOWED_COMMANDS.has(command)) return json({ error: 'Unknown command' }, 400, origin);
                    try {
                        const { status, body } = await fleetPost(env,
                            `/vehicles/${id}/command/${command}`, token, payload);
                        return json(body, status, origin);
                    } catch (e) {
                        if (e.name === 'AbortError') return json({ error: 'Tesla API timeout' }, 504, origin);
                        return json({ error: 'Command failed' }, 500, origin);
                    }
                }

                // GET /api/vehicles/:id/nearby_charging_sites
                if (method === 'GET' && sub === '/nearby_charging_sites') {
                    try {
                        const { status, body } = await fleetGet(env,
                            `/vehicles/${id}/nearby_charging_sites`, token);
                        return json(body, status, origin);
                    } catch (e) {
                        if (e.name === 'AbortError') return json({ error: 'Tesla API timeout' }, 504, origin);
                        return json({ error: 'Failed to fetch charging sites' }, 500, origin);
                    }
                }
            }

            // ── POST /api/overpass (proxy) ──
            if (method === 'POST' && path === '/api/overpass') {
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (rateLimit(`ovp:${ip}`, 20, 60 * 1000)) {
                    return json({ error: 'Too many Overpass requests' }, 429, origin);
                }
                const { data } = await request.json();
                if (!data || typeof data !== 'string' || data.length > 2000) {
                    return json({ error: 'Invalid query' }, 400, origin);
                }
                for (const mirror of OVERPASS_MIRRORS) {
                    try {
                        const r = await fetch(mirror, {
                            method: 'POST',
                            body: `data=${encodeURIComponent(data)}`,
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            signal: AbortSignal.timeout(15000)
                        });
                        if (!r.ok) continue;
                        const result = await r.json();
                        return json(result, 200, origin);
                    } catch { continue; }
                }
                return json({ error: 'All Overpass mirrors failed' }, 502, origin);
            }

            // ── Static: .well-known (for Tesla Fleet API key) ──
            if (path.startsWith('/.well-known/')) {
                // Serve from a KV binding if configured, otherwise return 404
                return json({ error: 'Not found' }, 404, origin);
            }

            return json({ error: 'Not found' }, 404, origin);

        } catch (e) {
            console.error('Worker error:', e);
            return json({ error: 'Internal server error' }, 500, origin);
        }
    }
};
