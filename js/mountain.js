// Reuzenberg: een zelfgegenereerde wereld van 14 × 14 km met één immens hoge berg (± 1650 m).
// Onderaan dichte loof- en naaldbossen, hoger alpenweiden, rotsen en eeuwige sneeuw.
// Een wandelpad slingert in haarspeldbochten naar de top, een kabelbaan gaat recht omhoog.
// Alles is deterministisch: elke tegel van 128 m kan los gemaakt worden en past op zijn buren.
import { B } from './blocks.js';
import { hash, noise, placeTree } from './city.js';
import { TRAIL_WAYPOINTS } from './mountain-trail.js';
import { makeExtras } from './mountain-extras.js';

export const MW = 14000, ML = 14000, G = 12, T = 128;
export const META = {
  id: 'reuzenberg', name: 'Reuzenberg', kind: 'proc', tile: T,
  tilesX: Math.ceil(MW / T), tilesZ: Math.ceil(ML / T), tiles: Math.ceil(ML / T),
  ground: G, version: 5, superTiles: 4, miniStep: 2, groundColor: [0.33, 0.45, 0.26], maxH: 2048, longView: 16000, smoothLod: true,
};
const PEAK = [7000, 6300];

// ---------- ruis ----------
const ROT = [];
for (let i = 0; i < 8; i++) { const a = i * 0.83 + 0.4; ROT.push([Math.cos(a), Math.sin(a)]); }
function fbm(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    const [c, n] = ROT[i];
    a += (noise((x * c - z * n) * f + 31.7 * i, (x * n + z * c) * f - 17.3 * i, s + i) * 2 - 1) * amp;
    sum += amp; amp *= 0.5; f *= 2.03;
  }
  return a / sum;
}
function ridged(x, z, oct, s) {
  let a = 0, amp = 1, sum = 0, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    const [c, n] = ROT[i];
    let v = 1 - Math.abs(noise((x * c - z * n) * f + 11.1 * i, (x * n + z * c) * f + 5.9 * i, s + i) * 2 - 1);
    v *= v; v *= w; w = Math.min(1, v * 1.8);
    a += v * amp; sum += amp; amp *= 0.5; f *= 2.1;
  }
  return a / sum;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- het natuurlijke landschap ----------
export const LAKE = { x: 10200, z: 10600, r: 520 };
// hoogte in meter boven G (zonder pad en stations)
function natural(x, z) {
  const wx = x + 700 * fbm(x / 2600, z / 2600, 3, 100), wz = z + 700 * fbm(x / 2600 + 9, z / 2600 + 4, 3, 110);
  const dx = wx - PEAK[0], dz = wz - PEAK[1], r = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
  const R = 5900 * (1 + 0.16 * Math.sin(3 * th + 1.0) + 0.09 * Math.sin(5 * th + 2.3) + 0.05 * Math.sin(8 * th));
  const rr = r / R;
  const base = rr < 1 ? (1 - rr) ** 2.1 : 0;
  const rr2 = Math.hypot(x - PEAK[0], z - PEAK[1]);
  const horn = 430 * Math.exp(-((rr2 / 560) ** 2));
  const rid = ridged(wx / 1100, wz / 1100, 5, 200);
  let h = 1720 * base + horn + (rid - 0.42) * 560 * base ** 0.65;
  // glooiende heuvels en kleine bulten in het dal
  h += (fbm(x / 1500, z / 1500, 4, 300) * 0.5 + 0.5) * 75 * (1 - base * 0.6) + 18;
  h += fbm(x / 160, z / 160, 3, 320) * 4 * (0.4 + base);
  // meer in het dal
  const ld = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.35) / LAKE.r;
  if (ld < 1.6) h = h * sstep(0.7, 1.6, ld) + (-9 + 6 * ld) * (1 - sstep(0.7, 1.6, ld));
  return h;
}

