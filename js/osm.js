// Echte wereld: OpenStreetMap-gegevens ophalen en omzetten naar blokken.
// Werkt met Overpass-JSON en met .osm-bestanden (XML) van openstreetmap.org.

import { B, BLOCKS } from './blocks.js';
import { hash, placeTree } from './city.js';

export const REAL_GROUND = 12;
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ---------- inlezen ----------
const ENT = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
const decode = (s) => s.replace(/&(amp|quot|lt|gt|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()]);

const POI_KINDS = { street_lamp: 'lamp', traffic_signals: 'signal', bus_stop: 'bus_stop', bench: 'bench', bicycle_parking: 'bikes',
  waste_basket: 'bin', post_box: 'bin', fountain: 'fountain', telephone: 'bin' };
export function parseOSM(text) {
  const nodes = new Map(), ways = [], rels = [], trees = [], pois = [];
  const poiKind = (t) => !t ? null : POI_KINDS[t.highway] || POI_KINDS[t.amenity] || (t.public_transport === 'platform' && !t.highway ? 'bus_stop' : null);
  let bounds = null;
  const t = text.trimStart();
  if (t[0] === '{') {
    const j = JSON.parse(t);
    for (const e of j.elements || []) {
      if (e.type === 'node') {
        nodes.set(e.id, [e.lat, e.lon]);
        if (e.tags && e.tags.natural === 'tree') trees.push([e.lat, e.lon]);
        const pk = poiKind(e.tags); if (pk) pois.push([e.lat, e.lon, pk]);
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
        const pk = poiKind(tags); if (pk) pois.push([+a.lat, +a.lon, pk]);
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
  return { nodes, ways, rels, trees, pois, bounds };
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
  return fetchOSMBox(bboxFor(lat, lon, size), onStatus);
}
export function overpassQuery(b) {
  const bb = `${b.s.toFixed(6)},${b.w.toFixed(6)},${b.n.toFixed(6)},${b.e.toFixed(6)}`;
  // alleen wat de game gebruikt: veel kleinere downloads dan "alles"
  const W = ['building', 'building:part', 'highway', 'railway', 'waterway', 'natural', 'landuse', 'leisure', 'water', 'place', 'area:highway'];
  const R = ['building', 'building:part', 'natural', 'landuse', 'leisure', 'water', 'waterway', 'place'];
  return `[out:json][timeout:180][bbox:${bb}];(` +
    W.map(k => `way["${k}"];`).join('') + 'way["amenity"="parking"];' +
    R.map(k => `relation["type"="multipolygon"]["${k}"];`).join('') + 'relation["type"="multipolygon"]["amenity"="parking"];' +
    'node["natural"="tree"];node["highway"~"^(street_lamp|traffic_signals|bus_stop)$"];' +
    'node["amenity"~"^(bench|bicycle_parking|waste_basket|post_box|fountain)$"];node["public_transport"="platform"];);(._;>;);out body qt;';
}
// start: welke server eerst (verschillende downloads tegelijk verdelen over servers)
export async function fetchOSMBox(b, onStatus, start = 0) {
  const q = overpassQuery(b);
  const servers = start % 2 === 1 ? [OVERPASS[1], OVERPASS[0], OVERPASS[2], OVERPASS[3]] : OVERPASS;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of servers) {
      const host = new URL(url).host;
      const ctrl = new AbortController();
      const t0 = Date.now();
      const tick = setInterval(() => onStatus?.(`Kaartdata downloaden bij ${host}… ${Math.round((Date.now() - t0) / 1000)} s`), 1000);
      const kill = setTimeout(() => ctrl.abort(), 200000);
      try {
        onStatus?.(`Kaartdata downloaden bij ${host}…`);
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctrl.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (res.status === 429 || res.status === 503 || res.status === 504) throw Object.assign(new Error(`server bezet (${res.status})`), { busy: true });
        if (!res.ok) throw new Error(`server antwoordde ${res.status}`);
        const text = await res.text();
        if (!text.trimStart().startsWith('{')) throw Object.assign(new Error('server bezet'), { busy: true });
        onStatus?.(`Kaartdata ontvangen (${(text.length / 1e6).toFixed(1)} MB), omzetten…`);
        return text;
      } catch (e) {
        lastErr = e.name === 'AbortError' ? new Error('server reageerde niet op tijd') : e;
        onStatus?.(`${host}: ${lastErr.message}. Andere server proberen…`);
      } finally { clearInterval(tick); clearTimeout(kill); }
    }
    const wait = 10 + attempt * 15;
    for (let k = wait; k > 0; k--) { onStatus?.(`Alle servers bezet. Opnieuw proberen over ${k} s…`); await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error('OpenStreetMap kon niet bereikt worden (' + (lastErr?.message || 'netwerkfout') + ')');
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
const WALL_CHOICES = [B.PLASTER, B.YELLOWBRICK, B.BRICK, B.CONCRETE, B.ASHLAR, B.LIMESTONE, B.PANEL_WHITE, B.PANEL_DARK,
  B.BRICK_DARK, B.PLASTER_BEIGE, B.PLASTER_GREY, B.TERRACOTTA, B.PLASTER_PINK, B.COPPER, B.METAL, B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN,
  B.PAINT_ORANGE, B.PAINT_BLACK, B.PAINT_WHITE, B.STONE, B.PLANKS, B.DARKGLASS];
const ROOF_CHOICES = [B.ROOF_RED, B.ROOF_DARK, B.CONCRETE, B.METAL, B.COPPER, B.PLASTER, B.BRICK, B.TERRACOTTA];
const GLASS_CHOICES = [B.GLASS, B.GLASS_BLUE, B.GLASS_GREEN, B.MIRROR, B.DARKGLASS];
const TOWER_LOOKS = [[B.GLASS_GREEN, B.PANEL_WHITE], [B.GLASS_BLUE, B.METAL], [B.MIRROR, B.PANEL_WHITE], [B.DARKGLASS, B.PANEL_DARK], [B.GLASS, B.PANEL_WHITE], [B.GLASS_BLUE, B.PANEL_DARK]];
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
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
  house: 6, detached: 6, semidetached_house: 6, terrace: 9, bungalow: 4, residential: 12, apartments: 15,
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
  return { h: Math.max(2, h), min: Math.max(0, Math.min(min, h - 1)), explicit: parseLen(tags.height) > 0 };
}
const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'cabin', 'church', 'chapel', 'cathedral', 'barn']);
const OLD_TYPES = new Set(['train_station', 'church', 'cathedral', 'chapel', 'castle', 'palace', 'townhall', 'civic', 'museum', 'government', 'monastery', 'basilica', 'mosque', 'synagogue', 'temple']);
function isHistoric(tags) {
  if (tags.historic || tags.heritage || tags['heritage:operator'] || tags['ref:OnroerendErfgoed'] || tags.tourism === 'museum') return true;
  if (OLD_TYPES.has(tags.building) || OLD_TYPES.has(tags['building:part'])) return true;
  const y = parseInt(tags.start_date || tags['building:year'] || '', 10);
  return y > 0 && y < 1940;
}
function roofShape(tags) {
  let s = (tags['roof:shape'] || '').toLowerCase();
  if (s === 'hipped' || s === 'half-hipped' || s === 'side_hipped' || s === 'pyramidal' || s === 'gabled' || s === 'skillion' ||
    s === 'dome' || s === 'onion' || s === 'round' || s === 'mansard' || s === 'gambrel' || s === 'saltbox' || s === 'flat') {
    return s === 'half-hipped' || s === 'side_hipped' ? 'hipped' : s;
  }
  if (s === 'cone') return 'pyramidal';
  if (s) return 'hipped';
  const lv = parseLen(tags['building:levels']);
  if (HOUSE.has(tags.building) && !(lv > 4)) return 'gabled';
  if (isHistoric(tags) && !(lv > 8) && !(parseLen(tags.height) > 40)) return lv >= 3 || OLD_TYPES.has(tags.building) ? 'mansard' : 'hipped';
  return 'flat';
}
function wallStyle(tags, h, id) {
  const mat = (tags['building:material'] || '').toLowerCase();
  const col = parseColour(tags['building:colour'] || tags['building:color']);
  const r = hash(id % 100000, Math.floor(id / 100000), 61);
  let wall, glass = B.GLASS, curtain = false;
  const t = tags.building;
  const tower = h >= 45 && !isHistoric(tags);
  const look = TOWER_LOOKS[Math.floor(r * TOWER_LOOKS.length)];
  const curtainFrom = (c) => { // glas + raamstijlen afgeleid van de kleur
    curtain = true;
    glass = c ? nearest(c, GLASS_CHOICES) : look[0];
    wall = c ? (lum(c) > 150 ? B.PANEL_WHITE : lum(c) < 90 ? B.PANEL_DARK : B.METAL) : look[1];
  };
  if (mat === 'glass' || mat === 'mirror') curtainFrom(col);
  else if (col && tower && !mat) curtainFrom(col);
  else if (col) { wall = nearest(col, WALL_CHOICES); if (tower) { curtain = true; glass = look[0]; } }
  else if (mat === 'brick') wall = r < 0.7 ? B.BRICK : B.BRICK_DARK;
  else if (mat === 'concrete') wall = B.CONCRETE;
  else if (mat === 'stone' || mat === 'granite' || mat === 'marble') wall = B.ASHLAR;
  else if (mat === 'sandstone' || mat === 'limestone') wall = B.LIMESTONE;
  else if (mat === 'wood') wall = B.PLANKS;
  else if (mat === 'metal' || mat === 'steel' || mat === 'aluminium') wall = r < 0.5 ? B.METAL : B.PANEL_DARK;
  else if (mat === 'plaster') wall = [B.PLASTER, B.PLASTER_BEIGE, B.PLASTER_GREY][Math.floor(r * 3)];
  else if (isHistoric(tags)) wall = [B.BRICK, B.YELLOWBRICK, B.LIMESTONE, B.ASHLAR, B.TERRACOTTA][Math.floor(r * 5)];
  else if (tower) curtainFrom(null);
  else if (t === 'industrial' || t === 'warehouse' || t === 'garage' || t === 'garages') wall = [B.METAL, B.CONCRETE, B.PANEL_DARK][Math.floor(r * 3)];
  else if (t === 'church' || t === 'cathedral' || t === 'chapel') wall = r < 0.5 ? B.BRICK : B.YELLOWBRICK;
  else if (t === 'house' || t === 'detached' || t === 'terrace' || t === 'semidetached_house') wall = [B.BRICK, B.PLASTER, B.YELLOWBRICK, B.BRICK_DARK, B.PLASTER_BEIGE][Math.floor(r * 5)];
  else if (t === 'office' || t === 'commercial') wall = [B.PANEL_WHITE, B.CONCRETE, B.PLASTER_GREY, B.PANEL_DARK, B.LIMESTONE][Math.floor(r * 5)];
  else wall = [B.PLASTER, B.PLASTER_BEIGE, B.PLASTER_GREY, B.CONCRETE, B.YELLOWBRICK, B.BRICK, B.PLASTER_PINK][Math.floor(r * 7)];
  const rc = parseColour(tags['roof:colour'] || tags['roof:color']);
  const shape = tags['roof:shape'];
  let roof;
  const rm = (tags['roof:material'] || '').toLowerCase();
  const RM = { glass: B.GLASS, metal: B.METAL, metal_sheet: B.METAL, steel: B.METAL, zinc: B.METAL, copper: B.COPPER,
    slate: B.ROOF_DARK, roof_tiles: B.ROOF_RED, tiles: B.ROOF_RED, tile: B.ROOF_RED, concrete: B.CONCRETE, tar_paper: B.ROOF_DARK, grass: B.GRASS };
  if (rc) roof = nearest(rc, ROOF_CHOICES);
  else if (RM[rm]) roof = RM[rm];
  else if (isHistoric(tags) || shape === 'dome' || shape === 'onion' || shape === 'mansard') roof = B.ROOF_DARK;
  else if (shape && shape !== 'flat') roof = r < 0.6 ? B.ROOF_RED : B.ROOF_DARK;
  else roof = h >= 45 ? B.METAL : r < 0.5 ? B.ROOF_DARK : B.CONCRETE;
  // bij een mooie gevelkleur andere ramen: donkere gevels krijgen helder glas
  const historic = isHistoric(tags) && !curtain;
  const base = historic ? B.ASHLAR : wall;
  const trim = historic ? (wall === B.ASHLAR ? B.LIMESTONE : B.ASHLAR) : wall;
  if (historic && glass === B.GLASS) glass = B.GLASS;
  return { wall, glass, curtain, roof, historic, base, trim };
}

// ---------- bekende gebouwen ----------
// Herkend aan hun naam in OpenStreetMap. De vorm komt uit de kaart; dit voegt materiaal en details toe.
const LANDMARKS = [
  { re: /commerzbank/i, minH: 150, look: { wall: B.PANEL_WHITE, glass: B.GLASS_GREEN, curtain: true, roof: B.METAL }, gardens: true, atrium: true, antenna: 45 },
  { re: /messeturm/i, minH: 150, look: { wall: B.RED_GRANITE, glass: B.DARKGLASS, curtain: false, roof: B.PANEL_DARK }, strips: true, roofShape: 'pyramidal', roofH: 36 },
  { re: /main ?tower/i, minH: 150, look: { wall: B.METAL, glass: B.GLASS_BLUE, curtain: true, roof: B.METAL }, antenna: 50, redWhite: true },
  { re: /westend ?(tower|duo)?|kronenhochhaus|dz bank/i, minH: 150, look: { wall: B.PANEL_WHITE, glass: B.MIRROR, curtain: true, roof: B.METAL }, crown: 28 },
  { re: /opernturm/i, minH: 120, look: { wall: B.LIMESTONE, glass: B.GLASS, curtain: false, roof: B.CONCRETE }, strips: true },
  { re: /tower 185|pwc/i, minH: 120, look: { wall: B.LIMESTONE, glass: B.GLASS_GREEN, curtain: true, roof: B.CONCRETE } },
  { re: /silberturm/i, minH: 100, look: { wall: B.METAL, glass: B.MIRROR, curtain: true, roof: B.METAL } },
  { re: /trianon/i, minH: 100, look: { wall: B.PANEL_DARK, glass: B.DARKGLASS, curtain: true, roof: B.PANEL_DARK } },
  { re: /europäische zentralbank|european central bank|\bezb\b|\becb\b/i, minH: 100, look: { wall: B.METAL, glass: B.MIRROR, curtain: true, roof: B.METAL } },
  { re: /kaiserdom|bartholom/i, look: { wall: B.RED_SANDSTONE, roof: B.ROOF_DARK, historic: true }, spire: true },
  { re: /paulskirche/i, look: { wall: B.RED_SANDSTONE, roof: B.COPPER, historic: true } },
  { re: /^römer|rathaus römer/i, look: { wall: B.RED_SANDSTONE, roof: B.ROOF_DARK, historic: true } },
  { re: /alte oper/i, look: { wall: B.LIMESTONE, roof: B.ROOF_DARK, historic: true } },
  { re: /eschenheimer turm/i, look: { wall: B.ASHLAR, roof: B.ROOF_DARK, historic: true } },
  { re: /hauptbahnhof/i, look: { wall: B.LIMESTONE, roof: B.ROOF_DARK, historic: true } },
];
function findLandmark(tags, h) {
  const name = tags.name || tags['name:de'] || tags['addr:housename'] || '';
  if (!name) return null;
  for (const l of LANDMARKS) if (l.re.test(name) && !(l.minH && h < l.minH * 0.5)) return l;
  return null;
}
// Oude binnenstad van Frankfurt (Dom-Römer): vakwerkhuizen
const ALTSTADT = { s: 50.1092, n: 50.1114, w: 8.6800, e: 8.6862 };

const HOMES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'apartments', 'residential', 'bungalow', 'dormitory']);
const INHERIT = ['building', 'historic', 'heritage', 'heritage:operator', 'ref:OnroerendErfgoed', 'start_date', 'building:material',
  'building:colour', 'roof:colour', 'roof:material', 'tourism', 'name'];

