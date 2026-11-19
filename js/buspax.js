// Wachtenden aan bushaltes (verkeerswerelden: Megatower City, Nova Metropool, echte steden).
// Bij elke halte binnen 220 m van de speler wachten er mensen (spits meer, nacht weinig). Staat er een bus met open
// deuren aan de halte, dan lopen ze naar de bus en stappen in; er stappen ook mensen uit die weglopen.
// Elke plek wordt gecontroleerd in de echte blokken (vaste grond, lucht voor voeten en hoofd): nooit in een muur.
import * as THREE from 'three';

const MAX = 240, NEAR = 220, WALK = 1.3;
const SHIRTS = [0x2f6db5, 0xc0392b, 0x27ae60, 0xf1c40f, 0x8e44ad, 0x34495e, 0xe67e22, 0xecf0f1, 0x16a085];
const PANTS = [0x22313f, 0x3b3b3b, 0x5d4037, 0x1a237e];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const BUS_WAIT = { spits: 6, dal: 4, avond: 2, nacht: 1 };

export class BusPax {
  constructor(scene, world) {
    this.w = world;
    const mk = (geo) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(new THREE.BoxGeometry(0.46, 0.66, 0.26).translate(0, 1.2, 0));
    this.legs = mk(new THREE.BoxGeometry(0.4, 0.86, 0.22).translate(0, 0.43, 0));
    this.head = mk(new THREE.BoxGeometry(0.26, 0.28, 0.26).translate(0, 1.69, 0));
    this.list = []; this.stops = new Map(); this.seed = 7; this.stats = { wachtend: 0, ingestapt: 0, uitgestapt: 0 };
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.c = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  dispose() { for (const m of [this.body, this.legs, this.head]) { m.geometry.dispose(); m.removeFromParent(); } }
  // grondhoogte op (x, z) rond y: voeten in de lucht, hoofd in de lucht, vaste grond eronder; anders null
  feet(x, z, y) {
    const S = this.w, X = Math.floor(x), Z = Math.floor(z);
    for (let yy = Math.floor(y) + 3; yy > y - 5; yy--) if (S.solidAt(X, yy - 1, Z) && !S.solidAt(X, yy, Z) && !S.solidAt(X, yy + 1, Z)) return yy;
    return null;
  }
  spot(st) { for (let k = 0; k < 8; k++) { const a = this.rnd() * Math.PI * 2, r = 1 + this.rnd() * 3, x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r, y = this.feet(x, z, st.y + 1); if (y !== null) return { x, z, y }; } return null; }
  add(st, state, at) {
    if (this.list.length >= MAX || !at) return null;
    const p = { st, state, x: at.x, z: at.z, y: at.y, tx: at.x, tz: at.z, yaw: this.rnd() * 6.28, ph: this.rnd() * 6, shirt: SHIRTS[Math.floor(this.rnd() * SHIRTS.length)], pants: PANTS[Math.floor(this.rnd() * PANTS.length)], skin: SKIN[Math.floor(this.rnd() * SKIN.length)] };
    this.list.push(p); return p;
  }
  // stops: [{ kind, x, y, z, name }]; buses: [{ id, x, z, open }]
  update(dt, player, stops, buses, period) {
    const want = BUS_WAIT[period] ?? 3, seen = new Set();
    for (const s of stops) {
      if (s.kind !== 'busstop' || Math.abs(s.x - player.x) > NEAR || Math.abs(s.z - player.z) > NEAR) continue;
      const key = Math.round(s.x) + ',' + Math.round(s.z); seen.add(key);
      let S = this.stops.get(key); if (!S) { S = { key, st: s, t: this.rnd() * 3 }; this.stops.set(key, S); }
      S.t -= dt;
      if (S.t <= 0) { S.t = 5 + this.rnd() * 8; const n = this.list.filter(p => p.st === s && p.state === 'wait').length; if (n < want) this.add(s, 'wait', this.spot(s)); }
    }
    for (const k of [...this.stops.keys()]) if (!seen.has(k)) this.stops.delete(k);
    // bussen met open deuren aan een halte
    for (const b of buses) {
      if (!b.open) { b.served = false; continue; }
      const S = [...this.stops.values()].find(S => Math.hypot(S.st.x - b.x, S.st.z - b.z) < 14); if (!S) continue;
      if (!b.served) { b.served = true; const n = Math.floor(this.rnd() * 3); for (let i = 0; i < n; i++) { const p = this.add(S.st, 'out', { x: b.x, z: b.z, y: this.feet(b.x, b.z, S.st.y + 1) ?? S.st.y + 1 }); if (p) { const a = this.rnd() * 6.28; p.tx = b.x + Math.cos(a) * 12; p.tz = b.z + Math.sin(a) * 12; this.stats.uitgestapt++; } } }
      for (const p of this.list) if (p.st === S.st && p.state === 'wait') { p.state = 'board'; p.tx = b.x; p.tz = b.z; p.bus = b.id; }
    }
    const open = new Set(buses.filter(b => b.open).map(b => b.id));
    let w = 0;
    for (const p of this.list) {
      if (p.state === 'board' && !open.has(p.bus)) { p.state = 'wait'; p.tx = p.x; p.tz = p.z; }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      p.moving = false;
      if (d > 0.1) {
        const st = Math.min(d, WALK * dt), nx = p.x + dx / d * st, nz = p.z + dz / d * st, ny = this.feet(nx, nz, p.y);
        if (ny !== null && Math.abs(ny - p.y) <= 1) { p.x = nx; p.z = nz; p.y = ny; p.moving = true; p.yaw = Math.atan2(dx, dz); }
        else if (p.state === 'wait') { p.tx = p.x; p.tz = p.z; } // obstakel: blijven staan
        else if (p.state === 'board' && d < 3.5) p.gone = true; // tegen de bus: ingestapt
        else p.stuck = (p.stuck || 0) + dt;
      }
      if (p.state === 'board' && d < 1.6) { p.gone = true; this.stats.ingestapt++; }
      if (p.state === 'out' && (d < 0.3 || p.stuck > 4)) p.gone = true;
      if (p.state === 'wait') w++;
    }
    this.list = this.list.filter(p => !p.gone && this.stops.has(Math.round(p.st.x) + ',' + Math.round(p.st.z)));
    this.stats.wachtend = w;
    let n = 0;
    for (const p of this.list) {
      const bob = p.moving ? Math.abs(Math.sin((p.ph += dt * 9))) * 0.05 : 0;
      this.q.setFromAxisAngle(this.up, p.yaw); this.v.set(p.x, p.y + bob, p.z); this.m4.compose(this.v, this.q, this.one);
      for (const [m, col] of [[this.body, p.shirt], [this.legs, p.pants], [this.head, p.skin]]) { m.setMatrixAt(n, this.m4); m.setColorAt(n, this.c.setHex(col)); }
      n++;
    }
    for (const m of [this.body, this.legs, this.head]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  setDay(day) { const l = 0.3 + 0.7 * day; for (const m of [this.body, this.legs, this.head]) m.material.color.setScalar(l); }
}
