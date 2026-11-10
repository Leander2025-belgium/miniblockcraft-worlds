// Hoofdmenu: stadskaart, gebied kiezen, downloaden, beheren en spelen.
import * as store from './storage.js';
import { topView } from './osm.js';
import { CITY, SPAWN, PLACES as CITY_PLACES, toBlocks } from './frankfurt.js';
import { makeMap, mapSize, spawnFor, keys as mapKeys, superCount } from './bigmap.js';
import { META as METRO, PLACES as METRO_PLACES, zoneAtExport as metroZone, zoneName as metroZoneName, MW as METRO_W, ML as METRO_L } from './metropolis.js';
import * as BERGW from './mountain.js';
const BERG = BERGW.META;
// zelfgegenereerde werelden
const PROC = {
  [METRO.id]: { META: METRO, PLACES: METRO_PLACES, zoneName: metroZoneName, spawn: { x: 12500, y: METRO.ground + 160, z: 15200, yaw: 0, pitch: 0.12, fly: true }, info: 'Fantasiewereld · 25 × 30 km' },
  [BERG.id]: { META: BERG, PLACES: BERGW.PLACES, zoneName: BERGW.zoneName, groundAt: (x, z) => Math.round(BERGW.G + BERGW.surfaceAt(x, z)),
    spawn: { x: BERGW.SPAWN.x, y: BERGW.SPAWN.y, z: BERGW.SPAWN.z, yaw: 0, pitch: 0.3, fly: false }, info: 'Bergwereld · 14 × 14 km · top op ± 1550 m' },
};

const $ = (s) => document.querySelector(s);
const MAP_SCALE = 5; // meter per pixel op de overzichtskaart

// Meerdere achtergrondwerkers: elk zet zijn eigen blokken van 500 m om (sneller op toestellen met meerdere kernen)
const POOL = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
const workers = [];
let reqId = 0;
const pending = new Map(); // id -> { h, w }
const liveStatus = new Map(); // kaart-id -> laatste melding van de achtergrondwerker
function startWorker(i) {
  const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  workers[i] = w;
  w.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'status') { liveStatus.set(d.map, d.text); if (prefetch.job) showPrefetch(prefetch.job); return; }
    const p = pending.get(d.id);
    if (p) {
      if (!['progress', 'areaProgress', 'mapRows', 'lodTile'].includes(d.type)) pending.delete(d.id);
      p.h(d);
    }
  };
  // vastgelopen (bv. te weinig geheugen): opnieuw starten en wachtende aanvragen laten weten dat het mislukte
  w.onerror = (e) => {
    e.preventDefault?.();
    const lost = [...pending].filter(([, p]) => p.w === i);
    for (const [id] of lost) pending.delete(id);
    try { w.terminate(); } catch { /* al weg */ }
    startWorker(i);
    for (const [, p] of lost) p.h({ type: 'error', message: 'achtergrondproces liep vast en is opnieuw gestart' });
  };
}
for (let i = 0; i < POOL; i++) startWorker(i);
function workerFor(map, tx, tz) {
  const sx = Math.floor(tx / map.superTiles), sz = Math.floor(tz / map.superTiles);
  return ((sx * 7 + sz * 13) % POOL + POOL) % POOL;
}
function ask(msg, handler, wi = 0) {
  const id = ++reqId;
  pending.set(id, { h: handler, w: wi });
  workers[wi].postMessage({ ...msg, id });
  return id;
}
// naar elke werker sturen (bv. de achtergrond-taak rond de speler)
function askAll(msg, handler) { for (let i = 0; i < POOL; i++) ask({ ...msg, pool: POOL, poolIndex: i }, handler, i); }

const state = { regions: [], busy: false };
let game = null;

// ---------- overzichtskaart van Nova Metropool ----------
const ZONE_COLORS = { 1: [50, 100, 190], 2: [220, 205, 150], 3: [60, 110, 200], 4: [201, 195, 178], 5: [140, 143, 148], 6: [110, 170, 90],
  7: [74, 79, 90], 8: [109, 115, 128], 9: [154, 143, 128], 10: [127, 174, 106], 11: [140, 143, 148] };
function drawMetroMap() {
  const c = $('#metro-map');
  if (!c || c.dataset.done) return;
  c.dataset.done = '1';
  const S = 25, W = Math.round(METRO_W / S), H = Math.round(METRO_L / S);
  c.width = W; c.height = H;
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x * S + S / 2, wz = y * S + S / 2;
    const zn = metroZone(wx, wz);
    let col = ZONE_COLORS[zn] || [90, 90, 90];
    // straten zichtbaar maken in de stad
    const road = (wx % 400 < 40 || wz % 400 < 40) && zn >= 7;
    if (road) col = col.map(v => v * 0.7);
    const i = (y * W + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  const ctx = c.getContext('2d');
  ctx.putImageData(img, 0, 0);
  ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const [name, x, z] of METRO_PLACES) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(name, x / S + 1, z / S + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(name, x / S, z / S);
  }
  const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * METRO_W, (e.clientY - r.top) / r.height * METRO_L]; };
  c.addEventListener('mousemove', (e) => { const [x, z] = pos(e); $('#hover').textContent = `${metroZoneName(x, z)} · x ${Math.round(x)} · z ${Math.round(z)}`; });
  c.addEventListener('click', (e) => { const [x, z] = pos(e); playMap(METRO.id, { x, z }); });
}

function notify(t) {
  const el = $('#menu-msg'); el.textContent = t; el.hidden = false;
  clearTimeout(notify.t); notify.t = setTimeout(() => { el.hidden = true; }, 5000);
}

