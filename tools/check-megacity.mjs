// Controle van Megatower City (node tools/check-megacity.mjs):
// - geen doodlopende lanen: waar een laan stopt (aan een park, luchthaven...), komt ze uit op een dwarslaan
// - geen gaten in de grond (behalve rivier, metrotrappen), alles staat op de grond
// - bruggen over de rivier lopen door, metro en trein hebben sporen in elke tegel waar ze komen
// - deterministisch: dezelfde tegel twee keer maken geeft exact hetzelfde
import { generateTile, avenueNS, avenueEW, TILES, landmark, RAIL_Z, METRO_Z } from '../js/megacity.js';
import { G, T } from '../js/megatower.js';
import { B, IS_SOLID } from '../js/blocks.js';
let fails = 0;
const fail = (m) => { if (fails < 20) console.log('  ✗ ' + m); fails++; };
// 1. lanen
let ends = 0;
for (let i = 0; i <= TILES; i++) for (let tz = 0; tz < TILES; tz++) {
  if (avenueNS(i, tz) && tz + 1 < TILES && !avenueNS(i, tz + 1)) { ends++; if (!avenueEW(tz + 1, i - 1) && !avenueEW(tz + 1, i)) fail(`laan x=${i * T} stopt bij z=${(tz + 1) * T} zonder dwarslaan`); }
  if (avenueNS(i, tz) && tz > 0 && !avenueNS(i, tz - 1)) { ends++; if (!avenueEW(tz, i - 1) && !avenueEW(tz, i)) fail(`laan x=${i * T} begint bij z=${tz * T} zonder dwarslaan`); }
}
for (let j = 0; j <= TILES; j++) for (let tx = 0; tx < TILES; tx++) {
  if (avenueEW(j, tx) && tx + 1 < TILES && !avenueEW(j, tx + 1)) { ends++; if (!avenueNS(tx + 1, j - 1) && !avenueNS(tx + 1, j)) fail(`laan z=${j * T} stopt bij x=${(tx + 1) * T} zonder dwarslaan`); }
}
console.log(`laaneinden ${ends} (allemaal op een kruispunt als er geen fout staat)`);
// 2. tegels: gaten, bruggen, sporen, determinisme
const sample = [[40, 40], [17, 40], [17, 47], [38, 47], [37, 46], [70, 40], [31, 51], [45, 34], [5, 40], [24, 40], [60, 5], [12, 70], [75, 75], [0, 0], [79, 79], [50, 46], [23, 30], [17, 61], [32, 40], [35, 44], [10, 10], [16, 30], [18, 40]]; // + wijken van 15.0: historisch, winkels, villa's, haven
let holes = 0, cols = 0;
for (const [tx, tz] of sample) {
  const r = generateTile(tx, tz), H = r.H, y0 = r.y0, L = landmark(tx, tz);
  const at = (x, y, z) => { const ly = y - y0; return ly < 0 || ly >= H ? 0 : r.vox[(z * T + x) * H + ly]; };
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    cols++;
    const g = at(x, G - 1, z), below = at(x, G - 2, z);
    const wz = tz * T + z;
    if (!g && !below && !(L && L.id === 'river') && !(L && L.id === 'tower' && x >= 16 && x < 112 && z >= 16 && z < 112) && Math.abs(wz - METRO_Z) > 2) { holes++; if (holes < 5) fail(`gat in de grond op ${tx * T + x}, ${wz}`); }
  }
  const r2 = generateTile(tx, tz);
  if (r2.H !== H || r2.vox.length !== r.vox.length || Buffer.compare(Buffer.from(r2.vox), Buffer.from(r.vox))) fail(`tegel ${tx},${tz} niet deterministisch`);
  const types = new Set(r.paths.map(p => p.type));
  if (tz === 46 || tz === 47) { if (tx < 70 && !types.has('train')) fail(`tegel ${tx},${tz}: geen treinspoor`); }
  if ((tz === 39 || tz === 40) && tx >= 5 && tx <= 69 && !types.has('metro')) fail(`tegel ${tx},${tz}: geen metro`);
}
console.log(`kolommen bekeken ${cols} · gaten ${holes}`);
// brug over de rivier: het dek op G-1 loopt door van kade tot kade op elke laan
{ const r = generateTile(17, 40), H = r.H, y0 = r.y0; let gaps = 0; for (let x = 14; x < 114; x++) for (const z of [-11 + T, 2, 8]) { if (z >= T) continue; const b = r.vox[(z * T + x) * H + G - 1 - y0]; if (!IS_SOLID[b]) gaps++; } if (gaps) fail(`brug over de rivier heeft ${gaps} gaten`); else console.log('brug over de rivier: dek doorlopend'); }
// wijken (15.0): geen zwevende blokken — elk vast blok boven de straat rust op iets eronder of zit vast aan een buur
{
  let floating = 0, checked = 0;
  for (const [tx, tz] of [[32, 40], [31, 39], [35, 44], [36, 45], [10, 10], [16, 30], [18, 40]]) {
    const r = generateTile(tx, tz), H = r.H, y0 = r.y0;
    const at = (x, y, z) => { if (x < 0 || z < 0 || x >= T || z >= T) return 1; const ly = y - y0; return ly < 0 || ly >= H ? 0 : r.vox[(z * T + x) * H + ly]; };
    for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) for (let y = G; y < G + 40; y++) {
      const b = at(x, y, z); if (!b) continue; checked++;
      if (at(x, y - 1, z) || at(x, y + 1, z)) continue; // rust op iets of hangt aan het plafond (lamp)
      if (at(x + 1, y, z) || at(x - 1, y, z) || at(x, y, z + 1) || at(x, y, z - 1)) continue;
      floating++; if (floating < 4) fail(`zwevend blok ${b} in tegel ${tx},${tz} op ${x},${y - G},${z}`);
    }
  }
  console.log(`wijken: ${checked} blokken boven de straat bekeken · zwevend ${floating}`);
}
console.log(fails ? `${fails} fout(en)` : 'Megatower City in orde');
process.exitCode = fails ? 1 : 0;