// ---------- kabelbaan (in een rechte lijn van zuid naar noord, x = CX) ----------
export const CX = 7000;
const CABLE_Z0 = 11400, CABLE_Z1 = 6620; // dalstation en topstation
const TRACK = 4; // sporen op x = CX ± 4
function stationFloor(z) { return Math.round(G + natural(CX, z)); }
export const STATIONS = [
  { name: 'Dalstation', x: CX, z: CABLE_Z0, y: stationFloor(CABLE_Z0) },
  { name: 'Topstation', x: CX, z: CABLE_Z1, y: stationFloor(CABLE_Z1) },
];
const ST_L = 18, ST_W = 11; // halve lengte (langs z) en halve breedte
export const CABLE_ATTACH = 6.2; // hoogte van de kabel boven de perronvloer
function profileGround(z) {
  let m = -1e9;
  for (const dx of [-6, 0, 6]) m = Math.max(m, G + carvedNatural(CX + dx, z));
  return m;
}
// hoogte boven G mét afgevlakte stations (maar zonder pad) — gebruikt voor de kabel
function carvedNatural(x, z) {
  let h = natural(x, z);
  for (const s of STATIONS) {
    const dx = Math.max(0, Math.abs(x - s.x) - ST_W), dz = Math.max(0, Math.abs(z - s.z) - ST_L);
    const d = Math.hypot(dx, dz);
    if (d < 30) { const t = sstep(0, 30, d); h = (s.y - G) * (1 - t) + h * t; }
  }
  return h;
}
// pylonen: posities langs de lijn (d = afstand vanaf het dalstation) en hoogte van de kabel
export const CABLE = (() => {
  const L = CABLE_Z0 - CABLE_Z1;
  const zAt = (d) => CABLE_Z0 - d;
  const pts = [{ d: ST_L - 2, y: STATIONS[0].y + CABLE_ATTACH, station: 0 }];
  const sagOf = (span) => span * 0.012;
  const clears = (a, ya, b, yb) => {
    const span = b - a, sag = sagOf(span);
    for (let d = a + 4; d < b; d += 4) {
      const t = (d - a) / span, y = ya + (yb - ya) * t - sag * 4 * t * (1 - t);
      if (y - 4.6 - 9 < profileGround(zAt(d))) return false;
    }
    return true;
  };
  const end = L - ST_L + 2, yEnd = STATIONS[1].y + CABLE_ATTACH;
  let cur = pts[0];
  for (let guard = 0; guard < 80; guard++) {
    if ((clears(cur.d, cur.y, end, yEnd) && end - cur.d <= 520) || end - cur.d < 130) { pts.push({ d: end, y: yEnd, station: 1 }); break; }
    let best = null;
    for (let nd = Math.min(end - 40, cur.d + 460); nd >= cur.d + 90 && !best; nd -= 20) {
      const g = profileGround(zAt(nd));
      for (let hgt = 16; hgt <= 60; hgt += 4) if (clears(cur.d, cur.y, nd, g + hgt)) { best = { d: nd, y: g + hgt, h: hgt }; break; }
    }
    if (!best) { const nd = Math.min(end - 40, cur.d + 90); best = { d: nd, y: profileGround(zAt(nd)) + 60, h: 60 }; }
    pts.push(best); cur = best;
  }
  for (const p of pts) p.z = zAt(p.d);
  return { pts, L, z0: CABLE_Z0, z1: CABLE_Z1, track: TRACK, sag: sagOf };
})();
// kabelhoogte op afstand d vanaf het dalstation
export function cableY(d) {
  const P = CABLE.pts;
  if (d <= P[0].d) return P[0].y;
  for (let i = 1; i < P.length; i++) {
    if (d <= P[i].d) {
      const a = P[i - 1], b = P[i], span = b.d - a.d, t = (d - a.d) / span;
      return a.y + (b.y - a.y) * t - CABLE.sag(span) * 4 * t * (1 - t);
    }
  }
  return P[P.length - 1].y;
}
const PYLONS = CABLE.pts.filter(p => p.h).map(p => ({ z: Math.round(p.z), top: Math.round(p.y + 1), ground: Math.round(profileGround(p.z)) }));

