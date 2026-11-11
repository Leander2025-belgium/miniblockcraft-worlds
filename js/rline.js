// Algemene spoorlijn (bochten, hellingsprofiel, tunnels, viaducten, stations) – gebruikt door Greenisland.
// (Dezelfde rekenwijze als js/alpen-net.js, maar met een grondfunctie als parameter.)
export const TRACK = 2.5, BED = 5.4;
const STEP = 4;
export class RLine {
  constructor(id, plan, way, ground, cover) {
    this.id = id; this.plan = plan; this.name = plan.name; this.color = plan.color; this.rack = !!plan.rack;
    this.maxGrade = plan.maxGrade || (plan.high ? 0.035 : 0.025);
    // dieper dan 'tun' onder de grond = tunnel, anders een (breed) dal of een sleuf
    this.tun = plan.tun || 150;
    this.single = !!plan.rack; // tandradbanen: enkelspoor met kruisingssporen in de stations
    // hoeken afronden (Chaikin), het oude stuk blijft precies zoals het is
    const parts = []; let cur = [];
    for (const q of way) cur.push(q);
    parts.push(cur);
    const xs = [], zs = [], fixedY = [];
    for (const p of parts) {
      let q = p.map(a => [a[0], a[1]]);
      for (let it = 0; it < 1; it++) {
        const r = [q[0]];
        for (let i = 0; i < q.length - 1; i++) { const a = q[i], b = q[i + 1]; r.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
        r.push(q[q.length - 1]); q = r;
      }
      for (let i = 0; i < q.length - 1; i++) {
        const [ax, az] = q[i], [bx, bz] = q[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / STEP));
        for (let k = 0; k < n; k++) { xs.push(ax + (bx - ax) * k / n); zs.push(az + (bz - az) * k / n); fixedY.push(NaN); }
      }
      xs.push(q[q.length - 1][0]); zs.push(q[q.length - 1][1]); fixedY.push(NaN);
    }
    // dubbele punten (aansluitingen) weg
    const X = [], Z = [], F = [];
    for (let i = 0; i < xs.length; i++) { const n = X.length; if (n && Math.hypot(xs[i] - X[n - 1], zs[i] - Z[n - 1]) < 0.5) continue; X.push(xs[i]); Z.push(zs[i]); F.push(fixedY[i]); }
    this.n = X.length; this.x = Float32Array.from(X); this.z = Float32Array.from(Z); this.fixed = Float32Array.from(F);
    this.s = new Float32Array(this.n);
    for (let i = 1; i < this.n; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    this.len = this.s[this.n - 1];
    this.y = new Float32Array(this.n); this.kind = new Uint8Array(this.n); // 0 open, 1 tunnel, 2 viaduct, 3 oud spoor
    this.ground = new Float32Array(this.n);
    // grond om de 16 m berekenen en daartussen interpoleren (het profiel wordt toch over 240 m afgevlakt)
    for (let i = 0; i < this.n; i += 4) this.ground[i] = ground(this.x[i], this.z[i]);
    this.ground[this.n - 1] = ground(this.x[this.n - 1], this.z[this.n - 1]);
    for (let i = 0; i < this.n - 1; i++) if (i % 4) { const a = i - (i % 4), b = Math.min(this.n - 1, a + 4), t = (i - a) / (b - a || 1); this.ground[i] = this.ground[a] + (this.ground[b] - this.ground[a]) * t; }
    // 'cover' = wat er boven het spoor ligt (onder zee: de zee zelf telt mee, dan wordt het een tunnel)
    if (cover) { this.cover = new Float32Array(this.n); for (let i = 0; i < this.n; i += 4) this.cover[i] = cover(this.x[i], this.z[i]); this.cover[this.n - 1] = cover(this.x[this.n - 1], this.z[this.n - 1]); for (let i = 0; i < this.n - 1; i++) if (i % 4) { const a = i - (i % 4), b = Math.min(this.n - 1, a + 4), t = (i - a) / (b - a || 1); this.cover[i] = this.cover[a] + (this.cover[b] - this.cover[a]) * t; } }
    this.anchors = [];
    this.stations = [];
  }
  idx(s) { let lo = 0, hi = this.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; } return lo; }
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.len, s));
    const lo = this.idx(s), hi = Math.min(this.n - 1, lo + 1), t = (s - this.s[lo]) / ((this.s[hi] - this.s[lo]) || 1);
    out.x = this.x[lo] + (this.x[hi] - this.x[lo]) * t; out.z = this.z[lo] + (this.z[hi] - this.z[lo]) * t; out.y = this.y[lo] + (this.y[hi] - this.y[lo]) * t;
    const a = Math.max(0, lo - 2), b = Math.min(this.n - 1, lo + 3);
    out.tx = this.x[b] - this.x[a]; out.tz = this.z[b] - this.z[a]; const l = Math.hypot(out.tx, out.tz) || 1; out.tx /= l; out.tz /= l;
    out.grade = (this.y[b] - this.y[a]) / ((this.s[b] - this.s[a]) || 1);
    out.kind = this.kind[lo];
    return out;
  }
  // stations zoeken: rechte stukken rond de geplande plek
  findStations() {
    for (const v of this.plan.via) {
      if (v.old || v.wp) continue;
      let best = 0, bd = 1e18;
      for (let i = 0; i < this.n; i++) { const d = (this.x[i] - v.x) ** 2 + (this.z[i] - v.z) ** 2; if (d < bd) { bd = d; best = i; } }
      const s = this.s[best], h = v.len / 2;
      this.stations.push({ name: v.name, s, s0: Math.max(0, s - h), s1: Math.min(this.len, s + h), len: v.len, hbf: v.hbf ?? v.central, central: v.central, intl: v.intl, line: this.id });
    }
  }
  // hellingsprofiel: dicht bij de grond, nooit steiler dan toegestaan, stations vlak
  profile(levels) {
    const n = this.n, g = this.maxGrade, ds = STEP;
    const fix = new Float32Array(n).fill(NaN);
    for (let i = 0; i < n; i++) if (!isNaN(this.fixed[i])) fix[i] = this.fixed[i];
    // stationshoogtes: zo dicht mogelijk bij de grond, maar haalbaar met de toegestane helling
    const key = (st) => st.name + (st.hbf !== undefined ? '' : ':' + this.id);
    const pts = [];
    for (let i = 0; i < n; i += 25) if (!isNaN(fix[i])) pts.push({ s: this.s[i], y: fix[i], fixed: true });
    for (const st of this.stations) {
      if (st.old) continue;
      const known = levels.get(key(st)) ?? levels.get(st.name);
      let sum = 0, c = 0; for (let i = this.idx(st.s0); i <= this.idx(st.s1); i++) { sum += this.ground[i]; c++; }
      pts.push({ s: st.s, y: known ?? Math.round(sum / c + 0.5), fixed: known !== undefined, st });
    }
    pts.sort((a, b) => a.s - b.s);
    const gg = g * 0.8;
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < pts.length; i++) if (!pts[i].fixed) { const d = pts[i].s - pts[i - 1].s; pts[i].y = Math.max(pts[i - 1].y - gg * d, Math.min(pts[i - 1].y + gg * d, pts[i].y)); }
      for (let i = pts.length - 2; i >= 0; i--) if (!pts[i].fixed) { const d = pts[i + 1].s - pts[i].s; pts[i].y = Math.max(pts[i + 1].y - gg * d, Math.min(pts[i + 1].y + gg * d, pts[i].y)); }
    }
    for (const p of pts) if (p.st) {
      const st = p.st, y = Math.round(p.y);
      if (!levels.has(key(st))) levels.set(key(st), y);
      if (!levels.has(st.name)) levels.set(st.name, y);
      st.y = y;
      for (let i = this.idx(st.s0 - 30); i <= Math.min(n - 1, this.idx(st.s1 + 30)); i++) fix[i] = y;
    }
    for (const a of this.anchors) fix[this.idx(a.s)] = a.y;
    // gewenste hoogte: de grond, maar afgevlakt (een spoorlijn volgt de grote vorm)
    const want = new Float32Array(n), W = Math.round(240 / ds);
    let acc = 0; const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + this.ground[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - W), b = Math.min(n, i + W + 1); want[i] = (pre[b] - pre[a]) / (b - a) + 1; }
    void acc;
    // grenzen vanuit de vaste punten (zo blijft elke helling haalbaar)
    const up = new Float32Array(n).fill(1e9), lo = new Float32Array(n).fill(-1e9);
    let last = -1;
    for (let i = 0; i < n; i++) { if (!isNaN(fix[i])) last = i; if (last >= 0) { const d = this.s[i] - this.s[last]; up[i] = Math.min(up[i], fix[last] + g * d); lo[i] = Math.max(lo[i], fix[last] - g * d); } }
    last = -1;
    for (let i = n - 1; i >= 0; i--) { if (!isNaN(fix[i])) last = i; if (last >= 0) { const d = this.s[last] - this.s[i]; up[i] = Math.min(up[i], fix[last] + g * d); lo[i] = Math.max(lo[i], fix[last] - g * d); } }
    const y = this.y;
    for (let i = 0; i < n; i++) y[i] = !isNaN(fix[i]) ? fix[i] : Math.max(lo[i], Math.min(up[i], want[i]));
    // helling begrenzen (heen en terug), vaste punten blijven
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < n; i++) if (isNaN(fix[i])) { const d = this.s[i] - this.s[i - 1]; y[i] = Math.max(y[i - 1] - g * d, Math.min(y[i - 1] + g * d, y[i])); }
      for (let i = n - 2; i >= 0; i--) if (isNaN(fix[i])) { const d = this.s[i + 1] - this.s[i]; y[i] = Math.max(y[i + 1] - g * d, Math.min(y[i + 1] + g * d, y[i])); }
    }
    // zachte overgangen (verticale bogen), behalve op vaste punten
    for (let it = 0; it < 3; it++) for (let i = 1; i < n - 1; i++) if (isNaN(fix[i])) y[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4;
    this.classify();
  }
  classify() {
    const n = this.n, k = this.kind;
    for (let i = 0; i < n; i++) {
      if (!isNaN(this.fixed[i])) { k[i] = 3; continue; }
      const d = (this.cover ? this.cover[i] : this.ground[i]) - this.y[i];
      k[i] = d > this.tun ? 1 : ((this.cover ? this.cover[i] : this.ground[i]) - this.y[i]) < -8 ? 2 : 0;
    }
    // te korte tunnels en viaducten weglaten (open sleuf of dijk), korte onderbrekingen opvullen
    const runs = (kind, min, fill) => {
      for (let i = 0; i < n;) {
        if (k[i] !== kind) { i++; continue; }
        let j = i; while (j < n && k[j] === kind) j++;
        if ((this.s[Math.min(n - 1, j)] - this.s[i]) < min) for (let a = i; a < j; a++) k[a] = fill;
        i = j;
      }
    };
    runs(1, 80, 0); runs(2, 24, 0);
    // stations nooit in een tunnel
    for (const st of this.stations) if (!st.old) { const m = this.single ? 100 : 20; for (let i = this.idx(st.s0 - m); i <= this.idx(st.s1 + m); i++) if (k[i] === 1) k[i] = 0; }
    // tunnels: korte open stukken tussen twee tunnels dicht
    for (let i = 0; i < n;) {
      if (k[i] !== 0) { i++; continue; }
      let j = i; while (j < n && k[j] === 0) j++;
      if (i > 0 && j < n && k[i - 1] === 1 && k[j] === 1 && this.s[j] - this.s[i] < 40) for (let a = i; a < j; a++) k[a] = 1;
      i = j;
    }
    this.tunnels = []; this.viaducts = [];
    for (let i = 0; i < n;) {
      const kk = k[i]; let j = i; while (j < n && k[j] === kk) j++;
      if (kk === 1) this.tunnels.push([this.s[i], this.s[j - 1]]);
      if (kk === 2) this.viaducts.push([this.s[i], this.s[j - 1]]);
      i = j;
    }
  }
  buildGrid() {
    this.grid = new Map(); const C = 64, R = 70;
    for (let i = 0; i < this.n - 1; i++) {
      const x0 = Math.min(this.x[i], this.x[i + 1]) - R, x1 = Math.max(this.x[i], this.x[i + 1]) + R, z0 = Math.min(this.z[i], this.z[i + 1]) - R, z1 = Math.max(this.z[i], this.z[i + 1]) + R;
      for (let cz = Math.floor(z0 / C); cz <= Math.floor(z1 / C); cz++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
        const key = cz * 4096 + cx; let l = this.grid.get(key); if (!l) this.grid.set(key, l = []); if (l[l.length - 1] !== i) l.push(i);
      }
    }
  }
  // dichtste punt: { d, sd (+ = rechts van de rijrichting), s, y, i }
  near(x, z, reach = 70) {
    const l = this.grid.get(Math.floor(z / 64) * 4096 + Math.floor(x / 64));
    if (!l) return null;
    let bd = 1e9, bi = 0, bt = 0, sg = 1;
    for (const i of l) {
      const ax = this.x[i], az = this.z[i], vx = this.x[i + 1] - ax, vz = this.z[i + 1] - az, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      const dx = x - ax - vx * t, dz = z - az - vz * t, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; bt = t; sg = vx * dz - vz * dx > 0 ? 1 : -1; }
    }
    bd = Math.sqrt(bd);
    if (bd > reach) return null;
    const i = bi, t = bt;
    return { d: bd, sd: bd * sg, s: this.s[i] + (this.s[i + 1] - this.s[i]) * t, y: this.y[i] + (this.y[i + 1] - this.y[i]) * t, i, kind: this.kind[t < 0.5 ? i : i + 1] };
  }
  stationAt(s) { for (const st of this.stations) if (s >= st.s0 - 2 && s <= st.s1 + 2) return st; return null; }
  inTunnel(s) { for (const [a, b] of this.tunnels) if (s >= a && s <= b) return true; return false; }
}

