// Controle voor heel België (grote echte kaart): tegels in de Ardennen (580–700 m boven zee).
// - niets afgesneden: elk gebouw staat volledig in de tegel (geen blok op de bovenste laag)
// - de tegel begint net onder zijn laagste punt (y0) en draagt geen honderden lege meters steen mee
// - verschuiven verandert niets: boven y0 is elke kolom blok voor blok gelijk aan de oorspronkelijke tegel
// Gebruikt de testgegevens van tests/data/fake-frankfurt.json met een kunstmatig Ardennenreliëf.
// node tools/check-belgie.mjs
import { readFileSync } from 'fs';
import { parseOSM, rasterize, subsetOSM, bboxFor, lowerTile } from '../js/osm.js';
import { CITY } from '../js/frankfurt.js';
import { makeMap, mapMX, tileCenter } from '../js/bigmap.js';
const osm = parseOSM(readFileSync(new URL('../tests/data/fake-frankfurt.json', import.meta.url), 'utf8'));
const map = { ...CITY };
const be = makeMap({ id: 'belgie', name: 'België', lat: 50.5, lon: 4.47, km: 300 });
const elev = (lat, lon) => { const x = (lon - map.lon) * mapMX(map), z = (map.lat - lat) * 110574; return 620 + 0.03 * x + 25 * Math.sin(z / 140) + 15 * Math.cos(x / 110); };
const T = map.tile;
let tiles = 0, cut = 0, same = 0, diff = 0, Hsum = 0, H0sum = 0, y0min = 1e9;
for (let tz = 8; tz <= 10; tz++) for (let tx = 8; tx <= 10; tx++) {
  const c = tileCenter(map, tx, tz), b = bboxFor(c.lat, c.lon, T, 30);
  const r0 = rasterize(subsetOSM(osm, b.s, b.w, b.n, b.e), c.lat, c.lon, T, null, 1, { mx: mapMX(map), ox: tx * T, oz: tz * T, elev });
  const r = lowerTile(r0, T); tiles++; Hsum += r.H; H0sum += r0.H; y0min = Math.min(y0min, r.y0);
  for (let i = 0; i < T * T; i++) {
    if (r0.vox[i * r0.H + r0.H - 1]) cut++;
    for (let y = r.y0; y < r0.H; y++) { if (r0.vox[i * r0.H + y] === r.vox[i * r.H + y - r.y0]) same++; else diff++; }
  }
}
console.log(`kaart België: ${be.tiles} × ${be.tiles} tegels, minikaart 1/${be.miniStep}, groot: ${!!be.bigWorld}`);
console.log(`Ardennen-tegels ${tiles} · gemiddelde hoogte vóór ${Math.round(H0sum / tiles)} → na ${Math.round(Hsum / tiles)} blokken (y0 ≥ ${y0min}) · afgesneden kolommen ${cut} · verschillend na verschuiven ${diff}/${same + diff}`);
const ok = cut === 0 && diff === 0 && y0min >= 400 && Hsum / tiles < 260 && be.bigWorld && be.miniStep >= 2;
if (!ok) { console.log('FOUT'); process.exitCode = 1; }
