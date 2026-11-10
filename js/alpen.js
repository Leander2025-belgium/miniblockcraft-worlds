// Blokstad – Alpen: een wereld van 50 × 50 km (1 blok = 1 m) rond de bestaande Reuzenberg.
// De oude Reuzenberg (14 × 14 km) ligt ongewijzigd in het midden: zelfde hoogtes, pad, kabelbaan, stations,
// bossen, meer en dorp. Tegels die volledig in het oude gebied liggen, worden met de oude code gemaakt.
// Daarrond: bergketens tot 5000 m, de echte Zugspitze, Matterhorn en Mont Blanc (DEM), diepe dalen,
// meren, gletsjers, een groot spoornet met stations, steden, dorpen, kabelbanen en stoeltjesliften.
import { B } from './blocks.js';
import { hash, noise, placeTree } from './city.js';
import * as OLDM from './mountain.js';
import { rawHeight, OX, OZ, OLD, W, G, fbm, sstep, PATCHES, HEMEL } from './alpen-terrain.js';
import { LINES, LINE, STATIONS_ALL, TRACK, BED, NET } from './alpen-net.js';

export { OX, OZ, G, LINES, LINE, STATIONS_ALL, HEMEL, PATCHES };
export const T = 128, MW = W, ML = W;
export const TOFF = OX / T; // 140 tegels
export { META } from './alpen-meta.js';
import { META } from './alpen-meta.js';
const O = OLDM._internal;
const inOld = (x, z) => x >= OX && z >= OZ && x < OX + OLD && z < OZ + OLD;
const dOld = (x, z) => Math.hypot(Math.max(OX - x, 0, x - (OX + OLD)), Math.max(OZ - z, 0, z - (OZ + OLD)));

// ---------- ruimtelijke index (cellen van 512 m) ----------
class Grid {
  constructor(C = 512) { this.C = C; this.m = new Map(); }
  add(o, x0, z0, x1, z1) {
    const C = this.C;
    for (let cz = Math.floor(z0 / C); cz <= Math.floor(z1 / C); cz++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
      const k = cz * 4096 + cx; let l = this.m.get(k); if (!l) this.m.set(k, l = []); l.push(o);
    }
  }
  at(x, z) { return this.m.get(Math.floor(z / this.C) * 4096 + Math.floor(x / this.C)) || EMPTY; }
}
const EMPTY = [];

// ---------- dorpen en steden ----------
const TOWN_DEF = {
  'Reuzenberg Hauptbahnhof': { name: 'Reuzenstad', kind: 'city', r: 900 },
  Wolkendorf: { kind: 'town', r: 430 }, 'Sneeuwbrück': { kind: 'town', r: 430 }, Hemelpoort: { kind: 'town', r: 450 },
  Oostpoort: { kind: 'village', r: 300 }, Matterdorf: { kind: 'village', r: 320 }, Gletsjerdal: { kind: 'village', r: 200 },
  Oostbrug: { kind: 'village', r: 200 }, Kloosterdal: { kind: 'village', r: 220 }, Grenspas: { kind: 'village', r: 180 },
  Spiraaldorp: { kind: 'village', r: 200 }, Hemelblik: { kind: 'hamlet', r: 120 }, Gemsenkam: { kind: 'hamlet', r: 110 },
  Eibmeer: { kind: 'hamlet', r: 120 }, IJsdal: { kind: 'hamlet', r: 110 }, Zugspitzplatt: { kind: 'mountain', r: 70 },
};
export const TOWNS = [];
for (const st of STATIONS_ALL) {
  const d = TOWN_DEF[st.name]; if (!d) continue;
  // de lijn met het station
  const L = LINE[st.lines[0]], s = st.stops[0].s, p = L.at(s);
  // aan welke kant ligt het dorp? (de lagere kant, de stad ligt ten noorden van de Hauptbahnhof)
  const nx = -p.tz, nz = p.tx;
  let side;
  if (d.kind === 'city') side = nz < 0 ? 1 : -1; // noordkant
  else { const a = rawHeight(p.x + nx * 120, p.z + nz * 120), b = rawHeight(p.x - nx * 120, p.z - nz * 120); side = a < b ? 1 : -1; }
  const off = d.kind === 'city' ? 0 : d.r * 0.55;
  // het stratenplan staat haaks (noord-zuid / oost-west), zo blijven de muren recht
  const ang = Math.round(Math.atan2(p.tz, p.tx) / (Math.PI / 2)) * (Math.PI / 2);
  const t = { name: d.name || st.name, station: st.name, kind: d.kind, r: d.r, x: p.x + nx * side * off, z: p.z + nz * side * off, y: st.y, ang, side, nx: nx * side, nz: nz * side, sx: p.x, sz: p.z };
  TOWNS.push(t);
}
// afgelegen gehuchten (alleen met de kabelbaan of te voet)
const HAMLETS = [
  { name: 'Adelaarsnest', x: 34900, z: 26300, r: 90, kind: 'hamlet', remote: 'gondola' },
  { name: 'Gemsenhoek', x: 31200, z: 12600, r: 80, kind: 'hamlet', remote: 'trail' },
  { name: 'Wolkenhut', x: 7700, z: 33200, r: 60, kind: 'hamlet', remote: 'cable' },
];
for (const h of HAMLETS) { h.y = Math.round(G + rawHeight(h.x, h.z)); h.ang = 0; h.nx = 0; h.nz = 1; TOWNS.push(h); }
const townGrid = new Grid(512);
for (const t of TOWNS) townGrid.add(t, t.x - t.r - 400, t.z - t.r - 400, t.x + t.r + 400, t.z + t.r + 400);

// ---------- meren ----------
export const LAKES = [
  { name: 'Eibmeer', x: 37600, z: 6300, rx: 420, rz: 300 },
  { name: 'Wolkenmeer', x: 11300, z: 28700, rx: 520, rz: 330 },
  { name: 'Hemelmeer', x: 38200, z: 45200, rx: 600, rz: 380 },
  { name: 'Spiegelmeer', x: 42500, z: 22500, rx: 700, rz: 450 },
  { name: 'Gletsjermeer', x: 15200, z: 22800, rx: 380, rz: 260 },
];
for (const l of LAKES) {
  // waterpeil: net onder de laagste oever
  let m = 1e9; for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2; m = Math.min(m, rawHeight(l.x + Math.cos(t) * l.rx * 1.05, l.z + Math.sin(t) * l.rz * 1.05)); }
  l.h = Math.round(m - 3); l.level = G + l.h;
}
const lakeGrid = new Grid(512);
for (const l of LAKES) lakeGrid.add(l, l.x - l.rx * 1.6, l.z - l.rz * 1.6, l.x + l.rx * 1.6, l.z + l.rz * 1.6);
function lakeAt(x, z) { for (const l of lakeGrid.at(x, z)) { const d = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz); if (d < 1.6) return [l, d]; } return null; }

// ---------- kabelbanen en stoeltjesliften ----------
const peak = (P) => [P.px, P.pz];
const towardPeak = (t, P, f) => [t.x + (P[0] - t.x) * f, t.z + (P[1] - t.z) * f];
const townBy = (n) => TOWNS.find(t => t.station === n || t.name === n);
const PZ = PATCHES.find(p => p.id === 'zugspitze'), PM = PATCHES.find(p => p.id === 'matterhorn'), PB = PATCHES.find(p => p.id === 'montblanc');
const LIFT_DEF = [
  { name: 'Zugspitz-Gletsjerbahn', kind: 'cable', from: townBy('Zugspitzplatt'), fromOff: 60, to: [PZ.px + 40, PZ.pz + 30], top: 'Panoramarestaurant Zugspitze', cap: 'Zugspitze' },
  { name: 'Matterhorn-Gletsjerparadijs', kind: 'cable', from: townBy('Matterdorf'), fromOff: 120, to: towardPeak(townBy('Matterdorf'), peak(PM), 0.72), top: 'Gletsjerrestaurant Matterhorn' },
  { name: 'Aiguille-Wolkenbaan', kind: 'cable', from: townBy('Wolkendorf'), fromOff: 150, to: towardPeak(townBy('Wolkendorf'), peak(PB), 0.68), top: 'Bergstation Aiguille', mid: 'Wolkenhut' },
  { name: 'Hemelhoorn-Kabelbaan', kind: 'cable', from: townBy('Hemelpoort'), fromOff: 160, to: towardPeak(townBy('Hemelpoort'), [HEMEL.x, HEMEL.z], 0.8), top: 'Panoramarestaurant Hemeltop' },
  { name: 'Adelaarsnest-Gondel', kind: 'gondola', from: townBy('Reuzenberg Hauptbahnhof'), fromOff: -420, to: [HAMLETS[0].x, HAMLETS[0].z + 70], top: 'Adelaarsnest' },
  { name: 'Sneeuwbrück-Stoeltjeslift', kind: 'chair', from: townBy('Sneeuwbrück'), fromOff: 300, len: 1600, top: 'Skihut Sneeuwbrück' },
  { name: 'Wolkendorf-Stoeltjeslift', kind: 'chair', from: townBy('Wolkendorf'), fromOff: -260, len: 1500, top: 'Skihut Wolkendorf' },
];
export const LIFTS = [];
function liftGroundRaw(x, z) { return G + rawHeight(x, z); }
for (const d of LIFT_DEF) {
  const t = d.from; if (!t) continue;
  // dalstation: vanaf het dorp in de richting van de top
  let tx = d.to ? d.to[0] : 0, tz = d.to ? d.to[1] : 0;
  if (!d.to) {
    // stoeltjeslift: naar de steilste helling omhoog vanaf het dorp
    let best = -1e9, ba = 0;
    for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2, h = rawHeight(t.x + Math.cos(an) * (d.len + Math.abs(d.fromOff)), t.z + Math.sin(an) * (d.len + Math.abs(d.fromOff))); if (h > best) { best = h; ba = an; } }
    tx = t.x + Math.cos(ba) * (d.len + Math.abs(d.fromOff)); tz = t.z + Math.sin(ba) * (d.len + Math.abs(d.fromOff));
  }
  const ux0 = tx - t.x, uz0 = tz - t.z, l0 = Math.hypot(ux0, uz0) || 1, ux = ux0 / l0, uz = uz0 / l0;
  const off = Math.abs(d.fromOff);
  const a = [t.x + ux * off, t.z + uz * off], b = [tx, tz];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const L = { ...d, ax: a[0], az: a[1], bx: b[0], bz: b[1], ux, uz, len, from: t.name };
  L.track = d.kind === 'chair' ? 2.6 : d.kind === 'gondola' ? 3.2 : 5.5;
  L.stL = d.kind === 'chair' ? 9 : d.kind === 'gondola' ? 16 : 18; L.stW = d.kind === 'chair' ? 6 : d.kind === 'gondola' ? 9 : 11;
  L.ya = Math.round(liftGroundRaw(a[0], a[1]) + 0.5); L.yb = Math.round(liftGroundRaw(b[0], b[1]) + 0.5);
  LIFTS.push(L);
}
const liftGrid = new Grid(512);
for (const L of LIFTS) liftGrid.add(L, Math.min(L.ax, L.bx) - 60, Math.min(L.az, L.bz) - 60, Math.max(L.ax, L.bx) + 60, Math.max(L.az, L.bz) + 60);
// lokale coördinaten t.o.v. een lift: u langs de lijn (0 = dalstation), v dwars
const liftUV = (L, x, z) => { const dx = x - L.ax, dz = z - L.az; return [dx * L.ux + dz * L.uz, -dx * L.uz + dz * L.ux]; };

