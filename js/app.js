// Hoofdmenu: stadskaart, gebied kiezen, downloaden, beheren en spelen.
import { WIDTH, LENGTH, HEIGHT, districtAt, riverX } from './city.js';
import * as store from './storage.js';
import { topView } from './osm.js';
import { CITY, SPAWN, PLACES as CITY_PLACES, toBlocks } from './frankfurt.js';
import { makeMap, mapSize, spawnFor, keys as mapKeys, superCount } from './bigmap.js';

const $ = (s) => document.querySelector(s);
const MAP_SCALE = 5; // meter per pixel op de overzichtskaart

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map();
worker.onmessage = (e) => { const h = pending.get(e.data.id); if (h) h(e.data); };
function ask(msg, handler) { const id = ++reqId; pending.set(id, handler); worker.postMessage({ ...msg, id }); return id; }

const state = { size: 128, sel: null, regions: [], zoom: 1, busy: false };
let game = null;

// ---------- overzichtskaart ----------
const mapCanvas = $('#map'), overlay = $('#map-overlay'), mapWrap = $('#map-wrap');
const MW = Math.floor(WIDTH / MAP_SCALE), MH = Math.floor(LENGTH / MAP_SCALE);
mapCanvas.width = overlay.width = MW;
mapCanvas.height = overlay.height = MH;
const mctx = mapCanvas.getContext('2d'), octx = overlay.getContext('2d');
mctx.fillStyle = '#1b2230'; mctx.fillRect(0, 0, MW, MH);

ask({ type: 'map', scale: MAP_SCALE }, (m) => {
  if (m.type === 'mapRows') {
    mctx.putImageData(new ImageData(m.data, m.w, m.rows), 0, m.y0);
    $('#map-status').textContent = `Kaart tekenen… ${Math.round((m.y0 + m.rows) / MH * 100)}%`;
  } else if (m.type === 'mapDone') {
    $('#map-status').textContent = '';
  }
});

function setZoom(z) {
  state.zoom = z;
  const base = Math.min(mapWrap.clientWidth - 4, 520);
  const w = Math.round(base * z);
  for (const c of [mapCanvas, overlay]) { c.style.width = w + 'px'; c.style.height = Math.round(w * MH / MW) + 'px'; }
  $('#map-stack').style.width = w + 'px';
  $('#zoom-label').textContent = `${z}×`;
}
$('#zoom-in').onclick = () => setZoom(Math.min(4, state.zoom * 2));
$('#zoom-out').onclick = () => setZoom(Math.max(1, state.zoom / 2));
window.addEventListener('resize', () => setZoom(state.zoom));

function drawOverlay() {
  octx.clearRect(0, 0, MW, MH);
  // km-markeringen
  octx.font = 'bold 11px system-ui, sans-serif';
  for (let km = 1; km < LENGTH / 1000; km++) {
    const y = km * 1000 / MAP_SCALE;
    octx.fillStyle = 'rgba(255,255,255,0.35)';
    octx.fillRect(0, y, 14, 1);
    octx.fillStyle = 'rgba(0,0,0,0.55)'; octx.fillRect(16, y - 7, 34, 14);
    octx.fillStyle = '#fff'; octx.fillText(`${km} km`, 18, y + 4);
  }
  for (const r of state.regions) {
    if (r.real || r.kind === 'map') continue;
    octx.fillStyle = 'rgba(80, 220, 120, 0.35)';
    octx.strokeStyle = 'rgba(80, 220, 120, 0.95)'; octx.lineWidth = 1;
    const x = r.x0 / MAP_SCALE, y = r.z0 / MAP_SCALE, s = r.size / MAP_SCALE;
    octx.fillRect(x, y, s, s); octx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }
  if (state.sel) {
    const { x0, z0, size } = state.sel;
    octx.strokeStyle = '#ffd34d'; octx.lineWidth = 2;
    octx.strokeRect(x0 / MAP_SCALE, z0 / MAP_SCALE, size / MAP_SCALE, size / MAP_SCALE);
    octx.strokeStyle = 'rgba(0,0,0,0.7)'; octx.lineWidth = 1;
    octx.strokeRect(x0 / MAP_SCALE - 2, z0 / MAP_SCALE - 2, size / MAP_SCALE + 4, size / MAP_SCALE + 4);
  }
}

overlay.addEventListener('click', (e) => {
  const rect = overlay.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * WIDTH;
  const z = (e.clientY - rect.top) / rect.height * LENGTH;
  select(x, z);
});
overlay.addEventListener('mousemove', (e) => {
  const rect = overlay.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / rect.width * WIDTH);
  const z = Math.floor((e.clientY - rect.top) / rect.height * LENGTH);
  const d = districtAt(x, z);
  $('#hover').textContent = `x ${x} · z ${z} — ${d.wijk} (${d.typeName})`;
});
overlay.addEventListener('mouseleave', () => { $('#hover').textContent = ''; });

