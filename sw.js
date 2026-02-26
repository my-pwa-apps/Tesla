const CACHE = 'tesla-dash-v3';
const STATIC = [
    '/',
    '/index.html',
    '/app.js',
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
        url.hostname.includes('nominatim')) {
        return; // fall through to network
    }

    e.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(resp => {
                if (resp && resp.status === 200 && request.method === 'GET') {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(request, clone));
                }
                return resp;
            }).catch(() => cached); // offline fallback to cache
        })
    );
});
