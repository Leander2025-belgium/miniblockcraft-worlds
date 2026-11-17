// Megatower City: een zelfgegenereerde stad van 10 × 10 km rond The Megatower (1.000 m, js/megatower.js).
// Een logisch stratenplan: lanen op elke tegelgrens (elke 128 m) en straten door het midden van de tegels,
// zodat geen enkele weg doodloopt. Een rivier met kades en bruggen, een metrolijn onder de laan langs de toren,
// een spoorviaduct met station Megatower Centraal, trams, bussen, een luchthaven aan de stadsrand,
// een stadion, parken, een ziekenhuis, een universiteit, winkelcentra en wijken van hoog naar laag.
// Alles is deterministisch: elke tegel kan apart gemaakt worden en sluit aan op zijn buren.
import { B } from './blocks.js';
import { hash, placeTree, placeTreeVariety } from './city.js';
import { G, T, TOWER_TX, TOWER_TZ, Y0 as TOWER_Y0, TILE_H as TOWER_H, CX, CZ, writeTower, floorY } from './megatower.js';

export const TILES = 80, MW = TILES * T, ML = TILES * T;
export const META = {
  id: 'megatower', name: 'Megatower City', kind: 'proc', tile: T,
  tilesX: TILES, tilesZ: TILES, tiles: TILES,
  ground: G, version: 4, superTiles: 4, miniStep: 2, groundColor: [0.5, 0.52, 0.5], maxH: 1200, megatower: true,
};
const Y0 = G - 32;          // gewone tegels beginnen 32 m onder de straat (metro op -18 m)
export const SPAWN = { x: CX + 0.5, y: G + 1, z: CZ - 58, yaw: 0, pitch: 0.25 };

// ---------- bijzondere gebieden (in tegels) ----------
const LM = [
  { id: 'towerplaza', name: 'Megatower Plaza', x0: 39, x1: 41, z0: 39, z1: 41 },
  { id: 'park', name: 'Centraal Park', x0: 44, x1: 46, z0: 33, z1: 36 },
  { id: 'stadium', name: 'Megatower Stadion', x0: 30, x1: 31, z0: 50, z1: 51 },
  { id: 'airport', name: 'Luchthaven Megatower International', x0: 68, x1: 79, z0: 30, z1: 50 },
  { id: 'uni', name: 'Universiteit', x0: 22, x1: 24, z0: 30, z1: 31 },
  { id: 'industry', name: 'Industriegebied', x0: 56, x1: 67, z0: 2, z1: 12 },
];
const SINGLE = { '40,40': 'tower', '50,46': 'hospital', '38,47': 'busstation', '36,42': 'mall', '47,44': 'mall', '28,38': 'mall', '52,30': 'mall', '34,36': 'park2', '58,56': 'park2', '12,20': 'park2', '20,62': 'park2', '62,22': 'park2' };
const RIVER_TX = 17;
export const RAIL_Z = 47 * T, METRO_Z = 40 * T;
const STATION_X0 = 37 * T, STATION_X1 = 40 * T;      // Megatower Centraal (op het viaduct)
const RAIL_END = 70 * T + 120;                        // eindpunt aan de luchthaven
const METRO_END = 70 * T + 112;
const METRO_ST = [5, 12, 24, 32, 40, 48, 56, 64, 70]; // stations (tegelkolom)
const METRO_NAMES = { 5: 'Westpoort', 12: 'Parkzicht', 24: 'Universiteit', 32: 'Oude Markt', 40: 'Megatower', 48: 'Oostkade', 56: 'Ziekenhuis', 64: 'Fabriekshallen', 70: 'Luchthaven' };
const TRAM_X = [30, 52], TRAM_Z = [26, 56];          // laantegelgrenzen met een tram in de middenberm
const AIRPORT = LM[2], RUNWAY_X = 76 * T + 64, RUNWAY_Z0 = 31 * T, RUNWAY_Z1 = 50 * T + 100;

const TOWER_LM = { id: 'tower', group: 'towerplaza', single: false };
// metrostation op deze plek (voor het vertrekbord)
export function metroStationAt(x, z) {
  const tx = Math.floor(x / T);
  if (!METRO_ST.includes(tx) || Math.abs(z - METRO_Z) > 10) return null;
  return { name: METRO_NAMES[tx], first: METRO_NAMES[METRO_ST[0]], last: METRO_NAMES[METRO_ST[METRO_ST.length - 1]] };
}
export function landmark(tx, tz) {
  if (tx === RIVER_TX) return { id: 'river' };
  if (tx === TOWER_TX && tz === TOWER_TZ) return TOWER_LM;
  for (const L of LM) if (tx >= L.x0 && tx <= L.x1 && tz >= L.z0 && tz <= L.z1) return L;
  const s = SINGLE[tx + ',' + tz];
  return s ? { id: s, single: true } : null;
}
const lmId = (tx, tz) => { const l = landmark(tx, tz); return l && !l.single && l.id !== 'river' && l.id !== 'industry' ? (l.group || l.id) : null; };
// laan tussen twee tegels: weg als beide tegels bij hetzelfde grote gebied horen
export function avenueNS(i, tz) { if (tz < 0 || tz >= TILES) return false; const a = lmId(i - 1, tz); return !(a && a === lmId(i, tz)); }
export function avenueEW(j, tx) { if (tx < 0 || tx >= TILES) return false; const a = lmId(tx, j - 1); return !(a && a === lmId(tx, j)); }
const off = (v) => { const r = ((v % T) + T) % T; return r < 14 ? r : r >= T - 14 ? r - T : null; };
function district(x, z) {
  const d = Math.hypot(x - CX, z - CZ);
  if (d < 1100) return 'core'; if (d < 2300) return 'cbd'; if (d < 3700) return 'urban'; if (d < 5200) return 'resid'; return 'suburb';
}
export function zoneName(x, z) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T), l = landmark(tx, tz);
  if (l) return { tower: 'The Megatower', river: 'Rivier en kades', park: 'Centraal Park', park2: 'Stadspark', stadium: 'Megatower Stadion', airport: 'Luchthaven', uni: 'Universiteitscampus', industry: 'Industriegebied', hospital: 'Ziekenhuis Sint-Elisabeth', busstation: 'Busstation Centraal', mall: 'Winkelcentrum' }[l.id];
  if (Math.abs(z - RAIL_Z) < 16 && x >= STATION_X0 && x < STATION_X1) return 'Station Megatower Centraal';
  return { core: 'Centrum', cbd: 'Zakendistrict', urban: 'Stadswijk', resid: 'Woonwijk', suburb: 'Buitenwijk' }[district(x, z)];
}
export function groundAt() { return G; }

// ---------- kolommen ----------
// col is geïndexeerd met de echte hoogte (y); kind: 1 park, 2 tuin, 3 laanboom
let kind = 0;
function soil(col, top = G - 1) { for (let y = Y0; y < top - 3; y++) col[y] = B.STONE; for (let y = Math.max(Y0, top - 3); y < top; y++) col[y] = B.DIRT; }

function fillColumn(x, z, col) {
  kind = 0;
  const tx = Math.floor(x / T), tz = Math.floor(z / T), lx = x - tx * T, lz = z - tz * T;
  const L = landmark(tx, tz);
  const ox = off(x), oz = off(z);
  let top;
  if (L && L.id === 'river') top = riverColumn(x, z, lx, lz, ox, oz, col);
  else {
    soil(col);
    const onNS = ox !== null && avenueNS(Math.round(x / T), tz), onEW = oz !== null && avenueEW(Math.round(z / T), tx);
    if (onNS || onEW) top = avenueColumn(x, z, onNS ? ox : null, onEW ? oz : null, col);
    else top = blockColumn(x, z, tx, tz, lx, lz, L, col);
  }
  metroColumn(x, z, col);
  const r = railColumn(x, z, col);
  return Math.max(top, r);
}

// ---------- lanen: stoep 3, rijbaan 7, middenberm 8, rijbaan 7, stoep 3 ----------
function avenueSurface(o, along, tram) {
  if (o <= -12 || o >= 11) return B.SIDEWALK;
  if (o >= -4 && o <= 3) {
    if (tram) return (o === -4 || o === -2 || o === 1 || o === 3) ? B.METAL : o === -3 || o === 2 ? B.BALLAST : B.TILE;
    return B.GRASS;
  }
  if (o === -8 || o === 7) return along % 10 < 5 ? B.LINE_WHITE : B.ASPHALT;
  if (o === -5 || o === 4) return B.LINE_WHITE;
  return B.ASPHALT;
}
function avenueColumn(x, z, ox, oz, col) {
  // kruispunt: zebrapaden op de rand van het kruispunt
  if (ox !== null && oz !== null) {
    const zebraX = (Math.abs(oz) >= 9 && Math.abs(oz) <= 11) && ox > -12 && ox < 11 && (x & 1);
    const zebraZ = (Math.abs(ox) >= 9 && Math.abs(ox) <= 11) && oz > -12 && oz < 11 && (z & 1);
    const corner = (ox <= -12 || ox >= 11) && (oz <= -12 || oz >= 11);
    col[G - 1] = corner ? B.SIDEWALK : (zebraX || zebraZ) ? B.LINE_WHITE : B.ASPHALT;
    // verkeerslichten op de hoeken
    if (ox === -12 && oz === -12 || ox === 11 && oz === 11 || ox === -12 && oz === 11 || ox === 11 && oz === -12) { for (let y = G; y < G + 4; y++) col[y] = B.POST; col[G + 4] = B.PAINT_BLACK; col[G + 5] = B.LAMP; return G + 5; }
    return G - 1;
  }
  const o = ox !== null ? ox : oz, along = ox !== null ? z : x;
  const bnd = ox !== null ? Math.round(x / T) : Math.round(z / T);
  const tram = ox !== null ? TRAM_X.includes(bnd) : TRAM_Z.includes(bnd);
  col[G - 1] = avenueSurface(o, along, tram);
  // straatlantaarns, bomen in de berm, bushokjes, tramhaltes
  if ((o === -13 || o === 12) && (along % 32) === 16) { for (let y = G; y < G + 6; y++) col[y] = B.POST; col[G + 6] = B.LAMP; return G + 6; }
  if (!tram && (o === -1 || o === 0) && (along % 16) === 8 && o === -1) kind = 3;
  if (!tram && o >= -3 && o <= 2 && (along % 16) === 0 && o === 0) { col[G] = B.HEDGE; return G; }
  const stopAt = ((along % (3 * T)) + 3 * T) % (3 * T);
  if ((o === -13 || o === 12) && stopAt >= 40 && stopAt < 46) { // bushokje
    const edge = stopAt === 40 || stopAt === 45;
    for (let y = G; y < G + 3; y++) col[y] = edge ? B.METAL : (o === -13 ? (y === G ? B.PLANKS : 0) : 0);
    if (o === (o < 0 ? -13 : 12) && !edge) col[G + 1] = B.GLASS;
    col[G + 3] = B.GLASS; return G + 3;
  }
  if (tram && (o === -1 || o === 0) && stopAt >= 70 && stopAt < 90) { // tramhalte: verhoogd perron met schuilhokje
    col[G] = B.TILE;
    if (stopAt === 78 || stopAt === 82) { for (let y = G + 1; y < G + 4; y++) col[y] = B.METAL; col[G + 4] = B.GLASS; return G + 4; }
    if (stopAt > 78 && stopAt < 82) { col[G + 4] = B.GLASS; if (o === -1 && stopAt === 80) col[G + 1] = B.SIGN; return G + 4; }
    return G;
  }
  return G - 1;
}

