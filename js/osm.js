// Echte wereld: OpenStreetMap-gegevens ophalen en omzetten naar blokken.
// Werkt met Overpass-JSON en met .osm-bestanden (XML) van openstreetmap.org.

import { B, BLOCKS } from './blocks.js';
import { hash, placeTree } from './city.js';

export const REAL_GROUND = 12;
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ---------- inlezen ----------
const ENT = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
const decode = (s) => s.replace(/&(amp|quot|lt|gt|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()]);

export function parseOSM(text) {
  const nodes = new Map(), ways = [], rels = [], trees = [];
  let bounds = null;
  const t = text.trimStart();
  if (t[0] === '{') {
    const j = JSON.parse(t);
    for (const e of j.elements || []) {
      if (e.type === 'node') {
        nodes.set(e.id, [e.lat, e.lon]);
        if (e.tags && e.tags.natural === 'tree') trees.push([e.lat, e.lon]);
      } else if (e.type === 'way') ways.push({ id: e.id, nds: e.nodes || [], tags: e.tags || {} });
      else if (e.type === 'relation') rels.push({ id: e.id, members: e.members || [], tags: e.tags || {} });
    }
    if (j.bounds) bounds = j.bounds;
  } else if (t.startsWith('<')) {
    const b = /<bounds\s+([^>]*)\/?>/.exec(t);
    if (b) {
      const a = attrs(b[1]);
      bounds = { minlat: +a.minlat, minlon: +a.minlon, maxlat: +a.maxlat, maxlon: +a.maxlon };
    }
    const re = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
    let m;
    while ((m = re.exec(t))) {
      const a = attrs(m[2]);
      const body = m[4] || '';
      const tags = {};
      body.replace(/<tag\s+k="([^"]*)"\s+v="([^"]*)"/g, (_, k, v) => { tags[decode(k)] = decode(v); return ''; });
      if (m[1] === 'node') {
        nodes.set(+a.id, [+a.lat, +a.lon]);
        if (tags.natural === 'tree') trees.push([+a.lat, +a.lon]);
      } else if (m[1] === 'way') {
        const nds = [];
        body.replace(/<nd\s+ref="(-?\d+)"/g, (_, r) => { nds.push(+r); return ''; });
        ways.push({ id: +a.id, nds, tags });
      } else {
        const members = [];
        body.replace(/<member\s+type="(\w+)"\s+ref="(-?\d+)"\s+role="([^"]*)"/g, (_, ty, r, role) => { members.push({ type: ty, ref: +r, role }); return ''; });
        rels.push({ id: +a.id, members, tags });
      }
    }
  } else {
    throw new Error('Onbekend bestandsformaat. Gebruik een .osm-bestand of Overpass-JSON.');
  }
  if (!nodes.size) throw new Error('Er staan geen kaartgegevens in dit bestand.');
  return { nodes, ways, rels, trees, bounds };
}
function attrs(s) {
  const o = {};
  s.replace(/(\w+)="([^"]*)"/g, (_, k, v) => { o[k] = v; return ''; });
  return o;
}

// ---------- downloaden ----------
export function bboxFor(lat, lon, size, margin = 25) {
  const half = size / 2 + margin;
  const dLat = half / 110574, dLon = half / (111320 * Math.cos(lat * Math.PI / 180));
  return { s: lat - dLat, w: lon - dLon, n: lat + dLat, e: lon + dLon };
}

export async function fetchOSM(lat, lon, size, onStatus) {
  const b = bboxFor(lat, lon, size);
  const bb = `${b.s.toFixed(6)},${b.w.toFixed(6)},${b.n.toFixed(6)},${b.e.toFixed(6)}`;
  const q = `[out:json][timeout:90];(way(${bb});relation["type"="multipolygon"](${bb});node["natural"="tree"](${bb}););(._;>;);out body qt;`;
  let lastErr;
  for (const url of OVERPASS) {
    try {
      onStatus?.(`Verbinden met ${new URL(url).host}…`);
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error(`server antwoordde ${res.status}`);
      onStatus?.('Kaartgegevens ontvangen…');
      return await res.text();
    } catch (e) { lastErr = e; }
  }
  throw new Error('OpenStreetMap kon niet bereikt worden (' + (lastErr?.message || 'netwerkfout') + ').');
}

