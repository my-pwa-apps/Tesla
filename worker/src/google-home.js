// ============================================================
//  Google Smart Home fulfillment for Tesla
//  - OAuth 2.0 account linking (single-user, password gated)
//  - SYNC / QUERY / EXECUTE intents
//  - Reuses Tesla refresh token stored in KV
// ============================================================

const DEVICE_ID = 'tesla-car';

// ── KV token helpers ─────────────────────────────────────────

async function getTeslaToken(env) {
    const raw = await env.TOKENS.get('tesla:session');
    if (!raw) throw new Error('Tesla not linked. Run /setup first.');
    const session = JSON.parse(raw);

    // Refresh if expired (or <5 min to go)
    if (!session.access_token || !session.expires_at || session.expires_at < Date.now() + 5 * 60 * 1000) {
        const r = await fetch(env.TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: env.TESLA_CLIENT_ID,
                client_secret: env.TESLA_CLIENT_SECRET,
                refresh_token: session.refresh_token
            }).toString()
        });
        if (!r.ok) throw new Error(`Tesla refresh failed: ${r.status}`);
        const d = await r.json();
        session.access_token = d.access_token;
        if (d.refresh_token) session.refresh_token = d.refresh_token;
        session.expires_at = Date.now() + (d.expires_in - 60) * 1000;
        await env.TOKENS.put('tesla:session', JSON.stringify(session));
    }
    return session;
}

async function fleet(env, path, method = 'GET', body = null) {
    const session = await getTeslaToken(env);
    const opts = {
        method,
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(30000)
    };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const id = session.vehicle_id;
    const r = await fetch(`${env.FLEET_API_BASE}${path.replace('{id}', id)}`, opts);
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : { error: await r.text() };
    return { status: r.status, data };
}

async function wakeIfNeeded(env) {
    // Try a quick state read; if asleep, wake
    const { data } = await fleet(env, '/vehicles/{id}');
    if (data?.response?.state === 'online') return true;
    await fleet(env, '/vehicles/{id}/wake_up', 'POST');
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const { data: d } = await fleet(env, '/vehicles/{id}');
        if (d?.response?.state === 'online') return true;
    }
    return false;
}

// ── Smart Home intent handlers ───────────────────────────────

function syncResponse(requestId) {
    return {
        requestId,
        payload: {
            agentUserId: 'tesla-user',
            devices: [{
                id: DEVICE_ID,
                type: 'action.devices.types.CAR',
                traits: [
                    'action.devices.traits.EnergyStorage',
                    'action.devices.traits.LockUnlock',
                    'action.devices.traits.StartStop',
                    'action.devices.traits.TemperatureControl',
                    'action.devices.traits.OnOff',
                    'action.devices.traits.Locator',
                    'action.devices.traits.OpenClose'
                ],
                name: {
                    defaultNames: ['Tesla'],
                    name: 'Tesla',
                    nicknames: ['my car', 'the Tesla', 'the car']
                },
                willReportState: false,
                attributes: {
                    queryOnlyEnergyStorage: false,
                    isRechargeable: true,
                    pausable: true,
                    temperatureRange: { minThresholdCelsius: 15, maxThresholdCelsius: 28 },
                    temperatureUnitForUX: 'C',
                    openDirection: ['UP'],
                    discreteOnlyOpenClose: true
                }
            }]
        }
    };
}

async function queryResponse(env, requestId) {
    const { data } = await fleet(env,
        '/vehicles/{id}/vehicle_data?endpoints=' +
        encodeURIComponent('charge_state;climate_state;drive_state;vehicle_state'));

    const v = data?.response;
    if (!v) {
        return {
            requestId,
            payload: { devices: { [DEVICE_ID]: { status: 'OFFLINE', online: false, errorCode: 'deviceOffline' } } }
        };
    }

    const cs = v.charge_state || {};
    const cl = v.climate_state || {};
    const vs = v.vehicle_state || {};

    return {
        requestId,
        payload: {
            devices: {
                [DEVICE_ID]: {
                    online: true,
                    status: 'SUCCESS',
                    // Energy
                    capacityRemaining: [{ rawValue: cs.battery_level || 0, unit: 'PERCENTAGE' }],
                    capacityUntilFull: [{ rawValue: 100 - (cs.battery_level || 0), unit: 'PERCENTAGE' }],
                    descriptiveCapacityRemaining: cs.battery_level > 80 ? 'HIGH'
                        : cs.battery_level > 40 ? 'MEDIUM'
                        : cs.battery_level > 15 ? 'LOW' : 'CRITICALLY_LOW',
                    isCharging: cs.charging_state === 'Charging',
                    isPluggedIn: cs.charging_state && cs.charging_state !== 'Disconnected',
                    // Lock
                    isLocked: !!vs.locked,
                    isJammed: false,
                    // StartStop (for charging)
                    isRunning: cs.charging_state === 'Charging',
                    isPaused: cs.charging_state === 'Stopped',
                    // Temperature
                    temperatureSetpointCelsius: cl.driver_temp_setting ?? 20,
                    temperatureAmbientCelsius: cl.inside_temp ?? 20,
                    // OnOff (climate)
                    on: !!cl.is_climate_on,
                    // OpenClose (trunk/frunk)
                    openState: [
                        { openPercent: vs.rt ? 100 : 0, openDirection: 'UP' }
                    ]
                }
            }
        }
    };
}

