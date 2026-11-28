// සියලු ශබ්දකෝෂ Configuration (Oxford Dictionary ඉවත් කර ඇත)
let availableDicts = [
    { id: 'pali', name: 'පාලි - සිංහල ශබ්දකෝෂය', path: 'dictionary.zip', enabled: true, data: [], _loaded: false },
    { id: 'sien', name: 'සිංහල - ඉංග්‍රීසි ශබ්දකෝෂය', path: 'sinhala_english.zip', enabled: true, data: [], _loaded: false }
];

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const suggestionsBox = document.getElementById('suggestionsBox');
const resultsContainer = document.getElementById('resultsContainer');
const initialMessage = document.getElementById('initialMessage');

// --- Android (Capacitor) / Windows (Tauri) ඇප් එක ඇතුළේ පමණක් — වෙබ් අඩවියට කිසිදු බලපෑමක් නැත ---
function isNativeApp() {
    try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) { return false; }
}
function isDesktopApp() { return !!(window.__TAURI__ && window.__TAURI__.core); }
// Android ඇප් එක: ඉහළ තීරුව ශීර්ෂයේ වර්ණයට, පහළ තීරුව පහළ මෙනුවේ වර්ණයට (ආලෝක / අඳුරු තේමාව අනුව)
function syncAppBars() {
    if (!isNativeApp()) return;
    const AB = Capacitor.Plugins && Capacitor.Plugins.AppBars; if (!AB) return;
    const dark = document.body.classList.contains('dark-theme');
    const c = dark ? { top: '#211B40', bottom: '#141725', page: '#090909', lightTopIcons: true, lightBottomIcons: true }
                   : { top: '#861410', bottom: '#F9EFDB', page: '#F5F1EA', lightTopIcons: true, lightBottomIcons: false };
    try { AB.setColors(c).catch(function () {}); } catch (e) {}
}
// බාහිර සබැඳියක් විවෘත කරයි: Windows → පරිගණකයේ browser එක; Android / වෙබ් → සාමාන්‍ය ලෙස
function openExternalUrl(url) {
    if (isDesktopApp()) {
        window.__TAURI__.core.invoke('open_url', { url: url }).catch(function (err) { console.error('open_url:', err); });
    } else if (isNativeApp()) {
        window.location.href = url;          // Capacitor බාහිර සබැඳි පද්ධතියේ browser එකේ විවෘත කරයි
    } else {
        window.open(url, '_blank', 'noopener');
    }
}
// Windows ඇප් එක: බාහිර සබැඳි (වෙබ් අඩවි, mailto) පරිගණකයේ browser එකේ විවෘත කරයි
if (isDesktopApp()) {
    document.addEventListener('click', function (e) {
        const a = e.target.closest ? e.target.closest('a[href]') : null; if (!a) return;
        const href = a.href || '';
        if (/^(https?:|mailto:)/i.test(href) && !href.startsWith(location.origin)) {
            e.preventDefault(); e.stopImmediatePropagation();
            openExternalUrl(href);
        }
    }, true);
}

// --- Restore saved theme preference (runs immediately, before first paint settles) ---
(function restoreTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.setAttribute('href', '#icon-sun');
    }
    syncAppBars();
})();

// --- Container zoom = (පරිශීලකයාගේ අකුරු ප්‍රමාණ සැකසුම) × (තිරයට ස්වයංක්‍රීය ගැළපීම) ---
// පළල 1100px ට වැඩි තිර (landscape tab / පරිගණක) වල අකුරු සහ අංග කුඩා නොපෙනීමට, තිරයේ පළලට
// සමානුපාතිකව ස්වයංක්‍රීයව විශාල කරයි (උපරිම ×1.8). ප්‍රධාන කොටසේ පළල CSS මගින් තිරයේ
// සම්පූර්ණ පළලටම ගනී. දුරකථන සහ portrait tab වල (≤1100px) අකුරු ප්‍රමාණයේ වෙනසක් නැත.
// Zoom panel එකේ 100% යනු "ඒ තිරයට ගැළපෙන ප්‍රමාණය" වේ.
let currentUserZoom = localStorage.getItem('zoomLevel') || '100';

function getAutoFitScale() {
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    return Math.min(1.8, Math.max(1, w / 1100));
}

function applyContainerZoom(userPercent) {
    const target = document.querySelector('.container');
    if (!target) return;
    const user = parseFloat(userPercent);
    const factor = (isNaN(user) ? 100 : user) / 100 * getAutoFitScale();
    target.style.zoom = (factor * 100).toFixed(1) + '%';
    // CSS හි min-height ගණනය සඳහා (zoom මගින් 100vh ද ගුණ වන නිසා)
    target.style.setProperty('--container-zoom', factor.toFixed(3));
    // Fit to page: පහළ nav bar, zoom panel, install banner, feedback card වැනි
    // ප්‍රධාන layout එකේ අනෙක් කොටස් ද එම ගැළපීමේ අනුපාතයෙන්ම විශාල වේ
    // (පරිශීලක අකුරු සැකසුම ඒවාට අදාළ නොවේ).
    document.documentElement.style.setProperty('--fit', getAutoFitScale().toFixed(3));
}

// --- Restore saved zoom / text-size preference (runs immediately, before first paint settles) ---
(function restoreZoom() {
    applyContainerZoom(currentUserZoom);
})();

// තිරයේ ප්‍රමාණය වෙනස් වූ විට (කවුළුව ප්‍රමාණය වෙනස් කිරීම, tab භ්‍රමණය) නැවත ගැළපෙයි
(function watchScreenSize() {
    let timer;
    const refit = () => {
        clearTimeout(timer);
        timer = setTimeout(() => applyContainerZoom(currentUserZoom), 120);
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
})();

// ================================================================
// Streaming-aware dictionary loader
// ================================================================
let dictLoadState = null;

function loadAllActiveDicts() {
    const activeDicts = availableDicts.filter(d => d.enabled);
    if (activeDicts.length === 0) {
        searchInput.disabled = true;
        searchBtn.disabled = true;
        initialMessage.innerText = "කරුණාකර අවම වශයෙන් එක් ශබ්දකෝෂයක්වත් තෝරන්න.";
        return;
    }

    dictLoadState = {
        total: activeDicts.length,
        done: 0,
        anyDataYet: false,
        bytesLoaded: 0,
        bytesTotal: 0,
        activeDicts: activeDicts.slice(),
        failedPaths: []
    };

    activeDicts.forEach(dict => {
        if (dict.data && dict.data.length > 0 && dict._loaded) {
            dictLoadState.done++;
            dictLoadState.anyDataYet = true;
            if (dictLoadState.done === dictLoadState.total) onAllDictsLoaded();
            return;
        }
        dict.data = [];
        dict._loaded = false;
        startDictLoad(dict);
    });
}

// ================================================================
// IndexedDB cache — parse කළ ශබ්දකෝෂ දත්ත
// ----------------------------------------------------------------
// පළමු වරට zip → CSV → parse කළ පසු ප්‍රතිඵලය මෙහි සුරකී. ඊළඟ විවෘත කිරීම් වලදී
// zip බාගැනීම / unzip / CSV parse යන සියල්ල මඟහැර කෙලින්ම කියවයි.
//
// ශබ්දකෝෂ ගොනුව (dictionary.zip, sinhala_english.zip) වෙනස් වූ බව ස්වයංක්‍රීයව හඳුනාගනී:
//   zip ගොනුවේ ETag / Last-Modified / ප්‍රමාණය (dataFingerprint) වෙනස් වූ විට cache එක
//   නැවත ගොඩනඟයි. ඔබට කළ යුත්තේ sw.js හි DATA_FILES අංකය වැඩි කිරීම පමණයි.
// ⚠ buildItemFromRow() / detectHeaderMap() වෙනස් කළ විට PARSER_VERSION වැඩි කරන්න.
// ================================================================
const DictCache = (function () {
    const DB_NAME = 'dict-parsed-cache';
    const DB_VERSION = 1;
    const CHUNKS = 'chunks';          // key: `${dictId}|${version}|${n}`  → JSON string (පේළි CHUNK_ROWS ක්)
    const META = 'meta';              // key: dictId → { version, chunks, count, bytes, complete }
    const CHUNK_ROWS = 3000;
    const PARSER_VERSION = 1;

    let dbPromise = null;
    const saving = new Set();
    let persistAsked = false;

    const versionOf = (dict) => PARSER_VERSION + '.' + (dict._fp || 'unknown');
    const chunkKey = (id, ver, n) => id + '|' + ver + '|' + n;

    const reqP = (req) => new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
    const txDone = (tx) => new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
    const yieldToMain = () => new Promise(r => setTimeout(r, 0));
    const whenIdle = () => new Promise(resolve => {
        if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 3000 });
        else setTimeout(resolve, 60);
    });

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            let req;
            try { req = indexedDB.open(DB_NAME, DB_VERSION); }
            catch (e) { reject(e); return; }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
                if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
            };
            req.onsuccess = () => {
                const db = req.result;
                db.onversionchange = () => { db.close(); dbPromise = null; };
                resolve(db);
            };
            req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
            req.onblocked = () => reject(new Error('IndexedDB open blocked'));
        });
        dbPromise.catch(() => { dbPromise = null; });
        return dbPromise;
    }

    // cache එකෙන් කියවා onBatch(items) මඟින් කොටස් වශයෙන් ලබා දෙයි.
    // true  = cache hit (සම්පූර්ණයෙන් කියවා අවසන්)
    // false = cache miss (නැත / version නොගැළපේ) — network එකෙන් පූරණය කළ යුතුයි
    // throw = cache දූෂිතයි / කියවීම අසාර්ථකයි
    async function load(dict, onBatch, isCurrent) {
        const db = await open();
        const meta = await reqP(db.transaction(META, 'readonly').objectStore(META).get(dict.id));
        if (!meta || meta.complete !== true || !(meta.chunks > 0)) return false;
        // fingerprint එක ලබාගත නොහැකි වූ විට (offline, SW නැත) සුරැකි දත්තම භාවිත කරයි
        const ver = dict._fp ? versionOf(dict) : meta.version;
        if (meta.version !== ver || String(meta.version).split('.')[0] !== String(PARSER_VERSION)) return false;

        const getChunk = (n) => {
            const p = reqP(db.transaction(CHUNKS, 'readonly').objectStore(CHUNKS).get(chunkKey(dict.id, ver, n)));
            p.catch(() => {});   // early-exit වූ විට unhandled rejection නොපෙන්වීමට
            return p;
        };

        let total = 0;
        let next = getChunk(0);
        for (let n = 0; n < meta.chunks; n++) {
            const json = await next;
            next = (n + 1 < meta.chunks) ? getChunk(n + 1) : null;   // ඊළඟ chunk එක කලින් ඉල්ලයි
            if (isCurrent && !isCurrent()) return true;              // වෙනත් පූරණයක් මෙය ප්‍රතිස්ථාපනය කර ඇත
            if (typeof json !== 'string') throw new Error('cache chunk ' + n + ' missing');
            const items = JSON.parse(json);
            if (!Array.isArray(items)) throw new Error('cache chunk ' + n + ' invalid');
            onBatch(items);
            total += items.length;
            await yieldToMain();    // UI එකට හුස්ම ගැනීමට (ටයිප් කිරීම කොටන්නේ නැත)
        }
        if (total !== meta.count) throw new Error('cache row count mismatch (' + total + ' ≠ ' + meta.count + ')');
        return true;
    }

    // සම්පූර්ණයෙන් පූරණය වූ dict.data cache එකට ලියයි (පසුබිමේ, idle වේලාවල).
    // meta එක ලියන්නේ සියලු chunk ලියා අවසන් වූ පසු පමණයි — අතරමඟ නතර වුවහොත් cache එක භාවිත නොවේ.
    async function save(dict) {
        const data = dict.data;
        const total = data.length;
        if (!total) return false;
        const db = await open();
        const ver = versionOf(dict);

        {   // පරණ / අර්ධ දත්ත ඉවත් කිරීම
            const tx = db.transaction([CHUNKS, META], 'readwrite');
            tx.objectStore(META).delete(dict.id);
            tx.objectStore(CHUNKS).delete(IDBKeyRange.bound(dict.id + '|', dict.id + '|\uffff'));
            await txDone(tx);
        }

        let chunks = 0, bytes = 0;
        for (let start = 0; start < total; start += CHUNK_ROWS) {
            await whenIdle();
            if (dict.data !== data || data.length !== total) return false;   // මැද දී දත්ත වෙනස් විය
            const json = JSON.stringify(data.slice(start, start + CHUNK_ROWS));
            const tx = db.transaction(CHUNKS, 'readwrite');
            tx.objectStore(CHUNKS).put(json, chunkKey(dict.id, ver, chunks));
            await txDone(tx);
            chunks++;
            bytes += json.length;
        }

        const tx = db.transaction(META, 'readwrite');
        tx.objectStore(META).put({
            version: ver, chunks, count: total, bytes, complete: true, savedAt: Date.now()
        }, dict.id);
        await txDone(tx);
        return true;
    }

    async function clear(dictId) {
        try {
            const db = await open();
            const tx = db.transaction([CHUNKS, META], 'readwrite');
            tx.objectStore(META).delete(dictId);
            tx.objectStore(CHUNKS).delete(IDBKeyRange.bound(dictId + '|', dictId + '|\uffff'));
            await txDone(tx);
        } catch (e) { /* cache නොමැති නම් කිසිවක් කළ යුතු නැත */ }
    }

    // install කළ app (PWA / TWA) වලදී පමණක් — browser එකට දත්ත ස්වයංක්‍රීයව මැකීම වළක්වන්න.
    function requestPersistence() {
        if (persistAsked) return;
        persistAsked = true;
        try {
            const mm = (q) => window.matchMedia && window.matchMedia(q).matches;
            const installed = mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') ||
                              mm('(display-mode: minimal-ui)') || window.navigator.standalone === true;
            if (installed && navigator.storage && navigator.storage.persist) {
                navigator.storage.persist().catch(() => {});
            }
        } catch (e) { /* නොසලකන්න */ }
    }

    function saveLater(dict) {
        if (!dict.data || !dict.data.length) return;
        if (saving.has(dict.id)) return;
        saving.add(dict.id);
        save(dict)
            .then(ok => { if (ok) requestPersistence(); })
            .catch(err => {
                console.warn('Dictionary cache write failed:', err);
                return clear(dict.id);
            })
            .finally(() => saving.delete(dict.id));
    }

    return { load, saveLater, clear };
})();