// ---------- wandelpad: van het dalstation in haarspeldbochten naar de top ----------
export const naturalHeight = natural;
export const TRAILHEAD = [CX + 30, CABLE_Z0 - 10];
export const SUMMIT_XZ = (() => { // hoogste punt in de buurt van de piek
  let best = [PEAK[0], PEAK[1], -1];
  for (let z = PEAK[1] - 300; z <= PEAK[1] + 300; z += 6) for (let x = PEAK[0] - 300; x <= PEAK[0] + 300; x += 6) {
    const h = natural(x, z); if (h > best[2]) best = [x, z, h];
  }
  return best;
})();
export const TRAIL = (() => {
  let p = [];
  for (let i = 0; i < TRAIL_WAYPOINTS.length; i += 2) p.push([TRAIL_WAYPOINTS[i], TRAIL_WAYPOINTS[i + 1]]);
  if (p.length < 2) p = [TRAILHEAD, [TRAILHEAD[0] + 4, TRAILHEAD[1]]];
  // hoeken afronden (Chaikin)
  for (let it = 0; it < 3; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]); p = q;
  }
  // om de 4 m een punt
  const out = [];
  let carry = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az);
    let d = carry;
    for (; d < L; d += 4) out.push(ax + (bx - ax) * d / L, az + (bz - az) * d / L, 0);
    carry = d - L;
  }
  out.push(p[p.length - 1][0], p[p.length - 1][1], 0);
  const n = out.length / 3, raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = natural(out[i * 3], out[i * 3 + 1]);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { s += raw[j]; c++; }
    out[i * 3 + 2] = s / c;
  }
  return new Float32Array(out);
})();
const TCELL = 32, tgrid = new Map();
for (let i = 0; i + 3 < TRAIL.length / 1; i += 3) {
  if (i + 5 >= TRAIL.length) break;
  const x0 = Math.min(TRAIL[i], TRAIL[i + 3]) - 10, x1 = Math.max(TRAIL[i], TRAIL[i + 3]) + 10;
  const z0 = Math.min(TRAIL[i + 1], TRAIL[i + 4]) - 10, z1 = Math.max(TRAIL[i + 1], TRAIL[i + 4]) + 10;
  for (let cz = Math.floor(z0 / TCELL); cz <= Math.floor(z1 / TCELL); cz++) for (let cx = Math.floor(x0 / TCELL); cx <= Math.floor(x1 / TCELL); cx++) {
    const k = cz * 1000 + cx;
    let l = tgrid.get(k); if (!l) tgrid.set(k, l = []);
    l.push(i);
  }
}
export const TRAIL_LEN = (TRAIL.length / 3 - 1) * 4;
// dichtste punt op het pad: [afstand, padhoogte, index]
function trailNear(x, z) {
  const l = tgrid.get(Math.floor(z / TCELL) * 1000 + Math.floor(x / TCELL));
  if (!l) return null;
  let bd = 1e9, by = 0, bi = 0, sw = 0, sy = 0;
  for (const i of l) {
    const ax = TRAIL[i], az = TRAIL[i + 1], bx = TRAIL[i + 3], bz = TRAIL[i + 4];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    const ty = TRAIL[i + 2] + (TRAIL[i + 5] - TRAIL[i + 2]) * t;
    if (d < bd) { bd = d; by = ty; bi = i / 3; }
    // in haarspeldbochten liggen twee stukken pad dicht bij elkaar: hoogtes mengen (een helling, geen muur)
    if (d < 7) { const w = (1 - d / 7) ** 3 + 1e-4; sw += w; sy += w * ty; }
  }
  return bd < 10 ? [bd, sw ? sy / sw : by, bi] : null;
}

// ---------- uiteindelijke hoogte ----------
const PATH_W = 1.8; // halve breedte van het pad
// hoogte boven G (geheel getal in absolute blokken: G + surfaceAt)
export function surfaceAt(x, z) {
  let h = carvedNatural(x, z);
  const t = trailNear(x, z);
  if (t) {
    const [d, ty] = t;
    if (d <= PATH_W + 0.5) h = ty;
    else { const k = sstep(PATH_W + 0.5, 9, d); h = ty * (1 - k) + h * k; }
  }
  return h;
}
export const heightAt = (x, z) => G + natural(x, z); // voor het verre landschap