async function executeResponse(env, requestId, commands) {
    const results = [];

    for (const cmd of commands) {
        for (const exec of cmd.execution) {
            try {
                await wakeIfNeeded(env);
                const r = await handleCommand(env, exec);
                results.push({
                    ids: cmd.devices.map(d => d.id),
                    status: r.success ? 'SUCCESS' : 'ERROR',
                    errorCode: r.error,
                    states: r.states || { online: true }
                });
            } catch (e) {
                results.push({
                    ids: cmd.devices.map(d => d.id),
                    status: 'ERROR',
                    errorCode: 'hardError'
                });
            }
        }
    }

    return { requestId, payload: { commands: results } };
}

async function handleCommand(env, exec) {
    const { command, params } = exec;

    switch (command) {
        case 'action.devices.commands.LockUnlock': {
            const ep = params.lock ? 'door_lock' : 'door_unlock';
            const { data } = await fleet(env, `/vehicles/{id}/command/${ep}`, 'POST', {});
            return { success: data?.response?.result, states: { isLocked: params.lock } };
        }
        case 'action.devices.commands.StartStop': {
            const ep = params.start ? 'charge_start' : 'charge_stop';
            const { data } = await fleet(env, `/vehicles/{id}/command/${ep}`, 'POST', {});
            return { success: data?.response?.result !== false, states: { isRunning: params.start } };
        }
        case 'action.devices.commands.PauseUnpause': {
            const ep = params.pause ? 'charge_stop' : 'charge_start';
            const { data } = await fleet(env, `/vehicles/{id}/command/${ep}`, 'POST', {});
            return { success: data?.response?.result !== false, states: { isPaused: params.pause } };
        }
        case 'action.devices.commands.OnOff': {
            const ep = params.on ? 'auto_conditioning_start' : 'auto_conditioning_stop';
            const { data } = await fleet(env, `/vehicles/{id}/command/${ep}`, 'POST', {});
            return { success: data?.response?.result !== false, states: { on: params.on } };
        }
        case 'action.devices.commands.SetTemperature': {
            const t = params.temperature;
            const { data } = await fleet(env, '/vehicles/{id}/command/set_temps', 'POST',
                { driver_temp: t, passenger_temp: t });
            return { success: data?.response?.result !== false, states: { temperatureSetpointCelsius: t } };
        }
        case 'action.devices.commands.Locate': {
            const { data } = await fleet(env, '/vehicles/{id}/command/honk_horn', 'POST', {});
            return { success: data?.response?.result !== false, states: { generatedAlert: true } };
        }
        case 'action.devices.commands.OpenClose': {
            // Toggle rear trunk
            const { data } = await fleet(env, '/vehicles/{id}/command/actuate_trunk', 'POST',
                { which_trunk: 'rear' });
            return { success: data?.response?.result !== false };
        }
    }
    return { success: false, error: 'functionNotSupported' };
}

// ── Main fulfillment handler ─────────────────────────────────

