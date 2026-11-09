// Nova Metropool: een zelfgegenereerde wereldstad van 25 × 30 km.
// Supermoderne wolkenkrabbers (tot ~800 m) in een groot centrum, een haven met cruiseschepen,
// twee luchthavens, een rivier, parken, stadswijken en voorsteden.
// Alles is deterministisch: elke tegel van 128 m kan los gemaakt worden en past op zijn buren.
import { B } from './blocks.js';
import { hash, noise, placeTree } from './city.js';

export const MW = 25000, ML = 30000, G = 12, T = 128;
export const META = {
  id: 'metropool', name: 'Nova Metropool', kind: 'proc', tile: T,
  tilesX: Math.ceil(MW / T), tilesZ: Math.ceil(ML / T), tiles: Math.ceil(ML / T),
  ground: G, version: 1, superTiles: 4, miniStep: 2, groundColor: [0.56, 0.57, 0.54],
};
const CBD = [12500, 13500];
export const PLACES = [
  ['Centrum', 12500, 13300], ['Zakendistrict', 14200, 12200], ['Centraal Park', 10700, 16800],
  ['Cruiseterminal', 11000, 26500], ['Containerhaven', 17000, 26300], ['Luchthaven West', 4000, 5600],
  ['Luchthaven Oost', 21200, 9100], ['Rivier', 8600, 12000], ['Strand', 6000, 27800],
];

// ---------- geografie ----------
export const coastZ = (x) => 27600 + 380 * Math.sin(x / 2100) + 180 * Math.sin(x / 690 + 1);
export const riverX = (z) => 8200 + 900 * Math.sin(z / 5200) + 300 * Math.sin(z / 1700 + 2);
const RIVER_HALF = 70;
const AIRPORTS = [
  { name: 'Luchthaven West', x0: 1500, x1: 6600, z0: 3000, z1: 7200 },
  { name: 'Luchthaven Oost', x0: 18400, x1: 24200, z0: 6600, z1: 10800 },
];
const PARK = { x0: 9800, x1: 11600, z0: 15200, z1: 18600 };
const HARBOR = { x0: 10400, x1: 21600, z0: 25400 };
const BASINS = [0, 1, 2, 3, 4].map(i => ({ x0: 11500 + i * 2000, x1: 12500 + i * 2000 })); // waterbekkens, open naar zee

const Z = { SEA: 1, BEACH: 2, RIVER: 3, AIRPORT: 4, HARBOR: 5, PARK: 6, CORE: 7, CBD: 8, URBAN: 9, SUBURB: 10, INDUSTRY: 11 };
const ZNAMES = { 1: 'Zee', 2: 'Strand', 3: 'Rivier', 4: 'Luchthaven', 5: 'Haven', 6: 'Centraal Park', 7: 'Centrum', 8: 'Zakendistrict', 9: 'Stadswijk', 10: 'Woonwijk', 11: 'Industrie' };

function cbdDist(x, z) { const dx = (x - CBD[0]) / 1.1, dz = z - CBD[1]; return Math.hypot(dx, dz); }
function zoneAt(x, z) {
  const cz = coastZ(x);
  if (z > cz) return Z.SEA;
  if (x >= HARBOR.x0 && x < HARBOR.x1 && z >= HARBOR.z0) return Z.HARBOR;
  if (z > cz - 60) return Z.BEACH;
  if (Math.abs(x - riverX(z)) < RIVER_HALF) return Z.RIVER;
  for (const a of AIRPORTS) if (x >= a.x0 && x < a.x1 && z >= a.z0 && z < a.z1) return Z.AIRPORT;
  if (x >= PARK.x0 && x < PARK.x1 && z >= PARK.z0 && z < PARK.z1) return Z.PARK;
  const d = cbdDist(x, z);
  if (d < 1300) return Z.CORE;
  if (d < 3800) return Z.CBD;
  if (z > 23500 && x > 9500 && x < 22500) return Z.INDUSTRY;
  if (d < 7200) return Z.URBAN;
  if (noise(x / 2600, z / 2600, 71) > 0.66) return Z.INDUSTRY;
  return Z.SUBURB;
}
export function zoneName(x, z) {
  const zn = zoneAt(x, z);
  if (zn === Z.AIRPORT) return AIRPORTS.find(a => x >= a.x0 && x < a.x1 && z >= a.z0 && z < a.z1).name;
  if (zn === Z.HARBOR) return x < BASINS[0].x0 ? 'Cruiseterminal' : 'Containerhaven';
  return ZNAMES[zn];
}

// ---------- wegen ----------
// lanen elke 400 m (40 m breed, middenberm), straten elke 100 m (16 m)
const roadHere = (zn) => zn !== Z.SEA && zn !== Z.BEACH && zn !== Z.AIRPORT && zn !== Z.HARBOR && zn !== Z.PARK && zn !== Z.RIVER;
function roadW(cellIdx, zn) { return cellIdx % 4 === 0 ? 40 : (roadHere(zn) ? 16 : 0); }