const regionMeters = (r) => Math.round(r.size / ((r.real && r.real.scale) || 1));

// ---------- mijn stukken ----------
function fmtBytes(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB'; }
async function refreshList() {
  try { state.regions = await store.listRegions(); } catch { state.regions = []; }
  drawSavedOnMap();
  updateResume();
  const list = $('#regions');
  list.innerHTML = '';
  if (!state.regions.length) {
    list.innerHTML = '<p class="muted">Nog niets gedownload. Kies een plek op de kaart en download een stuk stad.</p>';
    return;
  }
  for (const r of state.regions) {
    if (r.kind === 'map') { list.appendChild(mapCard(r)); continue; }
    const card = document.createElement('div');
    card.className = 'region';
    const edited = r.edited ? ' · bewerkt' : '';
    card.innerHTML = `
      <div class="r-title"></div>
      <div class="muted small">${regionMeters(r)}×${regionMeters(r)} m${r.real && r.real.scale > 1 ? ' (fijn detail)' : ''} · ${r.real ? `📍 ${r.real.lat.toFixed(4)}, ${r.real.lon.toFixed(4)}` : `x ${r.x0} · z ${r.z0}`}${r.bytes ? ' · ' + fmtBytes(r.bytes) : ''}${edited}</div>
      <div class="r-actions">
        <button class="btn primary" data-a="play">▶ Spelen</button>
        ${r.real ? '<button class="btn" data-a="show">Toon</button>' : ''}
        <button class="btn" data-a="export">Bestand</button>
        <button class="btn danger" data-a="del">✕</button>
      </div>`;
    card.querySelector('.r-title').textContent = r.name;
    card.querySelector('[data-a=play]').onclick = () => play(r.id);
    if (r.real) card.querySelector('[data-a=show]').onclick = () => showReal(r);
    card.querySelector('[data-a=export]').onclick = () => exportRegion(r);
    const del = card.querySelector('[data-a=del]');
    del.onclick = async () => {
      if (!del.dataset.sure) {
        del.dataset.sure = '1'; del.textContent = 'Zeker verwijderen?';
        setTimeout(() => { delete del.dataset.sure; del.textContent = '✕'; }, 3000);
        return;
      }
      await store.deleteRegion(r.id); refreshList();
    };
    list.appendChild(card);
  }
}

async function exportRegion(r) {
  const vox = await store.loadRegionData(r.id);
  if (!vox) return notify('De gegevens van dit stuk zijn niet gevonden.');
  const blob = await store.exportFile(await store.getRegionMeta(r.id), vox);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = r.name.replace(/[^\w\- ()]+/g, '_') + '.blokstad';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('#import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const bytes = await store.readMaybeGzip(f);
    const builds = await store.importBuilds(bytes);
    if (builds) {
      // bouwwerken voor een grote kaart: kaart aanmaken als die nog niet bestaat
      const m = builds.meta;
      if (!(await store.getRegionMeta(m.id))) { delete m.player; delete m.done; delete m.complete; await store.saveMeta(m); }
      notify(`${builds.entries.length} stukken met bouwwerken geïmporteerd in “${m.name}”.`);
      refreshList();
      return;
    }
    const { meta, vox } = await store.importFile(f, bytes);
    meta.id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    meta.name = (meta.name || 'Geïmporteerd') + ' (import)';
    await store.saveRegion(meta, vox);
    refreshList();
  } catch (err) { notify('Importeren mislukt: ' + err.message); }
});

// ---------- spelen ----------
// op telefoons: volledig scherm en liggend (waar de browser dat toestaat); moet meteen bij de tik gebeuren
function phoneFullscreen() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  try {
    const r = el.requestFullscreen?.({ navigationUI: 'hide' });
    r?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch { /* niet ondersteund (bv. iPhone) */ }
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-city, .region [data-a=play]')) phoneFullscreen();
}, true);

async function ensureGame() {
  if (!game) {
    const { Game } = await import('./game.js');
    game = new Game({
      root: $('#game'), canvas: $('#game-canvas'), coords: $('#hud-coords'), place: $('#hud-place'),
      hotbar: $('#hotbar'), blockName: $('#block-name'), loading: $('#loading'), invGrid: $('#inv-grid'),
      overlays: { start: $('#ov-start'), pause: $('#ov-pause'), inv: $('#ov-inv'), map: $('#ov-map') },
      minimap: $('#minimap'), bigmap: $('#bigmap'), btnMapClose: $('#btn-map-close'),
      btnResume: $('#btn-resume'), btnInvClose: $('#btn-inv-close'),
      viewRange: $('#set-view'), viewLabel: $('#set-view-label'), sens: $('#set-sens'),
      touch: {
        move: $('#t-move'), look: $('#t-look'), stick: $('#t-stick'), knob: $('#t-knob'), jump: $('#t-jump'), down: $('#t-down'),
        brk: $('#t-break'), put: $('#t-place'), fly: $('#t-fly'), speed: $('#t-speed'), inv: $('#t-inv'), menu: $('#t-menu'),
      },
      onSave: (quiet) => saveGame(quiet),
    });
  }
  return game;
}

// laatst gespeelde wereld onthouden (na een herstart van de pagina meteen verder)
function rememberLast(kind, id, name) { try { localStorage.setItem('blokstad-last', JSON.stringify({ kind, id, name })); } catch { /* geen opslag */ } }
function updateResume() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem('blokstad-last') || 'null'); } catch { /* geen opslag */ }
  const ok = last && (PROC[last.id] || last.id === CITY.id || state.regions.some(r => r.id === last.id));
  $('#resume').hidden = !ok;
  if (!ok) return;
  $('#btn-resume-last').textContent = `▶ Verder spelen: ${last.name}`;
  $('#btn-resume-last').onclick = () => { phoneFullscreen(); last.kind === 'map' ? playMap(last.id) : play(last.id); };
}