// ---------- plaatsen ----------
const SUMMIT = SUMMIT_XZ;
const SUMMIT_COL = [Math.round(SUMMIT_XZ[0]) + 3, Math.round(SUMMIT_XZ[1]) + 3];
const SUMMIT_TOP = Math.round(G + surfaceAt(SUMMIT_COL[0], SUMMIT_COL[1]));
const tp = (f) => { const i = Math.floor((TRAIL.length / 3 - 1) * f) * 3; return [TRAIL[i], TRAIL[i + 1]]; };
export const PLACES = [
  ['Dalstation', CX + 20, CABLE_Z0 + 40], ['Topstation', CX + 20, CABLE_Z1 - 40], ['Top', SUMMIT[0], SUMMIT[1]],
  ['Bergmeer', LAKE.x - LAKE.r - 60, LAKE.z], ['Wandelpad (halfweg)', ...tp(0.5)],
  ['Diep bos', 3600, 11600], ['Bergweide', ...tp(0.8)],
];
export const SPAWN = { x: CX + 20.5, y: STATIONS[0].y + 2, z: CABLE_Z0 + 14.5 };
// dorp, station, skigebied, restaurant, platformen… (bovenop het terrein, de berg zelf blijft gelijk)
export const EXTRAS = makeExtras({ B, G, hash, noise, natural, surfaceAt, TRAIL, STATIONS, SUMMIT: SUMMIT_XZ, LAKE, MW, ML });
PLACES.push(...EXTRAS.PLACES);

// ---------- zones ----------
const snowLine = (x, z) => 1720 + fbm(x / 300, z / 300, 3, 500) * 90;
const rockLine = (x, z) => 1380 + fbm(x / 260, z / 260, 3, 510) * 110;
const treeLine = (x, z) => 1120 + fbm(x / 220, z / 220, 3, 520) * 90;
export function zoneName(x, z) {
  if (x < 0 || z < 0 || x >= MW || z >= ML) return 'Buiten de wereld';
  for (const s of STATIONS) if (Math.abs(x - s.x) < ST_W + 6 && Math.abs(z - s.z) < ST_L + 6) return s.name;
  const ez = EXTRAS.zone(x, z); if (ez) return ez;
  if (Math.hypot(x - SUMMIT[0], z - SUMMIT[1]) < 40) return 'Top van de Reuzenberg';
  const h = natural(x, z);
  if (h < 0) return 'Bergmeer';
  const t = trailNear(x, z);
  const pre = t && t[0] < 3 ? 'Wandelpad · ' : '';
  const hm = Math.round(h);
  let name;
  if (h > snowLine(x, z)) name = 'Eeuwige sneeuw';
  else if (h > rockLine(x, z)) name = 'Rotsen';
  else if (h > treeLine(x, z)) name = 'Alpenweide';
  else if (h > 560) name = 'Naaldbos';
  else if (h > 260) name = 'Gemengd bos';
  else name = 'Loofbos';
  return `${pre}${name} · ${hm} m`;
}
export const zoneAtExport = zoneName;

// kleur voor de overzichtskaart (met heuvelschaduw)
export function overviewColor(x, z, s = 25) {
  const h = natural(x, z), hx = natural(x + s, z), hz = natural(x, z + s);
  const slope = Math.hypot(hx - h, hz - h) / s;
  let c;
  if (h < 0) c = [52, 104, 170];
  else if (h > snowLine(x, z) && slope < 1.4) c = [236, 240, 246];
  else if (h > rockLine(x, z) || slope > 1.1) c = [128, 124, 118];
  else if (h > treeLine(x, z)) c = [122, 160, 78];
  else if (h > 560) c = [38, 82, 46];
  else c = [52, 104, 44];
  const shade = Math.max(0.45, Math.min(1.35, 1 + ((h - hx) * 0.7 + (h - hz) * 0.7) / s * 0.9));
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}
export function trailMapPoints() { return TRAIL; }

