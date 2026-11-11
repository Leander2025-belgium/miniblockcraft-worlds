// Controle Nova Metropool: tegels uit het centrum, de haven, de luchthavens en de rivier.
// - geen zwevende vloeren (lucht tussen grond en de onderste vloer van een gebouw)
// - startbanen vlak (geen hoogteverschil langs de baan)
// - naden: de rand van een tegel past op de buurtegel (grondhoogte max 1 blok verschil)
// node tools/check-metropool.mjs
import { generateTile, META } from '../js/metropolis.js';
import { B } from '../js/blocks.js';
const T = META.tile;
const spots = { centrum: [12500, 15200], west: [3500, 6000], oost: [21500, 8500], zuid: [12500, 26000], rivier: [1700, 12500] };
let bad = 0, cols = 0, seam = 0, seamN = 0, runwayBad = 0, runways = 0;
const ground = (r, x, z) => { const base = (z * T + x) * r.H; for (let y = 1; y < r.H; y++) { const b = r.vox[base + y]; if (!b || b === B.WATER) return y - 1; } return r.H - 1; };
for (const [name, [x, z]] of Object.entries(spots)) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T);
  const r = generateTile(tx, tz), nb = generateTile(tx + 1, tz);
  let b0 = 0;
  for (let i = 0; i < T * T; i++) {
    const base = i * r.H; let firstAir = -1;
    for (let y = 1; y < Math.min(r.H, 80); y++) { const v = r.vox[base + y]; if (!v) { if (firstAir < 0) firstAir = y; } else if (firstAir > 0 && (v === B.TILE || v === B.ASHLAR || v === B.MARBLE) && y - firstAir < 3) { b0++; break; } }
    cols++;
  }
  bad += b0;
  for (let zz = 0; zz < T; zz += 2) { seamN++; if (Math.abs(ground(r, T - 1, zz) - ground(nb, 0, zz)) > 1) seam++; }
  for (const p of r.paths || []) if (p.type === 'runway') { runways++; let lo = 1e9, hi = -1e9; for (let i = 2; i < p.pts.length; i += 3) { lo = Math.min(lo, p.pts[i]); hi = Math.max(hi, p.pts[i]); } if (hi - lo > 1) runwayBad++; }
  console.log(`${name}: tegel ${tx},${tz} · zwevende vloeren ${b0}`);
}
console.log(`samen: zwevende vloeren ${bad}/${cols} · naden >1 blok ${seam}/${seamN} · startbanen niet vlak ${runwayBad}/${runways}`);
if (bad || seam > seamN * 0.05 || runwayBad) process.exitCode = 1;
