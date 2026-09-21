const CACHE_NAME = 'pali-sin-dict-v4.12'; // v4.9: navigation fallback fix (feedback.html සේවය කිරීම)

const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './dictionary.zip',
  './sinhala_english.zip',
  './inflections.zip',
  './inflections-worker.js',
  './fflate.min.js',
  './feedback.html',
  './AbhayaLibre-Regular.ttf',
  './icon-192x192.png',
  './icon-512x512.png'
];

// INSTALL
self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_ASSETS))
  );
});

// ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Google Analytics මඟ හරින්න
  if (
    req.url.includes('googletagmanager.com') ||
    req.url.includes('google-analytics.com')
  ) {
    return;
  }

  // GET requests පමණක්
  if (req.method !== 'GET') {
    return;
  }

  // ============================================================
  // HTML page navigation
  // ============================================================
  if (req.mode === 'navigate') {
    const url = new URL(req.url);
    const path = url.pathname;

    // feedback.html ඉල්ලූ විට එයම ලබා දෙන්න
    if (path.endsWith('/feedback.html') || path.endsWith('feedback.html')) {
      event.respondWith(
        caches.match('./feedback.html', { ignoreSearch: true })
          .then((cached) => cached || fetch(req).catch(() => caches.match('./feedback.html')))
      );
      return;
    }

    // Root (/) හෝ index.html ඉල්ලූ විට index.html ලබා දෙන්න
    if (path.endsWith('/') || path.endsWith('/index.html')) {
      event.respondWith(
        caches.match('./index.html', { ignoreSearch: true })
          .then((cached) => cached || fetch(req))
      );
      return;
    }

    // අනෙක් ඕනෑම navigation — Network first, fallback to cache, fallback to index
    event.respondWith(
      fetch(req)
        .then((response) => {
          // සාර්ථක response එකක් නම් cache කරන්න
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network fail නම් cache එකෙන් සොයන්න
          return caches.match(req, { ignoreSearch: true })
            .then((cached) => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // ============================================================
  // අනෙක් සියලුම files (Query params නොසලකා හරිමින් cache සෙවීම)
  // ============================================================
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {

      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {

        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone);
          });
        }

        return networkResponse;

      }).catch(() => {
        return new Response('Offline', {
          status: 503,
          statusText: 'Offline'
        });
      });

    })
  );
});
