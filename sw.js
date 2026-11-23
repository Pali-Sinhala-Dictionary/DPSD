/* =====================================================================
   Version අංක තිබෙන්නේ මෙම ගොනුවේ පමණයි.
   index.html, script.js, feedback.js තුළ ?v= අංක යෙදීම අවශ්‍ය නැත.

   ① index.html / script.js / styles.css / feedback.js වැනි ඕනෑම ගොනුවක්
      වෙනස් කළ සෑම වාරයකම  →  APP_VERSION එක පමණක් වැඩි කරන්න.
   ② විශාල දත්ත ගොනුවක් (zip) වෙනස් කළ විට  →  DATA_FILES හි එම ගොනුවේ
      අංකය පමණක් වැඩි කරන්න. (අනෙක් zip ගොනු නැවත බාගත නොවේ;
      ශබ්දකෝෂ දත්ත script.js විසින් ස්වයංක්‍රීයව නැවත පූරණය කරයි.)
   ===================================================================== */
const APP_VERSION = '4.45';

const DATA_FILES = {
  'dictionary.zip': 4,
  'sinhala_english.zip': 4,
  'inflections.zip': 1
};
/* ===================================================================== */

const CACHE_NAME = 'pali-sin-dict-v' + APP_VERSION;   // කේතය (app shell)
const DATA_CACHE = 'pali-sin-data';                   // විශාල zip — APP_VERSION වෙනස් වුවත් රැඳේ

// 1) අනිවාර්ය app shell
const CORE_ASSETS = [
  './', './index.html', './manifest.json', './script.js', './styles.css',
  './icon-192x192.png', './icon-512x512.png'
];

// 2) කුඩා, නමුත් එකක් නැතිවුණත් SW install අසාර්ථක නොවිය යුතු files
const OPTIONAL_ASSETS = [
  './fflate.min.js', './feedback.js', './AbhayaLibre-Regular.ttf'
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
      const isCode = /\.(js|css)(\?|$)/.test(request.url);
      if ((request.destination === 'script' || request.destination === 'style' || isZip || isCode) && ct.includes('text/html')) {
        return reject('fake-html');
      }
      resolve(response);
    }).catch(reject);
  });
}

// ---------------------------------------------------------------------
// විශාල දත්ත ගොනු
// ---------------------------------------------------------------------
const fileUrl = (file) => new URL(file, self.location.href).href;
const dataKey = (file) => fileUrl(file) + '?v=' + DATA_FILES[file];

// ඉල්ලීම DATA_FILES හි ඇති ගොනුවක් නම් එහි නම, නැතිනම් null
function dataFileOf(url) {
  const u = new URL(url);
  if (u.origin !== self.location.origin) return null;
  const name = u.pathname.split('/').pop();
  return Object.prototype.hasOwnProperty.call(DATA_FILES, name) ? name : null;
}

// එකම ගොනුවේ පරණ version සහ දැන් භාවිත නොවන ගොනු ඉවත් කරයි
async function pruneData(cache) {
  const keep = new Set(Object.keys(DATA_FILES).map(dataKey));
  for (const req of await cache.keys()) {
    if (keep.has(req.url)) continue;
    const name = dataFileOf(req.url);
    // අලුත් version එක ලැබී ඇත්නම් හෝ ගොනුව ලැයිස්තුවේ නැත්නම් පමණක් මකයි
    if (!name || await cache.match(dataKey(name))) await cache.delete(req);
  }
}

// පරණ code cache වල (v4.34 දක්වා zip තිබුණේ එහිය) එම version අංකයම ඇති පිටපතක් සොයයි
async function findOldCopy(file) {
  const names = (await caches.keys()).filter((k) => k.startsWith('pali-sin-dict-'));
  for (const name of names) {
    const c = await caches.open(name);
    for (const req of await c.keys()) {
      if (dataFileOf(req.url) !== file) continue;
      const oldV = new URL(req.url).searchParams.get('v') || '1';
      if (String(oldV) !== String(DATA_FILES[file])) continue;
      const res = await c.match(req);
      if (res && res.ok) return res;
    }
  }
  return null;
}

