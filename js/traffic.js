// Verkeer: auto's, bussen, trams, treinen en voetgangers op een echt netwerk van wegen en sporen.
// De paden van alle geladen tegels worden aan elkaar gekoppeld: voertuigen rijden over tegelgrenzen,
// slaan af op kruispunten, houden afstand, bussen stoppen aan haltes, trams en treinen aan perrons.
// Trams en treinen bestaan alleen waar er echt sporen liggen.
import * as THREE from 'three';
import { buildModels, CAR_COLORS, BUS_COLORS, TRAM_COLORS, SHIRTS, PANTS, SKIN, HAIR } from './vehicles.js';

const NET_OF = { car: 'road', carM: 'road', walk: 'walk', tram: 'tram', train: 'rail' };
const RANGE = 430;          // verkeer rond de speler
const GAUGE = 1.435 / 2;    // halve spoorbreedte

// ---------- netwerk ----------
// lijn (x, z, y in tegelcoördinaten) knippen tot de tegel zelf, zodat buren precies aansluiten
function clipRuns(src, T) {
  const runs = []; let run = [];
  const inside = (x, z) => x >= 0 && z >= 0 && x <= T && z <= T;
  const flush = () => { if (run.length >= 6) runs.push(run); run = []; };
  for (let i = 0; i + 5 < src.length; i += 3) {
    let ax = src[i], az = src[i + 1], ay = src[i + 2], bx = src[i + 3], bz = src[i + 4], by = src[i + 5];
    // Liang–Barsky
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    const clip = (p, q) => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    };
    if (!(clip(-dx, ax) && clip(dx, T - ax) && clip(-dz, az) && clip(dz, T - az))) { flush(); continue; }
    const p0 = [ax + dx * t0, az + dz * t0, ay + (by - ay) * t0], p1 = [ax + dx * t1, az + dz * t1, ay + (by - ay) * t1];
    if (!run.length || t0 > 0) { flush(); run.push(...p0); }
    run.push(...p1);
    if (t1 < 1) flush();
  }
  flush();
  return runs.filter(r => r.length >= 6 && Math.hypot(r[r.length - 3] - r[0], r[r.length - 2] - r[1]) > 0.3);
}

