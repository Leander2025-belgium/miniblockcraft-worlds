// Alpen 50 × 50 km – het ruwe landschap (zonder dalen voor het spoor, dorpen of de oude Reuzenberg).
// Bergketens met diepe dalen, echte hoogtegegevens van de Zugspitze, de Matterhorn en het Mont Blanc-massief
// (AWS Terrarium, open data, raster van 50 m) en één fictieve top van 5000 m: de Hemelhoorn.
// Alles is deterministisch en kan per punt berekend worden (geen grote buffers).
import { noise } from './city.js';
import { DEM } from './dem-data.js';

export const W = 50000, OX = 17920, OZ = 17920, OLD = 14000; // de oude Reuzenberg ligt ongewijzigd in [OX, OX+14000]
export const G = 12;

// ---------- ruis ----------
const ROT = [];
for (let i = 0; i < 8; i++) { const a = i * 0.71 + 0.9; ROT.push([Math.cos(a), Math.sin(a)]); }
export function fbm(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    const [c, n] = ROT[i];
    a += (noise((x * c - z * n) * f + 13.1 * i, (x * n + z * c) * f - 7.7 * i, s + i) * 2 - 1) * amp;
    sum += amp; amp *= 0.5; f *= 2.03;
  }
  return a / sum;
}
export function ridged(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    const [c, n] = ROT[i];
    let v = 1 - Math.abs(noise((x * c - z * n) * f + 3.3 * i, (x * n + z * c) * f + 9.1 * i, s + i) * 2 - 1);
    v *= v; v *= w; w = Math.min(1, v * 1.9);
    a += v * amp; sum += amp; amp *= 0.5; f *= 2.07;
  }
  return a / sum;
}
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- echte hoogtes ----------
function b64(s) {
  if (typeof atob === 'function') { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int16Array(u.buffer); }
  const b = Buffer.from(s, 'base64'); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
// waar de echte bergen in de wereld liggen (cx, cz = midden van de uitsnede = de top), met de echte tophoogte
// en een verlaging van de dalen (de toppen blijven op hun echte hoogte, de dalen sluiten aan op het spel)
const PATCH_DEF = {
  montblanc: { cx: 8500, cz: 39500, target: 4808, valley: 1050, off: 760, name: 'Mont Blanc' },
  matterhorn: { cx: 10500, cz: 13000, target: 4478, valley: 1600, off: 900, name: 'Matterhorn' },
  zugspitze: { cx: 40500, cz: 11000, target: 2962, valley: 1000, off: 420, name: 'Zugspitze' },
};
export const PATCHES = Object.entries(PATCH_DEF).map(([id, p]) => {
  const d = DEM[id], h = b64(d.b64), half = d.size / 2;
  const P = { id, ...p, n: d.n, step: d.step, half, h, fade: 3200, max: d.max };
  // waar ligt de top in de uitsnede (de uitsnede is rond de top gecentreerd, de echte top kan iets ernaast liggen)
  P.px = p.cx + d.peak[0]; P.pz = p.cz + d.peak[1];
  P.bump = 0; P.bump = p.target - remap(P, rawDem(P, P.px, P.pz));
  return P;
});
function rawDem(P, x, z) {
  const u = (x - P.cx + P.half) / P.step, v = (z - P.cz + P.half) / P.step, n = P.n;
  const i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v)));
  const fx = Math.max(0, Math.min(1, u - i)), fz = Math.max(0, Math.min(1, v - j)), H = P.h;
  const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
  // bicubisch-achtig: zachte overgang tussen de rasterpunten
  const sx = fx * fx * (3 - 2 * fx) * 0.5 + fx * 0.5, sz = fz * fz * (3 - 2 * fz) * 0.5 + fz * 0.5;
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}
function remap(P, h) { return h - P.off * (1 - sstep(P.valley - 200, P.target - 600, h)); }
function demAt(P, x, z) {
  const dx = Math.abs(x - P.cx), dz = Math.abs(z - P.cz);
  if (dx >= P.half || dz >= P.half) return null;
  const edge = Math.min(P.half - dx, P.half - dz), w = sstep(0, P.fade, edge);
  if (w <= 0) return null;
  let h = remap(P, rawDem(P, x, z));
  const r2 = (x - P.px) ** 2 + (z - P.pz) ** 2;
  if (r2 < 1e6) h += P.bump * Math.exp(-r2 / (260 * 260));
  // fijne ruis (het raster is 50 m)
  h += fbm(x / 90, z / 90, 3, 700) * 9 * sstep(800, 2500, h);
  return [h, w];
}