// zip ගොනුවේ "අනන්‍යතාවය" (ETag / Last-Modified / ප්‍රමාණය).
// SW පාලනය කරන විට GET — SW cache එකේ ඇති, ඇත්තටම parse කරන ගොනුවේම headers ලැබේ
// (body එක කියවන්නේ නැත, එබැවින් ක්ෂණිකයි). SW නැත්නම් HEAD.
// ලබාගත නොහැකි නම් null.
async function dataFingerprint(path) {
    let timer = null;
    try {
        const controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
        const opts = { method: controlled ? 'GET' : 'HEAD' };
        if (typeof AbortController !== 'undefined') {
            const ctrl = new AbortController();
            opts.signal = ctrl.signal;
            timer = setTimeout(() => ctrl.abort(), 4000);
        }
        const res = await fetch(path, opts);
        if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
        if (!res.ok) return null;
        const h = res.headers;
        const fp = [h.get('etag'), h.get('last-modified'), h.get('content-length')].filter(Boolean).join('|');
        return fp || null;
    } catch (e) {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function startDictLoad(dict) {
    // මෙම පූරණයේ ටෝකනය: ශබ්දකෝෂ ඉක්මනින් ටොගල් කළ විට පැරණි පූරණයක ප්‍රතිඵල
    // එකම array එකට දෙවරක් එකතු වීම (duplicate ප්‍රතිඵල) වළක්වයි.
    const token = dict._loadToken = (dict._loadToken || 0) + 1;
    const isCurrent = () => dict._loadToken === token;
    let fromCache = false;

    const finishOne = () => {
        if (!isCurrent()) return;
        dict._loaded = true;
        if (dict.id === 'pali' || dict.id === 'sien') setTimeout(() => { try { updateDictStats(); } catch (e) { console.warn('stats:', e); } }, 0);
        dictLoadState.done++;
        updateDictLoadUI();
        if (dictLoadState.done === dictLoadState.total) onAllDictsLoaded();
        // network එකෙන් ලැබුණු දත්ත පමණක් පසුබිමේදී cache එකට සුරකී
        if (!fromCache) DictCache.saveLater(dict);
    };

    // cache එකෙන් සහ streaming loader එකෙන් ලැබෙන කොටස් දෙකටම පොදු
    const pushBatch = (items) => {
        if (!isCurrent()) return;
        for (let i = 0; i < items.length; i++) dict.data.push(items[i]);
        if (!dictLoadState.anyDataYet && dict.data.length > 0) {
            dictLoadState.anyDataYet = true;
        }
        updateDictLoadUI();
    };

    // බාගත වූ bytes ප්‍රමාණය (ප්‍රගති තීරුව සඳහා)
    const reportProgress = (loaded, total) => {
        if (!isCurrent()) return;
        const prevLoaded = dict._progressLoaded || 0;
        const prevTotal = dict._progressTotal || 0;
        dictLoadState.bytesLoaded += loaded - prevLoaded;
        dictLoadState.bytesTotal  += total  - prevTotal;
        dict._progressLoaded = loaded;
        dict._progressTotal = total;
        updateDictLoadUI();
    };

    const usePlainFetch = () => {
        fetchCSV(dict.path, (data) => {
            if (!isCurrent()) return;
            dict.data = data || [];
            if (dict.data.length > 0) dictLoadState.anyDataYet = true;
            finishOne();
        }, reportProgress);
    };

    const loadFromNetwork = () => {
        if (!isCurrent()) return;

        if (!/\.zip(\?.*)?$/i.test(dict.path)) {
            usePlainFetch();
            return;
        }

        let fellBack = false;
        const fallback = () => {
            if (fellBack) return;
            fellBack = true;
            dict.data = [];
            usePlainFetch();
        };

        const handle = fetchZippedCSVStreaming(dict.path, {
            onBatch: pushBatch,
            onProgress: reportProgress,
            onDone: finishOne,
            onUnsupported: fallback,
            onError: (err) => {
                console.warn('Streaming failed for ' + dict.path + ':', err);
                dictLoadState.failedPaths.push(dict.path);
                fallback();
            }
        });

        if (handle === null) fallback();
    };

    // 1) parse කළ දත්ත IndexedDB හි තිබේ නම් එය කෙලින්ම භාවිත කරන්න (ක්ෂණික)
    // 2) නැතිනම් / අසාර්ථක නම් කලින් පරිදිම zip බාගෙන parse කරන්න
    dataFingerprint(dict.path).then(fp => {
        dict._fp = fp;
        if (!isCurrent()) return false;
        return DictCache.load(dict, pushBatch, isCurrent);
    }).then(hit => {
        if (!isCurrent()) return;
        if (hit) {
            fromCache = true;
            finishOne();
        } else {
            loadFromNetwork();
        }
    }).catch(err => {
        if (!isCurrent()) return;
        console.warn('Dictionary cache unavailable, loading from network:', err);
        dict.data = [];
        DictCache.clear(dict.id);
        loadFromNetwork();
    });
}

function updateDictLoadUI() {
    // Splash screen එක පළමු batch එක ලැබුණු වහාම hide කිරීමට උත්සාහ කරයි
    if (dictLoadState && dictLoadState.anyDataYet && typeof window.__hideSplash === 'function') {
        window.__hideSplash();
    }

    if (!dictLoadState) return;

    // Search කොටුව ක්ෂණිකව සක්‍රීය කරන්න — මුල් batch එක ලැබුණු වහාම
    if (dictLoadState.anyDataYet && searchInput.disabled) {
        searchInput.disabled = false;
        searchBtn.disabled = false;
        searchInput.placeholder = "වචනයක් ඇතුළත් කරන්න...";
    }

    const allDone = dictLoadState.done === dictLoadState.total;

    if (allDone) {
        if (dictLoadState.failedPaths.length > 0 && !dictLoadState.anyDataYet) {
            searchInput.disabled = true;
            searchInput.placeholder = "දත්ත පූරණය අසාර්ථකයි";
            initialMessage.innerText = "පූරණය කළ නොහැකි විය: ";
        } else {
            // තීරුව 100% දක්වා පිරී, මොහොතකින් සෙවුම් පණිවිඩයට මාරු වේ
            renderLoadProgress(initialMessage, 100);
            setTimeout(() => {
                initialMessage.classList.remove('is-loading');
                initialMessage.innerText = "සිංහල වචනයකට අදාළ පාළි වචනය සෙවීම සඳහා සම්පූර්ණ සිංහල වචනය ඇතුලත් කර සෙවුම් බොත්තම ඔබන්න.";
            }, 450);
        }
    } else {
        renderLoadProgress(initialMessage, computeDictLoadPct());
    }
}

// සියලු ශබ්දකෝෂ වල එකතු බාගත ප්‍රතිශතය. කිසියම් ශබ්දකෝෂයක මුළු ප්‍රමාණය තවම
// නොදන්නේ නම් null (එවිට තීරුව "අවිනිශ්චිත" චලනයක් පෙන්වයි).
function computeDictLoadPct() {
    if (!dictLoadState) return null;
    let loaded = 0, total = 0;
    for (const d of dictLoadState.activeDicts) {
        const t = d._progressTotal || 0;
        if (t > 0) { loaded += d._loaded ? t : (d._progressLoaded || 0); total += t; }
        else if (!d._loaded) return null;
    }
    return total > 0 ? (loaded / total) * 100 : null;
}

// නිල් ප්‍රගති තීරුව + ප්‍රතිශතය (වචන නොමැතිව). pct = null → අවිනිශ්චිත චලනය
function renderLoadProgress(el, pct) {
    if (!el) return;
    el.classList.add('is-loading');
    let box = el.querySelector('.load-progress');
    if (!box) {
        el.innerHTML = '<div class="load-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="lp-pct"></div><div class="lp-track"><div class="lp-fill"></div></div></div>';
        box = el.querySelector('.load-progress');
    }
    const known = typeof pct === 'number' && isFinite(pct);
    box.classList.toggle('is-indeterminate', !known);
    const fill = box.querySelector('.lp-fill');
    const label = box.querySelector('.lp-pct');
    if (known) {
        const v = Math.max(0, Math.min(100, Math.floor(pct)));
        // තීරුව ආපසු නොයෑමට (ශබ්දකෝෂ කිහිපයක මුළු ප්‍රමාණය එකතු වන විට)
        const prev = parseInt(box.getAttribute('aria-valuenow') || '0', 10);
        const shown = Math.max(prev, v);
        box.setAttribute('aria-valuenow', String(shown));
        label.textContent = shown + '%';
        fill.style.width = shown + '%';
    } else {
        label.textContent = '';
        fill.style.width = '';
    }
}

// අලුත් අනුවාදයක් ලැබී page එක reload වන විට, එම මොහොතේ පෙන්වමින් තිබූ සෙවුම නැවත පෙන්වීමට
let lastSearch = null;
const RESTORE_SEARCH_KEY = 'psuRestoreSearch';
function rememberSearchForReload() {
    try {
        if (lastSearch && lastSearch.query) sessionStorage.setItem(RESTORE_SEARCH_KEY, JSON.stringify(lastSearch));
    } catch (e) {}
}
function restoreSearchAfterReload() {
    let saved = null;
    try {
        saved = JSON.parse(sessionStorage.getItem(RESTORE_SEARCH_KEY) || 'null');
        sessionStorage.removeItem(RESTORE_SEARCH_KEY);
    } catch (e) {}
    if (!saved || !saved.query || searchInput.value.trim()) return;
    searchInput.value = saved.query;
    performSearch(saved.query, !!saved.exactOnly);
}

function onAllDictsLoaded() {
    updateDictLoadUI();
    restoreSearchAfterReload();

    // Inflections index එක පසුබිමින් warm up කරන්න
    const warmUpInflections = () => { getInflectionIndex().catch(() => {}); };
    if ('requestIdleCallback' in window) {
        requestIdleCallback(warmUpInflections);
    } else {
        setTimeout(warmUpInflections, 1500);
    }
}

// --- Legacy non-streaming loader (used as fallback + for non-zip paths) ---
function fetchCSV(path, callback, onProgress) {
    if (/\.zip(\?.*)?$/i.test(path)) {
        fetchZippedCSV(path, callback, onProgress);
        return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path, true);
    if (onProgress) xhr.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.overrideMimeType('text/plain; charset=utf-8');
    xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 0) {
            callback(parseCSV(xhr.responseText));
        } else {
            callback([]);
        }
    };
    xhr.onerror = () => callback([]);
    xhr.send();
}

// ================================================================
// Native ZIP reader
// ================================================================
// zip ගොනුවේ පළමු entry එකේ (සම්පීඩිත) දත්ත සොයා ගනී — unzipFirstEntry සහ sliced reader දෙකටම පොදුයි
function locateFirstZipEntry(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.length;

    const EOCD_SIG = 0x06054b50;
    let eocdOffset = -1;
    const scanStart = Math.max(0, len - 65557);
    for (let i = len - 22; i >= scanStart; i--) {
        if (view.getUint32(i, true) === EOCD_SIG) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) throw new Error('not a valid zip file (EOCD not found)');

    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const CD_SIG = 0x02014b50;
    if (view.getUint32(cdOffset, true) !== CD_SIG) throw new Error('central directory not found');

    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const LFH_SIG = 0x04034b50;
    if (view.getUint32(localHeaderOffset, true) !== LFH_SIG) throw new Error('local file header not found');
    const lNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const compData = bytes.slice(dataStart, dataStart + compSize);
    return { method, compData };
}

function unzipFirstEntry(arrayBuffer) {
    const { method, compData } = locateFirstZipEntry(arrayBuffer);
    if (method === 0) return compData;
    if (method === 8) return fflate.inflateSync(compData);
    throw new Error('unsupported zip compression method: ' + method);
}

// ================================================================
// Time-sliced unzip + UTF-8 decode (විශාල ගොනු සඳහා)
// ----------------------------------------------------------------
// fflate.inflateSync සහ TextDecoder.decode එකවර විශාල ගොනුවක් (inflections.zip → 64MB)
// සඳහා main thread එක තත්පර කිහිපයක් අවහිර කරයි. මෙය කුඩා කොටස් වශයෙන් කර,
// සෑම ~sliceBudgetMs කට වරක් UI එකට (ටයිප් කිරීමට / scroll කිරීමට) අවස්ථාව දෙයි.
// ප්‍රතිඵලය unzipFirstEntry + TextDecoder.decode සමඟ හරියටම සමානයි.
// ================================================================
async function unzipFirstEntryToTextSliced(arrayBuffer, sliceBudgetMs) {
    const budget = sliceBudgetMs || 8;
    const { method, compData } = locateFirstZipEntry(arrayBuffer);
    if (compData.length === 0) return '';

    const decoder = new TextDecoder('utf-8');
    const parts = [];
    let lastYield = performance.now();
    const maybeYield = async () => {
        if (performance.now() - lastYield >= budget) {
            await new Promise(r => setTimeout(r, 0));
            lastYield = performance.now();
        }
    };

    if (method === 0) {
        const STEP = 1 << 20;
        for (let off = 0; off < compData.length; off += STEP) {
            parts.push(decoder.decode(compData.subarray(off, off + STEP), { stream: true }));
            await maybeYield();
        }
    } else if (method === 8) {
        if (typeof fflate.Inflate !== 'function') throw new Error('fflate.Inflate unavailable');
        const inflater = new fflate.Inflate((chunk) => {
            if (chunk && chunk.length) parts.push(decoder.decode(chunk, { stream: true }));
        });
        const STEP = 32 * 1024;     // සම්පීඩිත bytes 32KB ≈ අසම්පීඩිත ~0.5MB
        for (let off = 0; off < compData.length; off += STEP) {
            const end = Math.min(off + STEP, compData.length);
            inflater.push(compData.subarray(off, end), end === compData.length);
            await maybeYield();
        }
    } else {
        throw new Error('unsupported zip compression method: ' + method);
    }
    parts.push(decoder.decode());   // අවසාන අසම්පූර්ණ bytes flush
    return parts.join('');
}

function fetchZippedCSV(path, callback, onProgress) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    xhr.responseType = 'arraybuffer';
    if (onProgress) xhr.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = function () {
        if (xhr.status !== 200 && xhr.status !== 0) {
            console.error('Zipped CSV load failed:', path, 'HTTP ' + xhr.status);
            callback([]);
            return;
        }
        try {
            const bytes = unzipFirstEntry(xhr.response);
            callback(parseCSV(new TextDecoder('utf-8').decode(bytes)));
        } catch (err) {
            console.error('Zipped CSV unzip failed:', path, err);
            callback([]);
        }
    };
    xhr.onerror = function () {
        console.error('Zipped CSV network error:', path);
        callback([]);
    };
    xhr.send();
}

// ================================================================
// Streaming ZIP → CSV reader
// ================================================================
function fetchZippedCSVStreaming(path, handlers) {
    if (typeof fetch !== 'function' || typeof ReadableStream === 'undefined' || !fflate.Unzip) {
        return null;
    }

    let reader = null;
    let aborted = false;

    (async () => {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if (!response.body || !response.body.getReader) {
                if (!aborted && handlers.onUnsupported) handlers.onUnsupported();
                return;
            }

            reader = response.body.getReader();
            const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
            let loadedBytes = 0;

            const decoder = new TextDecoder('utf-8');
            const parser = new IncrementalCSVParser();

            let headerMap = null;
            let headerParsed = false;
            let rowIndex = 0;
            let pendingItems = [];
            let lastFlush = performance.now();
            const FLUSH_INTERVAL_MS = 200;
            const FLUSH_BATCH_SIZE = 500;

            const flush = () => {
                if (!pendingItems.length) return;
                const batch = pendingItems;
                pendingItems = [];
                lastFlush = performance.now();
                if (handlers.onBatch) handlers.onBatch(batch);
            };

            const processRow = (row) => {
                if (!headerParsed) {
                    headerMap = detectHeaderMap(row);
                    headerParsed = true;
                    if (headerMap) return;
                }
                rowIndex++;
                const item = buildItemFromRow(row, headerMap, rowIndex);
                if (!item) return;
                pendingItems.push(item);
                if (pendingItems.length >= FLUSH_BATCH_SIZE ||
                    performance.now() - lastFlush >= FLUSH_INTERVAL_MS) {
                    flush();
                }
            };

            let csvEntrySeen = false;
            const unzipper = new fflate.Unzip((file) => {
                if (csvEntrySeen || !/\.csv$/i.test(file.name)) {
                    file.ondata = () => {};
                    file.start();
                    return;
                }
                csvEntrySeen = true;
                file.ondata = (err, data, final) => {
                    if (err) { if (handlers.onError) handlers.onError(err); return; }
                    if (data && data.length) {
                        const text = decoder.decode(data, { stream: !final });
                        parser.feed(text, processRow);
                    }
                    if (final) {
                        parser.finish(processRow);
                        flush();
                    }
                };
                file.start();
            });
            // ✅ Deflate (compression type 8) සඳහා decompressor එක ලියාපදිංචි කරයි —
            //    මෙය නොමැතිව streaming අසාර්ථක වී, ප්‍රගතියක් නොපෙන්වන පැරණි ක්‍රමයට වැටුණි.
            if (fflate.UnzipInflate) unzipper.register(fflate.UnzipInflate);

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    unzipper.push(new Uint8Array(0), true);
                    break;
                }
                loadedBytes += value.length;
                if (handlers.onProgress && totalBytes > 0) {
                    handlers.onProgress(loadedBytes, totalBytes);
                }
                unzipper.push(value, false);
            }
            flush();
            if (handlers.onDone) handlers.onDone();
        } catch (err) {
            if (aborted || err.name === 'AbortError') return;
            if (handlers.onError) handlers.onError(err);
        }
    })();

    return {
        abort: () => {
            aborted = true;
            if (reader) reader.cancel().catch(() => {});
        }
    };
}

// ================================================================
// Incremental (chunk-by-chunk) CSV tokenizer
// ================================================================
class IncrementalCSVParser {
    constructor() {
        this.row = [];
        this.field = '';
        this.inQuotes = false;
        this.pendingQuote = false;
    }

    feed(text, onRow) {
        let i = 0;
        const len = text.length;
        while (i < len) {
            const ch = text[i];

            if (this.inQuotes) {
                if (this.pendingQuote) {
                    if (ch === '"') { this.field += '"'; this.pendingQuote = false; i++; continue; }
                    this.inQuotes = false;
                    this.pendingQuote = false;
                }
                if (this.inQuotes) {
                    if (ch === '"') { this.pendingQuote = true; i++; continue; }
                    this.field += ch; i++; continue;
                }
            }

            if (ch === '"')  { this.inQuotes = true; i++; continue; }
            if (ch === ',')  { this.row.push(this.field); this.field = ''; i++; continue; }
            if (ch === '\r') { i++; continue; }
            if (ch === '\n') {
                this.row.push(this.field);
                this.field = '';
                onRow(this.row);
                this.row = [];
                i++;
                continue;
            }
            this.field += ch; i++;
        }
    }

    finish(onRow) {
        if (this.field.length > 0 || this.row.length > 0) {
            this.row.push(this.field);
            onRow(this.row);
            this.row = [];
            this.field = '';
        }
    }
}

// --- Real CSV tokenizer (RFC4180-style) ---
function tokenizeCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const len = text.length;
    let i = 0;

    while (i < len) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            field += ch; i++; continue;
        }

        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === ',') { row.push(field); field = ''; i++; continue; }
        if (ch === '\r') { i++; continue; }
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += ch; i++;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

// Recognizes the dictionary.csv header and maps column names to indices.
function detectHeaderMap(headerRow) {
    if (!headerRow || headerRow.length < 2) return null;
    const map = {};
    headerRow.forEach((raw, idx) => {
        const h = (raw || '').trim();
        const hl = h.toLowerCase();
        if (hl === 'original_id' || hl === 'id') map.id = idx;
        else if (h.indexOf('වචනය') !== -1 || hl === 'word') map.word = idx;
        else if (h.indexOf('කෙටි ව්‍යා') !== -1 || hl === 'type') map.type = idx;
        else if (h.indexOf('පද බෙදීම') !== -1) map.wordDivision = idx;
        else if (h.indexOf('තේරුම') !== -1 && h.indexOf('නිරුක්ති') === -1) map.meaning = idx;
        else if (hl === 'meaning') map.meaning = idx;
        else if (h.indexOf('සංඥා නාම') !== -1) map.properNoun = idx;
        else if (h.indexOf('ව්‍යාකරණ විස්තරය') !== -1) map.grammarDesc = idx;
        else if (h.indexOf('නිරුක්ති') !== -1) map.etymology = idx;
    });
    return (map.word !== undefined) ? map : null;
}

// CSV row එකක් → item object එකක් බවට හරවයි.
function buildItemFromRow(raw, colMap, fallbackId) {
    if (!raw || raw.length < 2) return null;

    const parts = raw.map(p => (p || '').trim().normalize('NFC'));
    let item;

    if (colMap) {
        item = {
            id: (colMap.id !== undefined ? parts[colMap.id] : '') || String(fallbackId),
            word: (parts[colMap.word] || '').replace(/\s*\d+(?:\.\d+)*\s*$/, '').trim(),
            type: (colMap.type !== undefined ? parts[colMap.type] : '') || '',
            wordDivision: (colMap.wordDivision !== undefined ? parts[colMap.wordDivision] : '') || '',
            meaning: (colMap.meaning !== undefined ? parts[colMap.meaning] : '') || '',
            properNoun: (colMap.properNoun !== undefined ? parts[colMap.properNoun] : '') || '',
            grammarDesc: (colMap.grammarDesc !== undefined ? parts[colMap.grammarDesc] : '') || '',
            etymology: (colMap.etymology !== undefined ? parts[colMap.etymology] : '') || ''
        };
    } else {
        let offset = 0;
        let id = String(fallbackId);
        if (parts.length > 1 && parts[0] !== '' && !isNaN(parts[0])) {
            id = parts[0];
            offset = 1;
        }
        item = {
            id: id,
            word: (parts[offset] || '').replace(/\s*\d+(?:\.\d+)*\s*$/, '').trim(),
            type: '',
            wordDivision: '',
            meaning: '',
            properNoun: '',
            grammarDesc: '',
            etymology: ''
        };
        const remaining = parts.length - offset;
        if (remaining === 2) {
            item.meaning = parts[offset + 1] || '';
        } else if (remaining >= 3) {
            item.type = parts[offset + 1] || '';
            item.meaning = parts[offset + 2] || '';
            item.properNoun = parts[offset + 3] || '';
            item.grammarDesc = parts[offset + 4] || '';
        }
    }

    const hasContent = item.meaning || item.type || item.properNoun ||
                        item.grammarDesc || item.etymology || item.wordDivision;
    return (item.word && hasContent) ? item : null;
}

// --- Smart CSV Parser (non-streaming; kept as fallback) ---
function parseCSV(text) {
    const rows = tokenizeCSV(text);
    if (!rows.length) return [];

    const result = [];
    const colMap = detectHeaderMap(rows[0]);
    const startRow = colMap ? 1 : 0;

    for (let i = startRow; i < rows.length; i++) {
        const item = buildItemFromRow(rows[i], colMap, i);
        if (item) result.push(item);
    }
    return result;
}

