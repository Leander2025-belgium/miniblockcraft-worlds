// TERRANOVA 16 fase 8 — wereldbouwer: gereedschap voor infrastructuur en landschap in de bouwmodus (js/build.js).
// Elk gereedschap is een generator van [x, y, z, blok] die de bouwmodus in stukjes uitvoert (één stap om ongedaan
// te maken, ook voor duizenden blokken).
// - weg: tweestrooksweg van hoek 1 naar hoek 2 (asfalt, witte middenstreep, stoepen), met helling als de hoeken op
//   een andere hoogte liggen, ruimte erboven vrijgemaakt en een vaste ondergrond (of pijlers boven een dal);
// - spoor: ballastbed met dwarsliggers en twee spoorstaven, ook met helling, en een vrij profiel erboven;
// - voetpad: grind, twee breed, volgt de grond;
// - terrein vlak maken: de selectie wordt een vlak grasveld op de hoogte van de laagste hoek;
// - heuvel: een ronde heuvel in de selectie, zo hoog als de selectie;
// - beplanten: bomen en bloemen op het gras in de selectie.
// De wegen en sporen zijn blokken (om op te lopen, te rijden met de vrije camera en mooi te bouwen); het
// verkeer en de treinen van de stad rijden er niet over — dat staat zo in docs/terranova-16.md.
import { B } from './blocks.js';
import { hash, placeTreeVariety } from './city.js';

// punten langs het middentracé (XZ), met de hoogte lineair van a naar b; zijwaartse richting per stap
function* trace(a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.max(1, Math.hypot(dx, dz)), n = Math.ceil(L * 2);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  for (let i = 0; i <= n; i++) { const t = i / n; yield { x: a[0] + dx * t, z: a[2] + dz * t, y: Math.round(a[1] + (b[1] - a[1]) * t), s: t * L, px, pz, ux, uz }; }
}
// profiel dwars op het tracé: elke cel één keer (dichtstbijzijnde tracépunt beslist)
function corridor(a, b, half, cellFn) {
  const seen = new Map();
  for (const p of trace(a, b)) {
    for (let o = -half; o <= half; o += 0.5) {
      const x = Math.round(p.x + p.px * o), z = Math.round(p.z + p.pz * o), k = x + ',' + z;
      const off = (x - p.x) * p.px + (z - p.z) * p.pz, d = Math.abs(off); // exacte zijdelingse afstand van het blok (symmetrisch)
      const along = Math.abs((x - p.x) * p.ux + (z - p.z) * p.uz); // het tracépunt recht naast het blok bepaalt de hoogte
      const prev = seen.get(k);
      if (!prev || along < prev.along) seen.set(k, { x, z, y: p.y, d, off, s: p.s, along });
    }
  }
  const out = [];
  for (const c of seen.values()) cellFn(c, out);
  return out;
}
// ondergrond: van y−1 naar beneden tot op vaste grond (max. depth), boven een dal om de 8 m een pijler
function support(get, c, y, out, depth, pillarEvery = 8) {
  const pillar = Math.abs(c.off) < 1 && Math.round(c.s) % pillarEvery === 0;
  for (let k = 1; k <= depth; k++) {
    const v = get(c.x, y - k, c.z);
    if (v && v !== B.WATER && v !== B.LEAVES && v !== B.PINE_LEAVES && v !== B.BIRCH_LEAVES) break;
    if (k <= 2 || pillar) out.push([c.x, y - k, c.z, k <= 2 ? B.STONE : B.CONCRETE]);
    else break; // brug: alleen de bovenste lagen, pijlers gaan door tot de grond
  }
}
const clearAbove = (c, y, h, out) => { for (let k = 1; k <= h; k++) out.push([c.x, y + k, c.z, 0]); };

export function roadCells(a, b, get) {
  return corridor(a, b, 5, (c, out) => {
    const d = c.d, y = c.y;
    let blk = B.ASPHALT;
    if (d > 3.6) blk = B.SIDEWALK;
    else if (d < 0.5 && Math.floor(c.s / 3) % 2 === 0) blk = B.LINE_WHITE; // onderbroken middenstreep
    out.push([c.x, y, c.z, blk]);
    clearAbove(c, y, 5, out); support(get, c, y, out, 30);
    if (blk === B.SIDEWALK && d > 4.6 && Math.round(c.s) % 24 === 0 && c.off > 0) out.push([c.x, y + 1, c.z, B.LAMP]); // lantaarn na het vrijmaken
  });
}
export function railCells(a, b, get) {
  return corridor(a, b, 3, (c, out) => {
    const d = c.d, y = c.y;
    out.push([c.x, y, c.z, B.BALLAST]);
    const sleeper = Math.round(c.s * 1.6) % 2 === 0;
    if (d < 1.6) out.push([c.x, y + 1, c.z, Math.abs(Math.abs(c.off) - 0.75) < 0.5 ? B.METAL : sleeper ? B.DARK_PLANKS : 0]);
    else out.push([c.x, y + 1, c.z, 0]);
    clearAbove(c, y + 1, 6, out); support(get, c, y, out, 30);
  });
}
// voetpad: volgt de grond (bovenste vaste blok in een venster rond de hoogte van het tracé)
export function pathCells(a, b, get, surfaceY) {
  return corridor(a, b, 1, (c, out) => { const y = surfaceY(c.x, c.z, c.y); out.push([c.x, y, c.z, B.GRAVEL]); clearAbove(c, y, 2, out); });
}
// selectie lo/hi: [x, y, z]
export function* flattenCells(lo, hi, get) {
  const y0 = lo[1];
  for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    yield [x, y0, z, B.GRASS];
    for (let k = 1; k <= 3; k++) yield [x, y0 - k, z, B.DIRT];
    for (let y = y0 + 1; y <= Math.max(hi[1], y0 + 12); y++) if (get(x, y, z)) yield [x, y, z, 0];
  }
}
export function* hillCells(lo, hi) {
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2, rx = Math.max(1, (hi[0] - lo[0]) / 2), rz = Math.max(1, (hi[2] - lo[2]) / 2), H = Math.max(2, hi[1] - lo[1]);
  for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    const r = Math.hypot((x - cx) / rx, (z - cz) / rz); if (r > 1) continue;
    const h = Math.round(H * (0.5 + 0.5 * Math.cos(Math.PI * r)));
    for (let y = lo[1]; y < lo[1] + h; y++) yield [x, y, z, B.DIRT];
    yield [x, lo[1] + h, z, h > H * 0.85 && H > 20 ? B.STONE : B.GRASS];
  }
}
// beplanten: bomen (± 1 per 40 m²) en bloemen op gras, niet tegen elkaar aan
export function plantCells(lo, hi, get, seed = 1) {
  const out = [], set = (x, y, z, b) => out.push([x, y, z, b]), taken = new Set();
  for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    let gy = null; for (let y = hi[1] + 6; y >= lo[1] - 6; y--) { const v = get(x, y, z); if (v) { if (v === B.GRASS) gy = y; break; } }
    if (gy === null) continue;
    const r = hash(x, z, 4400 + seed);
    if (r < 0.025 && ![-3, -2, -1, 0, 1, 2, 3].some(d => taken.has((x + d) + ',' + z) || taken.has(x + ',' + (z + d)))) { placeTreeVariety(x, z, gy, x * 131 + z * 7 + seed, set, false); taken.add(x + ',' + z); }
    else if (r > 0.93 && !get(x, gy + 1, z)) out.push([x, gy, z, B.FLOWERS]);
  }
  return out;
}
