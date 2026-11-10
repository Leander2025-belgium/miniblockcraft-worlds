// Reuzenberg · Alpen in beeld: het verre berglandschap (tot tientallen km ver, in stukken van 4 km met
// fijnere rasters dichtbij), de oude kabelbaan met bewegende gondels en alle nieuwe kabelbanen en liften.
import * as THREE from 'three';
import { CABLE, cableY, CX, STATIONS as OLD_STATIONS, CABLE_ATTACH, EXTRAS } from './mountain.js';
import { natural, farColor, OX, OZ, MW, ML, LIFTS } from './alpen.js';
import { Parts } from './vehicles.js';
const STATIONS = OLD_STATIONS.map(s => ({ ...s, x: s.x + OX, z: s.z + OZ }));

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
    this.camera = new THREE.PerspectiveCamera(75, 1, 2, 90000);
    this.camera.rotation.order = 'YXZ';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { fogColor: { value: new THREE.Vector3() }, fogNear: { value: 5000 }, fogFar: { value: 70000 }, day: { value: 1 }, nearCut: { value: 200 } },
    });
    this.chunks = new Map(); this.jobs = [];
    this.gondolas = new Gondolas();
    this.gondolas.farLines.position.set(OX, 0, OZ);
    this.scene.add(this.gondolas.farLines);
    this.lifts = new AlpLifts();
    this.scene.add(this.lifts.farLines);
  }
  // ---------- het landschap in stukken van 4 km (fijn dichtbij, grof ver weg) ----------
  static CH = 4000;
  levelFor(cx, cz, px, pz) {
    const C = MountainView.CH, dx = Math.max(0, Math.abs(px - (cx + 0.5) * C) - C / 2), dz = Math.max(0, Math.abs(pz - (cz + 0.5) * C) - C / 2), d = Math.hypot(dx, dz);
    return d < 3500 ? 50 : d < 12000 ? 125 : 250;
  }
  updateChunks(px, pz, budgetMs) {
    const C = MountainView.CH, M = 2; // 8 km buiten de wereld verder tekenen (zakt weg)
    const n0 = -M, n1 = Math.ceil(MW / C) + M;
    if (!this.lastCheck || Math.hypot(px - this.lastCheck[0], pz - this.lastCheck[1]) > 500) {
      this.lastCheck = [px, pz];
      const want = [];
      for (let cz = n0; cz < n1; cz++) for (let cx = n0; cx < n1; cx++) {
        const lv = this.levelFor(cx, cz, px, pz), k = cz * 1000 + cx, c = this.chunks.get(k);
        if (!c || c.level !== lv) want.push({ cx, cz, lv, k, d: Math.hypot((cx + 0.5) * C - px, (cz + 0.5) * C - pz) - (c ? 0 : 1e6) });
      }
      want.sort((a, b) => a.d - b.d);
      this.jobs = want.map(w => ({ ...w, it: null }));
    }
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < budgetMs) {
      const j = this.jobs[0];
      if (!j.it) j.it = this.buildChunk(j.cx, j.cz, j.lv);
      const r = j.it.next();
      if (r.done) {
        this.jobs.shift();
        const old = this.chunks.get(j.k);
        if (old) { this.scene.remove(old.mesh); old.mesh.geometry.dispose(); }
        const m = new THREE.Mesh(r.value, this.mat); m.frustumCulled = false; m.matrixAutoUpdate = false;
        this.scene.add(m);
        this.chunks.set(j.k, { level: j.lv, mesh: m });
      }
    }
  }
  * buildChunk(cx, cz, S) {
    const C = MountainView.CH, n = C / S, nx = n + 1, x0 = cx * C, z0 = cz * C;
    // hoogtes met een rand van 1 extra punt (voor de helling)
    const N = nx + 2, h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = x0 + (i - 1) * S, z = z0 + (j - 1) * S;
        const out = Math.max(0, -x, -z, x - MW, z - ML);
        h[j * N + i] = natural(Math.max(-8000, Math.min(MW + 8000, x)), Math.max(-8000, Math.min(ML + 8000, z))) - Math.min(60, out * 0.012);
      }
      if (j % 6 === 5) yield null;
    }
    const nv = nx * nx, sk = 4 * n; // rok rond het stuk tegen kieren
    const pos = new Float32Array((nv + sk * 2) * 3), col = new Float32Array((nv + sk * 2) * 3), c3 = [0, 0, 0];
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, hc = h[(j + 1) * N + i + 1], hx = h[(j + 1) * N + i + 2], hz = h[(j + 2) * N + i + 1], hw = h[(j + 1) * N + i], hn = h[j * N + i + 1];
      const x = x0 + i * S, z = z0 + j * S;
      pos[k * 3] = x; pos[k * 3 + 1] = 12 + hc - 6; pos[k * 3 + 2] = z;
      const slope = Math.max(Math.abs(hx - hc), Math.abs(hz - hc), Math.abs(hw - hc), Math.abs(hn - hc)) / S;
      farColor(x, z, hc, slope, c3);
      const shade = Math.max(0.45, Math.min(1.35, 1 + ((hw - hx) * 0.35 + (hn - hz) * 0.35) / S * 0.9));
      col[k * 3] = Math.min(1, c3[0] / 255 * shade); col[k * 3 + 1] = Math.min(1, c3[1] / 255 * shade); col[k * 3 + 2] = Math.min(1, c3[2] / 255 * shade);
    }
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    // rok: elke randrij een stuk naar beneden
    const ring = [];
    for (let i = 0; i < n; i++) ring.push(i); for (let j = 0; j < n; j++) ring.push(j * nx + n); for (let i = n; i > 0; i--) ring.push(n * nx + i); for (let j = n; j > 0; j--) ring.push(j * nx);
    let o = nv;
    const top0 = o;
    for (const v of ring) { pos[o * 3] = pos[v * 3]; pos[o * 3 + 1] = pos[v * 3 + 1] - S * 0.6; pos[o * 3 + 2] = pos[v * 3 + 2]; col[o * 3] = col[v * 3]; col[o * 3 + 1] = col[v * 3 + 1]; col[o * 3 + 2] = col[v * 3 + 2]; o++; }
    for (let r = 0; r < ring.length; r++) { const a = ring[r], b = ring[(r + 1) % ring.length], a2 = top0 + r, b2 = top0 + (r + 1) % ring.length; idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, o * 3), 3));
    g.setIndex(new THREE.BufferAttribute(nv + ring.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    const free = function () { this.array = null; };
    for (const a of Object.values(g.attributes)) a.onUpload(free);
    g.index.onUpload(free);
    return g;
  }
  // eerst het verre landschap tekenen, daarna de gewone scène erover
  render(renderer, mainCam, env, nearCut) {
    const c = this.camera;
    this.updateChunks(mainCam.position.x, mainCam.position.z, this.budget || 5);
    c.position.copy(mainCam.position); c.rotation.copy(mainCam.rotation);
    if (c.aspect !== mainCam.aspect || c.fov !== mainCam.fov) { c.aspect = mainCam.aspect; c.fov = mainCam.fov; c.updateProjectionMatrix(); }
    const u = this.mat.uniforms;
    u.fogColor.value.set(...env.sky); u.day.value = env.day; u.nearCut.value = nearCut;
    this.gondolas.farLines.material.color.setScalar(0.12 + 0.1 * env.day);
    this.lifts.farLines.material.color.setScalar(0.12 + 0.1 * env.day);
    renderer.render(this.scene, c);
  }
  dispose() {
    for (const ch of this.chunks.values()) ch.mesh.geometry.dispose();
    this.chunks.clear(); this.jobs = []; this.mat.dispose();
    this.gondolas.dispose(); this.lifts.dispose();
  }
}

