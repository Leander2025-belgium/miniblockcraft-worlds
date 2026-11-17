// Lucht, zon, dag en nacht, en wolken.
import * as THREE from 'three';

const DAY = [0.66, 0.82, 0.96], DUSK = [0.98, 0.6, 0.38], NIGHT = [0.03, 0.04, 0.09];
const TOP_DAY = [0.22, 0.45, 0.86], TOP_DUSK = [0.32, 0.3, 0.55], TOP_NIGHT = [0.01, 0.015, 0.05];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// uur 0..24 -> daglicht 0..1, horizon- en hemelkleur, zonrichting en zonkleur
export function skyAt(hour) {
  const ang = ((hour - 6) / 12) * Math.PI;           // 6u op, 18u onder
  const h = Math.sin(ang);
  const day = Math.max(0, Math.min(1, h * 2.2 + 0.25));
  const dusk = Math.max(0, 1 - Math.abs(h) * 3.2) * (h > -0.3 ? 1 : 0);
  let sky = mix(NIGHT, DAY, day);
  sky = mix(sky, DUSK, dusk * 0.62);
  let top = mix(TOP_NIGHT, TOP_DAY, day);
  top = mix(top, TOP_DUSK, dusk * 0.5);
  const sun = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.12, h), 0.45).normalize();
  const sunTrue = new THREE.Vector3(Math.cos(ang) * 0.8, h, 0.45).normalize(); // echte stand (ook onder de horizon)
  // zonlicht: wit middag, goudoranje bij zonsopgang en -ondergang
  const sunColor = mix([1.0, 0.97, 0.9], [1.0, 0.62, 0.34], Math.min(1, dusk * 1.3));
  return { day, sky, sun, sunTrue, dusk, top, sunColor };
}

// Lucht als koepel: kleurverloop van horizon naar zenit, gloed rond de zon, zonneschijf en sterren
export class SkyDome {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 1, 4000);
    this.camera.rotation.order = 'YXZ';
    // hemel: atmosfeer (blauw naar de horizon toe lichter), gloed rond de zon, rood-oranje zonsopkomst en -ondergang,
    // maan en fonkelende sterren, en een wolkenlaag (fbm-ruis op 1,6 km hoogte) die meedrijft en door de zon belicht wordt
    this.mat = new THREE.ShaderMaterial({
      uniforms: { horizon: { value: new THREE.Vector3() }, top: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Vector3() }, night: { value: 0 },
        time: { value: 0 }, cover: { value: 0.45 }, camXZ: { value: new THREE.Vector2() }, clouds: { value: 1 } },
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }`,
      fragmentShader: `uniform vec3 horizon; uniform vec3 top; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; uniform float time; uniform float cover; uniform vec2 camXZ; uniform float clouds; varying vec3 vDir;
        float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return v; }
        void main() {
          vec3 d = normalize(vDir), L = normalize(sunDir);
          float y = max(d.y, 0.0);
          // atmosfeer: lichter en warmer aan de horizon
          vec3 c = mix(horizon, top, pow(y, 0.5));
          c = mix(c, horizon * 1.08 + vec3(0.03), exp(-y * 9.0) * 0.5);
          if (d.y < 0.0) c = horizon * (1.0 + d.y * 0.25);
          float s = max(dot(d, L), 0.0);
          // zonsopkomst/-ondergang: oranje band aan de horizon in de richting van de zon
          float low = 1.0 - smoothstep(-0.05, 0.35, L.y);
          c += vec3(1.0, 0.42, 0.12) * low * pow(s, 3.0) * exp(-y * 4.0) * 0.6 * (1.0 - night * 0.7);
          c += sunColor * (pow(s, 8.0) * 0.28 + pow(s, 64.0) * 0.35) * (1.0 - night * 0.8);
          c = mix(c, sunColor * 1.6, smoothstep(0.9993, 0.9997, s) * step(-0.05, L.y));
          // maan (tegenover de zon) en sterren
          float m = max(dot(d, -L), 0.0);
          c += vec3(0.85, 0.88, 0.95) * smoothstep(0.99955, 0.9998, m) * night;
          c += vec3(0.35, 0.4, 0.55) * pow(m, 60.0) * 0.25 * night;
          vec3 q = floor(d * 380.0);
          float hq = h(q), tw = 0.6 + 0.4 * sin(time * 2.0 + hq * 60.0);
          float st = step(0.9984, hq) * night * smoothstep(0.0, 0.25, d.y) * (0.4 + 0.6 * fract(hq * 97.0)) * tw;
          c += vec3(st) * 0.9;
          // wolken
          if (clouds > 0.5 && d.y > 0.02) {
            vec2 uv = d.xz / d.y * 1.6 + camXZ / 1000.0 + vec2(time * 0.004, time * 0.0015);
            float f = fbm(uv * 0.9);
            float a = smoothstep(1.0 - cover - 0.12, 1.0 - cover + 0.25, f);
            float shade = fbm(uv * 0.9 + L.xz * 0.06);
            vec3 lit = mix(vec3(0.62, 0.66, 0.74), vec3(1.0), clamp(1.0 - (shade - f) * 4.0, 0.0, 1.0));
            vec3 cc = lit * mix(vec3(1.0), sunColor, 0.35) * (1.0 - night * 0.82) + vec3(1.0, 0.5, 0.25) * low * 0.35 * pow(s, 2.0);
            cc += sunColor * pow(s, 12.0) * 0.35 * (1.0 - night);
            a *= smoothstep(0.02, 0.18, d.y);
            c = mix(c, cc, a * 0.92);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }
  render(renderer, cam, env) {
    const c = this.camera;
    c.position.copy(cam.position); c.rotation.copy(cam.rotation);
    if (c.aspect !== cam.aspect || c.fov !== cam.fov) { c.aspect = cam.aspect; c.fov = cam.fov; c.updateProjectionMatrix(); }
    const u = this.mat.uniforms;
    u.horizon.value.set(...env.sky); u.top.value.set(...env.top); u.sunDir.value.copy(env.sunTrue); u.sunColor.value.set(...env.sunColor);
    u.night.value = 1 - env.day;
    u.time.value = performance.now() / 1000; u.camXZ.value.set(cam.position.x, cam.position.z);
    u.cover.value = this.cover ?? 0.45;
    renderer.render(this.scene, c);
  }
}

// Wolkenlaag: één groot vlak met een zelfgetekende wolkentextuur die langzaam meedrijft
export function makeClouds(height) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rnd = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const w = (a, b) => rnd(((a % 16) + 16) % 16, ((b % 16) + 16) % 16);
    const a = w(xi, yi), b = w(xi + 1, yi), cc = w(xi, yi + 1), d = w(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (cc - a) * s(yf) + (a - b - cc + d) * s(xf) * s(yf);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.55, f = 16 / S;
    for (let o = 0; o < 4; o++) { v += noise(x * f, y * f) * amp; amp *= 0.5; f *= 2; }
    const a = Math.max(0, Math.min(1, (v - 0.52) * 3.2));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 235;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = height;
  mesh.renderOrder = -1;
  return mesh;
}
