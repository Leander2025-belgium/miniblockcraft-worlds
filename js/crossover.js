// Overloopwissels tussen twee spoorlijnen die een eind naast elkaar lopen (Greenisland, Alpen).
// Waar twee dubbelsporige lijnen minstens 420 m evenwijdig naast elkaar liggen (8–22 m uit elkaar, op dezelfde
// hoogte, boven de grond, minstens 120 m van een perron) komt in het midden een verbindingsspoor in een S-bocht:
// één voor elke rijrichting. Een trein rijdt zo van het spoor van lijn A naar het spoor van lijn B.
// Dezelfde verbindingen worden gebruikt door de wereldgenerator (ballast en rails), door de 3D-wissels
// (js/railinfra.js) en door de zelf bestuurde trein (js/rail.js), zodat alles op dezelfde plek ligt.
const STEP = 2, LEN = 180, VMAX = 40 / 3.6; // verbindingsspoor 180 m, wissels met 40 km/h

class Crossover {
  constructor(id, A, B, aDir, sA, bdir, pts, sBend) {
    this.id = id; this.A = A; this.B = B; this.aDir = aDir; this.sA = sA; this.bdir = bdir; this.sBend = sBend;
    this.connector = true; this.stations = []; this.kind = 0; this.single = true;
    this.name = B.name || B.id; this.pts = pts;
    const n = pts.length / 3; this.n = n; this.cum = new Float32Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 2] - pts[i * 3 - 1]);
    this.len = this.cum[n - 1];
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, pts[i * 3]); x1 = Math.max(x1, pts[i * 3]); z0 = Math.min(z0, pts[i * 3 + 2]); z1 = Math.max(z1, pts[i * 3 + 2]); }
    this.box = { x0: x0 - 4, x1: x1 + 4, z0: z0 - 4, z1: z1 + 4 };
  }
  limAt() { return VMAX; }
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const P = this.pts, f = (s - this.cum[lo]) / Math.max(1e-6, this.cum[hi] - this.cum[lo]);
    const ax = P[lo * 3], ay = P[lo * 3 + 1], az = P[lo * 3 + 2], bx = P[hi * 3], by = P[hi * 3 + 1], bz = P[hi * 3 + 2];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    out.x = ax + (bx - ax) * f; out.y = ay + (by - ay) * f; out.z = az + (bz - az) * f;
    out.tx = (bx - ax) / l; out.tz = (bz - az) / l; out.grade = (by - ay) / l; out.kind = 0; out.s = s;
    return out;
  }
  // dichtste punt op het verbindingsspoor (voor de wereldgenerator): { d, y, s } of null
  near(x, z, maxd = 4) {
    const b = this.box; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return null;
    const P = this.pts; let best = null;
    for (let i = 0; i + 1 < this.n; i++) {
      const ax = P[i * 3], az = P[i * 3 + 2], bx = P[i * 3 + 3], bz = P[i * 3 + 5], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)), dx = x - ax - vx * t, dz = z - az - vz * t, d = Math.hypot(dx, dz);
      if (d <= maxd && (!best || d < best.d)) best = { d, y: P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * t, s: this.cum[i] + t * Math.sqrt(L2), c: this };
    }
    return best;
  }
}

const smooth = (t) => t * t * (3 - 2 * t);
export function buildCrossovers(lines, trackOffset) {
  const out = [];
  const rails = lines.filter(L => !L.tram && !L.bus && !L.metro && !L.single && !L.rack);
  const nearStation = (L, s, m) => L.stations.some(st => Math.abs(s - (st.s0 + st.s1) / 2) < (st.s1 - st.s0) / 2 + m);
  for (const A of rails) for (const Bl of rails) {
    if (A.id >= Bl.id) continue;
    const p = {}, q = {};
    let run = null;
    const flush = () => {
      if (run && run.s1 - run.s0 >= 420) {
        const mid = Math.round((run.s0 + run.s1) / 2);
        for (const aDir of [1, -1]) {
          const sA = mid - aDir * (LEN + 30);
          const pts = []; let bdir = 0, sB = 0;
          for (let d = 0; d <= LEN + 1e-6; d += STEP) {
            const t = d / LEN, s = sA + aDir * d;
            A.at(s, p);
            const oA = trackOffset(A, s) * aDir, ax = p.x - p.tz * oA, az = p.z + p.tx * oA;
            const r = Bl.near(Math.floor(ax), Math.floor(az), 40); if (!r) { pts.length = 0; break; }
            Bl.at(r.s, q);
            if (!bdir) bdir = q.tx * p.tx * aDir + q.tz * p.tz * aDir > 0 ? 1 : -1;
            const oB = trackOffset(Bl, r.s) * bdir, bx = q.x - q.tz * oB, bz = q.z + q.tx * oB, w = smooth(t);
            pts.push(ax + (bx - ax) * w, Math.round(p.y + (q.y - p.y) * w), az + (bz - az) * w);
            sB = r.s;
          }
          if (pts.length < 30) continue;
          out.push(new Crossover(`X${out.length + 1}`, A, Bl, aDir, sA, bdir, new Float32Array(pts), sB));
        }
      }
      run = null;
    };
    for (let s = 400; s < A.len - 400; s += 20) {
      A.at(s, p);
      const r = Bl.near(Math.floor(p.x), Math.floor(p.z), 30);
      let ok = r && r.d >= 8 && r.d <= 22 && Math.abs(r.y - p.y) < 1.2 && p.kind === 0 && r.kind === 0 && Math.abs(p.grade || 0) < 0.03;
      if (ok) { Bl.at(r.s, q); ok = Math.abs(q.tx * p.tx + q.tz * p.tz) > 0.98 && !nearStation(A, s, 120) && !nearStation(Bl, r.s, 120) && r.s > 300 && r.s < Bl.len - 300; }
      if (ok) { if (!run) run = { s0: s }; run.s1 = s; } else flush();
    }
    flush();
  }
  return out;
}
// snel opzoeken voor de wereldgenerator
export function crossoverNear(list, x, z, maxd = 3) {
  let best = null;
  for (const c of list) { const r = c.near(x, z, maxd); if (r && (!best || r.d < best.d)) best = r; }
  return best;
}