function select(x, z, scroll = false) {
  const s = state.size;
  const x0 = Math.max(0, Math.min(WIDTH - s, Math.round(x - s / 2)));
  const z0 = Math.max(0, Math.min(LENGTH - s, Math.round(z - s / 2)));
  state.sel = { x0, z0, size: s };
  drawOverlay();
  const d = districtAt(x0 + s / 2, z0 + s / 2);
  $('#sel-info').innerHTML = `<b>${d.wijk}</b> · ${d.typeName}<br><span class="muted">x ${x0}–${x0 + s} m · z ${z0}–${z0 + s} m · ${s}×${s} m</span>`;
  $('#sel-name').value = `${d.wijk} (${d.typeName})`;
  $('#btn-download').disabled = state.busy;
  $('#selection').hidden = false;
  const pv = $('#preview'), pctx = pv.getContext('2d');
  pv.width = pv.height = s;
  pctx.fillStyle = '#222'; pctx.fillRect(0, 0, s, s);
  ask({ type: 'preview', x0, z0, size: s }, (m) => {
    if (state.sel && state.sel.x0 === x0 && state.sel.z0 === z0 && state.sel.size === s) pctx.putImageData(new ImageData(m.data, m.size, m.size), 0, 0);
  });
  if (scroll) {
    const rect = overlay.getBoundingClientRect();
    const y = (z0 + s / 2) / LENGTH * rect.height;
    const xx = (x0 + s / 2) / WIDTH * rect.width;
    mapWrap.scrollTo({ top: y - mapWrap.clientHeight / 2, left: xx - mapWrap.clientWidth / 2, behavior: 'smooth' });
  }
}

document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => {
  state.size = +b.dataset.size;
  document.querySelectorAll('[data-size]').forEach(o => o.classList.toggle('on', o === b));
  if (state.sel) select(state.sel.x0 + state.sel.size / 2, state.sel.z0 + state.sel.size / 2);
}));

// snelkoppelingen
const JUMPS = [
  ['Centrum', 1050, 12500], ['Rivier & brug', null, 12250], ['Stadspark', 500, 13850],
  ['Zuidcentrum', 1100, 5200], ['Noordcentrum', 1100, 19800], ['Stadswijk', 1125, 4125],
  ['Woonwijk', 375, 1125], ['Industrie', 1125, 1125],
  ['Haven Noord', 900, 420], ['Haven Zuid', 900, 24580],
];
const jumps = $('#jumps');
for (const [label, x, z] of JUMPS) {
  const b = document.createElement('button');
  b.className = 'chip'; b.textContent = label;
  b.onclick = () => select(x ?? riverX(z), z, true);
  jumps.appendChild(b);
}
$('#goto').addEventListener('submit', (e) => {
  e.preventDefault();
  const x = +$('#goto-x').value, z = +$('#goto-z').value;
  if (Number.isFinite(x) && Number.isFinite(z)) select(x, z, true);
});

// ---------- downloaden ----------
$('#btn-download').addEventListener('click', () => {
  if (!state.sel || state.busy) return;
  const sel = { ...state.sel };
  const name = $('#sel-name').value.trim() || 'Mijn stuk stad';
  state.busy = true;
  $('#btn-download').disabled = true;
  const bar = $('#dl-bar'), wrap = $('#dl-progress');
  wrap.hidden = false; bar.style.width = '0%';
  $('#dl-text').textContent = 'Downloaden…';
  ask({ type: 'region', x0: sel.x0, z0: sel.z0, size: sel.size }, async (m) => {
    if (m.type === 'progress') {
      bar.style.width = Math.round(m.p * 90) + '%';
      $('#dl-text').textContent = `Downloaden… ${Math.round(m.p * 100)}%`;
    } else if (m.type === 'region') {
      $('#dl-text').textContent = 'Opslaan op dit toestel…';
      bar.style.width = '95%';
      const d = districtAt(sel.x0 + sel.size / 2, sel.z0 + sel.size / 2);
      const meta = {
        id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name, x0: sel.x0, z0: sel.z0, size: sel.size, H: HEIGHT, created: Date.now(), wijk: d.wijk, type: d.typeName,
      };
      try {
        await store.saveRegion(meta, m.vox);
        bar.style.width = '100%';
        $('#dl-text').textContent = 'Klaar! Je vindt het hieronder bij “Mijn stukken”.';
      } catch (err) {
        $('#dl-text').textContent = 'Opslaan mislukt: ' + err.message;
      }
      state.busy = false;
      $('#btn-download').disabled = false;
      refreshList();
      setTimeout(() => { wrap.hidden = true; }, 2500);
    }
  });
});