// Bepaalt voor de hele kaart welke gebouwdelen bij welk gebouw horen (in lengte/breedtegraad, dus los van tegels).
export function resolveParts(osm) {
  if (osm.groups) return osm;
  const wayById = osm.wayById || new Map(osm.ways.map(w => [w.id, w]));
  const llRing = (nds) => { const out = []; for (const id of nds) { const ll = osm.nodes.get(id); if (!ll) return null; out.push(ll); } return out; };
  const outlines = [], parts = [];
  const add = (key, tags, rings) => {
    if (!rings.length) return;
    const isB = tags.building && tags.building !== 'no';
    const isP = tags['building:part'] && tags['building:part'] !== 'no' && !isB;
    if (!isB && !isP) return;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const q of rings[0]) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); }
    (isP ? parts : outlines).push({ key, tags, rings, bb: [a, b, c, d] });
  };
  for (const w of osm.ways) {
    if (w.nds.length < 4 || w.nds[0] !== w.nds[w.nds.length - 1]) continue;
    if (!w.tags.building && !w.tags['building:part']) continue;
    const r = llRing(w.nds); if (r) add('w' + w.id, w.tags, [r]);
  }
  for (const r of osm.rels) {
    if (r.tags.type !== 'multipolygon' || !(r.tags.building || r.tags['building:part'])) continue;
    const lists = r.members.filter(m => m.type === 'way' && wayById.has(m.ref)).map(m => wayById.get(m.ref).nds);
    add('r' + r.id, r.tags, assembleRings(lists).map(llRing).filter(Boolean));
  }
  const pip = (rings, la, lo) => {
    let c = false;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const A = ring[i], Bq = ring[j];
      if ((A[0] > la) !== (Bq[0] > la) && lo < (Bq[1] - A[1]) * (la - A[0]) / (Bq[0] - A[0]) + A[1]) c = !c;
    }
    return c;
  };
  osm.groupOf = new Map(); osm.hasParts = new Set(); osm.groups = new Map();
  for (const p of parts) {
    const r0 = p.rings[0]; let la = 0, lo = 0;
    for (const q of r0) { la += q[0]; lo += q[1]; }
    la /= r0.length; lo /= r0.length;
    let best = null, bestA = Infinity;
    for (const o of outlines) {
      if (la < o.bb[0] || la > o.bb[2] || lo < o.bb[1] || lo > o.bb[3]) continue;
      if (!pip(o.rings, la, lo)) continue;
      const area = (o.bb[2] - o.bb[0]) * (o.bb[3] - o.bb[1]);
      if (area < bestA) { bestA = area; best = o; }
    }
    if (!best) continue;
    osm.hasParts.add(best.key); osm.groupOf.set(p.key, best.key);
    let g = osm.groups.get(best.key);
    if (!g) {
      let ga = 0, go = 0; const ro = best.rings[0];
      for (const q of ro) { ga += q[0]; go += q[1]; }
      g = { key: best.key, id: +best.key.slice(1), tags: best.tags, lat: ga / ro.length, lon: go / ro.length, maxH: 0, maxKey: null };
      osm.groups.set(best.key, g);
    }
    const h = buildingHeights(p.tags).h;
    if (h > g.maxH) { g.maxH = h; g.maxKey = p.key; }
  }
  return osm;
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
function fillRings(rings, size, cb, clip) {
  // clip: {x0,x1,z0,z1} (inclusief); standaard het gebied 0..size-1
  const cx0 = clip ? clip.x0 : 0, cx1 = clip ? clip.x1 : size - 1, cz0 = clip ? clip.z0 : 0, cz1 = clip ? clip.z1 : size - 1;
  let minZ = Infinity, maxZ = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
  const z0 = Math.max(cz0, Math.floor(minZ)), z1 = Math.min(cz1, Math.ceil(maxZ));
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
      const xa = Math.max(cx0, Math.ceil(xs[i] - 0.5)), xb = Math.min(cx1, Math.floor(xs[i + 1] - 0.5));
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
export function rasterize(osm, lat0, lon0, size, onProgress, scale = 1, opts = {}) {
  // size = aantal blokken; scale = blokken per meter
  // opts.mx: vaste projectie (voor naadloze tegels), opts.ox/oz: globale blokpositie van deze tegel
  const G = REAL_GROUND;
  const mx = opts.mx || 111320 * Math.cos(lat0 * Math.PI / 180), mz = 110574;
  const OX = opts.ox || 0, OZ = opts.oz || 0;
  const unproj = (x, z) => [lat0 - (z - size / 2) / (mz * scale), lon0 + (x - size / 2) / (mx * scale)];
  const proj = (ll) => [(ll[1] - lon0) * mx * scale + size / 2, (lat0 - ll[0]) * mz * scale + size / 2];
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
  let wayById = osm.wayById;
  if (!wayById) { wayById = new Map(); for (const w of osm.ways) wayById.set(w.id, w); }

  const N = size * size;
  // grondhoogte per kolom uit de hoogtekaart (opts.elev: meter boven het nulpunt van de kaart)
  const elev = opts.elev;
  const gyAt = (x, z) => elev ? G + Math.max(0, Math.round(elev(...unproj(x + 0.5, z + 0.5)) * scale)) : G;
  const gy = new Int16Array(N);
  let gMax = G;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) { const v = gyAt(x, z); gy[z * size + x] = v; if (v > gMax) gMax = v; }
  const bridgeY = new Int16Array(N);
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
      buildings.push({ id: r.id, key: 'r' + r.id, tags: r.tags, rings });
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
    const width = (parseLen(w.tags.width) || (ww === 'river' ? 30 : ww === 'canal' ? 15 : ww === 'stream' ? 4 : 2)) * scale;
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
  const paths = [];          // voor verkeer: { type, pts: [x,z,...] } in tegelcoördinaten
  const lampSpots = [];      // automatische straatlantaarns
  const hasOsmLamps = (osm.pois || []).some(q => q[2] === 'lamp');
  const NO_CARS = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway']);
  const offsetLine = (l, off) => {
    const out = [];
    for (let i = 0; i < l.length; i++) {
      const a = l[Math.max(0, i - 1)], b = l[Math.min(l.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      out.push(l[i][0] - dz * off, l[i][1] + dx * off);
    }
    return out;
  };
  const inTileLine = (l) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const q of l) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
    return b > -20 && a < size + 20 && d > -20 && c < size + 20;
  };
  for (const r of roads) {
    let width = parseLen(r.tags.width) || ROAD_W[r.hw];
    const lanes = parseLen(r.tags.lanes);
    if (lanes > 0 && !r.tags.width) width = Math.max(width, lanes * 3.2);
    const foot = width <= 2.5;
    width *= scale;
    const blk = r.hw === 'pedestrian' ? B.TILE : (r.hw === 'path' || r.hw === 'track' || r.hw === 'bridleway') ? B.GRAVEL : foot ? B.SIDEWALK : B.ASPHALT;
    const isBridge = r.tags.bridge && r.tags.bridge !== 'no';
    // brugdek op de hoogte van de oevers
    const deck = isBridge ? Math.max(...r.l.map(q => gyAt(Math.floor(q[0]), Math.floor(q[1])))) : 0;
    const marked = width >= 8 * scale && !foot && blk === B.ASPHALT;
    if (inTileLine(r.l) && r.l.length >= 2) {
      if (!NO_CARS.has(r.hw) && r.hw !== 'service') {
        // rechts rijden: één rijstrook per richting
        const lane = width / 4;
        paths.push({ type: 'car', pts: offsetLine(r.l, lane) });
        if (r.tags.oneway !== 'yes') paths.push({ type: 'car', pts: offsetLine(r.l.slice().reverse(), lane) });
        paths.push({ type: 'walk', pts: offsetLine(r.l, width / 2 + 1.2 * scale) });
      } else if (r.hw === 'footway' || r.hw === 'pedestrian' || r.hw === 'path') paths.push({ type: 'walk', pts: r.l.flat() });
      if (!hasOsmLamps && !foot && blk === B.ASPHALT && !isBridge) {
        let next = 12 * scale;
        strokeLine(r.l, 1, size, (x, z, d, along) => {
          if (along < next) return;
          next = along + 28 * scale;
          lampSpots.push([x, z, r.l, along]);
        });
        r.lampOff = width / 2 + 1.2 * scale;
      }
    }
    strokeLine(r.l, width, size, (x, z, d, along) => {
      const i = z * size + x;
      if (surf[i] === B.WATER && !isBridge) return;
      if (isBridge && (surf[i] === B.WATER || bridge[i])) { bridge[i] = 1; bridgeY[i] = Math.max(bridgeY[i], deck); }
      surf[i] = marked && d < 0.5 * scale && (along % (7 * scale)) < 3.5 * scale ? B.LINE_WHITE : blk;
      marks[i] = 1; treeD[i] = 0;
      if (prio[i] < 5) prio[i] = 5;
    });
    // stoepen langs gewone wegen
    if (!foot && blk === B.ASPHALT && r.hw !== 'service' && r.hw !== 'motorway' && r.hw !== 'trunk' && !isBridge) {
      strokeLine(r.l, width + 4 * scale, size, (x, z) => {
        const i = z * size + x;
        if (prio[i] < 4 && surf[i] !== B.WATER) { surf[i] = B.SIDEWALK; marks[i] = 1; treeD[i] = 0; prio[i] = 4; }
      });
    }
  }
  const rails = [];
  const poles = [];
  for (const w of osm.ways) {
    const rw = w.tags.railway;
    if (!rw || !['rail', 'light_rail', 'narrow_gauge', 'tram', 'subway'].includes(rw)) continue;
    if (w.tags.tunnel && w.tags.tunnel !== 'no') continue;
    const l = line(w.nds);
    if (!l || !bboxOk(l, 5 * scale)) continue;
    rails.push(l);
    const tram = rw === 'tram';
    if (inTileLine(l) && rw !== 'subway') paths.push({ type: tram ? 'tram' : 'train', pts: l.flat() });
    const rb = w.tags.bridge && w.tags.bridge !== 'no';
    const rdeck = rb ? Math.max(...l.map(q => gyAt(Math.floor(q[0]), Math.floor(q[1])))) : 0;
    let nextPole = 20 * scale;
    strokeLine(l, (tram ? 2 : 5) * scale, size, (x, z, d, along) => {
      const i = z * size + x;
      if (surf[i] === B.WATER && !rb) return;
      if (rb && (surf[i] === B.WATER || bridge[i])) { bridge[i] = 1; bridgeY[i] = Math.max(bridgeY[i], rdeck); }
      const ds = d / scale;
      if (tram) { if (ds > 0.3 && ds < 0.8) surf[i] = B.METAL; }
      else if (ds > 0.45 && ds < 1.0) surf[i] = B.METAL;                                         // twee rails
      else if (ds <= 0.45) surf[i] = Math.floor(along / scale) % 2 === 0 ? B.PLANKS : B.GRAVEL;     // dwarsliggers
      else surf[i] = B.GRAVEL;
      marks[i] = 1; treeD[i] = 0;
      // bovenleidingpaal om de 40 m, naast het spoor
      if (!tram && ds > 2.0 && ds < 2.6 && along >= nextPole) { nextPole = along + 40 * scale; poles.push([x, z, l, along]); }
    });
  }
  // perrons (verhoogd, met overkapping)
  const platform = new Uint8Array(N);
  for (const w of osm.ways) {
    if (w.tags.railway !== 'platform' && !(w.tags.public_transport === 'platform' && (w.tags.train === 'yes' || w.tags.railway))) continue;
    const l = line(w.nds);
    if (!l || !bboxOk(l, 10)) continue;
    const mark = (x, z) => { const i = z * size + x; platform[i] = w.tags.covered === 'no' ? 1 : 2; surf[i] = B.CONCRETE; marks[i] = 1; treeD[i] = 0; };
    if (w.nds.length > 3 && w.nds[0] === w.nds[w.nds.length - 1]) fillRings([l], size, mark);
    else strokeLine(l, (parseLen(w.tags.width) || 5) * scale, size, (x, z) => mark(x, z));
  }
  onProgress?.(0.35);

  // 4. gebouwen
  for (const w of osm.ways) {
    const tb = w.tags.building, tp = w.tags['building:part'];
    if ((!tb || tb === 'no') && (!tp || tp === 'no')) continue;
    if (w.nds.length < 4 || w.nds[0] !== w.nds[w.nds.length - 1]) continue;
    const r = line(w.nds);
    if (!r || !bboxOk(r)) continue;
    buildings.push({ id: w.id, key: 'w' + w.id, tags: w.tags, rings: [r] });
  }
  // Omtrekken met onderdelen (building:part) weglaten: de onderdelen beschrijven het gebouw.
  // Welk deel bij welk gebouw hoort, is één keer voor de hele kaart bepaald (resolveParts).
  resolveParts(osm);
  const all = [];
  for (const b of buildings) {
    if (osm.hasParts.has(b.key)) continue;
    const isPart = b.tags['building:part'] && b.tags['building:part'] !== 'no' && (!b.tags.building || b.tags.building === 'no');
    const gk = osm.groupOf.get(b.key);
    if (gk) {
      const g = osm.groups.get(gk);
      b.group = g; b.styleId = g.id;
      const extra = {};
      for (const k of INHERIT) if (g.tags[k] != null && b.tags[k] == null) extra[k] = g.tags[k];
      b.tags = { ...extra, ...b.tags };
    } else if (isPart && !b.tags.building) b.tags = { building: 'yes', ...b.tags };
    all.push(b);
  }
  let maxTop = 30;
  for (const b of all) { b.hm = buildingHeights(b.tags); maxTop = Math.max(maxTop, b.hm.h); }
  const H = Math.min(700, Math.ceil((gMax + maxTop * scale + 20 + 14 * scale) / 8) * 8);

  const vox = new Uint8Array(N * H);
  // ondergrond + oppervlak
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, base = i * H, g = gy[i];
    vox[base] = B.BEDROCK;
    for (let y = 1; y < g - 3; y++) vox[base + y] = B.STONE;
    for (let y = Math.max(1, g - 3); y < g; y++) vox[base + y] = B.DIRT;
    const s = surf[i];
    if (s === B.WATER || bridge[i]) {
      vox[base + g - 4] = B.SAND;
      for (let y = g - 3; y <= g - 1; y++) vox[base + y] = B.WATER;
      vox[base + g] = 0;
      if (bridge[i]) { const dy = Math.max(g + 1, bridgeY[i] || g + 1); vox[base + dy] = s === B.WATER ? B.CONCRETE : s; vox[base + dy - 1] = B.CONCRETE; }
    } else vox[base + g] = s;
  }
  onProgress?.(0.45);

  all.sort((a, b) => a.hm.min - b.hm.min);
  const set = (x, y, z, b) => { if (y > 0 && y < H && x >= 0 && z >= 0 && x < size && z < size) vox[(z * size + x) * H + y] = b; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // verdiepingsraster (absolute rijen vanaf straatniveau), gedeeld door alle delen van één gebouw
  const gridCache = new Map();
  const makeGrid = (storey, firstMul) => {
    const n = H;
    const kind = new Int8Array(n), idx = new Int16Array(n);
    let start = 0;
    for (let i = 1; start < n; i++) {
      const end = Math.min(n, Math.max(start + 2, Math.round(storey * firstMul + (i - 1) * storey)));
      const hs = end - start;
      for (let r = start; r < end; r++) {
        const l = r - start;
        kind[r] = l === hs - 1 ? -1 : (hs <= 3 ? 1 : (l >= 1 && l <= hs - 2 ? 1 : 0));
        idx[r] = i - 1;
      }
      start = end;
    }
    return { kind, idx };
  };
  const gridFor = (bd, hist, wallH) => {
    const src = bd.group ? bd.group.tags : bd.tags;
    const gh = parseLen(src.height), glv = parseLen(src['building:levels']);
    let storey = (hist ? 4.8 : 3) * scale;
    if (bd.group && gh > 0 && glv > 0) storey = hist ? clamp(gh * scale / glv, 3 * scale, 7 * scale) : clamp(gh * scale / glv, 2.6 * scale, 3.6 * scale);
    else if (!bd.group) {
      const lv = parseLen(bd.tags['building:levels']);
      if (lv >= 1) storey = hist ? clamp(wallH / lv, 3 * scale, 7 * scale) : clamp(wallH / lv, 2.6 * scale, 3.6 * scale);
    }
    const tall = bd.group ? (gh > 14 || bd.group.maxH > 14) : wallH > 14 * scale;
    const firstMul = (hist || (tall && !HOUSE.has(bd.tags.building))) ? 1.4 : 1;
    const k = storey.toFixed(2) + ':' + firstMul;
    if (!gridCache.has(k)) gridCache.set(k, makeGrid(storey, firstMul));
    return gridCache.get(k);
  };

  // stap 1: elk gebouw(deel) opmeten
  const prep = (bd) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const r of bd.rings) for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    // het hele gebouw wordt berekend (ook buiten deze tegel), zodat daken en details over tegelgrenzen kloppen
    x0 = Math.floor(x0) - 1; z0 = Math.floor(z0) - 1; x1 = Math.ceil(x1) + 1; z1 = Math.ceil(z1) + 1;
    if (x1 < 0 || z1 < 0 || x0 >= size || z0 >= size) return null;
    if (x1 - x0 > 1200 || z1 - z0 > 1200) return null;
    const bw = x1 - x0 + 1, bh = z1 - z0 + 1;
    const mask = new Uint8Array(bw * bh);
    let cells = 0, sx = 0, sz = 0, inTile = 0;
    fillRings(bd.rings, size, (x, z) => {
      mask[(z - z0) * bw + (x - x0)] = 1; cells++; sx += x; sz += z;
      if (x >= 0 && z >= 0 && x < size && z < size) inTile++;
    }, { x0, x1, z0, z1 });
    if (!inTile) return null;
    const inM = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && mask[(z - z0) * bw + (x - x0)] === 1;
    const cx = sx / cells, cz = sz / cells;
    let cxx = 0, czz = 0, cxz = 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (mask[(z - z0) * bw + (x - x0)]) {
      cxx += (x - cx) ** 2; czz += (z - cz) ** 2; cxz += (x - cx) * (z - cz);
    }
    let th = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    if ((bd.tags['roof:orientation'] || '') === 'across') th += Math.PI / 2;
    const bx = -Math.sin(th), bz = Math.cos(th);
    let pmin = Infinity, pmax = -Infinity;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (mask[(z - z0) * bw + (x - x0)]) {
      const pr = (x - cx) * bx + (z - cz) * bz; if (pr < pmin) pmin = pr; if (pr > pmax) pmax = pr;
    }
    const halfShort = Math.max(0.5, (pmax - pmin) / 2 + 0.5);
    const dist = new Float32Array(bw * bh);
    for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? 1e9 : 0;
    const D2 = Math.SQRT2;
    const dAt = (x, z) => (x < 0 || z < 0 || x >= bw || z >= bh) ? 0 : dist[z * bw + x];
    for (let z = 0; z < bh; z++) for (let x = 0; x < bw; x++) {
      const i = z * bw + x; if (!mask[i]) continue;
      dist[i] = Math.min(dist[i], dAt(x - 1, z) + 1, dAt(x, z - 1) + 1, dAt(x - 1, z - 1) + D2, dAt(x + 1, z - 1) + D2);
    }
    let dMax = 1;
    for (let z = bh - 1; z >= 0; z--) for (let x = bw - 1; x >= 0; x--) {
      const i = z * bw + x; if (!mask[i]) continue;
      dist[i] = Math.min(dist[i], dAt(x + 1, z) + 1, dAt(x, z + 1) + 1, dAt(x + 1, z + 1) + D2, dAt(x - 1, z + 1) + D2);
      if (dist[i] > dMax) dMax = dist[i];
    }

    const grp = bd.group;
    const lm = grp ? findLandmark(grp.tags, grp.maxH) : findLandmark(bd.tags, bd.hm.h);
    const tallest = !grp || grp.maxKey === bd.key;
    const hTot = bd.hm.h * scale, minH = bd.hm.min * scale;
    const shape = (lm && lm.roofShape && tallest && !bd.tags['roof:shape']) ? lm.roofShape : roofShape(bd.tags);
    let roofH = 0;
    if (shape !== 'flat') {
      const tagH = parseLen(bd.tags['roof:height']), tagL = parseLen(bd.tags['roof:levels']);
      if (tagH > 0) roofH = tagH * scale;
      else if (lm && lm.roofH && tallest) roofH = lm.roofH * scale;
      else if (tagL > 0) roofH = tagL * 3 * scale;
      else if (shape === 'dome' || shape === 'onion') roofH = dMax;
      else if (shape === 'round') roofH = halfShort;
      else if (shape === 'pyramidal') roofH = halfShort * 1.2;
      else roofH = Math.min(halfShort * 0.85, 9 * scale);
      if (!bd.hm.explicit) roofH = Math.min(roofH, 14 * scale);
      else roofH = Math.max(0, Math.min(roofH, hTot - minH - 1));
    }
    // nulpunt van het gebouw: laagste grond onder het gebouw (delen van één gebouw: midden van het hele gebouw)
    let baseG = Infinity;
    if (grp) { const pp = proj([grp.lat, grp.lon]); baseG = gyAt(Math.floor(pp[0]), Math.floor(pp[1])); }
    else {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (!mask[(z - z0) * bw + (x - x0)]) continue;
        const v = (x >= 0 && z >= 0 && x < size && z < size) ? gy[z * size + x] : gyAt(x, z);
        if (v < baseG) baseG = v;
      }
    }
    if (!Number.isFinite(baseG)) baseG = G;
    const top = baseG + Math.max(1, Math.round(hTot + (bd.hm.explicit ? 0 : roofH)));
    const wallTop = top - Math.round(roofH);
    const yb = baseG + 1 + Math.round(minH);
    const roofY = new Int16Array(bw * bh);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = (z - z0) * bw + (x - x0);
      if (!mask[i]) continue;
      let f = 0;
      if (shape === 'gabled' || shape === 'gambrel' || shape === 'saltbox') {
        const pr = (x - cx) * bx + (z - cz) * bz;
        f = 1 - Math.abs(pr - (pmin + pmax) / 2) / halfShort;
      } else if (shape === 'round') {
        const pr = (x - cx) * bx + (z - cz) * bz;
        const u = Math.min(1, Math.abs(pr - (pmin + pmax) / 2) / halfShort);
        f = Math.sqrt(1 - u * u);
      } else if (shape === 'skillion') {
        const pr = (x - cx) * bx + (z - cz) * bz;
        f = (pr - pmin) / Math.max(1, pmax - pmin);
      } else if (shape !== 'flat') {
        const t = Math.min(1, Math.max(0, (dist[i] - 0.5) / Math.max(0.5, dMax - 0.5)));
        if (shape === 'dome' || shape === 'onion') f = Math.sqrt(1 - (1 - t) * (1 - t));
        else if (shape === 'mansard') f = Math.min(1, t * 1.7);
        else f = t;
      }
      roofY[i] = wallTop + Math.round(roofH * Math.max(0, Math.min(1, f)));
    }

    const st = wallStyle(bd.tags, grp ? grp.maxH : bd.hm.h, bd.styleId ?? bd.id);
    if (lm) { Object.assign(st, lm.look); if (lm.look.historic) { st.base = B.ASHLAR; st.trim = lm.look.wall === B.RED_SANDSTONE ? B.RED_SANDSTONE : B.ASHLAR; } }
    const cll = unproj(cx, cz);
    const altstadt = cll[0] > ALTSTADT.s && cll[0] < ALTSTADT.n && cll[1] > ALTSTADT.w && cll[1] < ALTSTADT.e && !lm && bd.hm.h < 25;
    if (altstadt && (shape !== 'flat' || st.historic)) {
      st.historic = true; st.wall = B.HALF_TIMBER; st.base = B.RED_SANDSTONE; st.trim = B.PLANKS; st.roof = B.ROOF_DARK; st.curtain = false;
    }
    // middelpunt van het hele gebouw (voor tuinen en antenne)
    let gcx = cx, gcz = cz;
    if (grp) { const pp = proj([grp.lat, grp.lon]); gcx = pp[0]; gcz = pp[1]; }
    const grid = gridFor(bd, st.historic, wallTop - yb);
    // gevel-details
    const type = bd.tags.building, lvT = parseLen(bd.tags['building:levels']);
    const hb = hash(bd.id % 100000, Math.floor(bd.id / 100000), 91);
    const shop = !lm && !st.curtain && !HOUSE.has(type) && yb === baseG + 1 &&
      (bd.tags.shop || type === 'retail' || type === 'commercial' || (((lvT >= 3) || bd.hm.h >= 10) && hb < 0.55 && ['apartments', 'residential', 'yes', 'mixed', 'office'].includes(type)));
    const balcony = !lm && !st.curtain && (type === 'apartments' || type === 'residential') && hash(bd.id, 7, 92) < 0.5;
    const recess = !st.curtain && !(lm && lm.strips);
    const darkWall = [B.BRICK, B.BRICK_DARK, B.YELLOWBRICK, B.TERRACOTTA, B.RED_SANDSTONE, B.HALF_TIMBER].includes(st.wall);
    st.sill = st.historic ? st.trim : darkWall ? B.LIMESTONE : [B.PLASTER, B.PLASTER_BEIGE, B.PLASTER_PINK].includes(st.wall) ? B.PANEL_WHITE : B.CONCRETE;
    const awning = [B.PAINT_RED, B.PAINT_GREEN, B.PAINT_BLUE, B.PAINT_ORANGE, B.PAINT_BLACK, B.PAINT_WHITE][Math.floor(hash(bd.id, 3, 93) * 6)];
    return { bd, x0, z0, x1, z1, bw, bh, mask, inM, dist, dMax, cx, cz, gcx, gcz, shape, roofH, top, wallTop, yb, baseG, roofY, st, lm, tallest, grid, hTot,
      shop, balcony, recess, awning, cells, house: HOUSE.has(type) };
  };

  const covLo = new Int16Array(N).fill(32767), covHi = new Int16Array(N).fill(-1), covGrp = new Int32Array(N).fill(-1);
  const grpNum = new Map();
  const preps = [];
  for (const bd of all) {
    const g = prep(bd);
    if (!g) continue;
    const gk = bd.group ? bd.group.key : 'own:' + bd.key;
    if (!grpNum.has(gk)) grpNum.set(gk, grpNum.size + 1);
    g.gnum = grpNum.get(gk);
    preps.push(g);
    for (let z = Math.max(0, g.z0); z <= Math.min(size - 1, g.z1); z++) for (let x = Math.max(0, g.x0); x <= Math.min(size - 1, g.x1); x++) {
      if (!g.mask[(z - g.z0) * g.bw + (x - g.x0)]) continue;
      const i = z * size + x;
      if (g.yb < covLo[i]) covLo[i] = g.yb;
      if (g.wallTop - 1 > covHi[i]) covHi[i] = g.wallTop - 1;
      covGrp[i] = g.gnum;
    }
  }

  // stap 2: bouwen
  let count = 0;
  const winEvery = 2 + scale;
  for (const g of preps) {
    count++;
    const { bd, x0, z0, x1, z1, bw, mask, inM, dist, dMax, st, lm, grid, yb, wallTop, roofY } = g;
    const hist = st.historic;
    const pitched = g.shape !== 'flat';
    const ryAt = (x, z) => inM(x, z) ? roofY[(z - z0) * bw + (x - x0)] : wallTop - 1;
    const baseG = g.baseG;
    const topRow = grid.idx[Math.max(0, Math.min(grid.idx.length - 1, wallTop - baseG - 2))];
    const later = []; // details buiten de eigen kolom (verzonken ramen, luifels, balkons, dakranden)
    const freeOut = (x, y, z) => x >= 0 && z >= 0 && x < size && z < size && !(covLo[z * size + x] <= y && covHi[z * size + x] >= y) && y > gy[z * size + x];
    const distAt = (x, z) => inM(x, z) ? dist[(z - z0) * bw + (x - x0)] : 0;

    // antenne, kroon (alleen op het hoogste deel)
    if (lm && g.tallest && (lm.antenna || lm.crown)) {
      const ax = Math.round(g.cx), az = Math.round(g.cz);
      let peak = wallTop;
      for (let i = 0; i < mask.length; i++) if (mask[i] && roofY[i] > peak) peak = roofY[i];
      if (lm.antenna && inM(ax, az)) {
        const len = Math.round(lm.antenna * scale);
        for (let k = 1; k <= len; k++) set(ax, peak + k, az, lm.redWhite ? (Math.floor(k / (3 * scale)) % 2 ? B.PAINT_RED : B.PAINT_WHITE) : B.POST);
        set(ax, peak + len + 1, az, B.LAMP);
      }
      if (lm.crown) {
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const mi2 = (z - z0) * bw + (x - x0);
          if (!mask[mi2] || dist[mi2] > 1.5 || (x + z) % 2) continue;
          const len = Math.round(lm.crown * scale * (0.6 + 0.4 * (1 - Math.abs(Math.cos(Math.atan2(z - g.cz, x - g.cx) * 3)))));
          for (let k = 1; k <= len; k++) set(x, wallTop + k, z, B.POST);
        }
      }
    }

    // toestand van een buurcel op hoogte y: 0 = buiten, 1 = zelfde gebouw (open), 2 = ander gebouw (gesloten muur)
    const nState = (nx, nz, y) => {
      if (inM(nx, nz)) return 1;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) return 0;
      const j = nz * size + nx;
      if (covLo[j] <= y && covHi[j] >= y) return covGrp[j] === g.gnum ? 1 : 2;
      return 0;
    };

    for (let z = Math.max(0, z0); z <= Math.min(size - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(size - 1, x1); x++) {
      const mi = (z - z0) * bw + (x - x0);
      if (!mask[mi]) continue;
      const i = z * size + x;
      marks[i] = 1; treeD[i] = 0;
      const dIn = dist[mi];
      // vloer onder het onderste niveau
      // fundering tot op het terrein, vloer op het nulpunt
      for (let y = gy[i] + 1; y < baseG; y++) set(x, y, z, st.base || st.wall);
      // zwevend gebouwdeel zonder iets eronder (onderste verdiepingen staan alleen in de omtrek): tot op de grond
      const ybCol = (yb > baseG + 1 && covLo[i] >= yb) ? baseG + 1 : yb;
      if (ybCol === baseG + 1) set(x, baseG, z, B.TILE);
      else set(x, ybCol - 1, z, covLo[i] < ybCol ? B.TILE : st.wall);
      let sector = -1;
      if (lm && lm.gardens) sector = Math.floor(((Math.atan2(z - g.gcz, x - g.gcx) + Math.PI) / (2 * Math.PI)) * 3) % 3;
      let lastExt = false;
      for (let y = ybCol; y < wallTop; y++) {
        const r = y - baseG - 1;
        const kind = r >= 0 && r < grid.kind.length ? grid.kind[r] : 0;
        const si = r >= 0 && r < grid.idx.length ? grid.idx[r] : 0;
        let ext = false, extX = false, party = false;
        const s0 = nState(x - 1, z, y), s1 = nState(x + 1, z, y), s2 = nState(x, z - 1, y), s3 = nState(x, z + 1, y);
        if (s0 === 0 || s1 === 0) { ext = true; extX = true; }
        if (s2 === 0 || s3 === 0) ext = true;
        if (s0 === 2 || s1 === 2 || s2 === 2 || s3 === 2) party = true;
        lastExt = ext;
        const t = extX ? z + OZ : x + OX;
        // tuinen (Commerzbank): per 4 verdiepingen draait de tuin naar een andere zijde.
        // Gevel en vloeren blijven gewoon staan; op de vloeren groeit gras met struiken.
        let gardenRow = false;
        if (sector >= 0 && si >= 4 && si < topRow - 1) {
          const band = Math.floor((si - 4) / 4);
          gardenRow = band % 3 === sector && dIn <= 9 * scale && !ext && !party;
        }
        if (gardenRow) {
          if (kind === -1) set(x, y, z, B.GRASS);
          else if (r > 0 && grid.kind[r - 1] === -1 && hash(x + OX, z + OZ, y) < 0.22) set(x, y, z, B.LEAVES);
          else set(x, y, z, 0);
          continue;
        }
        if (ext) {
          let win, blk = st.wall;
          if (st.curtain) win = kind !== -1 && t % winEvery !== 0;
          else if (lm && lm.strips) win = kind !== -1 && t % 3 !== 0;
          else if (hist) {
            const p = t % (4 * scale);
            win = kind === 1 && p >= scale && p < 3 * scale;
            if (kind === -1) blk = st.trim;
            else if (si === 0) blk = st.base;
          } else win = kind === 1 && (t % winEvery) >= 1 && (t % winEvery) <= scale;
          const out = s0 === 0 ? [-1, 0] : s1 === 0 ? [1, 0] : s2 === 0 ? [0, -1] : [0, 1];
          const winCol = hist ? ((t % (4 * scale)) >= scale && (t % (4 * scale)) < 3 * scale) : ((t % winEvery) >= 1 && (t % winEvery) <= scale);
          // winkelpui op de begane grond, met luifel erboven
          if (g.shop && si === 0) {
            win = kind !== -1 && t % (4 * scale) !== 0 && y > yb;
            if (kind === -1 && freeOut(x + out[0], y, z + out[1])) later.push([x + out[0], y, z + out[1], g.awning]);
          }
          // vensterbank onder elk raam
          if (!st.curtain && !win && winCol && r + 1 < grid.kind.length && grid.kind[r + 1] === 1 && kind !== 1 && !(g.shop && si === 0)) blk = st.sill;
          // balkons bij appartementen
          if (g.balcony && kind === -1 && si >= 1 && winCol && freeOut(x + out[0], y, z + out[1]) && freeOut(x + out[0], y + 1, z + out[1])) {
            later.push([x + out[0], y, z + out[1], B.CONCRETE], [x + out[0], y + 1, z + out[1], B.GLASS]);
          }
          // ramen iets dieper in de gevel
          if (win && g.recess && !(g.shop && si === 0)) {
            const ix = x - out[0], iz = z - out[1];
            if (distAt(ix, iz) >= 1.9) { set(x, y, z, 0); later.push([ix, y, iz, st.glass, true]); continue; }
          }
          set(x, y, z, win ? st.glass : blk);
        } else if (party) {
          set(x, y, z, kind === -1 ? B.TILE : st.wall);           // gesloten muur tegen het buurgebouw
        } else {
          // binnen: op elke verdieping een vloer (kleine open vide bij het atrium)
          const atrium = lm && lm.atrium && !bd.group && dIn > dMax - 3 * scale;
          if (kind === -1 && !atrium) { set(x, y, z, B.TILE); continue; }
          // meubels op de vloer, vooral bij de ramen (zichtbaar van buiten)
          if (r > 0 && grid.kind[r - 1] === -1 && dIn <= 4 * scale && !atrium) {
            const hv = hash(x + OX, z + OZ, y * 7 + 3);
            const home = HOMES.has(bd.tags.building);
            let f = 0;
            if (home) f = hv < 0.025 ? B.PAINT_WHITE : hv < 0.05 ? B.PLANKS : hv < 0.062 ? B.PAINT_RED : hv < 0.072 ? B.LEAVES : 0;
            else f = hv < 0.06 ? B.PLANKS : hv < 0.075 ? B.LEAVES : hv < 0.085 ? B.PAINT_BLACK : 0;
            set(x, y, z, f);
            continue;
          }
          set(x, y, z, 0);
        }
      }
      // een ander deel van hetzelfde gebouw gaat hier verder omhoog: vloer in plaats van dak
      if (covHi[i] > wallTop) { set(x, wallTop, z, B.TILE); continue; }
      const edge = lastExt || wallTop <= yb;
      if (hist && edge && wallTop - 1 > yb) set(x, wallTop - 1, z, st.trim);
      if (!pitched) {
        set(x, wallTop, z, edge && g.hTot > 6 * scale ? (hist ? st.trim : st.wall) : st.roof);
        // installaties op grote platte daken
        if (!lm && g.cells > 250 && dIn >= 3 * scale && hash(x + OX, z + OZ, 95) < 0.012) {
          for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) if (inM(x + dx, z + dz)) { set(x + dx, wallTop + 1, z + dz, B.METAL); set(x + dx, wallTop + 2, z + dz, B.METAL); }
        }
        continue;
      }
      const ry = roofY[mi];
      const low = Math.min(ryAt(x - 1, z), ryAt(x + 1, z), ryAt(x, z - 1), ryAt(x, z + 1));
      if (edge) for (let y = wallTop; y < ry; y++) set(x, y, z, st.wall);
      // dakrand die uitsteekt
      if (edge && ry <= wallTop + 1) for (const [ex, ez] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!inM(x + ex, z + ez) && freeOut(x + ex, wallTop, z + ez)) later.push([x + ex, wallTop, z + ez, st.roof]);
      }
      // schoorsteen op huizen
      if (g.house && dIn >= 1.5 && dIn <= 3 && hash(x + OX, z + OZ, 96) < 0.04) { set(x, ry + 1, z, B.BRICK); set(x, ry + 2, z, B.BRICK); }
      for (let y = Math.max(wallTop, Math.min(ry, low + 1)); y <= ry; y++) set(x, y, z, st.roof);
      if (wallTop > yb && !edge) set(x, wallTop, z, B.PLANKS);
    }
    for (const [lx, ly, lz, lb, force] of later) {
      if (lx < 0 || lz < 0 || lx >= size || lz >= size || ly <= 0 || ly >= H) continue;
      const k = (lz * size + lx) * H + ly;
      if (force || !vox[k]) vox[k] = lb;
    }
  }
  onProgress?.(0.85);

  // 4b. straatmeubilair
  const gyc = (x, z) => gy[Math.max(0, Math.min(size - 1, z)) * size + Math.max(0, Math.min(size - 1, x))];
  const free = (x, z) => x >= 0 && z >= 0 && x < size && z < size && !vox[(z * size + x) * H + gyc(x, z) + 1] && vox[(z * size + x) * H + gyc(x, z)] !== B.WATER && vox[(z * size + x) * H + gyc(x, z)] !== 0;
  const nearSidewalk = (x, z, rad) => {
    for (let r = 0; r <= rad; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const xx = x + dx, zz = z + dz;
      if (!free(xx, zz)) continue;
      const b = vox[(zz * size + xx) * H + gyc(xx, zz)];
      if (b === B.SIDEWALK || b === B.TILE || b === B.GRASS || b === B.COBBLE) return [xx, zz];
    }
    return null;
  };
  const lamp = (x, z) => { const g0 = gyc(x, z); for (let k = 1; k <= 4 * scale; k++) set(x, g0 + k, z, B.POST); set(x, g0 + 4 * scale + 1, z, B.LAMP); };
  for (const [la, lo, kind] of (osm.pois || [])) {
    const q = proj([la, lo]); let x = Math.floor(q[0]), z = Math.floor(q[1]);
    if (x < 0 || z < 0 || x >= size || z >= size) continue;
    if (kind === 'lamp') { const s2 = nearSidewalk(x, z, 2); if (s2) lamp(...s2); }
    else if (kind === 'signal') {
      const s2 = nearSidewalk(x, z, 8 * scale); if (!s2) continue; [x, z] = s2;
      const g0 = gyc(x, z);
      for (let k = 1; k <= 2 * scale; k++) set(x, g0 + k, z, B.POST);
      set(x, g0 + 2 * scale + 1, z, B.PAINT_GREEN); set(x, g0 + 2 * scale + 2, z, B.PAINT_ORANGE); set(x, g0 + 2 * scale + 3, z, B.PAINT_RED); set(x, g0 + 2 * scale + 4, z, B.PAINT_BLACK);
    } else if (kind === 'bench') { const s2 = nearSidewalk(x, z, 2); if (s2) { set(s2[0], gyc(...s2) + 1, s2[1], B.PLANKS); if (free(s2[0] + 1, s2[1])) set(s2[0] + 1, gyc(s2[0] + 1, s2[1]) + 1, s2[1], B.PLANKS); } }
    else if (kind === 'bin') { const s2 = nearSidewalk(x, z, 2); if (s2) set(s2[0], gyc(...s2) + 1, s2[1], kind === 'bin' ? B.PAINT_GREEN : B.METAL); }
    else if (kind === 'bikes') { const s2 = nearSidewalk(x, z, 3); if (s2) for (let k = 0; k < 4; k += 2) if (free(s2[0] + k, s2[1])) set(s2[0] + k, gyc(s2[0] + k, s2[1]) + 1, s2[1], B.METAL); }
    else if (kind === 'fountain') { if (free(x, z)) { set(x, gyc(x, z) + 1, z, B.COBBLE); set(x, gyc(x, z) + 2, z, B.WATER); } }
    else if (kind === 'bus_stop') {
      const s2 = nearSidewalk(x, z, 6 * scale); if (!s2) continue; [x, z] = s2;
      // klein bushokje: glazen achterwand, dak, bankje
      const g0 = gyc(x, z);
      for (let k = 0; k < 4; k++) {
        if (!free(x + k, z)) continue;
        for (let y = 1; y <= 2 * scale + 1; y++) set(x + k, g0 + y, z, k === 0 || k === 3 ? B.POST : B.GLASS);
        set(x + k, g0 + 2 * scale + 2, z, B.METAL);
        if (free(x + k, z + 1)) set(x + k, g0 + 2 * scale + 2, z + 1, B.METAL);
      }
      if (free(x + 1, z + 1)) set(x + 1, g0 + 1, z + 1, B.PLANKS);
    }
  }
  // automatische lantaarns langs wegen (als de kaart er geen heeft)
  for (const [x, z] of lampSpots) {
    const s2 = nearSidewalk(x, z, 7 * scale);
    if (s2) lamp(...s2);
  }

  // perrons: verhoogd, met overkapping op palen
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, pk = platform[i];
    if (!pk) continue;
    const g0 = gy[i];
    if (vox[i * H + g0 + 1]) continue;
    set(x, g0 + 1, z, B.CONCRETE);
    if (pk === 2) {
      const edgeP = !platform[i - 1] || !platform[i + 1] || !platform[i - size] || !platform[i + size];
      if (!edgeP || (x + OX) % 2 === 0) set(x, g0 + 5 * scale, z, B.METAL);
      if (!edgeP && (x + OX) % (8 * scale) === 0 && (z + OZ) % (3 * scale) === 0) for (let y = 2; y < 5 * scale; y++) set(x, g0 + y, z, B.POST);
    }
  }
  for (const [x, z] of poles) {
    if (x < 1 || z < 1 || x >= size - 1 || z >= size - 1) continue;
    const g0 = gy[z * size + x], top = g0 + 7 * scale;
    if (vox[(z * size + x) * H + g0 + 1]) continue;
    for (let y = g0 + 1; y <= top; y++) set(x, y, z, B.POST);
    // arm richting het spoor
    let best = null, bd2 = 99;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let k = 1; k <= 3; k++) {
      const b0 = vox[((z + dz * k) * size + x + dx * k) * H + gyc(x + dx * k, z + dz * k)];
      if ((b0 === B.METAL || b0 === B.PLANKS) && k < bd2) { bd2 = k; best = [dx, dz]; }
    }
    if (best) for (let k = 1; k <= 3; k++) set(x + best[0] * k, top, z + best[1] * k, B.POST);
  }

  // 5. bomen
  const tset = (x, y, z, b, force) => {
    if (x < 0 || z < 0 || x >= size || z >= size || y < 0 || y >= H) return;
    const i = (z * size + x) * H + y;
    if (vox[i] === 0 || force) vox[i] = b;
  };
  const plant = (x, z) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return;
    const i = z * size + x;
    const g0 = gy[i];
    if (marks[i] || vox[i * H + g0 + 1]) return;
    if (vox[i * H + g0] === B.WATER || !vox[i * H + g0]) return;
    vox[i * H + g0] = B.GRASS;
    placeTree(x, z, g0, 4 + Math.floor(hash(x, z, 14) * 3), null, tset);
    marks[i] = 1;
  };
  for (const ll of osm.trees) { const p = proj(ll); plant(Math.floor(p[0]), Math.floor(p[1])); }
  for (const w of osm.ways) {
    if (w.tags.natural !== 'tree_row') continue;
    const l = line(w.nds);
    if (!l || !bboxOk(l)) continue;
    let next = 0;
    strokeLine(l, 1, size, (x, z, d, along) => { if (along >= next) { plant(x, z); next = along + 8 * scale; } });
  }
  const gOff = (v) => ((v % 7) + 7) % 7;
  for (let gz = -gOff(OZ); gz < size; gz += 7) for (let gx = -gOff(OX); gx < size; gx += 7) {
    const GX = gx + OX, GZ = gz + OZ;
    const x = gx + 1 + Math.floor(hash(GX, GZ, 11) * 5), z = gz + 1 + Math.floor(hash(GX, GZ, 12) * 5);
    if (x < 0 || z < 0 || x >= size || z >= size) continue;
    const d = treeD[z * size + x];
    if (d > 0 && hash(GX, GZ, 13) < d) plant(x, z);
  }
  onProgress?.(1);
  // verkeerspaden compact maken
  // knippen tot deze tegel (lange wegen zouden anders in elke tegel opnieuw meetellen)
  const pathsOut = [];
  const inBox = (x, z) => x >= -4 && z >= -4 && x <= size + 4 && z <= size + 4;
  const surfY = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= size || zi >= size) return gyAt(xi, zi);
    const i = zi * size + xi;
    return bridge[i] ? Math.max(gy[i] + 1, bridgeY[i]) : gy[i];
  };
  for (const q of paths) {
    const src = q.pts; let run = [];
    const flush = () => { if (run.length >= 6) pathsOut.push({ type: q.type, pts: new Float32Array(run) }); run = []; };
    for (let i = 0; i + 1 < src.length; i += 2) {
      const ax = src[i], az = src[i + 1];
      if (i + 3 < src.length) {
        const bx = src[i + 2], bz = src[i + 3];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 12));
        for (let k = 0; k < steps; k++) {
          const x = ax + (bx - ax) * k / steps, z = az + (bz - az) * k / steps;
          if (inBox(x, z)) run.push(x, z, surfY(x, z)); else flush();
        }
      } else if (inBox(ax, az)) run.push(ax, az, surfY(ax, az));
    }
    flush();
  }
  return { vox, H, ground: G, buildings: count, paths: pathsOut };
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