// ---------- het landschap ----------
// hoogte in meter boven G (zonder het spoor)
function baseHeight(x, z) {
  let h = rawHeight(x, z);
  // meren
  const lk = lakeAt(x, z);
  if (lk) { const [l, d] = lk; const bed = l.h - 1 - 14 * Math.max(0, 1 - d * d); if (d < 1) h = Math.min(h, bed); else { const k = sstep(1, 1.6, d); h = Math.min(h, l.h + 0.6 + (h - l.h) * k); } }
  // dorpen: vlak terrein (plateau) op de hoogte van het station
  for (const t of townGrid.at(x, z)) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d > t.r + 380) continue;
    const k = 1 - sstep(t.r * 0.85, t.r + 380, d), th = t.y - G;
    h = h * (1 - k) + th * k;
  }
  // kabelbaanstations
  for (const L of liftGrid.at(x, z)) {
    for (const [px, pz, py] of [[L.ax, L.az, L.ya], [L.bx, L.bz, L.yb]]) {
      const d = Math.hypot(x - px, z - pz); if (d > L.stL + 70) continue;
      const k = 1 - sstep(L.stL + 6, L.stL + 70, d); h = h * (1 - k) + (py - G) * k;
    }
  }
  return h;
}
// grove index van de spoorlijnen voor de dalen (punten om de 40 m, bereik 520 m)
const CG = new Grid(256);
for (const L of LINES) for (let i = 0; i + 10 < L.n; i += 10) {
  const R = L.tun / 0.7 + BED + 40;
  CG.add({ L, i, j: i + 10 }, Math.min(L.x[i], L.x[i + 10]) - R, Math.min(L.z[i], L.z[i + 10]) - R, Math.max(L.x[i], L.x[i + 10]) + R, Math.max(L.z[i], L.z[i + 10]) + R);
}
// dalen, sleuven en dijken langs het spoor
function railShape(x, z, h) {
  const list = CG.at(x, z);
  if (!list.length) return h;
  // per lijn het dichtste stuk
  let out = h;
  const seen = new Map();
  for (const sg of list) {
    const L = sg.L, ax = L.x[sg.i], az = L.z[sg.i], vx = L.x[sg.j] - ax, vz = L.z[sg.j] - az, L2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)), d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    const b = seen.get(L);
    if (!b || d < b.d) seen.set(L, { d, k: Math.round(sg.i + 10 * t) });
  }
  for (const [L, q] of seen) {
    const k = Math.min(L.n - 1, q.k), kind = L.kind[k];
    if (kind === 1 || kind === 3) continue; // tunnel / oud spoor: terrein blijft
    const hb = L.y[k] - 1 - G, bed = (L.single ? 2.8 : BED) + 1;
    if (q.d <= bed) { if (kind !== 2) out = Math.min(out, hb); if (kind === 0 && out < hb) out = Math.max(out, hb); continue; }
    // dalwand (afgeschuind, met wat ruis) en dijk
    const wv = 0.62 + 0.3 * noise(x / 90, z / 90, 801);
    if (out > hb) out = Math.min(out, hb + (q.d - bed) * wv);
    else if (kind === 0 && hb - out < 9) out = Math.max(out, hb - (q.d - bed) / 1.6);
  }
  return out;
}
export function natural(x, z) {
  if (inOld(x, z)) return O.natural(x - OX, z - OZ);
  let h = baseHeight(x, z);
  const d = dOld(x, z);
  if (d < 2600) { const t = sstep(0, 2600, d); h = O.natural(x - OX, z - OZ) * (1 - t) + h * t; }
  return railShape(x, z, h);
}
export function surfaceAt(x, z) {
  if (inOld(x, z)) return OLDM.surfaceAt(x - OX, z - OZ);
  return natural(x, z);
}
export const heightAt = (x, z) => G + natural(x, z);
export const groundAt = (x, z) => Math.round(G + surfaceAt(x, z));

