// Echte hoogtes uit de gratis "Terrain Tiles" (Terrarium-formaat) van AWS Open Data.
// Werkt in de browser (ook in een worker) dankzij OffscreenCanvas.
import { cacheGet, cachePut } from './storage.js';
export function decodeTerrarium(rgba) {
  const e = new Float32Array(256 * 256);
  for (let i = 0; i < e.length; i++) e[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return e;
}

export const URL_T = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const Z = 15;                      // ±3 m per pixel in Europa
const mem = new Map();

function lonToX(lon, z) { return (lon + 180) / 360 * 2 ** z; }
function latToY(lat, z) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; }

async function fetchTile(z, x, y) {
  const key = `elev-${z}-${x}-${y}`;
  if (mem.has(key)) return mem.get(key);
  const p = (async () => {
    const cached = await cacheGet(key);
    if (cached) return cached;
    const res = await fetch(URL_T(z, x, y));
    if (!res.ok) throw new Error('hoogtekaart ' + res.status);
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(256, 256), ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const e = decodeTerrarium(ctx.getImageData(0, 0, 256, 256).data);
    await cachePut(key, e);
    return e;
  })();
  p.catch(() => mem.delete(key));
  mem.set(key, p);
  if (mem.size > 40) mem.delete(mem.keys().next().value);
  return p;
}

// Maakt een hoogtefunctie (lat, lon) -> meter voor een gebied, met filter tegen pieken van gebouwen in de data.
// getTile(z, x, y) -> Float32Array(256*256) meter; standaard downloadt de browser de tegel.
export async function elevationSampler(b, z = Z, getTile = fetchTile) {
  const x0 = Math.floor(lonToX(b.w, z)), x1 = Math.floor(lonToX(b.e, z));
  const y0 = Math.floor(latToY(b.n, z)), y1 = Math.floor(latToY(b.s, z));
  const W = (x1 - x0 + 1) * 256, Hh = (y1 - y0 + 1) * 256;
  if (W * Hh > 4096 * 4096) throw new Error('gebied te groot voor hoogtekaart');
  let grid = new Float32Array(W * Hh);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const e = await getTile(z, tx, ty);
    for (let py = 0; py < 256; py++) grid.set(e.subarray(py * 256, py * 256 + 256), ((ty - y0) * 256 + py) * W + (tx - x0) * 256);
  }
  // 1) minimumfilter (haalt gebouwen en bomen uit de hoogtedata), 2) vervagen (zachte hellingen)
  const filt = (src, r, op) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      let v = op === 'min' ? Infinity : 0, n = 0;
      for (let k = -r; k <= r; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); const s = src[y * W + xx]; if (op === 'min') v = Math.min(v, s); else { v += s; n++; } }
      tmp[y * W + x] = op === 'min' ? v : v / n;
    }
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      let v = op === 'min' ? Infinity : 0, n = 0;
      for (let k = -r; k <= r; k++) { const yy = Math.min(Hh - 1, Math.max(0, y + k)); const s = tmp[yy * W + x]; if (op === 'min') v = Math.min(v, s); else { v += s; n++; } }
      out[y * W + x] = op === 'min' ? v : v / n;
    }
    return out;
  };
  grid = filt(filt(grid, 4, 'min'), 5, 'avg');
  return (lat, lon) => {
    const fx = (lonToX(lon, z) - x0) * 256 - 0.5, fy = (latToY(lat, z) - y0) * 256 - 0.5;
    const ix = Math.max(0, Math.min(W - 2, Math.floor(fx))), iy = Math.max(0, Math.min(Hh - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - ix)), ay = Math.max(0, Math.min(1, fy - iy));
    const a = grid[iy * W + ix], bb = grid[iy * W + ix + 1], c = grid[(iy + 1) * W + ix], d = grid[(iy + 1) * W + ix + 1];
    return a + (bb - a) * ax + (c - a) * ay + (a - bb - c + d) * ax * ay;
  };
}

// Laagste hoogte van een heel gebied (grof), als nulpunt voor een kaart
export async function elevationBase(b, getTile = fetchTile) {
  const f = await elevationSampler(b, 12, getTile);
  let min = Infinity;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) min = Math.min(min, f(b.s + (b.n - b.s) * i / 20, b.w + (b.e - b.w) * j / 20));
  return Math.floor(min) - 2;
}