// ---------- kabelbaan ----------
const P = CABLE.pts, D0 = P[0].d, D1 = P[P.length - 1].d, LEN = D1 - D0;
export const RIDE_SPEED = 11;
// positie van een gondel: s loopt van 0 tot 2·LEN (eerst omhoog op het oostspoor, dan omlaag op het westspoor)
export function gondolaAt(s, out) { gondolaLocal(s, out); out.x += OX; out.z += OZ; return out; }
function gondolaLocal(s, out) {
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
    // gondel: rode onderbak, rondom ramen, wit dak, deurnaad, ophangarm met klem
    const P = new Parts();
    P.box('trim', 2.6, 0.95, 2.6, 0, -0.68, 0, 0xc4262b);
    P.box('trim', 2.5, 0.25, 2.5, 0, -1.22, 0, 0x8f1b1f, { sx: 0.9 });
    P.box('trim', 2.64, 1.05, 2.64, 0, 0.33, 0, 0x2a3846);
    P.box('trim', 2.6, 0.08, 2.6, 0, 0.9, 0, 0xc4262b);
    P.box('trim', 2.5, 0.3, 2.5, 0, 1.08, 0, 0xf1f1f1, { sx: 0.82, front: 0.2, back: 0.2 });
    P.box('trim', 0.05, 1.9, 0.04, 1.33, -0.2, 0, 0x30333a);
    P.box('trim', 0.05, 1.9, 0.04, -1.33, -0.2, 0, 0x30333a);
    P.box('trim', 0.14, 2.6, 0.14, 0, 2.45, 0, 0x3a3d42);
    P.box('trim', 0.7, 0.3, 0.4, 0, 3.75, 0, 0x55595f);
    this.model = P.done().trim;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.body = new THREE.InstancedMesh(this.model, this.mat, this.N); this.body.frustumCulled = false;
    this.group.add(this.body);
    this.chairs = new Chairlift();
    this.group.add(this.chairs.group);
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
    // de oude kabelbaan ligt nu midden in de Alpenwereld
    this.group.position.set(OX, 0, OZ);
    // eigen cabine in wereldcoördinaten (buiten de verschoven groep)
    this.group.remove(cab); this.cabRoot = new THREE.Group(); this.cabRoot.add(cab); this.group.parent?.add(this.cabRoot);
  }
  update(dt, day) {
    this.t += dt;
    const light = 0.2 + 0.8 * day;
    this.mat.color.setScalar(light);
    this.chairs.update(dt, light);
    this.lines.material.color.setScalar(0.12 + 0.1 * day);
    this.cabMats[0].color.setRGB(0.78 * light, 0.16 * light, 0.17 * light);
    this.cabMats[1].color.setScalar(0.23 * light);
    const g = this.tmp;
    for (let i = 0; i < this.N; i++) {
      gondolaLocal(this.t * RIDE_SPEED + i * (2 * LEN / this.N), g);
      this.v.set(g.x, g.y, g.z);
      this.m4.compose(this.v, this.q, this.sc);
      this.body.setMatrixAt(i, this.m4);
    }
    this.body.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    for (const g of [this.group, this.cabRoot]) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); g.removeFromParent(); }
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