// ================================================================
// Singlish -> Sinhala Transliteration Engine
// ================================================================
const singlish_vowels = [
    ['අ', 'a'], ['ආ', 'aa'], ['ඇ', 'ae'], ['ඈ', 'ae, aee'],
    ['ඉ', 'i'], ['ඊ', 'ii'], ['උ', 'u'], ['ඌ', 'uu'],
    ['එ', 'e'], ['ඒ', 'ee'], ['ඔ', 'o'], ['ඕ', 'oo'],
    ['ඓ', 'ai'], ['ඖ', 'ou'],
    ['ඍ', 'ru'], ['ඎ', 'ru, ruu'], ['ඏ', 'li'], ['ඐ', 'li, lii']
];

const singlish_specials = [
    ['ඞ්', 'n'], ['ං', 'n, m'], ['ඃ', 'n, m']
];

const singlish_consonants = [
    ['ක', 'k'], ['ග', 'g'], ['ච', 'c, ch'], ['ජ', 'j'], ['ඤ', 'n, kn'],
    ['ට', 't'], ['ඩ', 'd'], ['ණ', 'n'], ['ත', 'th, t'], ['ද', 'd'],
    ['න', 'n'], ['ප', 'p'], ['බ', 'b'], ['ම', 'm'], ['ය', 'y'],
    ['ර', 'r'], ['ල', 'l'], ['ව', 'v, w'], ['ශ', 'sh'], ['ෂ', 'sh'],
    ['ස', 's'], ['හ', 'h'], ['ළ', 'l'], ['ෆ', 'f'],
    ['ඛ', 'kh, k'], ['ඨ', 'th, t'], ['ඝ', 'gh, g'], ['ඟ', 'ng'],
    ['ඡ', 'ch, c'], ['ඣ', 'jh, j'], ['ඦ', 'nj'], ['ඪ', 'dh, d'], ['ඬ', 'nd'],
    ['ථ', 'th, t'], ['ධ', 'dh, d'], ['ඳ', 'nd'], ['ඵ', 'ph, p'], ['භ', 'bh, b'],
    ['ඹ', 'mb'], ['ඥ', 'gn']
];

const singlish_combinations = [
    ['්', ''],
    ['', 'a'],
    ['ා', 'a, aa'],
    ['ැ', 'ae'],
    ['ෑ', 'ae, aee'],
    ['ි', 'i'],
    ['ී', 'i, ii'],
    ['ු', 'u'],
    ['ූ', 'u, uu'],
    ['ෙ', 'e'],
    ['ේ', 'e, ee'],
    ['ෛ', 'ei'],
    ['ො', 'o'],
    ['ෝ', 'o, oo'],

    ['්‍ර', 'ra'],
    ['්‍රා', 'ra, raa'],
    ['්‍රැ', 'rae'],
    ['්‍රෑ', 'rae, raee'],
    ['්‍රි', 'ri'],
    ['්‍රී', 'ri, rii'],
    ['්‍රෙ', 're'],
    ['්‍රේ', 're, ree'],
    ['්‍රෛ', 'rei'],
    ['්‍රො', 'ro'],
    ['්‍රෝ', 'ro, roo'],

    ['්‍ය', 'ya'],
    ['්‍යා', 'ya, yaa'],
    ['්‍යැ', 'yae'],
    ['්‍යෑ', 'yae, yaee'],
    ['්‍යි', 'yi'],
    ['්‍යී', 'yi, yii'],
    ['්‍යු', 'yu'],
    ['්‍යූ', 'yu, yuu'],
    ['්‍යෙ', 'ye'],
    ['්‍යේ', 'ye, yee'],
    ['්‍යෛ', 'yei'],
    ['්‍යො', 'yo'],
    ['්‍යෝ', 'yo, yoo'],

    ['ෘ', 'ru'],
    ['ෲ', 'ru, ruu'],
    ['ෞ', 'au'],
    ['ෟ', 'li'],
    ['ෳ', 'li, lii']
];

const singlishMapping = {};
let maxSinglishKeyLen = 0;

function addToSinglishMapping(values, pSinhStr, pRomanStr) {
    values.forEach(function (pair) {
        const sinh = pair[0] + pSinhStr;
        const romans = pair[1].split(',');
        const pRomans = pRomanStr.split(',');
        romans.forEach(function (romanRaw) {
            const roman = romanRaw.trim();
            pRomans.forEach(function (pRomanRaw) {
                const pRoman = pRomanRaw.trim();
                const mapIndex = roman + pRoman;
                if (!mapIndex) return;
                if (singlishMapping[mapIndex]) {
                    if (singlishMapping[mapIndex].indexOf(sinh) === -1) {
                        singlishMapping[mapIndex].push(sinh);
                    }
                } else {
                    singlishMapping[mapIndex] = [sinh];
                    maxSinglishKeyLen = Math.max(mapIndex.length, maxSinglishKeyLen);
                }
            });
        });
    });
}

(function buildSinglishMapping() {
    addToSinglishMapping(singlish_vowels, '', '');
    addToSinglishMapping(singlish_specials, '', '');
    singlish_combinations.forEach(function (combi) {
        addToSinglishMapping(singlish_consonants, combi[0], combi[1]);
    });
})();

function isSinglishQuery(str) {
    return /[a-zA-Z]/.test(str);
}

function getPossibleMatches(input) {
    const cache = {};
    function helper(str) {
        if (str === '') return [''];
        if (cache[str]) return cache[str];
        let matches = [];
        const startLen = Math.min(maxSinglishKeyLen, str.length);
        for (let len = startLen; len >= 1; len--) {
            const prefix = str.slice(0, len);
            const rest = str.slice(len);
            const prefixMappings = isSinglishQuery(prefix) ? singlishMapping[prefix] : [prefix];
            if (!prefixMappings) continue;
            const restMappings = helper(rest);
            prefixMappings.forEach(function (p) {
                restMappings.forEach(function (r) {
                    matches.push(p + r);
                });
            });
        }
        const unique = Array.from(new Set(matches)).slice(0, 60);
        cache[str] = unique;
        return unique;
    }
    if (!input || input.length > 24) return [];
    return helper(input).slice(0, 300);
}

const INFLECTION_DATA_PATH = 'inflections.zip';

// Async: කුඩා කොටස් වශයෙන් ක්‍රියාත්මක වන අතර සෑම ~12ms කට වරක් main thread එකට
// නිදහස් වේ. එමගින් දත්ත පූරණය වන අතරතුරත් ටයිප් කිරීම ක්ෂණිකව සිදු වේ.
async function buildLazyInflectionIndex(text) {
    const index = new Map();
    // ප්‍රතිලෝම index: වර නැගුණු රූපය (පළමු තීරුව) -> පේළියේ ආරම්භක offset
    // (එකක් නම් number එකක්, කිහිපයක් නම් number array එකක්)
    const formIndex = new Map();
    const len = text.length;
    let lineStart = 0;
    let firstLine = true;
    let lastYield = performance.now();

    for (let i = 0; i <= len; i++) {
        if (i === len || text[i] === '\n') {
            if (!firstLine && i > lineStart) {
                let lineEnd = i;
                if (text[lineEnd - 1] === '\r') lineEnd--;
                const lastComma = text.lastIndexOf(',', lineEnd - 1);
                if (lastComma >= lineStart) {
                    const headword = text.slice(lastComma + 1, lineEnd);
                    let bucket = index.get(headword);
                    if (!bucket) { bucket = []; index.set(headword, bucket); }
                    bucket.push([lineStart, lineEnd]);

                    const firstComma = text.indexOf(',', lineStart);
                    if (firstComma > lineStart && firstComma < lastComma) {
                        const form = text.slice(lineStart, firstComma);
                        const prev = formIndex.get(form);
                        if (prev === undefined) formIndex.set(form, lineStart);
                        else if (typeof prev === 'number') formIndex.set(form, [prev, lineStart]);
                        else prev.push(lineStart);
                    }
                }
            }
            firstLine = false;
            lineStart = i + 1;
        }

        if ((i & 0xFFFF) === 0 && performance.now() - lastYield > 12) {
            await new Promise(r => setTimeout(r, 0));
            lastYield = performance.now();
        }
    }
    return { index, formIndex };
}

// වර නැගීම් දත්තවල මූල වචන ZWJ රහිතව සහ හල් අකුරෙන් අවසන් වන කඳ ලෙස ඇත
// (උදා: මනස්, සත්ථර්, ගුණවන්ත්). ශබ්දකෝෂයේ ශීර්ෂය (මනස, සත්ථු, ගුණවන්තු) ඒවාට ගළපයි.
const ZWJ_RE = /\u200d/g;
function stripZwj(w) { return String(w || '').normalize('NFC').replace(ZWJ_RE, ''); }

// ශබ්දකෝෂ ශීර්ෂය -> වර නැගීම් දත්තවල සෙවිය හැකි මූල වචන (අනුපිළිවෙළට)
function inflectionKeyCandidates(word) {
    const w = stripZwj(word).trim();
    const out = [w];
    if (/\u0dd4$/.test(w)) {                         // ...උ  (සත්ථු, ගුණවන්තු)
        const base = w.slice(0, -1);
        out.push(base + '\u0dca');                   // ගුණවන්තු -> ගුණවන්ත්
        out.push(base + '\u0dbb\u0dca');            // සත්ථු -> සත්ථර්
    } else if (/[\u0d9a-\u0dc6]$/.test(w)) {        // අ-කාරාන්ත (මනස, අරහන්ත)
        out.push(w + '\u0dca');                      // මනස -> මනස්, අරහන්ත -> අරහන්ත්
    }
    return out;
}

// වර නැගීම් දත්තවල මූල වචනය (hw) -> ශබ්දකෝෂයේ ශීර්ෂයට ගැළපිය හැකි රූප
function dictWordCandidates(hw) {
    const w = stripZwj(hw);
    const out = [w];
    if (/\u0dca$/.test(w)) {
        const base = w.slice(0, -1);                 // මනස්->මනස, ගුණවන්ත්->ගුණවන්ත
        if (/\u0dbb\u0dca$/.test(w)) out.push(w.slice(0, -2) + '\u0dd4');   // සත්ථර් -> සත්ථු
        if (/\u0db1\u0dca\u0dad\u0dca$/.test(w)) out.push(base + '\u0dd4'); // ගුණවන්ත් -> ගුණවන්තු
        out.push(base);
    }
    return out;
}

// සියලු ගැළපෙන මූල වචනවල පේළි එකතු කරයි (උදා: මනස = විශේෂණ පේළි "මනස" + නාම පේළි "මනස්")
function lazyInflectionLookup(state, headword) {
    const out = [];
    const seen = new Set();
    const cands = inflectionKeyCandidates(headword);
    for (let i = 0; i < cands.length; i++) {
        const ranges = state.index.get(cands[i]);
        if (!ranges) continue;
        for (let j = 0; j < ranges.length; j++) {
            const [s, e] = ranges[j];
            const line = state.text.slice(s, e);
            const cols = line.split(',');
            const key = cols.slice(0, 5).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ inflected: cols[0], pos: cols[1], category: cols[2], subcase: cols[3], number: cols[4] });
        }
    }
    return out;
}

let inflectionIndexPromise = null;
let inflLoadPct = 0;                         // වර නැගීම් ගොනුවේ බාගත ප්‍රතිශතය
const inflProgressListeners = new Set();
let inflectionState = null;   // index පූරණය වූ පසු { text, index, formIndex }

function getInflectionIndex() {
    if (inflectionIndexPromise) return inflectionIndexPromise;

    inflectionIndexPromise = new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', INFLECTION_DATA_PATH, true);
        xhr.responseType = 'arraybuffer';
        xhr.onprogress = (e) => {
            inflLoadPct = e.lengthComputable ? (e.loaded / e.total) * 100 : null;
            inflProgressListeners.forEach(fn => fn(inflLoadPct));
        };
        xhr.onload = async () => {
            if (xhr.status !== 200 && xhr.status !== 0) {
                reject(new Error('HTTP ' + xhr.status));
                return;
            }
            try {
                // unzip + decode කුඩා කොටස් වශයෙන් (UI කොටන්නේ නැත); අසාර්ථක නම් පරණ ක්‍රමයට
                let text;
                try {
                    text = await unzipFirstEntryToTextSliced(xhr.response);
                } catch (slicedErr) {
                    console.warn('Sliced unzip failed, using synchronous path:', slicedErr);
                    text = new TextDecoder('utf-8').decode(unzipFirstEntry(xhr.response));
                }
                const built = await buildLazyInflectionIndex(text);
                const state = { text, index: built.index, formIndex: built.formIndex };
                inflectionState = state;
                resolve(state);
                refreshSuggestionsIfTyping();
            } catch (err) {
                reject(err);
            }
        };
        xhr.onerror = () => reject(new Error('network error loading ' + INFLECTION_DATA_PATH));
        xhr.send();
    }).catch(err => {
        console.error('inflections load failed:', err);
        inflectionIndexPromise = null;
        throw err;
    });

    return inflectionIndexPromise;
}

const INFL_CASE_ORDER = ['nom', 'acc', 'instr', 'dat', 'abl', 'gen', 'loc', 'voc'];
const INFL_CASE_LABELS = { nom: 'පඨමා', acc: 'දුතියා', instr: 'තතියා', dat: 'චතුත්ථී', abl: 'පඤ්චමී', gen: 'ෂෂ්ඨී', loc: 'සප්තමී', voc: 'ආලපන' };
const INFL_GENDER_ORDER = ['masc', 'fem', 'nt'];
const INFL_GENDER_LABELS = { masc: 'පුල්ලිංග', fem: 'ඉත්ථීලිංග', nt: 'නපුංසකලිංග' };
const INFL_NUMBER_LABELS = { sg: 'ඒක වචන', pl: 'බහු වචන' };
const INFL_TENSE_ORDER = ['pr', 'imp', 'opt', 'perf', 'imperf', 'aor', 'fut', 'cond'];
const INFL_TENSE_LABELS = { pr: 'වර්තමානා', imp: 'පඤ්චමී', opt: 'සත්තමී', perf: 'පරොක්ඛා', imperf: 'හියත්තනී', aor: 'අජ්ජතනී', fut: 'භවිස්සන්ති', cond: 'කාලාතිපත්ති' };
const INFL_PERSON_ORDER = ['1st', '2nd', '3rd'];
const INFL_PERSON_LABELS = { '1st': 'උත්තම පුරුෂ', '2nd': 'මධ්‍යම පුරුෂ', '3rd': 'ප්‍රථම පුරුෂ' };
const INFL_PRON_PERSON_ORDER = ['1st', '2nd', 'dual'];
const INFL_PRON_PERSON_LABELS = { '1st': 'උත්තම පුරුෂ (මම)', '2nd': 'මධ්‍යම පුරුෂ (ඔබ)', 'dual': 'උභ (දෙදෙනා)' };

// ================================================================
// වර නැගුණු රූපයෙන් (inflected form) මූල වචනය සෙවීම
// උදා: "මය්හං" -> අහං  ("අහං ශබ්දයේ චතුත්ථී ... ස්වරූපය, අහං බලන්න")
// ================================================================
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function joinSi(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' හා ' + list[list.length - 1];
}

// inflections.csv හි පේළි -> object (headword = අවසාන තීරුව)
function lazyInflectionFormLookup(state, form) {
    const entry = state.formIndex.get(stripZwj(form));
    if (entry === undefined) return [];
    const starts = (typeof entry === 'number') ? [entry] : entry;
    const out = [];
    for (let i = 0; i < starts.length; i++) {
        const s = starts[i];
        let e = state.text.indexOf('\n', s);
        if (e === -1) e = state.text.length;
        if (e > s && state.text[e - 1] === '\r') e--;
        const cols = state.text.slice(s, e).split(',');
        if (cols.length < 6) continue;
        out.push({
            inflected: cols[0], pos: cols[1], category: cols[2],
            subcase: cols[3], number: cols[4], headword: cols[cols.length - 1]
        });
    }
    return out;
}

// පාලි ශබ්දකෝෂයේ මූල වචන set එක (දත්ත ප්‍රමාණය වෙනස් වූ විට පමණක් නැවත සාදයි)
let paliHeadSetCache = { dict: null, size: -1, set: null };
function getPaliHeadwordSet(dict) {
    if (paliHeadSetCache.dict === dict && paliHeadSetCache.size === dict.data.length) {
        return paliHeadSetCache.set;
    }
    // ZWJ රහිත යතුර -> ශබ්දකෝෂයේ පෙන්වන ශීර්ෂය
    const set = new Map();
    for (let i = 0; i < dict.data.length; i++) {
        const it = dict.data[i];
        if (it && it.word) {
            const k = stripZwj(it.word);
            if (!set.has(k)) set.set(k, it.word);
        }
    }
    paliHeadSetCache = { dict, size: dict.data.length, set };
    return set;
}

// එක් මූල වචනයකට අදාළ පේළි -> "චතුත්ථී හා ෂෂ්ඨී විභක්ති ඒක වචන" වැනි විස්තරයක්
function describeInflectionRows(headword, rows) {
    const nomGroups = new Map();
    const verbDescs = [];
    const otherDescs = [];
    const seenVerb = new Set();
    const seenOther = new Set();

    rows.forEach(r => {
        if (INFL_CASE_ORDER.indexOf(r.subcase) !== -1) {
            // නාම පද / සර්වනාම: විභක්තිය + වචනය
            const gender = INFL_GENDER_LABELS[r.category] ? r.category : '';
            const key = gender + '|' + r.number;
            let g = nomGroups.get(key);
            if (!g) { g = { gender, number: r.number, cases: new Set() }; nomGroups.set(key, g); }
            g.cases.add(r.subcase);
        } else if (INFL_PERSON_ORDER.indexOf(r.subcase) !== -1) {
            // ක්‍රියා පද: කාලය (විභක්තිය) + පුරුෂ + වචනය
            const reflx = /^reflx/.test(r.category);
            const tense = r.category.replace(/^reflx\s*/, '');
            const text = (INFL_TENSE_LABELS[tense] || tense) + ' විභක්ති ' +
                INFL_PERSON_LABELS[r.subcase] + ' ' +
                (INFL_NUMBER_LABELS[r.number] || r.number) +
                (reflx ? ' (අත්තනොපද)' : '');
            if (!seenVerb.has(text)) { seenVerb.add(text); verbDescs.push(text); }
        } else {
            const text = [r.category, r.subcase, r.number].filter(Boolean).join(' ');
            if (text && !seenOther.has(text)) { seenOther.add(text); otherDescs.push(text); }
        }
    });

    const groups = Array.from(nomGroups.values()).sort((a, b) => {
        const ga = INFL_GENDER_ORDER.indexOf(a.gender), gb = INFL_GENDER_ORDER.indexOf(b.gender);
        if (ga !== gb) return ga - gb;
        return (a.number === 'sg' ? 0 : 1) - (b.number === 'sg' ? 0 : 1);
    });
    // එකම මූල වචනයට ලිංග කිහිපයක් ගැළපෙන විට පමණක් ලිංගය සඳහන් කරයි
    const showGender = new Set(groups.map(g => g.gender).filter(Boolean)).size > 1;

    const nomDescs = groups.map(g => {
        const cases = INFL_CASE_ORDER.filter(c => g.cases.has(c)).map(c => INFL_CASE_LABELS[c]);
        return (showGender && g.gender ? INFL_GENDER_LABELS[g.gender] + ' ' : '') +
            joinSi(cases) + ' විභක්ති ' + (INFL_NUMBER_LABELS[g.number] || g.number);
    });

    const all = nomDescs.concat(verbDescs, otherDescs);
    return {
        headword,
        kind: (verbDescs.length && !nomDescs.length) ? 'ක්‍රියා පදයේ' : 'ශබ්දයේ',
        desc: all.length ? all.join(' හෝ ') : 'වර නැගුණු'
    };
}

