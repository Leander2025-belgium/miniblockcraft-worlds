// Controle van de Alpenwereld: zwevende gebouwen (lucht tussen de grond en de vloer), gebouwen die in de grond
// zitten (vloer onder de grond aan de ingang), en onbereikbare ingangen (vóór de deur geen grond binnen 1 blok).
// node tools/check-alpen-buildings.mjs [max]   (maakt de echte tegels, zoals in het spel)
import { B } from '../js/blocks.js';
const A = await import('../js/alpen.js');
const T = 128, max = +(process.argv[2] || 1e9);
const tiles = new Map();
const tileOf = (x, z) => { const tx = Math.floor(x / T), tz = Math.floor(z / T), k = tx + ',' + tz; let t = tiles.get(k); if (!t) { t = A.generateTile(tx, tz); t.X0 = tx * T; t.Z0 = tz * T; tiles.set(k, t); if (tiles.size > 60) tiles.delete(tiles.keys().next().value); } return t; };
const get = (x, y, z) => { const t = tileOf(x, z), lx = x - t.X0, lz = z - t.Z0, ly = y - t.y0; if (ly < 0) return B.STONE; if (ly >= t.H) return 0; return t.vox[(lz * T + lx) * t.H + ly]; };
const solid = (b) => b !== 0 && b !== B.WATER;
let floating = 0, buried = 0, noEntry = 0, checked = 0;
const bad = [];
const list = [...A.BLD].sort((a, b) => (Math.floor(a.x0 / T) - Math.floor(b.x0 / T)) || (Math.floor(a.z0 / T) - Math.floor(b.z0 / T))).slice(0, max);
for (const b of list) {
  checked++;
  const F = b.F;
  // 1. onder de vloer: alles vast tot op de grond (geen lucht onder de vloer)
  let gaps = 0, cols = 0;
  for (let x = b.x0; x <= b.x1; x += 2) for (let z = b.z0; z <= b.z1; z += 2) {
    cols++;
    if (!solid(get(x, F, z))) { gaps++; continue; }
    for (let y = F - 1; y >= F - 40; y--) { if (!solid(get(x, y, z))) { gaps++; break; } if (y < F - 2 && solid(get(x, y - 1, z)) && solid(get(x, y - 2, z))) break; }
  }
  if (gaps > 0) { floating++; bad.push(`zwevend: ${b.kind} ${b.name || ''} (${b.x0},${b.z0}) vloer ${F}, ${gaps}/${cols} kolommen met lucht eronder`); }
  // 2. ingang: vrije doorgang achter de deur en grond om op te staan vóór de deur
  const face = b.face, mid = face[0] === 'x' ? Math.round((b.z0 + b.z1) / 2) : Math.round((b.x0 + b.x1) / 2);
  const dx = face === 'x0' ? -1 : face === 'x1' ? 1 : 0, dz = face === 'z0' ? -1 : face === 'z1' ? 1 : 0;
  const ox = face[0] === 'x' ? (face === 'x0' ? b.x0 : b.x1) : mid, oz = face[0] === 'z' ? (face === 'z0' ? b.z0 : b.z1) : mid;
  const fx = ox + dx, fz = oz + dz;
  let gy = null; for (let y = F + 3; y >= F - 6; y--) if (solid(get(fx, y, fz)) && !solid(get(fx, y + 1, fz)) && !solid(get(fx, y + 2, fz))) { gy = y; break; }
  const doorOpen = !solid(get(ox, F + 1, oz)) && !solid(get(ox, F + 2, oz));
  if (!doorOpen || gy === null || gy < F - 1 || gy > F + 1) { noEntry++; bad.push(`ingang onbereikbaar: ${b.kind} ${b.name || ''} (${ox},${oz}) vloer ${F}, grond vóór de deur ${gy}, deur open ${doorOpen}`); }
  if (gy !== null && gy > F + 1) buried++;
}
console.log(`gebouwen ${checked} · zwevend ${floating} · in de grond ${buried} · onbereikbare ingang ${noEntry}`);
for (const l of bad.slice(0, 25)) console.log('  ' + l);
if (floating || noEntry) process.exitCode = 1;
