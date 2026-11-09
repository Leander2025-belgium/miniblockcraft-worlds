// Web Worker: berekent de stadskaart, voorbeelden en volledige 3D-gebieden.
import { fillColumn, generateRegion, WIDTH, LENGTH, GROUND, HEIGHT } from './city.js';
import { BLOCKS } from './blocks.js';
import { parseOSM, fetchOSM, fetchOSMBox, rasterize, topView, indexOSM, subsetOSM, bboxFor, computeLod, unpackTile } from './osm.js';
import { mapMX, tileCenter, superBox, keys } from './bigmap.js';
import { cacheGet, cachePut, cacheDelete, rleEncode, rleDecode } from './storage.js';
import { elevationSampler, elevationBase } from './terrain.js';
import { mapSize } from './bigmap.js';
import { generateTile } from './metropolis.js';

// ---------- hoogtes ----------
const elevMem = new Map();
async function mapElevBase(map) {
  const k = `${map.id}-elevbase`;
  let v = await cacheGet(k);
  if (v == null) { v = await elevationBase(bboxFor(map.lat, map.lon, mapSize(map), 100)); await cachePut(k, v); }
  return v;
}
function superElev(map, sx, sz) {
  const k = `${map.id}-${sx}-${sz}`;
  if (elevMem.has(k)) return elevMem.get(k);
  const p = (async () => {
    try {
      const base = await mapElevBase(map);
      const f = await elevationSampler(superBox(map, sx, sz, 120));
      return (la, lo) => f(la, lo) - base;
    } catch { return null; } // geen hoogtekaart: vlak terrein
  })();
  elevMem.set(k, p);
  if (elevMem.size > 8) elevMem.delete(elevMem.keys().next().value);
  return p;
}

const col = new Uint8Array(HEIGHT);

function colorAt(x, z, prevH) {
  col.fill(0);
  const top = fillColumn(x, z, col);
  let y = top;
  while (y > 0 && !col[y]) y--;
  const c = BLOCKS[col[y]].color;
  let f = 1;
  if (y > GROUND + 1) f = 0.92 + Math.min(0.3, (y - GROUND) / 350);
  if (prevH > y + 2) f *= 0.72; // schaduw van het gebouw ernaast
  return [c[0] * f, c[1] * f, c[2] * f, y];
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'map') {
    const s = m.scale, w = Math.floor(WIDTH / s), h = Math.floor(LENGTH / s);
    const heights = new Int16Array(w + 1);
    const rowsPer = 50;
    for (let r0 = 0; r0 < h; r0 += rowsPer) {
      const rows = Math.min(rowsPer, h - r0);
      const data = new Uint8ClampedArray(w * rows * 4);
      for (let r = 0; r < rows; r++) {
        const z = (r0 + r) * s + (s >> 1);
        let prevLeft = 0;
        for (let i = 0; i < w; i++) {
          const x = i * s + (s >> 1);
          const nw = Math.max(heights[i], prevLeft);
          const [cr, cg, cb, y] = colorAt(x, z, nw);
          const o = (r * w + i) * 4;
          data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
          heights[i] = y; prevLeft = y;
        }
      }
      self.postMessage({ type: 'mapRows', id: m.id, y0: r0, rows, w, data }, [data.buffer]);
    }
    self.postMessage({ type: 'mapDone', id: m.id });
  } else if (m.type === 'preview') {
    const { x0, z0, size } = m;
    const data = new Uint8ClampedArray(size * size * 4);
    const heights = new Int16Array(size + 1);
    for (let z = 0; z < size; z++) {
      let prevLeft = 0;
      for (let x = 0; x < size; x++) {
        const nw = Math.max(heights[x], prevLeft);
        const [cr, cg, cb, y] = colorAt(x0 + x, z0 + z, nw);
        const o = (z * size + x) * 4;
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
        heights[x] = y; prevLeft = y;
      }
    }
    self.postMessage({ type: 'preview', id: m.id, size, data }, [data.buffer]);
  } else if (m.type === 'cityTile') {
    cityTile(m).then(r => {
      if (m.prefetch) self.postMessage({ type: 'cityTile', id: m.id, H: r.H, bytes: r.bytes });
      else self.postMessage({ type: 'cityTile', id: m.id, vox: r.vox, H: r.H, paths: r.paths }, [r.vox.buffer]);
    }).catch(err => self.postMessage({ type: 'error', id: m.id, message: err.message || String(err) }));
  } else if (m.type === 'lods') {
    sendLods(m);
  } else if (m.type === 'area') {
    areaPrefetch(m);
  } else if (m.type === 'dropSuper') {
    const k = keys.osm(m.map, m.sx, m.sz);
    supers.delete(k);
    cacheDelete(k).then(() => self.postMessage({ type: 'dropped', id: m.id }));
  } else if (m.type === 'osm') {
    realWorld(m).catch(err => self.postMessage({ type: 'error', id: m.id, message: err.message || String(err) }));
  } else if (m.type === 'region') {
    const { x0, z0, size } = m;
    let last = 0;
    const vox = generateRegion(x0, z0, size, p => {
      const now = performance.now();
      if (now - last > 60) { last = now; self.postMessage({ type: 'progress', id: m.id, p }); }
    });
    self.postMessage({ type: 'region', id: m.id, vox }, [vox.buffer]);
  }
};