// ---------- torens ----------
const lotCache = new Map();
const TOWER_LOOKS = [
  [B.GLASS_BLUE, B.PANEL_WHITE], [B.MIRROR, B.METAL], [B.DARKGLASS, B.PANEL_DARK], [B.GLASS_GREEN, B.PANEL_WHITE],
  [B.GLASS, B.METAL], [B.MIRROR, B.PANEL_WHITE], [B.GLASS_BLUE, B.PANEL_DARK], [B.DARKGLASS, B.METAL],
];
const SHAPES = ['box', 'setback', 'taper', 'twist', 'cyl', 'box', 'setback', 'slab'];
function lotDesc(cx, cz) {
  const key = cx * 100000 + cz;
  if (lotCache.has(key)) return lotCache.get(key);
  const x0 = cx * 100, z0 = cz * 100;
  const zm = zoneAt(x0 + 50, z0 + 50);
  const wx = roadW(cx, zm), wz = roadW(cz, zm);
  // bebouwbaar deel van het perceel (na weg en 4 m stoep)
  const L = { zone: zm, ix0: x0 + wx + 4, iz0: z0 + wz + 4, ix1: x0 + 100 - 4, iz1: z0 + 100 - 4 };
  const r = hash(cx, cz, 501), r2 = hash(cx, cz, 502), r3 = hash(cx, cz, 503);
  const d = cbdDist(x0 + 50, z0 + 50);
  if (zm === Z.CORE || zm === Z.CBD || (zm === Z.URBAN && r < 0.12)) {
    if (zm !== Z.URBAN && r3 < 0.07) { L.type = 'plaza'; }
    else {
      const w = L.ix1 - L.ix0, dpt = L.iz1 - L.iz0;
      const core = zm === Z.CORE;
      let h;
      if (core && r < 0.22) h = 420 + r2 * 380;                                 // megatoren
      else if (core) h = 220 + r2 * 220;
      else if (zm === Z.CBD) h = 110 + 300 * Math.exp(-(((d - 1300) / 1600) ** 2)) * (0.4 + 0.6 * r2);
      else h = 90 + r2 * 90;
      h = Math.round(h / 4) * 4;
      const shape = SHAPES[Math.floor(hash(cx, cz, 504) * SHAPES.length)];
      const look = TOWER_LOOKS[Math.floor(hash(cx, cz, 505) * TOWER_LOOKS.length)];
      const half = Math.min(w, dpt) / 2;
      const slim = h > 400 ? 0.62 : 0.5 + r3 * 0.25;
      let a = Math.max(10, half * slim), b = a;
      if (shape === 'slab') { a = half * 0.75; b = Math.max(9, half * 0.3); }
      L.type = 'tower';
      L.t = { cxm: (L.ix0 + L.ix1) / 2, czm: (L.iz0 + L.iz1) / 2, a, b, h, shape, glass: look[0], frame: look[1],
        twist: (hash(cx, cz, 506) < 0.5 ? 1 : -1) * Math.PI / 2, spire: h > 300 || hash(cx, cz, 507) < 0.3 ? Math.round(h * 0.12) : 0,
        podA: (w / 2) - 2, podB: (dpt / 2) - 2, podH: zm === Z.URBAN ? 0 : 16 };
    }
  } else if (zm === Z.URBAN) {
    L.type = 'block';
    L.h = 24 + Math.floor(r2 * 6) * 6;
    L.wall = [B.PANEL_WHITE, B.CONCRETE, B.PLASTER_BEIGE, B.PLASTER_GREY, B.BRICK_DARK, B.LIMESTONE][Math.floor(r * 6)];
  } else if (zm === Z.SUBURB) {
    L.type = r < 0.08 ? 'green' : 'houses';
  } else if (zm === Z.INDUSTRY) {
    L.type = r < 0.15 ? 'tanks' : 'hall';
    L.h = 10 + Math.floor(r2 * 3) * 4;
  } else L.type = 'none';
  lotCache.set(key, L);
  if (lotCache.size > 6000) lotCache.delete(lotCache.keys().next().value);
  return L;
}

function towerInside(t, u, v, k) {
  if (k > t.h) return false;
  if (t.podH && k <= t.podH && Math.abs(u) < t.podA && Math.abs(v) < t.podB) return true;
  let a = t.a, b = t.b;
  const f = k / t.h;
  switch (t.shape) {
    case 'setback': { const s = f < 0.5 ? 1 : f < 0.78 ? 0.78 : 0.56; a *= s; b *= s; break; }
    case 'taper': { const s = 1 - 0.42 * f; a *= s; b *= s; break; }
    case 'twist': { const th = f * t.twist, c = Math.cos(th), s = Math.sin(th); const uu = u * c + v * s, vv = -u * s + v * c; return Math.abs(uu) < a && Math.abs(vv) < b; }
    case 'cyl': { const r = a * (1 - 0.22 * f); return u * u + v * v < r * r; }
  }
  return Math.abs(u) < a && Math.abs(v) < b;
}

