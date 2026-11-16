// Bovenaanzicht van een stuk Megatower City als PNG: node tools/render-megacity.mjs <uit.png> <tx0> <tz0> <n> [schaal]
import { generateTile } from '../js/megacity.js';
import { BLOCKS } from '../js/blocks.js';
import { PNG } from 'pngjs';
import fs from 'fs';
const [out, tx0, tz0, n, sc = 1] = [process.argv[2], ...process.argv.slice(3).map(Number)];
const T = 128, W = n * T * sc, png = new PNG({ width: W, height: W });
for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
  const r = generateTile(tx0 + a, tz0 + b);
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    const base = (z * T + x) * r.H; let y = r.H - 1; while (y > 0 && !r.vox[base + y]) y--;
    const blk = r.vox[base + y], c = BLOCKS[blk] ? BLOCKS[blk].color : [255, 0, 255], k = Math.min(1.5, 0.75 + (y + r.y0 - 120) / 400);
    for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) { const p = (((b * T + z) * sc + dy) * W + (a * T + x) * sc + dx) * 4; png.data[p] = Math.min(255, c[0] * k); png.data[p + 1] = Math.min(255, c[1] * k); png.data[p + 2] = Math.min(255, c[2] * k); png.data[p + 3] = 255; }
  }
}
fs.writeFileSync(out, PNG.sync.write(png));