// ---------- gebouwen ----------
// elk gebouw: assen-evenwijdige rechthoek [x0,x1]×[z0,z1], vloer F, soort, verdiepingen, kleuren
export const BLD = [];
const bldGrid = new Grid(32);
function addBld(b) {
  b.x0 = Math.round(b.x0); b.x1 = Math.round(b.x1); b.z0 = Math.round(b.z0); b.z1 = Math.round(b.z1);
  BLD.push(b); bldGrid.add(b, b.x0 - 2, b.z0 - 2, b.x1 + 2, b.z1 + 2);
}
// stratenplan per dorp (in het assenstelsel van het dorp: u langs het spoor, v ervan weg)
export const ROADS = [];
const roadGrid = new Grid(64);
function addRoad(r) { ROADS.push(r); roadGrid.add(r, Math.min(r.ax, r.bx) - 8, Math.min(r.az, r.bz) - 8, Math.max(r.ax, r.bx) + 8, Math.max(r.az, r.bz) + 8); }
const PALETTE = {
  chalet: [[B.ASHLAR, B.DARK_PLANKS, B.ROOF_DARK], [B.PLASTER, B.PLANKS, B.CLAY_ROOF], [B.PLASTER_BEIGE, B.DARK_PLANKS, B.ROOF_DARK], [B.LIMESTONE, B.PLANKS, B.ROOF_RED]],
  hotel: [[B.PLASTER_BEIGE, B.PLASTER_BEIGE, B.ROOF_DARK], [B.PLASTER, B.DARK_PLANKS, B.CLAY_ROOF], [B.PLASTER_PINK, B.PLASTER_PINK, B.ROOF_DARK]],
  apartment: [[B.PLASTER_GREY, B.PLASTER_GREY, B.CONCRETE], [B.BRICK, B.BRICK, B.CONCRETE], [B.PLASTER_BEIGE, B.PLASTER_BEIGE, B.ROOF_DARK], [B.YELLOWBRICK, B.YELLOWBRICK, B.CONCRETE]],
  shop: [[B.GLASS, B.PLASTER, B.CLAY_ROOF], [B.GLASS, B.PLASTER_BEIGE, B.ROOF_DARK], [B.GLASS, B.BRICK, B.CONCRETE]],
};
const HOTEL_NAMES = ['Hotel Alpenrose', 'Grand Hotel Edelweiss', 'Hotel Bergkristal', 'Hotel Gletsjerzicht', 'Hotel Zur Post', 'Berghotel Steinbock', 'Hotel Sonnenhof', 'Parkhotel Alpina'];
const SHOP_NAMES = ['Bakkerij', 'Sportwinkel', 'Kaasmakerij', 'Chocolaterie', 'Souvenirs', 'Apotheek', 'Boekhandel', 'Skiverhuur', 'Supermarkt', 'Horlogewinkel'];
function layoutTown(t, seed) {
  const r = (k) => hash(seed, k, 931);
  const c = Math.cos(t.ang), s = Math.sin(t.ang);
  // as van het dorp: u langs het spoor, v haaks (positief = weg van het spoor)
  const sideSign = Math.sign((t.nx * -s + t.nz * c)) || 1;
  const W2 = (u, v) => [t.x + c * u - s * v * sideSign, t.z + s * u + c * v * sideSign];
  const rect = (u0, v0, u1, v1) => { const a = W2(u0, v0), b = W2(u1, v1); return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }; };
  const road = (u0, v0, u1, v1, opt = {}) => { const a = W2(u0, v0), b = W2(u1, v1); addRoad({ ax: a[0], az: a[1], bx: b[0], bz: b[1], hw: opt.hw || 3.5, y: t.y, town: t.name, major: !!opt.major, tram: !!opt.tram, street: opt.street !== false }); };
  const F = t.y; // vloer = straatniveau
  const city = t.kind === 'city', town = t.kind === 'town', R = t.r;
  if (t.kind === 'mountain') return;
  // hoofdstraat (evenwijdig aan het spoor) en dwarsstraten
  const vMain = city ? 0 : -R * 0.55 + 46; // het spoor ligt op v ≈ -0,55 R
  const halfU = city ? R * 0.85 : R * 0.8;
  const rows = city ? [vMain - 130, vMain, vMain + 110, vMain + 220, vMain + 330] : town ? [vMain, vMain + 90, vMain + 180] : t.kind === 'village' ? [vMain, vMain + 80] : [vMain];
  rows.forEach((v, i) => road(-halfU, v, halfU, v, { hw: city && i === 1 ? 6 : 3.6, major: i <= 1, tram: city && i === 1 }));
  const step = city ? 90 : 70;
  for (let u = -Math.floor(halfU / step) * step; u <= halfU; u += step) road(u, rows[0] - (city ? 0 : 0), u, rows[rows.length - 1], { hw: 3.2 });
  // gebouwen langs de straten
  let k = 0, hotels = 0, church = false;
  for (let ri = 0; ri < rows.length; ri++) {
    const v = rows[ri];
    for (const side of [-1, 1]) {
      if (!city && ri === 0 && side < 0) continue; // spoorkant
      if (city && ri === 0 && side < 0) continue;
      for (let u = -halfU + 12; u < halfU - 12;) {
        k++;
        const cellU = Math.floor((u + halfU) / step), nearCross = ((u + halfU) % step) < 14 || ((u + halfU) % step) > step - 14;
        if (nearCross) { u += 6; continue; }
        let kind, w, dpt, floors, pal;
        const rr = r(k);
        if (city) {
          kind = rr < 0.12 ? 'hotel' : rr < 0.45 ? 'shop' : 'apartment';
          w = 18 + Math.floor(r(k + 1) * 16); dpt = 14 + Math.floor(r(k + 2) * 8); floors = kind === 'shop' ? 4 + Math.floor(r(k + 3) * 3) : 5 + Math.floor(r(k + 3) * 5);
        } else if (town) {
          kind = rr < 0.16 ? 'hotel' : rr < 0.38 ? 'shop' : 'chalet';
          w = kind === 'hotel' ? 24 + Math.floor(r(k + 1) * 10) : 11 + Math.floor(r(k + 1) * 6); dpt = kind === 'hotel' ? 14 : 10 + Math.floor(r(k + 2) * 3); floors = kind === 'hotel' ? 5 + Math.floor(r(k + 3) * 2) : 2 + Math.floor(r(k + 3) * 2);
        } else {
          kind = rr < 0.08 && hotels < 2 ? 'hotel' : rr < 0.16 ? 'shop' : 'chalet';
          w = kind === 'hotel' ? 22 : 10 + Math.floor(r(k + 1) * 5); dpt = kind === 'hotel' ? 13 : 9 + Math.floor(r(k + 2) * 3); floors = kind === 'hotel' ? 4 : 2 + Math.floor(r(k + 3) * 2);
        }
        if (kind === 'hotel') hotels++;
        // kerk: één per dorp (aan de hoofdstraat, in het midden)
        if (!church && ri === (city ? 1 : 0) && side > 0 && Math.abs(u) < step && t.kind !== 'hamlet') { kind = 'church'; w = 14; dpt = 28; floors = 3; church = true; }
        const gap = city ? 2 : 6 + Math.floor(r(k + 4) * 6);
        if (u + w > halfU - 10) break;
        const v0 = v + side * (5.5 + 3), v1 = v0 + side * dpt;
        const rc = rect(u, Math.min(v0, v1), u + w, Math.max(v0, v1));
        // niet te ver van het dorpsmidden (rond)
        const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
        if (Math.hypot(cx - t.x, cz - t.z) > R * 0.95) { u += w + gap; continue; }
        pal = kind === 'church' ? [B.PLASTER, B.PLASTER, B.ROOF_DARK] : PALETTE[kind][Math.floor(r(k + 5) * PALETTE[kind].length)];
        const b = { ...rc, kind, floors, F, gf: pal[0], uf: pal[1], roof: pal[2], town: t.name, seed: k, flat: kind === 'apartment' || (kind === 'shop' && city),
          front: side > 0 ? 'near' : 'far', frontV: v0, axis: Math.abs(c) > 0.5 ? 'x' : 'z' };
        // welke gevel is de voorkant (naar de straat)?
        const sp = W2(u + w / 2, v); const dx = sp[0] - cx, dz = sp[1] - cz;
        b.face = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'x1' : 'x0') : (dz > 0 ? 'z1' : 'z0');
        if (kind === 'hotel') b.name = HOTEL_NAMES[(seed + k) % HOTEL_NAMES.length];
        if (kind === 'shop') b.name = SHOP_NAMES[(seed * 3 + k) % SHOP_NAMES.length];
        if (kind === 'church') { b.name = 'Kerk ' + t.name; b.tower = 6; }
        addBld(b);
        u += w + gap;
      }
    }
  }
}
TOWNS.forEach((t, i) => layoutTown(t, i * 17 + 3));
// stationsgebouwen
for (const L of LINES) for (const st of L.stations) {
  if (st.old || st.hbf !== undefined) continue;
  const p = L.at(st.s), t = TOWNS.find(q => q.station === st.name);
  const sd = t ? (Math.sign(t.nx * -p.tz + t.nz * p.tx) || 1) : 1;
  const nx = -p.tz * sd, nz = p.tx * sd, off = (L.single ? 2.5 : BED) + 14;
  const cx = p.x + nx * off, cz = p.z + nz * off;
  if (BLD.some(b => b.kind === 'station' && Math.abs((b.x0 + b.x1) / 2 - cx) < 30 && Math.abs((b.z0 + b.z1) / 2 - cz) < 30)) continue;
  const alongX = Math.abs(p.tx) > Math.abs(p.tz), hw = alongX ? 14 : 7, hd = alongX ? 7 : 14;
  addBld({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, kind: 'station', floors: 2, F: st.y, gf: B.PLASTER_BEIGE, uf: B.PLASTER_BEIGE, roof: B.CLAY_ROOF, name: 'Station ' + st.name, station: st.name,
    face: alongX ? (nz > 0 ? 'z0' : 'z1') : (nx > 0 ? 'x0' : 'x1') });
}
// bergrestaurants bij de topstations
for (const L of LIFTS) {
  const ux = L.ux, uz = L.uz, d = L.stL + 16, cx = L.bx + ux * d, cz = L.bz + uz * d;
  const alongX = Math.abs(ux) > Math.abs(uz), hw = alongX ? 10 : 16, hd = alongX ? 16 : 10;
  addBld({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd, kind: L.kind === 'chair' ? 'restaurant' : 'panorama', floors: 2, F: L.yb, gf: B.GLASS, uf: B.DARK_PLANKS, roof: B.PANEL_DARK, flat: true, terrace: true, name: L.top, face: alongX ? (ux > 0 ? 'x0' : 'x1') : (uz > 0 ? 'z0' : 'z1') });
}

// ---------- Hauptbahnhof (vier sporen voor drie lijnen, perronhal, onderdoorgang, stationsgebouw) ----------
export const HBF = (() => {
  const L = LINE.AE, st = L.stations.find(s => s.hbf === 0), p = L.at(st.s);
  return { L, st, x: p.x, z: p.z, y: st.y, s0: st.s0, s1: st.s1, mid: st.s, name: st.name,
    // perrons (sd in het assenstelsel van de Alpenexpress, + = zuid)
    plat: [[4.6, 9.4, 'Perron 1'], [-10.4, -4.6, 'Perron 2-3'], [-25.4, -19.6, 'Perron 4-5'], [-39.4, -34.6, 'Perron 6']],
    north: -41, south: 11 };
})();
{
  const H = HBF, x0 = H.x - 95, x1 = H.x + 95;
  // stationsgebouw aan de noordkant met winkels en restaurants
  addBld({ x0, x1, z0: H.z - 72, z1: H.z + H.north - 1, kind: 'hbf', floors: 4, F: H.y, gf: B.GLASS, uf: B.LIMESTONE, roof: B.COPPER, flat: true, name: 'Reuzenberg Hauptbahnhof', face: 'z0' });
}

// ---------- index van de gebouwen ----------
function bldAt(x, z, pad = 0) {
  for (const b of bldGrid.at(x, z)) if (x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad) return b;
  return null;
}
function roadAt(x, z) {
  let best = null;
  for (const r of roadGrid.at(x, z)) {
    const vx = r.bx - r.ax, vz = r.bz - r.az, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - r.ax) * vx + (z - r.az) * vz) / L2));
    const d = Math.hypot(x - r.ax - vx * t, z - r.az - vz * t);
    if (d <= r.hw + 3 && (!best || d < best.d)) best = { r, d, t, s: t * Math.sqrt(L2) };
  }
  return best;
}

// ---------- zones ----------
const snowLine = (x, z) => 2900 + fbm(x / 400, z / 400, 3, 1500) * 140;
const rockLine = (x, z) => 2350 + fbm(x / 300, z / 300, 3, 1510) * 150;
const treeLine = (x, z) => 1850 + fbm(x / 260, z / 260, 3, 1520) * 120;

// ---------- kolommen ----------
let treeKind = 0;
const under = (col, top, y, mat) => { for (let k = Math.max(1, top - 3); k < y; k++) col[k] = mat; };
function strata(x, y, z) { const band = Math.floor((y + noise(x / 60, z / 60, 93) * 9) / 3) % 5; return band === 0 ? B.GRANITE : band === 2 ? B.ASHLAR : band === 4 && hash(x, z, y) < 0.5 ? B.GRAVEL : B.STONE; }
function treeSpot(x, z, s, p) { const cx = Math.floor(x / s), cz = Math.floor(z / s); return x - cx * s === Math.floor(hash(cx, cz, 41) * s) && z - cz * s === Math.floor(hash(cx, cz, 42) * s) && hash(cx, cz, 43) < p; }

