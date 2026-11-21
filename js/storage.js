// Opslag van gedownloade stadsdelen in IndexedDB + import/export als bestand.

const DB_NAME = 'blokstad'; // technische naam: NIET wijzigen (bestaande opslag van spelers, ook na de naam TERRANOVA)
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('regions')) d.createObjectStore('regions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data');
        if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
function tx(store, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function listRegions() {
  const d = await db();
  const all = await reqP(d.transaction('regions').objectStore('regions').getAll());
  return all.sort((a, b) => b.updated - a.updated);
}
export async function getRegionMeta(id) {
  const d = await db();
  return reqP(d.transaction('regions').objectStore('regions').get(id));
}
export async function loadRegionData(id) {
  const d = await db();
  const rle = await reqP(d.transaction('data').objectStore('data').get(id));
  return rle ? rleDecode(rle) : null;
}
// ---------- veilig opslaan (TERRANOVA 15) ----------
// Elke opslag krijgt een controlegetal (meta.crc, FNV-1a over de gecodeerde blokken) en de lengte (meta.vlen). De
// vorige versie blijft bewaard (sleutel id + '@vorige', met haar eigen meta): alles in één IndexedDB-transactie, dus
// een onderbroken schrijfactie laat de oude versie intact. Bij het laden (loadRegionSafe) wordt nagekeken of de
// gegevens kloppen; zo niet, dan komt automatisch de vorige versie terug en blijft de beschadigde kopie apart bewaard
// (id + '@beschadigd') — er wordt nooit stilzwijgend iets overschreven of weggegooid.
export function fnv(bytes) { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export const PREV = '@vorige', BROKEN = '@beschadigd';
export async function saveRegion(meta, vox) {
  const rle = vox ? rleEncode(vox) : null;
  meta.updated = Date.now();
  if (rle) { meta.bytes = rle.length; meta.crc = fnv(rle); meta.vlen = vox.length; }
  const stores = rle ? ['regions', 'data'] : ['regions'];
  await tx(stores, 'readwrite', t => new Promise((res) => {
    const R = t.objectStore('regions');
    if (!rle) { R.put(meta); res(); return; }
    const D = t.objectStore('data');
    // de huidige versie eerst als 'vorige' bewaren (alleen als ze in orde is: een beschadigde opslag overschrijft geen goede)
    const g1 = R.get(meta.id), g2 = D.get(meta.id);
    g2.onsuccess = () => {
      const oldMeta = g1.result, oldRle = g2.result;
      const okOld = oldRle && oldMeta && (oldMeta.crc === undefined || fnv(oldRle) === oldMeta.crc);
      if (okOld) { D.put(oldRle, meta.id + PREV); D.put({ ...oldMeta, id: meta.id + PREV }, meta.id + PREV + ':meta'); }
      R.put(meta); D.put(rle, meta.id); res();
    };
    g2.onerror = () => { R.put(meta); D.put(rle, meta.id); res(); };
  }));
}
// laden met controle; geeft { vox, meta, hersteld, beschadigd } (vox null als niets bruikbaar is)
export async function loadRegionSafe(id) {
  const d = await db();
  const get = (st, k) => reqP(d.transaction(st).objectStore(st).get(k));
  const meta = await get('regions', id), rle = await get('data', id);
  const ok = (m, r) => { if (!r) return null; if (m && m.crc !== undefined && fnv(r) !== m.crc) return null; let v; try { v = rleDecode(r); } catch { return null; } if (m && m.vlen && v.length !== m.vlen) return null; if (m && m.size && m.H && v.length !== m.size * m.size * m.H) return null; return v; };
  const v = ok(meta, rle);
  if (v) return { vox: v, meta, hersteld: false, beschadigd: false };
  if (!rle) return { vox: null, meta, hersteld: false, beschadigd: false };
  // beschadigd: apart bewaren, de vorige versie proberen
  const pm = await get('data', id + PREV + ':meta'), pr = await get('data', id + PREV), pv = ok(pm, pr);
  await tx(['data'], 'readwrite', t => { t.objectStore('data').put(rle, id + BROKEN); });
  if (pv) { await saveRegion({ ...meta, ...pm, id, name: meta?.name ?? pm?.name, restoredAt: Date.now() }, pv); return { vox: pv, meta: { ...meta, ...pm, id }, hersteld: true, beschadigd: true }; }
  return { vox: null, meta, hersteld: false, beschadigd: true };
}
// vorige versie terugzetten (de huidige wordt dan zelf de 'vorige', dus omkeerbaar)
export async function restorePrevious(id) {
  const d = await db(); const get = (st, k) => reqP(d.transaction(st).objectStore(st).get(k));
  const pm = await get('data', id + PREV + ':meta'), pr = await get('data', id + PREV);
  if (!pr) return false;
  const v = rleDecode(pr), meta = await get('regions', id);
  await saveRegion({ ...meta, ...pm, id, name: meta?.name ?? pm?.name, restoredAt: Date.now() }, v);
  return true;
}
export async function hasPrevious(id) { const d = await db(); return !!(await reqP(d.transaction('data').objectStore('data').getKey(id + PREV))); }
export async function saveMeta(meta) { return saveRegion(meta, null); }
export async function deleteRegion(id) {
  await tx(['regions', 'data'], 'readwrite', t => {
    t.objectStore('regions').delete(id);
    t.objectStore('data').delete(id); t.objectStore('data').delete(id + PREV); t.objectStore('data').delete(id + PREV + ':meta');
  });
}

// ---------- algemene cache (kaartdata, tegels) ----------
export async function cacheGet(key) {
  try {
    const d = await db();
    return await reqP(d.transaction('cache').objectStore('cache').get(key));
  } catch { return undefined; }
}
export async function cachePut(key, value) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const t = d.transaction('cache', 'readwrite'); t.objectStore('cache').put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch { /* opslag vol of geblokkeerd: dan maar zonder cache */ }
}

export async function cacheDelete(key) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const t = d.transaction('cache', 'readwrite'); t.objectStore('cache').delete(key); t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch { /* niets */ }
}
// alles met een bepaald begin wissen (bv. een volledige grote kaart)
export async function cacheDeletePrefix(prefix) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const t = d.transaction('cache', 'readwrite');
      t.objectStore('cache').delete(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch { /* niets */ }
}
export async function cacheHas(key) {
  try {
    const d = await db();
    return (await reqP(d.transaction('cache').objectStore('cache').getKey(key))) !== undefined;
  } catch { return false; }
}

