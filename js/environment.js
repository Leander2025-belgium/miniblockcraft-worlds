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
    this.mat = new THREE.ShaderMaterial({
      uniforms: { horizon: { value: new THREE.Vector3() }, top: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Vector3() }, night: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }`,
      fragmentShader: `uniform vec3 horizon; uniform vec3 top; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; varying vec3 vDir;
        float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 c = mix(horizon, top, pow(y, 0.55));
          if (d.y < 0.0) c = horizon * (1.0 + d.y * 0.25);
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunColor * (pow(s, 8.0) * 0.28 + pow(s, 64.0) * 0.35) * (1.0 - night * 0.8);
          c = mix(c, sunColor * 1.6, smoothstep(0.9993, 0.9997, s) * step(-0.05, sunDir.y));
          // sterren
          vec3 q = floor(d * 380.0);
          float hq = h(q), st = step(0.9984, hq) * night * smoothstep(0.0, 0.25, d.y) * (0.4 + 0.6 * fract(hq * 97.0));
          c += vec3(st) * 0.9;
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
