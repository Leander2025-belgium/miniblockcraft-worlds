// TERRANOVA 16 fase 2 — Wildernis: een nieuwe, volledig zelfgegenereerde natuurwereld van 8 × 8 km met een zaadgetal
// (seed). Zelfde zaadgetal = exact dezelfde wereld; een ander zaadgetal = een andere wereld.
// - continenten en zee, heuvels, bergketens met besneeuwde toppen;
// - rivieren die van het binnenland naar zee slingeren en in de bergen smaller worden;
// - biomen volgens temperatuur en vochtigheid: woestijn, steppe, grasland, loofbos, naaldbos (taiga), moeras, toendra,
//   gebergte, strand en zee — elk met eigen bodem, planten en bomen;
// - ondergrond in lagen (aarde, steen, diepsteen, bodemrots) met kolen, ijzer, goud en diamant, en grotten.
// Alles is deterministisch per tegel van 128 m (zoals de andere werelden): elke tegel past op zijn buren.
// De bestaande werelden veranderen niet: dit is een aparte wereld met eigen ID.
import { B } from './blocks.js';
import { hash, noise, placeTreeVariety } from './city.js';

export const T = 128, TILES = 64, SIZE = T * TILES, G = 80; // G: zeeniveau (water tot en met G − 1)
export const DEFAULT_SEED = 1616;
export const META = {
  id: 'wildernis', name: 'Wildernis', kind: 'proc', tile: T,
  tilesX: TILES, tilesZ: TILES, tiles: TILES,
  ground: G, version: 1, superTiles: 4, miniStep: 2, groundColor: [0.36, 0.5, 0.28], maxH: 520, wildernis: true,
};
// ID met een eigen zaadgetal: 'wildernis' (standaard) of 'wildernis-<getal>'
export function seedFromId(id) { const m = /^wildernis-(\d{1,9})$/.exec(String(id || '')); return m ? +m[1] : DEFAULT_SEED; }
export function idForSeed(seed) { seed = Math.abs(Math.floor(+seed || 0)) % 1e9; return seed === DEFAULT_SEED ? 'wildernis' : 'wildernis-' + seed; }