function makeEdge(id, net, pts, major) {
  const n = pts.length / 3, cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
  const tan = (a, b) => { const dx = pts[b * 3] - pts[a * 3], dz = pts[b * 3 + 2] - pts[a * 3 + 2], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  return { id, net, pts, cum, len: cum[n - 1], major, next: [[], []], stops: [],
    t0: tan(0, Math.min(1, n - 1)), t1: tan(Math.max(0, n - 2), n - 1) };
}
// punt op een rand op afstand d
function at(e, d, out) {
  const c = e.cum, n = c.length;
  d = Math.max(0, Math.min(e.len, d));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
  const t = (d - c[lo]) / ((c[hi] - c[lo]) || 1), p = e.pts, a = lo * 3, b = hi * 3;
  out.x = p[a] + (p[b] - p[a]) * t; out.y = p[a + 1] + (p[b + 1] - p[a + 1]) * t; out.z = p[a + 2] + (p[b + 2] - p[a + 2]) * t;
  out.tx = (p[b] - p[a]); out.tz = (p[b + 2] - p[a + 2]);
  return out;
}

class Network {
  constructor() { this.edges = new Map(); this.sig = ''; this.stops = []; this.len = { road: 0, walk: 0, tram: 0, rail: 0, major: 0 }; }
  build(tiles, T) {
    const edges = new Map(), stops = [];
    for (const t of tiles.values()) {
      if (!t.paths) continue;
      t.paths.forEach((p, pi) => {
        if (p.type === 'railstop' || p.type === 'busstop') {
          if (p.pts[0] >= 0 && p.pts[1] >= 0 && p.pts[0] < T && p.pts[1] < T) stops.push({ kind: p.type, x: t.ox + p.pts[0], y: p.pts[2], z: t.oz + p.pts[1], name: p.name || '' });
          return;
        }
        const net = NET_OF[p.type]; if (!net) return;
        clipRuns(p.pts, T).forEach((r, ri) => {
          const pts = new Float32Array(r.length);
          for (let i = 0; i < r.length; i += 3) { pts[i] = t.ox + r[i]; pts[i + 1] = r[i + 2] + 1; pts[i + 2] = t.oz + r[i + 1]; }
          const id = t.key + '|' + pi + '|' + ri;
          edges.set(id, makeEdge(id, net, pts, p.type === 'carM'));
        });
      });
    }
    // eindpunten in een raster om buren te vinden
    const grid = new Map(), C = 12;
    const put = (x, z, v) => { const k = Math.floor(x / C) + ',' + Math.floor(z / C); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(v); };
    const near = (x, z, r, f) => {
      for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) {
        const l = grid.get(gx + ',' + gz); if (l) for (const v of l) f(v);
      }
    };
    const end = (e, k) => { const i = k ? e.pts.length - 3 : 0; return [e.pts[i], e.pts[i + 1], e.pts[i + 2]]; };
    for (const e of edges.values()) { const a = end(e, 0), b = end(e, 1); put(a[0], a[2], [e, 0]); put(b[0], b[2], [e, 1]); }
    const conns = [];
    for (const e of edges.values()) {
      if (e.net === 'road') {
        // rijstroken hebben één richting: van het einde naar het begin van een andere strook
        const [ex, ey, ez] = end(e, 1);
        near(ex, ez, 9, ([f, k]) => {
          if (k !== 0 || f === e || f.net !== 'road') return;
          const [sx, sy, sz] = end(f, 0), d = Math.hypot(sx - ex, sz - ez);
          if (d > 9) return;
          const dot = e.t1[0] * f.t0[0] + e.t1[1] * f.t0[1];
          if (dot < -0.35) return; // niet keren
          if (d < 0.8) { e.next[1].push({ e: f, dir: 1 }); return; }
          // bocht over het kruispunt: korte verbinding
          const vx = (sx - ex) / d, vz = (sz - ez) / d;
          if (vx * e.t1[0] + vz * e.t1[1] < -0.2) return; // niet achteruit
          const c = makeEdge(e.id + '>' + f.id, 'road', new Float32Array([ex, ey, ez, (ex + sx) / 2 + e.t1[0] * d * 0.2, (ey + sy) / 2, (ez + sz) / 2 + e.t1[1] * d * 0.2, sx, sy, sz]), false);
          c.conn = true; c.next[1].push({ e: f, dir: 1 });
          conns.push(c); e.next[1].push({ e: c, dir: 1 });
        });
      } else {
        // sporen en voetpaden: beide richtingen
        const R = e.net === 'walk' ? 3 : 2.2, minDot = e.net === 'walk' ? -1 : 0.8;
        for (const k of [0, 1]) {
          const [px, , pz] = end(e, k), out = k ? e.t1 : [-e.t0[0], -e.t0[1]];
          near(px, pz, R, ([f, j]) => {
            if (f === e || f.net !== e.net) return;
            const [qx, , qz] = end(f, j);
            if (Math.hypot(qx - px, qz - pz) > R) return;
            const inn = j ? [-f.t1[0], -f.t1[1]] : f.t0;
            if (out[0] * inn[0] + out[1] * inn[1] < minDot) return;
            e.next[k].push({ e: f, dir: j ? -1 : 1 });
          });
        }
      }
    }
    for (const c of conns) edges.set(c.id, c);
    // haltes aan de dichtstbijzijnde rand koppelen
    const tmp = {};
    for (const s of stops) {
      const nets = s.kind === 'railstop' ? ['rail', 'tram'] : ['road', 'tram'];
      for (const e of edges.values()) {
        if (!nets.includes(e.net) || e.conn) continue;
        const r = s.kind === 'railstop' ? 16 : 10;
        if (Math.abs(e.pts[0] - s.x) > e.len + r || Math.abs(e.pts[2] - s.z) > e.len + r) continue;
        let bd = 1e9, bdd = 0;
        for (let d = 0; d <= e.len; d += 2) { at(e, d, tmp); const q = Math.hypot(tmp.x - s.x, tmp.z - s.z); if (q < bd) { bd = q; bdd = d; } }
        if (bd < r && bdd > 6 && bdd < e.len - 6) { e.stops.push(bdd); (e.stopNames || (e.stopNames = [])).push(s.name || (s.kind === 'railstop' ? 'Station' : 'Halte')); }
      }
    }
    this.edges = edges; this.stops = stops;
    const L = { road: 0, walk: 0, tram: 0, rail: 0, major: 0 };
    for (const e of edges.values()) { if (!e.conn) L[e.net] += e.len; if (e.major) L.major += e.len; }
    this.len = L;
  }
}

// ---------- voertuigen ----------
// lengte en bakken per soort (offset = afstand van de neus tot het midden van de bak)
function consist(kind, r) {
  if (kind === 'tram') {
    const s = [{ m: 'tramCab', len: 7.6, off: 3.8 }];
    const mids = r < 0.5 ? 2 : 3;
    let o = 7.6;
    for (let i = 0; i < mids; i++) { s.push({ m: 'tramMid', len: 7.0, off: o + 3.5 }); o += 7.0; }
    s.push({ m: 'tramCab', len: 7.6, off: o + 3.8, flip: true });
    return { secs: s, L: o + 7.6 };
  }
  if (kind === 'train') {
    const ice = r < 0.5, s = [];
    if (ice) {
      s.push({ m: 'iceHead', len: 20.5, off: 10.25 });
      let o = 20.5; const n = 5 + Math.floor(r * 6);
      for (let i = 0; i < n; i++) { s.push({ m: 'iceCoach', len: 26.4, off: o + 13.2 }); o += 26.4; }
      s.push({ m: 'iceHead', len: 20.5, off: o + 10.25, flip: true });
      return { secs: s, L: o + 20.5, ice: true };
    }
    s.push({ m: 'regioCab', len: 26.8, off: 13.4 });
    let o = 26.8; const n = 2 + Math.floor(r * 4);
    for (let i = 0; i < n; i++) { s.push({ m: 'regioCoach', len: 26.8, off: o + 13.4 }); o += 26.8; }
    return { secs: s, L: o };
  }
  if (kind === 'bus') return { secs: [{ m: 'bus', len: 12, off: 6 }], L: 12 };
  const cars = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'van', 'taxi', 'sedan', 'suv', 'hatch'];
  const m = cars[Math.floor(r * cars.length)], len = { sedan: 4.6, hatch: 4.0, suv: 4.7, van: 5.1, taxi: 4.7 }[m];
  return { secs: [{ m, len, off: len / 2 }], L: len };
}
const MAX = { sedan: 160, hatch: 140, suv: 100, van: 60, taxi: 40, bus: 30, tramCab: 40, tramMid: 60, iceHead: 16, iceCoach: 60, regioCab: 12, regioCoach: 40 };
const SPEED = { car: 13, bus: 10, tram: 11, train: 22, walk: 1.35 };

