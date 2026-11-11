// Greenisland – het ruwe landschap: kustlijn met baaien en kapen, kliffen, stranden, heuvels, het Viridonia Gebergte,
// rivieren en meren. Alles per punt berekenbaar (deterministisch, geen grote buffers). Hoogte in meter boven zeeniveau.
import { noise } from './city.js';
import { COAST, MOUNTAINS, PEAKS, RIVERS, LAKES, PLACES, W, L } from './greenisland-data.js';

const ROT = [];
for (let i = 0; i < 8; i++) { const a = i * 0.77 + 0.3; ROT.push([Math.cos(a), Math.sin(a)]); }
export function fbm(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1;
  for (let i = 0; i < oct; i++) { const [c, n] = ROT[i]; a += (noise((x * c - z * n) * f + 7.1 * i, (x * n + z * c) * f - 3.7 * i, s + i) * 2 - 1) * amp; sum += amp; amp *= 0.5; f *= 2.03; }
  return a / sum;
}
export function ridged(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1, w = 1;
  for (let i = 0; i < oct; i++) { const [c, n] = ROT[i]; let v = 1 - Math.abs(noise((x * c - z * n) * f + 5.3 * i, (x * n + z * c) * f + 1.9 * i, s + i) * 2 - 1); v *= v; v *= w; w = Math.min(1, v * 1.9); a += v * amp; sum += amp; amp *= 0.5; f *= 2.07; }
  return a / sum;
}
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- kustlijn ----------
const PROF = COAST.profile;
function profAt(x) {
  if (x <= PROF[0][0]) return [PROF[0][1], PROF[0][2]];
  for (let i = 1; i < PROF.length; i++) if (x <= PROF[i][0]) {
    const a = PROF[i - 1], b = PROF[i], t = (x - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t);
    return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
  }
  return [PROF[PROF.length - 1][1], 0];
}
// afstand tot de kust in meter: positief = land (binnen), negatief = zee
export function coastDist(x, z) {
  const [c, hw] = profAt(x);
  let m = hw - Math.abs(z - c);
  m += fbm(x / 9000, z / 9000, 3, 11) * 3600 + fbm(x / 2600, z / 2600, 3, 15) * 1100 + fbm(x / 700, z / 700, 2, 12) * 160;
  // aan de uiteinden (oost en west) ook ronden
  m = Math.min(m, x - 600 + fbm(z / 3000, 1, 2, 13) * 800, W - 600 - x + fbm(z / 3000, 7, 2, 14) * 800);
  // baaien en kapen met een grillige rand
  for (const b of COAST.bays) m = Math.min(m, Math.hypot(x - b.x, (z - b.z) * 1.3) - b.r * (1 + 0.35 * fbm(x / 1500, z / 1500, 2, 16)));
  for (const k of COAST.capes) m = Math.max(m, k.r * (1 + 0.4 * fbm(x / 900, z / 900, 2, 17)) - Math.hypot((x - k.x) * 0.8, z - k.z));
  // nooit tot aan de rand van de wereld: overal water rond het eiland
  m = Math.min(m, z - 800, L - 800 - z);
  return m;
}
// kliffen: de noordkust tussen Northcliff en Black Point, en rond de kapen
function cliffAmount(x, z) {
  let c = 0;
  if (z < 9000) c = Math.max(c, sstep(48000, 56000, x) * (1 - sstep(96000, 104000, x)));
  for (const k of COAST.capes) c = Math.max(c, 1 - sstep(k.r * 0.6, k.r * 2.2, Math.hypot(x - k.x, z - k.z)));
  return c;
}

// ---------- rivieren ----------
const RIV = RIVERS.map(r => {
  const seg = [];
  let s = 0;
  for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], l = Math.hypot(bx - ax, bz - az); seg.push({ ax, az, bx, bz, l, s0: s }); s += l; }
  return { ...r, seg, len: s };
});
function riverNear(x, z) {
  let best = null;
  for (const r of RIV) for (const g of r.seg) {
    const vx = g.bx - g.ax, vz = g.bz - g.az, t = Math.max(0, Math.min(1, ((x - g.ax) * vx + (z - g.az) * vz) / (g.l * g.l)));
    // kronkelen
    const d = Math.hypot(x - g.ax - vx * t, z - g.az - vz * t) + fbm(x / 900, z / 900, 2, 40 + r.w) * 120;
    if (!best || d < best.d) best = { r, d: Math.abs(d), f: (g.s0 + t * g.l) / r.len };
  }
  return best;
}