// ---------- objecten: vliegtuigen, schepen, kranen ----------
const PLANE_COLORS = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN, B.PAINT_ORANGE, B.PAINT_BLACK];
// vliegtuig met de neus op (px, pz), romp langs +z
function planeAt(dx, dz, col, tail) {
  let top = 0;
  if (Math.abs(dx) <= 3 && dz >= 0 && dz < 60) {
    const nose = dz < 6 ? (6 - dz) * 0.5 : 0;
    for (let y = G + 2 + Math.floor(nose * 0.5); y <= G + 7 - Math.floor(nose * 0.5); y++) col[y] = B.PAINT_WHITE;
    if (Math.abs(dx) === 3 && dz % 2 === 0 && dz > 8 && dz < 50) col[G + 5] = B.GLASS_BLUE;
    if (dz < 3 && Math.abs(dx) <= 1) col[G + 6] = B.DARKGLASS;
    top = G + 7;
  }
  const wingHalf = 26 - (dz - 22) * 0.9;
  if (dz >= 22 && dz <= 34 && Math.abs(dx) <= wingHalf) { col[G + 4] = Math.abs(dx) > wingHalf - 2 ? tail : B.METAL; top = Math.max(top, G + 4); }
  if (dz >= 20 && dz <= 27 && Math.abs(dx) >= 9 && Math.abs(dx) <= 11) { col[G + 2] = B.PAINT_BLACK; col[G + 3] = B.METAL; top = Math.max(top, G + 3); }
  if (dz >= 51 && dz < 60 && dx === 0) { for (let y = G + 8; y <= G + 16 - Math.max(0, 54 - dz); y++) col[y] = tail; top = Math.max(top, G + 16); }
  if (dz >= 53 && dz < 59 && Math.abs(dx) <= 10 - (dz - 53)) { col[G + 8] = B.PAINT_WHITE; top = Math.max(top, G + 8); }
  return top;
}
// cruiseschip: achtersteven op u=0, boeg op u=310, breedte 40
function shipAt(u, v, col) {
  if (u < 0 || u >= 310) return 0;
  const halfW = u < 250 ? 20 : 20 * Math.sqrt(Math.max(0, 1 - (((u - 250) / 60) ** 2)));
  if (Math.abs(v) > halfW) return 0;
  let top = G + 12;
  for (let y = G - 6; y <= G + 12; y++) {
    if (y < G + 1) col[y] = B.PAINT_BLUE;
    else col[y] = (Math.abs(v) > halfW - 1.2 && (y === G + 5 || y === G + 9) && u % 3 !== 0) ? B.GLASS_BLUE : B.PAINT_WHITE;
  }
  // bovenbouw: 12 dekken in het midden, minder aan de uiteinden
  const decks = u > 60 && u < 230 ? 13 : u > 25 && u < 255 ? 8 : 0;
  if (decks && Math.abs(v) <= halfW - 2) {
    const edge = Math.abs(v) > halfW - 3.2;
    for (let k = 0; k < decks * 3; k++) {
      const y = G + 13 + k;
      col[y] = edge ? (k % 3 === 1 ? B.GLASS_BLUE : k % 3 === 2 ? B.GLASS : B.PAINT_WHITE) : (k % 3 === 0 ? B.PAINT_WHITE : 0);
    }
    top = G + 12 + decks * 3;
    col[top + 1] = (u > 120 && u < 150 && Math.abs(v) < 6) ? B.WATER : B.PAINT_WHITE; // zwembad op het bovendek
    top++;
  }
  // schoorstenen
  if (u >= 70 && u < 86 && Math.abs(v) < 5) { for (let y = top; y <= G + 70; y++) col[y] = y > G + 66 ? B.PAINT_BLACK : B.PAINT_RED; top = G + 70; }
  return top;
}
// portaalkraan aan de kade: poten op het land, giek over het water (richting -x)
function craneAt(dx, dz, col) {
  let top = 0;
  const leg = (dx === 0 || dx === 16) && (dz === 0 || dz === 14);
  if (leg) { for (let y = G + 1; y <= G + 42; y++) col[y] = B.PAINT_ORANGE; top = G + 42; }
  if (dz >= 6 && dz <= 8 && dx >= -48 && dx <= 26) { col[G + 42] = B.PAINT_ORANGE; col[G + 43] = B.METAL; top = Math.max(top, G + 43); }
  if ((dz === 0 || dz === 14) && dx >= 0 && dx <= 16) { col[G + 40] = B.PAINT_ORANGE; top = Math.max(top, G + 40); }
  if (dx >= -4 && dx <= 0 && dz >= 5 && dz <= 9) { col[G + 38] = B.GLASS; col[G + 39] = B.PAINT_WHITE; top = Math.max(top, G + 43); }
  return top;
}

// ---------- kolom ----------
let kind = 0; // 1 park, 2 tuin, 3 laanboom
const CONTAINER_COLORS = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN, B.PAINT_ORANGE, B.PAINT_WHITE, B.METAL];
function base(col, top) {
  col[0] = B.BEDROCK;
  for (let y = 1; y < top - 3; y++) col[y] = B.STONE;
  for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT;
}
function water(col, depth) { base(col, G - depth); col[G - depth] = B.SAND; for (let y = G - depth + 1; y <= G - 1; y++) col[y] = B.WATER; }