export class Traffic {
  constructor(scene, ground) {
    this.scene = scene; this.G = ground;
    this.net = new Network();
    this.agents = [];
    this.lastBuild = -1e9; this.dirty = true;
    this.models = buildModels();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = {
      paint: new THREE.MeshBasicMaterial({ vertexColors: true }),
      trim: new THREE.MeshBasicMaterial({ vertexColors: true }),
      light: new THREE.MeshBasicMaterial({ vertexColors: true }),
      rail: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    this.meshes = {};
    for (const [k, max] of Object.entries(MAX)) {
      const parts = this.models[k], set = {};
      for (const kind of ['paint', 'trim', 'light']) {
        if (!parts[kind]) continue;
        const m = new THREE.InstancedMesh(parts[kind], this.mats[kind], max);
        m.count = 0; m.frustumCulled = false;
        if (kind === 'paint') m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
        this.group.add(m); set[kind] = m;
      }
      this.meshes[k] = { set, n: 0, max };
    }
    // mensen: losse lichaamsdelen (armen en benen bewegen)
    const P = this.models.person, PMAX = 320;
    this.people = {};
    for (const k of ['leg', 'arm', 'torso', 'head', 'hair', 'shoe']) {
      const cnt = k === 'leg' || k === 'arm' || k === 'shoe' ? PMAX * 2 : PMAX;
      const m = new THREE.InstancedMesh(P[k], k === 'shoe' ? this.mats.trim : this.mats.paint, cnt);
      m.count = 0; m.frustumCulled = false;
      if (k !== 'shoe') m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cnt * 3).fill(1), 3);
      this.group.add(m); this.people[k] = m;
    }
    this.PMAX = PMAX;
    this.rail = null;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.c = new THREE.Color();
    this.tmpA = {}; this.tmpB = {}; this.clock = 0;
    this.parked = [];   // auto's die de speler zelf bestuurt of liet staan

  }

  // tegels geladen of weg: netwerk opnieuw maken (de voertuigen blijven waar ze zijn)
  rebuild(tiles, player) { this.tiles = tiles; this.dirty = true; this.player = player; }
  realBuild() {
    const T = this.tiles.values().next().value?.w?.size || 128;
    this.net.build(this.tiles, T);
    const E = this.net.edges;
    // voertuigen op randen die niet meer bestaan: weg
    for (const a of this.agents) {
      if (!E.has(a.route[0].e.id)) { a.dead = true; continue; }
      const keep = [];
      for (const r of a.route) { if (!E.has(r.e.id)) break; keep.push({ e: E.get(r.e.id), dir: r.dir }); }
      a.route = keep;
    }
    this.agents = this.agents.filter(a => !a.dead);
    this.buildRails();
  }

  // ---------- spoor in 3D: rails, dwarsliggers, bovenleiding, masten ----------
  buildRails() {
    const list = [...this.net.edges.values()].filter(e => (e.net === 'rail' || e.net === 'tram') && !e.conn);
    const sig = list.map(e => e.id).sort().join(';');
    if (sig === this.railSig) return;
    this.railSig = sig;
    if (this.rail) { for (const o of this.rail) { this.group.remove(o); o.geometry.dispose(); } }
    this.rail = [];
    if (!list.length) return;
    const pos = [], col = [], sleepers = [], masts = [], wires = [];
    const quad = (a, b, c, d, rgb) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) col.push(...rgb); };
    const tmp = {};
    for (const e of list) {
      const train = e.net === 'rail', top = train ? 0.2 : 0.03, wireH = train ? 5.7 : 5.9;
      const step = 2;
      let prev = null;
      for (let d = 0; d <= e.len + 0.01; d += step) {
        at(e, Math.min(d, e.len), tmp);
        const l = Math.hypot(tmp.tx, tmp.tz) || 1, nx = -tmp.tz / l, nz = tmp.tx / l;
        const cur = { x: tmp.x, y: tmp.y, z: tmp.z, nx, nz };
        if (prev) {
          for (const side of [1, -1]) for (const [o0, o1] of [[GAUGE - 0.04, GAUGE + 0.04]]) {
            const A = (p, o, h) => [p.x + p.nx * o * side, p.y + h, p.z + p.nz * o * side];
            quad(A(prev, o0, top), A(cur, o0, top), A(cur, o1, top), A(prev, o1, top), [0.78, 0.79, 0.8]);            // bovenkant (blank)
            quad(A(prev, o0, top - 0.16), A(cur, o0, top - 0.16), A(cur, o0, top), A(prev, o0, top), [0.36, 0.3, 0.26]); // zijkant (roest)
            quad(A(prev, o1, top), A(cur, o1, top), A(cur, o1, top - 0.16), A(prev, o1, top - 0.16), [0.36, 0.3, 0.26]);
          }
          wires.push(prev.x, prev.y + wireH, prev.z, cur.x, cur.y + wireH, cur.z);
        }
        prev = cur;
      }
      if (train) for (let d = 0.3; d < e.len; d += 0.65) { at(e, d, tmp); sleepers.push(tmp.x, tmp.y, tmp.z, Math.atan2(tmp.tx, tmp.tz)); }
      const every = train ? 55 : 38;
      for (let d = every / 2; d < e.len; d += every) { at(e, d, tmp); masts.push(tmp.x, tmp.y, tmp.z, Math.atan2(tmp.tx, tmp.tz), wireH); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const rails = new THREE.Mesh(g, this.mats.rail); rails.frustumCulled = false;
    this.rail.push(rails);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.wireMat = this.wireMat || new THREE.LineBasicMaterial({ color: 0x2a2a2a });
    const wl = new THREE.LineSegments(wg, this.wireMat); wl.frustumCulled = false; this.rail.push(wl);
    const box = (w, h, l, color) => { const b = new THREE.BoxGeometry(w, h, l); const c = new THREE.Color(color), n = b.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const s = b.attributes.normal.getY(i) > 0.5 ? 1 : 0.75; a[i * 3] = c.r * s; a[i * 3 + 1] = c.g * s; a[i * 3 + 2] = c.b * s; } b.setAttribute('color', new THREE.BufferAttribute(a, 3)); return b; };
    if (sleepers.length) {
      const n = sleepers.length / 4, im = new THREE.InstancedMesh(box(2.6, 0.16, 0.26, 0x8f8a82), this.mats.rail, n);
      for (let i = 0; i < n; i++) {
        this.e.set(0, sleepers[i * 4 + 3], 0); this.q.setFromEuler(this.e);
        this.v.set(sleepers[i * 4], sleepers[i * 4 + 1] + 0.08, sleepers[i * 4 + 2]); this.s.set(1, 1, 1);
        im.setMatrixAt(i, this.m4.compose(this.v, this.q, this.s));
      }
      im.frustumCulled = false; this.rail.push(im);
    }
    if (masts.length) {
      const n = masts.length / 5;
      const mg = box(0.22, 1, 0.22, 0x6e7378); mg.translate(0, 0.5, 0);
      const ag = box(1, 0.1, 0.1, 0x6e7378); ag.translate(-0.5, 0, 0);
      const mm = new THREE.InstancedMesh(mg, this.mats.rail, n), am = new THREE.InstancedMesh(ag, this.mats.rail, n);
      for (let i = 0; i < n; i++) {
        const [x, y, z, yaw, h] = masts.slice(i * 5, i * 5 + 5);
        const nx = Math.cos(yaw), nz = -Math.sin(yaw); // zijkant van het spoor
        this.e.set(0, yaw, 0); this.q.setFromEuler(this.e);
        this.v.set(x + nx * 3.2, y, z + nz * 3.2); this.s.set(1, h + 0.6, 1);
        mm.setMatrixAt(i, this.m4.compose(this.v, this.q, this.s));
        this.v.y = y + h + 0.3; this.s.set(3.3, 1, 1);
        am.setMatrixAt(i, this.m4.compose(this.v, this.q, this.s));
      }
      mm.frustumCulled = am.frustumCulled = false;
      this.rail.push(mm, am);
    }
    for (const o of this.rail) this.group.add(o);
  }

  // ---------- agenten ----------
  spawn(kind, player, far) {
    const net = kind === 'walk' ? 'walk' : kind === 'tram' ? 'tram' : kind === 'train' ? 'rail' : 'road';
    const cand = [];
    let total = 0;
    for (const e of this.net.edges.values()) {
      if (e.net !== net || e.conn || e.len < 8) continue;
      if (kind === 'bus' && this.net.len.major > 300 && !e.major) continue;
      const mx = e.pts[Math.floor(e.pts.length / 6) * 3], mz = e.pts[Math.floor(e.pts.length / 6) * 3 + 2];
      const dd = Math.hypot(mx - player.x, mz - player.z);
      if (dd > RANGE || (far && dd < 160)) continue;
      cand.push(e); total += e.len;
    }
    if (!cand.length) return null;
    let r = Math.random() * total, e = cand[0];
    for (const c of cand) { r -= c.len; if (r <= 0) { e = c; break; } }
    const rr = Math.random();
    const a = { kind, ...(kind === 'walk' ? { L: 0.5 } : consist(kind, rr)), route: [{ e, dir: kind === 'car' || kind === 'bus' || Math.random() < 0.5 ? 1 : -1 }], v: 0, wait: 0, r: rr,
      color: kind === 'car' ? (consist(kind, rr).secs[0].m === 'taxi' ? 0xf1c40f : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)])
        : kind === 'bus' ? BUS_COLORS[Math.floor(Math.random() * BUS_COLORS.length)]
        : kind === 'tram' ? TRAM_COLORS[Math.floor(rr * 7) % TRAM_COLORS.length]
        : kind === 'train' ? 0xffffff : 0, phase: Math.random() * 10 };
    if (kind === 'train') a.color = a.ice ? 0xf4f4f2 : 0xc8102e;
    if (kind === 'walk') {
      a.shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)]; a.pants = PANTS[Math.floor(Math.random() * PANTS.length)];
      a.skin = SKIN[Math.floor(Math.random() * SKIN.length)]; a.hair = HAIR[Math.floor(Math.random() * HAIR.length)];
      a.size = 0.9 + Math.random() * 0.2; a.side = (Math.random() - 0.5) * 1.6;
    }
    const dir = a.route[0].dir;
    // lange voertuigen: zo plaatsen dat ze passen
    const need = Math.min(e.len - 1, a.L + 2);
    a.d = dir > 0 ? need + Math.random() * Math.max(0, e.len - need) : e.len - need - Math.random() * Math.max(0, e.len - need);
    if (a.L > e.len) this.extendBack(a);
    // niet bovenop een ander voertuig
    if (kind !== 'walk') for (const b of this.agents) if (b.route[0].e === e && Math.abs(b.d - a.d) < a.L + b.L) return null;
    a.v = SPEED[kind] * 0.6;
    this.agents.push(a);
    return a;
  }
  // route naar achteren aanvullen (bij het plaatsen van lange treinen)
  extendBack(a) {
    let got = (a.route[0].dir > 0 ? a.d : a.route[0].e.len - a.d);
    while (got < a.L + 5 && a.route.length < 30) {
      const last = a.route[a.route.length - 1];
      const k = last.dir > 0 ? 0 : 1; // het begin van deze rand
      const opts = last.e.next[k];
      if (!opts.length) break;
      const o = opts[0];
      a.route.push({ e: o.e, dir: -o.dir });
      got += o.e.len;
    }
  }
  // positie op afstand s achter de neus
  behind(a, s, out) {
    const r0 = a.route[0];
    let d = r0.dir > 0 ? a.d - s : a.d + s;
    if (d >= 0 && d <= r0.e.len) return at(r0.e, d, out), out.dir = r0.dir, out;
    s -= r0.dir > 0 ? a.d : r0.e.len - a.d;
    for (let i = 1; i < a.route.length; i++) {
      const r = a.route[i];
      if (s <= r.e.len) { at(r.e, r.dir > 0 ? r.e.len - s : s, out); out.dir = r.dir; return out; }
      s -= r.e.len;
    }
    const r = a.route[a.route.length - 1];
    at(r.e, r.dir > 0 ? 0 : r.e.len, out); out.dir = r.dir;
    return out;
  }
  choose(a, opts) {
    if (opts.length === 1) return opts[0];
    if (a.player) {
      // wissel: de speler kiest links, rechtdoor of rechts
      const cur = a.route[0], out = cur.dir > 0 ? cur.e.t1 : [-cur.e.t0[0], -cur.e.t0[1]];
      const info = opts.map(o => { const inn = o.dir > 0 ? o.e.t0 : [-o.e.t1[0], -o.e.t1[1]]; return { o, dot: out[0] * inn[0] + out[1] * inn[1], side: out[0] * inn[1] - out[1] * inn[0] }; });
      info.sort((x, y) => y.dot - x.dot);
      const pref = a.switchPref || 'straight';
      if (pref === 'left') return info.reduce((m, i) => (i.side < m.side ? i : m)).o;
      if (pref === 'right') return info.reduce((m, i) => (i.side > m.side ? i : m)).o;
      return info[0].o;
    }
    const cur = a.route[0];
    const out = cur.dir > 0 ? cur.e.t1 : [-cur.e.t0[0], -cur.e.t0[1]];
    const score = (o) => { const inn = o.dir > 0 ? o.e.t0 : [-o.e.t1[0], -o.e.t1[1]]; return out[0] * inn[0] + out[1] * inn[1]; };
    if (a.kind === 'walk') return opts[Math.floor(Math.random() * opts.length)];
    const sorted = opts.slice().sort((x, y) => score(y) - score(x));
    const straightP = a.kind === 'train' || a.kind === 'tram' ? 0.85 : a.kind === 'bus' ? 0.75 : 0.55;
    if (a.kind === 'bus') { const maj = sorted.find(o => o.e.major || (o.e.conn && o.e.next[1][0]?.e.major)); if (maj && Math.random() < 0.8) return maj; }
    return Math.random() < straightP ? sorted[0] : sorted[1 + Math.floor(Math.random() * (sorted.length - 1))];
  }
  reverse(a) {
    // de staart wordt de neus
    const tail = this.behind(a, a.L, this.tmpA);
    let s = a.L, idx = 0;
    const r0 = a.route[0];
    let rem = r0.dir > 0 ? a.d : r0.e.len - a.d;
    if (s > rem) { s -= rem; idx = 1; while (idx < a.route.length - 1 && s > a.route[idx].e.len) { s -= a.route[idx].e.len; idx++; } }
    const nr = a.route.slice(0, idx + 1).reverse().map(r => ({ e: r.e, dir: -r.dir }));
    const ne = nr[0].e;
    let best = 0, bd = 1e9;
    for (let d = 0; d <= ne.len; d += 0.5) { at(ne, d, this.tmpB); const q = Math.hypot(this.tmpB.x - tail.x, this.tmpB.z - tail.z); if (q < bd) { bd = q; best = d; } }
    a.route = nr; a.d = best; a.lastStop = null;
  }
  move(a, dist) {
    let guard = 0;
    for (;;) {
      const r = a.route[0], e = r.e;
      a.d += r.dir * dist; dist = 0;
      if (a.d >= 0 && a.d <= e.len) break;
      if (++guard > 20) { a.d = Math.max(0, Math.min(e.len, a.d)); break; }
      const over = r.dir > 0 ? a.d - e.len : -a.d;
      const k = r.dir > 0 ? 1 : 0;
      const opts = e.next[k];
      if (!opts.length) {
        a.d = r.dir > 0 ? e.len : 0;
        if (a.player) { a.v = 0; a.endOfLine = true; return; }
        if (a.passenger && (a.kind === 'car' || a.kind === 'bus')) { a.v = 0; a.wait = 3; a.reverseAfter = true; return; } // met passagier: keren
        if (a.kind === 'car' || a.kind === 'bus') { a.dead = true; return; }
        if (a.kind === 'walk') { r.dir = -r.dir; return; }
        // eindstation: even wachten en terugrijden
        a.v = 0; a.wait = 20; a.reverseAfter = true; return;
      }
      const o = this.choose(a, opts);
      a.route.unshift({ e: o.e, dir: o.dir });
      a.d = o.dir > 0 ? over : o.e.len - over;
      dist = 0;
      // route niet langer dan nodig
      let tot = 0, i = 0;
      for (; i < a.route.length; i++) { tot += a.route[i].e.len; if (tot > a.L + 40) break; }
      a.route.length = Math.min(a.route.length, i + 2);
    }
  }

  update(dt, player, day) {
    if (!this.tiles) return;
    this.clock += dt; this.dt = dt;
    const now = this.clock;
    if (this.dirty && now - this.lastBuild > 1.5) { this.dirty = false; this.lastBuild = now; this.realBuild(); }
    const light = 0.18 + 0.82 * day;
    this.mats.paint.color.setScalar(light); this.mats.trim.color.setScalar(light); this.mats.rail.color.setScalar(light);
    this.mats.light.color.setScalar(day > 0.6 ? 0.75 : 1.15);
    // hoeveel van elk
    const L = this.net.len;
    const want = {
      car: Math.min(260, Math.floor(L.road / 40)),
      bus: L.road > 400 ? Math.min(14, Math.max(1, Math.floor((L.major > 300 ? L.major : L.road / 3) / 380))) : 0,
      tram: L.tram > 250 ? Math.min(10, Math.max(1, Math.floor(L.tram / 650))) : 0,
      train: L.rail > 500 ? Math.min(6, Math.max(1, Math.floor(L.rail / 1800))) : 0,
      walk: Math.min(this.PMAX, Math.floor(L.walk / (L.road > 0 ? 20 : 70))), // op een bergpad minder druk
    };
    const have = { car: 0, bus: 0, tram: 0, train: 0, walk: 0 };
    for (const a of this.agents) {
      const h = this.behind(a, 0, this.tmpA);
      if (Math.hypot(h.x - player.x, h.z - player.z) > RANGE + 120 && !a.player && !a.passenger) a.dead = true;
      else have[a.kind]++;
    }
    for (const k of Object.keys(want)) {
      let tries = 0;
      while (have[k] < want[k] && tries++ < (this.agents.length ? 6 : 400)) if (this.spawn(k, player, this.agents.length > 20 && k !== 'train' && k !== 'tram')) have[k]++;
    }
    // afstand houden: wie staat er voor me op dezelfde rand?
    const onEdge = new Map();
    for (const a of this.agents) {
      if (a.dead || a.kind === 'walk') continue;
      const id = a.route[0].e.id; let l = onEdge.get(id); if (!l) onEdge.set(id, l = []); l.push(a);
    }
    for (const a of this.agents) {
      if (a.dead) continue;
      const r = a.route[0], e = r.e;
      if (a.wait > 0) {
        a.wait -= dt;
        if (a.wait <= 0 && a.reverseAfter) { a.reverseAfter = false; this.reverse(a); }
        this.place(a); continue;
      }
      let target = a.kind === 'walk' ? SPEED.walk * (0.85 + a.r * 0.3) : SPEED[a.kind] * (0.85 + a.r * 0.3);
      if (e.conn) target = Math.min(target, 6.5);
      if (a.kind !== 'walk') {
        // voorligger
        const ahead = (b) => (b.d - a.d) * r.dir;
        let gap = 1e9;
        const l = onEdge.get(e.id);
        if (l) for (const b of l) if (b !== a && b.route[0].dir === r.dir) { const g = ahead(b); if (g > 0 && g - b.L < gap) gap = g - b.L; }
        const left = r.dir > 0 ? e.len - a.d : a.d;
        if (left < 30) for (const n of e.next[r.dir > 0 ? 1 : 0]) {
          const l2 = onEdge.get(n.e.id); if (!l2) continue;
          for (const b of l2) { const g = left + (n.dir > 0 ? b.d : n.e.len - b.d) - b.L; if (b !== a && g < gap) gap = g; }
        }
        a.gapAhead = gap;
        if (gap < 1e8) target = Math.min(target, Math.max(0, (gap - 3) * 0.9));
        // haltes
        if ((a.kind === 'bus' || a.kind === 'tram' || a.kind === 'train') && e.stops.length) {
          const half = a.kind === 'bus' ? 0 : a.L / 2;
          for (const sd of e.stops) {
            const key = e.id + '@' + sd;
            if (a.lastStop === key) continue;
            const goal = Math.max(0.5, Math.min(e.len - 0.5, sd + half * r.dir));
            const dist = (goal - a.d) * r.dir;
            if (dist < -1 || dist > 120) continue;
            if (dist < 0.6) { a.v = 0; a.wait = a.kind === 'train' ? 25 : a.kind === 'tram' ? 15 : 12; a.lastStop = key; target = 0; break; }
            target = Math.min(target, Math.sqrt(2 * 1.1 * dist) + 0.3);
          }
        }
      }
      if (a.player) {
        // bestuurd door de speler: tractie en rem (en noodstop vlak achter een ander voertuig)
        const c = a.player, vmax = a.kind === 'train' ? 44 : 19;
        const acc = (a.kind === 'train' ? 1.0 : 1.3) * c.throttle - (a.kind === 'train' ? 1.2 : 1.6) * c.brake - 0.004 * a.v - (c.emergency ? 2.5 : 0);
        a.v = Math.max(0, Math.min(vmax, a.v + acc * dt));
        if (c.doors || a.endOfLine && c.throttle === 0) a.v = 0;
        if ((a.gapAhead ?? 1e9) < 4) a.v = 0; // niet op een ander voertuig botsen
        a.nextStop = this.nextStop(a);
        if (a.v > 0) { a.endOfLine = false; this.move(a, a.v * dt); }
        continue;
      }
      const acc = a.kind === 'train' ? 0.8 : a.kind === 'walk' ? 3 : 2.5;
      a.v += Math.max(-6 * dt, Math.min(acc * dt, target - a.v));
      if (a.v > 0) this.move(a, a.v * dt);
      if (!a.dead) this.place(a);
    }
    this.agents = this.agents.filter(a => !a.dead);
    this.flush(player, day);
  }

  // volgende halte vóór de neus (op deze rand en de volgende)
  nextStop(a) {
    const r = a.route[0], e = r.e;
    let best = null;
    const look = (edge, dir, base, from) => {
      edge.stops.forEach((sd, i) => {
        const dist = base + (dir > 0 ? sd - from : from - sd);
        if (dist > -a.L && (!best || dist < best.dist)) best = { dist, name: (edge.stopNames && edge.stopNames[i]) || 'Station', key: edge.id + '@' + sd };
      });
    };
    look(e, r.dir, 0, a.d);
    const left = r.dir > 0 ? e.len - a.d : a.d;
    for (const n of e.next[r.dir > 0 ? 1 : 0]) look(n.e, n.dir, left, n.dir > 0 ? 0 : n.e.len);
    return best;
  }
  // in de buurt van de speler: dichtstbijzijnde voertuig (om in te stappen)
  nearestVehicle(p, maxD = 7) {
    let best = null, bd = maxD;
    for (const a of this.agents) {
      if (a.kind === 'walk' || a.dead) continue;
      for (let s = 0; s <= a.L; s += 4) {
        const q = this.behind(a, s, this.tmpA), d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bd && Math.abs(q.y - p.y) < 5) { bd = d; best = a; }
      }
    }
    for (const c of this.parked) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  // matrices klaarzetten (alleen wat dichtbij is)
  place(a) { a.vis = true; }
  flush(player) {
    for (const m of Object.values(this.meshes)) m.n = 0;
    let pn = 0;
    const P = this.people, A = this.tmpA, Bp = this.tmpB;
    for (const a of this.agents) {
      if (a.kind === 'walk') {
        if (pn >= this.PMAX) continue;
        this.behind(a, 0, A);
        const dx = A.x - player.x, dz = A.z - player.z;
        if (dx * dx + dz * dz > 220 * 220) continue;
        const l = Math.hypot(A.tx, A.tz) || 1, dir = a.route[0].dir;
        const fx = A.tx / l * dir, fz = A.tz / l * dir;
        const x = A.x - fz * a.side, z = A.z + fx * a.side, yaw = Math.atan2(fx, fz), sc = a.size;
        a.phase += (a.v || 0) * (this.dt || 0.016) * 2.6;
        const sw = Math.sin(a.phase * 2) * 0.55 * Math.min(1, (a.v || 0) / 1.2);
        const hip = A.y + 0.92 * sc;
        const put = (m, i, ox, oy, rot, color) => {
          this.e.set(rot, yaw, 0); this.q.setFromEuler(this.e);
          this.v.set(x + Math.cos(yaw) * ox, oy, z - Math.sin(yaw) * ox); this.s.setScalar(sc);
          m.setMatrixAt(i, this.m4.compose(this.v, this.q, this.s));
          if (color != null && m.instanceColor) m.setColorAt(i, this.c.setHex(color));
        };
        put(P.leg, pn * 2, 0.11 * sc, hip, sw, a.pants); put(P.leg, pn * 2 + 1, -0.11 * sc, hip, -sw, a.pants);
        put(P.shoe, pn * 2, 0.11 * sc, hip, sw); put(P.shoe, pn * 2 + 1, -0.11 * sc, hip, -sw);
        put(P.torso, pn, 0, hip, 0, a.shirt);
        put(P.arm, pn * 2, 0.29 * sc, hip + 0.58 * sc, -sw * 0.8, a.shirt); put(P.arm, pn * 2 + 1, -0.29 * sc, hip + 0.58 * sc, sw * 0.8, a.shirt);
        put(P.head, pn, 0, hip + 0.63 * sc, 0, a.skin); put(P.hair, pn, 0, hip + 0.63 * sc, 0, a.hair);
        pn++;
        continue;
      }
      const h = this.behind(a, 0, A);
      if (Math.hypot(h.x - player.x, h.z - player.z) > RANGE + a.L) continue;
      const lift = a.kind === 'train' ? 0.2 : a.kind === 'tram' ? 0.05 : 0;
      for (const s of a.secs) {
        const M = this.meshes[s.m];
        if (M.n >= M.max) continue;
        const bog = Math.max(0.5, s.len / 2 - 2);
        const f = this.behind(a, s.off - bog, A), fx = f.x, fy = f.y, fz = f.z;
        const b = this.behind(a, s.off + bog, Bp);
        const dx = fx - b.x, dz = fz - b.z, hd = Math.hypot(dx, dz) || 1;
        let yaw = Math.atan2(dx, dz);
        if (s.flip) yaw += Math.PI;
        const pitch = Math.atan2(fy - b.y, hd) * (s.flip ? -1 : 1);
        this.e.set(-pitch, yaw, 0); this.q.setFromEuler(this.e);
        this.v.set((fx + b.x) / 2, (fy + b.y) / 2 + lift, (fz + b.z) / 2); this.s.set(1, 1, 1);
        this.m4.compose(this.v, this.q, this.s);
        const i = M.n++;
        for (const [kind, m] of Object.entries(M.set)) {
          m.setMatrixAt(i, this.m4);
          if (kind === 'paint') m.setColorAt(i, this.c.setHex(a.color));
        }
      }
    }
    // vrij bestuurde en geparkeerde voertuigen
    this.parked = this.parked.filter(c => c.driving || Math.hypot(c.x - player.x, c.z - player.z) < RANGE + 200);
    for (const c of this.parked) {
      const M = this.meshes[c.m]; if (!M || M.n >= M.max) continue;
      this.e.set(-c.pitch, c.yaw, c.roll || 0); this.q.setFromEuler(this.e);
      this.v.set(c.x, c.y, c.z); this.s.set(1, 1, 1); this.m4.compose(this.v, this.q, this.s);
      const i = M.n++;
      for (const [kind, m] of Object.entries(M.set)) { m.setMatrixAt(i, this.m4); if (kind === 'paint') m.setColorAt(i, this.c.setHex(c.color)); }
    }
    for (const M of Object.values(this.meshes)) for (const m of Object.values(M.set)) {
      m.count = M.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const [k, m] of Object.entries(P)) {
      m.count = k === 'leg' || k === 'arm' || k === 'shoe' ? pn * 2 : pn;
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
    this.wireMat?.dispose();
    this.scene.remove(this.group);
  }
}