// ---------- het ruwe landschap ----------
const PLACE_FLAT = PLACES.map(p => ({ x: p.x, z: p.z, r: p.r * 1.25 }));
export function rawHeight(x, z) {
  const m = coastDist(x, z);
  if (m < 0) return Math.max(-45, m * 0.012) - 1.5; // zeebodem
  // vlak bij de kust: strand (laag), verder landinwaarts glooiend
  const inland = sstep(0, 9000, m);
  let h = 1.2 + m * 0.002 + inland * 38 + (fbm(x / 5200, z / 5200, 4, 21) * 0.5 + 0.5) * 70 * inland;
  h += fbm(x / 900, z / 900, 3, 22) * 6 * inland;
  // stranden: de eerste 120 m bijna vlak
  if (m < 140) h = 0.6 + m * 0.012 + (h - 0.6 - m * 0.012) * sstep(60, 140, m);
  // kliffen
  const cl = cliffAmount(x, z);
  if (cl > 0) h = h * (1 - cl) + cl * (Math.max(h, 0) + 55 * sstep(0, 45, m) + 25 * fbm(x / 700, z / 700, 2, 23));
  // heuvels en gebergte
  for (const M of MOUNTAINS) {
    const d = Math.hypot((x - M.x) / M.rx, (z - M.z) / M.rz);
    if (d >= 1.25) continue;
    const mask = (1 - sstep(0.35, 1.2, d)), rid = ridged(x / 3400, z / 3400, 5, 30), det = ridged(x / 1100, z / 1100, 3, 31);
    h += mask * (M.top * 0.55 * (rid * 0.75 + det * 0.25) + M.top * 0.25 * (1 - d));
  }
  for (const P of PEAKS) { const d = Math.hypot(x - P.x, z - P.z); if (d < 5000) h += Math.max(0, P.h - h * 0.6) * Math.exp(-((d / 1700) ** 2)) * 0.55; }
  // steden: rustiger terrein (geen heuvels in het centrum)
  for (const p of PLACE_FLAT) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r) { const k = (1 - sstep(p.r * 0.3, p.r, d)) * 0.55; h = h * (1 - k) + k * (6 + m * 0.0015); } }
  // rivieren: dalen met een bedding die naar de monding daalt
  const rv = riverNear(x, z);
  if (rv && rv.d < 900) {
    const bed = Math.max(0.5, (1 - rv.f) * 90 * (rv.r.name === 'Munk' ? 1 : 0.7)) - 2.5;
    const wv = rv.r.w / 2, k = sstep(wv, wv + 700, rv.d);
    h = Math.min(h, bed + (h - bed) * k + (rv.d > wv ? 2.2 : 0) * (1 - k));
  }
  // meren
  for (const lk of LAKES) { const d = Math.hypot((x - lk.x) / lk.rx, (z - lk.z) / lk.rz); if (d < 1.5) { lk.level ??= null; const bed = lakeLevel(lk) - 1 - 10 * Math.max(0, 1 - d * d); h = d < 1 ? Math.min(h, bed) : Math.min(h, lakeLevel(lk) + 0.6 + (h - lakeLevel(lk)) * sstep(1, 1.5, d)); } }
  return h;
}
const lakeLevels = new Map();
function lakeLevel(lk) {
  let v = lakeLevels.get(lk);
  if (v === undefined) { lakeLevels.set(lk, 0); let m = 1e9; for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; m = Math.min(m, rawHeight(lk.x + Math.cos(t) * lk.rx * 1.55, lk.z + Math.sin(t) * lk.rz * 1.55)); } v = Math.round(m - 2); lakeLevels.set(lk, v); }
  return v;
}
export function lakeAt(x, z) { for (const lk of LAKES) { const d = Math.hypot((x - lk.x) / lk.rx, (z - lk.z) / lk.rz); if (d < 1.5) return { lk, d, level: lakeLevel(lk) }; } return null; }
export function riverAt(x, z) { const r = riverNear(x, z); return r && r.d < r.r.w / 2 + 2 ? r : null; }
export { cliffAmount };