// ---------- rivier (tegelkolom 17): kades, water, bruggen voor de lanen, aanlegsteigers ----------
function riverColumn(x, z, lx, lz, ox, oz, col) {
  const tz = Math.floor(z / T);
  const onEW = oz !== null;
  // kadewegen: de lanen aan beide kanten bestaan gewoon
  if (lx < 14 || lx >= 114) { soil(col); return avenueColumn(x, z, ox, onEW ? oz : null, col); }
  if (lx < 20 || lx >= 108) { // kade
    soil(col); col[G - 1] = B.COBBLE;
    if (onEW) return avenueColumn(x, z, null, oz, col);
    if ((lx === 19 || lx === 108)) { col[G] = B.METAL; return G; }
    if ((lx === 16 || lx === 111) && (z % 12) === 6) kind = 3;
    return G - 1;
  }
  // water: kademuur, bodem op G-8, water tot G-5 (oppervlak 4 m onder de straat)
  for (let y = Y0; y < G - 8; y++) col[y] = B.STONE;
  col[G - 8] = B.SAND;
  const wall = lx === 20 || lx === 107;
  for (let y = G - 7; y <= G - 1; y++) col[y] = wall ? B.ASHLAR : (y <= G - 5 ? B.WATER : 0);
  if (wall) col[G - 1] = B.ASHLAR;
  // brug: de laan loopt door op een dek (pijlers elke 22 m)
  if (onEW) {
    if (Math.abs(oz) <= 13) {
      col[G - 1] = avenueSurface(oz, x, false) === B.GRASS ? B.CONCRETE : avenueSurface(oz, x, false); col[G - 2] = B.CONCRETE;
      if (oz === -13 || oz === 12) { col[G] = B.METAL; col[G + 1] = B.GLASS; return G + 1; }
      if ((lx % 22) === 9 && Math.abs(oz) < 9) for (let y = G - 8; y < G - 2; y++) col[y] = B.CONCRETE;
      return G - 1;
    }
  }
  // jachthaven: houten steigers
  if (tz >= 60 && tz <= 62 && !wall) {
    const pier = (lz % 24) === 4 && lx < 60 || (lx === 30 && lz > 4 && lz < 120);
    if (pier) { col[G - 4] = B.PLANKS; return G - 4; }
  }
  return wall ? G - 1 : G - 5;
}

// ---------- blokken tussen de wegen ----------
function midStreets(tx, tz, L) { return !L || L.id === 'park2' ? !L : false; }
function blockColumn(x, z, tx, tz, lx, lz, L, col) {
  if (L) {
    switch (L.id) {
      case 'tower': case 'towerplaza': return plazaColumn(x, z, lx, lz, col);
      case 'park': case 'park2': return parkColumn(x, z, L, col);
      case 'stadium': return stadiumColumn(x, z, col);
      case 'airport': return airportColumn(x, z, col);
      case 'uni': return uniColumn(x, z, lx, lz, col);
      case 'industry': break;
      case 'hospital': return hospitalColumn(x, z, lx, lz, col);
      case 'busstation': return busColumn(x, z, lx, lz, col);
      case 'mall': return mallColumn(x, z, lx, lz, tx, tz, col);
    }
  }
  // straten door het midden (58..69): stoep 2, rijbaan 8, stoep 2
  const sx = lx >= 58 && lx <= 69, sz = lz >= 58 && lz <= 69;
  if (sx || sz) {
    if (sx && sz) { col[G - 1] = B.ASPHALT; return G - 1; }
    const o = sx ? lx : lz, along = sx ? z : x;
    if (o <= 59 || o >= 68) {
      col[G - 1] = B.SIDEWALK;
      if ((o === 59 || o === 68) && along % 24 === 12) kind = 3;
      if ((o === 58 || o === 69) && along % 36 === 0) { for (let y = G; y < G + 5; y++) col[y] = B.POST; col[G + 5] = B.LAMP; return G + 5; }
      return G - 1;
    }
    col[G - 1] = (o === 63 || o === 64) && along % 8 < 4 ? B.LINE_WHITE : B.ASPHALT;
    return G - 1;
  }
  // perceel (44 × 44 m)
  const qx = lx < 58 ? 0 : 1, qz = lz < 58 ? 0 : 1;
  const px = lx - (qx ? 70 : 14), pz = lz - (qz ? 70 : 14);
  return lotColumn(x, z, tx * 2 + qx, tz * 2 + qz, px, pz, col, L && L.id === 'industry');
}