// spoor: één kolom (geeft de bovenste y terug, of -1 als het spoor hier niets doet)
function railColumn(x, z, col, top, ctx) {
  let q = null;
  for (const L of ctx.lines) { const r = L.near(x, z, 40); if (r && (!q || r.d < q.d)) { r.line = L; q = r; } }
  if (!q) return -1;
  const L = q.line, by = Math.round(q.y), ad = q.d, sd = q.sd;
  if (q.kind === 3) return -1; // oud spoor (in de oude tegels)
  const single = L.single;
  const st = L.stationAt(q.s);
  // aantal sporen hier (tandradbanen hebben in de stations een kruisingsspoor)
  const two = !single || (st && q.s > st.s0 - 30 && q.s < st.s1 + 30);
  const bed = single && !two ? 2.6 : BED;
  // Hauptbahnhof apart
  if (ctx.hbf) { const h = hbfColumn(x, z, col, top); if (h >= 0) return h; }
  const kind = q.kind;
  // tunnel: uitgraven, de berg erboven blijft
  if (kind === 1) {
    if (ad > bed + 1.2) return -1;
    if (top <= by + 7) { // portaal: open sleuf tot aan de berg
      if (ad <= bed) { for (let y = by + 1; y <= top; y++) col[y] = 0; col[by] = ad < bed - 0.7 ? B.BALLAST : B.GRAVEL; col[by - 1] = B.STONE; return by; }
      for (let y = by + 1; y <= Math.max(top, by + 9); y++) col[y] = B.CONCRETE; return Math.max(top, by + 9);
    }
    if (ad <= bed) {
      col[by - 1] = B.CONCRETE; col[by] = ad < bed - 0.7 ? B.BALLAST : B.CONCRETE;
      for (let y = by + 1; y <= by + 6; y++) col[y] = 0;
      col[by + 7] = B.CONCRETE; col[by + 8] = B.CONCRETE;
      if (ad > bed - 1 && Math.round(q.s) % 24 === 0) col[by + 5] = B.LAMP;
      // portaal (betonnen kader in de bergwand)
      if (top - by < 14) for (let y = by + 9; y <= top; y++) col[y] = B.CONCRETE;
      return top;
    }
    for (let y = by - 1; y <= by + 8; y++) col[y] = B.CONCRETE; // wand
    return Math.max(top, by + 8);
  }
  // perrons
  if (st && !st.old) {
    const pIn = (single && !two ? 0 : TRACK) + 2.2, pOut = pIn + 4.2;
    if (ad > bed && ad <= pOut + 0.4) {
      under(col, top, by + 1, B.CONCRETE);
      for (let y = top + 1; y <= by; y++) col[y] = B.CONCRETE;
      for (let y = by + 2; y <= Math.max(top, by + 1); y++) col[y] = 0;
      col[by + 1] = ad < pIn + 0.6 ? B.LINE_WHITE : ad < pIn + 1.2 ? B.LINE_YELLOW : B.TILE;
      const mid = (st.s0 + st.s1) / 2, inRoof = Math.abs(q.s - mid) < st.len * 0.3;
      let t = by + 1;
      if (inRoof && ad > pIn + 1.4) {
        col[by + 5] = Math.round(q.s) % 7 === 0 ? B.METAL : B.GLASS; t = by + 5;
        if (Math.abs(ad - (pOut - 1.2)) < 0.5 && Math.round(q.s) % 8 === 0) for (let y = by + 2; y < by + 5; y++) col[y] = B.POST;
        if (Math.abs(ad - (pOut - 1.2)) < 0.5 && Math.round(q.s) % 8 === 4) col[by + 2] = B.DARK_PLANKS;
        if (Math.abs(ad - (pIn + 2.2)) < 0.5 && Math.round(q.s) % 40 === 20) { col[by + 2] = B.POST; col[by + 3] = B.PAINT_BLUE; col[by + 4] = B.PAINT_BLUE; } // stationsbord
      }
      return t;
    }
  }
  if (ad > bed + 1.4) {
    // keermuur in een sleuf
    if (ad <= bed + 2.4 && top > by + 2) { for (let y = by; y <= top; y++) col[y] = (y - by) % 4 === 0 ? B.CONCRETE : B.ASHLAR; return top; }
    return -1;
  }
  const high = by - top;
  // viaduct
  if (kind === 2 || high > 9) {
    // pijlers niet op een ander spoor
    let other = false;
    for (const L2 of ctx.lines) if (L2 !== L) { const r = L2.near(x, z, 12); if (r) { other = true; break; } }
    if (high <= 60) {
      // stenen boogbrug: bogen van 36 m
      const span = 36, u = ((q.s % span) + span) % span - span / 2, ya = by - 3 - (high - 3) * Math.pow(Math.abs(u) / (span / 2), 2.4);
      for (let y = Math.max(top + 1, Math.ceil(ya)); y < by; y++) if (!other || y > by - 10) col[y] = (y + Math.round(q.s)) % 5 === 0 ? B.STONE : B.ASHLAR;
    } else {
      // betonnen brug op hoge pijlers
      const span = 60, u = ((q.s % span) + span) % span;
      if (u < 5 && ad < bed - 1 && !other) for (let y = top + 1; y < by - 3; y++) col[y] = B.CONCRETE;
      col[by - 3] = B.CONCRETE; col[by - 2] = B.CONCRETE;
    }
    col[by - 1] = B.CONCRETE;
    col[by] = ad < bed - 0.7 ? B.BALLAST : B.CONCRETE;
    if (ad > bed - 0.7) { col[by + 1] = B.METAL; return Math.max(by + 1, top); }
    return Math.max(by, top);
  }
  // dijk of sleuf
  under(col, top, by, B.STONE);
  for (let y = top + 1; y < by; y++) col[y] = B.GRAVEL;
  for (let y = by + 1; y <= top + 1; y++) col[y] = 0;
  col[by] = ad < bed - 0.7 ? B.BALLAST : B.GRAVEL;
  // seinpalen om de 1200 m (rechts van het spoor)
  if (ad > bed - 0.6 && sd > 0 && Math.round(q.s) % 1200 === 600) { for (let y = by + 1; y <= by + 5; y++) col[y] = B.METAL; col[by + 6] = B.PAINT_BLACK; return by + 6; }
  return by;
}

// Hauptbahnhof
function hbfColumn(x, z, col, top) {
  const H = HBF, q = H.L.near(x, z, 80);
  if (!q || q.s < H.s0 - 40 || q.s > H.s1 + 40 || q.sd < H.north - 0.5 || q.sd > H.south + 0.5) return -1;
  const sd = q.sd, by = H.y, u = q.s - H.mid;
  const inSta = q.s >= H.s0 && q.s <= H.s1;
  // perron?
  let plat = null; for (const p of H.plat) if (sd >= p[0] && sd <= p[1]) plat = p;
  // onderdoorgang (6 breed, 3 hoog) onder alle perrons
  const passage = Math.abs(u) <= 3 && sd > H.north - 30 && sd < H.south - 1;
  for (let y = Math.max(1, top - 3); y < by; y++) col[y] = B.CONCRETE;
  for (let y = top + 1; y < by; y++) col[y] = B.CONCRETE;
  for (let y = by + 1; y <= Math.max(top, by + 16); y++) col[y] = 0;
  let t = by;
  if (plat && inSta) {
    const edge = Math.min(sd - plat[0], plat[1] - sd);
    col[by + 1] = edge < 0.6 ? B.LINE_WHITE : edge < 1.2 ? B.LINE_YELLOW : B.TILE; t = by + 1;
    const c = (plat[0] + plat[1]) / 2;
    // trap (links) en roltrap (rechts) naar de onderdoorgang
    if (u >= 5 && u <= 13 && Math.abs(sd - c) <= 1.6) {
      const st = Math.floor((u - 5) * 6 / 8); // 0..5
      for (let y = by - 4; y <= by + 1; y++) col[y] = 0;
      col[by - 4 + st] = sd < c ? B.TILE : B.ESCALATOR;
      for (let y = by - 5; y < by - 4 + st; y++) col[y] = B.CONCRETE;
      t = by - 4 + st;
    } else if (u >= 4 && u <= 14 && Math.abs(sd - c) <= 2.4) { col[by + 2] = B.GLASS; t = by + 2; } // balustrade
    // lift naar de onderdoorgang
    if (Math.abs(u + 10) < 0.6 && Math.abs(sd - c) < 0.6) { col[by + 1] = B.ELEVATOR; for (let y = by - 4; y <= by; y++) col[y] = 0; col[by - 5] = B.ELEVATOR; t = by + 1; }
    else if (Math.abs(u + 10) < 1.6 && Math.abs(sd - c) < 1.6 && !(Math.abs(u + 10) < 0.6 && Math.abs(sd - c) < 0.6)) { for (let y = by + 2; y <= by + 4; y++) col[y] = (Math.abs(sd - c) < 0.6 && u + 10 > 0) ? 0 : B.GLASS; t = by + 4; for (let y = by - 4; y <= by; y++) col[y] = B.GLASS; }
    // banken, zuilen van de hal
    if (Math.abs(sd - c) < 0.6 && Math.round(u) % 18 === 9 && !(u >= 4 && u <= 14)) { col[by + 2] = B.DARK_PLANKS; }
    if (Math.abs(sd - c) < 0.6 && Math.round(u) % 27 === 0 && !(u >= 4 && u <= 14) && Math.abs(u + 10) > 2) { for (let y = by + 2; y <= by + 13; y++) col[y] = B.METAL; t = by + 13; }
    if (Math.abs(sd - c) < 0.6 && Math.round(u) % 54 === 27) { col[by + 2] = B.POST; col[by + 3] = B.PAINT_BLUE; col[by + 4] = B.PAINT_BLUE; t = Math.max(t, by + 4); } // vertrekbord
  } else {
    // sporen: ballast
    col[by] = B.BALLAST; t = by;
  }
  if (passage) {
    for (let y = by - 4; y <= by - 2; y++) col[y] = 0;
    col[by - 5] = B.TILE; col[by - 1] = B.CONCRETE;
    if (Math.abs(u) > 2.4) { for (let y = by - 4; y <= by - 2; y++) col[y] = B.PANEL_WHITE; if (Math.round(sd) % 8 === 0) col[by - 3] = B.PAINT_BLUE; }
    else if (Math.round(sd) % 6 === 0) col[by - 1] = B.LAMP;
    // trap naar het stationsgebouw
    if (sd < H.north + 0.5) { const st = Math.floor((H.north + 0.5 - sd) * 5 / 7); for (let y = by - 4; y <= by + 1; y++) col[y] = 0; if (st < 5) col[by - 4 + st] = Math.abs(u) < 0.5 ? B.ESCALATOR : B.TILE; }
  }
  // perronhal: boogdak van glas met stalen spanten
  if (inSta || Math.abs(u) < (H.s1 - H.s0) / 2 + 6) {
    const span = H.south - H.north, w = (sd - H.north) / span * 2 - 1, ry = by + 13 + Math.round(5 * Math.sqrt(Math.max(0, 1 - w * w)));
    if (Math.abs(u) <= (H.s1 - H.s0) / 2 + 6) {
      col[ry] = Math.round(u) % 9 === 0 ? B.METAL : B.GLASS; t = Math.max(t, ry);
      if ((sd <= H.north + 0.6 || sd >= H.south - 0.6)) { for (let y = by + 1; y < ry; y++) if (!col[y]) col[y] = Math.round(u) % 9 === 0 ? B.LIMESTONE : (y % 4 === 0 ? B.LIMESTONE : B.GLASS); }
      if (Math.abs(Math.abs(u) - ((H.s1 - H.s0) / 2 + 6)) < 0.6 && ry - by > 9) { for (let y = by + 9; y < ry; y++) col[y] = B.GLASS; } // kopgevel boven de sporen
    }
  }
  return t;
}