export async function cacheGetPrefix(prefix) {
  try {
    const d = await db();
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
    const st = d.transaction('cache').objectStore('cache');
    const [ks, vs] = await Promise.all([reqP(st.getAllKeys(range)), reqP(st.getAll(range))]);
    return ks.map((k, i) => ({ key: k, value: vs[i] }));
  } catch { return []; }
}

// ---------- bouwwerken van een grote kaart delen ----------
const MAGIC_B = 'BLOKBOUW1';
export const BACKUP_PREFIX = 'backup-edit-'; // vorige versie van een bouwwerk vóór een import (zie importBuilds)
export async function exportBuilds(meta) {
  const edits = await cacheGetPrefix(`${meta.map.id}-edit-`);
  const head = { meta, entries: edits.map(e => ({ key: e.key, H: e.value.H, y0: e.value.y0 || 0, len: e.value.rle.length })) };
  const hb = new TextEncoder().encode(JSON.stringify(head)), mg = new TextEncoder().encode(MAGIC_B);
  const total = mg.length + 4 + hb.length + edits.reduce((n, e) => n + e.value.rle.length, 0);
  const buf = new Uint8Array(total);
  buf.set(mg, 0); new DataView(buf.buffer).setUint32(mg.length, hb.length, true); buf.set(hb, mg.length + 4);
  let o = mg.length + 4 + hb.length;
  for (const e of edits) { buf.set(e.value.rle, o); o += e.value.rle.length; }
  let blob = new Blob([buf]);
  if (typeof CompressionStream !== 'undefined') blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return { blob, count: edits.length };
}
export async function readMaybeGzip(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return bytes;
}
export async function importBuilds(bytes) {
  const mg = new TextDecoder().decode(bytes.subarray(0, MAGIC_B.length));
  if (mg !== MAGIC_B) return null;
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC_B.length, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC_B.length + 4, MAGIC_B.length + 4 + len)));
  let o = MAGIC_B.length + 4 + len;
  const ts = Date.now().toString(36);
  for (const e of head.entries) {
    // bestaand bouwwerk wordt niet stilzwijgend overschreven: de vorige versie gaat eerst naar een back-upsleutel
    const prev = await cacheGet(e.key);
    if (prev && prev.rle) await cachePut(`${BACKUP_PREFIX}${ts}-${e.key}`, prev);
    await cachePut(e.key, { rle: bytes.slice(o, o + e.len), H: e.H, y0: e.y0 || 0 });
    o += e.len;
  }
  return head;
}