// ---------- percelen ----------
const LOOKS = [[B.GLASS_BLUE, B.PANEL_WHITE], [B.MIRROR, B.METAL], [B.DARKGLASS, B.PANEL_DARK], [B.GLASS_GREEN, B.PANEL_WHITE], [B.GLASS, B.METAL], [B.MIRROR, B.PANEL_WHITE], [B.GLASS_BLUE, B.PANEL_DARK], [B.DARKGLASS, B.COPPER]];
const WALLS = { urban: [B.PANEL_WHITE, B.PLASTER_BEIGE, B.BRICK, B.LIMESTONE, B.PLASTER_GREY, B.YELLOWBRICK, B.BRICK_DARK, B.CONCRETE], resid: [B.BRICK, B.PLASTER, B.YELLOWBRICK, B.PLASTER_PINK, B.BRICK_DARK, B.PLASTER_BEIGE, B.RED_SANDSTONE] };
const ROOFS = [B.ROOF_RED, B.ROOF_DARK, B.CLAY_ROOF, B.ROOF_GREEN];
const SHOP_COLORS = [B.PAINT_RED, B.PAINT_GREEN, B.PAINT_BLUE, B.PAINT_ORANGE, B.PAINT_YELLOW, B.PAINT_BLACK];
const lotCache = new Map();
function lotDesc(qx, qz) {
  const key = qx * 1000 + qz;
  let L = lotCache.get(key);
  if (L) return L;
  const x = qx * 64 + 32, z = qz * 64 + 32, dist = district(x, z), tx = qx >> 1, tz = qz >> 1;
  const r = hash(qx, qz, 801), r2 = hash(qx, qz, 802), r3 = hash(qx, qz, 803);
  const lm = landmark(tx, tz);
  L = { dist, r, r2, r3 };
  const d = Math.hypot(x - CX, z - CZ);
  if (lm && lm.id === 'industry') { L.type = r < 0.2 ? 'tanks' : 'hall'; L.h = 10 + Math.floor(r2 * 3) * 4; }
  else if (dist === 'core' || dist === 'cbd') {
    if (r3 < 0.08) L.type = 'plaza';
    else {
      L.type = 'tower';
      let h;
      if (dist === 'core') h = 220 + 380 * Math.exp(-(((d - 500) / 520) ** 2)) * (0.45 + 0.55 * r2);
      else h = 100 + 160 * Math.exp(-(((d - 1100) / 900) ** 2)) * (0.4 + 0.6 * r2);
      if (dist === 'core' && r < 0.12) h = Math.max(h, 420 + r2 * 180);
      L.h = Math.min(600, Math.round(h / 4) * 4);
      L.shape = ['box', 'setback', 'taper', 'cyl', 'twist', 'slab', 'setback', 'box'][Math.floor(hash(qx, qz, 804) * 8)];
      L.look = LOOKS[Math.floor(hash(qx, qz, 805) * LOOKS.length)];
      L.use = r2 < 0.25 ? 'hotel' : r2 < 0.5 ? 'wonen' : 'kantoor';
      const half = 18;
      L.a = L.shape === 'slab' ? half : Math.max(11, half * (L.h > 400 ? 0.8 : 0.62 + r3 * 0.35)); L.b = L.shape === 'slab' ? 9 + Math.floor(r3 * 4) : L.a;
      L.twist = (r < 0.5 ? 1 : -1) * Math.PI / 3;
    }
  } else if (dist === 'urban') {
    L.type = r < 0.06 ? 'plaza' : r < 0.14 ? 'super' : 'block';
    L.h = 18 + Math.floor(r2 * 8) * 6; L.wall = WALLS.urban[Math.floor(r3 * WALLS.urban.length)];
    L.shop = SHOP_COLORS[Math.floor(hash(qx, qz, 806) * SHOP_COLORS.length)];
  } else if (dist === 'resid') {
    L.type = r < 0.05 ? 'green' : r < 0.1 ? 'super' : r < 0.55 ? 'block' : 'rows';
    L.h = 12 + Math.floor(r2 * 3) * 3; L.wall = WALLS.resid[Math.floor(r3 * WALLS.resid.length)];
    L.shop = SHOP_COLORS[Math.floor(hash(qx, qz, 806) * SHOP_COLORS.length)];
  } else { L.type = r < 0.07 ? 'green' : 'houses'; }
  lotCache.set(key, L);
  if (lotCache.size > 8000) lotCache.delete(lotCache.keys().next().value);
  return L;
}
function lotColumn(x, z, qx, qz, px, pz, col, industry) {
  const L = lotDesc(qx, qz);
  col[G - 1] = B.SIDEWALK;
  switch (L.type) {
    case 'tower': return towerColumn(x, z, px, pz, L, col);
    case 'plaza': return plazaLot(x, z, px, pz, col);
    case 'block': return midriseColumn(x, z, px, pz, L, col);
    case 'super': return supermarketColumn(x, z, px, pz, L, col);
    case 'rows': return rowColumn(x, z, px, pz, L, col);
    case 'houses': return houseColumn(x, z, px, pz, L, col);
    case 'hall': return hallColumn(x, z, px, pz, L, col);
    case 'tanks': return tankColumn(x, z, px, pz, L, col);
    case 'green': col[G - 1] = B.GRASS; kind = 1; return G - 1;
  }
  return G - 1;
}
function towerInside(L, u, v, k) {
  if (k > L.h) return false;
  let a = L.a, b = L.b;
  const f = k / L.h;
  switch (L.shape) {
    case 'setback': { const s = f < 0.45 ? 1 : f < 0.75 ? 0.8 : 0.6; a *= s; b *= s; break; }
    case 'taper': { const s = 1 - 0.38 * f; a *= s; b *= s; break; }
    case 'twist': { const th = f * L.twist, c = Math.cos(th), s = Math.sin(th); const uu = u * c + v * s, vv = -u * s + v * c; return Math.abs(uu) < a * 0.92 && Math.abs(vv) < b * 0.92; }
    case 'cyl': { const rr = a * (1 - 0.18 * f); return u * u + v * v < rr * rr; }
  }
  return Math.abs(u) < a && Math.abs(v) < b;
}
function towerColumn(x, z, px, pz, L, col) {
  const u = px - 21.5, v = pz - 21.5;
  col[G - 1] = B.TILE;
  if (!towerInside(L, u, v, 1)) {
    // luifel boven de ingang (aan de straatkant van het perceel) en bomen op het plein
    if (Math.abs(u) < 3 && towerInside(L, u, v + 3, 1) && v < 0) { col[G + 4] = B.GLASS; return G + 4; }
    if (hash(x, z, 812) < 0.01) kind = 2;
    return G - 1;
  }
  const [glass, frame] = L.look;
  let top = G - 1;
  const lobby = 8;
  if (Math.abs(u) < 1 && Math.abs(v) < 1) col[G - 1] = B.ELEVATOR; // lift in de kern (springen = omhoog)
  for (let k = 1; k <= L.h; k++) {
    const y = G - 1 + k;
    if (!towerInside(L, u, v, k)) { if (towerInside(L, u, v, k - 1)) { col[y] = frame; top = y; } continue; }
    const ext = !towerInside(L, u - 1, v, k) || !towerInside(L, u + 1, v, k) || !towerInside(L, u, v - 1, k) || !towerInside(L, u, v + 1, k);
    if (ext) {
      const along = Math.abs(u) > Math.abs(v) ? z : x;
      if (k <= lobby) col[y] = (k === lobby || along % 6 === 0) ? frame : (k <= 3 && Math.abs(u) < 2.5 && v < 0 ? B.DOOR_GLASS : B.GLASS);
      else if (k > L.h - 3) col[y] = k === L.h ? frame : B.LAMP;
      else if (L.use === 'wonen' && k % 4 === 2 && along % 7 < 3) col[y] = B.GLASS; // balkons (ingebouwd)
      else col[y] = k % 4 === 0 ? frame : glass; // geen raamstijlen: grote glasvlakken (veel minder driehoeken)
    } else col[y] = k === L.h ? B.CONCRETE : k < lobby ? (k === lobby - 1 && (x + z) % 9 === 0 ? B.LAMP : 0) : k === lobby ? (Math.abs(u) < 1 && Math.abs(v) < 1 ? B.ELEVATOR : B.TILE) : B.ROOM_FILL; // boven de lobby: verlichte kamers achter het glas; binnen worden ze opgebouwd als je er bent (js/megaview.js)
    top = y;
  }
  // dakinstallaties en antenne
  const ry = top;
  if (towerInside(L, u, v, L.h) && ((x * 7 + z * 3) % 11 === 0)) { col[ry + 1] = B.VENT; col[ry + 2] = B.VENT; top = ry + 2; }
  if (L.h > 300 && Math.abs(u) < 1 && Math.abs(v) < 1) { const s = Math.round(L.h * 0.08); for (let y = ry + 1; y < ry + s; y++) col[y] = B.METAL; col[ry + s] = B.LAMP; top = ry + s; }
  return top;
}
function plazaLot(x, z, px, pz, col) {
  col[G - 1] = B.COBBLE;
  const d = Math.hypot(px - 21.5, pz - 21.5);
  if (d < 6) { col[G - 1] = B.WATER; col[G - 2] = B.WATER; if (d < 1) { for (let y = G; y < G + 3; y++) col[y] = B.WATER; return G + 2; } return G - 1; }
  if (d < 7) { col[G] = B.MARBLE; return G; }
  if (d > 12 && (px % 9 === 4) && (pz % 9 === 4)) kind = 2;
  if (d > 9 && d < 10 && (px + pz) % 5 === 0) { col[G] = B.PLANKS; return G; } // banken
  return G - 1;
}
// middelhoog bouwblok met binnentuin: verdiepingen van 3 m, ramen met diepte (glas 1 m naar binnen),
// winkels met luifels op het gelijkvloers, balkons, dakrand, dakinstallaties, regenpijpen
function midriseColumn(x, z, px, pz, L, col) {
  const W = 44, inset = 2, i0 = inset, i1 = W - 1 - inset;
  if (px < i0 - 1 || pz < i0 - 1 || px > i1 + 1 || pz > i1 + 1) return G - 1;
  const depth = 12;
  const inner = px > i0 + depth && pz > i0 + depth && px < i1 - depth && pz < i1 - depth;
  if (inner) { col[G - 1] = B.GRASS; kind = 2; return G - 1; }
  // twee of drie gebouwen per blok met eigen hoogte en gevel (geen identieke buren)
  const seg = px < 22 ? (pz < 22 ? 0 : 1) : (pz < 22 ? 2 : 3);
  const hh = L.h + (hash(x >> 4, z >> 4, 820 + seg) < 0.5 ? 0 : 6) - (seg === 2 ? 6 : 0);
  const wall = seg % 2 ? L.wall : WALLS.urban[(WALLS.urban.indexOf(L.wall) + seg + 1) % WALLS.urban.length];
  const outerRing = px === i0 - 1 || pz === i0 - 1 || px === i1 + 1 || pz === i1 + 1;
  const facadeRow = px === i0 || pz === i0 || px === i1 || pz === i1;
  const courtRow = (px === i0 + depth || pz === i0 + depth || px === i1 - depth || pz === i1 - depth) && px >= i0 + depth && pz >= i0 + depth && px <= i1 - depth && pz <= i1 - depth;
  const along = (px === i0 || px === i1 || px === i0 - 1 || px === i1 + 1) ? pz : px;
  if (outerRing) {
    // gelijkvloers: luifel boven de winkels; verdiepingen: balkons om de 2 verdiepingen; regenpijpen op de hoeken
    const corner = (px === i0 - 1 || px === i1 + 1) && (pz === i0 - 1 || pz === i1 + 1);
    if (corner) return G - 1;
    let top = G - 1;
    if (along % 11 >= 2 && along % 11 <= 8) { col[G + 3] = L.shop; top = G + 3; }
    if ((px === i0 - 1 || px === i1 + 1) && pz % 22 === 3 || (pz === i0 - 1 || pz === i1 + 1) && px % 22 === 3) { for (let y = G + 4; y < G + hh; y++) col[y] = B.POST; top = G + hh - 1; }
    for (let k = 7; k < hh - 2; k += 6) if (along % 11 >= 3 && along % 11 <= 7) { col[G - 1 + k] = B.CONCRETE; col[G + k] = B.GLASS; top = Math.max(top, G + k); }
    return top;
  }
  col[G - 1] = B.TILE;
  const lift = MID_LIFT(px, pz);
  if (lift) col[G - 1] = B.ELEVATOR;
  for (let k = 1; k <= hh; k++) {
    const y = G - 1 + k, lev = k % 3;
    if (facadeRow) {
      if (k <= 3) col[y] = k === 3 ? L.shop : (along % 11 === 5 ? B.DOOR_GLASS : along % 11 < 2 ? wall : B.GLASS);
      else if (k === 4) col[y] = wall;
      else col[y] = (lev !== 1 && along % 4 !== 0) ? 0 : wall; // raamopening (het glas zit 1 m dieper)
    } else if (courtRow) col[y] = lev !== 1 && along % 4 !== 0 ? B.GLASS : wall;
    else {
      // winkels op het gelijkvloers (betreedbaar), daarboven woningen/kantoren achter de ramen
      const nearFacade = px === i0 + 1 || pz === i0 + 1 || px === i1 - 1 || pz === i1 - 1;
      col[y] = k <= 3 ? (k === 3 && (x + z) % 7 === 0 && !lift ? B.LAMP : 0) : k === 4 ? (lift ? B.ELEVATOR : B.TILE) : (nearFacade && lev !== 1 && along % 4 !== 0 ? B.GLASS : B.ROOM_FILL);
    }
  }
  // dakrand en dakinstallaties
  col[G + hh] = facadeRow ? B.LIMESTONE : B.CONCRETE;
  if (facadeRow) { col[G + hh + 1] = wall; return G + hh + 1; }
  if (!facadeRow && hash(x, z, 821) < 0.02) { col[G + hh + 1] = B.VENT; col[G + hh + 2] = B.METAL; return G + hh + 2; }
  if (!facadeRow && (x + z * 3) % 29 === 0) { col[G + hh + 1] = B.SOLAR; return G + hh + 1; }
  return G + hh;
}
// liften in de bouwblokken: één per hoek van de ring
const MID_LIFT = (px, pz) => (px === 6 || px === 37) && (pz === 6 || pz === 37);