export async function handleFulfillment(request, env) {
    try {
        const body = await request.json();
        const intent = body.inputs?.[0]?.intent;
        const requestId = body.requestId;

        if (intent === 'action.devices.SYNC') {
            return new Response(JSON.stringify(syncResponse(requestId)),
                { headers: { 'Content-Type': 'application/json' } });
        }
        if (intent === 'action.devices.QUERY') {
            const resp = await queryResponse(env, requestId);
            return new Response(JSON.stringify(resp),
                { headers: { 'Content-Type': 'application/json' } });
        }
        if (intent === 'action.devices.EXECUTE') {
            const resp = await executeResponse(env, requestId, body.inputs[0].payload.commands);
            return new Response(JSON.stringify(resp),
                { headers: { 'Content-Type': 'application/json' } });
        }
        if (intent === 'action.devices.DISCONNECT') {
            return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: 'Unknown intent' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        console.error('Fulfillment error:', e);
        return new Response(JSON.stringify({ error: e.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// ── OAuth 2.0 account linking (authorization_code flow) ──────

export async function handleGoogleAuthorize(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
        // Render login form
        const redirect_uri = url.searchParams.get('redirect_uri') || '';
        const state = url.searchParams.get('state') || '';
        const client_id = url.searchParams.get('client_id') || '';
        // Google's redirect_uri is always https://oauth-redirect.googleusercontent.com/r/<project>
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Link Tesla to Google Home</title>
<style>body{font-family:system-ui;max-width:400px;margin:40px auto;padding:20px}
input{width:100%;padding:12px;margin:8px 0;font-size:16px;box-sizing:border-box}
button{width:100%;padding:12px;background:#cc0000;color:#fff;border:0;font-size:16px;cursor:pointer;border-radius:6px}
button:hover{background:#a00}</style></head><body>
<h2>Link Tesla to Google Home</h2>
<p>Enter the link password you configured:</p>
<form method="POST">
  <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
  <input type="hidden" name="state" value="${escapeHtml(state)}">
  <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
  <input type="password" name="password" placeholder="Link password" required autofocus>
  <button type="submit">Link</button>
</form></body></html>`;
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (request.method === 'POST') {
        const form = await request.formData();
        const password = form.get('password');
        const redirect_uri = form.get('redirect_uri');
        const state = form.get('state');

        if (!env.GOOGLE_LINK_PASSWORD || password !== env.GOOGLE_LINK_PASSWORD) {
            return new Response('Invalid password', { status: 401 });
        }

        // Issue an auth code
        const code = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        await env.TOKENS.put(`google:authcode:${code}`, JSON.stringify({ issued: Date.now() }),
            { expirationTtl: 600 });

        const redirect = new URL(redirect_uri);
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('state', state);
        return Response.redirect(redirect.toString(), 302);
    }

    return new Response('Method not allowed', { status: 405 });
}

export async function handleGoogleToken(request, env) {
    const form = await request.formData();
    const grant_type = form.get('grant_type');

    if (grant_type === 'authorization_code') {
        const code = form.get('code');
        const valid = await env.TOKENS.get(`google:authcode:${code}`);
        if (!valid) return new Response(JSON.stringify({ error: 'invalid_grant' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } });
        await env.TOKENS.delete(`google:authcode:${code}`);

        const access_token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const refresh_token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        await env.TOKENS.put(`google:access:${access_token}`, 'valid', { expirationTtl: 3600 });
        await env.TOKENS.put(`google:refresh:${refresh_token}`, 'valid');

        return new Response(JSON.stringify({
            token_type: 'Bearer',
            access_token,
            refresh_token,
            expires_in: 3600
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (grant_type === 'refresh_token') {
        const refresh_token = form.get('refresh_token');
        const valid = await env.TOKENS.get(`google:refresh:${refresh_token}`);
        if (!valid) return new Response(JSON.stringify({ error: 'invalid_grant' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } });

        const access_token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        await env.TOKENS.put(`google:access:${access_token}`, 'valid', { expirationTtl: 3600 });
        return new Response(JSON.stringify({
            token_type: 'Bearer',
            access_token,
            expires_in: 3600
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unsupported_grant_type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
}

export async function verifyGoogleBearer(request, env) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return false;
    return !!(await env.TOKENS.get(`google:access:${token}`));
}

// ── Tesla session setup (store refresh_token + vehicle_id) ───

export async function handleSetup(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tesla Worker Setup</title>
<style>body{font-family:system-ui;max-width:500px;margin:40px auto;padding:20px}
input,textarea{width:100%;padding:10px;margin:6px 0;box-sizing:border-box;font-family:monospace;font-size:13px}
button{width:100%;padding:12px;background:#cc0000;color:#fff;border:0;font-size:16px;cursor:pointer;border-radius:6px;margin-top:10px}
label{font-weight:600;font-size:14px;margin-top:12px;display:block}
small{color:#666;display:block;margin-top:4px}</style></head><body>
<h2>Tesla Worker Setup</h2>
<p>Store your Tesla refresh token so Google Home can use it.</p>
<form method="POST">
  <label>Setup password <small>(the SETUP_PASSWORD secret)</small></label>
  <input type="password" name="setup_password" required autofocus>
  <label>Tesla refresh_token <small>(from localStorage in your PWA: key <code>tesla_refresh_token</code>)</small></label>
  <textarea name="refresh_token" rows="3" required></textarea>
  <label>Tesla access_token <small>(from localStorage: <code>tesla_access_token</code>)</small></label>
  <textarea name="access_token" rows="3" required></textarea>
  <label>Vehicle ID <small>(the long numeric id, from <code>selectedVehicleId</code> in localStorage)</small></label>
  <input type="text" name="vehicle_id" required>
  <button type="submit">Save</button>
</form></body></html>`;
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (request.method === 'POST') {
        const form = await request.formData();
        if (!env.SETUP_PASSWORD || form.get('setup_password') !== env.SETUP_PASSWORD) {
            return new Response('Invalid password', { status: 401 });
        }
        const session = {
            refresh_token: form.get('refresh_token'),
            access_token: form.get('access_token'),
            vehicle_id: form.get('vehicle_id'),
            expires_at: Date.now() + 8 * 60 * 60 * 1000  // assume ~8h, will auto-refresh
        };
        await env.TOKENS.put('tesla:session', JSON.stringify(session));
        return new Response('<h2>✓ Saved</h2><p>Tesla session stored. You can now link Google Home.</p>',
            { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response('Method not allowed', { status: 405 });
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
