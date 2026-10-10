const CACHE_NAME = 'pali-sin-dict-v4.26'; // v4.26: install වේගවත් කිරීම (විශාල zip files පසුබිමින් cache වේ)

// 1) අනිවාර්ය app shell — මේවා නැතිව SW install නොවේ (කුඩා files පමණි)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './script.js',
  './styles.css',
  './icon-192x192.png?v=3',
  './icon-512x512.png?v=3'
];

// 2) කුඩා, නමුත් එකක් නැතිවුණත් SW install අසාර්ථක නොවිය යුතු files
const OPTIONAL_ASSETS = [
  './fflate.min.js?v=1',
  './feedback.js?v=1',
  './AbhayaLibre-Regular.ttf?v=1'
];

// 3) විශාල දත්ත files — install අවහිර නොකර පසුබිමින් cache කරයි
const BIG_ASSETS = [
  './dictionary.zip',
  './sinhala_english.zip?v=4',
  './inflections.zip?v=1'
];

function warmBigAssets() {
  return caches.open(CACHE_NAME).then((cache) =>
    Promise.allSettled(
      BIG_ASSETS.map(async (url) => {
        const hit = await cache.match(url, { ignoreSearch: true });
        if (!hit) await cache.add(url);
      })
    )
  );
}

// INSTALL
self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.allSettled(OPTIONAL_ASSETS.map((u) => cache.add(u)));
    })
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
     .then(() => {
       // ❗ await නොකරයි — activation (සහ install prompt) ප්‍රමාද නොවීමට
       warmBigAssets();
     })
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
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, clone);
            });
          }
          return response;
        })
        .catch(() => {
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