// ---------- kleuren en hoogtes ----------
const NAMED = {
  white: [240, 240, 240], whitesmoke: [240, 240, 240], ivory: [250, 248, 235], beige: [222, 210, 180], cream: [238, 228, 200],
  grey: [128, 128, 128], gray: [128, 128, 128], darkgrey: [90, 90, 90], darkgray: [90, 90, 90], lightgrey: [200, 200, 200],
  lightgray: [200, 200, 200], silver: [192, 192, 192], black: [30, 30, 30], red: [180, 40, 40], darkred: [120, 30, 30],
  maroon: [120, 30, 30], brown: [130, 80, 50], tan: [210, 180, 140], sandybrown: [220, 170, 110], yellow: [230, 200, 60],
  orange: [230, 130, 30], blue: [40, 80, 180], lightblue: [170, 210, 235], navy: [30, 40, 100], green: [40, 140, 70],
  darkgreen: [30, 90, 40], pink: [230, 170, 180], salmon: [230, 140, 120], gold: [220, 180, 60], teal: [40, 128, 128],
};
const WALL_CHOICES = [B.PLASTER, B.YELLOWBRICK, B.BRICK, B.CONCRETE, B.METAL, B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN,
  B.PAINT_ORANGE, B.PAINT_BLACK, B.PAINT_WHITE, B.STONE, B.PLANKS, B.DARKGLASS];
