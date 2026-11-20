// Spoorinfrastructuur in 3D rond de speler (Greenisland, Alpen): bovenleiding (masten met uitleggers en rijdraad
// boven elk spoor, in tunnels aan het plafond), seinpalen met seinkast, en wissels bij de kruisingssporen
// (wisselmotor met lantaarn en wisselbord). Alleen binnen 1,2 km van de speler, opnieuw opgebouwd als je verder
// beweegt (InstancedMesh: weinig tekenwerk).
import * as THREE from 'three';

// rijdraad op de hoogte van de stroomafnemer (js/trainshell.js: 6,85 m boven de spoorstaaf; spoorstaaf = lijn + 1)
const R = 1200, STEP = 60, WIRE = 7.85;
export class RailInfra {
  constructor(scene, lines, trackOffset, TRACK) {
    this.lines = lines.filter(L => !L.tram && !L.bus); this.trackOffset = trackOffset; this.TRACK = TRACK;
    this.group = new THREE.Group(); scene.add(this.group);
    const mat = this.mat = new THREE.MeshBasicMaterial({ vertexColors: false, color: 0x8a9096 });
    const dark = this.dark = new THREE.MeshBasicMaterial({ color: 0x23262a });
    const mk = (geo, m, max) => { const im = new THREE.InstancedMesh(geo, m, max); im.count = 0; im.frustumCulled = false; this.group.add(im); return im; };
    this.mast = mk(new THREE.BoxGeometry(0.3, 8.0, 0.3).translate(0, 4.0, 0), mat, 1600);
    this.arm = mk(new THREE.BoxGeometry(1, 0.14, 0.14).translate(0.5, 0, 0), mat, 3200);
    this.sigPole = mk(new THREE.BoxGeometry(0.22, 1, 0.22).translate(0, 0.5, 0), dark, 400);
    this.sigHead = mk(new THREE.BoxGeometry(0.75, 1.5, 0.35), dark, 400);
    this.sigPlate = mk(new THREE.BoxGeometry(1.1, 1.9, 0.08), new THREE.MeshBasicMaterial({ color: 0x0d0e10 }), 400);
    this.sw = mk(new THREE.BoxGeometry(0.9, 0.5, 1.4).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: 0x3b4a5a }), 200);
    this.swLamp = mk(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), 200);
    this.swSign = mk(new THREE.BoxGeometry(0.06, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), 200);
    // wisseltongen: twee per wissel, ze schuiven naar de kant van de trein die eraan komt
    this.blade = mk(new THREE.BoxGeometry(0.09, 0.14, 9).translate(0, 0, 4.5), new THREE.MeshBasicMaterial({ color: 0xb8bec6 }), 400);
    this.switches = []; this.jsw = [];
    this.wireGeo = new THREE.BufferGeometry();
    this.wires = new THREE.LineSegments(this.wireGeo, new THREE.LineBasicMaterial({ color: 0x1c1d1f })); this.wires.frustumCulled = false; this.group.add(this.wires);
    this.at = null; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0);
    this.counts = { masten: 0, wissels: 0, seinen: 0 };
  }
  dispose() { this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.group.removeFromParent(); }
  put(im, n, x, y, z, yaw, sx = 1, sy = 1, sz = 1) { this.q.setFromAxisAngle(this.up, yaw); this.v.set(x, y, z); this.s.set(sx, sy, sz); this.m4.compose(this.v, this.q, this.s); im.setMatrixAt(n, this.m4); }
  update(p) {
    if (this.at && Math.hypot(p.x - this.at.x, p.z - this.at.z) < 200) return;
    this.at = { x: p.x, z: p.z };
    let nm = 0, na = 0, ns = 0;
    this.switches = [];
    const wires = [], q = {}, q2 = {};
    for (const L of this.lines) {
      // snel overslaan: is de lijn ergens in de buurt?
      let near = false;
      for (let i = 0; i < L.n; i += 4) if (Math.abs(L.x[i] - p.x) < R + 200 && Math.abs(L.z[i] - p.z) < R + 200) { near = true; break; }
      if (!near) continue;
      const electric = !L.rack && !L.bus;
      for (let s = 0; s < L.len; s += STEP) {
        L.at(s, q);
        if (Math.abs(q.x - p.x) > R || Math.abs(q.z - p.z) > R) continue;
        const off = this.trackOffset(L, s), tracks = off ? [-off, off] : [0], yaw = Math.atan2(q.tx, q.tz);
        const tunnel = q.kind === 1, nx = -q.tz, nz = q.tx;
        if (electric) {
          // mast naast het buitenste spoor, uitleggers boven elk spoor (niet in tunnels: daar hangt de draad aan het plafond)
          if (!tunnel && nm < 1600) {
            const side = (Math.floor(s / STEP) % 2 ? 1 : -1), mo = (off || 0) + 3.4;
            const mx = q.x + nx * mo * side, mz = q.z + nz * mo * side;
            this.put(this.mast, nm++, mx, q.y + 1, mz, yaw);
            for (const t of tracks) if (na < 3200) { const dl = t - mo * side, reach = Math.abs(dl) + 0.3, dx = nx * Math.sign(dl), dz = nz * Math.sign(dl); this.put(this.arm, na++, mx, q.y + 8.0, mz, Math.atan2(-dz, dx), reach, 1, 1); }
          }
          // rijdraad naar het volgende stuk
          L.at(Math.min(L.len, s + STEP), q2);
          const off2 = this.trackOffset(L, Math.min(L.len, s + STEP));
          for (let i = 0; i < tracks.length; i++) {
            const t1 = tracks[i], t2 = off2 ? (i ? off2 : -off2) : 0;
            wires.push(q.x + nx * t1, q.y + WIRE, q.z + nz * t1, q2.x - q2.tz * t2, q2.y + WIRE, q2.z + q2.tx * t2);
          }
        }
      }
      // wissels: waar een enkelspoor zich splitst in een kruisingsspoor voor een station
      if (L.single) for (const st of L.stations) for (const s0 of [st.s0 - 92, st.s1 + 92]) {
        if (s0 < 0 || s0 > L.len || ns >= 200) continue;
        L.at(s0, q);
        if (Math.abs(q.x - p.x) > R || Math.abs(q.z - p.z) > R) continue;
        const nx = -q.tz, nz = q.tx, yaw = Math.atan2(q.tx, q.tz);
        this.put(this.sw, ns, q.x + nx * 2.4, q.y + 1, q.z + nz * 2.4, yaw);
        this.put(this.swLamp, ns, q.x + nx * 2.4, q.y + 1.8, q.z + nz * 2.4, yaw);
        this.put(this.swSign, ns, q.x + nx * 3.4, q.y + 2.2, q.z + nz * 3.4, yaw);
        // de tongen wijzen naar het station (daar splitst het spoor)
        const into = s0 < st.s0 ? 1 : -1;
        this.switches.push({ L, s: s0, x: q.x, y: q.y, z: q.z, nx, nz, yaw: yaw + (into < 0 ? Math.PI : 0), throw: 0, target: 0 });
        ns++;
      }
    }
    // wisselmotor, lantaarn en wisselbord bij de wissels tussen lijnen
    for (const sw of this.jsw) {
      if (ns >= 200 || Math.abs(sw.x - p.x) > R || Math.abs(sw.z - p.z) > R) continue;
      this.put(this.sw, ns, sw.x + sw.nx * 3.6, sw.y + 1, sw.z + sw.nz * 3.6, sw.yaw);
      this.put(this.swLamp, ns, sw.x + sw.nx * 3.6, sw.y + 1.8, sw.z + sw.nz * 3.6, sw.yaw);
      this.put(this.swSign, ns, sw.x + sw.nx * 4.6, sw.y + 2.2, sw.z + sw.nz * 4.6, sw.yaw);
      ns++;
    }
    this.mast.count = nm; this.arm.count = na; this.sw.count = this.swLamp.count = this.swSign.count = ns;
    for (const im of [this.mast, this.arm, this.sw, this.swLamp, this.swSign]) im.instanceMatrix.needsUpdate = true;
    this.wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.wireGeo.computeBoundingSphere();
    this.counts.masten = nm; this.counts.wissels = ns; this.counts.draad = wires.length / 6;
  }
  // wissels omzetten: voor de dichtstbijzijnde trein die eraan komt (een trein in richting +1 rijdt op het spoor aan
  // de ene kant van het kruisingsspoor, in richting -1 aan de andere kant); de tongen schuiven in ±2 s om
  // overloopwissels tussen lijnen (js/crossover.js): wisselmotor, lantaarn en tongen aan beide uiteinden
  setJunctions(list) {
    this.jsw = [];
    for (const c of list) for (const end of ['A', 'B']) {
      const L = end === 'A' ? c.A : c.B, s = end === 'A' ? c.sA : c.sBend, dir = end === 'A' ? c.aDir : -c.bdir, q = L.at(s);
      const o = this.trackOffset(L, s) * dir, nx = -q.tz, nz = q.tx;
      this.jsw.push({ c, x: q.x + nx * o, y: q.y, z: q.z + nz * o, nx, nz, yaw: Math.atan2(q.tx * dir, q.tz * dir), throw: -1, target: -1 });
    }
  }
  animate(dt, trains, player, routes) {
    let n = 0;
    // wissel tussen lijnen: ligt om naar lijn B als de bestuurde trein hem zo gezet heeft, of als er een rijweg voor
    // een automatische trein is ingesteld (rail.js updateRoutes)
    for (const sw of this.jsw) {
      if (this.at && (Math.abs(sw.x - this.at.x) > R || Math.abs(sw.z - this.at.z) > R)) continue;
      sw.target = (player && ((player.junction && player.junction.c === sw.c) || player.L === sw.c)) || (routes && routes.has(sw.c.id)) ? 1 : -1;
      const step = dt * 0.5; sw.throw += Math.max(-step, Math.min(step, sw.target - sw.throw));
      for (const k of [-1, 1]) { if (n >= 400) break; const lat = k * 0.72 - sw.throw * 0.11; this.put(this.blade, n++, sw.x + sw.nx * lat, sw.y + 1.06, sw.z + sw.nz * lat, sw.yaw); }
    }
    this.counts.lijnwissels = this.jsw.length;
    for (const sw of this.switches) {
      let best = 1e9, side = sw.target;
      for (const t of trains) {
        if (t.L !== sw.L) continue;
        const d = (sw.s - t.s) * t.dir;
        if (d > -t.len && d < 2500 && d < best) { best = d; side = t.dir; }
      }
      sw.target = side;
      const step = dt * 0.5; sw.throw += Math.max(-step, Math.min(step, sw.target - sw.throw));
      for (const k of [-1, 1]) {
        if (n >= 400) break;
        // tong ligt tegen de buitenste spoorstaaf van de kant waar de trein niet heen gaat
        const lat = k * 0.72 - sw.throw * 0.11;
        this.put(this.blade, n++, sw.x + sw.nx * lat, sw.y + 1.06, sw.z + sw.nz * lat, sw.yaw);
      }
    }
    this.blade.count = n; this.blade.instanceMatrix.needsUpdate = true;
    this.counts.tongen = n;
  }
  // seinpaal en seinkast voor elke seinlamp (rail.js geeft de plekken)
  setSignals(list) {
    let n = 0;
    for (const sg of list) {
      if (n >= 400) break;
      this.put(this.sigPole, n, sg.x, sg.y0, sg.z, sg.yaw, 1, sg.y - sg.y0 - 0.6, 1);
      this.put(this.sigHead, n, sg.x, sg.y, sg.z, sg.yaw);
      this.put(this.sigPlate, n, sg.x - Math.sin(sg.yaw) * 0.2, sg.y, sg.z - Math.cos(sg.yaw) * 0.2, sg.yaw);
      n++;
    }
    this.sigPole.count = this.sigHead.count = this.sigPlate.count = n;
    for (const im of [this.sigPole, this.sigHead, this.sigPlate]) im.instanceMatrix.needsUpdate = true;
    this.counts.seinen = n;
  }
  setDay(day) { const l = 0.3 + 0.7 * day; this.mat.color.setRGB(0.54 * l, 0.565 * l, 0.59 * l); }
}