// ---------- binnen in de torens en bouwblokken (betreedbaar) ----------
// Boven het gelijkvloers staan in de blokken 'verlichte kamers' (ROOM_FILL): licht om te tekenen. Loop je een
// gebouw binnen, dan zet js/megaview.js de verdiepingen rond jou om in echte ruimtes met deze functie.
export function buildingAt(x, z) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T), lx = x - tx * T, lz = z - tz * T;
  const Lm = landmark(tx, tz);
  if (Lm && Lm.id !== 'industry') return null;
  if (off(x) !== null || off(z) !== null) return null;
  if ((lx >= 58 && lx <= 69) || (lz >= 58 && lz <= 69)) return null;
  const qx = tx * 2 + (lx < 58 ? 0 : 1), qz = tz * 2 + (lz < 58 ? 0 : 1);
  const L = lotDesc(qx, qz);
  if (L.type !== 'tower' && L.type !== 'block') return null;
  const x0 = tx * T + (lx < 58 ? 14 : 70), z0 = tz * T + (lz < 58 ? 14 : 70);
  return { key: qx + ',' + qz, L, kind: L.type, x0, z0, x1: x0 + 44, z1: z0 + 44 };
}
const USE_FLOOR = { kantoor: B.CARPET_GREY, wonen: B.PARQUET, hotel: B.CARPET_BLUE };
export function interiorBlock(bd, x, y, z) {
  const px = x - bd.x0, pz = z - bd.z0, k = y - (G - 1), L = bd.L;
  if (bd.kind === 'tower') {
    const u = px - 21.5, v = pz - 21.5, f = ((k % 4) + 4) % 4, au = Math.abs(u), av = Math.abs(v);
    if (f === 0) return au < 1 && av < 1 ? B.ELEVATOR : (USE_FLOOR[L.use] || B.TILE);
    // kern: lift in het midden, muren errond met een opening naar het zuiden
    if (au < 3 && av < 3) { if (au < 2 && av < 2) return 0; return (f < 3 && v > 0 && au < 1) ? 0 : B.PANEL_DARK; }
    if (f === 3) return (px % 5 === 2 && pz % 5 === 2) ? B.LAMP : 0;
    if (au < 5 && av < 5) return 0; // gang rond de kern
    return useFurniture(L.use, px, pz, f, x, z);
  }
  // bouwblok: verdiepingen van 3 m
  const lev = ((k % 3) + 3) % 3;
  if (lev === 1) return MID_LIFT(px, pz) ? B.ELEVATOR : B.TILE;
  if (MID_LIFT(px, pz) || Math.abs(px - 6) + Math.abs(pz - 6) === 1 || Math.abs(px - 37) + Math.abs(pz - 37) === 1 || Math.abs(px - 6) + Math.abs(pz - 37) === 1 || Math.abs(px - 37) + Math.abs(pz - 6) === 1) return 0;
  if (lev === 0) return (px % 5 === 3 && pz % 5 === 3) ? B.LAMP : 0;
  return useFurniture('wonen', px, pz, lev === 2 ? 1 : 2, x, z);
}
function useFurniture(use, px, pz, f, x, z) {
  // f = 1 (vloerhoogte) of 2 (erboven)
  if (use === 'kantoor') {
    const a = px % 6, b = pz % 6;
    if (f === 1 && (a === 2 || a === 3) && b === 2) return B.TABLE;
    if (f === 1 && a === 2 && b === 3) return B.CHAIR;
    if (f === 2 && a === 2 && b === 2) return B.TV;
    if (f === 1 && a === 5 && b === 5 && (x + z) % 3 === 0) return B.PLANTER;
    return 0;
  }
  // woningen en hotelkamers: kamers van 8 × 8 met tussenmuren en deuren, bed, zetel, tafel, keuken
  const R = use === 'hotel' ? 6 : 8, a = px % R, b = pz % R, h = hash(Math.floor(x / R), Math.floor(z / R), 880);
  if (a === 0 || b === 0) return ((a === 0 && b === Math.floor(R / 2)) || (b === 0 && a === Math.floor(R / 2))) ? 0 : (h < 0.5 ? B.PLASTER : B.PAINT_WHITE);
  if (f === 2) return (a === R - 1 && b === 2) ? B.TV : 0;
  if (a === 1 && (b === 2 || b === 3)) return b === 2 ? B.PILLOW : B.BED;
  if (a === 2 && (b === 2 || b === 3)) return h < 0.4 ? B.BED_BLUE : B.BED;
  if (a === R - 1 && b === 2) return B.TABLE;
  if (use !== 'hotel' && a === R - 2 && b === R - 1) return h < 0.5 ? B.SOFA : B.SOFA_LEATHER;
  if (use !== 'hotel' && b === 1 && a >= R - 3) return a === R - 1 ? B.FRIDGE : B.COUNTER;
  return 0;
}

