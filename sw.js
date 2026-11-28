/* =====================================================================
   Version අංක තිබෙන්නේ මෙම ගොනුවේ පමණයි.
   index.html, script.js, feedback.js තුළ ?v= අංක යෙදීම අවශ්‍ය නැත.

   ① index.html / script.js / styles.css / feedback.js වැනි ඕනෑම ගොනුවක්
      වෙනස් කළ සෑම වාරයකම  →  APP_VERSION එක පමණක් වැඩි කරන්න.
   ② විශාල දත්ත ගොනු (zip)  →  කිසිවක් කිරීමට අවශ්‍ය නැත.
      DATA_FILES හි අගයන් එක් එක් zip ගොනුවේ අන්තර්ගතයේ hash එකයි. zip එකක් main
      වෙත push කළ විට GitHub Action එක (.github/workflows/data-version.yml) එය
      ගණනය කර මෙහි ලියයි — අතින් වෙනස් නොකරන්න. (වෙනස් වූ zip එක පමණක් නැවත
      බාගත වේ; ශබ්දකෝෂ දත්ත script.js විසින් ස්වයංක්‍රීයව නැවත පූරණය කරයි.)
      zip එකක් push කළ පසු එම Action එක sw.js commit එකක් යවන නිසා, ඊළඟ push
      එකට පෙර  git pull --rebase  කරන්න.
   ===================================================================== */
const APP_VERSION = '4.66';

const DATA_FILES = {
  'dictionary.zip': 'd520670b69',
  'sinhala_english.zip': 'db0c04d15b',
  'inflections.zip': 'd0d9f732d6'
};
/* ===================================================================== */

// v4.64 දක්වා DATA_FILES හි තිබුණේ අතින් ලියූ අංක. පහත ගොනු දෙක එදා සිට වෙනස් වී නැති නිසා,
// එම පරණ අංකයෙන් සුරැකි පිටපත (hash එක තවමත් සමාන නම් පමණක්) නැවත බාගත නොකර භාවිත කරයි.
const LEGACY_DATA = {
  'sinhala_english.zip': { v: '4', hash: 'db0c04d15b' },
  'inflections.zip': { v: '1', hash: 'd0d9f732d6' }
};

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

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject('timeout'), ms || TIMEOUT_MS);
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

// SW එකෙන් දෙන කේත ගොනු (html/js/css) — GitHub Pages හි "max-age=600" header එක නිසා browser එක
// (එකම ටැබය / ඇප් එක තුළ) reload කළ විටත් විනාඩි 10 ක් පරණ script.js / styles.css මතකයේ
// තබාගෙන SW එකෙන් නොඉල්ලයි. එබැවින් "no-cache" ලෙස වෙනස් කර දෙයි — සෑම reload එකකදීම
// SW එකෙන් ඉල්ලයි (SW cache එකෙන්ම ලැබෙන නිසා offline / දත්ත වැය මත බලපෑමක් නැත).
function noStore(res) {
  if (!res || res.type === 'opaque' || res.type === 'opaqueredirect') return res;
  const h = new Headers(res.headers);
  h.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
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

// එම ගොනුවේ දැනට වලංගු version අගයන් (hash එක + අන්තර්ගතය සමාන පරණ අංකය)
function validVersions(file) {
  const vs = [String(DATA_FILES[file])];
  const legacy = LEGACY_DATA[file];
  if (legacy && legacy.hash === DATA_FILES[file]) vs.push(legacy.v);
  return vs;
}

// පරණ code cache වල (v4.34 දක්වා zip තිබුණේ එහිය) සහ DATA_CACHE හි (පරණ අංකයෙන්)
// එම අන්තර්ගතයම ඇති පිටපතක් සොයයි
async function findOldCopy(file) {
  const ok = validVersions(file);
  const names = (await caches.keys()).filter((k) => k.startsWith('pali-sin-dict-') || k === DATA_CACHE);
  for (const name of names) {
    const c = await caches.open(name);
    for (const req of await c.keys()) {
      if (dataFileOf(req.url) !== file) continue;
      const oldV = new URL(req.url).searchParams.get('v') || '1';
      if (!ok.includes(String(oldV))) continue;
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
            // no-cache: browser HTTP cache එකේ (GitHub Pages — විනාඩි 10 ක්) ඇති පරණ index.html නොගෙන
            // server එකෙන් තහවුරු කරයි (නොවෙනස් නම් 304 — bytes කිහිපයක් පමණි)
            const net = await fetchWithTimeout(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, net.clone());
            return noStore(net);
          } catch(e) {
            const cached = await caches.match('./index.html', { ignoreSearch: true });
            return cached ? noStore(cached) : fetch(req);
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
          return noStore(cached);
        }
        try {
          return noStore(await network);
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