function fillColumn(x, z, col) {
  kind = 0;
  const zn = zoneAt(x, z);
  if (zn === Z.SEA) { water(col, Math.min(14, 4 + Math.floor((z - coastZ(x)) / 40))); return G - 1; }
  if (zn === Z.BEACH) { base(col, G); col[G] = B.SAND; if (hash(x, z, 9) < 0.004) { for (let y = G + 1; y <= G + 3; y++) col[y] = B.POST; col[G + 4] = hash(x, z, 10) < 0.5 ? B.PAINT_RED : B.PAINT_WHITE; return G + 4; } return G; }
  const cx = Math.floor(x / 100), cz = Math.floor(z / 100), sx = x - cx * 100, sz = z - cz * 100;

  if (zn === Z.RIVER) {
    water(col, 8);
    if (cz % 4 === 0 && sz < 40) { // brug van de lanen
      col[G] = sz === 0 || sz === 39 ? B.CONCRETE : roadSurf(sz, x, 40);
      col[G - 1] = B.CONCRETE;
      if (sz === 0 || sz === 39) { col[G + 1] = B.GLASS; return G + 1; }
      return G;
    }
    return G - 1;
  }
  base(col, G);
  if (zn === Z.HARBOR) return harborColumn(x, z, col);
  if (zn === Z.AIRPORT) return airportColumn(x, z, col);

  // wegen
  const wx = roadW(cx, zn), wz = roadW(cz, zn);
  const onX = sx < wx, onZ = sz < wz;
  if (onX || onZ) {
    if (onX && onZ) { col[G] = (sx < 4 || sz < 4 || sx >= wx - 4 || sz >= wz - 4) && Math.max(wx, wz) > 0 && ((sx + sz) % 2 === 0) ? B.LINE_WHITE : B.ASPHALT; return G; }
    const s = onX ? sx : sz, w = onX ? wx : wz, along = onX ? z : x;
    // middenberm met bomen op de lanen
    if (w === 40 && s >= 18 && s < 22) { col[G] = B.GRASS; col[G + 1] = 0; if ((along % 24) === 12 && s === 19) kind = 3; return G; }
    col[G] = roadSurf(s, along, w);
    return G;
  }
  // stoep
  const lx = sx - wx, lz = sz - wz, lw = 100 - wx, ld = 100 - wz;
  if ((wx && lx < 4) || (wz && lz < 4) || lx >= lw - 4 || lz >= ld - 4) {
    col[G] = B.TILE;
    if (((wx && lx === 0) && (z % 30 === 15)) || ((wz && lz === 0) && (x % 30 === 15) && !(wx && lx < 4))) {
      for (let y = G + 1; y <= G + 6; y++) col[y] = B.POST; col[G + 7] = B.LAMP; return G + 7;
    }
    if (zn !== Z.SUBURB && ((wx === 40 && lx === 2 && z % 15 === 7) || (wz === 40 && lz === 2 && x % 15 === 7))) kind = 3;
    return G;
  }
  if (zn === Z.PARK) return parkColumn(x, z, col);
  const L = lotDesc(cx, cz);
  switch (L.type) {
    case 'tower': return towerColumn(x, z, L.t, col);
    case 'plaza': return plazaColumn(x, z, L, col);
    case 'block': return blockColumn(x, z, L, col);
    case 'houses': return houseColumn(x, z, L, col);
    case 'green': col[G] = B.GRASS; kind = 1; return G;
    case 'hall': return hallColumn(x, z, L, col);
    case 'tanks': return tankColumn(x, z, L, col);
  }
  col[G] = B.GRASS;
  return G;
}

function roadSurf(s, along, w) {
  if (w === 40) {
    if ((s === 6 || s === 12 || s === 28 || s === 34) && along % 10 < 5) return B.LINE_WHITE;
    if (s === 17 || s === 22) return B.LINE_YELLOW;
    return B.ASPHALT;
  }
  if (s === 8 && along % 8 < 4) return B.LINE_WHITE;
  return B.ASPHALT;
}