// ටයිප් කළ වචනය (හෝ එහි Singlish හැරවුම්) වර නැගුණු රූපයක් නම්, එහි මූල වචන සොයයි.
// මූල වචනය පාලි ශබ්දකෝෂයේ තිබෙන විට පමණක් ප්‍රතිඵල ලැබේ.
function findInflectionRefs(query, possibleMatches) {
    const state = inflectionState;
    if (!state) return [];
    const paliDict = availableDicts.find(d => d.id === 'pali' && d.enabled);
    if (!paliDict || !paliDict.data || paliDict.data.length === 0) return [];
    const headSet = getPaliHeadwordSet(paliDict);

    const seen = new Set();
    const candidates = [];
    [query].concat(possibleMatches || []).forEach(c => {
        if (c && !seen.has(c)) { seen.add(c); candidates.push(c); }
    });

    const refs = [];
    for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const rows = lazyInflectionFormLookup(state, cand);
        if (!rows.length) continue;

        const byHead = new Map();
        const candKey = stripZwj(cand);
        rows.forEach(r => {
            let hw = null;
            const hc = dictWordCandidates(r.headword);
            for (let j = 0; j < hc.length && !hw; j++) hw = headSet.get(hc[j]) || null;
            if (!hw || stripZwj(hw) === candKey) return;   // තමාටම යොමු නොකරයි
            if (!byHead.has(hw)) byHead.set(hw, []);
            byHead.get(hw).push(r);
        });
        if (!byHead.size) continue;

        refs.push({
            form: cand,
            entries: Array.from(byHead.entries()).map(([hw, rs]) => describeInflectionRows(hw, rs))
        });
        if (refs.length >= 6) break;
    }
    return refs;
}

function buildInflectionRefCard(ref) {
    const paliDict = availableDicts.find(d => d.id === 'pali');
    const card = document.createElement('div');
    card.className = 'word-card wc-v2 inflection-ref-card';
    card.innerHTML = CARD_PATTERN_HTML +
        `<div class="wc-head"><h2 class="wc-word">${escapeHtml(ref.form)}</h2>` +
        `<span class="dict-tag">${escapeHtml(paliDict ? paliDict.name : 'පාලි')}</span></div>` +
        `<div class="wc-divider" aria-hidden="true"><i></i></div>`;

    ref.entries.forEach(entry => {
        const hw = escapeHtml(entry.headword);
        const row = document.createElement('div');
        row.className = 'meaning-row';
        row.innerHTML = `<div class="inflection-ref-text">${hw} ${entry.kind} ${escapeHtml(entry.desc)} ස්වරූපය, ` +
            `<a href="#" class="inflection-ref-link" data-word="${hw}">${hw}</a> බලන්න</div>`;
        card.appendChild(row);
    });
    return card;
}

// Index එක සූදානම් වූ පසු: පරිශීලකයා තවමත් ටයිප් කරමින් සිටී නම් suggestions යළි ගණනය කරයි
function refreshSuggestionsIfTyping() {
    try {
        if (document.activeElement === searchInput && searchInput.value.trim()) updateSuggestions();
    } catch (e) { /* ignore */ }
}

// "මූල වචනය බලන්න" සබැඳිය ක්ලික් කළ විට එම වචනය සොයයි
resultsContainer.addEventListener('click', function (e) {
    const link = e.target && e.target.closest ? e.target.closest('.inflection-ref-link') : null;
    if (!link) return;
    e.preventDefault();
    const word = link.getAttribute('data-word');
    if (!word) return;
    searchInput.value = word;
    suggestionsBox.style.display = 'none';
    performSearch(word, true);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { window.scrollTo(0, 0); }
});

// ================================================================
// තේරූ වචනය බැලීම — ප්‍රතිඵල කාඩ් එකේ වචනයක් select කළ විට, එම වචනය ශබ්දකෝෂයේ ඇත්නම්
// (හෝ එය වර නැගුණු රූපයක් නම් එහි මූල වචනය) තේරීමට යටින් කුඩා කවුළුවක පෙන්වයි.
// "සම්පූර්ණයෙන් බලන්න" මඟින් එම වචනය සොයයි. වචනයක් නැත්නම් කිසිවක් නොපෙන්වයි.
// ================================================================
(function setupSelectionLookup() {
    const SEL_STRIP_RE = /^[\s.,;:!?()[\]{}"'‘’“”«»\/\\|—–\-−_…=+→←√*#•·0-9]+|[\s.,;:!?()[\]{}"'‘’“”«»\/\\|—–\-−_…=+→←√*#•·0-9]+$/g;
    const indexes = new Map();   // dict.id -> { data, size, map: ZWJ රහිත කුඩා අකුරු -> items[] }
    let popup = null;
    let timer = null;
    let shownKey = '';
    let waitingInfl = false;

    function dictIndex(dict) {
        let ix = indexes.get(dict.id);
        if (ix && ix.data === dict.data && ix.size === dict.data.length) return ix.map;
        const map = new Map();
        for (let i = 0; i < dict.data.length; i++) {
            const it = dict.data[i];
            if (!it || !it.word) continue;
            const k = stripZwj(it.word.toLowerCase()).trim();
            const arr = map.get(k);
            if (arr) arr.push(it); else map.set(k, [it]);
        }
        indexes.set(dict.id, { data: dict.data, size: dict.data.length, map });
        return map;
    }

    function itemsFor(word) {
        const key = stripZwj(String(word).toLowerCase()).trim();
        const out = [];
        availableDicts.filter(d => d.enabled && d.data && d.data.length).forEach(dict => {
            let list = dictIndex(dict).get(key);
            if (!list && dict.id === 'pali') {
                const cands = dictWordCandidates(key);
                for (let i = 1; i < cands.length && !list; i++) list = dictIndex(dict).get(cands[i]);
            }
            if (list) out.push({ dict, items: list });
        });
        return out;
    }

    // { word, note, groups } හෝ null
    function lookup(text) {
        const direct = itemsFor(text);
        if (direct.length) return { word: direct[0].items[0].word, note: '', groups: direct };
        if (!inflectionState) {
            if (!waitingInfl && /[\u0D80-\u0DFF]/.test(text)) {
                waitingInfl = true;
                getInflectionIndex().then(() => { waitingInfl = false; scheduleCheck(0); }).catch(() => { waitingInfl = false; });
            }
            return null;
        }
        const refs = findInflectionRefs(String(text).toLowerCase().normalize('NFC'), []);
        if (!refs.length || !refs[0].entries.length) return null;
        const entry = refs[0].entries[0];
        const groups = itemsFor(entry.headword);
        if (!groups.length) return null;
        const more = refs[0].entries.length > 1 ? ' (තවත් ' + (refs[0].entries.length - 1) + ')' : '';
        return {
            word: entry.headword,
            note: refs[0].form + ' — ' + entry.headword + ' ' + entry.kind + ' ' + entry.desc + ' ස්වරූපය' + more,
            groups
        };
    }

    function hide() {
        if (popup) popup.classList.remove('show');
        shownKey = '';
    }

    function clip(str, n) {
        const t = String(str || '').replace(/\s+/g, ' ').trim();
        return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
    }

    function ensurePopup() {
        if (popup) return popup;
        popup = document.createElement('div');
        popup.className = 'sel-lookup';
        popup.setAttribute('role', 'dialog');
        popup.addEventListener('mousedown', e => e.preventDefault());   // තේරීම නොමැකීමට
        document.body.appendChild(popup);
        return popup;
    }

    function show(res, rect) {
        const el = ensurePopup();
        el.innerHTML = '';

        const head = document.createElement('div');
        head.className = 'sel-lookup-head';
        const w = document.createElement('span');
        w.className = 'sel-lookup-word';
        w.textContent = res.word;
        head.appendChild(w);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'sel-lookup-close';
        close.setAttribute('aria-label', 'වසන්න');
        close.innerHTML = '&times;';
        close.onclick = (e) => { e.stopPropagation(); hide(); };
        head.appendChild(close);
        el.appendChild(head);

        if (res.note) {
            const note = document.createElement('div');
            note.className = 'sel-lookup-note';
            note.textContent = res.note;
            el.appendChild(note);
        }

        let shown = 0;
        res.groups.forEach(g => {
            g.items.forEach(it => {
                if (shown >= 3 || !it.meaning) return;
                const row = document.createElement('div');
                row.className = 'sel-lookup-meaning';
                if (it.type) {
                    const t = document.createElement('span');
                    t.className = 'sel-lookup-type';
                    t.textContent = it.type;
                    row.appendChild(t);
                }
                row.appendChild(document.createTextNode(clip(it.meaning, 150)));
                el.appendChild(row);
                shown++;
            });
        });

        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'sel-lookup-go';
        go.textContent = 'සම්පූර්ණයෙන් බලන්න →';
        go.onclick = (e) => {
            e.stopPropagation();
            hide();
            try { window.getSelection().removeAllRanges(); } catch (err) {}
            searchInput.value = res.word;
            suggestionsBox.style.display = 'none';
            addToSearchHistory(res.word);
            performSearch(res.word, true);
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { window.scrollTo(0, 0); }
        };
        el.appendChild(go);

        // ස්ථානය: තේරීමට යටින් (Android හි copy මෙනුව ඉහළින් එන නිසා); ඉඩ නැත්නම් ඉහළින්
        el.style.left = '0px';
        el.style.top = '0px';
        el.classList.add('show');
        const pw = el.offsetWidth, ph = el.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        const nav = document.querySelector('.bottom-nav');
        const bottomLimit = vh - (nav ? nav.getBoundingClientRect().height : 70) - 8;
        let top = rect.bottom + 12;
        if (top + ph > bottomLimit) top = Math.max(8, rect.top - ph - 12);
        let left = rect.left + rect.width / 2 - pw / 2;
        left = Math.max(8, Math.min(left, vw - pw - 8));
        el.style.left = Math.round(left) + 'px';
        el.style.top = Math.round(top) + 'px';
    }

    function check() {
        const sel = window.getSelection ? window.getSelection() : null;
        if (!sel || sel.isCollapsed || !sel.rangeCount) { hide(); return; }
        const range = sel.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const host = node.nodeType === 1 ? node : node.parentElement;
        if (!host || !resultsContainer.contains(host) || (popup && popup.contains(host))) { hide(); return; }

        const text = sel.toString().normalize('NFC').replace(SEL_STRIP_RE, '').trim();
        if (!text || text.length > 40 || text.split(/\s+/).length > 3) { hide(); return; }
        const key = stripZwj(text.toLowerCase());
        if (key === shownKey && popup && popup.classList.contains('show')) return;

        const res = lookup(text);
        if (!res) { hide(); return; }
        const rect = range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) { hide(); return; }
        show(res, rect);
        shownKey = key;
    }

    function scheduleCheck(ms) {
        clearTimeout(timer);
        timer = setTimeout(check, ms);
    }

    document.addEventListener('selectionchange', () => scheduleCheck(400));
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    document.addEventListener('click', e => { if (popup && !popup.contains(e.target)) scheduleCheck(50); });
})();

// ================================================================
// Regular-declension fallback generator
// ================================================================
const VOWEL_SIGN_AA = '\u0DCF';
const VOWEL_SIGN_I = '\u0DD2';
const VOWEL_SIGN_II = '\u0DD3';
const VOWEL_SIGN_U = '\u0DD4';
const VOWEL_SIGN_UU = '\u0DD6';

const DECLENSION_SUFFIXES = {
    a_masc: {
        nom: { sg: ['ො'], pl: ['ා'] },
        acc: { sg: ['ං'], pl: ['ෙ'] },
        instr: { sg: ['ෙන'], pl: ['ෙභි', 'ෙහි'] },
        dat: { sg: ['ස්ස', 'ාය'], pl: ['ානං'] },
        abl: { sg: ['තො', 'ම්හා', 'ස්මා'], pl: ['ෙභි', 'ෙහි'] },
        gen: { sg: ['ස්ස'], pl: ['ානං'] },
        loc: { sg: ['ම්හි', 'ස්මිං', 'ෙ'], pl: ['ෙසු'] },
        voc: { sg: ['', 'ා'], pl: ['ා'] },
    },
    a_nt: {
        nom: { sg: ['ං', 'ො'], pl: ['ානි', 'ා'] },
        acc: { sg: ['ං'], pl: ['ානි', 'ෙ'] },
        instr: { sg: ['ෙන'], pl: ['ෙභි', 'ෙහි'] },
        dat: { sg: ['ස්ස', 'ාය'], pl: ['ානං'] },
        abl: { sg: ['තො', 'ම්හා', 'ස්මා'], pl: ['ෙභි', 'ෙහි'] },
        gen: { sg: ['ස්ස'], pl: ['ානං'] },
        loc: { sg: ['ම්හි', 'ස්මිං', 'ෙ'], pl: ['ෙසු'] },
        voc: { sg: [''], pl: ['ානි', 'ා'] },
    },
    aa_fem: {
        nom: { sg: ['ා'], pl: ['ායො', 'ා'] },
        acc: { sg: ['ං'], pl: ['ායො', 'ා'] },
        instr: { sg: ['ාය'], pl: ['ාහි', 'ාභි'] },
        dat: { sg: ['ාය'], pl: ['ානං'] },
        abl: { sg: ['ාය'], pl: ['ාහි', 'ාභි'] },
        gen: { sg: ['ාය'], pl: ['ාන', 'ානං'] },
        loc: { sg: ['ාය', 'ායං'], pl: ['ාසු'] },
        voc: { sg: ['ෙ', 'ා'], pl: ['ායො', 'ා'] },
    },
    u_masc: {
        nom: { sg: ['ු'], pl: ['වො', 'ූ'] },
        acc: { sg: ['ුනං', 'ුං'], pl: ['වො', 'ූ'] },
        instr: { sg: ['ුනා'], pl: ['ුභි', 'ුහි', 'ූහි'] },
        dat: { sg: ['ුනො', 'ුස්ස'], pl: ['ුනං', 'ූනං'] },
        abl: { sg: ['ුතො', 'ුනා', 'ුම්හා', 'ුස්මා'], pl: ['ුභි', 'ුහි'] },
        gen: { sg: ['ුනො', 'ුස්ස'], pl: ['ුනං', 'ූනං'] },
        loc: { sg: ['ුම්හි', 'ුස්මිං'], pl: ['ුසු', 'ූසු'] },
        voc: { sg: ['ු'], pl: ['වෙ', 'වො', 'ූ'] },
    },
    ii_fem: {
        nom: { sg: ['ී'], pl: ['ී', 'ියො'] },
        acc: { sg: ['ිං'], pl: ['ී', 'ියො'] },
        instr: { sg: ['ියා'], pl: ['ීහි'] },
        dat: { sg: ['ියා'], pl: ['ීනං'] },
        abl: { sg: ['ියා'], pl: ['ීහි'] },
        gen: { sg: ['ියා'], pl: ['ීනං'] },
        loc: { sg: ['ියා', 'ියං'], pl: ['ීසු'] },
        voc: { sg: ['ි'], pl: ['ී', 'ියො'] },
    },
    i_masc: {
        nom: { sg: ['ි'], pl: ['යො', 'ී'] },
        acc: { sg: ['ිං'], pl: ['යො', 'ී'] },
        instr: { sg: ['ිනා'], pl: ['ිභි', 'ීභි', 'ීහි'] },
        dat: { sg: ['ිනො', 'ිස්ස'], pl: ['ිනං', 'ීනං'] },
        abl: { sg: ['ිනා', 'ිස්මා', 'ිම්හා', 'ිතො'], pl: ['ිභි', 'ීභි', 'ීහි'] },
        gen: { sg: ['ිනො', 'ිස්ස'], pl: ['ිනං', 'ීනං'] },
        loc: { sg: ['ිම්හි', 'ිස්මිං'], pl: ['ිසු', 'ීසු'] },
        voc: { sg: ['ි', 'ෙ'], pl: ['යො', 'ී'] },
    },
    i_fem: {
        nom: { sg: ['ි'], pl: ['ියො', 'ී'] },
        acc: { sg: ['ිං'], pl: ['ියො', 'ී'] },
        instr: { sg: ['ියා'], pl: ['ිභි', 'ීහි'] },
        dat: { sg: ['ියා'], pl: ['ීනං'] },
        abl: { sg: ['ියා', 'ිතො'], pl: ['ිභි', 'ීහි'] },
        gen: { sg: ['ියා'], pl: ['ීනං'] },
        loc: { sg: ['ියා', 'ියං'], pl: ['ිසු', 'ීසු'] },
        voc: { sg: ['ි'], pl: ['ියො', 'ී'] },
    },
    uu_masc: {
        nom: { sg: ['ූ'], pl: ['ූ', 'ුනො'] },
        acc: { sg: ['ුං'], pl: ['ූ', 'ුනො'] },
        instr: { sg: ['ුනා'], pl: ['ූහි'] },
        dat: { sg: ['ුනො', 'ුස්ස'], pl: ['ූනං'] },
        abl: { sg: ['ුනා', 'ුතො'], pl: ['ූහි'] },
        gen: { sg: ['ුනො', 'ුස්ස'], pl: ['ූනං'] },
        loc: { sg: ['ුම්හි', 'ුස්මිං'], pl: ['ූසු'] },
        voc: { sg: ['ූ'], pl: ['ූ', 'ුනො'] },
    },
    u_nt: {
        nom: { sg: ['ු', 'ුං'], pl: ['ූ', 'ූනි'] },
        acc: { sg: ['ුං'], pl: ['ූ', 'ූනි'] },
        instr: { sg: ['ුනා'], pl: ['ූහි'] },
        dat: { sg: ['ුනො', 'ුස්ස'], pl: ['ූනං'] },
        abl: { sg: ['ුම්හා', 'ුනා', 'ුස්මා', 'ුතො'], pl: ['ූහි'] },
        gen: { sg: ['ුනො', 'ුස්ස'], pl: ['ූනං'] },
        loc: { sg: ['ුම්හි', 'ුස්මිං'], pl: ['ුසු'] },
        voc: { sg: ['ු'], pl: ['ූ'] },
    },
    uu_fem: {
        nom: { sg: ['ූ'], pl: ['ූ', 'ුයො'] },
        acc: { sg: ['ුං'], pl: ['ූ', 'ුයො'] },
        instr: { sg: ['ුයා'], pl: ['ූහි'] },
        dat: { sg: ['ුයා'], pl: ['ූනං'] },
        abl: { sg: ['ුයා'], pl: ['ූහි'] },
        gen: { sg: ['ුයා'], pl: ['ූනං'] },
        loc: { sg: ['ුයා', 'ුයං'], pl: ['ූසු'] },
        voc: { sg: ['ු'], pl: ['ූ', 'ුයො'] },
    },
};
const ANT_STEM_SUFFIX = '\u0DB1\u0DCA\u0DAD';