// ---------- ruis ----------
const ROT = []; for (let i = 0; i < 8; i++) { const a = i * 0.91 + 0.3; ROT.push([Math.cos(a), Math.sin(a)]); }
function fbm(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1;
  for (let i = 0; i < oct; i++) { const [c, n] = ROT[i]; a += (noise((x * c - z * n) * f + 17.3 * i, (x * n + z * c) * f - 9.1 * i, s + i) * 2 - 1) * amp; sum += amp; amp *= 0.5; f *= 2.05; }
  return a / sum;
}
function ridged(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1, w = 1;
  for (let i = 0; i < oct; i++) { const [c, n] = ROT[i]; let v = 1 - Math.abs(noise((x * c - z * n) * f + 7.7 * i, (x * n + z * c) * f + 3.3 * i, s + i) * 2 - 1); v *= v; v *= w; w = Math.min(1, v * 1.8); a += v * amp; sum += amp; amp *= 0.5; f *= 2.1; }
  return a / sum;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// 3D-waardenruis voor grotten
function h3(x, y, z, s) { return hash(x * 7919 + y, z * 104729 - y * 31, s); }
function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const c = (dx, dy, dz) => h3(ix + dx, iy + dy, iz + dz, s);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), ux), x10 = lerp(c(0, 1, 0), c(1, 1, 0), ux), x01 = lerp(c(0, 0, 1), c(1, 0, 1), ux), x11 = lerp(c(0, 1, 1), c(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}

// ---------- landschap ----------
// hoogte t.o.v. zeeniveau (m) en of hier een rivier loopt
export function terrain(x, z, seed = DEFAULT_SEED) {
  const s = (seed * 131) % 100003;
  // rand van de wereld: zee
  const edge = Math.min(x, z, SIZE - x, SIZE - z), edgeK = sstep(0, 900, edge);
  const cont = fbm(x / 2600, z / 2600, 3, s + 1) * 0.9 + 0.25;
  let h = lerp(-30, cont * 60 + 10, edgeK);
  h += fbm(x / 520, z / 520, 4, s + 11) * 16 * edgeK;
  const mmask = sstep(0.1, 0.5, fbm(x / 2100, z / 2100, 2, s + 21)) * edgeK;
  if (mmask > 0) h += Math.pow(ridged(x / 820, z / 820, 5, s + 31), 1.5) * 260 * mmask;
  // rivieren: smalle dalen waar een trage ruis door nul gaat; in de bergen smaller, in zee verdwenen
  const rv = Math.abs(fbm(x / 1700, z / 1700, 3, s + 41) + fbm(x / 260, z / 260, 1, s + 43) * 0.04);
  let river = 0;
  if (h > -3) {
    const width = 0.012 + 0.018 * (1 - sstep(30, 160, h));
    river = 1 - sstep(width, width * 2.6, rv);
    if (river > 0) h = lerp(h, Math.min(h, -3.5 + rv * 40), river);
  }
  return { h, river };
}
// temperatuur en vochtigheid (0..1); hoogte maakt kouder
export function climate(x, z, h, seed = DEFAULT_SEED) {
  const s = (seed * 131) % 100003;
  const temp = 0.5 + fbm(x / 3400, z / 3400, 3, s + 51) * 0.75 - Math.max(0, h - 40) / 260;
  const moist = 0.5 + fbm(x / 2600, z / 2600, 3, s + 61) * 0.75;
  return { temp, moist };
}
export const BIOMES = {
  zee: 'Zee', strand: 'Strand', rivier: 'Rivier', woestijn: 'Woestijn', steppe: 'Steppe', grasland: 'Grasland', loofbos: 'Loofbos',
  taiga: 'Naaldbos (taiga)', moeras: 'Moeras', toendra: 'Toendra', gebergte: 'Gebergte', toppen: 'Besneeuwde toppen',
};
export function biomeAt(x, z, seed = DEFAULT_SEED) {
  const { h, river } = terrain(x, z, seed);
  return biomeOf(x, z, h, river, seed);
}
function biomeOf(x, z, h, river, seed) {
  if (h < -1.5) return river > 0.5 ? 'rivier' : 'zee';
  if (h < 2.5 && river < 0.3) return 'strand';
  if (h > 190) return 'toppen';
  if (h > 120) return 'gebergte';
  const { temp, moist } = climate(x, z, h, seed);
  if (temp < 0.22) return 'toendra';
  if (temp < 0.4) return 'taiga';
  if (moist > 0.7 && h < 25) return 'moeras';
  if (temp > 0.68 && moist < 0.32) return 'woestijn';
  if (temp > 0.6 && moist < 0.45) return 'steppe';
  if (moist > 0.52) return 'loofbos';
  return 'grasland';
}
export function groundAt(x, z, seed = DEFAULT_SEED) { return G + Math.max(-1, Math.round(terrain(x, z, seed).h)); }
export function zoneName(x, z, seed = DEFAULT_SEED) { return BIOMES[biomeAt(x, z, seed)]; }
// begin op droog grasland of bos zo dicht mogelijk bij het midden
export function spawnFor(seed = DEFAULT_SEED) {
  for (let r = 0; r < 3000; r += 40) for (let a = 0; a < 16; a++) {
    const x = SIZE / 2 + Math.cos(a / 16 * Math.PI * 2) * r, z = SIZE / 2 + Math.sin(a / 16 * Math.PI * 2) * r;
    const b = biomeAt(x, z, seed); if (['grasland', 'loofbos', 'steppe', 'taiga'].includes(b)) return { x: Math.floor(x) + 0.5, y: groundAt(x, z, seed) + 2, z: Math.floor(z) + 0.5, yaw: 0, pitch: 0.15 };
  }
  return { x: SIZE / 2, y: G + 60, z: SIZE / 2, yaw: 0, pitch: 0.2 };
}

// ---------- bomen en planten ----------
function spruce(x, z, gy, h, set, leaf = B.PINE_LEAVES) {
  for (let y = gy + 1; y <= gy + h; y++) set(x, y, z, B.SPRUCE, true);
  for (let y = gy + 3; y <= gy + h + 1; y++) {
    const r = Math.max(0, Math.round((gy + h + 1 - y) / 3.2)) + ((y - gy) % 2 ? 0 : -1);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r + 0.5 && (dx || dz || y > gy + h)) set(x + dx, y, z + dz, leaf);
  }
}
function cactus(x, z, gy, h, set) { for (let y = gy + 1; y <= gy + h; y++) set(x, y, z, B.HEDGE, true); }