function towerColumn(x, z, t, col) {
  const u = x + 0.5 - t.cxm, v = z + 0.5 - t.czm;
  const reach = Math.max(t.a, t.b, t.podA || 0, t.podB || 0) + 2;
  if (Math.abs(u) > reach || Math.abs(v) > reach) { col[G] = B.TILE; if (hash(x, z, 12) < 0.012) kind = 2; return G; }
  if (!towerInside(t, u, v, 1)) { col[G] = B.TILE; return G; }
  col[G] = B.TILE;
  let top = G;
  const tall = t.h;
  for (let k = 1; k <= tall + 1; k++) {
    const y = G + k;
    const inn = towerInside(t, u, v, k);
    if (!inn) { if (towerInside(t, u, v, k - 1)) { col[y] = k > t.podH + 1 ? t.frame : B.CONCRETE; top = y; } continue; }
    const ext = !towerInside(t, u - 1, v, k) || !towerInside(t, u + 1, v, k) || !towerInside(t, u, v - 1, k) || !towerInside(t, u, v + 1, k);
    if (ext) {
      if (k <= (t.podH || 0)) col[y] = k % 4 === 0 ? t.frame : ((x + z) % 6 === 0 ? t.frame : B.GLASS);           // winkels/lobby
      else if (k > t.h - 3 && (x + z) % 2 === 0) col[y] = B.LAMP;                                                  // verlichte kroon
      else col[y] = (k % 4 === 0 || (x + z) % 3 === 0) ? t.frame : t.glass;
    } else col[y] = k % 4 === 0 ? B.TILE : 0;
    top = y;
  }
  // spits/antenne in het midden
  if (t.spire && Math.abs(u) < 1 && Math.abs(v) < 1) {
    const h0 = G + t.h + 2;
    for (let y = h0; y < h0 + t.spire; y++) col[y] = B.METAL;
    col[h0 + t.spire] = B.LAMP;
    top = h0 + t.spire;
  }
  return top;
}

function plazaColumn(x, z, L, col) {
  col[G] = B.TILE;
  const cxm = (L.ix0 + L.ix1) / 2, czm = (L.iz0 + L.iz1) / 2, d = Math.hypot(x + 0.5 - cxm, z + 0.5 - czm);
  if (d < 9) { col[G] = B.WATER; col[G - 1] = B.WATER; if (d < 1.2) { for (let y = G + 1; y <= G + 5; y++) col[y] = B.WATER; return G + 5; } return G; }
  if (d < 10) { col[G + 1] = B.COBBLE; return G + 1; }
  if (d > 16 && hash(x, z, 13) < 0.02) kind = 2;
  return G;
}

function blockColumn(x, z, L, col) {
  const lx = x - L.ix0, lz = z - L.iz0, w = L.ix1 - L.ix0, d = L.iz1 - L.iz0;
  if (lx < 0 || lz < 0 || lx >= w || lz >= d) { col[G] = B.TILE; return G; }
  const inner = lx >= 14 && lz >= 14 && lx < w - 14 && lz < d - 14;
  if (inner) { col[G] = B.GRASS; kind = 2; return G; }
  const edge = lx === 0 || lz === 0 || lx === w - 1 || lz === d - 1 || (lx >= 13 && lx <= w - 14 && lz >= 13 && lz <= d - 14);
  const t = (lx === 0 || lx === w - 1) ? z : x;
  col[G] = B.TILE;
  for (let k = 1; k <= L.h; k++) {
    const y = G + k, lev = k % 3;
    if (edge) col[y] = k <= 4 ? (k === 4 ? L.wall : (t % 5 ? B.GLASS : L.wall)) : (lev !== 0 && t % 3 !== 0 ? B.GLASS : L.wall);
    else col[y] = lev === 0 ? B.TILE : 0;
  }
  col[G + L.h + 1] = edge ? L.wall : B.CONCRETE;
  if (!edge && hash(x, z, 14) < 0.01) { col[G + L.h + 2] = B.METAL; return G + L.h + 2; }
  return G + L.h + 1;
}

function houseColumn(x, z, L, col) {
  // percelen van 23 × 23 m met een huis, tuin en haag
  const lx = x - L.ix0, lz = z - L.iz0, w = L.ix1 - L.ix0, d = L.iz1 - L.iz0;
  if (lx < 0 || lz < 0 || lx >= w || lz >= d) { col[G] = B.GRASS; return G; }
  const px = Math.floor(lx / 23), pz = Math.floor(lz / 23), ux = lx - px * 23, uz = lz - pz * 23;
  const hp = hash(Math.floor(x / 23), Math.floor(z / 23), 520);
  if (ux === 0 || uz === 0) { col[G] = B.GRASS; col[G + 1] = B.HEDGE; return G + 1; }
  if (ux >= 5 && ux < 17 && uz >= 4 && uz < 14) {
    const wall = [B.PLASTER, B.PANEL_WHITE, B.PLASTER_BEIGE, B.PLASTER_GREY, B.BRICK][Math.floor(hp * 5)];
    const roof = hp < 0.5 ? B.PANEL_DARK : B.ROOF_DARK;
    const e = ux === 5 || ux === 16 || uz === 4 || uz === 13;
    col[G] = B.PLANKS;
    for (let k = 1; k <= 6; k++) col[G + k] = e ? ((k === 2 || k === 5) && (ux + uz) % 3 === 1 ? B.GLASS : wall) : (k === 3 ? B.PLANKS : 0);
    // modern plat dak met overstek, soms zonnepanelen
    col[G + 7] = roof;
    if (!e && hp > 0.7 && (ux + uz) % 2 === 0) { col[G + 8] = B.DARKGLASS; return G + 8; }
    return G + 7;
  }
  if (ux >= 18 && ux < 21 && uz >= 4 && uz < 9) { col[G] = B.CONCRETE; if (hp < 0.4) { col[G + 1] = CONTAINER_COLORS[Math.floor(hp * 15) % 6]; col[G + 2] = B.GLASS; return G + 2; } return G; }
  col[G] = (uz >= 15 && hp > 0.75 && ux >= 7 && ux < 14 && uz < 20) ? B.WATER : B.GRASS; // zwembad in de tuin
  if (col[G] === B.GRASS) kind = 2;
  return G;
}