// ---------- kolom ----------
let treeKind = 0; // 0 geen, 1 loofboom, 2 spar, 3 struik, 4 rotsblok
function fillColumn(x, z, col, hs) {
  let t = fillColumnBase(x, z, col, hs);
  if (treeKind && EXTRAS.noTrees(x, z)) treeKind = 0;
  if (t >= G) t = EXTRAS.deco(x, z, col, t);
  return t;
}
function fillColumnBase(x, z, col, hs) {
  treeKind = 0;
  const hReal = natural(x, z);
  let h = surfaceAt(x, z);
  const top = Math.round(G + h);
  const slope = hs;
  // ondergrond
  col[0] = B.BEDROCK;
  // water in het meer
  if (top < G - 1) {
    for (let y = 1; y < top; y++) col[y] = B.STONE;
    col[top] = hash(x, z, 5) < 0.5 ? B.SAND : B.GRAVEL;
    for (let y = top + 1; y <= G - 1; y++) col[y] = B.WATER;
    return G - 1;
  }
  for (let y = 1; y < top - 3; y++) col[y] = B.STONE;
  // stations en pylonen
  for (const s of STATIONS) {
    const ax = Math.abs(x - s.x), az = Math.abs(z - s.z);
    if (ax <= ST_W && az <= ST_L) return stationColumn(x - s.x, z - s.z, s, col, s === STATIONS[1]);
  }
  if (Math.abs(x - CX) <= 7) {
    for (const p of PYLONS) {
      if (Math.abs(z - p.z) > 1) continue;
      const ax = Math.abs(x - CX);
      for (let y = top - 3; y <= top; y++) col[y] = B.STONE;
      col[top] = B.CONCRETE;
      if (ax <= 1) {
        for (let y = top + 1; y <= p.top; y++) col[y] = (y - top) % 6 === 0 ? B.PAINT_BLACK : B.METAL;
        col[p.top - 1] = B.METAL; col[p.top] = B.METAL;
        return p.top;
      }
      col[p.top] = B.METAL;
      if (ax >= TRACK - 1 && ax <= TRACK + 1 && z === p.z) { col[p.top + 1] = B.PAINT_BLACK; return p.top + 1; }
      return p.top;
    }
  }
  // topkruis
  const sdx = x - SUMMIT_COL[0], sdz = z - SUMMIT_COL[1];
  if (Math.abs(sdx) <= 2 && Math.abs(sdz) <= 2) {
    for (let y = Math.max(1, top - 3); y <= top; y++) col[y] = B.STONE;
    col[top] = B.COBBLE;
    if (sdx === 0 && sdz === 0) { for (let y = top + 1; y <= SUMMIT_TOP + 8; y++) col[y] = B.LOG; return SUMMIT_TOP + 8; }
    if (sdz === 0 && SUMMIT_TOP + 6 > top) { col[SUMMIT_TOP + 6] = B.LOG; return SUMMIT_TOP + 6; }
    return top;
  }
  // dorp, station, wegen, pistes, gebouwen
  const ex = EXTRAS.column(x, z, col, top, hReal, slope);
  if (ex >= 0) return ex;
  const tr = trailNear(x, z);
  const onPath = tr && tr[0] <= PATH_W;
  const snow = hReal > snowLine(x, z) && slope < 1.5;
  const rock = !snow && (hReal > rockLine(x, z) || slope > 1.15);
  const meadow = !rock && !snow && hReal > treeLine(x, z);
  // bovenlagen
  if (rock || snow) for (let y = Math.max(1, top - 3); y < top; y++) col[y] = strata(x, y, z);
  else for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT;
  if (onPath) {
    col[top] = hReal > rockLine(x, z) ? B.COBBLE : B.GRAVEL;
    // paaltjes met markering langs het pad
    if (tr[0] > PATH_W - 0.8 && tr[2] % 60 === 0 && hash(x, z, 6) < 0.5) {
      col[top + 1] = B.POST; col[top + 2] = B.PAINT_RED; col[top + 3] = B.PAINT_WHITE; return top + 3;
    }
    return top;
  }
  if (h < 2.5 && h > -1.5 && Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.35) < LAKE.r * 1.25) { col[top] = B.SAND; return top; }
  // losse sneeuwvelden onder de sneeuwgrens (vooral in vlakke kommen, meer naar boven toe)
  if (!snow && hReal > snowLine(x, z) - 170 && slope < 0.9 && noise(x / 16, z / 16, 91) > 0.66 - (hReal - snowLine(x, z) + 170) / 420) {
    col[top] = B.SNOW; if (slope < 0.35 && hash(x, z, 92) < 0.3) { col[top + 1] = B.SNOW; return top + 1; } return top;
  }
  if (snow) { col[top] = B.SNOW; if (slope < 0.6 && hash(x, z, 7) < 0.6) { col[top + 1] = B.SNOW; return top + 1; } return top; }
  if (rock) {
    const r = noise(x / 7, z / 7, 8);
    col[top] = r < 0.22 ? B.GRAVEL : strata(x, top, z);
    if (hash(x, z, 9) < 0.004) treeKind = 4;
    return top;
  }
  col[top] = B.GRASS;
  // pleintje rond de stations
  for (const st of STATIONS) {
    const d = Math.hypot(Math.max(0, Math.abs(x - st.x) - ST_W), Math.max(0, Math.abs(z - st.z) - ST_L));
    if (d < 12) { col[top] = (x + z) % 7 === 0 ? B.COBBLE : B.GRAVEL; if (d > 10.5 && (x + 2 * z) % 9 === 0) { col[top + 1] = B.HEDGE; return top + 1; } return top; }
    if (d < 30) { if (hash(x, z, 18) < 0.06) col[top] = B.FLOWERS; return top; }
  }
  // geen bomen onder de kabel en vlak naast het pad
  const corridor = Math.abs(x - CX) < 14 && z < CABLE_Z0 + 30 && z > CABLE_Z1 - 30;
  if (corridor || (tr && tr[0] < PATH_W + 2.5) || slope > 1.05) {
    if (!corridor && !tr && hash(x, z, 11) < 0.01) treeKind = 4;
    return top;
  }
  if (meadow) {
    if (hash(x, z, 12) < 0.05) col[top] = B.FLOWERS;
    if (hash(x, z, 13) < 0.003) treeKind = 4;
    // enkele verdwaalde sparren net boven de boomgrens
    if (hReal < treeLine(x, z) + 60 && treeSpot(x, z, 7, 0.25)) treeKind = 2;
    return top;
  }
  // bos: heel dicht onderaan, iets opener naar boven toe
  const dense = hReal < 560 ? 0.92 : hReal < 900 ? 0.8 : 0.55;
  if (treeSpot(x, z, 4, dense)) {
    const conifer = hReal > 560 || (hReal > 260 && hash(x, z, 14) < (hReal - 260) / 300) || hash(x, z, 15) < 0.12;
    const r = hash(x, z, 19);
    // loofbomen, berken, sparren en dennen
    treeKind = conifer ? (hReal > 280 && hReal < 950 && r < 0.3 ? 6 : 2) : (r < 0.28 ? 5 : 1);
  } else if (hash(x, z, 16) < 0.035) treeKind = 3;
  else if (hash(x, z, 20) < 0.004) treeKind = 7;
  else if (hash(x, z, 17) < 0.02) col[top] = B.FLOWERS;
  return top;
}
// gesteentelagen (zichtbaar in steile wanden)
function strata(x, y, z) {
  const band = Math.floor((y + noise(x / 60, z / 60, 93) * 9) / 3) % 5;
  return band === 0 ? B.GRANITE : band === 2 ? B.ASHLAR : band === 4 && hash(x, z, y) < 0.5 ? B.GRAVEL : B.STONE;
}
// boomplekken op een rooster van s × s m met een willekeurige plek per vak
function treeSpot(x, z, s, p) {
  const cx = Math.floor(x / s), cz = Math.floor(z / s);
  return x - cx * s === Math.floor(hash(cx, cz, 41) * s) && z - cz * s === Math.floor(hash(cx, cz, 42) * s) && hash(cx, cz, 43) < p;
}

