// =============================================================================
// PlumbTix — Service Worker (v2)
// =============================================================================
// v2 SECURITY CHANGE: API responses (Supabase REST + Edge Functions) are no
// longer cached. v1 stored ticket data — names, addresses, unit numbers — in
// the browser's Cache API, where it survived logout on shared/lost devices.
// API traffic is now network-only. The cache holds only the app shell and
// hashed static assets.
//
// The CACHE_NAME bump to v2 makes the activate handler delete the old
// 'plumbtix-v1' cache (and any cached ticket data in it) on every existing
// user's next visit — retroactive cleanup, no user action needed.
// =============================================================================

const CACHE_NAME = 'plumbtix-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches (including v1 with its cached API data)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
//   API (Supabase REST / Edge Functions) → network only, NEVER cached
//   Hashed static assets (/assets/*)     → cache-first
//   HTML navigation                      → network-first, offline shell fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls: pass straight through to the network. No cache.put, no cache
  // fallback — authenticated data must never persist in the Cache API.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/functions/v1/')) {
    return; // default browser fetch, untouched by the SW
  }

  // Static assets: Cache-First (Vite hashes filenames, safe forever)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        });
      })
    );
    return;
  }

  // HTML pages: Network-First with offline fallback to the app shell
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }
});