async function realWorld(m) {
  const status = (text, p) => self.postMessage({ type: 'progress', id: m.id, text, p });
  let text = m.text, lat = m.lat, lon = m.lon, size = m.size;
  const scale = m.scale || 1;
  if (!text) {
    status('Kaartgegevens opvragen bij OpenStreetMap…', 0.05);
    text = await fetchOSM(lat, lon, size, t => status(t, 0.1));
  }
  status('Kaartgegevens lezen…', 0.3);
  const osm = parseOSM(text);
  if (lat == null || lon == null) {
    if (osm.bounds) {
      lat = (osm.bounds.minlat + osm.bounds.maxlat) / 2; lon = (osm.bounds.minlon + osm.bounds.maxlon) / 2;
      const h = (osm.bounds.maxlat - osm.bounds.minlat) * 110574;
      const w = (osm.bounds.maxlon - osm.bounds.minlon) * 111320 * Math.cos(lat * Math.PI / 180);
      size = Math.max(32, Math.min(size, Math.floor(Math.min(w, h) / 16) * 16));
    } else {
      let a = 0, b = 0, n = 0;
      for (const [la, lo] of osm.nodes.values()) { a += la; b += lo; n++; }
      lat = a / n; lon = b / n;
    }
  }
  status('Hoogtes ophalen…', 0.38);
  let elev = null;
  try {
    const bb = bboxFor(lat, lon, size, 60);
    const f = await elevationSampler(bb);
    let base = Infinity;
    for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) base = Math.min(base, f(bb.s + (bb.n - bb.s) * i / 16, bb.w + (bb.e - bb.w) * j / 16));
    base = Math.floor(base) - 1;
    elev = (la, lo) => f(la, lo) - base;
  } catch { /* vlak terrein */ }
  status('Gebouwen en straten omzetten naar blokken…', 0.4);
  const blocks = Math.round(size * scale);
  const r = rasterize(osm, lat, lon, blocks, p => status('Gebouwen en straten omzetten naar blokken…', 0.4 + p * 0.55), scale, { elev });
  const preview = topView(r.vox, blocks, r.H);
  self.postMessage({ type: 'osmDone', id: m.id, vox: r.vox, H: r.H, ground: r.ground, buildings: r.buildings, lat, lon, size: blocks, meters: size, scale, preview },
    [r.vox.buffer, preview.buffer]);
}