async function serveData(file) {
  const cache = await caches.open(DATA_CACHE);
  const key = dataKey(file);
  const hit = await cache.match(key);
  if (hit) return hit;
  // update එක අතරතුර ඉල්ලුවොත් — පරණ cache එකේ ඇති එම version එකම භාවිත කරයි (නැවත බාගත නොකර)
  const old = await findOldCopy(file);
  if (old) {
    await cache.put(key, old.clone());
    return old;
  }
  try {
    const res = await fetchWithTimeout(new Request(key, { cache: 'reload' }));
    cache.put(key, res.clone()).then(() => pruneData(cache)).catch(() => {});
    return res;
  } catch (e) {
    // offline — අලුත් version එක නැත්නම් පරණ එක හෝ දෙයි
    const old = await cache.match(fileUrl(file), { ignoreSearch: true });
    return old || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// පසුබිමින් සියලු දත්ත ගොනු cache කරයි (දැනටමත් ඇති ඒවා නැවත බාගත නොකරයි)
async function warmData() {
  const cache = await caches.open(DATA_CACHE);
  await Promise.allSettled(Object.keys(DATA_FILES).map(async (file) => {
    const key = dataKey(file);
    try {
      if (await cache.match(key)) return;
      const res = await fetchWithTimeout(new Request(key, { cache: 'reload' }));
      await cache.put(key, res);
    } catch (e) {
      console.warn('[SW] Data background cache failed:', file, e);
    }
  }));
  await pruneData(cache);
}

// v4.34 දක්වා zip ගොනු තිබුණේ code cache එකේමයි. ඒවා මකා දැමීමට පෙර,
// version අංකය සමාන නම් DATA_CACHE වෙත පිටපත් කරයි (නැවත ~MB ගණනක් බාගත නොවීමට).
async function migrateOldData() {
  const data = await caches.open(DATA_CACHE);
  for (const file of Object.keys(DATA_FILES)) {
    const key = dataKey(file);
    if (await data.match(key)) continue;
    const res = await findOldCopy(file);
    if (res) await data.put(key, res);
  }
}

// ---------------------------------------------------------------------
// INSTALL
// ---------------------------------------------------------------------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // cache: 'reload' — browser HTTP cache එකේ ඇති පරණ ගොනු නොගෙන server එකෙන්ම අලුත් ඒවා ගනී
      await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' })));
      await Promise.allSettled(OPTIONAL_ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    })
  );
});

// ---------------------------------------------------------------------
// ACTIVATE
// ---------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k.startsWith('pali-sin-dict-') && k !== CACHE_NAME);
    try { await migrateOldData(); } catch (e) { console.warn('[SW] Data migrate failed:', e); }
    await Promise.all(old.map((k) => { console.log('[SW] Deleting old:', k); return caches.delete(k); }));
    await self.clients.claim();
    warmData(); // await නොකරයි - prompt එක ප්‍රමාද නොවීමට
  })());
});

// ---------------------------------------------------------------------
// FETCH
// ---------------------------------------------------------------------
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
  // විශාල දත්ත ගොනු (zip) - DATA_FILES හි version අනුව Cache First
  // ============================================================
  const dataFile = dataFileOf(req.url);
  if (dataFile) {
    event.respondWith(serveData(dataFile));
    return;
  }

  // ============================================================
  // JS / CSS (මෙම අඩවියේම) - Stale-While-Revalidate
  //   • cache එකේ ඇති ගොනුව වහාම දී, පසුබිමින් අලුත් කරයි
  //     (APP_VERSION වැඩි කිරීමට අමතක වුණත් ඊළඟ වර විවෘත කරනවිට අලුත් ගොනුව ලැබේ)
  //   • APP_VERSION වැඩි කළ විට install අවස්ථාවේදීම සියල්ල අලුතින් බාගනී
  // ============================================================
  const reqUrl = new URL(req.url);
  if (reqUrl.origin === self.location.origin && /\.(js|css)$/.test(reqUrl.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetchWithTimeout(new Request(reqUrl.origin + reqUrl.pathname, { cache: 'no-cache' }))
          .then((res) => cache.put(reqUrl.origin + reqUrl.pathname, res.clone()).then(() => res));
        if (cached) {
          event.waitUntil(network.catch(() => {}));
          return cached;
        }
        try {
          return await network;
        } catch (e) {
          return new Response('Offline', { status: 503, statusText: 'Offline' });
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
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