// ---------- RLE: [waarde, lengte als varint]... ----------
export function rleEncode(src) {
  let out = new Uint8Array(Math.max(1024, src.length >> 4));
  let o = 0;
  const ensure = n => { if (o + n > out.length) { const nb = new Uint8Array(out.length * 2 + n); nb.set(out); out = nb; } };
  let i = 0;
  while (i < src.length) {
    const v = src[i];
    let j = i + 1;
    while (j < src.length && src[j] === v) j++;
    let len = j - i;
    ensure(6);
    out[o++] = v;
    while (len >= 128) { out[o++] = (len & 127) | 128; len >>>= 7; }
    out[o++] = len;
    i = j;
  }
  return out.slice(0, o);
}
// lengte na het uitpakken (zonder uit te pakken); -1 als de gegevens beschadigd zijn
export function rleLength(src) {
  if (!src || !src.length) return -1;
  let n = 0, i = 0;
  while (i < src.length) {
    i++;
    let len = 0, shift = 0, b;
    do { if (i >= src.length) return -1; b = src[i++]; len += (b & 127) * 2 ** shift; shift += 7; } while (b & 128);
    n += len;
  }
  return n;
}
export function rleDecode(src, total) {
  // eerst totale lengte bepalen
  let n = 0, i = 0;
  if (!total) {
    while (i < src.length) {
      i++;
      let len = 0, shift = 0, b;
      do { b = src[i++]; len |= (b & 127) << shift; shift += 7; } while (b & 128);
      n += len;
    }
    total = n;
  }
  const out = new Uint8Array(total);
  let o = 0; i = 0;
  while (i < src.length) {
    const v = src[i++];
    let len = 0, shift = 0, b;
    do { b = src[i++]; len |= (b & 127) << shift; shift += 7; } while (b & 128);
    if (v) out.fill(v, o, o + len);
    o += len;
  }
  return out;
}

// ---------- bestand ----------
const MAGIC = 'BLOKSTAD1';
export async function exportFile(meta, vox) {
  const rle = rleEncode(vox);
  const metaBytes = new TextEncoder().encode(JSON.stringify({ ...meta, bytes: rle.length }));
  const head = new TextEncoder().encode(MAGIC);
  const buf = new Uint8Array(head.length + 4 + metaBytes.length + rle.length);
  buf.set(head, 0);
  new DataView(buf.buffer).setUint32(head.length, metaBytes.length, true);
  buf.set(metaBytes, head.length + 4);
  buf.set(rle, head.length + 4 + metaBytes.length);
  let blob = new Blob([buf], { type: 'application/octet-stream' });
  if (typeof CompressionStream !== 'undefined') {
    blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  return blob;
}
export async function importFile(file, pre) {
  let bytes = pre || new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Deze browser kan het bestand niet uitpakken.');
    bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  const head = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (head !== MAGIC) throw new Error('Dit is geen TERRANOVA-bestand (.blokstad).');
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC.length + 4, MAGIC.length + 4 + len)));
  const vox = rleDecode(bytes.subarray(MAGIC.length + 4 + len), meta.size * meta.size * meta.H);
  return { meta, vox };
}

