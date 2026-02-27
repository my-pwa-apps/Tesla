const CACHE = 'tesla-dash-v7';
const STATIC = [
    '/',
    '/index.html',
    '/app.js?v=6',
    '/i18n.js',
    '/styles.css',
    '/manifest.json',
    '/favicon.svg',
    '/icon-192.svg',
    '/icon-512.svg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// App shell resources — always fetch from network first to get latest version
const APP_SHELL = new Set(['/', '/index.html', '/app.js', '/i18n.js', '/styles.css']);

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(STATIC).catch(() => {})) // non-fatal if external CDN fails
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    // Never intercept API calls or auth endpoints
    if (url.hostname.includes('tesla.com') ||
        url.hostname.includes('vercel.app') ||
        url.hostname.includes('overpass-api.de') ||
        url.hostname.includes('openstreetmap.org') ||
        url.hostname.includes('osrm.org') ||
        url.hostname.includes('nominatim') ||
        url.hostname.includes('open-meteo.com')) {
        return; // fall through to network
    }

    // Network-first for app shell (HTML/JS/CSS) — ensures fresh deploys arrive quickly
    const pathname = url.pathname.replace(/\?.*$/, ''); // strip query string for matching
    if (APP_SHELL.has(pathname)) {
        e.respondWith(
            fetch(request).then(resp => {
                if (resp && resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(request, clone));
                }
                return resp;
            }).catch(() => caches.match(request)) // offline → serve from cache
        );
        return;
    }

    // Cache-first for static assets (fonts, icons, leaflet)
    e.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(resp => {
                if (resp && resp.status === 200 && request.method === 'GET') {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(request, clone));
                }
                return resp;
            });
        })
    );
});