function supermarketColumn(x, z, px, pz, L, col) {
  // supermarkt van 1 verdieping met parking ervoor
  if (pz < 18) { col[G - 1] = (px % 4 === 0 && pz > 2 && pz < 16) ? B.LINE_WHITE : B.ASPHALT; if (pz === 1 && px % 8 === 4) kind = 3; return G - 1; }
  if (px < 2 || px > 41 || pz > 41) return G - 1;
  const edge = px === 2 || px === 41 || pz === 18 || pz === 41;
  col[G - 1] = B.TILE;
  for (let k = 1; k <= 6; k++) { const y = G - 1 + k; col[y] = edge ? (pz === 18 && k <= 3 ? (px % 6 === 3 ? B.DOOR_GLASS : B.GLASS) : k === 5 ? L.shop : B.PANEL_WHITE) : (k === 1 && (px % 4 === 1) && pz > 22 && pz < 38 ? B.SHELF : k === 6 ? B.METAL : 0); }
  if (!edge && px % 4 === 1 && pz > 22 && pz < 38) col[G + 1] = B.SHELF;
  if (pz === 18 && px >= 10 && px <= 33) { col[G + 6] = L.shop; return G + 6; }
  return G + 5;
}
// rijhuizen (woonwijk): 6 m breed, 3 verdiepingen, zadeldak, schoorsteen, dakkapel, regenpijp, voortuin met haag
function rowColumn(x, z, px, pz, L, col) {
  const front = pz < 22 ? 0 : 1, d = front ? 43 - pz : pz; // twee rijen, voorkant naar de straat
  if (d < 4) { col[G - 1] = d === 3 ? B.HEDGE : B.GRASS; if (d === 3 && px % 6 === 2) col[G - 1] = B.TILE; if (d === 3 && px % 6 !== 2) { col[G] = B.HEDGE; return G; } return G - 1; }
  if (d > 15) { col[G - 1] = B.GRASS; if (d === 21) { col[G] = B.HEDGE; return G; } kind = 2; return G - 1; }
  const house = Math.floor(px / 6), hx = px % 6, hcol = WALLS.resid[Math.floor(hash(house, front, 830 + (x >> 7)) * WALLS.resid.length)];
  const roof = ROOFS[Math.floor(hash(house, front, 831 + (z >> 7)) * ROOFS.length)];
  const floors = 2 + (hash(house, front, 832) < 0.5 ? 1 : 0), wallTop = G - 1 + floors * 3;
  const side = hx === 0, faceRow = d === 4 || d === 15;
  col[G - 1] = B.TILE;
  for (let y = G; y <= wallTop; y++) {
    const k = y - G + 1, lev = k % 3;
    if (side) col[y] = hcol;
    else if (faceRow) col[y] = (k <= 2 && hx === 2 && d === 4) ? (k === 1 ? B.DOOR : B.DOOR_TOP) : (lev !== 0 && hx !== 3 ? B.GLASS : hcol);
    else col[y] = lev === 0 ? B.PLANKS : 0;
  }
  // zadeldak (nok evenwijdig met de straat)
  const rise = Math.min(d - 4, 15 - d);
  for (let k = 1; k <= rise + 1; k++) col[wallTop + k] = k === rise + 1 ? roof : (side ? hcol : 0);
  col[wallTop + rise + 1] = roof;
  let top = wallTop + rise + 1;
  if (hx === 4 && d === 9) { for (let y = top + 1; y <= top + 2; y++) col[y] = B.BRICK_DARK; top += 2; }               // schoorsteen
  if (hx >= 2 && hx <= 3 && d === 6 && floors === 3) { col[wallTop + 2] = B.GLASS; col[wallTop + 3] = roof; top = Math.max(top, wallTop + 3); } // dakkapel
  if (hx === 5 && d === 4) { for (let y = G; y <= wallTop; y++) col[y] = B.POST; }                                  // regenpijp
  if (d === 4 && hx === 2) { col[G + 2] = B.WOOL_RED; }                                                               // luifeltje boven de deur
  return top;
}
function houseColumn(x, z, px, pz, L, col) {
  // vrijstaande huizen (4 per perceel) met tuin, haag, schuin dak, schoorsteen
  const hx = px % 22, hz = pz % 22, id = (px >= 22 ? 1 : 0) + (pz >= 22 ? 2 : 0);
  col[G - 1] = B.GRASS;
  if (hx === 0 || hz === 0) { col[G] = B.HEDGE; return G; }
  const hs = hash(x >> 5, z >> 5, 840 + id), wall = WALLS.resid[Math.floor(hs * WALLS.resid.length)], roof = ROOFS[Math.floor(hash(id, x >> 6, 841) * ROOFS.length)];
  const in0 = hx >= 5 && hx <= 16 && hz >= 6 && hz <= 15;
  if (!in0) { if (hz < 6 && hx >= 9 && hx <= 10) col[G - 1] = B.GRAVEL; if (hash(x, z, 842) < 0.03) kind = 2; return G - 1; }
  const edge = hx === 5 || hx === 16 || hz === 6 || hz === 15, top0 = G + 5;
  for (let y = G; y <= top0; y++) { const k = y - G + 1; col[y] = edge ? ((k % 3 !== 0 && (hx + hz) % 3 === 1) ? B.GLASS : (hz === 6 && hx === 10 && k <= 2 ? (k === 1 ? B.DOOR : B.DOOR_TOP) : wall)) : (k === 3 ? B.PLANKS : 0); }
  const rise = Math.min(hz - 6, 15 - hz);
  for (let k = 1; k <= rise; k++) col[top0 + k] = (hx === 5 || hx === 16) ? wall : 0;
  col[top0 + rise + 1] = roof;
  if (hx === 13 && hz === 9) { col[top0 + rise + 2] = B.BRICK; col[top0 + rise + 3] = B.BRICK; return top0 + rise + 3; }
  return top0 + rise + 1;
}
function hallColumn(x, z, px, pz, L, col) {
  if (px < 3 || pz < 3 || px > 40 || pz > 40) { col[G - 1] = B.ASPHALT; return G - 1; }
  const edge = px === 3 || pz === 3 || px === 40 || pz === 40;
  col[G - 1] = B.CONCRETE;
  for (let k = 1; k <= L.h; k++) col[G - 1 + k] = edge ? (k === L.h - 1 && px % 4 === 0 ? B.GLASS : (pz === 3 && k < 6 && px > 15 && px < 28 ? 0 : B.METAL)) : 0;
  col[G - 1 + L.h] = (px + pz) % 5 === 0 ? B.SOLAR : B.ROOF_GREEN;
  return G - 1 + L.h;
}
function tankColumn(x, z, px, pz, L, col) {
  col[G - 1] = B.CONCRETE;
  const d = Math.hypot((px % 22) - 11, (pz % 22) - 11);
  if (d > 8) return G - 1;
  const h = 14;
  for (let k = 1; k <= h; k++) col[G - 1 + k] = d > 7 ? B.METAL : (k === h ? B.METAL : 0);
  return G - 1 + h;
}
// het plein rond de Megatower (de toren zelf komt uit js/megatower.js)
function plazaColumn(x, z, lx, lz, col) {
  col[G - 1] = (lx + lz) % 8 < 4 ? B.MARBLE : B.GRANITE;
  const d = Math.max(Math.abs(x + 0.5 - CX), Math.abs(z + 0.5 - CZ));
  if (d > 64 && ((lx % 12 === 6 && lz % 12 === 6))) kind = 2;
  if (d > 90 && Math.hypot(x - CX, z - CZ + 150) < 10) { col[G - 1] = B.WATER; col[G - 2] = B.WATER; return G - 1; }
  if (d >= 49 && d < 51 && (lx % 4 === 0 || lz % 4 === 0) && Math.abs(x - CX) > 8 && Math.abs(z - CZ) > 8) { col[G] = B.PLANTER; return G; }
  // oprit van de parkeergarage (oostkant) naar de laan
  if (z >= CZ + 12 && z <= CZ + 18 && x >= CX + 48 && x < 42 * T - 14) { col[G - 1] = z === CZ + 15 && x % 6 < 3 ? B.LINE_WHITE : B.ASPHALT; return G - 1; }
  // naambord van de toren bij de hoofdingang (noordkant)
  if (z === CZ - 56 && Math.abs(x - CX) <= 6) { col[G] = B.MARBLE; col[G + 1] = Math.abs(x - CX) <= 5 ? B.SIGN : B.MARBLE; return G + 1; }
  return G - 1;
}
function parkColumn(x, z, L, col) {
  col[G - 1] = B.GRASS;
  const big = L.id === 'park';
  const cx = big ? 45.5 * T : (Math.floor(x / T) + 0.5) * T, cz = big ? 35 * T : (Math.floor(z / T) + 0.5) * T;
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx / (big ? 1.3 : 1), dz);
  const lake = big ? 120 : 22;
  if (d < lake) { col[G - 1] = B.WATER; col[G - 2] = B.WATER; col[G - 3] = B.SAND; if (big && Math.hypot(dx - 40, dz) < 14) { col[G - 1] = B.GRASS; kind = 1; } return G - 1; }
  if (d < lake + 3) { col[G - 1] = B.SAND; return G - 1; }
  const path = Math.abs(((Math.atan2(dz, dx) * 8 / Math.PI) % 1 + 1) % 1 - 0.5) < 0.012 * (200 / Math.max(40, d)) || Math.abs(d - lake - 24) < 1.5;
  if (path) { col[G - 1] = B.GRAVEL; if (Math.abs(d - lake - 24) < 1.5 && (Math.round(Math.atan2(dz, dx) * 60) % 9 === 0)) { col[G] = B.PLANKS; return G; } return G - 1; }
  if (hash(x, z, 850) < 0.06) col[G - 1] = B.FLOWERS;
  kind = 1;
  return G - 1;
}
function stadiumColumn(x, z, col) {
  const cx = 31 * T, cz = 51 * T, dx = (x - cx) / 120, dz = (z - cz) / 95, r = Math.hypot(dx, dz);
  col[G - 1] = B.ASPHALT;
  if (r < 0.48) { // veld met lijnen
    col[G - 1] = B.GRASS;
    const fx = x - cx, fz = z - cz;
    if (Math.abs(fx) <= 34 && Math.abs(fz) <= 52 && (Math.abs(Math.abs(fx) - 34) < 0.6 || Math.abs(Math.abs(fz) - 52) < 0.6 || Math.abs(fz) < 0.6 || Math.abs(Math.hypot(fx, fz) - 9) < 0.6)) col[G - 1] = B.LINE_WHITE;
    if (Math.abs(fx) <= 4 && Math.abs(Math.abs(fz) - 52) < 0.6) { for (let y = G; y < G + 3; y++) col[y] = B.PAINT_WHITE; return G + 2; }
    return G - 1;
  }
  if (r < 0.53) { col[G - 1] = B.TILE; return G - 1; }
  if (r < 0.98) { // tribunes: trapsgewijs omhoog, gekleurde stoelen, ingangen
    const step = Math.floor((r - 0.53) / 0.45 * 30), y = G - 1 + step;
    for (let k = G; k <= y; k++) col[k] = B.CONCRETE;
    col[y] = step % 2 ? (Math.atan2(dz, dx) > 0 ? B.CHAIR_RED : B.PAINT_BLUE) : B.CONCRETE;
    if (r > 0.93) { for (let k = y + 1; k <= G + 34; k++) col[k] = (k % 5 === 0) ? B.METAL : 0; col[G + 34] = B.METAL; col[G + 35] = B.PANEL_WHITE; return G + 35; }
    if ((Math.round(Math.atan2(dz, dx) * 40) % 13 === 0) && step < 6) { for (let k = G; k <= G + 3; k++) col[k] = 0; } // ingang
    return y;
  }
  if (r < 1.0) { for (let k = G; k <= G + 30; k++) col[k] = (k % 4 === 0) ? B.PANEL_WHITE : B.GLASS; return G + 30; }
  if (hash(x, z, 860) < 0.01) kind = 3;
  return G - 1;
}
function uniColumn(x, z, lx, lz, col) {
  // campus: gebouwen rond een groen plein, bibliotheek met koepel
  const ux = x - 22 * T, uz = z - 30 * T, W = 3 * T, D = 2 * T;
  col[G - 1] = B.GRASS;
  const inQuad = ux > 90 && ux < W - 90 && uz > 70 && uz < D - 70;
  if (inQuad) { if ((ux + uz) % 24 === 0 || Math.abs(ux - W / 2) < 2 || Math.abs(uz - D / 2) < 2) col[G - 1] = B.GRAVEL; else kind = 1; return G - 1; }
  const bx = ux % 64, bz = uz % 64, b = bx >= 8 && bx <= 52 && bz >= 10 && bz <= 50;
  if (!b) { col[G - 1] = (bx === 4 || bz === 4) ? B.GRAVEL : B.GRASS; if (hash(x, z, 870) < 0.02) kind = 2; return G - 1; }
  const edge = bx === 8 || bx === 52 || bz === 10 || bz === 50, h = 16 + Math.floor(hash(ux >> 6, uz >> 6, 871) * 3) * 4;
  col[G - 1] = B.TILE;
  for (let k = 1; k <= h; k++) { const y = G - 1 + k; col[y] = edge ? (k % 4 !== 0 && (bx + bz) % 3 === 1 ? B.GLASS : (k <= 2 && (bx === 30 || bz === 30) ? B.DOOR_GLASS : B.RED_SANDSTONE)) : (k < 4 ? 0 : k === 4 ? B.PLANKS : B.ROOM_FILL); }
  col[G - 1 + h] = B.ROOF_DARK;
  const dome = Math.hypot(bx - 30, bz - 30);
  if (ux >> 6 === 2 && uz >> 6 === 1 && dome < 12) { const hh = Math.round(Math.sqrt(144 - dome * dome)); for (let y = G + h; y < G + h + hh; y++) col[y] = 0; col[G + h + hh] = B.COPPER; return G + h + hh; }
  return G - 1 + h;
}
function hospitalColumn(x, z, lx, lz, col) {
  // H-vormig gebouw van 40 m met een helikopterplatform en een rood kruis
  col[G - 1] = B.ASPHALT;
  const inH = (lx >= 16 && lx <= 40 && lz >= 16 && lz <= 112) || (lx >= 88 && lx <= 112 && lz >= 16 && lz <= 112) || (lx > 40 && lx < 88 && lz >= 52 && lz <= 76);
  if (!inH) { if (lz < 14 && (lx % 6 === 0)) col[G - 1] = B.LINE_WHITE; if (lx > 50 && lx < 78 && lz < 14) { col[G - 1] = B.PAINT_RED; } return G - 1; }
  const edge = !((lx >= 17 && lx <= 39 && lz >= 17 && lz <= 111) || (lx >= 89 && lx <= 111 && lz >= 17 && lz <= 111) || (lx > 39 && lx < 89 && lz >= 53 && lz <= 75));
  const h = 40;
  col[G - 1] = B.TILE;
  for (let k = 1; k <= h; k++) { const y = G - 1 + k; col[y] = edge ? (k % 4 !== 0 && (lx + lz) % 3 !== 0 ? B.GLASS : (k <= 3 && lz === 52 && lx > 58 && lx < 70 ? B.DOOR_GLASS : B.PANEL_WHITE)) : (k < 4 ? (k === 3 && (lx + lz) % 8 === 0 ? B.LAMP : 0) : k === 4 ? B.TILE : B.ROOM_FILL); }
  const hx = lx - 64, hz = lz - 64;
  if (Math.abs(hx) < 12 && Math.abs(hz) < 10) { col[G - 1 + h] = Math.hypot(hx, hz) < 8 && Math.abs(Math.hypot(hx, hz) - 7) < 0.8 ? B.PAINT_YELLOW : B.HELIPAD; return G - 1 + h; }
  if ((Math.abs(hx) < 2 && lz >= 20 && lz <= 32 && lx < 40) || (lz >= 25 && lz <= 27 && Math.abs(lx - 28) < 6)) { col[G + h] = B.PAINT_RED; return G + h; }
  return G - 1 + h;
}
function busColumn(x, z, lx, lz, col) {
  // busstation: 8 perrons met overkapping, wachtzaal, in- en uitrit
  col[G - 1] = B.ASPHALT;
  if (lz >= 104) { col[G - 1] = B.SIDEWALK; return G - 1; }
  const bay = (lx - 10) % 14;
  if (lx >= 10 && lx < 122 && lz >= 30 && lz <= 90) {
    if (bay >= 0 && bay < 3) { col[G - 1] = B.TILE; col[G] = B.TILE; if (lz % 12 === 0) { for (let y = G + 1; y < G + 5; y++) col[y] = B.METAL; } col[G + 5] = B.GLASS; if (lz === 40 && bay === 1) col[G + 2] = B.SIGN; return G + 5; }
    if (bay === 7 && lz % 4 < 2) col[G - 1] = B.LINE_YELLOW;
  }
  if (lx >= 30 && lx <= 98 && lz >= 92 && lz <= 102) { const edge = lx === 30 || lx === 98 || lz === 92 || lz === 102; col[G - 1] = B.TILE; for (let k = 1; k <= 6; k++) col[G - 1 + k] = edge ? (k <= 3 && lx % 6 !== 0 ? (lz === 102 && lx % 12 === 6 ? B.DOOR_GLASS : B.GLASS) : B.PANEL_WHITE) : (k === 1 && lx % 5 === 0 ? B.CHAIR : 0); col[G + 6] = B.GLASS; return G + 6; }
  return G - 1;
}
function mallColumn(x, z, lx, lz, tx, tz, col) {
  // groot winkelcentrum (100 × 100 m) met glazen atrium, ingangen aan alle zijden, parkeerdak
  col[G - 1] = B.SIDEWALK;
  if (lx < 16 || lz < 16 || lx > 111 || lz > 111) { if ((lx + lz) % 20 === 0) kind = 3; return G - 1; }
  const edge = lx === 16 || lz === 16 || lx === 111 || lz === 111, h = 22;
  const atrium = Math.abs(lx - 63.5) < 14 && Math.abs(lz - 63.5) < 14;
  const color = SHOP_COLORS[(tx + tz) % SHOP_COLORS.length];
  col[G - 1] = B.MARBLE;
  for (let k = 1; k <= h; k++) {
    const y = G - 1 + k;
    if (edge) { const mid = Math.abs((lx === 16 || lx === 111 ? lz : lx) - 63.5) < 6; col[y] = k <= 3 && mid ? B.DOOR_GLASS : (k === 8 || k === 9 ? color : (k % 7 === 0 ? B.PANEL_WHITE : B.GLASS)); }
    else if (atrium) col[y] = k === h ? B.GLASS : 0;
    else col[y] = k % 7 === 0 ? B.TILE : (k % 7 === 1 && (lx * 3 + lz) % 11 === 0 ? B.SHELF : (k % 7 === 6 && (lx + lz) % 6 === 0 ? B.LAMP : 0));
  }
  if (atrium) return G - 1 + h;
  if (!edge && (lx % 4 === 0) && lz > 20 && lz < 108) { col[G + h] = B.LINE_WHITE; }
  return G - 1 + h + (edge ? 1 : 0);
}
function airportColumn(x, z, col) {
  col[G - 1] = B.GRASS;
  // startbaan noord-zuid met lichten en markeringen
  const rx = x - RUNWAY_X;
  if (Math.abs(rx) <= 30 && z >= RUNWAY_Z0 && z <= RUNWAY_Z1) {
    col[G - 1] = Math.abs(rx) < 1 && z % 40 < 20 ? B.LINE_WHITE : (Math.abs(rx) > 28 ? B.LINE_WHITE : (z - RUNWAY_Z0 < 60 || RUNWAY_Z1 - z < 60) && Math.abs(rx) % 4 < 2 && Math.abs(rx) > 4 ? B.LINE_WHITE : B.ASPHALT);
    return G - 1;
  }
  if (Math.abs(rx) === 33 && z % 30 === 0 && z >= RUNWAY_Z0 && z <= RUNWAY_Z1) { col[G] = B.LAMP; return G; }
  // taxibaan en platform
  const tx = x - (RUNWAY_X - 150);
  if (Math.abs(tx) <= 11 && z >= RUNWAY_Z0 && z <= RUNWAY_Z1) { col[G - 1] = Math.abs(tx) < 1 ? B.LINE_YELLOW : B.ASPHALT; return G - 1; }
  if (z >= RUNWAY_Z0 + 200 && z <= RUNWAY_Z1 - 200 && ((z - RUNWAY_Z0) % 600 < 14) && x > RUNWAY_X - 150 && x < RUNWAY_X - 30) { col[G - 1] = B.ASPHALT; return G - 1; }
  const apron = x >= 71 * T && x < 74 * T + 40 && z >= 33 * T && z < 46 * T;
  if (apron) { col[G - 1] = B.CONCRETE; if ((x - 71 * T) % 90 === 45 && (z % 8 < 4)) col[G - 1] = B.LINE_YELLOW; return G - 1; }
  // terminal: lang gebouw met golvend dak, glazen gevels, loopbruggen
  const t0 = 69 * T + 64, t1 = 71 * T - 4;
  if (x >= t0 && x <= t1 && z >= 33 * T && z < 46 * T) {
    const edge = x === t0 || x === t1 || z === 33 * T || z === 46 * T - 1;
    const roofH = 22 + Math.round(4 * Math.sin((z - 33 * T) / 60));
    col[G - 1] = B.MARBLE;
    for (let k = 1; k <= roofH; k++) { const y = G - 1 + k; col[y] = edge ? (k <= 3 && x === t0 && z % 40 < 6 ? B.DOOR_GLASS : (k % 6 === 0 ? B.METAL : B.GLASS)) : (k === 1 && (z % 30 === 0) && (x - t0) % 10 === 5 ? B.COUNTER : (k === 1 && (z % 6 === 0) && (x - t0) % 12 === 2 ? B.CHAIR : (k === 7 ? (x - t0 > 20 ? B.TILE : 0) : 0))); }
    col[G - 1 + roofH] = B.PANEL_WHITE;
    if ((x - t0) % 16 === 8 && z % 24 === 0) col[G + 1] = B.SIGN;
    return G - 1 + roofH;
  }
  if (x > t1 && x < 71 * T + 30 && (z - 33 * T) % 90 > 40 && (z - 33 * T) % 90 < 44) { col[G + 4] = B.METAL; col[G + 5] = B.GLASS; col[G + 6] = B.METAL; return G + 6; } // loopbrug
  // parking voor de terminal
  if (x >= 68 * T + 14 && x < t0 - 8 && z >= 33 * T && z < 46 * T) { col[G - 1] = (x % 3 === 0 && z % 30 > 4) ? B.LINE_WHITE : B.ASPHALT; return G - 1; }
  if (x >= t0 - 8 && x < t0) { col[G - 1] = B.SIDEWALK; return G - 1; }
  // verkeerstoren
  if (Math.hypot(x - (74 * T + 80), z - 32 * T) < 5) { for (let k = G; k < G + 45; k++) col[k] = k > G + 38 ? B.DARKGLASS : B.CONCRETE; col[G + 45] = B.PANEL_WHITE; return G + 45; }
  // hek tussen landzijde en luchtzijde
  if (x === 71 * T + 34 && (z < 33 * T || z >= 46 * T)) { col[G] = B.METAL; col[G + 1] = B.METAL; return G + 1; }
  return G - 1;
}

