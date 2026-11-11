// Greenisland in de verte: het landschap van het hele eiland (145 × 50 km) en de zee eromheen, in stukken van 4 km
// (fijn dichtbij, grof ver weg), stap voor stap opgebouwd. Zelfde opbouw als js/mountainview.js (Alpen).
import * as THREE from 'three';
import { natural, farColor, MW, ML } from './greenisland.js';

function stubLift() {
  const g = new THREE.Group(), cab = new THREE.Group(); cab.visible = false;
  return { group: g, cabRoot: new THREE.Group(), cab, farLines: new THREE.Group(), update() {}, dispose() {}, stationNear: () => null, at: () => ({}) };
}
// ---------- ver landschap ----------
const VERT = `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vRel;
varying float vY;
void main() {
  vColor = color;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vRel = wp.xyz - cameraPosition; vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = `
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float day;
uniform float nearCut;
uniform vec3 sunColor;
varying vec3 vColor;
varying vec3 vRel;
varying float vY;
void main() {
  if (length(vRel.xz) < nearCut) discard; // dichtbij staan de echte blokken
  vec3 col = vColor * mix(0.16, 1.0, day) * mix(vec3(1.0), sunColor, 0.35);
  float dist = length(vRel);
  // luchtperspectief: verre bergen worden blauwer en lichter
  float haze = smoothstep(2000.0, 45000.0, dist);
  vec3 hazeCol = mix(fogColor, vec3(0.62, 0.72, 0.86) * mix(0.2, 1.0, day), 0.45);
  col = mix(col, hazeCol, haze * 0.55);
  // dalmist: laaghangende nevel in de dalen, sterker in de verte
  float mist = exp(-max(0.0, vY - 80.0) / 650.0) * smoothstep(1200.0, 9000.0, dist) * 0.5;
  col = mix(col, mix(fogColor, vec3(0.86, 0.88, 0.9) * mix(0.25, 1.0, day), 0.5), mist);
  float fog = smoothstep(fogNear, fogFar, dist);
  gl_FragColor = vec4(mix(col, fogColor, fog * 0.92), 1.0);
}`;

export class MountainView {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 2, 90000);
    this.camera.rotation.order = 'YXZ';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { fogColor: { value: new THREE.Vector3() }, fogNear: { value: 5000 }, fogFar: { value: 70000 }, day: { value: 1 }, nearCut: { value: 200 }, sunColor: { value: new THREE.Vector3(1, 1, 1) } },
    });
    this.chunks = new Map(); this.jobs = [];
    // (nog) geen kabelbanen in Greenisland: lege objecten met dezelfde vorm als in de Alpen
    this.gondolas = stubLift(); this.lifts = stubLift();
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
        h[j * N + i] = Math.max(-0.4, natural(Math.max(-8000, Math.min(MW + 8000, x)), Math.max(-8000, Math.min(ML + 8000, z)))); // zee op zeeniveau (niet de zeebodem)
      }
      if (j % 6 === 5) yield null;
    }
    const nv = nx * nx, sk = 4 * n; // rok rond het stuk tegen kieren
    const pos = new Float32Array((nv + sk * 2) * 3), col = new Float32Array((nv + sk * 2) * 3), c3 = [0, 0, 0];
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, hc = h[(j + 1) * N + i + 1], hx = h[(j + 1) * N + i + 2], hz = h[(j + 2) * N + i + 1], hw = h[(j + 1) * N + i], hn = h[j * N + i + 1];
      const x = x0 + i * S, z = z0 + j * S;
      pos[k * 3] = x; pos[k * 3 + 1] = 12 + hc - 0.6; pos[k * 3 + 2] = z;
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
    u.fogColor.value.set(...env.sky); u.day.value = env.day; u.nearCut.value = nearCut; if (env.sunColor) u.sunColor.value.set(...env.sunColor);
        renderer.render(this.scene, c);
  }
  dispose() {
    for (const ch of this.chunks.values()) ch.mesh.geometry.dispose();
    this.chunks.clear(); this.jobs = []; this.mat.dispose();
  }
}


// geen (oude) kabelbaan in deze wereld
export function stationNear() { return -1; }
export function gondolaAt(s, out) { return out; }
export const STATIONS = [], CABLE_D0 = 0, CABLE_D1 = 0, RIDE_SPEED = 0, LIFT_SPEED = { cable: 10, gondola: 6, chair: 2.6 };