function notify(t) {
  const el = $('#menu-msg'); el.textContent = t; el.hidden = false;
  clearTimeout(notify.t); notify.t = setTimeout(() => { el.hidden = true; }, 5000);
}

const regionMeters = (r) => Math.round(r.size / ((r.real && r.real.scale) || 1));

// ---------- mijn stukken ----------
function fmtBytes(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB'; }
async function refreshList() {
  try { state.regions = await store.listRegions(); } catch { state.regions = []; }
  drawOverlay();
  drawSavedOnMap();
  const list = $('#regions');
  list.innerHTML = '';
  if (!state.regions.length) {
    list.innerHTML = '<p class="muted">Nog niets gedownload. Klik op de kaart en download een stuk stad.</p>';
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
        <button class="btn" data-a="show">Toon</button>
        <button class="btn" data-a="export">Bestand</button>
        <button class="btn danger" data-a="del">✕</button>
      </div>`;
    card.querySelector('.r-title').textContent = r.name;
    card.querySelector('[data-a=play]').onclick = () => play(r.id);
    card.querySelector('[data-a=show]').onclick = () => r.real ? showReal(r) : (setMode('fantasy'), state.size = r.size, select(r.x0 + r.size / 2, r.z0 + r.size / 2, true));
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
    const { meta, vox } = await store.importFile(f);
    meta.id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    meta.name = (meta.name || 'Geïmporteerd') + ' (import)';
    await store.saveRegion(meta, vox);
    refreshList();
  } catch (err) { notify('Importeren mislukt: ' + err.message); }
});

// ---------- spelen ----------
async function ensureGame() {
  if (!game) {
    const { Game } = await import('./game.js');
    game = new Game({
      root: $('#game'), canvas: $('#game-canvas'), coords: $('#hud-coords'), place: $('#hud-place'),
      hotbar: $('#hotbar'), blockName: $('#block-name'), loading: $('#loading'), invGrid: $('#inv-grid'),
      overlays: { start: $('#ov-start'), pause: $('#ov-pause'), inv: $('#ov-inv') },
      btnResume: $('#btn-resume'), btnInvClose: $('#btn-inv-close'),
      viewRange: $('#set-view'), viewLabel: $('#set-view-label'), sens: $('#set-sens'),
      touch: {
        move: $('#t-move'), look: $('#t-look'), stick: $('#t-stick'), knob: $('#t-knob'), jump: $('#t-jump'), down: $('#t-down'),
        brk: $('#t-break'), put: $('#t-place'), fly: $('#t-fly'), inv: $('#t-inv'), menu: $('#t-menu'),
      },
      onSave: (full) => saveGame(full),
    });
  }
  return game;
}

async function play(id) {
  const meta = await store.getRegionMeta(id);
  const vox = await store.loadRegionData(id);
  if (!meta || !vox) return notify('Dit stuk kon niet geladen worden.');
  await ensureGame();
  $('#menu').hidden = true;
  $('#tp-wrap').hidden = true;
  $('#game-title').textContent = meta.name;
  game.load(meta, vox);
  game.start();
}

// ---------- grote kaarten (kilometers, in tegels) ----------
function mapMeta(map) {
  return { id: map.id, kind: 'map', name: map.name, map, size: mapSize(map), ground: map.ground,
    real: { lat: map.lat, lon: map.lon, scale: 1 }, created: Date.now() };
}
async function playMap(id) {
  let meta = await store.getRegionMeta(id);
  if (!meta && id === CITY.id) { meta = mapMeta(CITY); await store.saveMeta(meta); }
  if (!meta) return notify('Deze kaart bestaat niet meer.');
  await ensureGame();
  const map = meta.map, T = map.tile;
  const provider = (tx, tz) => new Promise((resolve, reject) => {
    store.cacheGet(mapKeys.edit(map, tx, tz)).then((ed) => {
      if (ed && ed.rle) return resolve({ vox: store.rleDecode(ed.rle, T * T * ed.H), H: ed.H });
      ask({ type: 'cityTile', tx, tz, map }, (m) => {
        if (m.type === 'cityTile') resolve(m);
        else if (m.type === 'error') reject(new Error(m.message));
      });
    });
  });
  const saveTile = (tx, tz, vox, H) => store.cachePut(mapKeys.edit(map, tx, tz), { rle: store.rleEncode(vox), H });
  const isCity = map.id === CITY.id;
  $('#menu').hidden = true;
  $('#tp-wrap').hidden = !isCity;
  $('#game-title').textContent = meta.name;
  game.loadTiled(meta, { ...map, spawn: isCity ? SPAWN : spawnFor(map) }, provider, saveTile);
  game.start();
}
$('#btn-city').addEventListener('click', () => playMap(CITY.id));
for (const [name, lat, lon] of CITY_PLACES) {
  const b = document.createElement('button');
  b.className = 'chip'; b.textContent = name;
  b.onclick = () => {
    if (!game || !game.tiled) return;
    const [x, z] = toBlocks(lat, lon);
    const p = game.player;
    p.pos.set(x, CITY.ground + 40, z + 60); p.vel.set(0, 0, 0); p.fly = true; p.yaw = 0; p.pitch = 0.15;
    game.updateTiles(true);
    game.resume();
  };
  $('#tp-list').appendChild(b);
}

// Alles downloaden: elke tegel ophalen en omzetten, zodat de kaart volledig op dit toestel staat.
const prefetch = { job: null };
function stopPrefetch() { if (prefetch.job) prefetch.job.stop = true; }
async function startPrefetch(meta) {
  if (prefetch.job && prefetch.job.id === meta.id && !prefetch.job.stop) return;
  stopPrefetch();
  try { await navigator.storage?.persist?.(); } catch { /* niet ondersteund */ }
  const map = meta.map, n = map.tiles, sc = superCount(map);
  const job = { id: meta.id, stop: false, done: 0, total: n * n, failed: 0, bytes: 0 };
  prefetch.job = job;
  // superblokken van het midden naar buiten
  const supers = [];
  for (let sz = 0; sz < sc; sz++) for (let sx = 0; sx < sc; sx++) supers.push([sx, sz, (sx - sc / 2 + 0.5) ** 2 + (sz - sc / 2 + 0.5) ** 2]);
  supers.sort((a, b) => a[2] - b[2]);
  const one = (tx, tz) => new Promise((resolve) => {
    ask({ type: 'cityTile', tx, tz, map, prefetch: true }, (m) => {
      if (m.type === 'cityTile') { job.bytes += m.bytes || 0; resolve(true); }
      else if (m.type === 'error') { job.lastError = m.message; resolve(false); }
    });
  });
  showPrefetch(job);
  for (const [sx, sz] of supers) {
    if (job.stop) break;
    const tiles = [];
    for (let tz = sz * map.superTiles; tz < Math.min(n, (sz + 1) * map.superTiles); tz++)
      for (let tx = sx * map.superTiles; tx < Math.min(n, (sx + 1) * map.superTiles); tx++) tiles.push([tx, tz]);
    let ok = true;
    for (let i = 0; i < tiles.length && !job.stop; i += 2) {
      const res = await Promise.all(tiles.slice(i, i + 2).map(([tx, tz]) => one(tx, tz)));
      for (const r of res) { if (r) job.done++; else { job.failed++; ok = false; } }
      showPrefetch(job);
    }
    // ruwe kaartdata weggooien als alle tegels klaar zijn: spaart veel opslag
    if (ok && !job.stop) await new Promise(res => ask({ type: 'dropSuper', map, sx, sz }, res));
    if (!ok) await new Promise(r => setTimeout(r, 4000));
  }
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
    : `Downloaden… ${job.done} van ${job.total} stukken (${pct}%)${job.failed ? ` · ${job.failed} mislukt` : ''}`;
}
function mapCard(r) {
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
      <div class="ptext small muted">${r.complete ? 'Volledig gedownload ✓' : r.done ? `${pct}% gedownload` : 'Nog niet gedownload: laadt tijdens het spelen, of download alles vooraf.'}</div>
    </div>
    <div class="r-actions">
      <button class="btn primary" data-a="play">▶ Spelen</button>
      ${r.complete ? '' : `<button class="btn" data-a="dl">${running ? '⏸ Pauzeren' : '⬇ Alles downloaden'}</button>`}
      <button class="btn" data-a="show">Toon</button>
      <button class="btn danger" data-a="del">✕</button>
    </div>`;
  card.querySelector('.r-title').textContent = r.name;
  card.querySelector('[data-a=play]').onclick = () => playMap(r.id);
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
async function saveGame() {
  if (!game || !game.meta) return;
  if (saving) return saving;
  if (game.tiled) {
    game.saveDirtyTiles();
    game.dirty = false;
    const meta = { ...game.meta, player: game.playerState() };
    game.meta = meta;
    saving = store.saveMeta(meta)
      .then(() => flash('Opgeslagen ✓')).catch(err => flash('Opslaan mislukt: ' + err.message)).finally(() => { saving = null; });
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
  if (mode === 'fantasy') { setZoom(state.zoom); if (!state.sel) select(1050, 12500, true); }
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

// start
setZoom(1);
let startMode = 'real';
try { startMode = localStorage.getItem('blokstad-mode') || 'real'; } catch { /* geen opslag */ }
setPlace('Frankfurt – Skyline', 50.1113, 8.6718);
refreshList().then(() => setMode(startMode));