// ---------- metro: lijn M1 onder de laan op z = 5120, stations met trappen naar de middenberm ----------
function metroColumn(x, z, col) {
  const o = z - METRO_Z;
  if (o < -7 || o > 15 || x < 512 || x > METRO_END + 12) return;
  const tx = Math.floor(x / T), lx = x - tx * T;
  const station = METRO_ST.includes(tx) && lx >= 16 && lx < 112;
  const tower = tx === TOWER_TX;
  if (o > 8) {
    // doorgang van het metroperron naar de Megatower (B3), onder het plein
    if (!tower || lx < 60 || lx > 67) return;
    for (let y = G - 14; y <= G - 7; y++) col[y] = B.CONCRETE;
    if (lx === 60 || lx === 67) return;
    col[G - 13] = B.MARBLE; for (let y = G - 12; y <= G - 9; y++) col[y] = 0; if (lx === 63 && o % 3 === 0) col[G - 9] = B.LAMP;
    return;
  }
  const end = x >= METRO_END;
  if (!station) {
    // tunnel: 2 sporen, 6 m hoog
    for (let y = G - 19; y <= G - 10; y++) col[y] = B.CONCRETE;
    if (o === -7 || o === 8 || end) return;
    col[G - 18] = (o === -5 || o === -3 || o === 4 || o === 6) ? B.METAL : B.BALLAST;
    for (let y = G - 17; y <= G - 12; y++) col[y] = 0;
    if (o === 0 || o === 1) col[G - 18] = B.CONCRETE;
    if (o === 0 && x % 24 === 0) col[G - 12] = B.LAMP;
    return;
  }
  // station: eilandperron (o -2..3) tussen de sporen, hal 9 m hoog, tussenverdieping (alleen bij de toren)
  for (let y = G - 19; y <= G - 8; y++) col[y] = B.CONCRETE;
  if (tower && o === 8 && lx >= 61 && lx <= 66) { col[G - 13] = B.MARBLE; for (let y = G - 12; y <= G - 9; y++) col[y] = 0; return; }
  if (o === -7 || o === 8) { if (lx % 8 === 0) col[G - 15] = B.SIGN; return; }
  if (lx === 16 || lx === 111) {
    // einde van de perronhal: de sporen lopen door (tunnelprofiel), alleen het perron krijgt een eindwand
    if (o >= -2 && o <= 3) return;
    for (let y = G - 17; y <= G - 12; y++) col[y] = 0;
    col[G - 18] = (o === -5 || o === -3 || o === 4 || o === 6) ? B.METAL : B.BALLAST;
    return;
  }
  for (let y = G - 17; y <= G - 9; y++) col[y] = 0;
  const plat = o >= -2 && o <= 3;
  if (plat) { col[G - 18] = B.CONCRETE; col[G - 17] = (o === -2 || o === 3) ? B.LINE_YELLOW : B.TILE; }
  else col[G - 18] = (o === -5 || o === -3 || o === 4 || o === 6) ? B.METAL : B.BALLAST;
  if (o === 0 && lx % 8 === 4) col[G - 9] = B.LAMP;
  if (plat && (o === 0 || o === 1) && lx % 16 === 8) { col[G - 16] = B.PLANKS; } // banken
  if (plat && o === 1 && lx % 32 === 20) { col[G - 16] = B.TICKET; }
  if (plat && o === 0 && lx % 32 === 4) { col[G - 16] = B.POST; col[G - 15] = B.SIGN; }   // vertrekbord (E)
  if (plat && o === 3 && lx % 24 === 12) col[G - 16] = B.METAL;                          // afvalbak
  if (!tower && plat && o === 1 && lx === 26) {                                         // lift naar de middenberm
    col[G - 17] = B.ELEVATOR; col[G - 16] = 0; col[G - 15] = 0;
    col[G - 1] = B.ELEVATOR; for (let y = G; y <= G + 1; y++) col[y] = 0; col[G + 2] = B.GLASS;
    return;
  }
  if (tower) {
    // tussenverdieping boven het zuidelijke spoor naar de doorgang (B3 = G-13), roltrap naar het perron
    if (lx >= 58 && lx <= 69 && o >= 2 && o <= 8) {
      col[G - 13] = B.MARBLE;
      if (lx === 58 || lx === 69) col[G - 12] = B.GLASS;
      if (o === 2 || o === 3) { // roltrap van het perron (G-17) naar de tussenverdieping
        const step = lx - 60; col[G - 13] = 0;
        if (step >= 0 && step < 4) { col[G - 16 + step] = B.ESCALATOR; for (let y = G - 15 + step; y <= G - 12; y++) col[y] = 0; }
        else if (lx >= 64 && lx <= 69 && lx !== 69) col[G - 13] = B.MARBLE;
      }
    }
    return;
  }
  // trap van het perron naar de middenberm (16 treden), afgeschermd met glas, kiosk op straat
  if ((lx >= 40 && lx < 56) && (o === -1 || o === 0)) {
    const step = lx - 40;
    for (let y = G - 17; y <= G + 3; y++) col[y] = 0;
    for (let y = G - 18; y <= G - 17 + step; y++) col[y] = B.CONCRETE;
    col[G - 17 + step] = B.TILE;
    if (step >= 13) { col[G + 3] = B.GLASS; }
    return;
  }
  if ((lx >= 39 && lx <= 56) && (o === -2 || o === 1) && lx !== 56) {
    for (let y = G - 8; y <= G + 1; y++) col[y] = lx >= 52 ? B.GLASS : B.CONCRETE; col[G + 3] = B.GLASS; if (lx === 54 && o === 1) col[G + 2] = B.SIGN;
    return;
  }
  if (lx === 56 && (o === -1 || o === 0)) { col[G - 1] = B.TILE; col[G + 3] = B.GLASS; }
}