function detectDeclensionClass(headwordSi, gender, attestedRows) {
    if (!headwordSi) return null;
    const last = headwordSi[headwordSi.length - 1];
    if (last === VOWEL_SIGN_AA) {
        return gender === 'fem' ? { stem: headwordSi.slice(0, -1), cls: 'aa_fem' } : null;
    }
    if (last === VOWEL_SIGN_U) {
        if (gender === 'masc') return { stem: headwordSi.slice(0, -1), cls: 'u_masc' };
        if (gender === 'nt') return { stem: headwordSi.slice(0, -1), cls: 'u_nt' };
        return null;
    }
    if (last === VOWEL_SIGN_II) {
        return gender === 'fem' ? { stem: headwordSi.slice(0, -1), cls: 'ii_fem' } : null;
    }
    if (last === VOWEL_SIGN_I) {
        if (gender === 'masc') return { stem: headwordSi.slice(0, -1), cls: 'i_masc' };
        if (gender === 'fem') return { stem: headwordSi.slice(0, -1), cls: 'i_fem' };
        return null;
    }
    if (last === VOWEL_SIGN_UU) {
        if (gender === 'masc') return { stem: headwordSi.slice(0, -1), cls: 'uu_masc' };
        if (gender === 'fem') return { stem: headwordSi.slice(0, -1), cls: 'uu_fem' };
        return null;
    }

    const isAntStem = headwordSi.endsWith(ANT_STEM_SUFFIX);

    if (gender === 'fem') {
        if (isAntStem) {
            if (attestedRows) {
                const nomSg = attestedRows.find(r => r.subcase === 'nom' && r.number === 'sg' && r.inflected.endsWith(VOWEL_SIGN_II));
                if (nomSg) return { stem: nomSg.inflected.slice(0, -1), cls: 'ii_fem' };
            }
            return null;
        }
        return { stem: headwordSi, cls: 'aa_fem' };
    }
    if (gender === 'masc') return { stem: headwordSi, cls: 'a_masc' };
    if (gender === 'nt') return { stem: headwordSi, cls: 'a_nt' };
    return null;
}

function generateRegularForms(stem, cls, caseCode, number) {
    const table = DECLENSION_SUFFIXES[cls];
    if (!table || !table[caseCode]) return [];
    const suffixes = table[caseCode][number] || [];
    return suffixes.map(suf => stem + suf);
}

// ================================================================
// Verb conjugation fallback generator
// ================================================================
const VERB_SUFFIXES_ATI_PR = {
    pr: {
        '3rd': { sg: ['ති'], pl: ['න්ති'], rsg: ['තෙ'], rpl: ['න්තෙ', 'රෙ'] },
        '2nd': { sg: ['සි'], pl: ['ථ'], rsg: ['සෙ'], rpl: ['ව්හෙ'] },
        '1st': { sg: ['ාමි'], pl: ['ාම'], rsg: ['ෙ'], rpl: ['ාම්හෙ'] },
    },
    imp: {
        '3rd': { sg: ['තු'], pl: ['න්තු'], rsg: ['තං'], rpl: ['න්තං', 'රුං'] },
        '2nd': { sg: ['', 'ාහි'], pl: ['ථ'], rsg: ['ස්සු'], rpl: ['ව්හො'] },
        '1st': { sg: ['ාමි'], pl: ['ාම'], rsg: ['ෙ'], rpl: ['ාමසෙ'] },
    },
    opt: {
        '3rd': { sg: ['ෙ', 'ෙය්ය'], pl: ['ෙය්යුං'], rsg: ['ෙථ'], rpl: ['ෙරං'] },
        '2nd': { sg: ['ෙ', 'ෙය්යාසි'], pl: ['ෙථ', 'ෙය්යාථ'], rsg: ['ෙථො', 'ෙය්යාථො'], rpl: ['ෙය්යව්හො', 'ෙය්යාව්හො'] },
        '1st': { sg: ['ෙ', 'ෙය්යාමි'], pl: ['ෙම', 'ෙමු', 'ෙය්යාම'], rsg: ['ෙය්යං'], rpl: ['ෙය්යාම්හෙ'] },
    },
    fut: {
        '3rd': { sg: ['ිස්සති'], pl: ['ිස්සන්ති'], rsg: ['ිස්සතෙ'], rpl: ['ිස්සන්තෙ', 'ිස්සරෙ'] },
        '2nd': { sg: ['ිස්සසි'], pl: ['ිස්සථ'], rsg: ['ිස්සසෙ'], rpl: ['ිස්සව්හෙ'] },
        '1st': { sg: ['ිස්සාමි'], pl: ['ිස්සාම'], rsg: ['ිස්සං'], rpl: ['ිස්සාම්හෙ'] },
    },
};

const KAROTI_IRREGULAR = {
    pr: {
        '3rd': { sg: ['කරොති'], pl: ['කරොන්ති'], rsg: ['කුරුතෙ'], rpl: ['කුරුන්තෙ'] },
        '2nd': { sg: ['කරොසි'], pl: ['කරොථ'], rsg: ['කුරුසෙ'], rpl: ['කුරුව්හෙ'] },
        '1st': { sg: ['කරොමි'], pl: ['කරොම'], rsg: ['කරෙ'], rpl: ['කුරුම්හෙ'] },
    },
    imp: {
        '3rd': { sg: ['කරොතු'], pl: ['කරොන්තු'], rsg: ['කුරුතං'], rpl: ['කුරුන්තං'] },
        '2nd': { sg: ['කරොහි'], pl: ['කරොථ'], rsg: ['කරස්සු', 'කුරුස්සු'], rpl: ['කුරුව්හො'] },
        '1st': { sg: ['කරොමි'], pl: ['කරොම'], rsg: ['කරෙ'], rpl: ['කරොමසි', 'කරොමසෙ'] },
    },
    opt: {
        '3rd': { sg: ['කරෙ', 'කරෙය්ය'], pl: ['කරෙය්යුං'], rsg: ['කයිරාථ'], rpl: [] },
        '2nd': { sg: ['කරෙය්යාසි'], pl: ['කරෙය්යාථ'], rsg: [], rpl: [] },
        '1st': { sg: ['කරෙය්යාමි'], pl: ['කරෙය්යාම'], rsg: ['කරෙ', 'කරෙය්යං'], rpl: ['කරෙය්යාම්හෙ'] },
    },
    fut: {
        '3rd': { sg: ['කරිස්සති'], pl: ['කරිස්සන්ති'], rsg: ['කරිස්සතෙ'], rpl: ['කරිස්සන්තෙ'] },
        '2nd': { sg: ['කරිස්සසි'], pl: ['කරිස්සථ'], rsg: ['කරිස්සසෙ'], rpl: ['කරිස්සව්හෙ'] },
        '1st': { sg: ['කරිස්සාමි'], pl: ['කරිස්සාම'], rsg: ['කරිස්සං'], rpl: ['කරිස්සාම්හෙ'] },
    },
};
const KAROTI_SUFFIX = 'කරොති';

function detectVerbClass(headwordSi) {
    if (!headwordSi) return null;
    if (headwordSi.endsWith(KAROTI_SUFFIX)) {
        return { base: headwordSi.slice(0, -KAROTI_SUFFIX.length), cls: 'karoti_irr' };
    }
    if (headwordSi.length < 3) return null;
    const n = headwordSi.length;
    if (headwordSi[n - 2] !== '\u0DAD' || headwordSi[n - 1] !== '\u0DD2') return null;
    const preceding = headwordSi[n - 3];
    const vowelSigns = new Set(['\u0DCF', '\u0DD0', '\u0DD1', '\u0DD2', '\u0DD3', '\u0DD4', '\u0DD6', '\u0DD9', '\u0DDA', '\u0DDC', '\u0DDD', '\u0DDE', '\u0D82']);
    if (vowelSigns.has(preceding)) return null;
    return { base: headwordSi.slice(0, -2), cls: 'ati_pr' };
}

function generateVerbForms(base, cls, tenseCode, person, number, reflx) {
    const key = reflx ? (number === 'sg' ? 'rsg' : 'rpl') : number;
    if (cls === 'karoti_irr') {
        const table = KAROTI_IRREGULAR[tenseCode];
        if (!table || !table[person]) return [];
        const forms = table[person][key] || [];
        return forms.map(f => base + f);
    }
    const table = VERB_SUFFIXES_ATI_PR[tenseCode];
    if (!table || !table[person]) return [];
    const suffixes = table[person][key] || [];
    return suffixes.map(suf => base + suf);
}

function uniqueForms(rows) {
    return Array.from(new Set(rows.map(r => r.inflected))).join('<br>');
}

function formsCellHtml(forms, generated) {
    if (!forms.length) return '—';
    const unique = Array.from(new Set(forms));
    if (!generated) return unique.join('<br>');
    return unique.map(f => `<span class="generated-form">${f}</span>`).join('<br>');
}

const POS_LABEL_MAP = {
    noun: 'නාම පදය', adj: 'විශේෂණය', pp: 'අතීත කෘදන්තය', prp: 'වර්තමාන කෘදන්තය',
    ptp: 'කෘත්‍ය කෘදන්තය', card: 'මූලික සංඛ්‍යාව', ordin: 'පූරණ සංඛ්‍යාව', interr: 'ප්‍රශ්නාර්ථ',
};
const NOMINAL_POS_ORDER = ['noun', 'pp', 'prp', 'ptp', 'card', 'ordin', 'interr'];

const OBLIQUE_CASES = new Set(['instr', 'dat', 'abl', 'gen', 'loc']);
function dropNomDuplicates(forms, number, nomSgForms, nomPlForms, gender) {
    if (!forms.length) return forms;
    const sameNumberNom = number === 'sg' ? nomSgForms : nomPlForms;
    const otherNumberNom = number === 'sg' ? nomPlForms : nomSgForms;

    let out = forms;
    if (sameNumberNom && sameNumberNom.length) {
        const set = new Set(sameNumberNom);
        const filtered = out.filter(f => !set.has(f));
        if (filtered.length) out = filtered;
    }
    if (otherNumberNom && otherNumberNom.length) {
        if (gender === 'masc') {
            if (out.length === 1 && otherNumberNom.includes(out[0])) {
                return [];
            }
        } else {
            const set = new Set(otherNumberNom);
            const filtered = out.filter(f => !set.has(f));
            if (filtered.length) out = filtered;
            else if (out.every(f => set.has(f))) out = [];
        }
    }
    return out;
}

function dropTruncatedNiggahita(forms) {
    if (forms.length <= 1) return forms;
    const set = new Set(forms);
    return forms.filter(f => !set.has(f + '\u0D82'));
}

function dropVocativeNiggahita(forms) {
    if (!forms.length) return forms;
    const filtered = forms.filter(f => !f.endsWith('\u0D82'));
    return filtered.length ? filtered : forms;
}

function dropAblPluralTo(forms) {
    if (!forms.length) return forms;
    const filtered = forms.filter(f => !f.endsWith('\u0DAD\u0DDC'));
    return filtered.length ? filtered : forms;
}

function dropAaseNomPl(forms) {
    if (!forms.length) return forms;
    const filtered = forms.filter(f => !f.endsWith('\u0DCF\u0DC3\u0DD9'));
    return filtered.length ? filtered : forms;
}

function completeHiBhiPair(forms, declClass, caseCode, number) {
    if (!declClass || !(caseCode === 'instr' || caseCode === 'abl') || number !== 'pl') {
        return { forms, addedGenerated: false };
    }
    const table = DECLENSION_SUFFIXES[declClass.cls];
    const suffixes = table && table[caseCode] && table[caseCode].pl;
    if (!suffixes || !suffixes.length) return { forms, addedGenerated: false };
    const have = new Set(forms);
    let addedGenerated = false;
    const out = forms.slice();
    suffixes.forEach(suf => {
        const candidate = declClass.stem + suf;
        if (!have.has(candidate)) { out.push(candidate); have.add(candidate); addedGenerated = true; }
    });
    return { forms: out, addedGenerated };
}

function buildInflectionTablesHTML(rows, headwordSi) {
    if (!rows || rows.length === 0) {
        return '<div class="inflection-empty">මෙම වචනයට වර නැගීම් දත්ත හමු නොවීය.</div>';
    }

    let html = '';
    let usedGeneratedForms = false;

    const nominalRows = rows.filter(r => NOMINAL_POS_ORDER.includes(r.pos));
    const posPresent = NOMINAL_POS_ORDER.filter(p => nominalRows.some(r => r.pos === p));
    const showPosHeader = posPresent.length > 1;

    posPresent.forEach(pos => {
        const posRows = nominalRows.filter(r => r.pos === pos);
        if (showPosHeader) {
            html += `<div class="inflection-pos-title">${POS_LABEL_MAP[pos] || pos}</div>`;
        }
        INFL_GENDER_ORDER.filter(g => posRows.some(r => r.category === g)).forEach(g => {
            const genderRows = posRows.filter(r => r.category === g);
            const declClass = detectDeclensionClass(headwordSi, g, genderRows);
            const nomSgForms = genderRows.filter(r => r.subcase === 'nom' && r.number === 'sg').map(r => r.inflected);
            const nomPlForms = genderRows.filter(r => r.subcase === 'nom' && r.number === 'pl').map(r => r.inflected);

            const caseRows = INFL_CASE_ORDER
                .map(c => {
                    let sgForms = genderRows.filter(r => r.subcase === c && r.number === 'sg').map(r => r.inflected);
                    let plForms = genderRows.filter(r => r.subcase === c && r.number === 'pl').map(r => r.inflected);
                    let sgGenerated = false, plGenerated = false;

                    if (c === 'dat' || c === 'gen') {
                        sgForms = dropTruncatedNiggahita(sgForms);
                        plForms = dropTruncatedNiggahita(plForms);
                    }
                    if (OBLIQUE_CASES.has(c)) {
                        sgForms = dropNomDuplicates(sgForms, 'sg', nomSgForms, nomPlForms, g);
                        plForms = dropNomDuplicates(plForms, 'pl', nomSgForms, nomPlForms, g);
                    }
                    if (c === 'voc') {
                        sgForms = dropVocativeNiggahita(sgForms);
                        plForms = dropVocativeNiggahita(plForms);
                    }
                    if (c === 'abl') {
                        plForms = dropAblPluralTo(plForms);
                    }
                    if (c === 'nom') {
                        plForms = dropAaseNomPl(plForms);
                    }

                    if (!sgForms.length && declClass) {
                        const gen = generateRegularForms(declClass.stem, declClass.cls, c, 'sg');
                        if (gen.length) { sgForms = gen; sgGenerated = true; usedGeneratedForms = true; }
                    }
                    if (!plForms.length && declClass) {
                        const gen = generateRegularForms(declClass.stem, declClass.cls, c, 'pl');
                        if (gen.length) { plForms = gen; plGenerated = true; usedGeneratedForms = true; }
                    } else if (plForms.length && declClass) {
                        const completed = completeHiBhiPair(plForms, declClass, c, 'pl');
                        if (completed.addedGenerated) { plForms = completed.forms; plGenerated = true; usedGeneratedForms = true; }
                    }
                    return { code: c, sgForms, plForms, sgGenerated, plGenerated };
                })
                .filter(r => r.sgForms.length || r.plForms.length);
            if (!caseRows.length) return;

            html += `<div class="inflection-group-title">${INFL_GENDER_LABELS[g]}</div>`;
            html += '<div class="inflection-table-wrapper"><table class="inflection-table">';
            html += `<tr><th class="inflection-corner"></th><th>${INFL_NUMBER_LABELS.sg}</th><th>${INFL_NUMBER_LABELS.pl}</th></tr>`;
            caseRows.forEach(r => {
                html += `<tr><th>${INFL_CASE_LABELS[r.code]}</th><td>${formsCellHtml(r.sgForms, r.sgGenerated)}</td><td>${formsCellHtml(r.plForms, r.plGenerated)}</td></tr>`;
            });
            html += '</table></div>';
        });
    });

    INFL_PRON_PERSON_ORDER.filter(p => rows.some(r => r.category === p && INFL_CASE_ORDER.includes(r.subcase))).forEach(p => {
        const personRows = rows.filter(r => r.category === p && INFL_CASE_ORDER.includes(r.subcase));
        const caseRows = INFL_CASE_ORDER
            .map(c => ({
                code: c,
                sg: personRows.filter(r => r.subcase === c && r.number === 'sg'),
                pl: personRows.filter(r => r.subcase === c && r.number === 'pl'),
            }))
            .filter(r => r.sg.length || r.pl.length);
        if (!caseRows.length) return;

        html += `<div class="inflection-group-title">${INFL_PRON_PERSON_LABELS[p]}</div>`;
        html += '<div class="inflection-table-wrapper"><table class="inflection-table">';
        html += `<tr><th class="inflection-corner"></th><th>${INFL_NUMBER_LABELS.sg}</th><th>${INFL_NUMBER_LABELS.pl}</th></tr>`;
        caseRows.forEach(r => {
            html += `<tr><th>${INFL_CASE_LABELS[r.code]}</th><td>${r.sg.length ? uniqueForms(r.sg) : '—'}</td><td>${r.pl.length ? uniqueForms(r.pl) : '—'}</td></tr>`;
        });
        html += '</table></div>';
    });

    const verbRows = rows.filter(r => INFL_PERSON_ORDER.includes(r.subcase));
    if (verbRows.length) {
        const verbClass = detectVerbClass(headwordSi);
        const GENERATABLE_TENSES = ['pr', 'imp', 'opt', 'fut'];
        const presentCategories = new Set(verbRows.map(r => r.category));
        const plainTenses = INFL_TENSE_ORDER.filter(t => presentCategories.has(t));
        const reflxTenses = INFL_TENSE_ORDER.filter(t => presentCategories.has('reflx ' + t));
        const hasReflx = reflxTenses.length > 0 || !!verbClass;
        const VERB_ROW_PERSON_ORDER = ['3rd', '2nd', '1st'];
        const tenseUnion = INFL_TENSE_ORDER.filter(t =>
            plainTenses.includes(t) || reflxTenses.includes(t) || (verbClass && GENERATABLE_TENSES.includes(t))
        );

        if (tenseUnion.length) {
            html += '<div class="inflection-group-title">ක්‍රියා පදය</div>';
            html += '<div class="inflection-table-wrapper"><table class="inflection-table">';
            html += `<tr><th class="inflection-corner"></th><th>${INFL_NUMBER_LABELS.sg}</th><th>${INFL_NUMBER_LABELS.pl}</th>`;
            if (hasReflx) html += `<th>ආත්ම. ${INFL_NUMBER_LABELS.sg}</th><th>ආත්ම. ${INFL_NUMBER_LABELS.pl}</th>`;
            html += '</tr>';

            tenseUnion.forEach(tenseCode => {
                const canGenerate = verbClass && GENERATABLE_TENSES.includes(tenseCode);
                VERB_ROW_PERSON_ORDER.forEach(person => {
                    let sgForms = verbRows.filter(r => r.category === tenseCode && r.subcase === person && r.number === 'sg').map(r => r.inflected);
                    let plForms = verbRows.filter(r => r.category === tenseCode && r.subcase === person && r.number === 'pl').map(r => r.inflected);
                    let rSgForms = hasReflx ? verbRows.filter(r => r.category === 'reflx ' + tenseCode && r.subcase === person && r.number === 'sg').map(r => r.inflected) : [];
                    let rPlForms = hasReflx ? verbRows.filter(r => r.category === 'reflx ' + tenseCode && r.subcase === person && r.number === 'pl').map(r => r.inflected) : [];
                    let sgGen = false, plGen = false, rSgGen = false, rPlGen = false;

                    if (canGenerate) {
                        if (!sgForms.length) { const g = generateVerbForms(verbClass.base, verbClass.cls, tenseCode, person, 'sg', false); if (g.length) { sgForms = g; sgGen = true; usedGeneratedForms = true; } }
                        if (!plForms.length) { const g = generateVerbForms(verbClass.base, verbClass.cls, tenseCode, person, 'pl', false); if (g.length) { plForms = g; plGen = true; usedGeneratedForms = true; } }
                        if (!rSgForms.length) { const g = generateVerbForms(verbClass.base, verbClass.cls, tenseCode, person, 'sg', true); if (g.length) { rSgForms = g; rSgGen = true; usedGeneratedForms = true; } }
                        if (!rPlForms.length) { const g = generateVerbForms(verbClass.base, verbClass.cls, tenseCode, person, 'pl', true); if (g.length) { rPlForms = g; rPlGen = true; usedGeneratedForms = true; } }
                    }
                    if (!sgForms.length && !plForms.length && !rSgForms.length && !rPlForms.length) return;

                    const rowLabel = `${INFL_TENSE_LABELS[tenseCode]} (${INFL_PERSON_LABELS[person]})`;
                    html += `<tr><th>${rowLabel}</th><td>${formsCellHtml(sgForms, sgGen)}</td><td>${formsCellHtml(plForms, plGen)}</td>`;
                    if (hasReflx) html += `<td>${formsCellHtml(rSgForms, rSgGen)}</td><td>${formsCellHtml(rPlForms, rPlGen)}</td>`;
                    html += '</tr>';
                });
            });

            html += '</table></div>';
        }
    }

    return html || '<div class="inflection-empty">මෙම වචනයට වර නැගීම් දත්ත හමු නොවීය.</div>';
}

