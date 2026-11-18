// Reizigers op de perrons (Greenisland, Alpen): wachten, instappen, uitstappen.
// Alleen bij stations binnen 260 m van de speler; elke reiziger leeft in perroncoördinaten (s langs de lijn,
// lat = afstand tot de as aan één kant), dus ze blijven altijd op het perron en lopen nooit door muren.
// - Wachten: aantal volgens de dienstperiode (spits meer, nacht weinig), verspreid over het perron.
// - Instappen: staat er een trein met open deuren aan hun kant, dan lopen ze naar de dichtste deur en stappen in.
// - Uitstappen: bij het openen van de deuren komen er reizigers uit en die lopen naar de uitgang van het perron.
import * as THREE from 'three';

const MAX = 360, NEAR = 260, WALK = 1.3;
const SHIRTS = [0x2f6db5, 0xc0392b, 0x27ae60, 0xf1c40f, 0x8e44ad, 0x34495e, 0xe67e22, 0xecf0f1, 0x16a085, 0x7f8c8d];
const PANTS = [0x22313f, 0x3b3b3b, 0x5d4037, 0x1a237e, 0x4e5b6e];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const WAIT_PER_PERIOD = { spits: 12, dal: 7, avond: 4, nacht: 1 };

export class Passengers {
  constructor(scene, trackOffset, TRACK) {
    this.trackOffset = trackOffset; this.TRACK = TRACK;
    const mk = (geo, col) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; scene.add(m); void col; return m; };
    this.body = mk(new THREE.BoxGeometry(0.46, 0.66, 0.26).translate(0, 1.2, 0));
    this.legs = mk(new THREE.BoxGeometry(0.4, 0.86, 0.22).translate(0, 0.43, 0));
    this.head = mk(new THREE.BoxGeometry(0.26, 0.28, 0.26).translate(0, 1.69, 0));
    this.list = []; this.stations = new Map(); this.bands = new Map(); this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s1 = new THREE.Vector3(1, 1, 1); this.c = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);
    this.stats = { wachtend: 0, ingestapt: 0, uitgestapt: 0 };
    this.seed = 1;
    this.free = () => true; // (x, y, z) → staat hier niemand in een muur? (gezet door js/rail.js met de echte blokken)
  }
  pos(L, s, side, lat) { const q = L.at(s); return { x: Math.floor(q.x - q.tz * side * lat), y: Math.round(q.y) + 2, z: Math.floor(q.z + q.tx * side * lat) }; }
  okAt(L, s, side, lat) { const w = this.pos(L, s, side, lat); return this.free(w.x, w.y, w.z); }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  dispose() { for (const m of [this.body, this.legs, this.head]) { m.geometry.dispose(); m.removeFromParent(); } }
  // perronstrook aan een kant: binnenrand (bij het spoor) en buitenrand
  // perronstrook aan een kant, afgetast in de echte blokken (perrons zijn niet altijd symmetrisch): binnenrand =
  // de eerste plek vanaf het spoor met vaste vloer en lucht voor voeten en hoofd, buitenrand = de laatste
  band(L, s, side = 1) {
    const key = L.id + ':' + side + ':' + Math.floor(s / 8);
    let b = this.bands.get(key);
    if (b) return b;
    const off = this.trackOffset(L, s), pIn = (off ? this.TRACK : 0) + 2.2;
    let a = null, z = null;
    for (let lat = (off ? this.TRACK : 0) + 2.3; lat <= pIn + 5; lat += 0.4) { if (this.okAt(L, s, side, lat)) { if (a === null) a = lat; z = lat; } else if (a !== null && lat > a + 1.2) break; }
    b = a === null ? { a: off ? this.TRACK + 3.6 : 3.3, b: pIn + 3.6, none: true } : { a: a + 0.3, b: Math.max(a + 0.4, z - 0.3) };
    if (this.bands.size > 4000) this.bands.clear();
    this.bands.set(key, b); return b;
  }
  spawn(st, L, side, state, s, lat) {
    if (this.list.length >= MAX) return null;
    const p = { st, L, side, state, s, lat, ts: s, tlat: lat, shirt: SHIRTS[Math.floor(this.rnd() * SHIRTS.length)], pants: PANTS[Math.floor(this.rnd() * PANTS.length)], skin: SKIN[Math.floor(this.rnd() * SKIN.length)], yaw: 0, ph: this.rnd() * 6 };
    this.list.push(p); return p;
  }
  // trains: [{ L, dir, s (kop), open (deuren open), doors: [s langs de lijn van elke deur], key }]
  update(dt, player, lines, trains, period) {
    // stations in de buurt
    const want = WAIT_PER_PERIOD[period] ?? 6, seen = new Set(), q = {};
    for (const L of lines) {
      if (L.tram || L.bus) continue;
      for (const st of L.stations) {
        if (st.old) continue;
        L.at((st.s0 + st.s1) / 2, q);
        if (Math.abs(q.x - player.x) > NEAR || Math.abs(q.z - player.z) > NEAR || Math.abs(q.y - player.y) > 60) continue;
        const key = L.id + ':' + st.name; seen.add(key);
        let S = this.stations.get(key);
        if (!S) { S = { key, st, L, t: 0 }; this.stations.set(key, S); }
        // aanvullen tot het gewenste aantal wachtenden per kant (rustig, niet allemaal tegelijk)
        S.t -= dt;
        if (S.t <= 0) {
          S.t = 4 + this.rnd() * 6;
          for (const side of [1, -1]) {
            const n = this.list.filter(p => p.st === st && p.L === L && p.side === side && p.state === 'wait').length;
            if (n < want) for (let k = 0; k < 6; k++) { const s = st.s0 + 8 + this.rnd() * Math.max(1, st.s1 - st.s0 - 16), b = this.band(L, s, side), lat = b.a + this.rnd() * Math.max(0, b.b - b.a); if (this.okAt(L, s, side, lat)) { this.spawn(st, L, side, 'wait', s, lat); break; } }
          }
        }
      }
    }
    for (const k of [...this.stations.keys()]) if (!seen.has(k)) this.stations.delete(k);
    // treinen met open deuren aan een perron: instappen en uitstappen
    for (const tr of trains) {
      if (!tr.open) continue;
      const S = [...this.stations.values()].find(S => S.L === tr.L && tr.s > S.st.s0 - 20 && tr.s < S.st.s1 + 20); if (!S) continue;
      const side = Math.sign(this.trackOffset(tr.L, tr.s) * tr.dir) || 1, sides = this.trackOffset(tr.L, tr.s) ? [side] : [1, -1];
      if (!tr.alighted) {
        tr.alighted = true;
        const n = Math.min(tr.doors.length * 2, 2 + Math.floor(this.rnd() * (WAIT_PER_PERIOD[period] ?? 4)));
        for (let i = 0; i < n; i++) { const ds = tr.doors[i % tr.doors.length], sd = sides[i % sides.length], b = this.band(tr.L, ds, sd); if (b.none) continue; const p = this.spawn(S.st, tr.L, sd, 'out', ds, b.a); if (p) { const mid = (S.st.s0 + S.st.s1) / 2; p.ts = mid + (this.rnd() < 0.5 ? -1 : 1) * (8 + this.rnd() * 6); p.tlat = b.b - 0.3; this.stats.uitgestapt++; } }
      }
      for (const p of this.list) {
        if (p.st !== S.st || p.L !== tr.L || p.state !== 'wait' || !sides.includes(p.side)) continue;
        let best = tr.doors[0]; for (const d of tr.doors) if (Math.abs(d - p.s) < Math.abs(best - p.s)) best = d;
        p.state = 'board'; p.ts = best; p.tlat = this.band(tr.L, best, p.side).a; p.train = tr.key;
      }
    }
    // wie naar een vertrokken trein liep, wacht weer
    const openKeys = new Set(trains.filter(t => t.open).map(t => t.key));
    for (const tr of trains) if (!tr.open) tr.alighted = false;
    // bewegen
    let w = 0;
    for (const p of this.list) {
      if (p.state === 'board' && !openKeys.has(p.train)) { p.state = 'wait'; p.ts = p.s; p.tlat = p.lat; }
      const ds = p.ts - p.s, dl = p.tlat - p.lat, d = Math.hypot(ds, dl);
      if (d > 0.05) {
        const st = Math.min(d, WALK * dt * (p.state === 'wait' ? 0.6 : 1));
        // instappen: eerst naar de perronrand (vrije strook), dan erlangs naar de deur; uitstappen: eerst langs de rand
        let ms = ds / d, ml = dl / d;
        if (p.state === 'board' && Math.abs(dl) > 0.1) { ms = 0; ml = Math.sign(dl); }
        else if (p.state === 'out' && Math.abs(ds) > 0.1) { ms = Math.sign(ds); ml = 0; }
        const ns = p.s + ms * st;
        let nl = p.lat + ml * st, ok = this.okAt(p.L, ns, p.side, nl);
        // obstakel (bank, paal, wachtruimte): opzij stappen, weg van het spoor; lukt het niet, dan blijven staan
        for (const step of [0.5, 1, 1.5]) { if (ok) break; if (this.okAt(p.L, ns, p.side, p.lat + step)) { nl = p.lat + step; ok = true; } }
        if (!ok) { if (p.state === 'wait') { p.ts = p.s; p.tlat = p.lat; } p.moving = false; p.stuck = (p.stuck || 0) + dt; if (p.stuck > 8) p.gone = true; }
        else { p.s = ns; p.lat = nl; p.moving = true; p.stuck = 0; }
      } else p.moving = false;
      if (p.state === 'board' && d < 0.3) { p.gone = true; this.stats.ingestapt++; }
      if (p.state === 'out' && d < 0.3) p.gone = true; // naar de uitgang (trap, plein)
      if (p.state === 'wait') { w++; if (!p.moving && this.rnd() < dt * 0.02) { const ts = Math.max(p.st.s0 + 6, Math.min(p.st.s1 - 6, p.s + (this.rnd() - 0.5) * 6)), b = this.band(p.L, ts, p.side), tl = b.a + this.rnd() * Math.max(0, b.b - b.a); if (this.okAt(p.L, ts, p.side, tl)) { p.ts = ts; p.tlat = tl; } } }
    }
    this.list = this.list.filter(p => !p.gone && this.stations.has(p.L.id + ':' + p.st.name));
    this.stats.wachtend = w;
    // tekenen
    let n = 0;
    for (const p of this.list) {
      p.L.at(p.s, q);
      const nx = -q.tz * p.side, nz = q.tx * p.side, x = q.x + nx * p.lat, z = q.z + nz * p.lat, y = Math.round(q.y) + 2;
      const ds = p.ts - p.s, dl = p.tlat - p.lat;
      if (p.moving) p.yaw = Math.atan2(q.tx * ds + nx * dl, q.tz * ds + nz * dl); else if (p.state === 'wait') p.yaw = Math.atan2(-nx, -nz); // naar het spoor kijken
      const bob = p.moving ? Math.abs(Math.sin((p.ph += dt * 9))) * 0.05 : 0;
      this.q.setFromAxisAngle(this.up, p.yaw); this.v.set(x, y + bob, z); this.m4.compose(this.v, this.q, this.s1);
      this.body.setMatrixAt(n, this.m4); this.legs.setMatrixAt(n, this.m4); this.head.setMatrixAt(n, this.m4);
      this.body.setColorAt(n, this.c.setHex(p.shirt)); this.legs.setColorAt(n, this.c.setHex(p.pants)); this.head.setColorAt(n, this.c.setHex(p.skin));
      n++;
    }
    for (const m of [this.body, this.legs, this.head]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  setDay(day) { const l = 0.3 + 0.7 * day; for (const m of [this.body, this.legs, this.head]) m.material.color.setScalar(l); }
}