async function play(id) {
  const meta = await store.getRegionMeta(id);
  const vox = await store.loadRegionData(id);
  if (!meta || !vox) return notify('Dit stuk kon niet geladen worden.');
  await ensureGame();
  $('#menu').hidden = true;
  $('#tp-wrap').hidden = true;
  $('#game-title').textContent = meta.name;
  rememberLast('region', id, meta.name);
  game.load(meta, vox);
  game.start();
}

// ---------- grote kaarten (kilometers, in tegels) ----------
// Kant-en-klare tegels op de website (gemaakt met tools/bake-frankfurt.mjs)?
const bakedCache = new Map();
async function bakedBase(map) {
  if (map.id !== CITY.id) return null;
  if (bakedCache.has(map.id)) return bakedCache.get(map.id);
  let base = null;
  try {
    const url = new URL(`data/${map.id}/v${map.version}/`, location.href).href;
    const res = await fetch(url + 'manifest.json', { cache: 'no-cache' });
    if (res.ok) base = url;
  } catch { /* geen voorbereide data */ }
  bakedCache.set(map.id, base);
  return base;
}
function mapMeta(map) {
  return { id: map.id, kind: 'map', name: map.name, map, size: mapSize(map), ground: map.ground,
    real: { lat: map.lat, lon: map.lon, scale: 1 }, created: Date.now() };
}
async function playMap(id, at) {
  if (location.hash === '#debug') window.blokGame = () => game;
  let meta = await store.getRegionMeta(id);
  if (!meta && id === CITY.id) { meta = mapMeta(CITY); await store.saveMeta(meta); }
  const P = PROC[id];
  if (!meta && P) { meta = { id, kind: 'map', name: P.META.name, map: { ...P.META }, size: P.META.tilesX * P.META.tile, ground: P.META.ground, proc: true, created: Date.now() }; await store.saveMeta(meta); }
  if (!meta) return notify('Deze kaart bestaat niet meer.');
  await ensureGame();
  const map = meta.map, T = map.tile;
  if (map.kind === 'proc') Object.assign(map, (PROC[map.id] || PROC[METRO.id]).META);
  else {
    map.superTiles = 4;
    map.version = CITY.version;
    map.baked = await bakedBase(map);
  }
  const provider = (tx, tz) => new Promise((resolve, reject) => {
    store.cacheGet(mapKeys.edit(map, tx, tz)).then((ed) => {
      if (ed && ed.rle) return resolve({ vox: store.rleDecode(ed.rle, T * T * ed.H), H: ed.H, y0: ed.y0 || 0, edge: ed.edge || null });
      ask({ type: 'cityTile', tx, tz, map }, (m) => {
        if (m.type === 'cityTile') resolve(m);
        else if (m.type === 'error') reject(new Error(m.message));
      }, workerFor(map, tx, tz));
    });
  });
  const saveTile = (tx, tz, vox, H, y0, edge) => store.cachePut(mapKeys.edit(map, tx, tz), { rle: store.rleEncode(vox), H, y0: y0 || 0, edge: edge || null });
  const isCity = map.id === CITY.id, isMetro = map.kind === 'proc', PR = PROC[map.id] || PROC[METRO.id];
  $('#menu').hidden = true;
  $('#tp-wrap').hidden = !isCity && !isMetro;
  fillTeleports(isMetro ? PR.PLACES.map(([n, x, z]) => [n, null, null, x, z]) : CITY_PLACES);
  $('#game-title').textContent = meta.name;
  const onLod = (m) => { if (m.type === 'lodTile' && game && game.lod) game.lod.add(m.tx, m.tz, m.lod); };
  const areaProg = new Map();
  const prefetchArea = (tx, tz, radius) => { areaProg.clear(); askAll({ type: 'area', map, tx, tz, radius }, (m) => {
    if (m.type === 'areaProgress' && game && game.tiled) {
      areaProg.set(m.id, m);
      let done = 0, total = 0;
      for (const v of areaProg.values()) { done += v.done; total += v.total; }
      game.aheadProgress = { done, total };
    }
    onLod(m);
  }); };
  const requestLods = (tx, tz, radius) => ask({ type: 'lods', map, tx, tz, radius }, onLod);
  let spawn = isMetro ? { ...PR.spawn } : isCity ? SPAWN : spawnFor(map);
  if (at) { spawn = { x: at.x, y: (isMetro && PR.groundAt ? PR.groundAt(at.x, at.z) + 40 : map.ground + 90), z: at.z, yaw: 0, pitch: -0.15, fly: true }; delete meta.player; }
  rememberLast('map', id, meta.name);
  game.loadTiled(meta, { ...map, spawn, prefetchArea, requestLods, zoneName: isMetro ? PR.zoneName : null, groundAt: isMetro ? PR.groundAt : null }, provider, saveTile);
  game.start();
}
$('#btn-city').addEventListener('click', () => playMap(CITY.id));
$('#btn-metro').addEventListener('click', () => { phoneFullscreen(); playMap(METRO.id); });
$('#btn-berg').addEventListener('click', () => { phoneFullscreen(); playMap(BERG.id); });
// overzichtskaart van de Reuzenberg (met wandelpad en kabelbaan)
function drawBergMap() {
  const c = $('#berg-map');
  if (!c || c.dataset.done) return;
  c.dataset.done = '1';
  const S = 40, W = Math.round(BERGW.MW / S), H = Math.round(BERGW.ML / S);
  c.width = W; c.height = H;
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const col = BERGW.overviewColor(x * S + S / 2, y * S + S / 2, S), i = (y * W + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  const ctx = c.getContext('2d');
  ctx.putImageData(img, 0, 0);
  const tr = BERGW.TRAIL;
  ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < tr.length; i += 3) (i ? ctx.lineTo : ctx.moveTo).call(ctx, tr[i] / S, tr[i + 1] / S);
  ctx.stroke();
  const [a, b] = BERGW.STATIONS;
  ctx.strokeStyle = '#e33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x / S, a.z / S); ctx.lineTo(b.x / S, b.z / S); ctx.stroke();
  ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const [name, x, z] of [['Dalstation', a.x, a.z + 160], ['Top', BERGW.SUMMIT_XZ[0], BERGW.SUMMIT_XZ[1] - 90], ['Bergmeer', BERGW.LAKE.x, BERGW.LAKE.z + 700]]) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(name, x / S + 1, z / S + 1);
    ctx.fillStyle = '#fff'; ctx.fillText(name, x / S, z / S);
  }
  c.addEventListener('click', (e) => { const r = c.getBoundingClientRect(); phoneFullscreen(); playMap(BERG.id, { x: (e.clientX - r.left) / r.width * BERGW.MW, z: (e.clientY - r.top) / r.height * BERGW.ML }); });
}
function fillTeleports(list) {
  const box = $('#tp-list');
  box.innerHTML = '';
  for (const [name, lat, lon, bx, bz] of list) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = name;
    b.onclick = () => {
      if (!game || !game.tiled) return;
      const [x, z] = bx != null ? [bx, bz] : toBlocks(lat, lon);
      const p = game.player, G0 = game.meta.ground ?? 12;
      p.pos.set(x, G0 + (bx != null ? 120 : 40), z + 60); p.vel.set(0, 0, 0); p.fly = true; p.yaw = 0; p.pitch = bx != null ? -0.1 : 0.15;
      game.tiled.aheadKey = null;
      game.updateTiles(true);
      game.resume();
    };
    box.appendChild(b);
  }
}

