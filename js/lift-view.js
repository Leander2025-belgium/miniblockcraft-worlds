// Bewegende cabines, gondels en stoeltjes van de kabelbanen (algemeen; de liften komen uit js/lifts.js).
import * as THREE from 'three';
import { Parts } from './vehicles.js';
import { LIFT_SPEED } from './lifts.js';

export class LiftView {
  constructor(LIFTS) {
    this.LIFTS = LIFTS;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mk = (f) => { const P = new Parts(); f(P); return P.done().trim; };
    const geos = {
      // grote cabine (pendelbaan voor 80 personen)
      cable: mk(P => { P.box('trim', 5.2, 2.6, 7.6, 0, -1.6, 0, 0xd0242a); P.box('trim', 5.3, 1.3, 7.7, 0, -1.2, 0, 0x26323d); P.box('trim', 5.0, 0.3, 7.4, 0, -0.1, 0, 0xeeeeee); P.box('trim', 0.3, 3.6, 0.3, 0, 1.7, 0, 0x3a3d42); P.box('trim', 2.4, 0.5, 1.2, 0, 3.6, 0, 0x55595f); }),
      gondola: mk(P => { P.box('trim', 2.6, 0.95, 2.6, 0, -0.68, 0, 0x1f6fd1); P.box('trim', 2.64, 1.05, 2.64, 0, 0.33, 0, 0x2a3846); P.box('trim', 2.5, 0.3, 2.5, 0, 1.08, 0, 0xf1f1f1); P.box('trim', 0.14, 2.6, 0.14, 0, 2.45, 0, 0x3a3d42); P.box('trim', 0.7, 0.3, 0.4, 0, 3.75, 0, 0x55595f); }),
      // stoeltje (vier personen)
      chair: mk(P => { P.box('trim', 2.6, 0.12, 0.6, 0, -2.6, 0.05, 0x2f7d3a); P.box('trim', 2.6, 0.6, 0.1, 0, -2.25, -0.25, 0x2f7d3a); P.box('trim', 2.6, 0.05, 0.05, 0, -1.95, 0.4, 0xbfc3c8); P.box('trim', 0.08, 2.6, 0.08, 0, -1.3, -0.25, 0x55595f); P.box('trim', 0.4, 0.2, 0.3, 0, 0, -0.25, 0x3a3d42); }),
    };
    this.items = [];
    const lines = [];
    for (const L of LIFTS) {
      const spacing = L.kind === 'cable' ? 0 : L.kind === 'gondola' ? 110 : 24;
      const N = L.kind === 'cable' ? 2 : Math.max(2, Math.floor(2 * (L.len - 2 * L.stL) / spacing));
      const im = new THREE.InstancedMesh(geos[L.kind], this.mat, N); im.frustumCulled = false;
      this.group.add(im);
      this.items.push({ L, im, N });
      for (const side of [1, -1]) { let prev = null; for (let u = L.pts[0].u; u <= L.pts[L.pts.length - 1].u + 0.01; u += 8) { const p = this.world(L, u, side * L.track, L.cableY(u)); if (prev) lines.push(...prev, ...p); prev = p; } }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222 })); this.lines.frustumCulled = false;
    this.farLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222 })); this.farLines.frustumCulled = false;
    this.group.add(this.lines);
    // eigen cabine tijdens het meerijden
    this.cab = new THREE.Group(); this.cabMats = [new THREE.MeshBasicMaterial({ color: 0xc8282c }), new THREE.MeshBasicMaterial({ color: 0x3a3d42 })];
    const add = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); this.cab.add(o); };
    add(3.4, 0.12, 3.4, 0, -1.15, 0, this.cabMats[1]); add(3.4, 0.12, 3.4, 0, 1.25, 0, this.cabMats[0]);
    for (const [px, pz] of [[1.7, 1.7], [-1.7, 1.7], [1.7, -1.7], [-1.7, -1.7]]) add(0.08, 2.4, 0.08, px, 0.05, pz, this.cabMats[0]);
    add(0.16, 3.0, 0.16, 0, 2.8, 0, this.cabMats[1]);
    this.cab.visible = false; this.group.add(this.cab);
    this.t = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
  }
  world(L, u, v, y) { return [L.ax + L.ux * u - L.uz * v, y, L.az + L.uz * u + L.ux * v]; }
  // positie van cabine/stoel nummer i (of van een rit: s = afgelegde weg in de lus)
  at(L, s, out) {
    const a = L.pts[0].u, b = L.pts[L.pts.length - 1].u, len = b - a;
    s = ((s % (2 * len)) + 2 * len) % (2 * len);
    const up = s < len, u = a + (up ? s : 2 * len - s), v = up ? L.track : -L.track;
    const hang = L.kind === 'chair' ? 0 : L.kind === 'cable' ? 4.8 : 4.3;
    const p = this.world(L, u, v, L.cableY(u) - hang);
    out.x = p[0]; out.y = p[1]; out.z = p[2]; out.u = u; out.up = up; out.yaw = Math.atan2(L.ux, L.uz) + (up ? 0 : Math.PI);
    return out;
  }
  update(dt, day) {
    this.t += dt;
    const light = 0.2 + 0.8 * day; this.mat.color.setScalar(light);
    this.lines.material.color.setScalar(0.12 + 0.1 * day);
    const g = {}, e = new THREE.Euler();
    for (const it of this.items) {
      const L = it.L, a = L.pts[0].u, len = L.pts[L.pts.length - 1].u - a, sp = LIFT_SPEED[L.kind];
      for (let i = 0; i < it.N; i++) {
        let s;
        if (L.kind === 'cable') {
          // pendelbaan: twee cabines, heen en terug met 40 s wachten in de stations
          const T = len / sp + 40, ph = (this.t + i * T) % (2 * T), k = ph < T ? Math.min(1, Math.max(0, (ph - 20) / (T - 40))) : 1 + Math.min(1, Math.max(0, (ph - T - 20) / (T - 40)));
          s = k * len;
        } else s = this.t * sp + i * (2 * len / it.N);
        this.at(L, s, g);
        e.set(0, g.yaw, 0); this.q.setFromEuler(e); this.v.set(g.x, g.y, g.z);
        it.im.setMatrixAt(i, this.m4.compose(this.v, this.q, this.sc));
      }
      it.im.instanceMatrix.needsUpdate = true;
    }
  }
  // staat de speler in een dal- of bergstation van een lift? → { L, top }
  stationNear(p) {
    for (const L of this.LIFTS) for (const [u, y, top] of [[0, L.ya, false], [L.len, L.yb, true]]) {
      const dx = p.x - L.ax, dz = p.z - L.az, uu = dx * L.ux + dz * L.uz, vv = -dx * L.uz + dz * L.ux;
      if (Math.abs(uu - u) < L.stL + 2 && Math.abs(vv) < L.stW + 2 && p.y > y - 2 && p.y < y + 12) return { L, top };
    }
    return null;
  }
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.group.removeFromParent(); this.farLines.geometry.dispose(); }
}
