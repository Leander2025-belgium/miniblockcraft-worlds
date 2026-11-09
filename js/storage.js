// Opslag van gedownloade stadsdelen in IndexedDB + import/export als bestand.

const DB_NAME = 'blokstad';
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
export async function saveRegion(meta, vox) {
  const rle = vox ? rleEncode(vox) : null;
  meta.updated = Date.now();
  if (rle) meta.bytes = rle.length;
  const stores = rle ? ['regions', 'data'] : ['regions'];
  await tx(stores, 'readwrite', t => {
    t.objectStore('regions').put(meta);
    if (rle) t.objectStore('data').put(rle, meta.id);
  });
}
export async function saveMeta(meta) { return saveRegion(meta, null); }
export async function deleteRegion(id) {
  await tx(['regions', 'data'], 'readwrite', t => {
    t.objectStore('regions').delete(id);
    t.objectStore('data').delete(id);
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
export async function exportBuilds(meta) {
  const edits = await cacheGetPrefix(`${meta.map.id}-edit-`);
  const head = { meta, entries: edits.map(e => ({ key: e.key, H: e.value.H, len: e.value.rle.length })) };
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
  for (const e of head.entries) {
    await cachePut(e.key, { rle: bytes.slice(o, o + e.len), H: e.H });
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
  if (head !== MAGIC) throw new Error('Dit is geen Blokstad-bestand.');
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC.length + 4, MAGIC.length + 4 + len)));
  const vox = rleDecode(bytes.subarray(MAGIC.length + 4 + len), meta.size * meta.size * meta.H);
  return { meta, vox };
}
