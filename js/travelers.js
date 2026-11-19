// Reizigers met een doel (TERRANOVA 14, verkeerswerelden): een reiziger legt een hele reis af in de echte wereld.
// Een reis is een rij stappen: lopen naar een plek of halte, wachten op het juiste voertuig (soort en lijn), instappen
// zodra de deuren open zijn, meerijden (telt mee in de bezetting van de rit, js/ovtrips.js), uitstappen aan de
// juiste halte en verder lopen (overstap) tot de bestemming.
//
// Lopen gaat over een navigatieraster dat uit de echte blokken komt (A*): een plek is beloopbaar als er vaste grond
// onder ligt en er 2 blokken lucht boven zijn; trappen = 1 blok op of af; schuin alleen als beide hoeken vrij zijn.
// Zo loopt een reiziger door stationsingangen, over trappen naar het perron en nooit door een muur.
// Zichtbaar dichtbij (instanced, zoals de wachtenden aan bushaltes); de reis zelf loopt altijd door.
import * as THREE from 'three';

const WALK = 1.35, MAXN = 120000;
export class NavGrid {
  constructor(solidAt) { this.solid = solidAt; }
  walkable(x, y, z) { return this.solid(x, y - 1, z) && !this.solid(x, y, z) && !this.solid(x, y + 1, z); }
  // dichtstbijzijnde beloopbare plek rond (x, y, z): eerst dezelfde kolom (op en neer), dan in een kring
  snap(x, y, z, r = 3) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    for (let d = 0; d <= r; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
      for (const dy of [0, -1, 1, -2, 2, -3, 3]) if (this.walkable(x + dx, y + dy, z + dz)) return { x: x + dx, y: y + dy, z: z + dz };
    }
    return null;
  }
  // A* van a naar b (blokcoördinaten); geeft de punten (midden van de blokken) of null
  path(a, b, maxN = MAXN) {
    const A = this.snap(a.x, a.y, a.z), Bt = this.snap(b.x, b.y, b.z);
    if (!A || !Bt) return null;
    const key = (x, y, z) => ((x + 32768) * 65536 + (z + 32768)) * 4096 + (y + 1024);
    const open = [], g = new Map(), from = new Map(), h = (x, y, z) => Math.hypot(x - Bt.x, z - Bt.z) + Math.abs(y - Bt.y) * 1.5;
    const push = (n) => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= n.f) break; open[i] = open[p]; i = p; } open[i] = n; };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l].f < (m === i ? last.f : open[m].f)) m = l; if (r < open.length && open[r].f < (m === i ? last.f : open[m].f)) m = r; if (m === i) break; open[i] = open[m]; i = m; } open[i] = last; } return top; };
    const k0 = key(A.x, A.y, A.z); g.set(k0, 0); push({ x: A.x, y: A.y, z: A.z, k: k0, f: h(A.x, A.y, A.z) });
    let n = 0, end = null;
    while (open.length && n++ < maxN) {
      const c = pop(), gc = g.get(c.k);
      if (c.x === Bt.x && c.z === Bt.z && Math.abs(c.y - Bt.y) <= 1) { end = c; break; }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        for (const dy of [0, 1, -1]) {
          const x = c.x + dx, y = c.y + dy, z = c.z + dz;
          if (!this.walkable(x, y, z)) continue;
          if (dy > 0 && this.solid(c.x, c.y + 2, c.z)) continue; // trap op: hoofdruimte boven het vertrekpunt
          if (dy < 0 && this.solid(x, c.y + 1, z)) continue;     // trap af: hoofdruimte boven het doel
          if (dx && dz && (!this.walkable(c.x + dx, c.y, c.z) && !this.walkable(c.x + dx, y, c.z) || !this.walkable(c.x, c.y, c.z + dz) && !this.walkable(c.x, y, c.z + dz))) continue; // geen hoek afsnijden
          const k = key(x, y, z), cost = gc + (dx && dz ? 1.414 : 1) + (dy ? 0.6 : 0);
          if (cost >= (g.get(k) ?? 1e18)) continue;
          g.set(k, cost); from.set(k, c); push({ x, y, z, k, f: cost + h(x, y, z) });
          break; // per richting één hoogte
        }
      }
    }
    if (!end) return null;
    const pts = []; for (let c = end; c; c = from.get(c.k)) pts.push({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
    return pts.reverse();
  }
}

