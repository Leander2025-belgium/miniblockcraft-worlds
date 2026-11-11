// Overzichtskaart van Greenisland voor het menu, de zoekkaart en de spoorkaart:
// assets/greenisland-map.jpg (terrein, provinciegrenzen, wegen, spoorlijnen, stations) en assets/greenisland-labels.json.
// Opnieuw maken na een wijziging: node tools/bake-green-map.mjs
import { writeFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { PNG } from './node_modules/pngjs/lib/png.js';
const A = await import('../js/greenisland.js');
const D = await import('../js/greenisland-data.js');
const S = 50, NX = Math.round(A.MW / S), NZ = Math.round(A.ML / S), png = new PNG({ width: NX, height: NZ });
const t0 = Date.now();
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = i * S + S / 2, z = j * S + S / 2, c = A.overviewColor(x, z, S), o = (j * NX + i) * 4;
  // provinciegrens: dun lijntje
  const pv = D.provinceAt(x, z), border = A.natural(x, z) > 0 && (D.provinceAt(x + S, z) !== pv || D.provinceAt(x, z + S) !== pv);
  png.data[o] = border ? 250 : Math.min(255, c[0]); png.data[o + 1] = border ? 250 : Math.min(255, c[1]); png.data[o + 2] = border ? 250 : Math.min(255, c[2]); png.data[o + 3] = 255;
}
const put = (x, z, rgb, r = 0) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = Math.floor(x / S) + dx, j = Math.floor(z / S) + dz; if (i >= 0 && j >= 0 && i < NX && j < NZ) png.data.set(rgb, (j * NX + i) * 4); } };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
for (const R of A.ROADS) for (let k = 0; k < R.n; k += 3) put(R.x[k], R.z[k], R.kind === 'A' ? [250, 210, 120, 255] : [240, 230, 205, 255], R.kind === 'A' ? 1 : 0);
for (const L of A.LINES) { const c = hex(L.color), d = c.map((v, k) => k < 3 ? v * 0.5 : 255); for (let i = 0; i < L.n; i += 4) put(L.x[i], L.z[i], L.kind[i] === 1 ? d : c, L.kind[i] === 1 ? 0 : 1); }
for (const st of A.STATIONS_ALL) put(st.x, st.z, [255, 255, 255, 255], 2);
writeFileSync(new URL('../assets/greenisland-map.png', import.meta.url), PNG.sync.write(png));
execFileSync('python3', ['-c', "from PIL import Image; Image.open('assets/greenisland-map.png').convert('RGB').save('assets/greenisland-map.jpg', quality=84, optimize=True)"], { cwd: new URL('..', import.meta.url).pathname });
unlinkSync(new URL('../assets/greenisland-map.png', import.meta.url));
const pvName = Object.fromEntries(D.PROVINCES.map(p => [p.id, p.name]));
const lab = {
  places: A.ALL_PLACES.map(p => ({ name: p.name, kind: p.kind, x: Math.round(p.x), z: Math.round(p.z), prov: pvName[p.prov], postcode: p.postcode, named: !!p.named })),
  stations: A.STATIONS_ALL.map(s => ({ name: 'Station ' + s.name, x: Math.round(s.x), z: Math.round(s.z) })),
  sights: A.PLACES.filter(p => !A.ALL_PLACES.some(q => p[0].startsWith(q.name))).map(([name, x, z]) => ({ name, x, z })),
  provinces: D.PROVINCES.map(p => ({ name: p.name, color: p.color })),
  peaks: D.PEAKS.map(p => [p.name, p.x, p.z]),
};
writeFileSync(new URL('../assets/greenisland-labels.json', import.meta.url), JSON.stringify(lab));
console.log('kaart', NX + '×' + NZ, 'in', Date.now() - t0, 'ms ·', lab.places.length, 'plaatsen', lab.stations.length, 'stations', lab.sights.length, 'bezienswaardigheden');