// Alles downloaden: elke tegel ophalen en omzetten, zodat de kaart volledig op dit toestel staat.
const prefetch = { job: null };
function stopPrefetch() { if (prefetch.job) prefetch.job.stop = true; }
async function startPrefetch(meta) {
  if (prefetch.job && prefetch.job.id === meta.id && !prefetch.job.stop) return;
  stopPrefetch();
  try { await navigator.storage?.persist?.(); } catch { /* niet ondersteund */ }
  meta.map.superTiles = 4;
  meta.map.version = CITY.version;
  meta.map.baked = await bakedBase(meta.map);
  const map = meta.map, n = map.tiles, sc = superCount(map);
  const job = { id: meta.id, stop: false, done: 0, total: n * n, failed: 0, bytes: 0 };
  prefetch.job = job;
  refreshList(); // andere kaart toont nu 'gepauzeerd'
  // superblokken van het midden naar buiten
  const supers = [];
  for (let sz = 0; sz < sc; sz++) for (let sx = 0; sx < sc; sx++) supers.push([sx, sz, (sx - sc / 2 + 0.5) ** 2 + (sz - sc / 2 + 0.5) ** 2]);
  supers.sort((a, b) => a[2] - b[2]);
  const one = (tx, tz) => new Promise((resolve) => {
    ask({ type: 'cityTile', tx, tz, map, prefetch: true }, (m) => {
      if (m.type === 'cityTile') { job.bytes += m.bytes || 0; resolve(true); }
      else if (m.type === 'error') { job.lastError = m.message; resolve(false); }
    }, workerFor(map, tx, tz));
  });
  showPrefetch(job);
  const doSuper = async (sx, sz) => {
    const tiles = [];
    for (let tz = sz * map.superTiles; tz < Math.min(n, (sz + 1) * map.superTiles); tz++)
      for (let tx = sx * map.superTiles; tx < Math.min(n, (sx + 1) * map.superTiles); tx++) tiles.push([tx, tz]);
    let ok = true;
    for (let i = 0; i < tiles.length && !job.stop; i += 2) {
      const res = await Promise.all(tiles.slice(i, i + 2).map(([tx, tz]) => one(tx, tz)));
      for (const r of res) { if (r) job.done++; else { job.failed++; ok = false; } }
      showPrefetch(job);
      if (job.done % 16 === 0) { const m3 = await store.getRegionMeta(meta.id); if (m3) { m3.done = Math.max(m3.done || 0, job.done); await store.saveMeta(m3); } }
    }
    // ruwe kaartdata weggooien als alle tegels klaar zijn: spaart veel opslag
    if (ok && !job.stop) await new Promise(res => ask({ type: 'dropSuper', map, sx, sz }, res, workerFor(map, sx * map.superTiles, sz * map.superTiles)));
    if (!ok) await new Promise(r => setTimeout(r, 4000));
  };
  // meerdere blokken tegelijk: terwijl het ene wordt omgezet, wordt het volgende al gedownload
  let next = 0;
  const lanes = Math.max(2, Math.min(POOL + 1, 4));
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (!job.stop && next < supers.length) { const [sx, sz] = supers[next++]; await doSuper(sx, sz); }
  }));
  const m2 = await store.getRegionMeta(meta.id);
  if (m2) { m2.done = job.done; m2.complete = job.done >= job.total; m2.bytes = (m2.bytes || 0) + job.bytes; await store.saveMeta(m2); }
  job.finished = true;
  showPrefetch(job);
  if (prefetch.job === job) prefetch.job = null;
  refreshList();
}
function showPrefetch(job) {
  const el = document.getElementById('prog-' + job.id);
  if (!el) return;
  const pct = Math.floor(job.done / job.total * 100);
  el.querySelector('.bar > div').style.width = pct + '%';
  el.querySelector('.ptext').textContent = job.finished
    ? (job.done >= job.total ? 'Volledig gedownload ✓' : job.stop ? `Gepauzeerd bij ${pct}%` : `Klaar met fouten: ${job.failed} stukken mislukt (${job.lastError || 'onbekend'}). Probeer opnieuw.`)
    : `Downloaden… ${job.done} van ${job.total} stukken (${pct}%)${job.failed ? ` · ${job.failed} mislukt` : ''}${liveStatus.get(job.id) ? ' · ' + liveStatus.get(job.id) : ''}`;
}
function mapCard(r) {
  if (r.map && r.map.kind === 'proc') return procCard(r);
  const card = document.createElement('div');
  card.className = 'region';
  const map = r.map, km = (mapSize(map) / 1000).toLocaleString('nl-BE', { maximumFractionDigits: 1 });
  const running = prefetch.job && prefetch.job.id === r.id && !prefetch.job.stop;
  const pct = Math.floor(((r.done || 0) / (map.tiles * map.tiles)) * 100);
  card.innerHTML = `
    <div class="r-title"></div>
    <div class="muted small">Grote kaart · ${km} × ${km} km · 📍 ${map.lat.toFixed(4)}, ${map.lon.toFixed(4)}</div>
    <div class="prefetch" id="prog-${r.id}">
      <div class="bar"><div style="width:${r.complete ? 100 : pct}%"></div></div>
      <div class="ptext small muted">${r.complete ? 'Volledig gedownload ✓' : running ? 'Downloaden…' : r.done ? `Gepauzeerd bij ${pct}%` : 'Nog niet gedownload: laadt tijdens het spelen, of download alles vooraf.'}</div>
    </div>
    <div class="r-actions">
      <button class="btn primary" data-a="play">▶ Spelen</button>
      ${r.complete ? '' : `<button class="btn" data-a="dl">${running ? '⏸ Pauzeren' : r.done ? '⬇ Verder downloaden' : '⬇ Alles downloaden'}</button>`}
      <button class="btn" data-a="show">Toon</button>
      <button class="btn" data-a="share" title="Bewaar je bouwwerken als bestand om te delen">Delen</button>
      <button class="btn danger" data-a="del">✕</button>
    </div>`;
  card.querySelector('.r-title').textContent = r.name;
  card.querySelector('[data-a=play]').onclick = () => playMap(r.id);
  card.querySelector('[data-a=share]').onclick = async () => {
    const meta = await store.getRegionMeta(r.id);
    const { blob, count } = await store.exportBuilds(meta);
    if (!count) return notify('Je hebt in deze kaart nog niets gebouwd. Bouw iets en probeer opnieuw.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.name.replace(/[^\w\- ()]+/g, '_') + '.blokstad-bouw';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    notify(`Bestand met ${count} stukken bouwwerk gemaakt. Stuur het door; de ander opent het met “Bestand importeren…”.`);
  };
  const dl = card.querySelector('[data-a=dl]');
  if (dl) dl.onclick = () => {
    if (prefetch.job && prefetch.job.id === r.id && !prefetch.job.stop) { stopPrefetch(); dl.textContent = '⬇ Verder downloaden'; }
    else { startPrefetch(r); dl.textContent = '⏸ Pauzeren'; }
  };
  card.querySelector('[data-a=show]').onclick = () => { setMode('real'); state.rsize = mapSize(map); setPlace(r.name, map.lat, map.lon); };
  const del = card.querySelector('[data-a=del]');
  del.onclick = async () => {
    if (!del.dataset.sure) {
      del.dataset.sure = '1'; del.textContent = 'Zeker verwijderen?';
      setTimeout(() => { delete del.dataset.sure; del.textContent = '✕'; }, 3000);
      return;
    }
    if (prefetch.job && prefetch.job.id === r.id) stopPrefetch();
    await store.cacheDeletePrefix(mapKeys.prefix(map));
    await store.deleteRegion(r.id); refreshList();
  };
  if (running) setTimeout(() => showPrefetch(prefetch.job), 0);
  return card;
}
// zelfgegenereerde wereld (Nova Metropool): spelen, kaart tonen, bouwwerken delen
function procCard(r) {
  const card = document.createElement('div');
  card.className = 'region';
  card.innerHTML = `
    <div class="r-title"></div>
    <div class="muted small"></div>
    <div class="r-actions">
      <button class="btn primary" data-a="play">▶ Spelen</button>
      <button class="btn" data-a="show">Kaart</button>
      <button class="btn" data-a="share" title="Bewaar je bouwwerken als bestand om te delen">Delen</button>
    </div>`;
  card.querySelector('.r-title').textContent = r.name;
  card.querySelector('.muted').textContent = `${(PROC[r.id] || PROC[METRO.id]).info} · wordt gemaakt terwijl je speelt`;
  card.querySelector('[data-a=play]').onclick = () => { phoneFullscreen(); playMap(r.id); };
  card.querySelector('[data-a=show]').onclick = () => setMode('fantasy');
  card.querySelector('[data-a=share]').onclick = () => shareBuilds(r);
  return card;
}
async function shareBuilds(r) {
  const meta = await store.getRegionMeta(r.id);
  const { blob, count } = await store.exportBuilds(meta);
  if (!count) return notify('Je hebt in deze wereld nog niets gebouwd. Bouw iets en probeer opnieuw.');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = r.name.replace(/[^\w\- ()]+/g, '_') + '.blokstad-bouw';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  notify(`Bestand met ${count} stukken bouwwerk gemaakt. Stuur het door; de ander opent het met “Bestand importeren…”.`);
}

async function createBigMap() {
  const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
  if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180)) return;
  const km = state.rsize / 1000;
  const name = $('#real-name').value.trim() || `Kaart ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const map = makeMap({ id: 'map' + Date.now().toString(36), name, lat, lon, km });
  const meta = mapMeta(map);
  await store.saveMeta(meta);
  await refreshList();
  $('#real-progress').hidden = false;
  $('#real-bar').style.width = '0%';
  $('#real-text').textContent = `Grote kaart gemaakt (${map.tiles * map.tiles} stukken). Het downloaden loopt hieronder bij “Mijn stukken”. Je kan nu al spelen.`;
  startPrefetch(meta);
}

let saving = null;
async function saveGame(quiet) {
  if (!game || !game.meta) return;
  if (saving) return saving;
  if (game.tiled) {
    game.saveDirtyTiles();
    game.dirty = false;
    const meta = { ...game.meta, player: game.playerState() };
    game.meta = meta;
    saving = store.saveMeta(meta)
      .then(() => { if (!quiet) flash('Opgeslagen ✓'); }).catch(err => flash('Opslaan mislukt: ' + err.message)).finally(() => { saving = null; });
    return saving;
  }
  const meta = { ...game.meta, player: game.playerState() };
  if (game.dirty) meta.edited = true;
  const vox = game.dirty ? game.world.vox : null;
  saving = store.saveRegion(meta, vox).then(() => {
    game.meta = meta;
    if (vox) game.dirty = false;
    flash('Opgeslagen ✓');
  }).catch(err => flash('Opslaan mislukt: ' + err.message)).finally(() => { saving = null; });
  return saving;
}
function flash(t) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => { el.hidden = true; }, 1600);
}

$('#btn-save').addEventListener('click', () => saveGame());
$('#btn-exit').addEventListener('click', async () => {
  await saveGame();
  game.stop();
  $('#menu').hidden = false;
  refreshList();
});
window.addEventListener('beforeunload', () => { if (game && game.running && game.dirty) saveGame(); });

// ---------- echte wereld ----------
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#real-panel').hidden = mode !== 'real';
  $('#fantasy-panel').hidden = mode !== 'fantasy';
  $('#real-col').hidden = mode !== 'real';
  $('#map-col').hidden = mode !== 'fantasy';
  if (mode === 'fantasy') { drawMetroMap(); drawBergMap(); }
  if (mode === 'real') initMap();
  try { localStorage.setItem('blokstad-mode', mode); } catch { /* geen opslag */ }
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

state.rsize = 256;
state.rscale = 1;
document.querySelectorAll('[data-rscale]').forEach(b => b.addEventListener('click', () => {
  state.rscale = +b.dataset.rscale;
  document.querySelectorAll('[data-rscale]').forEach(o => o.classList.toggle('on', o === b));
  const fine = state.rscale > 1;
  document.querySelectorAll('[data-rsize]').forEach(o => { o.disabled = fine && +o.dataset.rsize > 128; });
  if (fine && state.rsize > 128) document.querySelector('[data-rsize="128"]').click();
  $('#scale-help').textContent = fine
    ? 'Fijn detail: gebouwen lijken meer op het echte gebouw, maar het stuk is zwaarder. Daarom maximaal 128 m.'
    : 'Normaal detail: snel, ook op een telefoon. 256 m is een goede keuze.';
}));
function updateRealButton() {
  const big = state.rsize >= 1000;
  const km = (state.rsize / 1000).toLocaleString('nl-BE');
  $('#btn-real').textContent = big ? `⬇ Grote kaart maken (${km} × ${km} km)` : '⬇ Download echte gebouwen';
  document.querySelectorAll('[data-rscale="2"]').forEach(o => { o.disabled = big; });
  if (big && state.rscale > 1) document.querySelector('[data-rscale="1"]').click();
  if (big) $('#scale-help').textContent = 'Grote kaarten gebruiken altijd 1 blok = 1 m.';
  else if (state.rscale === 1) $('#scale-help').textContent = 'Normaal detail: snel, ook op een telefoon. 256 m is een goede keuze.';
  const tiles = Math.ceil(state.rsize / 128) ** 2;
  $('#size-help').textContent = big
    ? `Grote kaart zonder randen: ${tiles.toLocaleString('nl-BE')} stukken van 128 m. Alles downloaden duurt ongeveer ${state.rsize >= 10000 ? '30 tot 90 minuten' : state.rsize >= 5000 ? '10 tot 30 minuten' : state.rsize >= 2500 ? '3 tot 10 minuten' : '1 tot 3 minuten'} (hangt af van de OpenStreetMap-server) en neemt ${state.rsize >= 5000 ? 'honderden MB' : 'tientallen MB'} in. Je kan al spelen terwijl het downloadt.`
    : 'Eén los stuk met een rand. Wolkenkrabbers maken het hoger en zwaarder.';
}
document.querySelectorAll('[data-rsize]').forEach(b => b.addEventListener('click', () => {
  state.rsize = +b.dataset.rsize;
  document.querySelectorAll('[data-rsize]').forEach(o => o.classList.toggle('on', o === b));
  updateRealButton();
  updateRect(true);
}));

const PLACES = [
  ['Frankfurt – Skyline', 50.1113, 8.6718], ['Frankfurt – Römerberg', 50.1104, 8.6821],
  ['Frankfurt – Messeturm', 50.1123, 8.6527], ['Frankfurt – Hauptbahnhof', 50.1070, 8.6633],
  ['Brussel – Grote Markt', 50.8467, 4.3525], ['Brugge – Markt', 51.2088, 3.2242],
  ['Antwerpen – Centraal', 51.2172, 4.4211], ['Parijs – Eiffeltoren', 48.8583, 2.2945],
  ['New York – Times Square', 40.7580, -73.9855], ['Londen – The Shard', 51.5045, -0.0865],
];
function setPlace(name, lat, lon, fly = true) {
  $('#lat').value = (+lat).toFixed(5); $('#lon').value = (+lon).toFixed(5); $('#real-name').value = name;
  $('#real-where').textContent = `${name} · ${(+lat).toFixed(4)}, ${(+lon).toFixed(4)}`;
  updateRect(fly);
}

// ---------- wereldkaart (Leaflet + OpenStreetMap) ----------
let lmap = null, selRect = null, savedLayer = null;
function squareBounds(lat, lon, size) {
  const dLat = size / 2 / 110574, dLon = size / 2 / (111320 * Math.cos(lat * Math.PI / 180));
  return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]];
}
function updateRect(fly) {
  if (!lmap) return;
  const lat = +$('#lat').value, lon = +$('#lon').value;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  selRect.setBounds(squareBounds(lat, lon, state.rsize));
  if (fly) {
    const z = state.rsize >= 10000 ? 12 : state.rsize >= 5000 ? 13 : state.rsize >= 2500 ? 14 : state.rsize >= 1000 ? 15 : state.rsize > 256 ? 16 : 17;
    lmap.setView([lat, lon], z);
  }
}
let nameReq = 0;
async function nameFor(lat, lon) {
  const my = ++nameReq;
  const fallback = `Plek ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  $('#real-name').value = fallback;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=nl&lat=${lat}&lon=${lon}`);
    const j = await r.json();
    const a = j.address || {};
    const street = a.road || a.pedestrian || a.square || a.neighbourhood || a.suburb;
    const city = a.city || a.town || a.village || a.municipality;
    const name = [city, street].filter(Boolean).join(' – ');
    if (name && my === nameReq) { $('#real-name').value = name; $('#real-where').textContent = `${name} · ${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
  } catch { /* zonder internet blijft de coördinaat de naam */ }
}
function pickOnMap(lat, lon) {
  $('#lat').value = lat.toFixed(5); $('#lon').value = lon.toFixed(5);
  $('#real-where').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  updateRect(false);
}
function initMap() {
  if (lmap) { lmap.invalidateSize(); return; }
  if (!window.L) { $('#map-note').hidden = false; $('#map-note').textContent = 'De kaart kon niet geladen worden. Je kan nog steeds coördinaten invullen.'; return; }
  const lat = +$('#lat').value, lon = +$('#lon').value;
  lmap = L.map('realmap', { worldCopyJump: true }).setView([lat, lon], 16);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(lmap);
  let errs = 0, oks = 0;
  tiles.on('tileerror', () => { if (++errs >= 3 && !oks) $('#map-note').hidden = false; });
  tiles.on('tileload', () => { oks++; $('#map-note').hidden = true; });
  savedLayer = L.layerGroup().addTo(lmap);
  selRect = L.rectangle(squareBounds(lat, lon, state.rsize), { color: '#ffd34d', weight: 3, fillColor: '#ffd34d', fillOpacity: 0.15 }).addTo(lmap);
  selRect.bindTooltip('Dit stuk wordt gedownload', { direction: 'top' });
  let drag = null, justDragged = false;
  selRect.on('mousedown', (e) => {
    const c = selRect.getBounds().getCenter();
    drag = { dLat: c.lat - e.latlng.lat, dLon: c.lng - e.latlng.lng, moved: false };
    lmap.dragging.disable();
    L.DomEvent.stop(e);
  });
  lmap.on('mousemove', (e) => {
    if (!drag) return;
    drag.moved = true;
    pickOnMap(e.latlng.lat + drag.dLat, e.latlng.lng + drag.dLon);
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) { justDragged = true; setTimeout(() => { justDragged = false; }, 50); nameFor(+$('#lat').value, +$('#lon').value); }
    drag = null; lmap.dragging.enable();
  };
  lmap.on('mouseup', endDrag);
  document.addEventListener('mouseup', endDrag);
  lmap.on('click', (e) => {
    if (justDragged) return;
    const w = e.latlng.wrap();
    pickOnMap(w.lat, w.lng);
    nameFor(w.lat, w.lng);
    $('#real-result').hidden = true;
  });
  drawSavedOnMap();
}
function drawSavedOnMap() {
  if (!savedLayer) return;
  savedLayer.clearLayers();
  for (const r of state.regions) {
    if (!r.real) continue;
    L.rectangle(squareBounds(r.real.lat, r.real.lon, r.kind === 'map' ? mapSize(r.map) : regionMeters(r)), { color: '#5fd27a', weight: 2, fillOpacity: 0.2, interactive: true })
      .bindTooltip(`${r.name} (gedownload)`).addTo(savedLayer);
  }
}
$('#lat').addEventListener('change', () => updateRect(true));
$('#lon').addEventListener('change', () => updateRect(true));
for (const [name, lat, lon] of PLACES) {
  const b = document.createElement('button');
  b.className = 'chip'; b.textContent = name;
  b.onclick = () => setPlace(name, lat, lon);
  $('#real-jumps').appendChild(b);
}