// ---------- spoorviaduct op z = 6016: deck op G+8, pijlers in de middenberm, station Megatower Centraal ----------
const DECK = G + 8;
function railColumn(x, z, col) {
  const o = z - RAIL_Z;
  if (x > RAIL_END + 8 || o < -16 || o > 15) return 0;
  const station = x >= STATION_X0 && x < STATION_X1, apStation = x >= RAIL_END - 220;
  const half = station || apStation ? 15 : 5;
  if (o < -half - 1 || o > half) return 0;
  if (x > RAIL_END) { if (o >= -6 && o <= 5) { for (let y = DECK - 3; y <= DECK + 2; y++) col[y] = B.CONCRETE; return DECK + 2; } return 0; } // stootblok
  let top = DECK;
  col[DECK] = B.CONCRETE; col[DECK - 1] = B.CONCRETE;
  if (o === -half - 1 || o === half) { col[DECK + 1] = B.CONCRETE; col[DECK + 2] = B.GLASS; return DECK + 2; }
  // pijlers elke 24 m (in de middenberm) en bij stations aan de stoeprand
  if (off(x) === null && ((x % 24 === 0 && o >= -2 && o <= 1) || (half > 5 && x % 24 === 0 && (o === -14 || o === 13)))) for (let y = G; y < DECK - 1; y++) col[y] = B.CONCRETE;
  const tracks = half > 5 ? [-9, -3, 2, 8] : [-3, 2];
  for (const c of tracks) if (o === c - 1 || o === c + 1) col[DECK + 1] = B.METAL;
  if (tracks.some(c => Math.abs(o - c) <= 2)) { col[DECK] = B.BALLAST; }
  if (half > 5) {
    // perrons: zijperrons (o -15..-12 en 11..14) en eilandperron (o -1..0), 1 m hoog, met dak
    const plat = o <= -12 || o >= 11 || o === -1 || o === 0;
    if (plat) { col[DECK + 1] = (o === -12 || o === 11 || o === -1 || o === 0) && (x & 3) === 0 ? B.LINE_YELLOW : B.TILE; top = DECK + 1;
      if ((o === -14 || o === 13 || o === -1) && x % 16 === 8) { for (let y = DECK + 2; y <= DECK + 5; y++) col[y] = B.METAL; }
      if (o === -13 && x % 32 === 16) col[DECK + 2] = B.PLANKS;
      if (o === 12 && x % 40 === 20) col[DECK + 3] = B.SIGN;
    }
    col[DECK + 7] = (o + x) % 7 === 0 ? B.GLASS : B.PANEL_WHITE; // perronkap
    if (o % 6 === 0 && x % 8 === 0) col[DECK + 6] = B.LAMP;
    top = DECK + 7;
    // trappen van de stoep naar de zijperrons (en van de middenberm naar het eilandperron)
    for (const [so, dir] of [[-13, 1], [12, 1], [-1, 1]]) {
      if (o !== so && o !== so + (so < 0 ? 1 : -1)) continue;
      const sx = ((x - STATION_X0) % 96 + 96) % 96 - 30;
      if (station && sx >= 0 && sx < 10) {
        for (let y = G; y <= DECK + 6; y++) col[y] = 0;
        const yy = G - 1 + sx;
        for (let y = G - 1; y <= yy; y++) col[y] = B.CONCRETE;
        col[yy] = B.TILE;
        top = DECK + 7;
      }
    }
  }
  return top;
}