// ---------- vaste stadskaart in tegels ----------
const supers = new Map();
// Downloadplaatsen gedeeld door alle werkers (Web Locks): max. 3 tegelijk, verdeeld over twee servers
const SLOTS = ['blokstad-dl-0', 'blokstad-dl-1', 'blokstad-dl-2'];
async function withSlot(fn) {
  if (!self.navigator || !navigator.locks) return fn(0);
  for (let i = 0; i < SLOTS.length; i++) {
    const r = await navigator.locks.request(SLOTS[i], { ifAvailable: true }, async (lock) => (lock ? { v: await fn(i) } : null));
    if (r) return r.v;
  }
  const i = Math.floor(Math.random() * SLOTS.length);
  return navigator.locks.request(SLOTS[i], async () => fn(i));
}
function getSuper(map, sx, sz) {
  const key = keys.osm(map, sx, sz);
  if (supers.has(key)) return supers.get(key);
  const p = (async () => {
    let text = await cacheGet(key);
    if (!text) {
      // één download tegelijk, zodat de OpenStreetMap-server ons niet weigert
      text = await withSlot(async (slot) => {
        const again = await cacheGet(key); // misschien heeft een andere werker het intussen gedownload
        if (again) return again;
        return fetchOSMBox(superBox(map, sx, sz), (t) => self.postMessage({ type: 'status', map: map.id, text: t }), slot);
      });
      await cachePut(key, text);
    }
    const osm = indexOSM(parseOSM(text));
    self.postMessage({ type: 'status', map: map.id, text: '' });
    return osm;
  })();
  p.catch(() => supers.delete(key));
  supers.set(key, p);
  if (supers.size > 4) supers.delete(supers.keys().next().value);
  return p;
}
// dezelfde tegel nooit twee keer tegelijk maken
const making = new Map();
function cityTile(m) {
  const k = keys.tile(m.map, m.tx, m.tz) + (m.prefetch ? '-p' : '');
  if (making.has(k)) return making.get(k);
  const p = cityTileInner(m).finally(() => making.delete(k));
  making.set(k, p);
  return p;
}
// Achtergrond: tegels rond de speler alvast ophalen en bewaren.
// Loopt in de worker, dus ook als het tabblad verborgen is of het spel op pauze staat.
let area = null;
async function areaPrefetch(m) {
  const job = { map: m.map, stop: false };
  if (area) area.stop = true;
  area = job;
  const { map, tx: cx, tz: cz, radius: R } = m;
  const pool = m.pool || 1, me = m.poolIndex || 0;
  const list = [];
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const tx = cx + dx, tz = cz + dz;
    if (tx < 0 || tz < 0 || tx >= (map.tilesX || map.tiles) || tz >= (map.tilesZ || map.tiles) || dx * dx + dz * dz > (R + 0.5) ** 2) continue;
    if (workerFor(map, tx, tz, pool) !== me) continue; // elke werker doet zijn eigen blokken
    list.push([dx * dx + dz * dz, tx, tz]);
  }
  list.sort((a, b) => a[0] - b[0]);
  let done = 0;
  for (const [, tx, tz] of list) {
    if (job.stop) return;
    try {
      await cityTile({ map, tx, tz, prefetch: true });
      const lod = await getLod(map, tx, tz);
      if (lod) self.postMessage({ type: 'lodTile', id: m.id, tx, tz, lod });
    } catch { /* volgende keer opnieuw */ }
    done++;
    if (done % 4 === 0 || done === list.length) self.postMessage({ type: 'areaProgress', id: m.id, done, total: list.length });
  }
}
async function cityTileInner(m) {
  const { tx, tz, map } = m;
  const key = keys.tile(map, tx, tz);
  const cached = await cacheGet(key);
  if (cached && cached.rle) {
    if (m.prefetch) return { H: cached.H, bytes: cached.rle.length };
    return { vox: rleDecode(cached.rle, map.tile * map.tile * cached.H), H: cached.H, paths: cached.paths || [] };
  }
  // kant-en-klare tegel van de website (sneller dan zelf omzetten)
  if (map.baked) {
    try {
      const res = await fetch(`${map.baked}${tx}_${tz}.bin`);
      if (res.ok) {
        const t = unpackTile(await gunzipMaybe(await res.arrayBuffer()));
        await cachePut(key, { rle: t.rle, H: t.H, paths: t.paths });
        if (m.prefetch) return { H: t.H, bytes: t.rle.length };
        return { vox: rleDecode(t.rle, map.tile * map.tile * t.H), H: t.H, paths: t.paths };
      }
    } catch { /* dan zelf omzetten */ }
  }
  // zelfgegenereerde wereld: geen download nodig
  if (map.kind === 'proc') {
    const r = generateTile(tx, tz);
    const rle = rleEncode(r.vox);
    await cachePut(key, { rle, H: r.H, paths: r.paths });
    await cachePut(lodKey(map, tx, tz), computeLod(r.vox, map.tile, r.H));
    return { vox: r.vox, H: r.H, bytes: rle.length, paths: r.paths };
  }
  const osm = await getSuper(map, Math.floor(tx / map.superTiles), Math.floor(tz / map.superTiles));
  const c = tileCenter(map, tx, tz);
  const b = bboxFor(c.lat, c.lon, map.tile, 30);
  const sub = subsetOSM(osm, b.s, b.w, b.n, b.e);
  const elev = await superElev(map, Math.floor(tx / map.superTiles), Math.floor(tz / map.superTiles));
  const r = rasterize(sub, c.lat, c.lon, map.tile, null, 1, { mx: mapMX(map), ox: tx * map.tile, oz: tz * map.tile, elev });
  const rle = rleEncode(r.vox);
  await cachePut(key, { rle, H: r.H, paths: r.paths });
  await cachePut(lodKey(map, tx, tz), computeLod(r.vox, map.tile, r.H));
  return { vox: r.vox, H: r.H, bytes: rle.length, paths: r.paths };
}