$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-q').value.trim();
  const box = $('#search-results');
  if (!q) return;
  box.innerHTML = '<span class="help">Zoeken…</span>';
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=nl&q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error(res.status);
    const list = await res.json();
    box.innerHTML = list.length ? '' : '<span class="help">Niets gevonden. Probeer een andere naam.</span>';
    for (const r of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.display_name;
      b.onclick = () => { setPlace(r.display_name.split(',').slice(0, 2).join(',').trim(), r.lat, r.lon); box.innerHTML = ''; };
      box.appendChild(b);
    }
  } catch {
    box.innerHTML = '<span class="help">Zoeken lukt hier niet (geen verbinding met OpenStreetMap). Kies een plek hieronder of vul coördinaten in.</span>';
  }
});

document.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => {
  const lat = +$('#lat').value, lon = +$('#lon').value, s = state.rsize;
  const dLat = s / 110574, dLon = s / (111320 * Math.cos(lat * Math.PI / 180));
  const d = b.dataset.move;
  const nl = lat + (d === 'n' ? dLat : d === 's' ? -dLat : 0), no = lon + (d === 'e' ? dLon : d === 'w' ? -dLon : 0);
  const base = $('#real-name').value.replace(/ \((noord|zuid|oost|west)\)$/, '');
  setPlace(`${base} (${{ n: 'noord', s: 'zuid', e: 'oost', w: 'west' }[d]})`, nl, no);
  $('#real-result').hidden = true;
}));