// gebouwen: één kolom
function buildingColumn(b, x, z, col, top) {
  const F = b.F, inCore = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1, wall = !inCore;
  const fh = b.kind === 'hbf' ? 5 : b.kind === 'church' ? 6 : 3;
  const wallTop = F + b.floors * fh;
  // fundering tot op de grond
  for (let y = Math.max(1, top - 3); y < F; y++) col[y] = B.ASHLAR;
  for (let y = top + 1; y <= F; y++) col[y] = 0;
  col[F] = b.kind === 'hbf' || b.kind === 'station' || b.kind === 'panorama' ? B.MARBLE : b.kind === 'church' ? B.CHECKER : B.PLANKS;
  const face = b.face, along = face[0] === 'x' ? z - b.z0 : x - b.x0;
  const onFace = (face === 'x0' && x === b.x0) || (face === 'x1' && x === b.x1) || (face === 'z0' && z === b.z0) || (face === 'z1' && z === b.z1);
  const midFace = face[0] === 'x' ? Math.round((b.z0 + b.z1) / 2) : Math.round((b.x0 + b.x1) / 2), doorPos = face[0] === 'x' ? z : x;
  const door = onFace && Math.abs(doorPos - midFace) <= (b.kind === 'hbf' ? 6 : b.kind === 'hotel' || b.kind === 'station' || b.kind === 'church' ? 1 : 0);
  // kerktoren aan de voorkant
  if (b.kind === 'church') {
    const tx = face[0] === 'x' ? (face === 'x0' ? b.x0 + 3 : b.x1 - 3) : midFace, tz = face[0] === 'z' ? (face === 'z0' ? b.z0 + 3 : b.z1 - 3) : midFace;
    if (Math.abs(x - tx) <= 3 && Math.abs(z - tz) <= 3) {
      const tw = Math.abs(x - tx) === 3 || Math.abs(z - tz) === 3, topT = F + 30;
      for (let y = F + 1; y <= topT; y++) col[y] = tw ? ((y - F) % 6 === 4 && (x === tx || z === tz) ? B.GLASS : B.PLASTER) : (y === F + 1 ? 0 : (y - F) % 6 === 0 ? B.PLANKS : 0);
      if (door && tw) { col[F + 1] = 0; col[F + 2] = 0; }
      if (tw && (x === tx || z === tz) && (topT - 4) > F) col[topT - 4] = B.PAINT_WHITE; // uurwerk
      // spits
      const r = Math.max(Math.abs(x - tx), Math.abs(z - tz)), sp = topT + 1 + (3 - r) * 4;
      for (let y = topT + 1; y <= sp; y++) col[y] = B.COPPER;
      if (x === tx && z === tz) { for (let y = sp + 1; y <= sp + 3; y++) col[y] = B.METAL; return sp + 3; }
      return sp;
    }
  }
  let t = F;
  for (let y = F + 1; y < wallTop; y++) {
    const lvl = y - F - 1, fl = Math.floor(lvl / fh), inLvl = lvl % fh;
    if (!wall) { if (inLvl === fh - 1 && y + 1 < wallTop) col[y + 1] = b.kind === 'hbf' ? B.MARBLE : B.PLANKS; continue; }
    const corner = (x === b.x0 || x === b.x1) && (z === b.z0 || z === b.z1);
    if (door && fl === 0 && inLvl < (b.kind === 'hbf' ? 4 : 2)) { col[y] = 0; continue; }
    const mat = fl === 0 ? b.gf : b.uf;
    if (corner) { col[y] = mat === B.GLASS ? B.PANEL_DARK : (b.kind === 'chalet' ? B.LOG : mat); continue; }
    const edgeAlong = face[0] === 'x' ? (x === b.x0 || x === b.x1 ? z - b.z0 : x - b.x0) : (z === b.z0 || z === b.z1 ? x - b.x0 : z - b.z0);
    if (b.kind === 'panorama') { col[y] = edgeAlong % 6 === 0 ? B.PANEL_DARK : B.GLASS_BLUE; continue; }
    if (b.kind === 'hbf') { col[y] = fl === 0 ? (edgeAlong % 8 === 0 ? B.LIMESTONE : B.GLASS) : (edgeAlong % 4 === 2 && inLvl >= 1 && inLvl <= 3 ? B.GLASS : B.LIMESTONE); continue; }
    if (mat === B.GLASS) { col[y] = inLvl === fh - 1 ? B.PANEL_DARK : (edgeAlong % 5 === 0 ? B.PANEL_DARK : B.GLASS); continue; }
    const win = b.kind === 'church' ? (edgeAlong % 5 === 2 && inLvl >= 1 && inLvl <= 4) : (edgeAlong % 3 === 1 && inLvl <= 1);
    col[y] = win ? (b.kind === 'church' ? B.GLASS_BLUE : B.GLASS) : mat;
    if (!win && inLvl === fh - 1 && fl > 0 && (b.uf === B.PLANKS || b.uf === B.DARK_PLANKS)) col[y] = B.LOG;
  }
  // balkons (chalets en hotels) aan de voorkant
  if ((b.kind === 'chalet' || b.kind === 'hotel') && b.floors > 1) {
    const out = (face === 'x0' && x === b.x0) || (face === 'x1' && x === b.x1) || (face === 'z0' && z === b.z0) || (face === 'z1' && z === b.z1);
    void out;
  }
  // naambord boven de deur
  if (onFace && b.name && Math.abs(doorPos - midFace) >= 2 && Math.abs(doorPos - midFace) <= 4 && b.kind !== 'church') col[F + (b.kind === 'hbf' ? 6 : 4)] = b.kind === 'station' || b.kind === 'hbf' ? B.PAINT_BLUE : b.kind === 'shop' ? B.PAINT_GREEN : B.PAINT_RED;
  // dak
  if (b.flat || b.kind === 'hbf') {
    col[wallTop] = b.roof; t = wallTop;
    if (b.terrace && wall) { col[wallTop + 1] = B.GLASS; t = wallTop + 1; }
    if (b.kind === 'hbf' && Math.abs(x - (b.x0 + b.x1) / 2) < 6 && Math.abs(z - (b.z0 + b.z1) / 2) < 6) { const r = Math.max(Math.abs(x - (b.x0 + b.x1) / 2), Math.abs(z - (b.z0 + b.z1) / 2)); const top2 = wallTop + Math.round((6 - r) * 1.6); for (let y = wallTop + 1; y <= top2; y++) col[y] = r > 5 ? B.LIMESTONE : B.COPPER; t = top2; }
  } else {
    // zadeldak langs de lange zijde
    const longX = (b.x1 - b.x0) >= (b.z1 - b.z0);
    const dEdge = longX ? Math.min(z - b.z0, b.z1 - z) : Math.min(x - b.x0, b.x1 - x);
    const depth = longX ? b.z1 - b.z0 : b.x1 - b.x0;
    const roofY = wallTop + Math.floor(Math.max(0, dEdge) * (b.kind === 'chalet' ? 0.7 : 0.55));
    const gable = longX ? (x === b.x0 || x === b.x1) : (z === b.z0 || z === b.z1);
    if (gable) for (let y = wallTop; y < roofY; y++) col[y] = (y - wallTop) % 3 === 1 && dEdge === Math.floor(depth / 2) ? B.GLASS : b.uf;
    col[roofY] = b.roof; t = roofY;
    if ((b.kind === 'hotel' || b.kind === 'chalet') && hash(x, z, 77) < 0.012 && dEdge > 2) { col[roofY + 1] = B.BRICK; col[roofY + 2] = B.BRICK; t = roofY + 2; }
  }
  // binnen: tafels, bedden, toonbanken, trap
  if (inCore) {
    const ix = x - b.x0, iz = z - b.z0;
    if (ix === 2 && iz === 2 && b.floors > 1 && b.kind !== 'church') for (let y = F + 1; y < wallTop; y++) col[y] = B.LADDER;
    else {
      if ((b.kind === 'restaurant' || b.kind === 'panorama') && ix % 4 === 1 && iz % 4 === 1) col[F + 1] = B.PLANKS;
      if (b.kind === 'shop' && ix === 3 && iz > 3) col[F + 1] = B.CRATE;
      if (b.kind === 'church' && ix % 3 === 1 && iz > 6 && iz < (b.z1 - b.z0) - 3) col[F + 1] = B.DARK_PLANKS;
      if (b.kind === 'hbf' && ix % 12 === 6 && iz % 10 === 5) { col[F + 1] = B.COUNTER || B.PLANKS; } // kiosken
      if ((b.kind === 'hotel' || b.kind === 'chalet') && b.floors > 1 && ix % 5 === 3 && iz % 4 === 2) for (let f = 1; f < b.floors; f++) col[F + f * fh + 1] = B.WOOL_RED; // bedden
    }
  }
  return Math.max(t, top);
}

