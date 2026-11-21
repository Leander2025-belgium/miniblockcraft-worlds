// Rook en stoom (TERRANOVA 15): wolkjes uit de schoorsteen van de stoomlocomotief (Alpen: historische stoomtrein).
// Een vaste pool van wolkjes (één InstancedMesh): ze stijgen op, worden groter en lichter en verdwijnen na een paar
// seconden. Puffen in het ritme van de drijfwielen (zoals het geluid, js/sound.js): sneller rijden = vaker, en bij
// stilstand alleen een dun pluimpje. Geen textuur nodig; kost één tekenopdracht.
import * as THREE from 'three';

const MAX = 160, LIFE = 4.2;
export class Smoke {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false }), MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.p = []; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
    this.stats = { wolkjes: 0 };
  }
  // één wolkje op (x, y, z), met de rijsnelheid (vx, vz) van de locomotief (de rook blijft achter)
  puff(x, y, z, vx = 0, vz = 0, big = 1) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({ x, y, z, vx: -vx * 0.15 + (Math.random() - 0.5) * 0.4, vz: -vz * 0.15 + (Math.random() - 0.5) * 0.4, vy: 2.2 + Math.random() * 0.8, age: 0, s: (1.5 + Math.random() * 0.5) * big, rot: Math.random() * 6.28 });
    this.stats.wolkjes++;
  }
  update(dt, day = 1) {
    let n = 0;
    this.p = this.p.filter(q => (q.age += dt) < LIFE);
    for (const q of this.p) {
      q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt; q.vy = Math.max(0.3, q.vy - dt * 0.7);
      const f = q.age / LIFE, sc = q.s * (1 + f * 4.5);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), q.rot + f); this.v.set(q.x, q.y, q.z); this.s.set(sc, sc * 0.85, sc);
      this.m4.compose(this.v, this.q, this.s); this.mesh.setMatrixAt(n, this.m4);
      // donkergrijs uit de schoorsteen, lichter tijdens het opstijgen; 's nachts donkerder
      const g = (0.24 + 0.6 * f) * (0.35 + 0.65 * day); this.mesh.setColorAt(n, this.c.setRGB(g, g, g * 1.02)); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}
