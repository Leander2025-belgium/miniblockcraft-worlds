// Verre gebouwen (eenvoudige blokken per 8 × 8 m) en de minikaart.
import * as THREE from 'three';

const VERT = `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vWorld;
varying float vDist;
varying float vSide;
varying vec3 vRel;
attribute float side;
void main() {
  vColor = color; vSide = side;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vRel = wp.xyz - cameraPosition;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float day;
varying vec3 vColor;
varying vec3 vWorld;
varying float vDist;
varying float vSide;
varying vec3 vRel;
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 col = vColor * mix(0.16, 1.0, day);
  if (vSide > 0.5) {
    // gevel: raamraster, 's nachts deels verlicht
    vec3 cell = floor(vWorld / vec3(2.0, 3.0, 2.0));
    float win = step(0.35, fract(vWorld.y / 3.0)) * step(0.3, fract((vWorld.x + vWorld.z) / 2.0));
    col *= 1.0 - win * 0.18;
    float lit = win * step(0.66, h3(cell)) * (1.0 - day);
    col = mix(col, vec3(1.0, 0.84, 0.55), lit * 0.85);
  }
  float fog = smoothstep(fogNear, fogFar, length(vRel)); // per pixel, berekend vanaf de camera (nauwkeurig op telefoons)
  gl_FragColor = vec4(mix(col, fogColor, fog), 1.0);
}`;