// kabelbanen: stations en masten
function liftColumn(x, z, col, top) {
  for (const L of liftGrid.at(x, z)) {
    const [u, v] = liftUV(L, x, z);
    if (u < -L.stL - 4 || u > L.len + L.stL + 4 || Math.abs(v) > L.stW + 2) continue;
    // stations
    for (const [cu, y, isTop] of [[0, L.ya, false], [L.len, L.yb, true]]) {
      const du = u - cu;
      if (Math.abs(du) > L.stL || Math.abs(v) > L.stW) continue;
      for (let k = Math.max(1, top - 3); k < y; k++) col[k] = B.CONCRETE;
      for (let k = top + 1; k <= y; k++) col[k] = B.CONCRETE;
      for (let k = y + 1; k <= Math.max(top, y + 12); k++) col[k] = 0;
      col[y] = Math.abs(v) <= 1 ? B.LINE_YELLOW : B.TILE;
      const roof = y + (L.kind === 'chair' ? 6 : 10), wallV = Math.abs(Math.round(v)) === L.stW, wallU = Math.abs(Math.round(du)) === L.stL;
      const open = wallU && Math.abs(v) <= L.track + 3 && (isTop ? du < 0 : du > 0);
      const door = (wallV && Math.abs(du) <= 2) || (wallU && !open && Math.abs(v) <= 2);
      if ((wallV || wallU) && L.kind !== 'chair') for (let k = y + 1; k < roof; k++) { if (open && k <= y + 8) continue; if (door && k <= y + 3) continue; col[k] = k === y + 1 || k === roof - 1 || (wallV ? Math.round(du) : Math.round(v)) % 5 === 0 ? B.PANEL_DARK : B.GLASS_BLUE; }
      if (L.kind === 'chair' && (wallV || wallU) && Math.abs(v) > 2 && (Math.round(du) % 6 === 0)) for (let k = y + 1; k < roof; k++) col[k] = B.METAL;
      // groot wiel
      if (Math.abs(Math.abs(du) - (L.stL - 4)) <= 1 && (isTop ? du > 0 : du < 0) && Math.abs(Math.abs(v) - L.track) <= 1) for (let k = y + 1; k <= y + 6; k++) col[k] = B.METAL;
      if (Math.abs(v) === L.stW - 2 && Math.round(du) % 6 === 3) col[y + 1] = B.PLANKS;
      col[roof] = (Math.round(du) + Math.round(v)) % 7 === 0 ? B.LAMP : B.PANEL_WHITE;
      return roof;
    }
    // masten
    for (const p of L.pylons || EMPTY) {
      if (Math.abs(u - p.u) > 1.5) continue;
      const av = Math.abs(v);
      if (av > L.track + 1.5) continue;
      col[top] = B.CONCRETE;
      if (av <= 1) { for (let y = top + 1; y <= p.top; y++) col[y] = (y - top) % 6 === 0 ? B.PAINT_BLACK : B.METAL; return p.top; }
      if (Math.abs(u - p.u) < 0.6) { col[p.top] = B.METAL; return Math.max(top, p.top); }
      return top;
    }
  }
  return -1;
}

// straten
function roadColumn(x, z, col, top) {
  const q = roadAt(x, z); if (!q) return -1;
  const r = q.r, y = top;
  if (q.d <= r.hw) {
    for (let k = Math.max(1, y - 3); k < y; k++) col[k] = B.GRAVEL;
    col[y] = r.tram && q.d < 1.2 ? B.METAL : (Math.abs(q.d) < 0.5 && Math.floor(q.s / 4) % 2 === 0 && r.hw > 3.3 ? B.LINE_WHITE : B.ASPHALT);
    for (let k = y + 1; k <= y + 3; k++) col[k] = 0;
    return y;
  }
  if (q.d <= r.hw + 2.6) {
    col[y] = r.town === 'Reuzenstad' ? B.SIDEWALK : B.COBBLE;
    for (let k = y + 1; k <= y + 3; k++) col[k] = 0;
    if (q.d > r.hw + 1.8 && Math.round(q.s) % 24 === 12) { for (let k = y + 1; k <= y + 4; k++) col[k] = B.POST; col[y + 5] = B.LAMP; return y + 5; }
    return y;
  }
  return -1;
}

function fillColumnNew(x, z, col, slope, ctx, hs) {
  treeKind = 0;
  const h = hs, top = Math.round(G + h);
  col[0] = B.BEDROCK;
  for (let y = 1; y < top - 3; y++) col[y] = B.STONE;
  // water in meren
  const lk = lakeAt(x, z);
  if (lk && top < lk[0].level) {
    for (let y = 1; y < top; y++) col[y] = B.STONE;
    col[top] = hash(x, z, 5) < 0.5 ? B.SAND : B.GRAVEL;
    for (let y = top + 1; y <= lk[0].level; y++) col[y] = B.WATER;
    return lk[0].level;
  }
  const rc = railColumn(x, z, col, top, ctx); if (rc >= 0) return rc;
  const b = bldAt(x, z); if (b) return buildingColumn(b, x, z, col, top);
  const lc = liftColumn(x, z, col, top); if (lc >= 0) return lc;
  const rd = roadColumn(x, z, col, top); if (rd >= 0) return rd;
  // natuur
  const snow = h > snowLine(x, z) && slope < 1.5;
  const glacier = h > 2500 && slope < 0.55 && ctx.concave(x, z) < -6;
  const rock = !snow && (h > rockLine(x, z) || slope > 1.15);
  const meadow = !rock && !snow && h > treeLine(x, z);
  if (rock || snow || glacier) for (let y = Math.max(1, top - 3); y < top; y++) col[y] = strata(x, y, z);
  else for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT;
  if (glacier) { col[top] = noise(x / 9, z / 9, 61) < 0.7 ? B.ICE : B.SNOW; if (h > snowLine(x, z) - 200 && hash(x, z, 62) < 0.4) { col[top + 1] = B.SNOW; return top + 1; } return top; }
  if (lk && Math.abs(top - lk[0].level) <= 1) { col[top] = B.SAND; return top; }
  if (!snow && h > snowLine(x, z) - 220 && slope < 0.9 && noise(x / 16, z / 16, 91) > 0.66 - (h - snowLine(x, z) + 220) / 520) { col[top] = B.SNOW; return top; }
  if (snow) { col[top] = B.SNOW; if (slope < 0.6 && hash(x, z, 7) < 0.6) { col[top + 1] = B.SNOW; return top + 1; } return top; }
  if (rock) { col[top] = noise(x / 7, z / 7, 8) < 0.22 ? B.GRAVEL : strata(x, top, z); if (hash(x, z, 9) < 0.004) treeKind = 4; return top; }
  col[top] = B.GRASS;
  // dichtbij gebouwen, wegen en spoor geen bomen
  if (ctx.noTree(x, z) || slope > 1.05) { if (hash(x, z, 17) < 0.03) col[top] = B.FLOWERS; return top; }
  if (meadow) {
    if (hash(x, z, 12) < 0.05) col[top] = B.FLOWERS;
    if (hash(x, z, 13) < 0.003) treeKind = 4;
    if (h < treeLine(x, z) + 70 && treeSpot(x, z, 7, 0.25)) treeKind = 2;
    return top;
  }
  const dense = h < 700 ? 0.9 : h < 1400 ? 0.8 : 0.55;
  if (treeSpot(x, z, 4, dense)) {
    const conifer = h > 900 || (h > 400 && hash(x, z, 14) < (h - 400) / 500) || hash(x, z, 15) < 0.12;
    const r = hash(x, z, 19);
    treeKind = conifer ? (h > 700 && h < 1600 && r < 0.3 ? 6 : 2) : (r < 0.28 ? 5 : 1);
  } else if (hash(x, z, 16) < 0.035) treeKind = 3;
  else if (hash(x, z, 20) < 0.004) treeKind = 7;
  else if (hash(x, z, 17) < 0.02) col[top] = B.FLOWERS;
  return top;
}

// lift-profielen (kabelhoogte en masten), zoals bij de oude kabelbaan
for (const L of LIFTS) {
  const gnd = (u) => { let m = -1e9; for (const o of [-L.track - 2, 0, L.track + 2]) { const x = L.ax + L.ux * u - L.uz * o, z = L.az + L.uz * u + L.ux * o; m = Math.max(m, G + natural(x, z)); } return m; };
  const attach = L.kind === 'chair' ? 6 : 6.2;
  const pts = [{ u: L.stL - 2, y: L.ya + attach }];
  const end = L.len - L.stL + 2, yEnd = L.yb + attach, maxSpan = L.kind === 'cable' ? 1400 : L.kind === 'gondola' ? 460 : 180, clearH = L.kind === 'chair' ? 6 : 12;
  const sagOf = (span) => span * (L.kind === 'cable' ? 0.03 : 0.012);
  const clears = (a, ya, b, yb) => { const span = b - a, sag = sagOf(span); for (let d = a + 6; d < b; d += 6) { const t = (d - a) / span, y = ya + (yb - ya) * t - sag * 4 * t * (1 - t); if (y - 4.6 - clearH < gnd(d)) return false; } return true; };
  let cur = pts[0];
  for (let guard = 0; guard < 120; guard++) {
    if ((clears(cur.u, cur.y, end, yEnd) && end - cur.u <= maxSpan) || end - cur.u < 60) { pts.push({ u: end, y: yEnd }); break; }
    let best = null;
    for (let nu = Math.min(end - 30, cur.u + maxSpan * 0.95); nu >= cur.u + 40 && !best; nu -= 20) {
      const g = gnd(nu);
      for (let hh = 14; hh <= 70; hh += 4) if (clears(cur.u, cur.y, nu, g + hh)) { best = { u: nu, y: g + hh, h: hh }; break; }
    }
    if (!best) { const nu = Math.min(end - 30, cur.u + 40); best = { u: nu, y: gnd(nu) + 70, h: 70 }; }
    pts.push(best); cur = best;
  }
  L.pts = pts; L.sag = sagOf;
  L.pylons = pts.filter(p => p.h).map(p => ({ u: Math.round(p.u), top: Math.round(p.y + 1) }));
  L.cableY = (u) => { if (u <= pts[0].u) return pts[0].y; for (let i = 1; i < pts.length; i++) if (u <= pts[i].u) { const a = pts[i - 1], b = pts[i], span = b.u - a.u, t = (u - a.u) / span; return a.y + (b.y - a.y) * t - sagOf(span) * 4 * t * (1 - t); } return pts[pts.length - 1].y; };
}