// ---------- tegel maken ----------
const PAD = 3;
export function generateTile(tx, tz) {
  const X0 = tx * T, Z0 = tz * T;
  const tower = tx === TOWER_TX && tz === TOWER_TZ;
  const y0 = tower ? TOWER_Y0 : Y0;
  const col = new Uint8Array(1200), trees = [];
  const cols = new Array(T * T);
  let maxTop = G + 8;
  for (let z = -PAD; z < T + PAD; z++) for (let x = -PAD; x < T + PAD; x++) {
    const gx = X0 + x, gz = Z0 + z;
    if (gx < 0 || gz < 0 || gx >= MW || gz >= ML) continue;
    const inside = x >= 0 && z >= 0 && x < T && z < T;
    col.fill(0, y0);
    const top = fillColumn(gx, gz, col);
    if (tower) for (let y = y0; y < Y0; y++) col[y] = B.STONE;
    if (inside) { const i = z * T + x; cols[i] = col.slice(y0, top + 1); if (top + 10 > maxTop) maxTop = top + 10; }
    const p = kind === 1 ? 0.45 : kind === 2 ? 0.3 : kind === 3 ? 1 : 0;
    if (p) {
      const ok = kind === 3 || (((gx % 9) === Math.floor(hash(Math.floor(gx / 9), Math.floor(gz / 9), 41) * 9)) && ((gz % 9) === Math.floor(hash(Math.floor(gx / 9), Math.floor(gz / 9), 42) * 9)) && hash(gx, gz, 43) < p);
      if (ok) trees.push(x, z, top, kind === 3 ? 1 : 0);
    }
  }
  const H = tower ? TOWER_H : Math.ceil((maxTop - y0) / 8) * 8;
  const vox = new Uint8Array(T * T * H);
  for (let i = 0; i < T * T; i++) if (cols[i]) vox.set(cols[i].subarray(0, Math.min(H, cols[i].length)), i * H);
  const set = (x, y, z, b, force) => {
    if (x < 0 || z < 0 || x >= T || z >= T) return;
    const ly = y - y0; if (ly < 0 || ly >= H) return;
    const i = (z * T + x) * H + ly;
    if (!vox[i] || force) vox[i] = b;
  };
  for (let i = 0; i < trees.length; i += 4) placeTreeVariety(trees[i], trees[i + 1], trees[i + 2], (trees[i] + X0) * 31 + (trees[i + 1] + Z0), set, trees[i + 3]);
  if (tower) writeTower(vox, H, y0);
  const res = { vox, H, y0, ground: G, paths: makePaths(tx, tz) };
  if (tower) res.interior = { x0: 16, z0: 16, x1: 112, z1: 112 };
  return res;
}

// ---------- paden voor het verkeer ----------
function makePaths(tx, tz) {
  const X0 = tx * T, Z0 = tz * T, paths = [];
  const add = (type, pts, extra) => paths.push({ type, pts: new Float32Array(pts), ...extra });
  const L = landmark(tx, tz);
  // lanen noord-zuid op x = X0 (en X0 + T): rijstroken, stoepen, tram
  for (const i of [tx, tx + 1]) {
    if (!avenueNS(i, tz)) continue;
    const X = i * T - X0;
    for (const [o, dir] of [[-9.5, 1], [-6.5, 1], [5.5, -1], [8.5, -1]]) {
      const x = X + o; if (x < -2 || x > T + 2) continue;
      add('carM', dir > 0 ? [x, 0, G - 1, x, T, G - 1] : [x, T, G - 1, x, 0, G - 1]);
    }
    for (const o of [-13, 12]) { const x = X + o; if (x > -2 && x < T + 2) add('walk', [x, 0, G - 1, x, T, G - 1]); }
    if (TRAM_X.includes(i)) for (const [o, dir] of [[-3, 1], [2, -1]]) { const x = X + o; if (x > -2 && x < T + 2) add('tram', dir > 0 ? [x, 0, G - 1, x, T, G - 1] : [x, T, G - 1, x, 0, G - 1], { line: 'T' + (TRAM_X.indexOf(i) + 1) }); }
  }
  for (const j of [tz, tz + 1]) {
    if (!avenueEW(j, tx)) continue;
    const Z = j * T - Z0;
    for (const [o, dir] of [[-9.5, -1], [-6.5, -1], [5.5, 1], [8.5, 1]]) {
      const z = Z + o; if (z < -2 || z > T + 2) continue;
      add('carM', dir > 0 ? [0, z, G - 1, T, z, G - 1] : [T, z, G - 1, 0, z, G - 1]);
    }
    for (const o of [-13, 12]) { const z = Z + o; if (z > -2 && z < T + 2) add('walk', [0, z, G - 1, T, z, G - 1]); }
    if (TRAM_Z.includes(j)) for (const [o, dir] of [[-3, -1], [2, 1]]) { const z = Z + o; if (z > -2 && z < T + 2) add('tram', dir > 0 ? [0, z, G - 1, T, z, G - 1] : [T, z, G - 1, 0, z, G - 1], { line: 'T' + (TRAM_Z.indexOf(j) + 3) }); }
  }
  // verkeerslichten op de kruispunten van lanen
  if (avenueNS(tx, tz) || avenueEW(tz, tx)) add('signal', [0, 0, G - 1]);
  // haltes: bus aan de stoep, tram in de middenberm
  const stopAt = (v) => ((v % (3 * T)) + 3 * T) % (3 * T);
  for (let a = 0; a < T; a += 2) {
    const gx = X0 + a, gz = Z0 + a;
    if (stopAt(gz) === 42 && avenueNS(tx, tz)) add('busstop', [12, a, G - 1], { name: 'Halte ' + zoneName(X0, gz) });
    if (stopAt(gx) === 42 && avenueEW(tz, tx)) add('busstop', [a, 12, G - 1], { name: 'Halte ' + zoneName(gx, Z0) });
    if (stopAt(gz) === 80 && TRAM_X.includes(tx)) add('busstop', [0, a, G - 1], { name: 'Tramhalte ' + zoneName(X0, gz) });
    if (stopAt(gx) === 80 && TRAM_Z.includes(tz)) add('busstop', [a, 0, G - 1], { name: 'Tramhalte ' + zoneName(gx, Z0) });
  }
  // straten door het midden
  if (!L || L.id === 'industry') {
    add('car', [61.5, 14, G - 1, 61.5, 114, G - 1]); add('car', [65.5, 114, G - 1, 65.5, 14, G - 1]);
    add('car', [114, 61.5, G - 1, 14, 61.5, G - 1]); add('car', [14, 65.5, G - 1, 114, 65.5, G - 1]);
    for (const o of [58.5, 68.5]) { add('walk', [o, 14, G - 1, o, 114, G - 1]); add('walk', [14, o, G - 1, 114, o, G - 1]); }
  }
  // rivier: boten
  if (tx === RIVER_TX) for (const o of [45, 82]) add('boatL', [o, 0, G - 5, o, T, G - 5]);
  // metro M1 (2 sporen op G-18) met haltes
  if (X0 + T > 512 && X0 < METRO_END) {
    const xa = Math.max(0, 512 - X0), xb = Math.min(T, METRO_END - X0);
    for (const [o, dir] of [[-4, 1], [5, -1]]) { const z = METRO_Z + o - Z0; if (z > -2 && z < T + 2) add('metro', dir > 0 ? [xa, z, G - 18, xb, z, G - 18] : [xb, z, G - 18, xa, z, G - 18], { line: 'M1' }); }
    if (METRO_ST.includes(tx) && METRO_Z - Z0 >= 0 && METRO_Z - Z0 < T) add('metrostop', [64, METRO_Z - Z0, G - 18], { name: 'Metro ' + METRO_NAMES[tx] });
  }
  // trein over het viaduct (4 sporen in het station, 2 erbuiten) en haltes
  if (X0 < RAIL_END) {
    const xb = Math.min(T, RAIL_END - X0);
    for (const [o, dir] of [[-3, 1], [2, -1]]) { const z = RAIL_Z + o - Z0; if (z > -2 && z < T + 2) add('train', dir > 0 ? [0, z, DECK, xb, z, DECK] : [xb, z, DECK, 0, z, DECK], { line: 'IC' }); }
    if (X0 >= STATION_X0 && X0 < STATION_X1 && tx === 38 && RAIL_Z - Z0 >= 0 && RAIL_Z - Z0 < T) add('railstop', [64, RAIL_Z - Z0, DECK], { name: 'Megatower Centraal' });
    if (RAIL_END - X0 > 0 && RAIL_END - X0 <= T && RAIL_Z - Z0 >= 0 && RAIL_Z - Z0 < T) add('railstop', [RAIL_END - X0 - 100, RAIL_Z - Z0, DECK], { name: 'Luchthaven' });
  }
  // luchthaven: startbaan en gates
  if (L && L.id === 'airport') {
    if (X0 <= RUNWAY_X && X0 + T > RUNWAY_X && Z0 <= RUNWAY_Z0 + 100 && Z0 + T > RUNWAY_Z0 + 100) add('runway', [RUNWAY_X - X0, RUNWAY_Z0 + 100 - Z0, G - 1, RUNWAY_X - X0, RUNWAY_Z1 - 100 - Z0, G - 1]);
    for (let g = 0; g < 13; g++) {
      const gx = 71 * T + 45, gz = 33 * T + 45 + g * 90;
      if (gx >= X0 && gx < X0 + T && gz >= Z0 && gz < Z0 + T) add('gate', [gx - X0, gz - Z0, G - 1, Math.PI / 2]);
    }
  }
  return paths;
}

// ---------- plaatsen om naartoe te springen ----------
export const PLACES = [
  ['Megatower – hoofdingang', CX + 0.5, CZ - 58],
  ['Station Megatower Centraal', 38 * T + 64, RAIL_Z + 18],
  ['Busstation Centraal', 38 * T + 64, 47 * T + 110],
  ['Luchthaven – terminal', 69 * T + 40, 40 * T],
  ['Centraal Park', 45 * T + 64, 34 * T],
  ['Megatower Stadion', 31 * T, 49 * T + 100],
  ['Universiteit', 23 * T + 64, 30 * T + 40],
  ['Ziekenhuis', 50 * T + 64, 46 * T + 4],
  ['Rivier en jachthaven', RIVER_TX * T + 64, 61 * T],
  ['Winkelcentrum Noord', 36 * T + 64, 42 * T + 4],
];
export { floorY };
