// inflections-worker.js
// Runs entirely off the main thread so typing/searching in the dictionary
// never freezes while the (large, ~900k-row) inflections dataset loads,
// parses, and gets cached. See script.js's getInflectionIndex() for the
// main-thread side that talks to this worker.

const INFLECTION_DATA_PATH = 'inflections.zip?v=1';
const INFLECTION_CACHE_VERSION = 'v1'; // keep in sync with script.js
const IDB_NAME = 'pali-dict-cache';
const IDB_STORE = 'inflections';

function openInflectionIdb() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in self)) { reject(new Error('indexedDB unavailable')); return; }
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'version' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbGetInflections(db, version) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(version);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

function idbPutInflections(db, record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.objectStore(IDB_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- ZIP reader (identical logic to script.js's unzipFirstEntry) ---
async function unzipFirstEntry(arrayBuffer) {
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

    if (method === 0) return compData;
    if (method === 8) {
        const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('unsupported zip compression method: ' + method);
}

// --- CSV tokenizer (identical logic to script.js's tokenizeCSV) ---
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

function buildIndexFromFlatRows(flatRows) {
    const index = new Map();
    for (let i = 0; i < flatRows.length; i++) {
        const r = flatRows[i];
        let bucket = index.get(r.h);
        if (!bucket) { bucket = []; index.set(r.h, bucket); }
        bucket.push({ inflected: r.w, pos: r.p, category: r.c, subcase: r.s, number: r.n });
    }
    return index;
}

async function loadInflections() {
    // 1. Try IndexedDB cache first.
    try {
        const db = await openInflectionIdb();
        const cached = await idbGetInflections(db, INFLECTION_CACHE_VERSION);
        if (cached && cached.rows && cached.rows.length) {
            return buildIndexFromFlatRows(cached.rows);
        }
    } catch (e) {
        // fall through to network load
    }

    // 2. Fetch + unzip + parse.
    const res = await fetch(INFLECTION_DATA_PATH);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const bytes = await unzipFirstEntry(buf);
    const text = new TextDecoder('utf-8').decode(bytes);
    const csvRows = tokenizeCSV(text);

    const flatRows = [];
    for (let i = 1; i < csvRows.length; i++) { // skip header row
        const r = csvRows[i];
        if (!r || r.length < 6) continue;
        flatRows.push({ h: r[5], w: r[0], p: r[1], c: r[2], s: r[3], n: r[4] });
    }
    const index = buildIndexFromFlatRows(flatRows);

    // 3. Best-effort cache write for next time.
    try {
        const db = await openInflectionIdb();
        await idbPutInflections(db, { version: INFLECTION_CACHE_VERSION, rows: flatRows });
    } catch (e) {
        // non-fatal
    }

    return index;
}

self.onmessage = async (evt) => {
    if (!evt.data || evt.data.type !== 'load') return;
    try {
        const index = await loadInflections();
        self.postMessage({ type: 'ready', index });
    } catch (err) {
        self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
};
