// Regressietest: de vorm van de oorspronkelijke Reuzenberg moet exact gelijk blijven.
// Vergelijkt surfaceAt() op 129.618 punten (raster 41 × 37 m over 14 × 14 km) met de vastgelegde controlesom,
// zowel in de oude module (js/mountain.js) als in de Alpenwereld (verschoven met 17.920 m).
import { readFileSync } from 'fs';
const base = JSON.parse(readFileSync(new URL('../tests/reuzenberg-baseline.json', import.meta.url)));
const M = await import('../js/mountain.js');
let A = null; try { A = await import('../js/alpen.js'); } catch { /* nog geen Alpenwereld */ }
let sum = 0, n = 0, maxd = 0, maxdA = 0;
for (let z = 0; z < 14000; z += 37) for (let x = 0; x < 14000; x += 41) {
  const v = Math.round(M.surfaceAt(x, z) * 1000);
  sum = (sum + v * ((n % 97) + 1)) % 2147483647; n++;
  if (A) maxdA = Math.max(maxdA, Math.abs(A.surfaceAt(x + A.OX, z + A.OZ) - M.surfaceAt(x, z)));
}
const ok = sum === base.checksum && n === base.points && M.SUMMIT_XZ[2] === base.summit[2];
console.log(`punten ${n} · controlesom ${sum} (verwacht ${base.checksum}) · top ${M.SUMMIT_XZ[2].toFixed(3)} m · ${ok ? 'GELIJK' : 'VERSCHIL!'}`);
if (A) console.log(`Alpenwereld: grootste verschil met de oude berg ${maxdA} m · ${maxdA === 0 ? 'GELIJK' : 'VERSCHIL!'}`);
process.exit(ok && (!A || maxdA === 0) ? 0 : 1);