function drawRealPreview(data, size) {
  const c = $('#real-preview');
  c.width = c.height = size;
  c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  $('#real-result').hidden = false;
}

function realJob(msg, name) {
  if (state.busy) return;
  state.busy = true;
  $('#btn-real').disabled = true;
  const wrap = $('#real-progress'), bar = $('#real-bar'), txt = $('#real-text');
  wrap.hidden = false; bar.style.width = '2%'; txt.textContent = 'Starten…';
  const done = () => { state.busy = false; $('#btn-real').disabled = false; };
  ask(msg, async (m) => {
    if (m.type === 'progress') { bar.style.width = Math.round(m.p * 100) + '%'; txt.textContent = m.text; }
    else if (m.type === 'error') { txt.textContent = m.message + ' Probeer het opnieuw, of gebruik een OSM-bestand.'; bar.style.width = '0%'; done(); }
    else if (m.type === 'osmDone') {
      drawRealPreview(m.preview, m.size);
      setPlace(name || `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`, m.lat, m.lon);
      const meta = {
        id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name: name || `Plek ${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`, x0: 0, z0: 0, size: m.size, H: m.H, ground: m.ground,
        real: { lat: m.lat, lon: m.lon, scale: m.scale }, created: Date.now(), wijk: name || 'Echte wereld', type: 'Echte wereld',
      };
      try {
        await store.saveRegion(meta, m.vox);
        bar.style.width = '100%';
        txt.textContent = `Klaar: ${m.buildings} gebouwen. Je vindt het bij “Mijn stukken”.`;
        $('#real-info').textContent = `${meta.name} · ${m.meters}×${m.meters} m · ${m.buildings} gebouwen · tot ${Math.round((m.H - m.ground) / m.scale)} m hoog.`;
      } catch (err) { txt.textContent = 'Opslaan mislukt: ' + err.message; }
      done();
      refreshList();
    }
  });
}