const ROOF_CHOICES = [B.ROOF_RED, B.ROOF_DARK, B.CONCRETE, B.METAL, B.PAINT_GREEN, B.PLASTER, B.PAINT_BLACK, B.BRICK];
function parseColour(v) {
  if (!v) return null;
  v = v.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#?([0-9a-f]{6})$/.exec(v);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^#?([0-9a-f]{3})$/.exec(v);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  return null;
}
function nearest(rgb, choices) {
  let best = choices[0], bd = Infinity;
  for (const id of choices) {
    const c = BLOCKS[id].color;
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function parseLen(v) {
  if (v == null) return NaN;
  const m = /^\s*(-?[\d.]+)\s*(m|ft|')?/i.exec(String(v).replace(',', '.'));
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] && m[2] !== 'm' ? n * 0.3048 : n;
}
const DEFAULT_H = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 9, bungalow: 4, residential: 12, apartments: 15,
  garage: 3, garages: 3, shed: 3, carport: 3, hut: 3, roof: 5, kiosk: 3, service: 4,
  church: 20, cathedral: 30, chapel: 10, commercial: 16, office: 20, retail: 10, supermarket: 7, hotel: 22,
  industrial: 9, warehouse: 9, school: 12, university: 15, hospital: 18, train_station: 15, parking: 10, public: 14,
};
function buildingHeights(tags) {
  let h = parseLen(tags.height);
  const lv = parseLen(tags['building:levels']);
  const rh = parseLen(tags['roof:height']);
  if (!(h > 0)) {
    if (lv > 0) h = lv * 3.2 + (rh > 0 ? rh : (parseLen(tags['roof:levels']) > 0 ? parseLen(tags['roof:levels']) * 3 : 0));
    else h = DEFAULT_H[tags.building] || DEFAULT_H[tags['building:part']] || 10;
  }
  let min = parseLen(tags.min_height);
  if (!(min >= 0)) { const ml = parseLen(tags['building:min_level']); min = ml > 0 ? ml * 3.2 : 0; }
  return { h: Math.max(2, h), min: Math.max(0, Math.min(min, h - 1)) };
}
function wallStyle(tags, h, id) {
  const mat = (tags['building:material'] || '').toLowerCase();
  const col = parseColour(tags['building:colour'] || tags['building:color']);
  const r = hash(id % 100000, Math.floor(id / 100000), 61);
  let wall, glass = B.GLASS, curtain = false;
  if (mat === 'glass' || mat === 'mirror') { curtain = true; wall = B.METAL; glass = r < 0.5 ? B.DARKGLASS : B.GLASS; }
  else if (col) { wall = nearest(col, WALL_CHOICES); if (wall === B.DARKGLASS) { curtain = true; wall = B.METAL; glass = B.DARKGLASS; } }
  else if (mat === 'brick') wall = B.BRICK;
  else if (mat === 'concrete') wall = B.CONCRETE;
  else if (mat === 'stone' || mat === 'sandstone') wall = B.YELLOWBRICK;
  else if (mat === 'wood') wall = B.PLANKS;
  else if (mat === 'metal' || mat === 'steel') wall = B.METAL;
  else if (mat === 'plaster') wall = B.PLASTER;
  else if (h >= 45) { curtain = true; wall = r < 0.5 ? B.METAL : B.CONCRETE; glass = r < 0.3 || r > 0.75 ? B.DARKGLASS : B.GLASS; }
  else {
    const t = tags.building;
    if (t === 'industrial' || t === 'warehouse' || t === 'garage' || t === 'garages') wall = r < 0.6 ? B.METAL : B.CONCRETE;
    else if (t === 'church' || t === 'cathedral' || t === 'chapel') wall = r < 0.5 ? B.BRICK : B.YELLOWBRICK;
    else if (t === 'house' || t === 'detached' || t === 'terrace' || t === 'semidetached_house') wall = [B.BRICK, B.PLASTER, B.YELLOWBRICK, B.BRICK][Math.floor(r * 4)];
    else wall = [B.PLASTER, B.PLASTER, B.CONCRETE, B.YELLOWBRICK, B.BRICK][Math.floor(r * 5)];
  }
  const rc = parseColour(tags['roof:colour'] || tags['roof:color']);
  const shape = tags['roof:shape'];
  let roof;
  if (rc) roof = nearest(rc, ROOF_CHOICES);
  else if (shape && shape !== 'flat') roof = r < 0.6 ? B.ROOF_RED : B.ROOF_DARK;
  else roof = h >= 45 ? B.METAL : B.ROOF_DARK;
  return { wall, glass, curtain, roof };
}

// ---------- geometrie ----------
function assembleRings(lists) {
  const rings = [];
  const pool = lists.filter(l => l && l.length > 1).map(l => l.slice());
  while (pool.length) {
    let cur = pool.pop();
    let changed = true;
    while (cur[0] !== cur[cur.length - 1] && changed) {
      changed = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], end = cur[cur.length - 1];
        if (w[0] === end) cur = cur.concat(w.slice(1));
        else if (w[w.length - 1] === end) cur = cur.concat(w.slice(0, -1).reverse());
        else if (w[w.length - 1] === cur[0]) cur = w.concat(cur.slice(1));
        else if (w[0] === cur[0]) cur = w.slice().reverse().concat(cur.slice(1));
        else continue;
        pool.splice(i, 1); changed = true; break;
      }
    }
    if (cur.length > 3 && cur[0] === cur[cur.length - 1]) rings.push(cur);
  }
  return rings;
}

// Vult alle cellen waarvan het midden binnen de ringen ligt (even-oneven, dus gaten werken)
function fillRings(rings, size, cb) {
  let minZ = Infinity, maxZ = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
  const z0 = Math.max(0, Math.floor(minZ)), z1 = Math.min(size - 1, Math.ceil(maxZ));
  const xs = [];
  for (let z = z0; z <= z1; z++) {
    const y = z + 0.5;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(size - 1, Math.floor(xs[i + 1] - 0.5));
      for (let x = xa; x <= xb; x++) cb(x, z);
    }
  }
}

function strokeLine(pts, width, size, cb) {
  const hw = width / 2;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
    if (len2 < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + hw));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - hw)), z1 = Math.min(size - 1, Math.ceil(Math.max(az, bz) + hw));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, pz = z + 0.5 - az;
      let t = (px * dx + pz * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ez = pz - t * dz;
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d <= hw) cb(x, z, d, acc + t * len);
    }
    acc += len;
  }
}