window.toggleInflection = function (id, headword) {
    const panel = document.getElementById(`inflection-${id}`);
    if (!panel) return;

    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        panel.classList.remove('open');
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    panel.classList.add('open');
    if (panel.dataset.loaded === '1') return;

    panel.innerHTML = '<div class="inflection-loading"></div>';
    const holder = panel.firstChild;
    const onProg = (p) => renderLoadProgress(holder, p);
    onProg(inflLoadPct);
    inflProgressListeners.add(onProg);
    getInflectionIndex()
        .finally(() => inflProgressListeners.delete(onProg))
        .then(state => {
            const rows = lazyInflectionLookup(state, headword);
            panel.innerHTML = buildInflectionTablesHTML(rows, headword);
            panel.dataset.loaded = '1';
        })
        .catch(err => {
            const detail = (err && err.message) ? err.message : String(err);
            panel.innerHTML = '<div class="inflection-empty">වර නැගීම් දත්ත පූරණය කළ නොහැකි විය.<br><small style="opacity:0.7;word-break:break-all;">' + detail + '</small></div>';
        });
};

// --- Search Input & Suggestions ---
let searchTimeout;

// වර නැගුණු රූප සඳහා suggestions (උපරිම 3ක්). මූල වචන ලැයිස්තුවේ දැනටමත් ඇති ඒවා මඟ හරියි.
function getInflectionSuggestions(rawQuery, possibleMatches, headMatchSet) {
    return findInflectionRefs(rawQuery, possibleMatches)
        .filter(r => !headMatchSet.has(r.form))
        .slice(0, 3)
        .map(r => ({ word: r.form, hint: r.entries.map(e => e.headword).join(', ') }));
}

function updateSuggestions() {
    clearTimeout(searchTimeout);
    const rawQuery = searchInput.value.trim().toLowerCase().replace(/[0-9]/g, '').normalize('NFC');
    const possibleMatches = isSinglishQuery(rawQuery) ? getPossibleMatches(rawQuery) : [];

    suggestionsBox.innerHTML = "";
    suggestionsBox.classList.remove('is-history');
    if (rawQuery.length < 1) {
        suggestionsBox.style.display = "none";
        return;
    }

    searchTimeout = setTimeout(() => {
        // ඉංග්‍රීසි අකුරින් ටයිප් කළ විට, ඉංග්‍රීසි වචන (උදා: dog) පාලි Singlish ප්‍රතිඵල වලින් පිරී
        // කපාහැරීම වැළැක්වීමට, ඒවා වෙනම එකතු කර ස්ථාන ඇතුළත් කරයි.
        const latinQuery = /^[a-z]/.test(rawQuery);
        const headMatches = new Set();        // පාලි / සිංහල වචන (Singlish හරහා ද)
        const englishMatches = new Map();     // ඉංග්‍රීසි වචන -> තේරුමේ දිග (නිතර යෙදෙන වචන හඳුනාගැනීමට)
        availableDicts.filter(d => d.enabled).forEach(dict => {
            if (dict.data && Array.isArray(dict.data)) {
                dict.data.forEach(item => {
                    if (!item || !item.word) return;
                    const w = item.word.toLowerCase();
                    if (w.startsWith(rawQuery)) {
                        if (latinQuery) {
                            const len = (item.meaning || '').length;
                            if (len > (englishMatches.get(item.word) || -1)) englishMatches.set(item.word, len);
                        } else {
                            headMatches.add(item.word);
                        }
                    } else if (possibleMatches.length && possibleMatches.some(pm => w.startsWith(pm))) {
                        headMatches.add(item.word);
                    }
                });
            }
        });

        // ඉංග්‍රීසි වචන 4ක් දක්වා: සම්පූර්ණ ගැළපුම මුලින්, ඉන්පසු තේරුම් වැඩි (සාමාන්‍ය) වචන
        const english = Array.from(englishMatches.entries())
            .sort((a, b) =>
                ((b[0].toLowerCase() === rawQuery) - (a[0].toLowerCase() === rawQuery)) ||
                (b[1] - a[1]) ||
                (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            .slice(0, 4)
            .map(e => ({ word: e[0], hint: '' }));

        // අනුපිළිවෙල: වර නැගුණු රූප (මය්හං → අහං), මූල වචන 2ක්, ඉංග්‍රීසි වචන, ඉතිරි මූල වචන
        // (suggestions box එක උසට සීමා වන නිසා ඉංග්‍රීසි වචන scroll නොකර පෙනීමට මැදට දමයි)
        const inflSug = getInflectionSuggestions(rawQuery, possibleMatches, headMatches);
        const headSug = Array.from(headMatches).map(w => ({ word: w, hint: '' }));
        const suggestions = inflSug
            .concat(headSug.slice(0, 2), english, headSug.slice(2))
            .slice(0, 10);

        if (suggestions.length > 0) {
            suggestions.forEach(sug => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';

                const main = document.createElement('span');
                main.textContent = sug.word;
                div.appendChild(main);

                if (sug.hint) {
                    const hint = document.createElement('span');
                    hint.className = 'suggestion-hint';
                    hint.textContent = '→ ' + sug.hint;
                    div.appendChild(hint);
                }

                div.onclick = () => {
                    searchInput.value = sug.word;
                    suggestionsBox.style.display = "none";
                    addToSearchHistory(sug.word);
                    performSearch(sug.word, true);
                };
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = "block";
        } else {
            suggestionsBox.style.display = "none";
        }
    }, 150);
}

searchInput.addEventListener('input', updateSuggestions);

const historyBtn = document.getElementById('historyBtn');

document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target) &&
        !(historyBtn && historyBtn.contains(e.target))) {
        suggestionsBox.style.display = "none";
    }
});

searchBtn.addEventListener('click', () => {
    clearTimeout(searchTimeout);          // ටයිප් කළ විගස සෙවූ විට පසුව suggestions මතු නොවීමට
    suggestionsBox.style.display = "none";
    addToSearchHistory(searchInput.value);
    performSearch(searchInput.value.trim(), false);
});
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        suggestionsBox.style.display = "none";
        addToSearchHistory(searchInput.value);
        performSearch(searchInput.value.trim(), false);
    }
});

// ================================================================
// සෙවුම් ඉතිහාසය — සෙවුම් තීරුවේ ඔරලෝසු සලකුණ
// අවසානයට සෙවූ වචන 20 ක් දක්වා (අලුත්ම ඒවා මුලින්) මෙම උපාංගයේ පමණක් සුරැකේ.
// ලැයිස්තුවේ වචනයක් තට්ටු කළ විට එය නැවත සොයයි; × මඟින් එක් වචනයක් ද,
// "සියල්ල මකන්න" මඟින් සම්පූර්ණ ලැයිස්තුව ද ඉවත් කළ හැක.
// ================================================================
const SEARCH_HISTORY_KEY = 'searchHistory';
const SEARCH_HISTORY_MAX = 20;

function loadSearchHistory() {
    try {
        const a = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).slice(0, SEARCH_HISTORY_MAX) : [];
    } catch (e) { return []; }
}

function saveSearchHistory(list) {
    try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, SEARCH_HISTORY_MAX))); } catch (e) {}
}

function addToSearchHistory(word) {
    const w = String(word || '').trim().normalize('NFC');
    if (!w) return;
    const key = w.toLowerCase();
    const list = loadSearchHistory().filter(x => x.toLowerCase() !== key);
    list.unshift(w);
    saveSearchHistory(list);
}

function removeFromSearchHistory(word) {
    const key = String(word).toLowerCase();
    saveSearchHistory(loadSearchHistory().filter(x => x.toLowerCase() !== key));
}

function showSearchHistory() {
    clearTimeout(searchTimeout);
    const list = loadSearchHistory();
    suggestionsBox.innerHTML = '';
    suggestionsBox.classList.add('is-history');

    const head = document.createElement('div');
    head.className = 'history-head';
    const title = document.createElement('span');
    title.textContent = 'කලින් සෙවූ වචන';
    head.appendChild(title);
    if (list.length) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'history-clear';
        clear.textContent = 'සියල්ල මකන්න';
        clear.onclick = (e) => {
            e.stopPropagation();
            saveSearchHistory([]);
            showSearchHistory();
        };
        head.appendChild(clear);
    }
    suggestionsBox.appendChild(head);

    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = 'තවම වචන සොයා නැත.';
        suggestionsBox.appendChild(empty);
    }

    list.forEach(word => {
        const div = document.createElement('div');
        div.className = 'suggestion-item history-item';

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('class', 'history-item-icon');
        icon.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#icon-history');
        icon.appendChild(use);
        div.appendChild(icon);

        const main = document.createElement('span');
        main.className = 'history-word';
        main.textContent = word;
        div.appendChild(main);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'history-del';
        del.title = 'ඉවත් කරන්න';
        del.setAttribute('aria-label', 'ඉවත් කරන්න');
        del.innerHTML = '&times;';
        del.onclick = (e) => {
            e.stopPropagation();
            removeFromSearchHistory(word);
            showSearchHistory();
        };
        div.appendChild(del);

        div.onclick = () => {
            searchInput.value = word;
            suggestionsBox.style.display = 'none';
            addToSearchHistory(word);
            performSearch(word, false);
        };
        suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
    suggestionsBox.scrollTop = 0;
}

if (historyBtn) {
    historyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const open = suggestionsBox.style.display === 'block' && suggestionsBox.classList.contains('is-history');
        if (open) {
            suggestionsBox.style.display = 'none';
        } else {
            showSearchHistory();
        }
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && suggestionsBox.classList.contains('is-history')) suggestionsBox.style.display = 'none';
});

// ================================================================
// WORD CARD (v2) — තේරුම් කාඩ් එක
// පදය + දකුණු පැත්තේ "වර නැගීම" බටනය, අර්ථ අංක අනුව වෙන් කළ කොටස්
// (සිංහල තේරුම · පද බෙදීම · ව්‍යාකරණ විස්තරය · සංඥා නාම · නිරුක්තිය),
// යටින් යන්තම් පෙනෙන ජ්‍යාමිතික රටා / පහන් / දාගැබ් පසුබිම.
// ================================================================
const CARD_PATTERN_HTML =
    '<div class="card-pattern" aria-hidden="true">' +
        '<span class="cp-lattice"></span>' +
        '<span class="cp-rosette cp-rosette--a"><i class="cp-fill"></i><i class="cp-line"></i></span>' +
        '<span class="cp-rosette cp-rosette--b"><i class="cp-fill"></i><i class="cp-line"></i></span>' +
        '<span class="cp-lantern cp-lantern--a"><i></i></span>' +
        '<span class="cp-lantern cp-lantern--b"><i></i></span>' +
        '<span class="cp-skyline"></span>' +
        '<span class="cp-sheen"></span>' +
    '</div>';

const WC_ICON_TABLE = '<svg class="ib-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const WC_ICON_CHEVRON = '<svg class="ib-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// පද බෙදීමේ ධාතුව (√...) වෙනම වර්ණයකින් පෙන්වයි
function formatWordDivision(text) {
    return escapeHtml(text).replace(/√[^\s()+>,]+/g, m => `<span class="wc-root">${m}</span>`);
}

// පද බෙදීමේ ධාතුව පමණක් ඇත්නම් (උදා: "√නර්") — "ධාතුව" ලෙස පෙන්වයි
function isRootOnly(text) {
    return /^\s*√[^\s()+>,]+\s*$/.test(String(text));
}

// ව්‍යාකරණ විස්තරය: පේළි කිහිපයක් ඇත්නම් (පද සෑදීමේ පියවර) පියවර ලැයිස්තුවක් ලෙස,
// " | " මඟින් වෙන් කළ කොටස් වෙන වෙනම පේළි ලෙස පෙන්වයි.
function formatGrammarDesc(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    if (lines.length === 1) {
        const parts = lines[0].split(/\s+\|\s+/).filter(Boolean);
        if (parts.length > 1) {
            return parts.map(p => `<div class="gd-part">${escapeHtml(p)}</div>`).join('');
        }
        return `<div class="gd-text">${escapeHtml(lines[0])}</div>`;
    }
    return `<div class="gd-text">${escapeHtml(lines[0])}</div>` +
        `<ol class="gd-steps">${lines.slice(1).map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ol>`;
}

function parseEtymLine(line) {
    let rest = line, source = '';
    const src = rest.match(/\s*\[([^\[\]]+)\]\s*$/);
    if (src) { source = src[1].trim(); rest = rest.slice(0, src.index).trim(); }

    // පාලි නිරුක්ති වාක්‍යය සහ වරහන් තුළ ඇති සිංහල විවරණය වෙන් කිරීම
    let pali = rest, sinhala = '';
    const cut = rest.match(/\s+[—–-]\s*(?=[({])|\.\s*(?=\()|\s*(?=\{[^{}]+\}\s*$)/);
    if (cut) {
        pali = rest.slice(0, cut.index).trim();
        sinhala = stripOuterBrackets(rest.slice(cut.index + cut[0].length).trim());
    }
    return { pali: pali.replace(/[\s.]+$/, ''), sinhala, source };
}

// සම්පූර්ණ කොටසම වට කර ඇති පිටත ( ) හෝ { } යුගලය ඉවත් කරයි
function stripOuterBrackets(s) {
    const open = s[0], close = open === '(' ? ')' : open === '{' ? '}' : '';
    if (!close || !s.endsWith(close)) return s;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === open) depth++;
        else if (s[i] === close) depth--;
        if (depth === 0 && i < s.length - 1) return s;
    }
    return s.slice(1, -1).trim();
}

// නිරුක්තිය: "1. ...\n2. ..." ලෙස ඇති නිරුක්ති අංක ඉවත් කර වෙන වෙනම කොටස් ලෙස වෙන් කරයි.
// එක් එක් නිරුක්තියක් → { pali, sinhala, source }
function parseEtymology(text) {
    // { text, start } — start: අංකයකින් ආරම්භ වූ (නව නිරුක්තියක්) පේළියක්ද යන්න
    const lines = [];
    let pendingStart = false;
    String(text).split(/\r?\n/).forEach(raw => {
        const t = raw.trim();
        if (!t) return;
        const m = t.match(/^\d+\s*[\.\)]\s*/);
        const body = m ? t.slice(m[0].length).trim() : t;
        if (!body) { pendingStart = true; return; }   // අංකය පමණක් ඇති පේළිය
        lines.push({ text: body, start: !!m || pendingStart });
        pendingStart = false;
    });

    const out = [], seen = new Set();
    for (let i = 0; i < lines.length; i++) {
        const e = parseEtymLine(lines[i].text);
        // සිංහල විවරණය ඊළඟ පේළියේ ඇත්නම් (පාලි පේළිය / සිංහල පේළිය ලෙස)
        const next = lines[i + 1];
        if (!e.sinhala && next && !next.start && !parseEtymLine(next.text).sinhala) {
            const n = parseEtymLine(next.text);
            e.sinhala = stripOuterBrackets(n.pali.replace(/[\s.]+$/, ''));
            if (!e.source) e.source = n.source;
            i++;
        }
        const key = e.pali + '|' + e.sinhala + '|' + e.source;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(e);
    }
    return out;
}