// ---------- ruimtelijke index voor grote gebieden ----------
export function indexOSM(osm) {
  osm.wayById = new Map();
  for (const w of osm.ways) {
    osm.wayById.set(w.id, w);
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const id of w.nds) {
      const ll = osm.nodes.get(id); if (!ll) continue;
      if (ll[0] < a) a = ll[0]; if (ll[1] < b) b = ll[1]; if (ll[0] > c) c = ll[0]; if (ll[1] > d) d = ll[1];
    }
    w.bb = [a, b, c, d];
  }
  for (const r of osm.rels) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const m of r.members) {
      const w = m.type === 'way' && osm.wayById.get(m.ref); if (!w) continue;
      a = Math.min(a, w.bb[0]); b = Math.min(b, w.bb[1]); c = Math.max(c, w.bb[2]); d = Math.max(d, w.bb[3]);
    }
    r.bb = [a, b, c, d];
  }
  return resolveParts(osm);
}
export function subsetOSM(osm, s, w, n, e) {
  const hit = (bb) => bb && bb[0] <= n && bb[2] >= s && bb[1] <= e && bb[3] >= w;
  return {
    nodes: osm.nodes, wayById: osm.wayById, bounds: null,
    groups: osm.groups, groupOf: osm.groupOf, hasParts: osm.hasParts,
    ways: osm.ways.filter(x => hit(x.bb)),
    rels: osm.rels.filter(x => hit(x.bb)),
    trees: osm.trees.filter(t => t[0] >= s && t[0] <= n && t[1] >= w && t[1] <= e),
    pois: (osm.pois || []).filter(t => t[0] >= s && t[0] <= n && t[1] >= w && t[1] <= e),
  };
}