// dal- en topstation: perron, glazen gevels, plat dak, open waar de kabel binnenkomt
function stationColumn(dx, dz, s, col, isTop) {
  const fy = s.y, ax = Math.abs(dx), az = Math.abs(dz);
  for (let y = 1; y < fy; y++) col[y] = B.STONE;
  col[fy] = ax <= 1 && az <= ST_L - 3 ? B.LINE_YELLOW : B.TILE;
  const roof = fy + 10;
  const wallX = ax === ST_W, wallZ = az === ST_L;
  const cableOpen = wallZ && ax <= TRACK + 3 && (isTop ? dz > 0 : dz < 0); // kabelkant
  const door = (wallX && az <= 2) || (wallZ && ax <= 2 && !cableOpen);
  if (wallX || wallZ) {
    for (let y = fy + 1; y < roof; y++) {
      if (cableOpen && y <= fy + 8) continue;
      if (door && y <= fy + 3) continue;
      const corner = wallX && wallZ;
      col[y] = corner || y === fy + 1 || y === roof - 1 || (wallX ? dz : dx) % 6 === 0 ? B.PANEL_DARK : B.GLASS_BLUE;
    }
  }
  // grote wielen van de kabel aan de bergkant
  if (az >= ST_L - 4 && az <= ST_L - 2 && (isTop ? dz < 0 : dz > 0) && ax >= TRACK - 1 && ax <= TRACK + 1) {
    for (let y = fy + 1; y <= fy + 6; y++) col[y] = B.METAL;
  }
  // bankjes en een lamp
  if (ax === ST_W - 2 && az % 6 === 3 && az < ST_L - 4) col[fy + 1] = B.PLANKS;
  col[roof] = (ax + az) % 9 === 0 ? B.LAMP : B.PANEL_WHITE;
  if (ax === ST_W && az === ST_L) col[roof + 1] = B.PAINT_RED;
  if (!wallX && !wallZ && dx === 0 && dz === 0) { /* midden van de hal */ }
  if (ax <= 3 && az <= 1 && !isTop) { for (let y = roof + 1; y <= roof + 2; y++) col[y] = B.PAINT_RED; return roof + 2; }
  return roof;
}