// ---------- tegel maken ----------
const spare = new Uint8Array(6200);
export function generateTile(tx, tz) {
  const otx = tx - TOFF, otz = tz - TOFF;
  // volledig in de oude Reuzenberg: precies de oude tegel
  if (otx >= 0 && otz >= 0 && (otx + 1) * T <= OLD && (otz + 1) * T <= OLD) return OLDM.generateTile(otx, otz);
  const X0 = tx * T, Z0 = tz * T, P = 4, N = T + 2 * P + 1;
  const hgt = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) hgt[z * N + x] = surfaceAt(X0 + x - P, Z0 + z - P);
  // grove hoogtes rond de tegel (voor gletsjers in kommen)
  const CN = 9, cs = 48, coarse = new Float32Array(CN * CN);
  for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) coarse[j * CN + i] = natural(X0 - 128 + i * cs, Z0 - 128 + j * cs);
  const smoothAt = (x, z) => { const fx = (x + 128) / cs, fz = (z + 128) / cs, i = Math.max(0, Math.min(CN - 2, Math.floor(fx))), j = Math.max(0, Math.min(CN - 2, Math.floor(fz))), a = fx - i, c = fz - j; return (coarse[j * CN + i] * (1 - a) + coarse[j * CN + i + 1] * a) * (1 - c) + (coarse[(j + 1) * CN + i] * (1 - a) + coarse[(j + 1) * CN + i + 1] * a) * c; };
  // lijnen in de buurt
  const lines = LINES.filter(L => { for (let i = 0; i < L.n; i += 6) if (L.x[i] > X0 - 60 && L.x[i] < X0 + T + 60 && L.z[i] > Z0 - 60 && L.z[i] < Z0 + T + 60) return true; return false; });
  const hbf = Math.abs(X0 + T / 2 - HBF.x) < 400 && Math.abs(Z0 + T / 2 - HBF.z) < 200;
  const ctx = {
    lines, hbf,
    concave: (x, z) => hgt[(z - Z0 + P) * N + (x - X0 + P)] - smoothAt(x - X0, z - Z0),
    noTree: (x, z) => { if (bldAt(x, z, 5)) return true; const q = roadAt(x, z); if (q && q.d < q.r.hw + 5) return true; for (const L of lines) { const r = L.near(x, z, 12); if (r) return true; } for (const L of liftGrid.at(x, z)) { const [u, v] = liftUV(L, x, z); if (u > -L.stL - 10 && u < L.len + L.stL + 10 && Math.abs(v) < L.track + 8) return true; } return false; },
  };
  const cols = new Array(T * T);
  const col = new Uint8Array(6200);
  const trees = [];
  let lo = 1e9, hi = 0;
  for (let z = -P; z < T + P; z++) for (let x = -P; x < T + P; x++) {
    const gx = X0 + x, gz = Z0 + z;
    if (gx < 0 || gz < 0 || gx >= MW || gz >= ML) continue;
    const inside = x >= 0 && z >= 0 && x < T && z < T;
    const i0 = (z + P) * N + (x + P);
    const slope = Math.max(Math.abs(hgt[i0 + 1] - hgt[i0]), Math.abs(hgt[i0 + N] - hgt[i0]), Math.abs(hgt[i0 - 1] - hgt[i0]), Math.abs(hgt[i0 - N] - hgt[i0]));
    const old = inOld(gx, gz);
    if (!inside) {
      if (old) { spare.fill(0); O.fillColumn(gx - OX, gz - OZ, spare, slope); const k = O.treeKind(); if (k === 1 || k === 2 || k === 5 || k === 6) trees.push(x, z, Math.round(G + OLDM.surfaceAt(gx - OX, gz - OZ)), k); continue; }
      spare.fill(0);
      const tp = fillColumnNew(gx, gz, spare, slope, ctx, hgt[i0]);
      if (treeKind === 1 || treeKind === 2 || treeKind === 5 || treeKind === 6) trees.push(x, z, tp, treeKind);
      continue;
    }
    col.fill(0);
    let top, tk;
    if (old) { top = O.fillColumn(gx - OX, gz - OZ, col, slope); tk = O.treeKind(); }
    else { top = fillColumnNew(gx, gz, col, slope, ctx, hgt[i0]); tk = treeKind; }
    const i = z * T + x;
    cols[i] = col.slice(0, top + 1);
    // laagste vaste grond (ook buren), en tunnels/onderdoorgangen in deze kolom
    let ground = Math.round(G + Math.min(hgt[i0], hgt[i0 + 1], hgt[i0 - 1], hgt[i0 + N], hgt[i0 - N]));
    for (let y = 1; y < Math.min(ground, top); y++) if (col[y] === 0 || col[y] === B.WATER) { ground = y; break; }
    if (ground < lo) lo = ground;
    if (top > hi) hi = top;
    if (tk) trees.push(x, z, top, tk);
  }
  const Y0 = Math.max(0, lo - 24);
  const H = Math.min(META.maxH - Y0, Math.ceil((hi + 26 - Y0) / 8) * 8);
  const edge = new Int16Array(4 * T);
  for (let i = 0; i < T; i++) {
    edge[i] = Math.round(G + surfaceAt(X0 - 1, Z0 + i)); edge[T + i] = Math.round(G + surfaceAt(X0 + T, Z0 + i));
    edge[2 * T + i] = Math.round(G + surfaceAt(X0 + i, Z0 - 1)); edge[3 * T + i] = Math.round(G + surfaceAt(X0 + i, Z0 + T));
  }
  const vox = new Uint8Array(T * T * H);
  for (let i = 0; i < T * T; i++) if (cols[i]) { const c = cols[i]; vox.set(c.subarray(Y0, Math.min(c.length, Y0 + H)), i * H); }
  const set = (x, y, z, b, force) => { y -= Y0; if (x < 0 || z < 0 || x >= T || z >= T || y < 0 || y >= H) return; const i = (z * T + x) * H + y; if (!vox[i] || force) vox[i] = b; };
  for (let i = 0; i < trees.length; i += 4) {
    const x = trees[i], z = trees[i + 1], gy = trees[i + 2], k = trees[i + 3], r = hash(x + X0, z + Z0, 44);
    if (k === 1) placeTree(x, z, gy, 5 + Math.floor(r * 4), null, set);
    else if (k === 2) O.placeSpruce(x, z, gy, 8 + Math.floor(r * 9), set);
    else if (k === 3) { const lb = r < 0.5 ? B.LEAVES : B.BIRCH_LEAVES; set(x, gy + 1, z, lb); if (r < 0.4) set(x + 1, gy + 1, z, lb); if (r > 0.8) set(x, gy + 2, z, lb); }
    else if (k === 5) O.placeBirch(x, z, gy, 6 + Math.floor(r * 4), set);
    else if (k === 6) O.placePine(x, z, gy, 11 + Math.floor(r * 6), set);
    else if (k === 7) { set(x, gy + 1, z, B.MOSSY_STONE, true); set(x + 1, gy + 1, z, B.MOSSY_STONE, true); if (r < 0.5) set(x, gy + 2, z, B.MOSSY_STONE, true); }
    else if (k === 4) { const s = 1 + Math.floor(r * 2.5); for (let dz = -s; dz <= s; dz++) for (let dx = -s; dx <= s; dx++) for (let dy = 0; dy <= s; dy++) if (dx * dx + dz * dz + dy * dy * 1.6 <= s * s + 0.5) set(x + dx, gy + dy, z + dz, hash(x + dx, z + dz, dy) < 0.3 ? B.COBBLE : B.STONE, true); }
  }
  return { vox, H, y0: Y0, edge, ground: G, paths: tilePaths(X0, Z0, lines), tunnels: tileTunnels(X0, Z0, lines, Y0) };
}

// ---------- paden voor het verkeer (sporen worden getekend, auto's, voetgangers) ----------
function tilePaths(X0, Z0, lines) {
  const out = [];
  const clipPush = (type, pts, extra) => {
    let run = [];
    const flush = () => { if (run.length >= 6) out.push({ type, pts: new Float32Array(run), ...extra }); run = []; };
    for (const [x, z, y] of pts) { const lx = x - X0, lz = z - Z0; if (lx < -4 || lz < -4 || lx > T + 4 || lz > T + 4) { flush(); continue; } run.push(lx, lz, y); }
    flush();
  };
  for (const L of lines) {
    // stuk van de lijn dat de tegel raakt
    let i0 = -1, i1 = -1;
    for (let i = 0; i < L.n; i++) if (L.x[i] > X0 - 8 && L.x[i] < X0 + T + 8 && L.z[i] > Z0 - 8 && L.z[i] < Z0 + T + 8) { if (i0 < 0) i0 = i; i1 = i; }
    if (i0 < 0) continue;
    const s0 = Math.max(0, L.s[i0] - 8), s1 = Math.min(L.len, L.s[i1] + 8);
    for (const side of [1, -1]) {
      const pts = []; const p = {};
      for (let s = s0; s <= s1 + 0.01; s += 4) {
        L.at(Math.min(s, s1), p);
        if (p.kind === 3) { pts.push([1e9, 1e9, 0]); continue; } // oud spoor tekent de oude tegel zelf
        const off = trackOffset(L, s) * side;
        pts.push([p.x - p.tz * off, p.z + p.tx * off, Math.round(p.y)]);
      }
      clipPush('train', pts);
    }
  }
  // straten: auto's (rechts rijden), bussen; tram in Reuzenstad
  for (const r of ROADS) {
    if (Math.max(r.ax, r.bx) < X0 - 8 || Math.min(r.ax, r.bx) > X0 + T + 8 || Math.max(r.az, r.bz) < Z0 - 8 || Math.min(r.az, r.bz) > Z0 + T + 8) continue;
    const L = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / L, uz = (r.bz - r.az) / L;
    const lane = (off, rev) => { const p = []; for (let s = 0; s <= L; s += 6) p.push([r.ax + ux * s - uz * off, r.az + uz * s + ux * off, r.y]); p.push([r.bx - uz * off, r.bz + ux * off, r.y]); return rev ? p.reverse() : p; };
    const t = r.major ? 'carM' : 'car';
    if (r.tram) { clipPush('tram', lane(0.0, false)); }
    clipPush(t, lane(-1.8 - (r.tram ? 1.6 : 0), false)); clipPush(t, lane(1.8 + (r.tram ? 1.6 : 0), true));
    clipPush('walk', lane(r.hw + 1.3, false)); clipPush('walk', lane(-r.hw - 1.3, true));
  }
  // bushaltes en tramhaltes bij elk station
  for (const t of TOWNS) {
    if (t.kind === 'mountain' || t.kind === 'hamlet') continue;
    const r = ROADS.find(q => q.town === t.name && q.major); if (!r) continue;
    const mx = (r.ax + r.bx) / 2, mz = (r.az + r.bz) / 2;
    if (mx >= X0 && mx < X0 + T && mz >= Z0 && mz < Z0 + T) out.push({ type: 'busstop', name: t.name, pts: new Float32Array([mx - X0, mz - Z0, t.y]) });
  }
  return out;
}
// dubbelspoor: ± 2,5 m; tandradbaan: enkelspoor met een kruisingsspoor in de stations; aansluiting op het oude enkelspoor
export function trackOffset(L, s) {
  if (L.single) { let k = 0; for (const st of L.stations) k = Math.max(k, sstep(st.s0 - 90, st.s0 - 30, s) * (1 - sstep(st.s1 + 30, st.s1 + 90, s))); return TRACK * k; }
  if (L.id === 'AE' && L.oldS) { const [a, b] = L.oldS; if (s >= a && s <= b) return 0; return TRACK * Math.min(sstep(a, a - 260, s) * (s < a ? 1 : 0) + sstep(b, b + 260, s) * (s > b ? 1 : 0), 1); }
  return TRACK;
}
{ const L = LINE.AE; let a = -1, b = -1; for (let i = 0; i < L.n; i++) if (L.kind[i] === 3) { if (a < 0) a = L.s[i]; b = L.s[i]; } if (a >= 0) L.oldS = [a, b]; }

