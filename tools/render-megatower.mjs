// Plattegronden van de Megatower als PNG (bovenaanzicht van laag 1 en 2, vloer zwak): node tools/render-megatower.mjs <map> <verdiepingen...>
import { buildFloor } from '../js/megatower.js';
import { BLOCKS, B } from '../js/blocks.js';
import { PNG } from 'pngjs';
import fs from 'fs';
const out = process.argv[2] || '.', floors = process.argv.slice(3).map(Number);
const S = 6;
for (const f of floors) {
  const F = buildFloor(f), png = new PNG({ width: 96 * S, height: 96 * S });
  for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
    const k = (j * 96 + i) * 4, l1 = F.b[k + 1], l2 = F.b[k + 2], l0 = F.b[k];
    let c = [20, 20, 24];
    if (l0) c = BLOCKS[l0].color.map(v => v * 0.55 + 40);
    if (l2) c = BLOCKS[l2].color; else if (l1) c = BLOCKS[l1].color.map(v => v * 0.9);
    if (l1 === B.DOOR_SHUT || l1 === B.DOOR_GLASS) c = [255, 120, 0];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = ((j * S + y) * 96 * S + i * S + x) * 4; png.data[p] = c[0]; png.data[p + 1] = c[1]; png.data[p + 2] = c[2]; png.data[p + 3] = 255; }
  }
  fs.writeFileSync(`${out}/floor_${f}.png`, PNG.sync.write(png));
}
