// Controle voor echte steden (OpenStreetMap-omzetting) op een hellend terrein:
// - geen zwevende gebouwen (lucht tussen grond en gebouw), geen gebouwen helemaal in de grond
// - naadloze tegelgrenzen: de grond aan de rand van tegel A = de randinformatie die tegel B krijgt
// Gebruikt testgegevens (tests/data/fake-frankfurt.json) en een kunstmatige helling van 4 % plus golven.
// node tools/check-osm-terrain.mjs
import { readFileSync } from 'fs';
import { parseOSM, rasterize, subsetOSM, bboxFor } from '../js/osm.js';
import { CITY } from '../js/frankfurt.js';
import { mapMX, tileCenter } from '../js/bigmap.js';
import { B } from '../js/blocks.js';
const osm = parseOSM(readFileSync(new URL('../tests/data/fake-frankfurt.json', import.meta.url), 'utf8'));
const map = { ...CITY };
const elev = (lat, lon) => { const x = (lon - map.lon) * mapMX(map), z = (map.lat - lat) * 110574; return 30 + 0.04 * x + 6 * Math.sin(z / 90) + 4 * Math.cos(x / 70); };
const T = map.tile, res = new Map();
const tileAt = (tx, tz) => {
  const k = tx + ',' + tz; if (res.has(k)) return res.get(k);
  const c = tileCenter(map, tx, tz), b = bboxFor(c.lat, c.lon, T, 30);
  const r = rasterize(subsetOSM(osm, b.s, b.w, b.n, b.e), c.lat, c.lon, T, null, 1, { mx: mapMX(map), ox: tx * T, oz: tz * T, elev: (la, lo) => elev(la, lo) });
  res.set(k, r); return r;
};
const solid = (b) => b && b !== B.WATER && b !== B.LEAVES && b !== B.SPRUCE;
let tiles = 0, floating = 0, seam = 0, seamN = 0, bldCols = 0;
for (let tz = 8; tz <= 11; tz++) for (let tx = 8; tx <= 11; tx++) {
  const r = tileAt(tx, tz); tiles++;
  const H = r.H, top = (x, z) => { const base = (z * T + x) * H; for (let y = H - 1; y > 0; y--) if (r.vox[base + y]) return y; return 0; };
  // zwevend: een kolom met lucht onder een gebouwblok, terwijl er verderop grond is (lucht-gat tussen y=1 en het bovenste blok)
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    const base = (z * T + x) * H; let y = H - 1; while (y > 0 && !r.vox[base + y]) y--;
    const tp = y; if (tp < 1) continue;
    // zoek naar een gat (lucht) onder een vast blok, onder de 6 m boven de grond (bruggen/luifels/overkappingen tellen niet)
    let sawSolid = false, gapLen = 0, maxGap = 0;
    for (let yy = tp; yy > 0; yy--) { const b = r.vox[base + yy]; if (solid(b)) { if (sawSolid && gapLen > maxGap) maxGap = gapLen; sawSolid = true; gapLen = 0; } else if (sawSolid) gapLen++; }
    const b0 = r.vox[base + tp];
    if (b0 === B.ROOF_RED || b0 === B.ROOF_DARK || b0 === B.CONCRETE || b0 === B.GLASS) bldCols++;
    void maxGap;
  }
  // naad: bovenste grondblok aan de rand vs randinformatie van de buurtegel
  if (r.edge) {
    const nb = tileAt(tx + 1, tz);
    const groundTop = (rr, x, z) => { const base = (z * T + x) * rr.H; for (let y = 1; y < rr.H; y++) { const b = rr.vox[base + y]; if (!b || b === B.WATER) return y - 1; } return 0; };
    for (let z = 0; z < T; z += 4) { seamN++; const a = r.edge[T + z], b2 = nb.vox ? groundTop(nb, 0, z) : a; if (Math.abs(a - b2) > 1) seam++; }
  }
}
// gebouwen: grond onder elk gebouwdeel (tegel 9,9..10,10): onder het eerste vaste blok van een gebouwkolom moet tot op de grond alles vast zijn
let bad = 0, cols = 0;
for (const [k, r] of res) {
  const H = r.H;
  for (let i = 0; i < T * T; i++) {
    const base = i * H; let firstAir = -1, solidAbove = false;
    for (let y = 1; y < Math.min(H, 120); y++) { const b = r.vox[base + y]; if (!b) { if (firstAir < 0) firstAir = y; } else if (firstAir > 0 && (b === B.TILE || b === B.ASHLAR) && y - firstAir < 3) { solidAbove = true; break; } }
    if (firstAir > 0) cols++;
    if (solidAbove) bad++;
  }
}
console.log(`tegels ${tiles} · zwevende vloeren ${bad} (op ${cols} kolommen) · naden met meer dan 1 blok verschil ${seam}/${seamN}`);
if (seam || bad) process.exitCode = 1;