// ---------- volledige back-up van de eigen gegevens (TERRANOVA 14) ----------
// Formaat 'TNBACKUP1' + lengte + JSON-kop + binaire stukken. Bevat alles wat de speler zelf maakte of instelde:
// opgeslagen stukken (regions + data), bouwwerken per tegel (cache-sleutels met '-edit-' en '-ug-', ook de back-ups daarvan), bouwplannen ('bp-…')
// en de instellingen in localStorage ('blokstad-…', favorieten 'gi-favs'). De gewone kaartcache zit er niet in: die wordt opnieuw gemaakt.
// Terugzetten voegt toe en overschrijft alleen dezelfde sleutels; er wordt nooit iets gewist.
const MAGIC_BK = 'TNBACKUP1';
const isUser = (k) => typeof k === 'string' && (k.includes('-edit-') || k.includes('-ug-') || k.startsWith('bp-')); // bouwwerk, ondergronds bouwwerk, bouwplannen
function pack(v, bins) { // getypte arrays naar het binaire deel, de rest blijft JSON
  if (v instanceof Uint8Array || v instanceof Int8Array || v instanceof Uint16Array || v instanceof Int16Array || v instanceof Uint32Array || v instanceof Int32Array || v instanceof Float32Array || v instanceof Float64Array) {
    bins.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); return { __bin: bins.length - 1, t: v.constructor.name };
  }
  if (Array.isArray(v)) return v.map(x => pack(x, bins));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = pack(v[k], bins); return o; }
  return v;
}
function unpack(v, bins) {
  if (Array.isArray(v)) return v.map(x => unpack(x, bins));
  if (v && typeof v === 'object') {
    if ('__bin' in v && 't' in v) { const b = bins[v.__bin], C = globalThis[v.t] || Uint8Array, c = b.slice(); return new C(c.buffer, 0, c.byteLength / (C.BYTES_PER_ELEMENT || 1)); }
    const o = {}; for (const k of Object.keys(v)) o[k] = unpack(v[k], bins); return o;
  }
  return v;
}
export async function backupUserData() {
  const d = await db(), bins = [], items = [];
  const all = (store) => new Promise((res, rej) => { const out = []; const r = d.transaction(store).objectStore(store).openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return res(out); out.push([c.key, c.value]); c.continue(); }; r.onerror = () => rej(r.error); });
  for (const [k, v] of await all('regions')) items.push({ s: 'regions', k, v: pack(v, bins) });
  for (const [k, v] of await all('data')) items.push({ s: 'data', k, v: pack(v, bins) });
  for (const [k, v] of await all('cache')) if (isUser(k)) items.push({ s: 'cache', k, v: pack(v, bins) });
  const ls = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith('blokstad-') || k === 'gi-favs')) ls[k] = localStorage.getItem(k); } } catch { /* geen toegang */ }
  const head = { versie: 1, gemaakt: Date.now(), items, ls, lens: bins.map(b => b.byteLength) };
  const hb = new TextEncoder().encode(JSON.stringify(head)), mg = new TextEncoder().encode(MAGIC_BK);
  const buf = new Uint8Array(mg.length + 4 + hb.length + bins.reduce((n, b) => n + b.byteLength, 0));
  buf.set(mg, 0); new DataView(buf.buffer).setUint32(mg.length, hb.length, true); buf.set(hb, mg.length + 4);
  let o = mg.length + 4 + hb.length; for (const b of bins) { buf.set(b, o); o += b.byteLength; }
  let blob = new Blob([buf], { type: 'application/octet-stream' });
  if (typeof CompressionStream !== 'undefined') blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return { blob, stukken: items.filter(i => i.s === 'regions').length, bouw: items.filter(i => i.s === 'cache').length, instellingen: Object.keys(ls).length };
}
export function isBackup(bytes) { return new TextDecoder().decode(bytes.subarray(0, MAGIC_BK.length)) === MAGIC_BK; }
export async function restoreUserData(bytes) {
  if (!isBackup(bytes)) return null;
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC_BK.length, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC_BK.length + 4, MAGIC_BK.length + 4 + len)));
  const bins = []; let o = MAGIC_BK.length + 4 + len; for (const n of head.lens) { bins.push(bytes.subarray(o, o + n)); o += n; }
  const d = await db();
  await new Promise((res, rej) => {
    const t = d.transaction(['regions', 'data', 'cache'], 'readwrite');
    for (const it of head.items) { const v = unpack(it.v, bins); if (it.s === 'regions') t.objectStore('regions').put(v); else t.objectStore(it.s).put(v, it.k); }
    t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
  try { for (const [k, v] of Object.entries(head.ls || {})) localStorage.setItem(k, v); } catch { /* geen toegang */ }
  return { stukken: head.items.filter(i => i.s === 'regions').length, bouw: head.items.filter(i => i.s === 'cache').length, instellingen: Object.keys(head.ls || {}).length, gemaakt: head.gemaakt };
}