$('#btn-real').addEventListener('click', () => {
  const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
  if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180)) { $('#real-text').textContent = 'Vul een geldige breedte- en lengtegraad in.'; $('#real-progress').hidden = false; return; }
  if (state.rsize >= 1000) return createBigMap();
  realJob({ type: 'osm', lat, lon, size: state.rsize, scale: state.rscale }, $('#real-name').value.trim());
});
$('#osm-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const text = await f.text();
  realJob({ type: 'osm', text, size: state.rsize, scale: state.rscale }, f.name.replace(/\.(osm|xml|json)$/i, '') === 'map' ? '' : f.name.replace(/\.(osm|xml|json)$/i, ''));
});

async function showReal(r) {
  setMode('real');
  setPlace(r.name, r.real.lat, r.real.lon);
  const vox = await store.loadRegionData(r.id);
  if (vox) drawRealPreview(topView(vox, r.size, r.H), r.size);
  $('#real-info').textContent = `${r.name} · ${regionMeters(r)}×${regionMeters(r)} m`;
}

// ---------- altijd de nieuwste versie ----------
const APP_VERSION = '2026-11-10a';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
fetch('./version.json', { cache: 'no-store' }).then(r => r.json()).then(({ version }) => {
  if (version && version !== APP_VERSION) {
    // oude kopie in de browser: één keer opnieuw laden met de nieuwe bestanden
    let last = 0;
    try { last = +sessionStorage.getItem('blokstad-reload') || 0; } catch { /* geen opslag */ }
    if (Date.now() - last > 60000) {
      try { sessionStorage.setItem('blokstad-reload', String(Date.now())); } catch { /* geen opslag */ }
      location.reload();
    }
  }
}).catch(() => {});

// start
let startMode = 'real';
try { startMode = localStorage.getItem('blokstad-mode') || 'real'; } catch { /* geen opslag */ }
setPlace('Frankfurt – Skyline', 50.1113, 8.6718);
refreshList().then(() => setMode(startMode));