// ---------- de fictieve Hemelhoorn (5000 m) ----------
export const HEMEL = { x: 42000, z: 41200, top: 5000 };
function hemel(x, z, wx0, wz0) {
  // dichter bij de top minder vervorming, zodat de top echt op HEMEL ligt
  const k = sstep(900, 5000, Math.hypot(x - HEMEL.x, z - HEMEL.z)), wx = x + (wx0 - x) * k * 0.5, wz = z + (wz0 - z) * k * 0.5;
  const dx = wx - HEMEL.x, dz = wz - HEMEL.z, r = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
  const R = 8200 * (1 + 0.18 * Math.sin(3 * th + 0.4) + 0.08 * Math.sin(5 * th + 1.9));
  const rr = r / R;
  if (rr >= 1) return 0;
  const base = (1 - rr) ** 1.7;
  const rTrue = Math.hypot(x - HEMEL.x, z - HEMEL.z);
  const horn = 600 * Math.exp(-((rTrue / 900) ** 2));
  const rid = ridged(wx / 1300, wz / 1300, 5, 900);
  return 4200 * base + horn + (rid - 0.45) * 900 * base ** 0.6 * (1 - Math.exp(-((rTrue / 700) ** 2)));
}

// ---------- het lage bekken rond de Reuzenberg en Reuzenstad ----------
const BASINS = [
  { x: OX + 7000, z: OZ + 7000, rx: 9300, rz: 9300 },
  { x: 35600, z: 30300, rx: 5200, rz: 3600 },
];
export function basinMask(x, z) {
  let m = 0;
  for (const b of BASINS) { const d = Math.hypot((x - b.x) / b.rx, (z - b.z) / b.rz); m = Math.max(m, 1 - sstep(0.72, 1.18, d)); }
  return m;
}

// ruwe hoogte in meter boven G
export function rawHeight(x, z) {
  const wx = x + 900 * fbm(x / 3400, z / 3400, 3, 600), wz = z + 900 * fbm(x / 3400 + 7, z / 3400 + 3, 3, 610);
  // bergketens: richels met een wisselende hoogte (1000 – 4000 m)
  const amp = 1400 + 1700 * (fbm(x / 12000, z / 12000, 2, 620) * 0.5 + 0.5);
  const big = ridged(wx / 5200, wz / 5200, 3, 630), det = ridged(wx / 1500, wz / 1500, 4, 635);
  const rid = big * 0.72 + det * 0.28 * (0.4 + big);
  let h = 480 + amp * Math.max(0, rid - 0.14) ** 1.35 * 1.25 + fbm(x / 1400, z / 1400, 4, 640) * 140;
  // dalen tussen de ketens (breed en U-vormig)
  const val = Math.abs(fbm(wx / 7000, wz / 7000, 2, 650));
  h = h * (0.35 + 0.65 * sstep(0.02, 0.22, val));
  // echte bergen
  for (const P of PATCHES) { const d = demAt(P, x, z); if (d) h = h * (1 - d[1]) + d[0] * d[1]; }
  // Hemelhoorn
  const hm = hemel(x, z, wx, wz);
  if (hm > 0) h = Math.max(h, hm + h * 0.15 * (1 - hm / 5000));
  if (HEMEL.corr) { const r2 = (x - HEMEL.x) ** 2 + (z - HEMEL.z) ** 2; if (r2 < 4e6) h += HEMEL.corr * Math.exp(-r2 / (420 * 420)); }
  // lage bekken (glooiende heuvels)
  const bm = basinMask(x, z);
  if (bm > 0) { const low = 40 + (fbm(x / 1500, z / 1500, 4, 300) * 0.5 + 0.5) * 75; h = h * (1 - bm) + low * bm; }
  h += fbm(x / 160, z / 160, 3, 660) * 4;
  return h;
}
// de Hemelhoorn precies 5000 m hoog maken
{
  const h0 = rawHeight(HEMEL.x, HEMEL.z);
  HEMEL.corr = HEMEL.top - h0;
}
