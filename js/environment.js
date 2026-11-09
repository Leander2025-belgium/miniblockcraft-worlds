// Lucht, zon, dag en nacht, en wolken.
import * as THREE from 'three';

const DAY = [0.62, 0.80, 0.96], DUSK = [0.96, 0.62, 0.42], NIGHT = [0.035, 0.045, 0.10];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// uur 0..24 -> daglicht 0..1, luchtkleur en zonrichting
export function skyAt(hour) {
  const ang = ((hour - 6) / 12) * Math.PI;           // 6u op, 18u onder
  const h = Math.sin(ang);
  const day = Math.max(0, Math.min(1, h * 2.2 + 0.25));
  const dusk = Math.max(0, 1 - Math.abs(h) * 3.5) * (h > -0.3 ? 1 : 0);
  let sky = mix(NIGHT, DAY, day);
  sky = mix(sky, DUSK, dusk * 0.55);
  const sun = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.15, h), 0.45).normalize();
  return { day, sky, sun, dusk };
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