export class FarView {
  constructor(scene, spec) {
    this.scene = scene; this.spec = spec;
    this.T = spec.tile; this.nx = spec.tilesX || spec.tiles; this.nz = spec.tilesZ || spec.tiles; this.G = spec.ground;
    this.step = spec.miniStep || 1; // grote werelden: minikaart op halve resolutie
    this.meshes = new Map();
    this.data = new Map();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { fogColor: { value: new THREE.Vector3() }, fogNear: { value: 400 }, fogFar: { value: 2000 }, day: { value: 1 } },
    });
    // grondvlak onder de hele kaart en ver daarbuiten (geen lege lucht onder de horizon)
    const SX = this.nx * this.T, SZ = this.nz * this.T, M = 6000, gy = this.G - 2.5, gc = spec.groundColor || [0.55, 0.56, 0.52];
    const gp = new THREE.BufferGeometry();
    const P = [[-M, gy, -M], [-M, gy, SZ + M], [SX + M, gy, SZ + M], [SX + M, gy, -M]];
    const pos = [], col = [], side = [];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); col.push(...gc); side.push(0); }
    gp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gp.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    gp.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    this.groundMesh = new THREE.Mesh(gp, this.mat);
    this.groundMesh.frustumCulled = false;
    this.groundMesh.renderOrder = -2;
    scene.add(this.groundMesh);
    // minikaart: 1 pixel per vak van 8 m
    this.cell = 8;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.nx * (this.T / this.cell) / this.step;
    this.canvas.height = this.nz * (this.T / this.cell) / this.step;
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  key(tx, tz) { return tz * 1000 + tx; }
  add(tx, tz, lod) {
    const k = this.key(tx, tz);
    if (!lod || this.data.has(k)) return;
    this.data.set(k, lod);
    this.drawMini(tx, tz, lod);
    const old = this.meshes.get(k);
    if (old) { this.scene.remove(old); old.geometry.dispose(); }
    const g = this.build(tx, tz, lod);
    if (!g) return;
    const m = new THREE.Mesh(g, this.mat);
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    this.meshes.set(k, m);
  }
  drawMini(tx, tz, lod) {
    const n = lod.n, st = this.step, m = n / st, img = new ImageData(m, m);
    for (let z = 0; z < m; z++) for (let x = 0; x < m; x++) {
      const i = (z * st) * n + x * st, o = (z * m + x) * 4;
      const hgt = Math.max(0, lod.h[i] - this.G);
      const f = 0.82 + Math.min(0.45, hgt / 250);
      img.data[o] = lod.c[i * 3] * f; img.data[o + 1] = lod.c[i * 3 + 1] * f; img.data[o + 2] = lod.c[i * 3 + 2] * f; img.data[o + 3] = 255;
    }
    this.canvas.getContext('2d').putImageData(img, tx * m, tz * m);
  }
  build(tx, tz, lod) {
    if (this.spec.smoothLod) return this.buildSmooth(tx, tz, lod);
    if (lod.g) return this.buildCity(tx, tz, lod);
    const n = lod.n, s = this.T / n, G = this.G;
    const pos = [], col = [], side = [], idx = [];
    // buiten de tegel: geen hoge muur tot zeeniveau, alleen een korte rand (de buurtegel tekent zijn eigen kant)
    const H = (x, z) => (x < 0 || z < 0 || x >= n || z >= n) ? lod.h[Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x))] - 3 : lod.h[z * n + x];
    const quad = (a, b, c, d, rgb, shade, isSide) => {
      const o = pos.length / 3;
      for (const v of [a, b, c, d]) { pos.push(v[0], v[1], v[2]); col.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade); side.push(isSide); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    // grond (weg, gras, water) als vlakke stroken: aaneengesloten vakken met dezelfde kleur en hoogte samen
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n;) {
        const i = z * n + x, h = lod.h[i];
        if (h > G + 2) { x++; continue; }
        let e = x + 1;
        while (e < n && lod.h[z * n + e] === h && lod.c[(z * n + e) * 3] === lod.c[i * 3] && lod.c[(z * n + e) * 3 + 1] === lod.c[i * 3 + 1] && lod.c[(z * n + e) * 3 + 2] === lod.c[i * 3 + 2]) e++;
        const rgb = [lod.c[i * 3] / 255, lod.c[i * 3 + 1] / 255, lod.c[i * 3 + 2] / 255];
        const x0 = tx * this.T + x * s, x1 = tx * this.T + e * s, z0 = tz * this.T + z * s, z1 = z0 + s, y1 = h + 1;
        quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], rgb, 1.0, 0);
        x = e;
      }
    }
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const h = lod.h[z * n + x];
      if (h <= G + 2) continue;
      const i = z * n + x, rgb = [lod.c[i * 3] / 255, lod.c[i * 3 + 1] / 255, lod.c[i * 3 + 2] / 255];
      const x0 = tx * this.T + x * s, x1 = x0 + s, z0 = tz * this.T + z * s, z1 = z0 + s, y1 = h + 1;
      quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], rgb, 1.0, 0);
      const sideRgb = rgb.map(v => v * 0.85 + 0.08);
      const yb = (nh) => Math.max(G + 1, nh + 1);
      if (H(x - 1, z) < h) quad([x0, yb(H(x - 1, z)), z0], [x0, yb(H(x - 1, z)), z1], [x0, y1, z1], [x0, y1, z0], sideRgb, 0.78, 1);
      if (H(x + 1, z) < h) quad([x1, yb(H(x + 1, z)), z1], [x1, yb(H(x + 1, z)), z0], [x1, y1, z0], [x1, y1, z1], sideRgb, 0.78, 1);
      if (H(x, z - 1) < h) quad([x1, yb(H(x, z - 1)), z0], [x0, yb(H(x, z - 1)), z0], [x0, y1, z0], [x1, y1, z0], sideRgb, 0.64, 1);
      if (H(x, z + 1) < h) quad([x0, yb(H(x, z + 1)), z1], [x1, yb(H(x, z + 1)), z1], [x1, y1, z1], [x0, y1, z1], sideRgb, 0.64, 1);
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const free = function () { this.array = null; };
    for (const a of Object.values(g.attributes)) a.onUpload(free);
    g.index.onUpload(free);
    return g;
  }
  // stad met hoogteverschillen: de grond als glad oppervlak (geen trappen van een blok), gebouwen als blokken erop
  buildCity(tx, tz, lod) {
    const n = lod.n, s = this.T / n, pos = [], col = [], side = [], idx = [];
    const cl = (v) => Math.max(0, Math.min(n - 1, v));
    const Gd = (x, z) => lod.g[cl(z) * n + cl(x)] + 1, Hh = (x, z) => lod.h[cl(z) * n + cl(x)];
    const X0 = tx * this.T, Z0 = tz * this.T;
    // grond
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
      const h = (Gd(x - 1, z - 1) + Gd(x, z - 1) + Gd(x - 1, z) + Gd(x, z)) / 4;
      pos.push(X0 + x * s, h, Z0 + z * s); side.push(0);
      for (let k = 0; k < 3; k++) col.push((lod.gc[(cl(z - 1) * n + cl(x - 1)) * 3 + k] + lod.gc[(cl(z) * n + cl(x)) * 3 + k] + lod.gc[(cl(z) * n + cl(x - 1)) * 3 + k] + lod.gc[(cl(z - 1) * n + cl(x)) * 3 + k]) / 4 / 255 * 0.9);
    }
    const V = (x, z) => z * (n + 1) + x;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) idx.push(V(x, z), V(x, z + 1), V(x + 1, z + 1), V(x, z), V(x + 1, z + 1), V(x + 1, z));
    const quad = (a, b, c, d, rgb, shade, isSide) => {
      const o = pos.length / 3;
      for (const v of [a, b, c, d]) { pos.push(v[0], v[1], v[2]); col.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade); side.push(isSide); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    // gebouwen: hoger dan 3 m boven de grond van het vak
    const bld = (x, z) => x >= 0 && z >= 0 && x < n && z < n && Hh(x, z) > lod.g[z * n + x] + 3;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      if (!bld(x, z)) continue;
      const i = z * n + x, h = lod.h[i], g0 = lod.g[i] + 1, rgb = [lod.c[i * 3] / 255, lod.c[i * 3 + 1] / 255, lod.c[i * 3 + 2] / 255];
      const x0 = X0 + x * s, x1 = x0 + s, z0 = Z0 + z * s, z1 = z0 + s, y1 = h + 1;
      quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], rgb, 1.0, 0);
      const sideRgb = rgb.map(v => v * 0.85 + 0.08);
      const yb = (nx, nz) => Math.max(g0 - 1, bld(nx, nz) ? Hh(nx, nz) + 1 : g0 - 1);
      if (yb(x - 1, z) < y1) quad([x0, yb(x - 1, z), z0], [x0, yb(x - 1, z), z1], [x0, y1, z1], [x0, y1, z0], sideRgb, 0.78, 1);
      if (yb(x + 1, z) < y1) quad([x1, yb(x + 1, z), z1], [x1, yb(x + 1, z), z0], [x1, y1, z0], [x1, y1, z1], sideRgb, 0.78, 1);
      if (yb(x, z - 1) < y1) quad([x1, yb(x, z - 1), z0], [x0, yb(x, z - 1), z0], [x0, y1, z0], [x1, y1, z0], sideRgb, 0.64, 1);
      if (yb(x, z + 1) < y1) quad([x0, yb(x, z + 1), z1], [x1, yb(x, z + 1), z1], [x1, y1, z1], [x0, y1, z1], sideRgb, 0.64, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    const free = function () { this.array = null; };
    for (const a of Object.values(g.attributes)) a.onUpload(free);
    g.index.onUpload(free);
    return g;
  }
  // natuurlandschap: een glad oppervlak door de middens van de vakken (met een rokje tegen naden)
  buildSmooth(tx, tz, lod) {
    const n = lod.n, s = this.T / n, pos = [], col = [], side = [], idx = [];
    // de grond volgen (bomen en daken hooguit 4 m erboven), anders zweeft het oppervlak op boomkruinhoogte boven het dal
    const H = (x, z) => { const i = Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x)); return (lod.g ? Math.min(lod.h[i], lod.g[i] + 4) : lod.h[i]) + 1; };
    const C = (x, z, k) => lod.c[(Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x))) * 3 + k] / 255;
    const X0 = tx * this.T, Z0 = tz * this.T;
    // hoekpunten op de vakgrenzen: gemiddelde van de 4 vakken eromheen
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
      const h = (H(x - 1, z - 1) + H(x, z - 1) + H(x - 1, z) + H(x, z)) / 4;
      const sh = 0.85 + Math.max(-0.2, Math.min(0.2, (H(x - 1, z) - H(x, z) + H(x, z - 1) - H(x, z)) * 0.02));
      pos.push(X0 + x * s, h, Z0 + z * s);
      for (let k = 0; k < 3; k++) col.push((C(x - 1, z - 1, k) + C(x, z, k) + C(x - 1, z, k) + C(x, z - 1, k)) / 4 * sh);
      side.push(0);
    }
    const V = (x, z) => z * (n + 1) + x;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) idx.push(V(x, z), V(x, z + 1), V(x + 1, z + 1), V(x, z), V(x + 1, z + 1), V(x + 1, z));
    // rokje langs de rand (6 m naar beneden)
    const ring = [];
    for (let x = 0; x <= n; x++) ring.push(V(x, 0)); for (let z = 1; z <= n; z++) ring.push(V(n, z));
    for (let x = n - 1; x >= 0; x--) ring.push(V(x, n)); for (let z = n - 1; z >= 1; z--) ring.push(V(0, z));
    ring.push(ring[0]);
    const base = pos.length / 3;
    for (const v of ring) { pos.push(pos[v * 3], pos[v * 3 + 1] - 6, pos[v * 3 + 2]); col.push(col[v * 3] * 0.8, col[v * 3 + 1] * 0.8, col[v * 3 + 2] * 0.8); side.push(0); }
    for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1], a2 = base + i, b2 = base + i + 1; idx.push(a, a2, b2, a, b2, b, a, b2, a2, a, b, b2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }
  // verberg verre blokken waar de echte tegel geladen is
  update(env, far, tiles, px, pz) { // verre blokken alleen verbergen als de echte tegel helemaal opgebouwd is
    const u = this.mat.uniforms;
    u.fogColor.value.set(...env.sky); u.day.value = env.day;
    u.fogNear.value = far * 0.6; u.fogFar.value = far * 1.6; // grond blijft ver zichtbaar, geen lege band onder de horizon
    const lim = (far + this.T) ** 2;
    for (const [k, m] of this.meshes) {
      const tx = k % 1000, tz = Math.floor(k / 1000);
      const dx = (tx + 0.5) * this.T - px, dz = (tz + 0.5) * this.T - pz;
      const t = tiles.get(k);
      m.visible = !(t && t.ready) && dx * dx + dz * dz < lim;
    }
  }
  dispose() {
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh.geometry.dispose(); this.groundMesh = null; }
    for (const m of this.meshes.values()) { this.scene.remove(m); m.geometry.dispose(); }
    this.meshes.clear(); this.data.clear();
  }
}