// ---------- berk en den ----------
function placeBirch(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.BIRCH_LOG, true);
  for (let y = gy + th - 3; y <= gy + th + 1; y++) {
    const r = y >= gy + th ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r + 0.5 || (dx === 0 && dz === 0 && y <= gy + th)) continue;
      if (Math.abs(dx) + Math.abs(dz) === 2 * r && hash(x + dx, z + dz, y) < 0.6) continue;
      set(x + dx, y, z + dz, B.BIRCH_LEAVES, false);
    }
  }
}
function placePine(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.LOG, true);
  for (let y = gy + th - 2; y <= gy + th + 1; y++) {
    const r = y === gy + th + 1 ? 1 : y === gy + th - 2 ? 2 : 3;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r || (dx === 0 && dz === 0 && y <= gy + th)) continue;
      if (hash(x + dx, z + dz, y + 3) < 0.15) continue;
      set(x + dx, y, z + dz, B.PINE_LEAVES, false);
    }
  }
}
// ---------- spar ----------
function placeSpruce(x, z, gy, th, set) {
  for (let y = gy + 1; y <= gy + th; y++) set(x, y, z, B.LOG, true);
  const crownStart = gy + 3 + (th > 12 ? 1 : 0);
  for (let y = crownStart; y <= gy + th + 1; y++) {
    const f = (gy + th + 1 - y) / (gy + th + 1 - crownStart); // 1 onderaan, 0 bovenaan
    const r = Math.max(0, Math.round(f * (th > 12 ? 3.4 : 2.6) * (((y - crownStart) % 2) ? 0.75 : 1)));
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r + 0.6) continue;
      if (dx === 0 && dz === 0 && y <= gy + th) continue;
      set(x + dx, y, z + dz, B.SPRUCE, false);
    }
  }
  set(x, gy + th + 1, z, B.SPRUCE, false); set(x, gy + th + 2, z, B.SPRUCE, false);
}