// tunnelstukken (voor de diepe ondergrond, die ook onder de tegelbodem uitgegraven wordt)
function tileTunnels(X0, Z0, lines, Y0) {
  const out = [];
  for (const L of lines) for (const [a, b] of L.tunnels) {
    const p = {}, q = {};
    for (let s = Math.max(a, 0); s < b; s += 16) {
      L.at(s, p); L.at(Math.min(b, s + 16), q);
      if (Math.max(p.x, q.x) < X0 - 8 || Math.min(p.x, q.x) > X0 + T + 8 || Math.max(p.z, q.z) < Z0 - 8 || Math.min(p.z, q.z) > Z0 + T + 8) continue;
      out.push({ type: L.single ? 'tube' : 'tube2', ax: p.x, az: p.z, ay: Math.round(p.y), bx: q.x, bz: q.z, by: Math.round(q.y), key: `${L.id}:${Math.round(s)}` });
    }
  }
  void Y0;
  return out;
}

// ---------- plaatsen, zones, kaart ----------
const OLDP = OLDM.PLACES.map(([n, x, z]) => [n, x + OX, z + OZ]);
export const PLACES = [
  ...OLDP,
  ...TOWNS.filter(t => t.kind !== 'mountain').map(t => [t.kind === 'city' ? `${t.name} (stad)` : t.name, Math.round(t.x), Math.round(t.z)]),
  ['Reuzenberg Hauptbahnhof', Math.round(HBF.x), Math.round(HBF.z) - 20],
  ['Zugspitze (2962 m)', Math.round(PZ.px), Math.round(PZ.pz)], ['Matterhorn (4478 m)', Math.round(PM.px), Math.round(PM.pz)],
  ['Mont Blanc (4808 m)', Math.round(PB.px), Math.round(PB.pz)], ['Hemelhoorn (5000 m)', HEMEL.x, HEMEL.z],
  ...LAKES.map(l => [l.name, Math.round(l.x), Math.round(l.z - l.rz - 30)]),
  ...LIFTS.map(L => [L.top, Math.round(L.bx), Math.round(L.bz)]),
];
export const SPAWN = { x: OLDM.SPAWN.x + OX, y: OLDM.SPAWN.y, z: OLDM.SPAWN.z + OZ };
export const STATIONS = OLDM.STATIONS.map(s => ({ ...s, x: s.x + OX, z: s.z + OZ }));
export const SUMMIT_XZ = [OLDM.SUMMIT_XZ[0] + OX, OLDM.SUMMIT_XZ[1] + OZ, OLDM.SUMMIT_XZ[2]];
export const OLD_LAKE = { ...OLDM.LAKE, x: OLDM.LAKE.x + OX, z: OLDM.LAKE.z + OZ };
export const TRAIL = (() => { const t = new Float32Array(OLDM.TRAIL); for (let i = 0; i < t.length; i += 3) { t[i] += OX; t[i + 1] += OZ; } return t; })();
export function zoneName(x, z) {
  if (x < 0 || z < 0 || x >= MW || z >= ML) return 'Buiten de wereld';
  if (inOld(x, z)) return OLDM.zoneName(x - OX, z - OZ);
  const b = bldAt(x, z, 1);
  if (b) return b.name ? `${b.name}${b.town ? ' · ' + b.town : ''}` : b.kind === 'chalet' ? `Chalet · ${b.town}` : b.kind === 'apartment' ? `Woonblok · ${b.town}` : b.town || '';
  for (const L of LINES) { const q = L.near(x, z, 12); if (q) { const st = L.stationAt(q.s); if (st) return `Station ${st.name} · ${L.name}`; return `${L.name}${q.kind === 1 ? ' · tunnel' : q.kind === 2 ? ' · viaduct' : ''}`; } }
  for (const L of liftGrid.at(x, z)) { const [u, v] = liftUV(L, x, z); if (Math.abs(v) < L.stW + 2 && (Math.abs(u) < L.stL + 2 || Math.abs(u - L.len) < L.stL + 2)) return `${L.name} · ${Math.abs(u) < L.stL + 2 ? 'dalstation' : 'bergstation'}`; }
  for (const t of townGrid.at(x, z)) if (Math.hypot(x - t.x, z - t.z) < t.r) return t.name + (t.remote ? ' (afgelegen gehucht)' : '');
  const lk = lakeAt(x, z); if (lk && lk[1] < 1) return lk[0].name;
  for (const P of PATCHES) if (Math.hypot(x - P.px, z - P.pz) < 600) return `${P.name} · ${Math.round(natural(x, z))} m`;
  if (Math.hypot(x - HEMEL.x, z - HEMEL.z) < 600) return `Hemelhoorn · ${Math.round(natural(x, z))} m`;
  const h = natural(x, z);
  const name = h > snowLine(x, z) ? 'Eeuwige sneeuw' : h > rockLine(x, z) ? 'Rotsen' : h > treeLine(x, z) ? 'Alpenweide' : h > 900 ? 'Naaldbos' : h > 400 ? 'Gemengd bos' : 'Loofbos';
  return `${name} · ${Math.round(h)} m`;
}
export function overviewColor(x, z, s = 25) {
  if (inOld(x, z)) return OLDM.overviewColor(x - OX, z - OZ, s);
  const h = natural(x, z), hx = natural(x + s, z), hz = natural(x, z + s);
  const slope = Math.hypot(hx - h, hz - h) / s;
  let c;
  const lk = lakeAt(x, z);
  if (lk && G + h < lk[0].level) c = [52, 104, 170];
  else if (h > snowLine(x, z) && slope < 1.4) c = [236, 240, 246];
  else if (h > 2500 && slope < 0.5) c = [200, 222, 236];
  else if (h > rockLine(x, z) || slope > 1.1) c = [128, 124, 118];
  else if (h > treeLine(x, z)) c = [122, 160, 78];
  else if (h > 900) c = [38, 82, 46];
  else c = [52, 104, 44];
  const shade = Math.max(0.45, Math.min(1.35, 1 + ((h - hx) * 0.7 + (h - hz) * 0.7) / s * 0.9));
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}
// kleur voor het verre landschap (hoogte en helling zijn al bekend: geen extra berekeningen)
export function farColor(x, z, h, slope, out) {
  let r, g, b;
  if (inOld(x, z)) {
    // zelfde kleuren als de oude Reuzenberg
    if (h < 0) { r = 52; g = 104; b = 170; } else if (h > 1720 && slope < 1.4) { r = 236; g = 240; b = 246; } else if (h > 1380 || slope > 1.1) { r = 128; g = 124; b = 118; } else if (h > 1120) { r = 122; g = 160; b = 78; } else if (h > 560) { r = 38; g = 82; b = 46; } else { r = 52; g = 104; b = 44; }
  } else {
    const lk = lakeAt(x, z);
    if (lk && G + h < lk[0].level + 0.5) { r = 52; g = 104; b = 170; }
    else if (h > snowLine(x, z) && slope < 1.4) { r = 236; g = 240; b = 246; }
    else if (h > 2500 && slope < 0.5) { r = 205; g = 225; b = 238; }
    else if (h > rockLine(x, z) || slope > 1.1) { r = 128; g = 124; b = 118; }
    else if (h > treeLine(x, z)) { r = 122; g = 160; b = 78; }
    else if (h > 900) { r = 38; g = 82; b = 46; }
    else { r = 52; g = 104; b = 44; }
  }
  out[0] = r; out[1] = g; out[2] = b; return out;
}
// voor tools/render-alpen.mjs: lijnen, dorpen en liften op de overzichtskaart
export function mapOverlay(S) {
  const out = [];
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
  for (const L of LINES) for (let i = 0; i < L.n; i += Math.max(1, Math.floor(S / 8))) out.push([L.x[i], L.z[i], L.kind[i] === 1 ? [40, 40, 40, 255] : hex(L.color)]);
  for (const b of BLD) for (let x = b.x0; x <= b.x1; x += S / 2) for (let z = b.z0; z <= b.z1; z += S / 2) out.push([x, z, [230, 120, 60, 255]]);
  for (const L of LIFTS) for (let u = 0; u <= L.len; u += S / 2) out.push([L.ax + L.ux * u, L.az + L.uz * u, [250, 250, 40, 255]]);
  return out;
}
export const NET_INFO = NET;
