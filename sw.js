const CACHE_NAME = 'pali-sin-dict-v4.32'; // v4.26: install වේගවත් කිරීම (විශාල zip files පසුබිමින් cache වේ)

// 1) අනිවාර්ය app shell
const CORE_ASSETS = [
  './', './index.html', './manifest.json', './script.js', './styles.css',
  './icon-192x192.png?v=4', './icon-512x512.png?v=4'
];

// 2) කුඩා, නමුත් එකක් නැතිවුණත් SW install අසාර්ථක නොවිය යුතු files
const OPTIONAL_ASSETS = [
  './fflate.min.js?v=1', './feedback.js?v=1', './AbhayaLibre-Regular.ttf?v=1'
];

// 3) විශාල දත්ත files
const BIG_ASSETS = [
  './dictionary.zip', './sinhala_english.zip?v=4', './inflections.zip?v=1'
];

const TIMEOUT_MS = 3500;

function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject('timeout'), TIMEOUT_MS);
    fetch(request).then(response => {
      clearTimeout(timer);
      if (!response.ok) return reject('not-ok');
      // JS/CSS/ZIP ඉල්ලද්දි HTML ආවොත් ඒක operator ගේ fake page එක
      const ct = response.headers.get('content-type') || '';
      const isZip = request.url.includes('.zip');
      if ((request.destination === 'script' || request.destination === 'style' || isZip) && ct.includes('text/html')) {
        return reject('fake-html');
      }
      resolve(response);
    }).catch(reject);
  });
}

function warmBigAssets() {
  return caches.open(CACHE_NAME).then((cache) =>
    Promise.allSettled(
      BIG_ASSETS.map(async (url) => {
        try {
          const hit = await cache.match(url, { ignoreSearch: true });
          if (!hit) {
            const res = await fetchWithTimeout(new Request(url, {cache: 'reload'}));
            await cache.put(url, res);
          }
        } catch(e) {
          console.warn('[SW] Big asset background cache failed:', url, e);
        }
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
          if (key.startsWith('pali-sin-dict-') && key !== CACHE_NAME) {
            console.log('[SW] Deleting old:', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
     .then(() => {
       warmBigAssets(); // await නොකරයි - prompt එක ප්‍රමාද නොවීමට
     })
  );
});

// FETCH
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.url.includes('googletagmanager.com') || req.url.includes('google-analytics.com')) return;
  if (req.method !== 'GET') return;

  // ============================================================
  // HTML page navigation - Network First with Timeout
  // ============================================================
  if (req.mode === 'navigate') {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path.endsWith('/') || path.endsWith('/index.html')) {
      event.respondWith(
        (async () => {
          try {
            const net = await fetchWithTimeout(req);
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, net.clone());
            return net;
          } catch(e) {
            return (await caches.match('./index.html', { ignoreSearch: true })) || fetch(req);
          }
        })()
      );
      return;
    }

    event.respondWith(
      (async () => {
        try {
          const response = await fetchWithTimeout(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, response.clone());
          return response;
        } catch(e) {
          console.warn('[SW] Offline nav:', e);
          return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html'));
        }
      })()
    );
    return;
  }

  // ============================================================
  // අනෙක් සියල්ල - Cache First (Zero-Data වලට හොඳම)
  // ============================================================
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(req, { ignoreSearch: true });
      if (cachedResponse) {
        return cachedResponse; // Data නැතත් තියෙනවා නම් මේකෙන්ම දෙනවා
      }
      try {
        const networkResponse = await fetchWithTimeout(req);
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return networkResponse;
      } catch (e) {
        console.warn('[SW] Offline asset:', req.url, e);
        // ZIP file එකක් offline නම් 503 දෙනවා වෙනුවට පැහැදිලිව
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
