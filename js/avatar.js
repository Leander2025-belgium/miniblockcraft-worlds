// Eigen 3D-personage met animaties: stilstaan, lopen, rennen, springen, zwemmen en vliegen.
// Uiterlijk (kleren, huid, haar, hoofddeksel, rugzak) is aanpasbaar en wordt bewaard.
import * as THREE from 'three';
import { Parts } from './vehicles.js';

export const DEFAULT_LOOK = { shirt: '#2e6db5', pants: '#2b3445', skin: '#e0ac87', hair: '#3b2a1c', shoes: '#1d1d1f', hat: 'none', backpack: false };

function part(build) { const P = new Parts(); build(P); return P.done().paint; }

export class Avatar {
  constructor(scene, look) {
    this.group = new THREE.Group();
    this.mats = {};
    const mat = (k) => (this.mats[k] = this.mats[k] || new THREE.MeshBasicMaterial({ vertexColors: true }));
    const mesh = (geo, k) => new THREE.Mesh(geo, mat(k));
    // romp en hoofd hangen aan de heup; armen en benen draaien rond schouder en heup
    this.body = new THREE.Group(); this.body.position.y = 0.92; this.group.add(this.body);
    this.torso = mesh(part(P => { P.box('paint', 0.46, 0.64, 0.26, 0, 0.32, 0); P.box('paint', 0.42, 0.1, 0.24, 0, 0.66, 0); }), 'shirt');
    this.body.add(this.torso);
    this.neck = new THREE.Group(); this.neck.position.y = 0.7; this.body.add(this.neck);
    this.head = mesh(part(P => P.box('paint', 0.24, 0.27, 0.25, 0, 0.15, 0)), 'skin'); this.neck.add(this.head);
    this.face = mesh(part(P => { P.box('paint', 0.04, 0.035, 0.01, 0.055, 0.17, 0.126); P.box('paint', 0.04, 0.035, 0.01, -0.055, 0.17, 0.126); P.box('paint', 0.08, 0.02, 0.01, 0, 0.08, 0.126); }), 'eyes');
    this.neck.add(this.face);
    this.hair = mesh(part(P => { P.box('paint', 0.26, 0.09, 0.27, 0, 0.29, -0.005); P.box('paint', 0.26, 0.16, 0.06, 0, 0.2, -0.11); }), 'hair'); this.neck.add(this.hair);
    this.cap = mesh(part(P => { P.box('paint', 0.27, 0.1, 0.27, 0, 0.32, 0); P.box('paint', 0.24, 0.03, 0.14, 0, 0.28, 0.18); }), 'hat'); this.neck.add(this.cap);
    this.beanie = mesh(part(P => { P.box('paint', 0.27, 0.16, 0.27, 0, 0.32, 0); P.box('paint', 0.08, 0.06, 0.08, 0, 0.42, 0); }), 'hat'); this.neck.add(this.beanie);
    this.pack = mesh(part(P => { P.box('paint', 0.36, 0.44, 0.16, 0, 0.36, -0.2); P.box('paint', 0.3, 0.1, 0.12, 0, 0.12, -0.2); }), 'pack'); this.body.add(this.pack);
    const limb = (x, y, w, h, d, k, shoe) => {
      const g = new THREE.Group(); g.position.set(x, y, 0);
      g.add(mesh(part(P => P.box('paint', w, h, d, 0, -h / 2, 0)), k));
      if (shoe) g.add(mesh(part(P => P.box('paint', w + 0.02, 0.1, d + 0.1, 0, -h - 0.04, 0.04)), 'shoes'));
      else g.add(mesh(part(P => P.box('paint', w * 0.9, 0.1, d * 0.9, 0, -h - 0.04, 0)), 'skin')); // hand
      return g;
    };
    this.legL = limb(0.11, 0, 0.18, 0.84, 0.2, 'pants', true); this.legR = limb(-0.11, 0, 0.18, 0.84, 0.2, 'pants', true);
    this.body.add(this.legL, this.legR);
    this.armL = limb(0.3, 0.6, 0.13, 0.56, 0.15, 'shirt'); this.armR = limb(-0.3, 0.6, 0.13, 0.56, 0.15, 'shirt');
    this.body.add(this.armL, this.armR);
    this.phase = 0; this.look = { ...DEFAULT_LOOK };
    this.setLook(look);
    this.group.traverse(o => o.layers.enable(1)); // werpt een schaduw
    scene.add(this.group);
  }
  setLook(look) {
    this.look = { ...DEFAULT_LOOK, ...(look || {}) };
    const L = this.look;
    this.base = { shirt: L.shirt, pants: L.pants, skin: L.skin, hair: L.hair, shoes: L.shoes, hat: L.hat === 'cap' ? '#c8102e' : '#2f4f6f', pack: '#4b5d3a', eyes: '#1b1b1b' };
    this.cap.visible = L.hat === 'cap'; this.beanie.visible = L.hat === 'beanie'; this.hair.visible = L.hat !== 'beanie';
    this.pack.visible = !!L.backpack;
    this.light = -1;
  }
  // p: speler, s: { speed, onGround, inWater, fly, vy }
  update(dt, p, s, light, visible) {
    this.group.visible = visible;
    if (!visible) return;
    if (Math.abs(light - this.light) > 0.01) {
      this.light = light;
      for (const [k, m] of Object.entries(this.mats)) m.color.set(this.base[k] || '#ffffff').multiplyScalar(light);
    }
    this.group.position.set(p.pos.x, p.pos.y, p.pos.z);
    this.group.rotation.y = p.yaw + Math.PI;
    const run = s.speed > 5, mv = Math.min(1, s.speed / 4.4);
    this.phase += dt * (s.fly ? 2 : (run ? 11 : 8)) * Math.max(0.2, mv);
    const sw = Math.sin(this.phase);
    let legA = sw * 0.75 * mv * (run ? 1.25 : 1), armA = -sw * 0.6 * mv * (run ? 1.3 : 1), lean = run ? 0.18 : 0.04 * mv, bodyY = 0.92;
    let armSpread = 0.06;
    if (s.fly) {
      // vliegen: gestrekt naar voren, armen vooruit
      lean = 0.25 + Math.min(0.9, s.speed / 30); legA = 0.15 + sw * 0.05; armA = -2.6; armSpread = 0.15;
      this.legL.rotation.x = legA; this.legR.rotation.x = legA * 0.8;
      this.armL.rotation.x = armA; this.armR.rotation.x = armA + 0.2;
    } else if (s.inWater) {
      // zwemmen: horizontaal, schoolslag
      lean = 1.2; const st = Math.sin(this.phase * 0.8);
      this.legL.rotation.x = st * 0.4; this.legR.rotation.x = -st * 0.4;
      this.armL.rotation.x = -1.6 + st * 1.2; this.armR.rotation.x = -1.6 + st * 1.2; armSpread = 0.5 + st * 0.4;
      bodyY = 0.5;
    } else if (!s.onGround) {
      // springen / vallen
      const up = s.vy > 0;
      this.legL.rotation.x = up ? -0.7 : -0.25; this.legR.rotation.x = up ? 0.2 : 0.1;
      this.armL.rotation.x = up ? -2.4 : -0.9; this.armR.rotation.x = up ? -2.2 : -0.8; armSpread = 0.3;
    } else {
      this.legL.rotation.x = legA; this.legR.rotation.x = -legA;
      this.armL.rotation.x = armA; this.armR.rotation.x = -armA;
      // ademen in rust
      if (mv < 0.05) { this.armL.rotation.x = Math.sin(this.phase * 0.3) * 0.03; this.armR.rotation.x = -this.armL.rotation.x; }
    }
    this.armL.rotation.z = armSpread; this.armR.rotation.z = -armSpread;
    this.body.rotation.x = lean;
    this.body.position.y = bodyY + (s.onGround && !s.fly ? Math.abs(Math.cos(this.phase)) * 0.04 * mv : 0);
    this.neck.rotation.x = -Math.max(-0.6, Math.min(0.6, p.pitch)) * 0.6 - (s.inWater ? 1.0 : s.fly ? lean * 0.7 : 0);
  }
  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
    this.group.removeFromParent();
  }
}
