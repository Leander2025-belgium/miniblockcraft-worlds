// Haalt echte hoogtegegevens (AWS Terrarium, open data, Mapzen/Tilezen) voor de herkenbare Alpentoppen op
// en schrijft ze als compacte rasters (50 m) naar js/dem-data.js. Opnieuw draaien: node tools/bake-dem.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { PNG } from './node_modules/pngjs/lib/png.js';
const Z = 12, STEP = 50;
const PEAKS = [
  { id: 'zugspitze', name: 'Zugspitze', lat: 47.4211, lon: 10.9853, size: 14000 },
  { id: 'matterhorn', name: 'Matterhorn', lat: 45.9763, lon: 7.6586, size: 14000 },
  { id: 'montblanc', name: 'Mont Blanc', lat: 45.8326, lon: 6.8652, size: 18000 },
];
const cache = new Map();
async function tile(x, y) {
  const k = x + '/' + y; if (cache.has(k)) return cache.get(k);
  const dir = '/tmp/claude-0/-home-user/649525f6-1b22-5f64-853b-88435b65d9a8/scratchpad/dem'; mkdirSync(dir, { recursive: true });
  const f = `${dir}/${Z}_${x}_${y}.png`;
  let buf;
  if (existsSync(f)) buf = readFileSync(f);
  else { const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`); if (!r.ok) throw new Error('DEM ' + r.status); buf = Buffer.from(await r.arrayBuffer()); writeFileSync(f, buf); }
  const png = PNG.sync.read(buf); cache.set(k, png); return png;
}
const n = 2 ** Z;
async function elev(lat, lon) {
  const xf = (lon + 180) / 360 * n, yf = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const tx = Math.floor(xf), ty = Math.floor(yf), px = (xf - tx) * 256, py = (yf - ty) * 256;
  // bilineair over 4 pixels (ook over tegelgrenzen)
  const at = async (X, Y) => { let ttx = tx, tty = ty; while (X >= 256) { X -= 256; ttx++; } while (Y >= 256) { Y -= 256; tty++; } const p = await tile(ttx, tty), i = (Y * 256 + X) * 4; return p.data[i] * 256 + p.data[i + 1] + p.data[i + 2] / 256 - 32768; };
  const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
  const a = await at(x0, y0), b = await at(x0 + 1, y0), c = await at(x0, y0 + 1), d = await at(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const out = {};
for (const P of PEAKS) {
  const N = Math.round(P.size / STEP) + 1, h = new Int16Array(N * N), mx = 111320 * Math.cos(P.lat * Math.PI / 180);
  let max = -1e9, maxAt = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = i * STEP - P.size / 2, dz = j * STEP - P.size / 2;
    const v = await elev(P.lat - dz / 110574, P.lon + dx / mx);
    h[j * N + i] = Math.round(v); if (v > max) { max = v; maxAt = j * N + i; }
  }
  out[P.id] = { name: P.name, size: P.size, step: STEP, n: N, max: Math.round(max), peak: [(maxAt % N) * STEP - P.size / 2, Math.floor(maxAt / N) * STEP - P.size / 2], b64: Buffer.from(h.buffer).toString('base64') };
  console.log(P.name, N + '×' + N, 'hoogste punt', Math.round(max), 'm');
}
writeFileSync(new URL('../js/dem-data.js', import.meta.url), '// Gemaakt door tools/bake-dem.mjs — echte hoogtes (m) van AWS Terrarium (open data), raster van 50 m.\nexport const DEM = ' + JSON.stringify(out) + ';\n');
