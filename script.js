    // සියලු ශබ්දකෝෂ Configuration (Oxford Dictionary ඉවත් කර ඇත)
    let availableDicts = [
        { id: 'pali', name: 'පාලි - සිංහල ශබ්දකෝෂය', path: 'dictionary.zip', enabled: true, data: [] },
        { id: 'sien', name: 'සිංහල - ඉංග්‍රීසි ශබ්දකෝෂය', path: 'sinhala_english.zip', enabled: true, data: [] }
    ];

    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const suggestionsBox = document.getElementById('suggestionsBox');
    const resultsContainer = document.getElementById('resultsContainer');
    const initialMessage = document.getElementById('initialMessage');

    // --- Restore saved theme preference (runs immediately, before first paint settles) ---
    (function restoreTheme() {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-theme');
            const icon = document.getElementById('themeIcon');
            if (icon) icon.setAttribute('href', '#icon-sun');
        }
    })();

    // --- Restore saved zoom / text-size preference (runs immediately, before first paint settles) ---
    (function restoreZoom() {
        const savedZoom = localStorage.getItem('zoomLevel') || '100';
        const zoomTarget = document.querySelector('.container');
        if (zoomTarget) zoomTarget.style.zoom = savedZoom + '%';
    })();

    // --- App Init ---
    window.addEventListener('DOMContentLoaded', () => {
        renderDictSelector();
        loadAllActiveDicts();
        history.replaceState({ tab: 'home', title: 'පාලි සිංහල ශබ්දකෝෂය' }, '');

        // Wire up zoom slider
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

    // --- CSV Load Logic ---
    function loadAllActiveDicts() {
        let activeDicts = availableDicts.filter(d => d.enabled);
        if (activeDicts.length === 0) {
            initialMessage.innerText = "කරුණාකර අවම වශයෙන් එක් ශබ්දකෝෂයක්වත් තෝරන්න.";
            return;
        }

        let loadedCount = 0;
        activeDicts.forEach(dict => {
            if (dict.data && dict.data.length > 0) {
                loadedCount++;
                checkReady(loadedCount, activeDicts.length, activeDicts);
            } else {
                fetchCSV(dict.path, (data) => {
                    dict.data = data || [];
                    loadedCount++;
                    checkReady(loadedCount, activeDicts.length, activeDicts);
                });
            }
        });
    }

    function checkReady(count, total, activeDicts) {
        if (count === total) {
            // A dict "finishing" doesn't mean it actually loaded anything —
            // fetchCSV/fetchZippedCSV swallow errors and call back with an
            // empty array so one broken file doesn't wedge the whole app.
            // But silently presenting a normal, ready-looking search box
            // when the data is actually empty is worse: it looks like
            // everything works while every search silently returns
            // nothing. Surface that clearly instead.
            const failed = (activeDicts || []).filter(d => !d.data || d.data.length === 0);
            if (failed.length > 0) {
                searchInput.disabled = true;
                searchInput.placeholder = "දත්ත පූරණය අසාර්ථකයි";
                initialMessage.innerText = "පූරණය කළ නොහැකි විය: " + failed.map(d => d.path).join(', ') +
                    " — file එක නිවැරදි ස්ථානයේ තියෙනවද බලන්න.";
                return;
            }

            searchInput.disabled = false;
            searchBtn.disabled = false;
            searchInput.placeholder = "වචනයක් ටයිප් කරන්න...";
            initialMessage.innerText = "වචනයක් ඇතුළත් කර සොයන්න.";

            // Warm up the "වර නැගීම" lookup in the background, once the
            // main dictionaries are ready and the browser is idle — so by
            // the time someone actually taps the button it's usually
            // already loaded. requestIdleCallback (with a setTimeout
            // fallback) keeps this from competing with initial page
            // interactivity. Errors here are silent; the button's own
            // click handler still retries normally if this warm-up fails.
            // Warm up the "වර නැගීම" lookup — දැන් async yield සහිත නිසා UI එක block නොවේ.
// එසේම, browser නිශ්චල වූ පසු පමණක් ක්‍රියාත්මක වේ (forced timeout නැත).
const warmUpInflections = () => { getInflectionIndex().catch(() => {}); };
if ('requestIdleCallback' in window) {
    requestIdleCallback(warmUpInflections);
} else {
    setTimeout(warmUpInflections, 3000);
}
        }
    }

    function fetchCSV(path, callback) {
        // A ".zip" (with or without a trailing ?v=... query string) holds a
        // single CSV file — unzipped client-side with the bundled fflate
        // library (see unzipFirstEntry below), then parsed exactly like a
        // plain CSV.
        if (/\.zip(\?.*)?$/i.test(path)) {
            fetchZippedCSV(path, callback);
            return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("GET", path, true);
        // Force UTF-8 decoding regardless of what the server reports, so
        // Sinhala/Pali text is never mis-decoded.
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
    // Native ZIP reader — the container-format parsing (EOCD / central
    // directory / local file header) is hand-rolled; actual DEFLATE
    // decompression is delegated to the bundled fflate.min.js (a small,
    // pure-JS library loaded locally — see index.html/inflections-worker.js
    // — NOT a CDN). This avoids depending on the browser's own
    // DecompressionStream API, whose availability can't be guaranteed on
    // older Android WebView versions used by the native app build; fflate
    // works identically everywhere since it's plain JavaScript.
    // ================================================================
    function unzipFirstEntry(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.length;

        const EOCD_SIG = 0x06054b50;
        let eocdOffset = -1;
        const scanStart = Math.max(0, len - 65557); // 22-byte record + max 65535-byte comment
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

        if (method === 0) return compData; // stored, already raw
        if (method === 8) return fflate.inflateSync(compData); // deflate (raw, no zlib/gzip header)
        throw new Error('unsupported zip compression method: ' + method);
    }

    function fetchZippedCSV(path, callback) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', path, true);
        xhr.responseType = 'arraybuffer';
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

    // --- Real CSV tokenizer (RFC4180-style) ---
    // A plain line.split(',') breaks the moment any field's own text
    // contains a comma (e.g. a meaning listing several synonyms) — those
    // rows silently get extra columns and everything after shifts out of
    // place. This walks the text character-by-character so quoted commas,
    // quoted newlines, and escaped "" quotes are all handled correctly.
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

    // Recognizes the dictionary.csv header and maps column names to
    // indices, so word/meaning/etc. are read by NAME, not by guessing at
    // position/ID-format. Returns null if the row doesn't look like a
    // known header (caller then falls back to flexible positional parsing).
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

    // --- Smart CSV Parser ---
    function parseCSV(text) {
        const rows = tokenizeCSV(text);
        if (!rows.length) return [];

        const result = [];
        const colMap = detectHeaderMap(rows[0]);
        const startRow = colMap ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
            const raw = rows[i];
            if (!raw || raw.length < 2) continue;

            // Normalize to a single canonical Unicode form (NFC) so that a
            // word typed/stored via a different tool or keyboard, which may
            // produce an equivalent but differently-composed sequence of
            // combining marks (e.g. hal kirima + following consonant),
            // still matches consistently at search time.
            const parts = raw.map(p => (p || '').trim().normalize('NFC'));

            let item;
            if (colMap) {
                // Known schema: read every field by its header name. This
                // works regardless of the ID column's format (numeric like
                // "42" or alphanumeric like "GAP4-173") since we never have
                // to guess which column the ID is in.
                item = {
                    id: (colMap.id !== undefined ? parts[colMap.id] : '') || String(i),
                    word: (parts[colMap.word] || '').replace(/\s*\d+(?:\.\d+)*\s*$/, '').trim(),
                    type: (colMap.type !== undefined ? parts[colMap.type] : '') || '',
                    wordDivision: (colMap.wordDivision !== undefined ? parts[colMap.wordDivision] : '') || '',
                    meaning: (colMap.meaning !== undefined ? parts[colMap.meaning] : '') || '',
                    properNoun: (colMap.properNoun !== undefined ? parts[colMap.properNoun] : '') || '',
                    grammarDesc: (colMap.grammarDesc !== undefined ? parts[colMap.grammarDesc] : '') || '',
                    etymology: (colMap.etymology !== undefined ? parts[colMap.etymology] : '') || ''
                };
            } else {
                // No recognizable header (e.g. a simpler word,meaning style
                // dictionary file): fall back to flexible column-count
                // handling, same idea as before but on properly quote-aware
                // tokenized fields instead of a naive comma split.
                let offset = 0;
                let id = String(i);
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

            // Keep the entry as long as it has a word AND at least one
            // piece of actual content in ANY field — meaning, type,
            // proper-noun description, grammar note, or etymology. This
            // fixes rows that were being silently dropped just because
            // "meaning" and "type" happened to both be empty (common for
            // DPPN proper-noun rows where the content lives in properNoun /
            // grammarDesc / etymology instead).
            const hasContent = item.meaning || item.type || item.properNoun ||
                                item.grammarDesc || item.etymology || item.wordDivision;
            if (item.word && hasContent) {
                result.push(item);
            }
        }
        return result;
    }

    // ================================================================
    // Singlish -> Sinhala Transliteration Engine
    // Ported from the reference "Pali-Sinhala Dictionary" app's search
    // algorithm. Instead of doing one fragile sequential text replace,
    // it builds a lookup of every consonant+vowel-sign combination and,
    // for a given Singlish string, returns EVERY valid Sinhala spelling
    // it could correspond to. This correctly handles inherent vowels,
    // pili (vowel signs), rakaransaya/yansaya (්‍ර / ්‍ය) and the many
    // ways people casually romanize the same Sinhala letter.
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

    // [pili (vowel sign attached after a consonant), roman suffix]
    const singlish_combinations = [
        ['්', ''],       // ක්
        ['', 'a'],        // ක
        ['ා', 'a, aa'],   // කා
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

        ['්‍ර', 'ra'],       // ක්‍ර
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

        ['්‍ය', 'ya'],       // ක්‍ය
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

    // Returns every possible Sinhala spelling for a Singlish string.
    // Memoized on the remaining suffix so it stays fast even for longer words.
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
            // Cap at every recursion level (not just the final result) so the
            // combinations don't multiply out of control on longer words.
            const unique = Array.from(new Set(matches)).slice(0, 60);
            cache[str] = unique;
            return unique;
        }
        // Guard against pathological input freezing the UI
        if (!input || input.length > 24) return [];
        return helper(input).slice(0, 300);
    }

    // ================================================================
    // DPD Inflection ("වර නැගීම") lookup — LAZY, plain-text index.
    // No zip, no Worker, no IndexedDB caching needed: instead of parsing
    // all ~900k rows into a big in-memory Map (which caused the earlier
    // lag), we do a single lightweight pass over the raw CSV text that
    // only records each headword's LINE BYTE-RANGES (a cheap operation —
    // no per-row object allocation). Looking up a word then slices out
    // just its own few lines and parses ONLY those on demand. This keeps
    // startup fast (~0.5s for the full dataset) and lookups near-instant
    // (sub-millisecond), with no compression/decompression at all — the
    // plain inflections.csv file is fetched via XHR exactly like the main
    // dictionary already is.
    // ================================================================
    const INFLECTION_DATA_PATH = 'inflections.zip?v=1'; // Zipped for a small download (~4.4MB vs ~64MB plain). Uses XHR + the bundled fflate library (not fetch()/DecompressionStream/Worker) — the same combination already proven to work for dictionary.zip/sinhala_english.zip in the native WebView app, as well as in normal PWA browsers.

    // Async: කුඩා කොටස් වශයෙන් ක්‍රියාත්මක වන අතර සෑම ~12ms කට වරක් main thread එකට
// නිදහස් වේ. එමගින් දත්ත පූරණය වන අතරතුරත් ටයිප් කිරීම ක්ෂණිකව සිදු වේ.
async function buildLazyInflectionIndex(text) {
    const index = new Map();
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
                }
            }
            firstLine = false;
            lineStart = i + 1;
        }

        // සෑම ~65k අක්ෂරයකට වරක්, ගත වූ කාලය > 12ms නම් browser එකට yield කරයි
        if ((i & 0xFFFF) === 0 && performance.now() - lastYield > 12) {
            await new Promise(r => setTimeout(r, 0));
            lastYield = performance.now();
        }
    }
    return index;
}

    function lazyInflectionLookup(state, headword) {
        const ranges = state.index.get(headword);
        if (!ranges) return [];
        return ranges.map(([s, e]) => {
            const cols = state.text.slice(s, e).split(',');
            return { inflected: cols[0], pos: cols[1], category: cols[2], subcase: cols[3], number: cols[4] };
        });
    }

    let inflectionIndexPromise = null;

    function getInflectionIndex() {
        if (inflectionIndexPromise) return inflectionIndexPromise;

        // Download the small zipped file (XHR, not fetch()), unzip once with
        // the bundled fflate library (fast, no Worker needed), then build
        // the SAME lightweight byte-range index over the resulting text —
        // no big per-row object Map, so parsing stays fast too.
        inflectionIndexPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', INFLECTION_DATA_PATH, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = async () => {
    if (xhr.status !== 200 && xhr.status !== 0) {
        reject(new Error('HTTP ' + xhr.status));
        return;
    }
    try {
        const bytes = unzipFirstEntry(xhr.response);
        const text = new TextDecoder('utf-8').decode(bytes);
        // async yield version එක await කරයි — UI එක block වන්නේ නැත
        const index = await buildLazyInflectionIndex(text);
        resolve({ text, index });
    } catch (err) {
        reject(err);
    }
};
            xhr.onerror = () => reject(new Error('network error loading ' + INFLECTION_DATA_PATH));
            xhr.send();
        }).catch(err => {
            console.error('inflections load failed:', err);
            inflectionIndexPromise = null; // allow retry on next open
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
    // Personal / dual pronouns (අහං, ත්වං, උභ ...) decline by PERSON, not
    // gender — DPD stores these as category=person, subcase=case (the
    // reverse of the verb table, where subcase is the person).
    const INFL_PRON_PERSON_ORDER = ['1st', '2nd', 'dual'];
    const INFL_PRON_PERSON_LABELS = { '1st': 'උත්තම පුරුෂ (මම)', '2nd': 'මධ්‍යම පුරුෂ (ඔබ)', 'dual': 'උභ (දෙදෙනා)' };

    // ================================================================
    // Regular-declension fallback generator
    // DPD's grammar data only records CORPUS-ATTESTED spellings, so rarer
    // words (e.g. වරාහ) are missing cells that a common word like බුද්ධ
    // (same a-stem masc pattern) has. When a case×number cell has NO
    // attested form, we generate the textbook-regular form(s) from the
    // stem + known endings for a handful of the most common, reliable
    // noun classes. These are visually marked (see .generated-form CSS)
    // so they're never confused with real DPD-sourced data. Irregular
    // words, pronouns, and verbs are NOT covered here — only left blank.
    // ================================================================
    const VOWEL_SIGN_AA = '\u0DCF'; // ා
    const VOWEL_SIGN_I = '\u0DD2';  // ි
    const VOWEL_SIGN_II = '\u0DD3'; // ී
    const VOWEL_SIGN_U = '\u0DD4';  // ු
    const VOWEL_SIGN_UU = '\u0DD6'; // ූ

    const DECLENSION_SUFFIXES = {
        // a-stem masculine (like දම්ම / බුද්ධ) — bare-consonant stem
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
        // a-stem neuter (like රූප / චිත්ත) — same as a_masc except nom/acc/voc
        a_nt: {
            nom: { sg: ['ං', 'ො'], pl: ['ානි', 'ා'] },
            acc: { sg: ['ං'], pl: ['ානි', 'ෙ'] },
            instr: { sg: ['ෙන'], pl: ['ෙභි', 'ෙහි'] },
            dat: { sg: ['ස්ස', 'ාය'], pl: ['ානං'] },
            abl: { sg: ['තො', 'ම්හා', 'ස්මා'], pl: ['ෙභි', 'ෙහි'] },
            gen: { sg: ['ස්ස'], pl: ['ානං'] },
            loc: { sg: ['ම්හි', 'ස්මිං', 'ෙ'], pl: ['ෙසු'] },
            // Vocative NEVER ends in niggahita (ං) — bare stem only.
            voc: { sg: [''], pl: ['ානි', 'ා'] },
        },
        // ā-stem feminine (like කථා / සද්ධා) — stem with the final ා removed
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
        // u-stem masculine (like භික්ඛු / බබ්බු) — stem with the final ු removed
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
        // ī-stem feminine (like නදී / දේවී / තරුණී) — stem with the final ී removed.
        // Also used for the feminine of -ant present participles (see the
        // attested-form fallback in detectDeclensionClass below), since
        // that fem stem (e.g. bhañjatī) can't be derived from the
        // masculine/neuter citation headword directly.
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
        // i-stem masculine (like ඉසි / අග්ගි / මුනි) — stem with the final ි removed
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
        // i-stem feminine (like රත්ති / ජාති / භූමි) — stem with the final ි removed
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
        // ū-stem masculine agent nouns (like විදූ / සබ්බඤ්ඤූ) — stem with the final ූ removed
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
        // u-stem neuter (like චක්ඛු) — stem with the final ු removed
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
        // ū-stem feminine (like වධූ) — stem with the final ූ removed
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

    // Decide which of the 5 supported classes (if any) a headword belongs
    // to, purely from its final letter + known gender. Anything that
    // doesn't clearly fit (i/ū-stems, consonant stems, irregulars) is
    // deliberately left uncovered — better to show nothing than a guess
    // outside the patterns we're confident about.
    //
    // `attestedRows` (optional) is that gender's already-attested rows for
    // THIS headword — used only for the -ant present-participle/-vant/
    // -mant adjective feminine fallback: that fem stem (e.g. bhañjanta ->
    // bhañjatī) can't be derived from the masc/nt citation headword
    // directly (it's a different, often consonant-altered, ī-stem), so if
    // an attested nom.sg fem form ending in ී exists, we use IT as the
    // real stem instead of guessing.
    const ANT_STEM_SUFFIX = '\u0DB1\u0DCA\u0DAD'; // "න්ත" (-ant/-vant/-mant stems)

    function detectDeclensionClass(headwordSi, gender, attestedRows) {
        if (!headwordSi) return null;
        const last = headwordSi[headwordSi.length - 1];
        if (last === VOWEL_SIGN_AA) {
            return gender === 'fem' ? { stem: headwordSi.slice(0, -1), cls: 'aa_fem' } : null;
        }
        if (last === VOWEL_SIGN_U) {
            if (gender === 'masc') return { stem: headwordSi.slice(0, -1), cls: 'u_masc' };
            if (gender === 'nt') return { stem: headwordSi.slice(0, -1), cls: 'u_nt' };
            return null; // u-stem fem (rare, irregular kinship terms like mātu/pitu) not covered
        }
        if (last === VOWEL_SIGN_II) {
            return gender === 'fem' ? { stem: headwordSi.slice(0, -1), cls: 'ii_fem' } : null;
        }
        if (last === VOWEL_SIGN_I) {
            if (gender === 'masc') return { stem: headwordSi.slice(0, -1), cls: 'i_masc' };
            if (gender === 'fem') return { stem: headwordSi.slice(0, -1), cls: 'i_fem' };
            return null; // i-stem neuter not covered yet
        }
        if (last === VOWEL_SIGN_UU) {
            if (gender === 'masc') return { stem: headwordSi.slice(0, -1), cls: 'uu_masc' };
            if (gender === 'fem') return { stem: headwordSi.slice(0, -1), cls: 'uu_fem' };
            return null;
        }

        // Bare consonant ending => inherent "a" (a-stem masc/nt citation form)
        const isAntStem = headwordSi.endsWith(ANT_STEM_SUFFIX);

        if (gender === 'fem') {
            if (isAntStem) {
                // -ant/-vant/-mant feminine uses a DIFFERENT derived
                // ī-stem (bhañjanta -> bhañjatī), not simple "+ā" — only
                // proceed if we can anchor on a real attested form.
                if (attestedRows) {
                    const nomSg = attestedRows.find(r => r.subcase === 'nom' && r.number === 'sg' && r.inflected.endsWith(VOWEL_SIGN_II));
                    if (nomSg) return { stem: nomSg.inflected.slice(0, -1), cls: 'ii_fem' };
                }
                return null;
            }
            // Regular adjective/participle feminine shares the SAME
            // bare-consonant stem as its masc/nt citation form — e.g.
            // abala (adj) -> fem abalā, abalaṃ, abale — so no stripping is
            // needed before appending aa_fem endings.
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
    // Verb conjugation fallback generator — same idea as the noun
    // declension generator above, but for the "ati" present-stem class
    // (bhū-class: gacchati, bhavati, cavati ...), by far the most common
    // and regular Pali verb pattern. Endings below are cross-checked
    // against gacchati's fully-attested DPD paradigm. Other conjugation
    // classes (oti, āti, eti/causative, ṇāti, ṇoti ...) are NOT covered —
    // left blank rather than guessed, since they follow different rules.
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

    // ================================================================
    // "karoti" — DPD documents this as its own fixed irregular pattern
    // (root kar-/kur- suppletion, optative uses a wholly different stem
    // "kayirā-"). Since it's a closed, fully-specified table rather than a
    // rule, it's hardcoded verbatim here (verified against the DPD
    // reference table) with a variable PREFIX so compounds like
    // අභිකරොති still conjugate correctly. Cells DPD itself leaves
    // genuinely blank (opt 3rd/2nd reflexive) are left blank here too.
    // ================================================================
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
    const KAROTI_SUFFIX = 'කරොති'; // ක,ර,ො,ත,ි

    // A verb qualifies for the "ati" bhū-class pattern only if its
    // citation form ends in bare-consonant + ති (e.g. ගච්ඡති), NOT
    // vowel-sign + ති (e.g. කරොති "oti" class, which conjugates
    // differently) — checked by looking at the character just before "ති".
    function detectVerbClass(headwordSi) {
        if (!headwordSi) return null;
        if (headwordSi.endsWith(KAROTI_SUFFIX)) {
            return { base: headwordSi.slice(0, -KAROTI_SUFFIX.length), cls: 'karoti_irr' };
        }
        if (headwordSi.length < 3) return null;
        const n = headwordSi.length;
        if (headwordSi[n - 2] !== '\u0DAD' || headwordSi[n - 1] !== '\u0DD2') return null; // must end in "ති"
        const preceding = headwordSi[n - 3];
        const vowelSigns = new Set(['\u0DCF', '\u0DD0', '\u0DD1', '\u0DD2', '\u0DD3', '\u0DD4', '\u0DD6', '\u0DD9', '\u0DDA', '\u0DDC', '\u0DDD', '\u0DDE', '\u0D82']);
        if (vowelSigns.has(preceding)) return null; // e.g. "āti", "ṇāti" classes
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

    // Renders a table cell's form list. `generated` wraps each form in a
    // muted/italic span so rule-generated (unattested) forms are always
    // visually distinct from real DPD-sourced ones.
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
    // NOTE: 'adj' is deliberately excluded — DPD's adjective-tagged forms
    // for many common nouns (e.g. පුරිස, ධම්ම, කස්සක) don't hold up against
    // the actual corpus examples (checked directly), so we only show the
    // pos types whose gender-tagging has proven reliable.
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
            if (filtered.length) out = filtered; // keep only if something survives
        }
        if (otherNumberNom && otherNumberNom.length) {
            if (gender === 'masc') {
                if (out.length === 1 && otherNumberNom.includes(out[0])) {
                    return []; // sole attestation duplicates the other number's nominative — let generator take over
                }
            } else {
                const set = new Set(otherNumberNom);
                const filtered = out.filter(f => !set.has(f));
                if (filtered.length) out = filtered; // fem/nt: always strip, keep whatever else survives
                else if (out.every(f => set.has(f))) out = []; // nothing legitimate left — let generator take over
            }
        }
        return out;
    }

    // Rule: dat.pl/gen.pl sometimes carries both a complete "-ānaṃ" form and
    // a truncated "-āna" (no niggahita) duplicate of the SAME cell. Drop the
    // truncated one when the complete one is also present.
    function dropTruncatedNiggahita(forms) {
        if (forms.length <= 1) return forms;
        const set = new Set(forms);
        return forms.filter(f => !set.has(f + '\u0D82'));
    }

    // Rule: the vocative NEVER ends in niggahita (ං) in real Pali, regardless
    // of what the corpus data (or an over-eager generator) might suggest.
    function dropVocativeNiggahita(forms) {
        if (!forms.length) return forms;
        const filtered = forms.filter(f => !f.endsWith('\u0D82'));
        return filtered.length ? filtered : forms;
    }

    
    function dropAblPluralTo(forms) {
        if (!forms.length) return forms;
        const filtered = forms.filter(f => !f.endsWith('\u0DAD\u0DDC')); // ...තො
        return filtered.length ? filtered : forms;
    }

    function dropAaseNomPl(forms) {
        if (!forms.length) return forms;
        const filtered = forms.filter(f => !f.endsWith('\u0DCF\u0DC3\u0DD9')); // ...ාසෙ
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

                        // Clean up attested data before deciding whether generation is even needed.
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
                            // instr.pl / abl.pl: make sure both the -hi and
                            // -bhi (etc.) alternates are shown even if the
                            // corpus only attests one of them.
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

        // --- Personal/dual pronoun declension: one table per person present ---
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
            // Row order follows tense group order; within a tense, person
            // is listed ප්‍රථම (3rd) → මධ්‍යම (2nd) → උත්තම (1st) පුරුෂ.
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
        if (panel.dataset.loaded === '1') return; // already fetched, just re-showing

        panel.innerHTML = '<div class="inflection-loading">වර නැගීම් දත්ත පූරණය වෙමින්...</div>';
        getInflectionIndex()
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
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const rawQuery = this.value.trim().toLowerCase().replace(/[0-9]/g, '').normalize('NFC');
        const possibleMatches = isSinglishQuery(rawQuery) ? getPossibleMatches(rawQuery) : [];

        suggestionsBox.innerHTML = "";
        if (rawQuery.length < 1) { 
            suggestionsBox.style.display = "none"; 
            return; 
        }

        searchTimeout = setTimeout(() => {
            const matches = new Set();
            availableDicts.filter(d => d.enabled).forEach(dict => {
                if (dict.data && Array.isArray(dict.data)) {
                    dict.data.forEach(item => {
                        if (!item || !item.word) return;
                        const w = item.word.toLowerCase();
                        if (w.startsWith(rawQuery) || possibleMatches.some(pm => w.startsWith(pm))) {
                            matches.add(item.word);
                        }
                    });
                }
            });

            const finalMatches = Array.from(matches).slice(0, 10);
            if (finalMatches.length > 0) {
                finalMatches.forEach(word => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerText = word;
                    div.onclick = () => {
                        searchInput.value = word;
                        suggestionsBox.style.display = "none";
                        performSearch(word, true);
                    };
                    suggestionsBox.appendChild(div);
                });
                suggestionsBox.style.display = "block";
            } else {
                suggestionsBox.style.display = "none";
            }
        }, 150);
    });

    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = "none";
        }
    });

    searchBtn.addEventListener('click', () => performSearch(searchInput.value.trim(), false));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            suggestionsBox.style.display = "none";
            performSearch(searchInput.value.trim(), false);
        }
    });

    // --- Search Logic ---
    function performSearch(query, exactOnly = false) {
        if (!query) return;
        const lowerQuery = query.toLowerCase().replace(/[0-9]/g, '').trim().normalize('NFC');
        const possibleMatches = isSinglishQuery(lowerQuery) ? getPossibleMatches(lowerQuery) : [];

        resultsContainer.innerHTML = "";
        let hasResults = false;

        availableDicts.filter(d => d.enabled).forEach(dict => {
            if (!dict.data || !Array.isArray(dict.data) || dict.data.length === 0) return;

            let matches = dict.data.filter(item => {
                if (!item || !item.word) return false;
                const w = item.word.toLowerCase().trim();
                return w === lowerQuery || possibleMatches.some(pm => w === pm);
            });

            if (matches.length === 0 && !exactOnly) {
                matches = dict.data.filter(item => {
                    if (!item || !item.word) return false;
                    const w = item.word.toLowerCase();
                    return w.includes(lowerQuery) || possibleMatches.some(pm => w.includes(pm));
                });
            }

            if (matches.length === 0 && !exactOnly) {
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

                Object.keys(groupedByWord).forEach(mainWord => {
                    const items = groupedByWord[mainWord];
                    const card = document.createElement('div');
                    card.className = 'word-card';
                    card.innerHTML = `<div class="main-word-title">${mainWord} <span class="dict-tag">${dict.name}</span></div>`;

                    items.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'meaning-row';
                        let detailsBtnHtml = (item.properNoun || item.grammarDesc || item.etymology) ? `<button class="details-btn" onclick="toggleDetails('${dict.id}-${item.id}')">විස්තර <svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-info"></use></svg></button>` : '';
                        // Inflection ("වර නැගීම") lookup only applies to the Pali dictionary.
                        const safeHeadword = mainWord.replace(/'/g, "\\'");
                        let inflectionBtnHtml = (dict.id === 'pali') ? `<button class="inflection-btn" onclick="toggleInflection('${dict.id}-${item.id}', '${safeHeadword}')">වර නැගීම</button>` : '';

                        row.innerHTML = `
                            <div class="word-header">
                                <div class="word-header-left">
                                    ${item.type ? `<span class="word-type">${item.type}</span>` : ''}
                                    ${item.wordDivision ? `<span class="word-division">${item.wordDivision}</span>` : ''}
                                </div>
                                <div class="word-header-right">
                                    ${detailsBtnHtml}
                                    ${inflectionBtnHtml}
                                </div>
                            </div>
                            <div style="margin-top:5px;">${item.meaning}</div>
                            <div id="details-${dict.id}-${item.id}" class="details-panel">
                                ${item.properNoun ? `<div class="proper-noun-desc">සංඥානාම: ${item.properNoun}</div>` : ''}
                                ${item.grammarDesc ? `<div class="grammar-desc">ව්‍යාකරණ: ${item.grammarDesc}</div>` : ''}
                                ${item.etymology ? `<div class="etymology-desc">නිරුක්තිය: ${item.etymology}</div>` : ''}
                            </div>
                            ${inflectionBtnHtml ? `<div id="inflection-${dict.id}-${item.id}" class="inflection-panel"></div>` : ''}
                        `;
                        card.appendChild(row);
                    });
                    resultsContainer.appendChild(card);
                });
            }
        });

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
        const activeNav = document.getElementById(`nav-${tabId}`);
        if(activeNav) activeNav.classList.add('active');

        document.getElementById('pageTitle').innerText = titleText;

        if (!fromPopState) {
            const currentTab = (history.state && history.state.tab) ? history.state.tab : 'home';

            if (tabId !== 'home') {
                if (currentTab === 'home') {
                    // Leaving the search page: push ONE history entry as the single "back stop".
                    history.pushState({ tab: tabId, title: titleText }, '');
                } else {
                    // Moving between other tabs: replace in place so the back stack
                    // never grows beyond that one entry — back always lands on home.
                    history.replaceState({ tab: tabId, title: titleText }, '');
                }
            } else if (currentTab !== 'home') {
                // Navigated to Home directly (not via back press): collapse the back-stop entry.
                history.replaceState({ tab: 'home', title: titleText }, '');
            }
        }
    }

    // --- Back Button Control ---
    window.addEventListener('popstate', function(e) {
        const tab = (e.state && e.state.tab) ? e.state.tab : 'home';
        const title = (e.state && e.state.title) ? e.state.title : 'පාලි සිංහල ශබ්දකෝෂය';
        switchTab(tab, title, true);
    });

    // --- Theme & Settings Functions ---
    function toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        document.getElementById('themeIcon').setAttribute('href', isDark ? '#icon-sun' : '#icon-moon');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    // --- Zoom / Text Size Functions ---
    // Note: zoom is applied only to .container (the page content),
    // never to <html>/<body>, so the bottom-nav icon row stays a fixed size.
    function applyZoomPreview(value) {
        const zoomTarget = document.querySelector('.container');
        if (zoomTarget) zoomTarget.style.zoom = value + '%';
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

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker Registered');
                reg.update();
            })
            .catch(err => {
                console.error('Service Worker Registration Failed:', err);
            });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