// ---------- een tegel van 128 × 128 m ----------
const ORES = [[B.COAL_ORE, 0.014, 0, 999], [B.IRON_ORE, 0.009, 0, G - 10], [B.GOLD_ORE, 0.004, 0, G - 40], [B.DIAMOND_ORE, 0.0018, 0, G - 60]];
export function generateTile(tx, tz, seed = DEFAULT_SEED) {
  const X0 = tx * T, Z0 = tz * T, P = 3, N = T + 2 * P;
  const hs = new Float32Array(N * N), rv = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const t = terrain(X0 + x - P, Z0 + z - P, seed); hs[z * N + x] = t.h; rv[z * N + x] = t.river; }
  const H0 = (x, z) => hs[(z + P) * N + (x + P)];
  let lo = 1e9, hi = 0;
  const top = new Int16Array(T * T), bio = new Array(T * T);
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    const h = H0(x, z), surf = G + Math.max(-40, Math.round(h)), i = z * T + x;
    top[i] = surf; bio[i] = biomeOf(X0 + x, Z0 + z, h, rv[(z + P) * N + (x + P)], seed);
    if (surf < lo) lo = surf; if (Math.max(surf, G) > hi) hi = Math.max(surf, G);
  }
  const Y0 = Math.max(0, Math.min(lo, G) - 56);
  const H = Math.min(1024 - Y0, Math.ceil((hi + 28 - Y0) / 8) * 8);
  const vox = new Uint8Array(T * T * H);
  const set = (x, y, z, b, force) => { y -= Y0; if (x < 0 || z < 0 || x >= T || z >= T || y < 0 || y >= H) return; const k = (z * T + x) * H + y; if (!vox[k] || force) vox[k] = b; };
  const trees = [], stats = { grot: 0, erts: 0, bomen: 0 };
  const caveSeed = (seed * 7) % 9973;
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    const i = z * T + x, surf = top[i], b = bio[i], gx = X0 + x, gz = Z0 + z, base = i * H;
    const slope = Math.max(Math.abs(H0(x + 1, z) - H0(x, z)), Math.abs(H0(x, z + 1) - H0(x, z)), Math.abs(H0(x - 1, z) - H0(x, z)), Math.abs(H0(x, z - 1) - H0(x, z)));
    const r = hash(gx, gz, seed + 7);
    // bovenlaag per bioom
    let topB = B.GRASS, sub = B.DIRT, subN = 3;
    if (b === 'zee' || b === 'rivier') { topB = surf < G - 6 ? B.GRAVEL : B.SAND; sub = B.SAND; }
    else if (b === 'strand') { topB = B.SAND; sub = B.SAND; subN = 4; }
    else if (b === 'woestijn') { topB = B.SAND; sub = B.RED_SANDSTONE; subN = 6; }
    else if (b === 'steppe') { topB = r < 0.18 ? B.GRAVEL : B.GRASS; }
    else if (b === 'moeras') { topB = r < 0.25 ? B.CLAY : r < 0.32 ? B.MOSSY_STONE : B.GRASS; sub = B.CLAY; }
    else if (b === 'toendra') { topB = B.SNOW; }
    else if (b === 'toppen') { topB = slope > 3 ? B.STONE : B.SNOW; sub = B.STONE; }
    else if (b === 'gebergte') { topB = slope > 2.2 ? (r < 0.3 ? B.GRAVEL : B.STONE) : B.GRASS; sub = slope > 2.2 ? B.STONE : B.DIRT; }
    else if (b === 'grasland' && fbm(gx / 40, gz / 40, 1, seed + 71) > 0.35) topB = B.FLOWERS;
    // grotten alleen in streken waar een trage ruis het toelaat (± 40 % van de kolommen): sneller en afwisselender
    const caveCol = noise(gx / 90, gz / 90, caveSeed + 5) > 0.45;
    for (let y = Y0; y <= surf; y++) {
      let blk;
      if (y === 0) blk = B.BEDROCK;
      else if (y === surf) blk = topB;
      else if (y > surf - subN) blk = sub;
      else if (y < G - 40) blk = B.DEEPSLATE;
      else blk = B.STONE;
      // ertsen in steen en diepsteen
      if (blk === B.STONE || blk === B.DEEPSLATE) {
        // één trekking per blok, opeenvolgende kansvakken: kolen, ijzer, goud, diamant (dieper = zeldzamer erts mogelijk)
        const o = h3(gx, y, gz, seed + 91); let acc = 0;
        for (const [ore, p, , maxY] of ORES) { if (o < acc + p) { if (y <= maxY) blk = ore; break; } acc += p; }
        if (blk !== B.STONE && blk !== B.DEEPSLATE) stats.erts++;
        // grotten: twee ruisvelden die tegelijk dicht bij hun midden zijn = lange slingerende gangen
        if (y > Y0 + 2 && y < surf - 7) {
          // eerst een goedkope grove toets per kolom (caveCol), dan pas de dure 3D-ruis
          if (caveCol) {
            const a = noise3(gx / 26, y / 13, gz / 26, caveSeed);
            if (Math.abs(a - 0.5) < 0.045 && Math.abs(noise3(gx / 26 + 50, y / 13 + 20, gz / 26, caveSeed + 1) - 0.5) < 0.045) { blk = 0; stats.grot++; }
          }
        }
      }
      if (blk) vox[base + (y - Y0)] = blk;
    }
    // water tot zeeniveau; ijs in de toendra
    for (let y = surf + 1; y < G; y++) vox[base + (y - Y0)] = b === 'toendra' && y === G - 1 ? B.ICE : B.WATER;
    // moeraspoeltjes
    if (b === 'moeras' && surf >= G && fbm(gx / 18, gz / 18, 2, seed + 81) > 0.25) vox[base + (surf - Y0)] = B.WATER;
    // planten en bomen (niet op steile hellingen, niet in het water)
    if (surf < G || slope > 2.5 || x < 2 || z < 2 || x > T - 3 || z > T - 3) continue;
    const t = hash(gx, gz, seed + 13);
    if (b === 'loofbos' && t < 0.045) trees.push(x, z, surf, 1);
    else if (b === 'taiga' && t < 0.055) trees.push(x, z, surf, 2);
    else if (b === 'toendra' && t < 0.006) trees.push(x, z, surf, 2);
    else if (b === 'grasland' && t < 0.004) trees.push(x, z, surf, 1);
    else if (b === 'steppe' && t < 0.0025) trees.push(x, z, surf, 1);
    else if (b === 'moeras' && t < 0.02 && vox[base + (surf - Y0)] !== B.WATER) trees.push(x, z, surf, 3);
    else if (b === 'woestijn' && t < 0.004) trees.push(x, z, surf, 4);
    else if (b === 'gebergte' && t < 0.012 && surf < G + 160) trees.push(x, z, surf, 2);
  }
  for (let k = 0; k < trees.length; k += 4) {
    const x = trees[k], z = trees[k + 1], gy = trees[k + 2], kind = trees[k + 3], r = hash(x + X0, z + Z0, seed + 17);
    if (kind === 1) placeTreeVariety(x, z, gy, (x + X0) * 131 + (z + Z0), set, false);
    else if (kind === 2) spruce(x, z, gy, 7 + Math.floor(r * 8), set);
    else if (kind === 3) placeTreeVariety(x, z, gy, (x + X0) * 77 + (z + Z0) * 3 + 1, set, true);
    else if (kind === 4) cactus(x, z, gy, 2 + Math.floor(r * 3), set);
  }
  const edge = new Int16Array(4 * T);
  for (let i = 0; i < T; i++) {
    edge[i] = groundAt(X0 - 1, Z0 + i, seed); edge[T + i] = groundAt(X0 + T, Z0 + i, seed);
    edge[2 * T + i] = groundAt(X0 + i, Z0 - 1, seed); edge[3 * T + i] = groundAt(X0 + i, Z0 + T, seed);
  }
  stats.bomen = trees.length / 4;
  return { vox, H, y0: Y0, edge, ground: G, paths: [], stats };
}
// kleur voor de overzichtskaart
const MAPCOL = { zee: [40, 90, 160], rivier: [60, 120, 190], strand: [220, 205, 150], woestijn: [228, 200, 130], steppe: [170, 170, 90], grasland: [110, 170, 70], loofbos: [60, 130, 50], taiga: [50, 100, 70], moeras: [80, 110, 70], toendra: [225, 232, 240], gebergte: [130, 130, 125], toppen: [245, 248, 252] };
export function overviewColor(x, z, seed = DEFAULT_SEED) { return MAPCOL[biomeAt(x, z, seed)]; }