// පාලි කොටසේ අවසාන පදය (නිරුක්තියෙන් සිද්ධ වන පදය) උද්දීපනය කරයි
function formatEtymPali(pali) {
    const m = pali.match(/^([\s\S]*?)(\s*[–—-]\s*|\s+)?([^\s–—-]+)$/);
    if (!m || !m[1]) return escapeHtml(pali);
    const sep = m[2] ? (/[–—-]/.test(m[2]) ? ' <span class="et-dash">–</span> ' : ' ') : '';
    return `${escapeHtml(m[1])}${sep}<b class="et-word">${escapeHtml(m[3])}</b>`;
}

function formatEtymology(entries) {
    return `<ul class="et-list">` + entries.map(e =>
        `<li class="et-item">` +
            `<div class="et-pali">${formatEtymPali(e.pali)}</div>` +
            (e.sinhala ? `<div class="et-sinhala">${escapeHtml(e.sinhala)}</div>` : '') +
            (e.source ? `<div class="et-source"><span>${escapeHtml(e.source)}</span></div>` : '') +
        `</li>`
    ).join('') + `</ul>`;
}

function buildWcBlock(kind, label, bodyHtml, extraHead) {
    return `<div class="wc-block wc-block--${kind}">` +
        `<div class="wc-label"><span>${label}</span>${extraHead || ''}</div>` +
        `<div class="wc-text">${bodyHtml}</div></div>`;
}

function buildSenseHTML(item, idx, total, isPali, mainWord) {
    const showNum = total > 1;
    const divHtml = item.wordDivision
        ? `<span class="wc-head-div"><span class="wc-division-label">${isRootOnly(item.wordDivision) ? 'ධාතුව' : 'පද බෙදීම'}:</span> ` +
          `<span class="wc-division-value">${formatWordDivision(item.wordDivision)}</span></span>`
        : '';
    const head = (showNum || item.type || divHtml)
        ? `<div class="wc-sense-head">` +
              (showNum ? `<span class="wc-num">${idx + 1}</span>` : '') +
              (item.type ? `<span class="wc-type">${escapeHtml(item.type)}</span>` : '') +
              divHtml +
          `</div>`
        : '';

    let body = '';
    if (item.meaning) {
        const meaningHtml = escapeHtml(item.meaning).replace(/\s*\|\s*/g, '<span class="wc-sep" aria-hidden="true"></span>');
        body += buildWcBlock('meaning', isPali ? 'සිංහල තේරුම' : 'තේරුම', meaningHtml);
    }
    if (item.grammarDesc) body += buildWcBlock('grammar', 'ව්‍යාකරණ විස්තරය', formatGrammarDesc(item.grammarDesc));
    if (item.properNoun)  body += buildWcBlock('proper', 'සංඥා නාම විස්තරය', escapeHtml(item.properNoun));
    if (item.etymology) {
        const etyms = parseEtymology(item.etymology);
        if (etyms.length) {
            body += buildWcBlock('etym', etyms.length > 1 ? 'නිරුක්ති' : 'නිරුක්තිය', formatEtymology(etyms));
        }
    }

    return `<div class="wc-sense" style="--i:${Math.min(idx, 8)}">${head}<div class="wc-sense-body">${body}</div></div>`;
}

function buildWordCard(dict, mainWord, items, cardIdx) {
    const isPali = dict.id === 'pali';
    const card = document.createElement('div');
    card.className = 'word-card wc-v2' + (isPali ? '' : ' wc-sien') + (cardIdx % 2 ? ' wc-alt' : '');

    const safeWord = escapeHtml(mainWord);
    const panelId = `${dict.id}-${items[0].id}`;
    const rightSide = isPali
        ? `<button type="button" class="wc-infl-btn" data-infl-id="${escapeHtml(panelId)}" data-headword="${safeWord}" aria-expanded="false">` +
              `${WC_ICON_TABLE}<span>වර නැගීම</span>${WC_ICON_CHEVRON}</button>`
        : `<span class="dict-tag">${escapeHtml(dict.name)}</span>`;

    let html = CARD_PATTERN_HTML +
        `<div class="wc-head"><h2 class="wc-word">${safeWord}</h2>${rightSide}</div>` +
        `<div class="wc-divider" aria-hidden="true"><i></i></div>`;

    if (isPali) html += `<div id="inflection-${escapeHtml(panelId)}" class="inflection-panel"></div>`;

    html += `<div class="wc-senses">${items.map((item, i) => buildSenseHTML(item, i, items.length, isPali, mainWord)).join('')}</div>`;

    if (isPali) {
        html += `<div class="card-footer"><a class="correction-link" href="#" data-feedback data-feedback-word="${safeWord}">` +
                `<svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-edit"></use></svg> වැරදි නිවැරදි කරන්න</a></div>`;
    }

    card.innerHTML = html;
    return card;
}

// වර නැගීම බටනය (event delegation)
resultsContainer.addEventListener('click', function (e) {
    const target = e.target && e.target.closest ? e.target : null;
    if (!target) return;

    const inflBtn = target.closest('.wc-infl-btn');
    if (inflBtn) {
        const id = inflBtn.getAttribute('data-infl-id');
        window.toggleInflection(id, inflBtn.getAttribute('data-headword'));
        const panel = document.getElementById(`inflection-${id}`);
        const open = !!(panel && panel.classList.contains('open'));
        inflBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        inflBtn.classList.toggle('is-open', open);
        if (open && panel) {
            setTimeout(() => {
                try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) { /* ignore */ }
            }, 60);
        }
    }
});

// --- Search Logic ---
let searchToken = 0;

function performSearch(query, exactOnly = false) {
    if (!query) return;
    lastSearch = { query, exactOnly };
    const myToken = ++searchToken;
    const lowerQuery = query.toLowerCase().replace(/[0-9]/g, '').trim().normalize('NFC');
    const possibleMatches = isSinglishQuery(lowerQuery) ? getPossibleMatches(lowerQuery) : [];

    // වර නැගීම් index එක තවම පූරණය වී නොමැති නම්, පූරණය වූ පසු මෙම සෙවුම නැවත ක්‍රියාත්මක කරයි
    if (!inflectionState) {
        getInflectionIndex()
            .then(() => {
                if (myToken !== searchToken || !inflectionState) return;
                // නැවත සෙවීමේදී විවෘතව තිබූ වර නැගීම් පැනල නැවත විවෘත කරයි
                const openIds = Array.from(document.querySelectorAll('.inflection-panel.open'))
                    .map(el => el.id.replace(/^inflection-/, ''));
                const y = window.scrollY;
                performSearch(query, exactOnly);
                openIds.forEach(id => {
                    const btn = document.querySelector(`.wc-infl-btn[data-infl-id="${CSS.escape(id)}"]`);
                    if (btn) btn.click();
                });
                window.scrollTo(0, y);
            })
            .catch(() => {});
    }

    // ටයිප් කළ වචනය වර නැගුණු රූපයක් නම් එහි මූල වචන (cross-reference)
    const inflRefs = findInflectionRefs(lowerQuery, possibleMatches);
    const hasInflRefs = inflRefs.length > 0;

    resultsContainer.innerHTML = "";
    let hasResults = false;

    availableDicts.filter(d => d.enabled).forEach(dict => {
        if (!dict.data || !Array.isArray(dict.data) || dict.data.length === 0) return;

        let matches = dict.data.filter(item => {
            if (!item || !item.word) return false;
            const w = item.word.toLowerCase().trim();
            return w === lowerQuery || possibleMatches.some(pm => w === pm);
        });

        if (matches.length === 0 && !exactOnly && !hasInflRefs) {
            matches = dict.data.filter(item => {
                if (!item || !item.word) return false;
                const w = item.word.toLowerCase();
                return w.includes(lowerQuery) || possibleMatches.some(pm => w.includes(pm));
            });
        }

        if (matches.length === 0 && !exactOnly && !hasInflRefs) {
            matches = dict.data.filter(item => {
                if (!item || !item.meaning) return false;
                const m = item.meaning.toLowerCase();
                return m.includes(lowerQuery) || possibleMatches.some(pm => m.includes(pm));
            });
        }

        if (matches.length > 0) {
            hasResults = true;
            const groupedByWord = {};
            matches.forEach(item => {
                if (!groupedByWord[item.word]) groupedByWord[item.word] = [];
                groupedByWord[item.word].push(item);
            });

            Object.keys(groupedByWord).forEach((mainWord, cardIdx) => {
                const card = buildWordCard(dict, mainWord, groupedByWord[mainWord], cardIdx);
                resultsContainer.appendChild(card);
            });
        }
    });

    if (hasInflRefs) {
        inflRefs.forEach(ref => resultsContainer.appendChild(buildInflectionRefCard(ref)));
        hasResults = true;
    }

    if (!hasResults) {
        resultsContainer.innerHTML = '<div class="no-results">ගැලපෙන වචන කිසිවක් හමු නොවීය.</div>';
    }
}

// --- Tab Switching Logic ---
function switchTab(tabId, titleText, fromPopState = false) {
    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => {
        if(el.id !== 'themeToggleBtn') el.classList.remove('active');
    });

    document.getElementById(`tab-${tabId}`).classList.add('active');
    if (tabId === 'info') updateDictStats();
    const activeNav = document.getElementById(`nav-${tabId}`);
    if(activeNav) activeNav.classList.add('active');

    // #pageTitle element එක index.html හි නැත — නැතිවිට දෝෂයක් නොවී ඉදිරියට යයි
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) pageTitleEl.innerText = titleText;

    if (!fromPopState) {
        const currentTab = (history.state && history.state.tab) ? history.state.tab : 'home';

        if (tabId !== 'home') {
            if (currentTab === 'home') {
                history.pushState({ tab: tabId, title: titleText }, '');
            } else {
                history.replaceState({ tab: tabId, title: titleText }, '');
            }
        } else if (currentTab !== 'home') {
            history.replaceState({ tab: 'home', title: titleText }, '');
        }
    }
}

// --- Back Button Control ---
window.addEventListener('popstate', function(e) {
    const tab = (e.state && e.state.tab) ? e.state.tab : 'home';
    const title = (e.state && e.state.title) ? e.state.title : 'Pāli Sinhala Ultimate (PSU)';
    switchTab(tab, title, true);
});

// --- Theme & Settings Functions ---
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    document.getElementById('themeIcon').setAttribute('href', isDark ? '#icon-sun' : '#icon-moon');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    syncAppBars();
}

// --- Zoom / Text Size Functions ---
function applyZoomPreview(value) {
    currentUserZoom = String(value);
    applyContainerZoom(value);
    const label = document.getElementById('zoomValueLabel');
    if (label) label.textContent = value + '%';
}

function saveZoom(value) {
    localStorage.setItem('zoomLevel', String(value));
}

window.openZoomPanel = function () {
    const overlay = document.getElementById('zoomOverlay');
    const zoomSlider = document.getElementById('zoomSlider');
    if (!overlay) return;
    const current = localStorage.getItem('zoomLevel') || '100';
    if (zoomSlider) zoomSlider.value = current;
    applyZoomPreview(current);
    overlay.classList.add('active');
};

window.closeZoomPanel = function (e) {
    const overlay = document.getElementById('zoomOverlay');
    if (overlay) overlay.classList.remove('active');
};

// ================================================================
// Pinch zoom (ඇඟිලි දෙකෙන් විශාල/කුඩා කිරීම) සහ double tap (සාමාන්‍ය ප්‍රමාණයට)
// සුමට ලෙස ක්‍රියා කිරීමට: ඇඟිලි චලනය වන අතරතුර පිටුව නැවත සකස් (re-layout) නොකර
// GPU transform (scale) එකක් පමණක් යොදයි; ඇඟිලි ඉවත් කළ පසු එක් වරක් පමණක් සැබෑ
// zoom අගය යොදා, ඇඟිලි තිබූ තැනම අන්තර්ගතය රැඳී සිටින සේ scroll එක ගළපයි.
// අගය zoom panel එකේ slider / ප්‍රතිශතයටද එසැණින් යෙදී, සුරැකේ.
// පරිගණකයේ Ctrl + mouse wheel / trackpad pinch ද ක්‍රියා කරයි.
// ================================================================
(function setupGestureZoom() {
    const MIN = 50, MAX = 200, STEP = 5;
    const clampRaw = v => Math.min(MAX, Math.max(MIN, v));
    const snap = v => Math.round(clampRaw(v) / STEP) * STEP;
    const getZoom = () => parseFloat(currentUserZoom) || 100;
    const root = document.documentElement;

    let toast = null;
    function showZoomToast(v) {
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'zoomToast';
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.textContent = v + '%';
        toast.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => toast.classList.remove('show'), 900);
    }

    function syncPanel(v) {
        const label = document.getElementById('zoomValueLabel');
        if (label) label.textContent = v + '%';
        const slider = document.getElementById('zoomSlider');
        if (slider) slider.value = v;
    }

    // ---------- Transform preview (gesture අතරතුර) ----------
    let pv = null;

    function beginPreview(cx, cy) {
        const box = document.querySelector('.container');
        if (!box) return null;
        const r = box.getBoundingClientRect();
        const f = (getZoom() / 100) * getAutoFitScale();     // .container හි වත්මන් zoom ගුණකය

        // ඇඟිලි යට ඇති අංගය — අවසානයේ එය එම තැනටම ගෙන ඒමට
        let anchor = document.elementFromPoint(cx, cy);
        if (anchor && !box.contains(anchor)) anchor = null;
        let frac = 0;
        if (anchor) {
            const ar = anchor.getBoundingClientRect();
            frac = ar.height ? (cy - ar.top) / ar.height : 0;
        }

        box.style.transformOrigin = `${(cx - r.left) / f}px ${(cy - r.top) / f}px`;
        box.style.willChange = 'transform';
        root.classList.add('is-zoom-preview');
        pv = { box, f, z0: getZoom(), z: getZoom(), cx0: cx, cy0: cy, cx, cy, anchor, frac, raf: 0 };
        return pv;
    }

    function renderPreview() {
        if (!pv) return;
        pv.raf = 0;
        const s = pv.z / pv.z0;
        const dx = (pv.cx - pv.cx0) / pv.f;
        const dy = (pv.cy - pv.cy0) / pv.f;
        pv.box.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${s})`;
        const v = snap(pv.z);
        syncPanel(v);
        showZoomToast(v);
    }

    function updatePreview(z, cx, cy) {
        if (!pv) return;
        pv.z = clampRaw(z);
        pv.cx = cx;
        pv.cy = cy;
        if (!pv.raf) pv.raf = requestAnimationFrame(renderPreview);
    }

    function commitPreview() {
        if (!pv) return;
        const { box, anchor, frac, cy } = pv;
        if (pv.raf) cancelAnimationFrame(pv.raf);
        const v = snap(pv.z);
        pv = null;

        box.style.transition = '';
        box.style.transform = '';
        box.style.transformOrigin = '';
        box.style.willChange = '';
        root.classList.remove('is-zoom-preview');

        if (v !== getZoom()) applyZoomPreview(v);          // සැබෑ zoom — එක් වරක් පමණි
        syncPanel(v);
        saveZoom(v);
        showZoomToast(v);

        if (anchor && anchor.isConnected) {
            const ar = anchor.getBoundingClientRect();
            window.scrollBy(0, ar.top + frac * ar.height - cy);
        }
    }

    // Double tap: 100% දක්වා සුමට animation එකකින් පසු commit කරයි
    function animateTo(z, cx, cy) {
        if (pv || !beginPreview(cx, cy)) return;
        const box = pv.box;
        box.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
        pv.z = clampRaw(z);
        requestAnimationFrame(() => {
            renderPreview();
            setTimeout(commitPreview, 240);
        });
    }

    // ---------- Touch ----------
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    let pinch = null;
    let pinchEndedAt = 0;
    let tapStart = null;
    let lastTap = null;

    document.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            if (pv) commitPreview();
            const [cx, cy] = mid(e.touches);
            if (beginPreview(cx, cy)) pinch = { d0: dist(e.touches) || 1 };
            tapStart = null;
            lastTap = null;
        } else if (e.touches.length === 1 && !pinch) {
            const t = e.touches[0];
            tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
        } else {
            tapStart = null;
        }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (pinch && pv && e.touches.length === 2) {
            e.preventDefault();
            const [cx, cy] = mid(e.touches);
            updatePreview(pv.z0 * (dist(e.touches) / pinch.d0), cx, cy);
            return;
        }
        if (tapStart && e.touches.length === 1) {
            const t = e.touches[0];
            if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 10) tapStart = null;
        }
    }, { passive: false });

    document.addEventListener('touchend', e => {
        if (pinch) {
            if (e.touches.length < 2) {
                pinch = null;
                pinchEndedAt = Date.now();
                commitPreview();
            }
            return;
        }

        // ---- Double tap → 100% ----
        if (!tapStart || e.touches.length || e.changedTouches.length !== 1) { tapStart = null; return; }
        const t = e.changedTouches[0];
        const now = Date.now();
        const isTap = (now - tapStart.time) < 280 && (now - pinchEndedAt) > 400;
        tapStart = null;
        if (!isTap) { lastTap = null; return; }

        const target = t.target && t.target.closest ? t.target : null;
        if (target && target.closest('input, textarea, select, button, a, label, .zoom-panel, .suggestions-box, #fbOverlay, .nav-item, .inflection-table-wrapper')) {
            lastTap = null;
            return;
        }

        if (lastTap && (now - lastTap.time) < 320 &&
            Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 32) {
            lastTap = null;
            e.preventDefault();
            if (getZoom() !== 100) animateTo(100, t.clientX, t.clientY);
        } else {
            lastTap = { x: t.clientX, y: t.clientY, time: now };
        }
    }, { passive: false });

    document.addEventListener('touchcancel', () => {
        if (pinch) { pinch = null; commitPreview(); }
        tapStart = null;
    });

    // ---------- පරිගණකය: Ctrl + wheel (trackpad pinch ද මෙලෙසම එයි) ----------
    let wheelCommit = 0;
    document.addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        if (!pv && !beginPreview(e.clientX, e.clientY)) return;
        updatePreview(pv.z * Math.exp(-e.deltaY * 0.01), pv.cx0, pv.cy0);
        clearTimeout(wheelCommit);
        wheelCommit = setTimeout(commitPreview, 260);
    }, { passive: false });
})();

function renderDictSelector() {
    const container = document.getElementById('dictList');
    if(!container) return;
    container.innerHTML = '';

    availableDicts.forEach((dict, index) => {
        const item = document.createElement('div');
        item.className = 'dict-item';
        item.innerHTML = `
            <label>
                <input type="checkbox" ${dict.enabled ? 'checked' : ''} onchange="toggleDict(${index})">
                <b>${dict.name}</b>
            </label>
            <div class="dict-controls">
                <button onclick="moveDict(${index}, -1)" ${index === 0 ? 'disabled' : ''}><svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-arrow-up"></use></svg></button>
                <button onclick="moveDict(${index}, 1)" ${index === availableDicts.length - 1 ? 'disabled' : ''}><svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-arrow-down"></use></svg></button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.toggleDict = function(index) {
    availableDicts[index].enabled = !availableDicts[index].enabled;
    loadAllActiveDicts();
};