const SHIRT = [0x2f6db5, 0xc0392b, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x16a085], TYPES = { pendelaar: 1.45, toerist: 1.1, student: 1.5, luchthaven: 1.25, nacht: 1.3, beperkt: 0.8 };
export class Travelers {
  constructor(scene, world, traffic) {
    this.w = world; this.tr = traffic; this.nav = new NavGrid((x, y, z) => world.solidAt(x, y, z));
    this.list = []; this.log = []; this.seq = 0;
    const mk = (geo, color) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), 64); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(new THREE.BoxGeometry(0.46, 0.66, 0.26).translate(0, 1.2, 0), 0xffffff); this.legs = mk(new THREE.BoxGeometry(0.4, 0.86, 0.22).translate(0, 0.43, 0), 0x22313f); this.head = mk(new THREE.BoxGeometry(0.26, 0.28, 0.26).translate(0, 1.69, 0), 0xe0ac69);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0); this.c = new THREE.Color();
  }
  dispose() { for (const m of [this.body, this.legs, this.head]) { m.geometry.dispose(); m.removeFromParent(); } }
  // reis: { from: {x,y,z}, steps: [{ walk: {x,y,z} } | { ride: { kind, line?, board: stopName, alight: stopName } }], type }
  add(trip) {
    const p = this.nav.snap(trip.from.x, trip.from.y, trip.from.z); if (!p) return null;
    const t = { id: 'R' + (++this.seq), type: trip.type || 'pendelaar', speed: TYPES[trip.type] || WALK, steps: trip.steps, i: 0, x: p.x + 0.5, y: p.y, z: p.z + 0.5, yaw: 0, state: 'start', path: null, pi: 0, hist: [], shirt: SHIRT[this.seq % SHIRT.length], done: false };
    this.list.push(t); this.note(t, 'vertrek', null); return t;
  }
  note(t, what, extra) { const e = { reiziger: t.id, wat: what, t: Math.round((this.tr.clock || 0) * 10) / 10, pos: [Math.round(t.x), Math.round(t.y), Math.round(t.z)], ...extra }; this.log.push(e); if (this.log.length > 400) this.log.shift(); t.hist.push(e); }
  // dichtstbijzijnde plek bij de halte `name` (perron of stoep), volgens de haltes van het verkeersnet
  stopPos(name, kind) { const st = (this.tr.stops || []).filter(s => s.name === name && (!kind || s.kind === kind || s.kind === kind + 'stop')); return st[0] || null; }
  walkTo(t, goal) {
    const pts = this.nav.path({ x: t.x, y: t.y, z: t.z }, goal);
    if (!pts) { t.state = 'geen pad'; this.note(t, 'geen pad', { naar: [Math.round(goal.x), Math.round(goal.y), Math.round(goal.z)] }); return false; }
    t.path = pts; t.pi = 0; t.state = 'lopen'; t.pathLen = pts.length; (t.paths || (t.paths = [])).push(pts); return true;
  }
  update(dt, player) {
    const tr = this.tr;
    for (const t of this.list) {
      if (t.done) continue;
      const st = t.steps[t.i];
      if (t.state === 'start' || t.state === 'volgende') {
        if (!st) { t.done = true; t.state = 'aangekomen'; this.note(t, 'aangekomen', null); continue; }
        if (st.walk) this.walkTo(t, st.walk);
        else if (st.ride) { const sp = st.ride.wait; if (sp) this.walkTo(t, sp); else t.state = 'wachten'; t.afterWalk = 'wachten'; }
        continue;
      }
      if (t.state === 'lopen') {
        let rem = t.speed * dt;
        while (rem > 0 && t.pi < t.path.length) {
          const q = t.path[t.pi], dx = q.x - t.x, dz = q.z - t.z, d = Math.hypot(dx, dz);
          if (d <= rem) { t.x = q.x; t.z = q.z; t.y = q.y; rem -= d; t.pi++; } else { t.x += dx / d * rem; t.z += dz / d * rem; t.y = q.y; t.yaw = Math.atan2(dx, dz); rem = 0; }
        }
        if (t.pi >= t.path.length) {
          if (t.afterWalk === 'wachten') { t.afterWalk = null; t.state = 'wachten'; this.note(t, 'wacht', { op: st.ride.board }); }
          else { t.i++; t.state = 'volgende'; }
        }
        continue;
      }
      if (t.state === 'wachten') {
        // het juiste voertuig: soort en lijn, deuren open, aan de halte van de reis en vlakbij
        const R = st.ride;
        const v = tr.agents.find(a => !a.dead && a.kind === R.kind && (!R.line || a.line === R.line) && a.doorsOpen && a.atStop === R.board && (!R.dest || (a.trip && a.trip.dest === R.dest)) && Math.hypot(tr.behind(a, a.L / 2, {}).x - t.x, tr.behind(a, a.L / 2, {}).z - t.z) < a.L / 2 + 14);
        if (v && !tr.trips.full(v)) {
          // naar de dichtste deur: het dichtste punt op het voertuig, dan instappen
          const near = this.nearestOn(v, t); t.vehicle = v; t.state = 'instappen'; t.board = near; this.note(t, 'naar de deur', { voertuig: v.kind, lijn: v.line || null, rit: v.trip && v.trip.id });
        }
        continue;
      }
      if (t.state === 'instappen') {
        const v = t.vehicle, q = t.board, dx = q.x - t.x, dz = q.z - t.z, d = Math.hypot(dx, dz);
        if (!v.doorsOpen || v.dead) { t.state = 'wachten'; t.vehicle = null; continue; } // deuren dicht: volgende
        if (d > 0.9) { const s = Math.min(d, t.speed * dt); t.x += dx / d * s; t.z += dz / d * s; t.yaw = Math.atan2(dx, dz); continue; }
        tr.trips.board(v, 1); t.state = 'aan boord'; t.rideStart = v.trip ? v.trip.occ : null; this.note(t, 'ingestapt', { rit: v.trip && v.trip.id, bezetting: v.trip && v.trip.occ, halte: v.atStop });
        continue;
      }
      if (t.state === 'aan boord') {
        const v = t.vehicle, R = st.ride;
        const h = tr.behind(v, Math.min(v.L - 1, Math.max(1, t.boardOff ?? v.L / 2)), {}); t.x = h.x; t.z = h.z; t.y = h.y + 1.1; // rijdt mee
        if (v.dead) { t.state = 'gestrand'; this.note(t, 'voertuig weg', null); continue; }
        if (v.atStop === R.alight && v.doorsOpen) {
          tr.trips.alight(v, 1);
          // aan de perronkant naast de deur uitstappen, op een beloopbare plek
          const pn = v.platN || [0, 0], out = this.nav.snap(h.x + pn[0] * 2.4, h.y + 1, h.z + pn[1] * 2.4, 4) || this.nav.snap(h.x, h.y + 1, h.z, 5);
          if (out) { t.x = out.x + 0.5; t.y = out.y; t.z = out.z + 0.5; }
          this.note(t, 'uitgestapt', { rit: v.trip && v.trip.id, bezetting: v.trip && v.trip.occ, halte: v.atStop, afstandTotDeur: +Math.hypot(t.x - h.x, t.z - h.z).toFixed(1) });
          t.vehicle = null; t.i++; t.state = 'volgende';
        }
      }
    }
    // tekenen: alleen wie loopt of wacht en dichtbij is
    let n = 0;
    for (const t of this.list) {
      if (t.done || t.state === 'aan boord' || n >= 64 || Math.hypot(t.x - player.x, t.z - player.z) > 220) continue;
      this.q.setFromAxisAngle(this.up, t.yaw); this.v.set(t.x, t.y, t.z); this.m4.compose(this.v, this.q, this.one);
      for (const [m, col] of [[this.body, t.shirt], [this.legs, 0x22313f], [this.head, 0xe0ac69]]) { m.setMatrixAt(n, this.m4); m.setColorAt(n, this.c.setHex(col)); }
      n++;
    }
    for (const m of [this.body, this.legs, this.head]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  // dichtste punt op de as van het voertuig (deur), en waar op het voertuig (afstand vanaf de kop)
  nearestOn(v, t) {
    let best = null;
    for (let s = 1; s < v.L; s += 1.5) { const h = this.tr.behind(v, s, {}), d = Math.hypot(h.x - t.x, h.z - t.z); if (!best || d < best.d) best = { x: h.x, z: h.z, d, s }; }
    t.boardOff = best.s; return best;
  }
}
