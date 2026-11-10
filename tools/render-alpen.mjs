// Overzichtskaart van de Alpenwereld als PNG (om terrein en tracés te controleren). node tools/render-alpen.mjs [uit.png] [raw]
import { writeFileSync } from 'fs';
import { PNG } from './node_modules/pngjs/lib/png.js';
const raw = process.argv[3] === 'raw';
const T = raw ? await import('../js/alpen-terrain.js') : await import('../js/alpen.js');
const H = raw ? T.rawHeight : T.natural;
const S = 100, N = 500, png = new PNG({ width: N, height: N });
const h = new Float32Array(N * N);
let t0 = Date.now(), mx = 0, mxAt = 0;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = H(i * S + S / 2, j * S + S / 2); h[j * N + i] = v; if (v > mx) { mx = v; mxAt = j * N + i; } }
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const v = h[j * N + i], vx = h[j * N + Math.min(N - 1, i + 1)], vz = h[Math.min(N - 1, j + 1) * N + i];
  const slope = Math.hypot(vx - v, vz - v) / S;
  let c = v < 0 ? [52, 104, 170] : v > 2800 && slope < 0.8 ? [236, 240, 246] : v > 2300 || slope > 0.9 ? [128, 124, 118] : v > 1900 ? [122, 160, 78] : v > 900 ? [38, 82, 46] : [62, 114, 54];
  const sh = Math.max(0.4, Math.min(1.4, 1 + ((v - vx) + (v - vz)) / S * 0.8));
  const o = (j * N + i) * 4; png.data[o] = Math.min(255, c[0] * sh); png.data[o + 1] = Math.min(255, c[1] * sh); png.data[o + 2] = Math.min(255, c[2] * sh); png.data[o + 3] = 255;
}
if (!raw && T.mapOverlay) for (const [x, z, rgb] of T.mapOverlay(S)) { const i = Math.floor(x / S), j = Math.floor(z / S); if (i >= 0 && j >= 0 && i < N && j < N) { const o = (j * N + i) * 4; png.data.set(rgb, o); } }
writeFileSync(process.argv[2] || 'alpen.png', PNG.sync.write(png));
console.log('klaar in', Date.now() - t0, 'ms · hoogste punt', Math.round(mx), 'm op', (mxAt % N) * S, Math.floor(mxAt / N) * S);