window.moveDict = function(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= availableDicts.length) return;
    const temp = availableDicts[index];
    availableDicts[index] = availableDicts[newIndex];
    availableDicts[newIndex] = temp;
    renderDictSelector();
    if (searchInput.value.trim()) performSearch(searchInput.value.trim());
};

window.toggleDetails = (id) => {
    const panel = document.getElementById(`details-${id}`);
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
};

// --- App Init ---
window.addEventListener('DOMContentLoaded', () => {
    renderDictSelector();
    loadAllActiveDicts();
    history.replaceState({ tab: 'home', title: 'Pāli Sinhala Ultimate (PSU)' }, '');

    const zoomSlider = document.getElementById('zoomSlider');
    const zoomValueLabel = document.getElementById('zoomValueLabel');
    if (zoomSlider) {
        zoomSlider.addEventListener('input', () => {
            applyZoomPreview(zoomSlider.value);
        });
        zoomSlider.addEventListener('change', () => {
            saveZoom(zoomSlider.value);
        });
    }
});

// Service Worker Registration — Android / Windows ඇප් එකේ ගොනු ඇප් එක ඇතුළේම ඇති නිසා අවශ්‍ය නැත
if ('serviceWorker' in navigator && !isNativeApp() && !isDesktopApp()) {
    // ✅ පළමු වරට install වන විට (කලින් controller නැති විට) page එක reload නොකරන්න.
    //    එසේ නොකළොත් reload වීමෙන් beforeinstallprompt event එක සහ banner එක නැති වී යයි.
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js')
        .then(reg => {
            console.log('Service Worker Registered');
            reg.update();
        })
        .catch(err => {
            console.error('Service Worker Registration Failed:', err);
        });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return;   // පළමු install එක — reload අවශ්‍ය නැත
        if (swRefreshing) return;
        swRefreshing = true;
        rememberSearchForReload();
        window.location.reload();
    });

    // ස්ථාපිත ඇප් එක (PWA) වසා නොදමා පසුබිමේ තබා නැවත විවෘත කළ විට page එක reload නොවන නිසා
    // අලුත් අනුවාදයක් තිබේදැයි browser එක පරීක්ෂා නොකරයි. එබැවින් ඇප් එක නැවත පෙරබිමට
    // ආ විට (විනාඩි 5 කට වරක් උපරිම) පරීක්ෂා කරයි. අලුත් අනුවාදයක් ඇත්නම් ඉහත
    // controllerchange මඟින් reload වී, පෙන්වමින් තිබූ සෙවුම නැවත පෙන්වයි.
    let lastSwCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastSwCheck < 5 * 60 * 1000) return;
        lastSwCheck = Date.now();
        navigator.serviceWorker.getRegistration()
            .then(reg => reg && reg.update())
            .catch(() => {});
    });
}

// ================================================================
// විශාලන කොටුවේ "නැවුම් කරන්න" බටනය
// 1) අලුත් අනුවාදයක් (sw.js) තිබේදැයි වහාම පරීක්ෂා කරයි — ඇත්නම් එය ස්ථාපනය වී reload වේ.
// 2) නැත්නම් app shell ගොනු (index.html, script.js, styles.css ...) server එකෙන්ම අලුතින්
//    ගෙන (offline නම් පරණ ඒවා එලෙසම තබා) page එක reload කරයි.
// ශබ්දකෝෂ දත්ත නැවත බාගත නොකරයි — ඒවා වෙනස් වී ඇත්නම් පමණක් ස්වයංක්‍රීයව යාවත්කාලීන වේ.
// Android / Windows ඇප් එකේ: page එක reload කිරීම පමණි.
// ================================================================
let swRefreshing = false;

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]);
}

function askSwToRefreshShell() {
    return new Promise(resolve => {
        const ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (!ctl || typeof MessageChannel === 'undefined') return resolve(null);
        const ch = new MessageChannel();
        const timer = setTimeout(() => resolve(null), 20000);
        ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
        try { ctl.postMessage({ type: 'REFRESH_SHELL' }, [ch.port2]); } catch (e) { clearTimeout(timer); resolve(null); }
    });
}

window.forceAppRefresh = async function () {
    const btn = document.getElementById('zoomRefreshBtn');
    if (btn) {
        if (btn.classList.contains('is-busy')) return;
        btn.classList.add('is-busy');
        btn.disabled = true;
    }
    rememberSearchForReload();
    const reload = () => { swRefreshing = true; window.location.reload(); };

    if (!('serviceWorker' in navigator) || isNativeApp() || isDesktopApp()) return reload();
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
            await withTimeout(reg.update().catch(() => {}), 8000);
            const incoming = reg.installing || reg.waiting;
            if (incoming) {
                // අලුත් අනුවාදය සක්‍රීය වූ විට controllerchange මඟින් reload වේ
                await withTimeout(new Promise(resolve => {
                    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                }), 20000);
                if (!swRefreshing) reload();
                return;
            }
        }
        await askSwToRefreshShell();
    } catch (e) {
        console.warn('refresh:', e);
    }
    if (!swRefreshing) reload();
};

// ================================================================
// ඇප් යාවත්කාලීන දැනුම්දීම — Android (Capacitor) / Windows (Tauri) ඇප් එකේ පමණි
// ----------------------------------------------------------------
// • ඇප් එක ඇතුළේ ඇති app-build.json  → ස්ථාපිත අනුවාදය (build වන විට workflow මගින් ලියයි)
// • repo එකේ app-version.json         → නවතම අනුවාදය (release එකක් publish කළ විට workflow මගින් යාවත්කාලීන වේ)
// online විටදී ඇප් එක විවෘත කළ විට නවතම අනුවාදය වැඩි නම් දැනුම්දීම පෙන්වයි. වෙබ් අඩවියට (PWA) බලපෑමක් නැත.
// • Android: GitHub APK තොරතුරු app-version.json හි "android_apk" කොටසේ. "android" කොටස 1.0.4 හි ස්ථිරව නවතා ඇත —
//   එය කියවන්නේ පරණ (1.0.4 හෝ ඊට පෙර) ඇප් පමණි; එය වෙනස් නොකරන නිසා Play Store හි ඇති 1.0.4 ඇප් එකට GitHub දැනුම්දීම කිසිදා නොඑයි.
// • Play Store එකෙන් ස්ථාපනය කළ ඇප් එකට GitHub දැනුම්දීම නොපෙන්වයි (Play ඇප් එක යාවත්කාලීන වන්නේ Play හරහා පමණි —
//   MainActivity.java හි Play In-App Update). GitHub APK එකෙන් ස්ථාපනය කළ ඇප් එකට පමණක් පෙන්වයි.
// ================================================================
const APP_VERSION_URL = 'https://raw.githubusercontent.com/Pali-Sinhala-Dictionary/DPSD/main/app-version.json';

function compareVersions(a, b) {
    const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

function fetchJsonWithTimeout(url, ms) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .finally(() => clearTimeout(timer));
}

function formatUpdateSize(bytes) {
    const n = Number(bytes);
    if (!n) return '';
    return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.round(n / 1024) + ' KB';
}

function formatUpdateDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    const months = ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'];
    return m[1] + ' ' + months[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10);
}

function showAppUpdateDialog(platform, info, installed) {
    if (document.getElementById('appUpdateOverlay')) return;
    const isWin = platform === 'windows';
    const newVer = isWin ? info.version : info.versionName;
    const meta = ['v' + escapeHtml(newVer || ''), formatUpdateSize(info.size), isWin ? 'Windows' : 'Android']
        .filter(Boolean).join(' · ');
    const date = formatUpdateDate(info.date);
    const notes = String(info.notes || '').trim();
    const howTo = isWin
        ? 'යාවත්කාලීන කරන්න එබූ විට Setup ගොනුව බාගත වේ. බාගත වූ පසු එය විවෘත කර ස්ථාපනය කරන්න — පවතින ඇප් එක ඉවත් කිරීම අවශ්‍ය නැත.'
        : 'යාවත්කාලීන කරන්න එබූ විට APK ගොනුව බාගත වේ. බාගත වූ පසු එය විවෘත කර ස්ථාපනය කරන්න — පවතින ඇප් එක ඉවත් කිරීම අවශ්‍ය නැත.';

    const ov = document.createElement('div');
    ov.id = 'appUpdateOverlay';
    ov.className = 'app-update-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'appUpdateTitle');
    ov.innerHTML =
        '<div class="app-update-sheet">' +
            '<div class="app-update-top">' +
                '<div class="app-update-brand"><img src="icon-192x192.png" alt=""><span>Pāli Sinhala Ultimate (PSU)</span></div>' +
                '<button type="button" class="app-update-close" aria-label="වසන්න">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
            '</div>' +
            '<div class="app-update-body">' +
                '<h2 id="appUpdateTitle" class="app-update-title">නව යාවත්කාලීනයක් ලැබී ඇත</h2>' +
                '<p class="app-update-text">ශබ්දකෝෂයේ නවතම අනුවාදය දැන් ලබා ගත හැකියි. නව වචන, නිවැරදි කිරීම් හා වැඩිදියුණු කිරීම් ලබා ගැනීමට යාවත්කාලීන කරන්න.</p>' +
                '<p class="app-update-text">' + howTo + '</p>' +
                '<div class="app-update-app">' +
                    '<img class="app-update-icon" src="icon-192x192.png" alt="">' +
                    '<div class="app-update-app-info">' +
                        '<div class="app-update-app-name">Pāli Sinhala Ultimate (PSU)</div>' +
                        '<div class="app-update-app-meta">' + meta + '</div>' +
                        (installed ? '<div class="app-update-app-meta">දැනට ඇති අනුවාදය: v' + escapeHtml(installed) + '</div>' : '') +
                    '</div>' +
                '</div>' +
                (notes || date ?
                '<button type="button" class="app-update-news" aria-expanded="false">' +
                    '<span class="app-update-news-text"><span class="app-update-news-title">අලුත් දේ</span>' +
                    (date ? '<span class="app-update-news-date">අවසන් වරට යාවත්කාලීන කළේ ' + escapeHtml(date) + '</span>' : '') + '</span>' +
                    '<svg class="app-update-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
                '</button>' +
                (notes ? '<div class="app-update-notes" hidden>' + escapeHtml(notes) + '</div>' : '') : '') +
                '<div class="app-update-actions">' +
                    '<button type="button" class="app-update-btn app-update-more">වැඩි විස්තර</button>' +
                    '<button type="button" class="app-update-btn app-update-go">යාවත්කාලීන කරන්න</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('app-update-open');

    const close = () => {
        ov.remove();
        document.body.classList.remove('app-update-open');
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    ov.querySelector('.app-update-close').addEventListener('click', close);
    ov.querySelector('.app-update-more').addEventListener('click', () => openExternalUrl(info.page || info.url));
    ov.querySelector('.app-update-go').addEventListener('click', () => { openExternalUrl(info.url); close(); });
    const news = ov.querySelector('.app-update-news');
    const notesEl = ov.querySelector('.app-update-notes');
    if (news && notesEl) {
        news.addEventListener('click', () => {
            const open = notesEl.hidden;
            notesEl.hidden = !open;
            news.setAttribute('aria-expanded', open ? 'true' : 'false');
            news.classList.toggle('is-open', open);
        });
    } else if (news) {
        news.classList.add('no-notes');
    }
}

// Android: ඇප් එක ස්ථාපනය කළ ස්ථානය (AppBars plugin → installer()). Play Store = 'com.android.vending'.
// plugin එක නැත්නම් / දෝෂයක් නම් ආරක්ෂාව සඳහා Play ලෙසම සලකයි (GitHub දැනුම්දීම නොපෙන්වයි).
function androidInstaller() {
    try {
        const AB = Capacitor.Plugins && Capacitor.Plugins.AppBars;
        if (!AB || typeof AB.installer !== 'function') return Promise.resolve('com.android.vending');
        return AB.installer().then(r => (r && r.installer) || '').catch(() => 'com.android.vending');
    } catch (e) { return Promise.resolve('com.android.vending'); }
}

function checkForAppUpdate() {
    const platform = isNativeApp() ? 'android' : (isDesktopApp() ? 'windows' : null);
    if (!platform || navigator.onLine === false) return;
    if (platform === 'android') {
        androidInstaller().then(src => { if (src !== 'com.android.vending') checkForGithubUpdate(platform); });
        return;
    }
    checkForGithubUpdate(platform);
}

function checkForGithubUpdate(platform) {
    fetchJsonWithTimeout('app-build.json', 4000)
        .then(local => fetchJsonWithTimeout(APP_VERSION_URL + '?t=' + Date.now(), 8000).then(remote => [local, remote]))
        .then(([local, remote]) => {
            const info = remote && remote[platform === 'android' ? 'android_apk' : platform];
            if (!info || !info.url) return;
            let newer, installed;
            if (platform === 'android') {
                newer = (parseInt(info.versionCode, 10) || 0) > (parseInt(local.versionCode, 10) || 0);
                installed = local.versionName;
            } else {
                newer = compareVersions(info.version, local.version) > 0;
                installed = local.version;
            }
            if (newer) showAppUpdateDialog(platform, info, installed);
        })
        .catch(err => console.warn('App update check skipped:', err && err.message ? err.message : err));
}

if (isNativeApp() || isDesktopApp()) {
    window.addEventListener('load', () => setTimeout(checkForAppUpdate, 1500));
}

// ================================================================
// ශබ්දකෝෂයේ අන්තර්ගතය — තොරතුරු පිටුවේ සංඛ්‍යා (ශබ්දකෝෂ දත්ත වලින් ස්වයංක්‍රීයව ගණනය වේ)
// ================================================================
function computeDictStats(items) {
    const s = {
        total: 0, unique: 0, samasa: 0, sandhi: 0, nirukti: 0, properNoun: 0,
        wordDivision: 0, grammarDesc: 0, akhyata: 0, kridanta: 0, taddhita: 0,
        'sam-karma': 0, 'sam-tatpurusha': 0, 'sam-bahubbihi': 0, 'sam-dvanda': 0,
        'sam-digu': 0, 'sam-avyayibhava': 0
    };
    const words = new Set();
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        s.total++;
        words.add(it.word);
        if (it.type === 'සන්ධි') s.sandhi++;
        if (it.etymology) s.nirukti++;
        if (it.properNoun) s.properNoun++;
        if (it.wordDivision) s.wordDivision++;
        const gd = it.grammarDesc || '';
        if (!gd) continue;
        s.grammarDesc++;
        const nl = gd.indexOf('\n');
        const first = (nl === -1 ? gd : gd.slice(0, nl)).trim();
        const m = /^(.*?)\s*සමාසයකි/.exec(first);
        if (m) {
            s.samasa++;
            const label = m[1];
            if (label.indexOf('කම්මධාරය') !== -1) s['sam-karma']++;
            else if (label.indexOf('තප්පුරිස') !== -1) s['sam-tatpurusha']++;
            else if (label.indexOf('බහුබ්බීහි') !== -1) s['sam-bahubbihi']++;
            else if (label.indexOf('ද්වන්ද') !== -1) s['sam-dvanda']++;
            else if (label === 'දිගු') s['sam-digu']++;
            else if (label.indexOf('යයීභාව') !== -1) s['sam-avyayibhava']++;
        }
        if (first.indexOf('ආඛ්‍යාත පදයකි') === 0) s.akhyata++;
        if (first.indexOf('කෘදන්ත') !== -1) s.kridanta++;
        if (first.indexOf('තද්ධිතයකි') !== -1) s.taddhita++;
    }
    s.unique = words.size;
    return s;
}

function computeSienStats(items) {
    const sin = /[඀-෿]/, lat = /[A-Za-z]/;
    const s = { total: 0, sinWords: 0, engWords: 0, multi: 0 };
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        s.total++;
        const w = it.word || '';
        if (sin.test(w)) s.sinWords++;
        else if (lat.test(w)) s.engWords++;
        if ((it.meaning || '').indexOf('|') !== -1) s.multi++;
    }
    return s;
}

function updateDictStats() {
    const fill = (selector, stats, prefix) => {
        document.querySelectorAll(selector + ' [data-stat]').forEach(el => {
            const v = stats[el.getAttribute('data-stat').slice(prefix.length)];
            if (typeof v === 'number') el.textContent = v.toLocaleString('en-US');
        });
    };
    const pali = availableDicts.find(d => d.id === 'pali');
    if (pali && pali._loaded && pali.data && pali.data.length) fill('#dictStatsCard', computeDictStats(pali.data), '');
    const sien = availableDicts.find(d => d.id === 'sien');
    if (sien && sien._loaded && sien.data && sien.data.length) fill('#sienStatsCard', computeSienStats(sien.data), 'sien-');
}

// ================================================================
// බාගත කිරීමේ සබැඳි — app-version.json (නවතම release) අනුව Android / Windows බොත්තම් යාවත්කාලීන කරයි.
// ජාල දෝෂයක් වුවත් HTML හි ඇති පෙරනිමි සබැඳි ක්‍රියාත්මක වේ.
// ================================================================
function initDownloadLinks() {
    const apkBtn = document.getElementById('apkDownloadBtn');
    const exeBtn = document.getElementById('exeDownloadBtn');
    [apkBtn, exeBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            if (isNativeApp() || isDesktopApp()) { e.preventDefault(); openExternalUrl(btn.href); }
        });
    });
    if (navigator.onLine === false) return;
    fetchJsonWithTimeout(APP_VERSION_URL + '?t=' + Date.now(), 8000).then(remote => {
        const setMeta = (id, parts) => {
            const el = document.getElementById(id);
            if (el) el.textContent = parts.filter(Boolean).join(' · ');
        };
        const a = remote && (remote.android_apk || remote.android);     // GitHub APK — නවතම
        if (a && a.url && apkBtn) {
            apkBtn.href = a.url;
            setMeta('apkMeta', ['Android ' + (a.versionName || ''), formatUpdateSize(a.size), formatUpdateDate(a.date)]);
        }
        const w = remote && remote.windows;
        if (w && w.url && exeBtn) {
            exeBtn.href = w.url;
            setMeta('exeMeta', ['Windows ' + (w.version || ''), formatUpdateSize(w.size), formatUpdateDate(w.date)]);
        }
    }).catch(err => console.warn('Download links: using defaults:', err && err.message ? err.message : err));
}
window.addEventListener('load', () => setTimeout(initDownloadLinks, 800));
