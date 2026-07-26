const CACHE_NAME = 'pali-sin-dict-v2';

const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json?v=1',
  './dictionary.csv?v=1',
  './sinhala_english.csv?v=1',
  './icon-192x192.png?v=1',
  './icon-512x512.png?v=1'
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

  // HTML page
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html')
        .then((cachedPage) => {
          return cachedPage || fetch(req);
        })
    );
    return;
  }

  // අනෙක් සියලුම files
  event.respondWith(
    caches.match(req).then((cachedResponse) => {

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