// ---------- tegel maken ----------
export function generateTile(tx, tz) {
  const X0 = tx * T, Z0 = tz * T, P = 4, N = T + 2 * P + 1;
  // eerst alle hoogtes (ook net buiten de tegel) voor de helling
  const hgt = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) hgt[z * N + x] = natural(X0 + x - P, Z0 + z - P);
  const cols = new Array(T * T);
  const col = new Uint8Array(2200);
  const trees = [];
  let lo = 1e9, hi = 0;
  for (let z = -P; z < T + P; z++) for (let x = -P; x < T + P; x++) {
    const gx = X0 + x, gz = Z0 + z;
    if (gx < 0 || gz < 0 || gx >= MW || gz >= ML) continue;
    const inside = x >= 0 && z >= 0 && x < T && z < T;
    const i0 = (z + P) * N + (x + P);
    const slope = Math.max(Math.abs(hgt[i0 + 1] - hgt[i0]), Math.abs(hgt[i0 + N] - hgt[i0]), Math.abs(hgt[i0 - 1] - hgt[i0]), Math.abs(hgt[i0 - N] - hgt[i0]));
    if (!inside) {
      // buiten de tegel: enkel boomkruinen die over de rand hangen
      const tp = fillColumn(gx, gz, spare, slope);
      if (treeKind === 1 || treeKind === 2 || treeKind === 5 || treeKind === 6) trees.push(x, z, tp, treeKind);
      continue;
    }
    col.fill(0);
    const top = fillColumn(gx, gz, col, slope);
    const i = z * T + x;
    cols[i] = col.slice(0, top + 1);
    // laagste vaste grond (ook buren) bepaalt waar de tegel begint
    const ground = Math.round(G + Math.min(hgt[i0], hgt[i0 + 1], hgt[i0 - 1], hgt[i0 + N], hgt[i0 - N], surfaceAt(gx, gz)));
    if (ground < lo) lo = ground;
    if (top > hi) hi = top;
    if (treeKind) trees.push(x, z, top, treeKind);
  }
  const Y0 = Math.max(0, lo - 24);
  const H = Math.min(2040 - Y0, Math.ceil((hi + 26 - Y0) / 8) * 8);
  // hoogte van de grond net naast de tegel (zodat de rand geen muur wordt zolang de buur nog niet geladen is)
  const edge = new Int16Array(4 * T);
  for (let i = 0; i < T; i++) {
    edge[i] = Math.round(G + surfaceAt(X0 - 1, Z0 + i)); edge[T + i] = Math.round(G + surfaceAt(X0 + T, Z0 + i));
    edge[2 * T + i] = Math.round(G + surfaceAt(X0 + i, Z0 - 1)); edge[3 * T + i] = Math.round(G + surfaceAt(X0 + i, Z0 + T));
  }
  const vox = new Uint8Array(T * T * H);
  for (let i = 0; i < T * T; i++) if (cols[i]) {
    const c = cols[i];
    vox.set(c.subarray(Y0, Math.min(c.length, Y0 + H)), i * H);
  }
  const set = (x, y, z, b, force) => {
    y -= Y0;
    if (x < 0 || z < 0 || x >= T || z >= T || y < 0 || y >= H) return;
    const i = (z * T + x) * H + y;
    if (!vox[i] || force) vox[i] = b;
  };
  for (let i = 0; i < trees.length; i += 4) {
    const x = trees[i], z = trees[i + 1], gy = trees[i + 2], k = trees[i + 3], r = hash(x + X0, z + Z0, 44);
    if (k === 1) placeTree(x, z, gy, 5 + Math.floor(r * 4), null, set);
    else if (k === 2) placeSpruce(x, z, gy, 8 + Math.floor(r * 9), set);
    else if (k === 3) { const lb = r < 0.5 ? B.LEAVES : B.BIRCH_LEAVES; set(x, gy + 1, z, lb); if (r < 0.4) set(x + 1, gy + 1, z, lb); if (r > 0.8) set(x, gy + 2, z, lb); }
    else if (k === 5) placeBirch(x, z, gy, 6 + Math.floor(r * 4), set);
    else if (k === 6) placePine(x, z, gy, 11 + Math.floor(r * 6), set);
    else if (k === 7) { set(x, gy + 1, z, B.MOSSY_STONE, true); set(x + 1, gy + 1, z, B.MOSSY_STONE, true); if (r < 0.5) set(x, gy + 2, z, B.MOSSY_STONE, true); }
    else if (k === 4) { // rotsblok
      const s = 1 + Math.floor(r * 2.5);
      for (let dz = -s; dz <= s; dz++) for (let dx = -s; dx <= s; dx++) for (let dy = 0; dy <= s; dy++) {
        if (dx * dx + dz * dz + dy * dy * 1.6 <= s * s + 0.5) set(x + dx, gy + dy, z + dz, hash(x + dx, z + dz, dy) < 0.3 ? B.COBBLE : B.STONE, true);
      }
    }
  }
  // wandelaars op het pad
  const paths = [];
  let run = [];
  const flush = () => { if (run.length >= 6) paths.push({ type: 'walk', pts: new Float32Array(run) }); run = []; };
  for (let i = 0; i < TRAIL.length; i += 3) {
    const x = TRAIL[i] - X0, z = TRAIL[i + 1] - Z0;
    if (x < -4 || z < -4 || x > T + 4 || z > T + 4) { flush(); continue; }
    run.push(x, z, Math.round(G + surfaceAt(TRAIL[i], TRAIL[i + 1])));
  }
  flush();
  paths.push(...EXTRAS.paths(X0, Z0, T)); // wegen, spoor, haltes
  return { vox, H, y0: Y0, edge, ground: G, paths };
}
const spare = new Uint8Array(2200);