function hallColumn(x, z, L, col) {
  const lx = x - L.ix0, lz = z - L.iz0, w = L.ix1 - L.ix0, d = L.iz1 - L.iz0;
  col[G] = B.ASPHALT;
  if (lx < 4 || lz < 4 || lx >= w - 4 || lz >= d - 4) return G;
  const e = lx === 4 || lz === 4 || lx === w - 5 || lz === d - 5;
  col[G] = B.CONCRETE;
  for (let k = 1; k <= L.h; k++) col[G + k] = e ? (k >= L.h - 2 && (x + z) % 3 ? B.GLASS : B.METAL) : 0;
  col[G + L.h + 1] = B.METAL;
  return G + L.h + 1;
}

function tankColumn(x, z, L, col) {
  col[G] = B.CONCRETE;
  const lx = x - L.ix0, lz = z - L.iz0;
  const cx = Math.floor(lx / 30), cz = Math.floor(lz / 30);
  const d = Math.hypot(lx - cx * 30 - 15, lz - cz * 30 - 15);
  if (d < 11) { for (let k = 1; k <= 18; k++) col[G + k] = d > 9.5 ? B.PAINT_WHITE : 0; col[G + 19] = B.METAL; return G + 19; }
  return G;
}

function parkColumn(x, z, col) {
  const n = noise(x / 160, z / 160, 31);
  const lake = Math.hypot((x - 10700) / 500, (z - 17200) / 330) < 1;
  if (lake || n > 0.8) { col[G] = B.WATER; col[G - 1] = B.WATER; col[G - 2] = B.SAND; return G; }
  if (Math.abs(noise(x / 300, z / 300, 32) - 0.5) < 0.02 || x % 300 < 4 || z % 300 < 4) { col[G] = B.GRAVEL; return G; }
  col[G] = hash(x, z, 33) < 0.05 ? B.FLOWERS : B.GRASS;
  kind = 1;
  return G;
}

function harborColumn(x, z, col) {
  const cz0 = coastZ(x);
  const basin = BASINS.find(b => x >= b.x0 && x < b.x1);
  if (basin && z > HARBOR.z0 + 500) {
    water(col, 12);
    // cruiseschepen in het eerste bekken, vrachtschepen in de andere
    if (basin === BASINS[0]) {
      for (const sx0 of [basin.x0 + 30, basin.x1 - 30]) {
        const top = shipAt(z - (HARBOR.z0 + 700), x + 0.5 - sx0, col);
        if (top) return top;
      }
    } else if (hash(Math.floor(z / 400), BASINS.indexOf(basin), 600) < 0.6) {
      const sx0 = basin.x0 + 26, u = z - (HARBOR.z0 + 620 + Math.floor(hash(BASINS.indexOf(basin), 1, 601) * 300)), v = x + 0.5 - sx0;
      if (u >= 0 && u < 240 && Math.abs(v) < 16 - Math.max(0, u - 210) / 2) {
        for (let y = G - 6; y <= G + 8; y++) col[y] = y < G + 1 ? B.PAINT_BLACK : B.PAINT_RED;
        if (u > 10 && u < 30) { for (let y = G + 9; y <= G + 26; y++) col[y] = B.PAINT_WHITE; col[G + 20] = B.GLASS; return G + 26; }
        const st = Math.floor(hash(Math.floor(u / 13), Math.floor((v + 16) / 3), 602) * 4);
        for (let s = 0; s < st; s++) for (let k = 1; k <= 3; k++) col[G + 8 + s * 3 + k] = CONTAINER_COLORS[(Math.floor(u / 13) + s) % 6];
        return G + 8 + st * 3;
      }
    }
    return G - 1;
  }
  if (z > cz0 - 6) { water(col, 10); return G - 1; }
  col[G] = B.CONCRETE;
  // kraanrails en kranen langs de kade
  const nearBasin = BASINS.find(b => x >= b.x1 && x < b.x1 + 60);
  if (nearBasin && nearBasin !== BASINS[0] && z > HARBOR.z0 + 520) {
    const cz = Math.floor((z - HARBOR.z0) / 130) * 130 + HARBOR.z0;
    const top = craneAt(x - (nearBasin.x1 + 30), z - cz - 40, col);
    if (top) return top;
  }
  // cruiseterminal op de westpier
  if (x < BASINS[0].x0 && x >= HARBOR.x0 + 200 && z > HARBOR.z0 + 700 && z < HARBOR.z0 + 1100) {
    const lx = x - (HARBOR.x0 + 200), lz = z - (HARBOR.z0 + 700);
    const e = lx === 0 || lz === 0 || x === BASINS[0].x0 - 40 || lz === 399;
    if (x < BASINS[0].x0 - 40) {
      const roofY = G + 20 + Math.round(8 * Math.sin(Math.PI * lx / (BASINS[0].x0 - 40 - HARBOR.x0 - 200)));
      for (let y = G + 1; y < roofY; y++) col[y] = e ? (y % 4 === 0 ? B.PANEL_WHITE : B.GLASS_BLUE) : ((y - G) % 6 === 0 ? B.TILE : 0);
      col[roofY] = B.PANEL_WHITE;
      return roofY;
    }
  }
  // containers op de pieren
  if (z > HARBOR.z0 + 200 && x >= BASINS[0].x1 + 70) {
    const qx = x % 16, qz = z % 4;
    if (qx < 13 && qz < 3) {
      const st = Math.floor(hash(Math.floor(x / 16), Math.floor(z / 4), 610) * 5);
      for (let s = 0; s < st; s++) for (let k = 1; k <= 3; k++) col[G + s * 3 + k] = CONTAINER_COLORS[Math.floor(hash(Math.floor(x / 16), Math.floor(z / 4), 611 + s) * 6)];
      return G + st * 3;
    }
  }
  return G;
}

