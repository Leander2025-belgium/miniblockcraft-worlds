// Verkeer: auto's, trams, treinen en wandelaars die over de echte wegen en sporen bewegen.
import * as THREE from 'three';

const KINDS = {
  car: { max: 500, speed: [7, 13], spacing: 45, size: [1.8, 1.4, 4.2], y: 0.7, colors: [0xb02a2a, 0x2a4fa8, 0xe8e8e8, 0x1d1d1f, 0x8a8f96, 0x2f7a3f, 0xd98a1c] },
  tram: { max: 40, speed: [8, 11], spacing: 400, size: [2.4, 3.2, 18], y: 1.6, colors: [0xc8102e, 0xe9e2d0] },
  train: { max: 30, speed: [14, 22], spacing: 900, size: [3, 3.8, 26], y: 1.9, colors: [0xe9e9e9, 0xb4b9be, 0xc8102e] },
  walk: { max: 500, speed: [1.1, 1.6], spacing: 30, size: [0.5, 1.75, 0.4], y: 0.88, colors: [0x334455, 0x7a3b2e, 0x2e5e3a, 0x6b6b6b, 0xa88b5c, 0x1f2a44, 0x8e2d5c] },
};

export class Traffic {
  constructor(scene, ground) {
    this.scene = scene; this.G = ground;
    this.agents = [];
    this.meshes = {};
    const dummy = new THREE.Color();
    for (const [k, def] of Object.entries(KINDS)) {
      const geo = new THREE.BoxGeometry(...def.size);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const m = new THREE.InstancedMesh(geo, mat, def.max);
      m.count = 0; m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 3), 3);
      scene.add(m);
      this.meshes[k] = m;
    }
    // ramen op auto's: tweede, kleinere doos
    const cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.75, 2.2), new THREE.MeshBasicMaterial({ color: 0x9fc4dc }), KINDS.car.max);
    cab.count = 0; cab.frustumCulled = false;
    scene.add(cab);
    this.cab = cab;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = dummy;
  }
  // tegels met paden opnieuw bevolken (na laden/ontladen)
  rebuild(tiles, player) {
    const counts = { car: 0, tram: 0, train: 0, walk: 0 };
    const agents = [];
    // dichtstbijzijnde tegels eerst, zodat het verkeer rond de speler zit
    const list = [...tiles.values()].sort((a, b) => ((a.ox + 64 - player.x) ** 2 + (a.oz + 64 - player.z) ** 2) - ((b.ox + 64 - player.x) ** 2 + (b.oz + 64 - player.z) ** 2));
    for (const t of list) {
      if (!t.paths) continue;
      for (const p of t.paths) {
        const def = KINDS[p.type]; if (!def) continue;
        const pts = p.pts, segs = [];
        let len = 0;
        for (let i = 0; i + 5 < pts.length; i += 3) { const l = Math.hypot(pts[i + 3] - pts[i], pts[i + 4] - pts[i + 1]); segs.push(l); len += l; }
        if (len < 12) continue;
        const n = Math.max(p.type === 'tram' || p.type === 'train' ? 0 : 1, Math.floor(len / def.spacing));
        for (let j = 0; j < n && counts[p.type] < def.max; j++) {
          counts[p.type]++;
          const h = Math.sin((t.ox + t.oz * 7 + j * 13.7 + pts[0]) * 12.9898) * 43758.5453;
          const r = h - Math.floor(h);
          agents.push({ type: p.type, ox: t.ox, oz: t.oz, pts, segs, len, d: r * len, speed: def.speed[0] + r * (def.speed[1] - def.speed[0]),
            color: def.colors[Math.floor(r * 997) % def.colors.length] });
        }
      }
    }
    this.agents = agents;
    for (const [k, m] of Object.entries(this.meshes)) {
      m.count = Math.min(counts[k], KINDS[k].max);
    }
    this.cab.count = this.meshes.car.count;
    // kleuren één keer zetten
    const idx = { car: 0, tram: 0, train: 0, walk: 0 };
    for (const a of agents) {
      const i = idx[a.type]++;
      a.i = i;
      this.col.setHex(a.color);
      this.meshes[a.type].instanceColor.setXYZ(i, this.col.r, this.col.g, this.col.b);
    }
    for (const m of Object.values(this.meshes)) m.instanceColor.needsUpdate = true;
  }
  update(dt, player, day) {
    const light = 0.18 + 0.82 * day;
    for (const m of Object.values(this.meshes)) m.material.color.setScalar(light);
    this.cab.material.color.setRGB(0.62 * light, 0.77 * light, 0.86 * light);
    const far2 = 450 * 450;
    for (const a of this.agents) {
      a.d += a.speed * dt;
      if (a.d >= a.len) a.d -= a.len;
      // positie op de lijn
      let d = a.d, i = 0;
      while (i < a.segs.length - 1 && d > a.segs[i]) { d -= a.segs[i]; i++; }
      const p = a.pts, k = i * 3, sl = a.segs[i] || 1;
      const t = Math.min(1, d / sl);
      const x = a.ox + p[k] + (p[k + 3] - p[k]) * t, z = a.oz + p[k + 1] + (p[k + 4] - p[k + 1]) * t;
      const gy = p[k + 2] + (p[k + 5] - p[k + 2]) * t;
      const dx = x - player.x, dz = z - player.z;
      const def = KINDS[a.type];
      const visible = dx * dx + dz * dz < far2;
      this.q.setFromAxisAngle(this.up, Math.atan2(p[k + 3] - p[k], p[k + 4] - p[k + 1]));
      const bob = a.type === 'walk' ? Math.abs(Math.sin(a.d * 3)) * 0.06 : 0;
      this.v.set(x, gy + 1 + def.y + bob, z);
      this.s.setScalar(visible ? 1 : 0);
      this.m4.compose(this.v, this.q, this.s);
      this.meshes[a.type].setMatrixAt(a.i, this.m4);
      if (a.type === 'car') {
        this.v.y += 1.0;
        this.m4.compose(this.v, this.q, this.s);
        this.cab.setMatrixAt(a.i, this.m4);
      }
    }
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
    this.cab.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    for (const m of [...Object.values(this.meshes), this.cab]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
}