function inPoly(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

const ROAD_W = {
  motorway: 14, trunk: 12, primary: 11, secondary: 10, tertiary: 8, motorway_link: 6, trunk_link: 6, primary_link: 6,
  secondary_link: 6, tertiary_link: 6, residential: 7, unclassified: 6, living_street: 5, service: 4, road: 6,
  pedestrian: 5, footway: 2, path: 2, cycleway: 2, steps: 2, track: 3, bridleway: 2,
};
const ROAD_ORDER = ['path', 'track', 'bridleway', 'footway', 'cycleway', 'steps', 'service', 'pedestrian', 'living_street', 'unclassified',
  'residential', 'road', 'tertiary_link', 'secondary_link', 'primary_link', 'trunk_link', 'motorway_link', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];

function areaInfo(tags) {
  if (tags.building || tags['building:part']) return null;
  const n = tags.natural, l = tags.landuse, le = tags.leisure;
  if (n === 'water' || tags.waterway === 'riverbank' || l === 'reservoir' || l === 'basin' || tags.water) return { b: B.WATER, p: 6 };
  if (l === 'forest' || n === 'wood') return { b: B.GRASS, p: 3, trees: 0.8 };
  if (le === 'park' || le === 'garden' || le === 'nature_reserve') return { b: B.GRASS, p: 3, trees: 0.3 };
  if (l === 'cemetery') return { b: B.GRASS, p: 3, trees: 0.25 };
  if (le === 'pitch' || le === 'playground' || le === 'golf_course' || l === 'grass' || l === 'meadow' || l === 'village_green' ||
    l === 'recreation_ground' || l === 'allotments' || l === 'orchard' || n === 'grassland' || n === 'scrub' || n === 'heath' || l === 'farmland')
    return { b: B.GRASS, p: 3, trees: n === 'scrub' ? 0.3 : 0.02 };
  if (n === 'beach' || n === 'sand') return { b: B.SAND, p: 3 };
  if (n === 'bare_rock') return { b: B.STONE, p: 3 };
  if (tags.amenity === 'parking' || l === 'garages') return { b: B.ASPHALT, p: 4 };
  if (tags.highway === 'pedestrian' || tags.place === 'square' || tags['area:highway'] === 'pedestrian') return { b: B.TILE, p: 4 };
  if (tags['area:highway']) return { b: B.ASPHALT, p: 4 };
  if (l === 'railway') return { b: B.GRAVEL, p: 2 };
  if (l === 'construction' || l === 'brownfield') return { b: B.DIRT, p: 2 };
  if (l === 'residential') return { b: B.GRASS, p: 1, trees: 0.06 };
  if (l === 'industrial' || l === 'commercial' || l === 'retail') return { b: B.CONCRETE, p: 1 };
  if (le === 'stadium' || le === 'sports_centre') return { b: B.CONCRETE, p: 2 };
  return null;
}
const isArea = (w, tags) => w.nds.length > 3 && w.nds[0] === w.nds[w.nds.length - 1] && tags.area !== 'no' &&
  !(tags.highway && tags.area !== 'yes' && !tags['area:highway']);

// ---------- omzetten naar voxels ----------
export function rasterize(osm, lat0, lon0, size, onProgress) {
  const G = REAL_GROUND;
  const mx = 111320 * Math.cos(lat0 * Math.PI / 180), mz = 110574;
  const proj = (ll) => [(ll[1] - lon0) * mx + size / 2, (lat0 - ll[0]) * mz + size / 2];
  const P = new Map();
  const pt = (id) => {
    let p = P.get(id);
    if (!p) { const ll = osm.nodes.get(id); if (!ll) return null; p = proj(ll); P.set(id, p); }
    return p;
  };
  const line = (nds) => { const out = []; for (const id of nds) { const p = pt(id); if (!p) return null; out.push(p); } return out; };
  const bboxOk = (pts, m = 0) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1]; }
    return b >= -m && a < size + m && d >= -m && c < size + m;
  };
  const wayById = new Map();
  for (const w of osm.ways) wayById.set(w.id, w);

  const N = size * size;
  const surf = new Uint8Array(N).fill(B.SIDEWALK);
  const prio = new Uint8Array(N);
  const treeD = new Float32Array(N);
  const marks = new Uint8Array(N); // 1 = weg/water: geen bomen

  // 1. vlakken
  const areas = [];
  for (const w of osm.ways) {
    const info = isArea(w, w.tags) && areaInfo(w.tags);
    if (!info) continue;
    const r = line(w.nds);
    if (r && bboxOk(r)) areas.push({ info, rings: [r] });
  }
  const buildings = [], parts = [];
  for (const r of osm.rels) {
    if (r.tags.type !== 'multipolygon') continue;
    const lists = r.members.filter(m => m.type === 'way' && wayById.has(m.ref)).map(m => wayById.get(m.ref).nds);
    const rings = assembleRings(lists).map(line).filter(Boolean);
    if (!rings.length) continue;
    if (!rings.some(rr => bboxOk(rr))) continue;
    if (r.tags.building || r.tags['building:part']) {
      (r.tags['building:part'] && !r.tags.building ? parts : buildings).push({ id: r.id, tags: r.tags, rings });
    } else {
      const info = areaInfo(r.tags);
      if (info) areas.push({ info, rings });
    }
  }
  areas.sort((a, b) => a.info.p - b.info.p);
  for (const a of areas) {
    fillRings(a.rings, size, (x, z) => {
      const i = z * size + x;
      if (a.info.p < prio[i]) return;
      prio[i] = a.info.p; surf[i] = a.info.b;
      treeD[i] = a.info.trees || 0;
      if (a.info.b === B.WATER) marks[i] = 1;
    });
  }
  onProgress?.(0.2);

  // 2. waterlopen als lijnen
  for (const w of osm.ways) {
    const ww = w.tags.waterway;
    if (!ww || ww === 'riverbank' || w.tags.tunnel === 'culvert') continue;
    const width = parseLen(w.tags.width) || (ww === 'river' ? 30 : ww === 'canal' ? 15 : ww === 'stream' ? 4 : 2);
    const l = line(w.nds);
    if (!l || !bboxOk(l, width)) continue;
    strokeLine(l, width, size, (x, z) => { const i = z * size + x; if (prio[i] < 6) { surf[i] = B.WATER; prio[i] = 6; marks[i] = 1; treeD[i] = 0; } });
  }

  // 3. wegen en spoor
  const roads = [];
  for (const w of osm.ways) {
    const hw = w.tags.highway;
    if (!hw || !(hw in ROAD_W) || w.tags.area === 'yes') continue;
    if (w.tags.tunnel && w.tags.tunnel !== 'no') continue;
    const l = line(w.nds);
    if (l && bboxOk(l, 20)) roads.push({ hw, l, tags: w.tags });
  }
  roads.sort((a, b) => ROAD_ORDER.indexOf(a.hw) - ROAD_ORDER.indexOf(b.hw));
  const bridge = new Uint8Array(N);
  for (const r of roads) {
    let width = parseLen(r.tags.width) || ROAD_W[r.hw];
    const lanes = parseLen(r.tags.lanes);
    if (lanes > 0 && !r.tags.width) width = Math.max(width, lanes * 3.2);
    const foot = width <= 2.5;
    const blk = r.hw === 'pedestrian' ? B.TILE : (r.hw === 'path' || r.hw === 'track' || r.hw === 'bridleway') ? B.GRAVEL : foot ? B.SIDEWALK : B.ASPHALT;
    const isBridge = r.tags.bridge && r.tags.bridge !== 'no';
    const marked = width >= 8 && !foot && blk === B.ASPHALT;
    strokeLine(r.l, width, size, (x, z, d, along) => {
      const i = z * size + x;
      if (surf[i] === B.WATER && !isBridge) return;
      if (isBridge && surf[i] === B.WATER) bridge[i] = 1;
      surf[i] = marked && d < 0.5 && (along % 7) < 3.5 ? B.LINE_WHITE : blk;
      marks[i] = 1; treeD[i] = 0;
      if (prio[i] < 5) prio[i] = 5;
    });
    // stoepen langs gewone wegen
    if (!foot && blk === B.ASPHALT && r.hw !== 'service' && r.hw !== 'motorway' && r.hw !== 'trunk' && !isBridge) {
      strokeLine(r.l, width + 4, size, (x, z) => {
        const i = z * size + x;
        if (prio[i] < 4 && surf[i] !== B.WATER) { surf[i] = B.SIDEWALK; marks[i] = 1; treeD[i] = 0; prio[i] = 4; }
      });
    }
  }
  const rails = [];
  for (const w of osm.ways) {
    const rw = w.tags.railway;
    if (!rw || !['rail', 'light_rail', 'narrow_gauge', 'tram', 'subway'].includes(rw)) continue;
    if (w.tags.tunnel && w.tags.tunnel !== 'no') continue;
    const l = line(w.nds);
    if (!l || !bboxOk(l, 5)) continue;
    rails.push(l);
    const tram = rw === 'tram';
    strokeLine(l, tram ? 2 : 4, size, (x, z, d) => {
      const i = z * size + x;
      if (surf[i] === B.WATER && !(w.tags.bridge && w.tags.bridge !== 'no')) return;
      if (surf[i] === B.WATER) bridge[i] = 1;
      if (tram) { if (d > 0.3 && d < 0.8) surf[i] = B.METAL; }
      else surf[i] = (d > 0.45 && d < 1.0) ? B.METAL : B.GRAVEL;
      marks[i] = 1; treeD[i] = 0;
    });
  }
  onProgress?.(0.35);

  // 4. gebouwen
  for (const w of osm.ways) {
    const tb = w.tags.building, tp = w.tags['building:part'];
    if ((!tb || tb === 'no') && (!tp || tp === 'no')) continue;
    if (w.nds.length < 4 || w.nds[0] !== w.nds[w.nds.length - 1]) continue;
    const r = line(w.nds);
    if (!r || !bboxOk(r)) continue;
    (tp && (!tb || tb === 'no') ? parts : buildings).push({ id: w.id, tags: w.tags, rings: [r] });
  }
  // omtrekken met onderdelen (building:part) weglaten: de onderdelen beschrijven het gebouw
  const centroids = parts.map(p => {
    const r = p.rings[0]; let x = 0, z = 0;
    for (const q of r) { x += q[0]; z += q[1]; }
    return [x / r.length, z / r.length];
  });
  const shown = buildings.filter(b => !centroids.some(c => b.rings.some(r => inPoly(r, c[0], c[1]))));
  const all = shown.concat(parts);
  let maxTop = 30;
  for (const b of all) { b.hm = buildingHeights(b.tags); maxTop = Math.max(maxTop, b.hm.h); }
  const H = Math.min(400, Math.ceil((G + maxTop + 14) / 8) * 8);

  const vox = new Uint8Array(N * H);
  // ondergrond + oppervlak
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, base = i * H;
    vox[base] = B.BEDROCK;
    for (let y = 1; y < G - 3; y++) vox[base + y] = B.STONE;
    for (let y = G - 3; y < G; y++) vox[base + y] = B.DIRT;
    const s = surf[i];
    if (s === B.WATER) {
      vox[base + G - 4] = B.SAND;
      for (let y = G - 3; y <= G - 1; y++) vox[base + y] = B.WATER;
      if (bridge[i]) vox[base + G] = B.CONCRETE;
    } else vox[base + G] = s;
  }
  onProgress?.(0.45);

  all.sort((a, b) => a.hm.min - b.hm.min);
  const set = (x, y, z, b) => { if (y < H) vox[(z * size + x) * H + y] = b; };
  let count = 0;
  for (const bd of all) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const r of bd.rings) for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    x0 = Math.max(0, Math.floor(x0)); z0 = Math.max(0, Math.floor(z0));
    x1 = Math.min(size - 1, Math.ceil(x1)); z1 = Math.min(size - 1, Math.ceil(z1));
    if (x1 < x0 || z1 < z0) continue;
    const bw = x1 - x0 + 1, bh = z1 - z0 + 1;
    const mask = new Uint8Array(bw * bh);
    let cells = 0;
    fillRings(bd.rings, size, (x, z) => { mask[(z - z0) * bw + (x - x0)] = 1; cells++; });
    if (!cells) continue;
    count++;
    const st = wallStyle(bd.tags, bd.hm.h, bd.id);
    const top = G + Math.max(1, Math.round(bd.hm.h));
    const yb = G + 1 + Math.round(bd.hm.min);
    const inM = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && mask[(z - z0) * bw + (x - x0)] === 1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!mask[(z - z0) * bw + (x - x0)]) continue;
      const edge = !inM(x - 1, z) || !inM(x + 1, z) || !inM(x, z - 1) || !inM(x, z + 1);
      const ex = !inM(x - 1, z) || !inM(x + 1, z);
      const t = ex ? z : x;
      const i = z * size + x;
      marks[i] = 1; treeD[i] = 0;
      if (yb === G + 1) set(x, G, z, B.TILE); else set(x, yb - 1, z, st.wall);
      for (let y = yb; y < top; y++) {
        const k = y - G;
        const lev = k % 4;
        if (edge) {
          let win;
          if (st.curtain) win = lev !== 0 && t % 4 !== 0;
          else win = (lev === 2 || lev === 3) && t % 3 === 1;
          set(x, y, z, win ? st.glass : st.wall);
        } else set(x, y, z, lev === 0 ? B.TILE : 0);
      }
      set(x, top, z, edge && bd.hm.h > 6 && !(bd.tags['roof:shape'] && bd.tags['roof:shape'] !== 'flat') ? st.wall : st.roof);
    }
  }
  onProgress?.(0.85);

  // 5. bomen
  const tset = (x, y, z, b, force) => {
    if (x < 0 || z < 0 || x >= size || z >= size || y < 0 || y >= H) return;
    const i = (z * size + x) * H + y;
    if (vox[i] === 0 || force) vox[i] = b;
  };
  const plant = (x, z) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return;
    const i = z * size + x;
    if (marks[i] || vox[i * H + G + 1]) return;
    if (vox[i * H + G] === B.WATER) return;
    vox[i * H + G] = B.GRASS;
    placeTree(x, z, G, 4 + Math.floor(hash(x, z, 14) * 3), null, tset);
    marks[i] = 1;
  };
  for (const ll of osm.trees) { const p = proj(ll); plant(Math.floor(p[0]), Math.floor(p[1])); }
  for (const w of osm.ways) {
    if (w.tags.natural !== 'tree_row') continue;
    const l = line(w.nds);
    if (!l || !bboxOk(l)) continue;
    let next = 0;
    strokeLine(l, 1, size, (x, z, d, along) => { if (along >= next) { plant(x, z); next = along + 8; } });
  }
  for (let gz = 0; gz < size; gz += 7) for (let gx = 0; gx < size; gx += 7) {
    const x = gx + 1 + Math.floor(hash(gx, gz, 11) * 5), z = gz + 1 + Math.floor(hash(gx, gz, 12) * 5);
    if (x >= size || z >= size) continue;
    const d = treeD[z * size + x];
    if (d > 0 && hash(gx, gz, 13) < d) plant(x, z);
  }
  onProgress?.(1);
  return { vox, H, ground: G, buildings: count };
}

// Bovenaanzicht (RGBA) van een voxelvolume
export function topView(vox, size, H) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const base = (z * size + x) * H;
    let y = H - 1;
    while (y > 0 && !vox[base + y]) y--;
    const c = BLOCKS[vox[base + y]].color;
    const f = 0.85 + Math.min(0.4, y / 300);
    const o = (z * size + x) * 4;
    data[o] = c[0] * f; data[o + 1] = c[1] * f; data[o + 2] = c[2] * f; data[o + 3] = 255;
  }
  return data;
}