function airportColumn(x, z, col) {
  const a = AIRPORTS.find(p => x >= p.x0 && x < p.x1 && z >= p.z0 && z < p.z1);
  const lx = x - a.x0, lz = z - a.z0, W = a.x1 - a.x0, D = a.z1 - a.z0;
  col[G] = B.GRASS;
  // twee parallelle start- en landingsbanen (oost-west), taxibanen ernaast
  const rwys = [Math.round(D * 0.25), Math.round(D * 0.75)];
  for (const rz of rwys) {
    const dz = lz - rz;
    if (Math.abs(dz) < 30 && lx >= 300 && lx < W - 300) {
      const rl = lx - 300, len = W - 600;
      let b = B.ASPHALT;
      if (Math.abs(dz) >= 28) b = B.LINE_WHITE;                                              // randlijn
      else if (Math.abs(dz) < 1 && rl % 60 < 30 && rl > 80 && rl < len - 80) b = B.LINE_WHITE; // middenlijn
      else if ((rl < 50 || rl > len - 50) && (dz + 30) % 4 < 2 && Math.abs(dz) < 25) b = B.LINE_WHITE; // drempels
      col[G] = b; return G;
    }
    if (Math.abs(dz - 200) < 13 && lx >= 250 && lx < W - 250) { col[G] = Math.abs(dz - 200) < 1 ? B.LINE_YELLOW : B.ASPHALT; return G; }
    if (Math.abs(dz - 200) < 140 && Math.abs(dz - 200) >= 13 && (lx % 400 < 22) && lx >= 250 && lx < W - 250 && dz > 0) { col[G] = B.ASPHALT; return G; }
  }
  // platform + terminal tussen de banen
  const mid = Math.round(D * 0.5);
  const tz = lz - mid;
  if (Math.abs(tz) < 160 && lx >= 600 && lx < W - 600) {
    col[G] = B.CONCRETE;
    // terminal: lang glazen gebouw met gebogen dak
    if (Math.abs(tz) < 45) {
      const e = Math.abs(tz) === 44 || lx === 600 || lx === W - 601;
      const roofY = G + 20 + Math.round(9 * Math.cos((tz / 45) * Math.PI / 2));
      for (let y = G + 1; y < roofY; y++) col[y] = e ? ((y - G) % 5 === 0 || lx % 8 === 0 ? B.METAL : B.GLASS_BLUE) : ((y - G) % 7 === 0 ? B.TILE : 0);
      col[roofY] = B.METAL;
      // verkeerstoren in het midden
      const tcx = a.x0 + Math.round(W / 2), d = Math.hypot(x + 0.5 - tcx, tz + 0.5);
      if (d < 9) {
        let top = roofY;
        for (let y = roofY + 1; y <= G + 95; y++) {
          if (y < G + 84) col[y] = d < 5 ? (d > 4 ? B.CONCRETE : 0) : 0;
          else if (y < G + 92) col[y] = d > 7.5 ? B.DARKGLASS : (y === G + 84 ? B.TILE : 0);
          else col[y] = B.METAL;
          if (col[y]) top = y;
        }
        if (d < 1) { for (let y = G + 96; y < G + 106; y++) col[y] = B.POST; col[G + 106] = B.LAMP; top = G + 106; }
        return top;
      }
      return roofY;
    }
    // vliegtuigen aan de gates (beide kanten van de terminal)
    const gate = Math.floor((lx - 620) / 90), gx = 620 + gate * 90 + 45;
    if (gate >= 0 && lx - 620 < (W - 1240)) {
      const side = tz > 0 ? 1 : -1, nz = side * 52;
      const dz = side > 0 ? tz - nz : nz - tz, dx = lx - gx;
      const tail = PLANE_COLORS[Math.floor(hash(a.x0 + gate, side, 620) * PLANE_COLORS.length)];
      if (hash(a.x0 + gate, side, 621) < 0.75) { const top = planeAt(dx, dz, col, tail); if (top) return top; }
      // loopbrug van terminal naar vliegtuig
      if (Math.abs(dx - 8) < 2 && Math.abs(tz) >= 45 && Math.abs(tz) < 52) { col[G + 5] = B.METAL; col[G + 6] = B.GLASS; col[G + 7] = B.METAL; return G + 7; }
    }
    return G;
  }
  if (lx % 200 === 0 && lz % 200 === 100) { for (let y = G + 1; y <= G + 2; y++) col[y] = B.PAINT_ORANGE; return G + 2; } // baanlichten
  return G;
}