// ---------- eenvoudige versie per tegel (verre gebouwen + minikaart) ----------
const lodKey = (map, tx, tz) => `${map.id}-lod-v${map.version}-${tx}-${tz}`;
async function gunzipMaybe(buf) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
let bakedLods = null;
async function loadBakedLods(map) {
  if (bakedLods !== null || !map.baked) return;
  bakedLods = new Map();
  try {
    const b = new Uint8Array(await gunzipMaybe(await (await fetch(`${map.baked}lod.bin`)).arrayBuffer()));
    const n = 16, rec = 4 + n * n * 2 + n * n * 3;
    for (let o = 0; o + rec <= b.length; o += rec) {
      const dv = new DataView(b.buffer, o);
      const tx = dv.getUint16(0, true), tz = dv.getUint16(2, true);
      const h = new Int16Array(b.slice(o + 4, o + 4 + n * n * 2).buffer), c = b.slice(o + 4 + n * n * 2, o + rec);
      bakedLods.set(tz * 1000 + tx, { n, h, c });
    }
  } catch { /* geen voorbereide data */ }
}
async function getLod(map, tx, tz) {
  const k = lodKey(map, tx, tz);
  let l = await cacheGet(k);
  if (l) return l;
  if (map.baked) { await loadBakedLods(map); const bl = bakedLods.get(tz * 1000 + tx); if (bl) return bl; }
  const t = await cacheGet(keys.tile(map, tx, tz));
  if (!t || !t.rle) return null;
  l = computeLod(rleDecode(t.rle, map.tile * map.tile * t.H), map.tile, t.H);
  await cachePut(k, l);
  return l;
}
async function sendLods(m) {
  const { map, tx: cx, tz: cz, radius: R } = m;
  const list = [];
  for (let tz = Math.max(0, cz - R); tz <= Math.min((map.tilesZ || map.tiles) - 1, cz + R); tz++)
    for (let tx = Math.max(0, cx - R); tx <= Math.min((map.tilesX || map.tiles) - 1, cx + R); tx++)
      list.push([(tx - cx) ** 2 + (tz - cz) ** 2, tx, tz]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, tx, tz] of list) {
    const lod = await getLod(map, tx, tz);
    if (lod) self.postMessage({ type: 'lodTile', id: m.id, tx, tz, lod });
  }
  self.postMessage({ type: 'lodDone', id: m.id });
}

// zelfde verdeling als in app.js: alle tegels van één blok van 500 m bij dezelfde werker
function workerFor(map, tx, tz, pool) {
  const sx = Math.floor(tx / map.superTiles), sz = Math.floor(tz / map.superTiles);
  return ((sx * 7 + sz * 13) % pool + pool) % pool;
}
