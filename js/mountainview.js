// Reuzenberg in beeld: het verre berglandschap (tot ~16 km ver) en de kabelbaan met bewegende gondels.
import * as THREE from 'three';
import { heightAt, overviewColor, CABLE, cableY, CX, STATIONS, CABLE_ATTACH, MW, ML } from './mountain.js';

// ---------- ver landschap ----------
const VERT = `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vRel;
void main() {
  vColor = color;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vRel = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = `
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float day;
uniform float nearCut;
varying vec3 vColor;
varying vec3 vRel;
void main() {
  if (length(vRel.xz) < nearCut) discard; // dichtbij staan de echte blokken
  vec3 col = vColor * mix(0.16, 1.0, day);
  float fog = smoothstep(fogNear, fogFar, length(vRel));
  gl_FragColor = vec4(mix(col, fogColor, fog * 0.92), 1.0);
}`;

export class MountainView {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 2, 40000);
    this.camera.rotation.order = 'YXZ';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { fogColor: { value: new THREE.Vector3() }, fogNear: { value: 3000 }, fogFar: { value: 26000 }, day: { value: 1 }, nearCut: { value: 200 } },
    });
    this.buildTerrain();
    this.gondolas = new Gondolas();
    this.scene.add(this.gondolas.farLines);
  }
  buildTerrain() {
    // 50 m raster over de wereld en 5 km daarbuiten
    const S = 50, M = 5000, x0 = -M, z0 = -M, nx = Math.ceil((MW + 2 * M) / S) + 1, nz = Math.ceil((ML + 2 * M) / S) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * S, z = z0 + j * S, k = (j * nx + i) * 3;
      // buiten de wereld zakt het land wat weg (geen muur aan de rand)
      const out = Math.max(0, -x, -z, x - MW, z - ML);
      pos[k] = x; pos[k + 1] = heightAt(x, z) - 6 - Math.min(40, out * 0.01); pos[k + 2] = z;
      const c = overviewColor(x, z, S);
      col[k] = Math.min(1, c[0] / 255); col[k + 1] = Math.min(1, c[1] / 255); col[k + 2] = Math.min(1, c[2] / 255);
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const free = function () { this.array = null; };
    for (const a of Object.values(g.attributes)) a.onUpload(free);
    g.index.onUpload(free);
    this.terrain = new THREE.Mesh(g, this.mat);
    this.terrain.frustumCulled = false;
    this.scene.add(this.terrain);
  }
  // eerst het verre landschap tekenen, daarna de gewone scène erover
  render(renderer, mainCam, env, nearCut) {
    const c = this.camera;
    c.position.copy(mainCam.position); c.rotation.copy(mainCam.rotation);
    if (c.aspect !== mainCam.aspect || c.fov !== mainCam.fov) { c.aspect = mainCam.aspect; c.fov = mainCam.fov; c.updateProjectionMatrix(); }
    const u = this.mat.uniforms;
    u.fogColor.value.set(...env.sky); u.day.value = env.day; u.nearCut.value = nearCut;
    this.gondolas.farLines.material.color.setScalar(0.12 + 0.1 * env.day);
    renderer.render(this.scene, c);
  }
  dispose() {
    this.terrain.geometry.dispose(); this.mat.dispose();
    this.gondolas.dispose();
  }
}

// ---------- kabelbaan ----------
const P = CABLE.pts, D0 = P[0].d, D1 = P[P.length - 1].d, LEN = D1 - D0;
export const RIDE_SPEED = 11;
// positie van een gondel: s loopt van 0 tot 2·LEN (eerst omhoog op het oostspoor, dan omlaag op het westspoor)
export function gondolaAt(s, out) {
  s = ((s % (2 * LEN)) + 2 * LEN) % (2 * LEN);
  const up = s < LEN, d = D0 + (up ? s : 2 * LEN - s);
  out.x = CX + (up ? CABLE.track : -CABLE.track);
  out.z = CABLE.z0 - d;
  out.y = cableY(d) - 4.3;
  out.up = up; out.d = d;
  return out;
}
export const CABLE_LEN = LEN;

export class Gondolas {
  constructor() {
    this.N = Math.floor(2 * LEN / 150);
    const mk = (geo, color) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), this.N);
      m.frustumCulled = false;
      return m;
    };
    this.group = new THREE.Group();
    this.body = mk(new THREE.BoxGeometry(2.6, 2.3, 2.6), 0xc8282c);
    this.win = mk(new THREE.BoxGeometry(2.7, 0.9, 2.7), 0x9fc8e0);
    this.hang = mk(new THREE.BoxGeometry(0.18, 3.0, 0.18), 0x40444a);
    this.group.add(this.body, this.win, this.hang);
    // kabels (dichtbij in de gewone scène, ver weg in het verre landschap)
    const pts = [];
    for (const side of [1, -1]) {
      const x = CX + side * CABLE.track;
      let prev = null;
      for (let d = D0; d <= D1 + 0.01; d += 6) {
        const p = [x, cableY(Math.min(d, D1)), CABLE.z0 - Math.min(d, D1)];
        if (prev) pts.push(...prev, ...p);
        prev = p;
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222 }));
    this.lines.frustumCulled = false;
    this.farLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222222 }));
    this.farLines.frustumCulled = false;
    this.group.add(this.lines);
    // eigen cabine als je meerijdt: vloer, dak en hoekstijlen (open zicht)
    const cab = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: 0xc8282c }), dark = new THREE.MeshBasicMaterial({ color: 0x3a3d42 });
    const W = 1.6; // halve breedte
    const add = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); cab.add(o); };
    add(2 * W, 0.12, 2 * W, 0, -1.15, 0, dark); // vloer
    add(2 * W, 0.12, 2 * W, 0, 1.25, 0, red); // dak
    for (const [px, pz] of [[W, W], [-W, W], [W, -W], [-W, -W]]) add(0.08, 2.4, 0.08, px, 0.05, pz, red); // hoekstijlen
    for (const [px, pz, sx, sz] of [[0, W, 2 * W, 0.06], [0, -W, 2 * W, 0.06], [W, 0, 0.06, 2 * W], [-W, 0, 0.06, 2 * W]]) add(sx, 0.06, sz, px, -0.25, pz, red); // leuning
    add(0.16, 3.0, 0.16, 0, 2.8, 0, dark); // ophanging
    cab.visible = false;
    this.cab = cab; this.cabMats = [red, dark];
    this.group.add(cab);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
    this.tmp = {};
    this.t = 0;
  }
  update(dt, day) {
    this.t += dt;
    const light = 0.2 + 0.8 * day;
    this.body.material.color.setRGB(0.78 * light, 0.16 * light, 0.17 * light);
    this.win.material.color.setRGB(0.62 * light, 0.78 * light, 0.88 * light);
    this.hang.material.color.setScalar(0.27 * light);
    this.lines.material.color.setScalar(0.12 + 0.1 * day);
    this.cabMats[0].color.setRGB(0.78 * light, 0.16 * light, 0.17 * light);
    this.cabMats[1].color.setScalar(0.23 * light);
    const g = this.tmp;
    for (let i = 0; i < this.N; i++) {
      gondolaAt(this.t * RIDE_SPEED + i * (2 * LEN / this.N), g);
      this.v.set(g.x, g.y, g.z);
      this.m4.compose(this.v, this.q, this.sc);
      this.body.setMatrixAt(i, this.m4);
      this.v.y += 0.25; this.m4.compose(this.v, this.q, this.sc); this.win.setMatrixAt(i, this.m4);
      this.v.y += 2.4; this.m4.compose(this.v, this.q, this.sc); this.hang.setMatrixAt(i, this.m4);
    }
    for (const m of [this.body, this.win, this.hang]) m.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.group.removeFromParent();
  }
}

// staat de speler in een station? (om in te stappen)
export function stationNear(p) {
  for (let i = 0; i < STATIONS.length; i++) {
    const s = STATIONS[i];
    if (Math.abs(p.x - s.x) < 15 && Math.abs(p.z - s.z) < 22 && p.y > s.y - 2 && p.y < s.y + 12) return i;
  }
  return -1;
}
export { STATIONS, CABLE_ATTACH, D0 as CABLE_D0, D1 as CABLE_D1 };