// ---------- tegel maken ----------
export function generateTile(tx, tz) {
  const X0 = tx * T, Z0 = tz * T;
  let H = 64;
  const cols = new Array(T * T);
  const col = new Uint8Array(1100);
  const trees = [];
  const tops = new Int16Array(T * T);
  for (let z = -4; z < T + 4; z++) for (let x = -4; x < T + 4; x++) {
    const gx = X0 + x, gz = Z0 + z;
    if (gx < 0 || gz < 0 || gx >= MW || gz >= ML) continue;
    const inside = x >= 0 && z >= 0 && x < T && z < T;
    // buiten de tegel enkel bomen nodig (kruinen die over de rand hangen)
    if (!inside) {
      const zn = zoneAt(gx, gz);
      if (zn !== Z.PARK && zn !== Z.SUBURB && zn !== Z.URBAN && zn !== Z.CBD && zn !== Z.CORE) continue;
    }
    col.fill(0);
    const top = fillColumn(gx, gz, col);
    if (inside) {
      const i = z * T + x;
      cols[i] = col.slice(0, top + 1);
      tops[i] = top;
      if (top + 12 > H) H = top + 12;
    }
    const p = kind === 1 ? 0.5 : kind === 2 ? 0.35 : kind === 3 ? 1 : 0;
    if (p) {
      const ok = kind === 3 || (((gx % 9) === Math.floor(hash(Math.floor(gx / 9), Math.floor(gz / 9), 41) * 9)) && ((gz % 9) === Math.floor(hash(Math.floor(gx / 9), Math.floor(gz / 9), 42) * 9)) && hash(gx, gz, 43) < p);
      if (ok) trees.push(x, z, top);
    }
  }
  H = Math.min(1000, Math.ceil(H / 8) * 8);
  const vox = new Uint8Array(T * T * H);
  for (let i = 0; i < T * T; i++) if (cols[i]) vox.set(cols[i].subarray(0, Math.min(H, cols[i].length)), i * H);
  const set = (x, y, z, b, force) => {
    if (x < 0 || z < 0 || x >= T || z >= T || y < 0 || y >= H) return;
    const i = (z * T + x) * H + y;
    if (!vox[i] || force) vox[i] = b;
  };
  for (let i = 0; i < trees.length; i += 3) placeTree(trees[i], trees[i + 1], trees[i + 2], 5 + Math.floor(hash(trees[i] + X0, trees[i + 1] + Z0, 44) * 4), null, set);
  return { vox, H, ground: G, paths: makePaths(X0, Z0) };
}

// verkeer: rijstroken en stoepen van de wegen in deze tegel
function makePaths(X0, Z0) {
  const paths = [];
  const add = (type, pts) => paths.push({ type, pts: new Float32Array(pts) });
  for (let cx = Math.floor(X0 / 100); cx <= Math.floor((X0 + T) / 100); cx++) {
    const zn = zoneAt(cx * 100 + 50, Z0 + 64);
    const w = roadW(cx, zn);
    if (!w || !roadHere(zoneAt(cx * 100 + 2, Z0 + 64))) continue;
    const lanes = w === 40 ? [[9, 1], [14, 1], [26, -1], [31, -1]] : [[4, 1], [12, -1]];
    for (const [off, dir] of lanes) {
      const x = cx * 100 + off - X0;
      if (x < -4 || x > T + 4) continue;
      add('car', dir > 0 ? [x, 0, G, x, T, G] : [x, T, G, x, 0, G]);
    }
    for (const off of [-2, w + 2]) { const x = cx * 100 + off - X0; if (x > -4 && x < T + 4) add('walk', [x, 0, G, x, T, G]); }
  }
  for (let cz = Math.floor(Z0 / 100); cz <= Math.floor((Z0 + T) / 100); cz++) {
    const zn = zoneAt(X0 + 64, cz * 100 + 50);
    const w = roadW(cz, zn);
    if (!w || !roadHere(zoneAt(X0 + 64, cz * 100 + 2))) continue;
    const lanes = w === 40 ? [[9, -1], [14, -1], [26, 1], [31, 1]] : [[4, -1], [12, 1]];
    for (const [off, dir] of lanes) {
      const z = cz * 100 + off - Z0;
      if (z < -4 || z > T + 4) continue;
      add('car', dir > 0 ? [0, z, G, T, z, G] : [T, z, G, 0, z, G]);
    }
    for (const off of [-2, w + 2]) { const z = cz * 100 + off - Z0; if (z > -4 && z < T + 4) add('walk', [0, z, G, T, z, G]); }
  }
  return paths;
}