// ---------- stoeltjeslift in het skigebied ----------
class Chairlift {
  constructor() {
    const L = EXTRAS.LIFT, P0 = L.pts[0], P1 = L.pts[L.pts.length - 1];
    this.L = L; this.len = P0.z - P1.z; this.N = Math.floor(2 * this.len / 22);
    const P = new Parts();
    P.box('trim', 1.9, 0.12, 0.6, 0, -2.6, 0.05, 0x24364f);   // zitting
    P.box('trim', 1.9, 0.6, 0.1, 0, -2.25, -0.25, 0x24364f);  // rugleuning
    P.box('trim', 1.9, 0.05, 0.05, 0, -1.95, 0.4, 0xbfc3c8);  // beugel
    P.box('trim', 0.08, 2.6, 0.08, 0, -1.3, -0.25, 0x55595f); // ophanging
    P.box('trim', 0.4, 0.2, 0.3, 0, 0, -0.25, 0x3a3d42);      // klem
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(P.done().trim, this.mat, this.N); this.mesh.frustumCulled = false;
    const pts = [];
    for (const side of [1, -1]) {
      let prev = null;
      for (let z = P0.z; z >= P1.z - 0.01; z -= 4) { const p = [L.x + side * L.track, EXTRAS.liftY(z), z]; if (prev) pts.push(...prev, ...p); prev = p; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x222222 })); this.line.frustumCulled = false;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.line);
    this.t = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
    this.qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  }
  update(dt, light) {
    this.t += dt;
    this.mat.color.setScalar(light);
    const L = this.L, P0 = L.pts[0], len = this.len;
    for (let i = 0; i < this.N; i++) {
      let s = (this.t * 2.6 + i * (2 * len / this.N)) % (2 * len);
      const up = s < len, z = P0.z - (up ? s : 2 * len - s);
      this.v.set(L.x + (up ? L.track : -L.track), EXTRAS.liftY(z), z);
      this.m4.compose(this.v, up ? this.qDown : this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- de nieuwe kabelbanen, gondelbanen en stoeltjesliften van de Alpenwereld ----------
export const LIFT_SPEED = { cable: 10, gondola: 6, chair: 2.6 };
export class AlpLifts {
  constructor() {
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
    for (const L of LIFTS) for (const [u, y, top] of [[0, L.ya, false], [L.len, L.yb, true]]) {
      const dx = p.x - L.ax, dz = p.z - L.az, uu = dx * L.ux + dz * L.uz, vv = -dx * L.uz + dz * L.ux;
      if (Math.abs(uu - u) < L.stL + 2 && Math.abs(vv) < L.stW + 2 && p.y > y - 2 && p.y < y + 12) return { L, top };
    }
    return null;
  }
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.group.removeFromParent(); this.farLines.geometry.dispose(); }
}