// eenvoudige versie per tegel (verre gebouwen + minikaart): per vak van 8 m de hoogte en kleur
export function computeLod(vox, T, H) {
  const c8 = 8, n = T / c8;
  const h = new Int16Array(n * n), c = new Uint8Array(n * n * 3);
  for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
    let best = 0, bestB = 0, sumY = 0, cnt = 0;
    for (let z = cz * c8; z < cz * c8 + c8; z++) for (let x = cx * c8; x < cx * c8 + c8; x++) {
      const base = (z * T + x) * H;
      let y = H - 1;
      while (y > 0 && !vox[base + y]) y--;
      sumY += y; cnt++;
      if (y > best) { best = y; bestB = vox[base + y]; }
    }
    const i = cz * n + cx;
    const avg = sumY / cnt;
    h[i] = Math.round(best - avg > 30 ? avg + (best - avg) * 0.5 : best);
    const col = BLOCKS[bestB] ? BLOCKS[bestB].color : [90, 90, 90];
    c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
  }
  return { n, h, c };
}

// kant-en-klare tegel (voorbereid bestand): 'BT1' + H + json(paden) + RLE
export function packTile(rle, H, paths) {
  const json = new TextEncoder().encode(JSON.stringify(paths.map(p => ({ t: p.type, p: Array.from(p.pts, v => Math.round(v * 10) / 10) }))));
  const out = new Uint8Array(3 + 8 + json.length + rle.length);
  out.set([66, 84, 49], 0);
  const dv = new DataView(out.buffer);
  dv.setUint32(3, H, true); dv.setUint32(7, json.length, true);
  out.set(json, 11); out.set(rle, 11 + json.length);
  return out;
}
export function unpackTile(buf) {
  const b = new Uint8Array(buf);
  if (b[0] !== 66 || b[1] !== 84 || b[2] !== 49) throw new Error('ongeldig tegelbestand');
  const dv = new DataView(b.buffer, b.byteOffset);
  const H = dv.getUint32(3, true), jl = dv.getUint32(7, true);
  const paths = JSON.parse(new TextDecoder().decode(b.subarray(11, 11 + jl))).map(p => ({ type: p.t, pts: new Float32Array(p.p) }));
  return { H, paths, rle: b.slice(11 + jl) };
}
