// Overzichtskaart van Greenisland voor het menu, de zoekkaart en de spoorkaart:
// assets/greenisland-map.jpg (terrein, provinciegrenzen, wegen, spoorlijnen, stations) en assets/greenisland-labels.json.
// Opnieuw maken na een wijziging: node tools/bake-green-map.mjs
import { writeFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { PNG } from './node_modules/pngjs/lib/png.js';
const A = await import('../js/greenisland.js');
const D = await import('../js/greenisland-data.js');
const S = 50, NX = Math.round(A.MW / S), NZ = Math.round(A.ML / S), png = new PNG({ width: NX, height: NZ }), hpng = new PNG({ width: NX, height: NZ });
const t0 = Date.now();
// hoogtekaart: hoogte per pixel (eerst alles berekenen, dan kleuren, reliëfschaduw en hoogtelijnen)
const HT = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) HT[j * NX + i] = A.natural(i * S + S / 2, j * S + S / 2);
const RAMP = [[-50, [20, 52, 104]], [0, [60, 118, 178]], [0.01, [70, 140, 80]], [100, [120, 170, 90]], [300, [200, 200, 120]], [700, [190, 150, 90]], [1200, [150, 110, 80]], [1800, [170, 170, 170]], [2500, [250, 250, 250]]];
const ramp = (h) => { for (let k = 1; k < RAMP.length; k++) if (h <= RAMP[k][0]) { const [a, ca] = RAMP[k - 1], [b, cb] = RAMP[k], t = Math.max(0, Math.min(1, (h - a) / (b - a))); return ca.map((v, q) => v + (cb[q] - v) * t); } return RAMP[RAMP.length - 1][1]; };
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const h = HT[j * NX + i], hx = HT[j * NX + Math.min(NX - 1, i + 1)], hz = HT[Math.min(NZ - 1, j + 1) * NX + i], o = (j * NX + i) * 4;
  let c = ramp(h);
  if (h > 0) { const sh = Math.max(0.55, Math.min(1.35, 1 + ((h - hx) + (h - hz)) / S * 1.6)); c = c.map(v => v * sh); }
  // hoogtelijnen: dun om de 100 m, dikker om de 500 m
  const step = (v) => Math.floor(v / 100);
  if (h > 0 && (step(h) !== step(hx) || step(h) !== step(hz))) { const major = Math.floor(Math.max(h, hx, hz) / 500) !== Math.floor(Math.min(h, hx, hz) / 500); c = c.map(v => v * (major ? 0.45 : 0.7)); }
  hpng.data[o] = Math.min(255, c[0]); hpng.data[o + 1] = Math.min(255, c[1]); hpng.data[o + 2] = Math.min(255, c[2]); hpng.data[o + 3] = 255;
}
writeFileSync(new URL('../assets/greenisland-height.png', import.meta.url), PNG.sync.write(hpng));
execFileSync('python3', ['-c', "from PIL import Image; Image.open('assets/greenisland-height.png').convert('RGB').save('assets/greenisland-height.jpg', quality=82, optimize=True)"], { cwd: new URL('..', import.meta.url).pathname });
unlinkSync(new URL('../assets/greenisland-height.png', import.meta.url));
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = i * S + S / 2, z = j * S + S / 2, c = A.overviewColor(x, z, S), o = (j * NX + i) * 4;
  // provinciegrens: dun lijntje
  const pv = D.provinceAt(x, z), border = A.natural(x, z) > 0 && (D.provinceAt(x + S, z) !== pv || D.provinceAt(x, z + S) !== pv);
  png.data[o] = border ? 250 : Math.min(255, c[0]); png.data[o + 1] = border ? 250 : Math.min(255, c[1]); png.data[o + 2] = border ? 250 : Math.min(255, c[2]); png.data[o + 3] = 255;
}
const put = (x, z, rgb, r = 0) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = Math.floor(x / S) + dx, j = Math.floor(z / S) + dz; if (i >= 0 && j >= 0 && i < NX && j < NZ) png.data.set(rgb, (j * NX + i) * 4); } };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
// wijken van Munkbay, parken, havens, testterrein, grote gebouwen en buslijnen
for (const a of A.AREAS) if (a.kind === 'park') for (let dz = -a.r; dz <= a.r; dz += S) for (let dx = -a.r; dx <= a.r; dx += S) if (dx * dx + dz * dz < a.r * a.r * 0.7) put(a.x + dx, a.z + dz, [96, 168, 80, 255]);
for (const H of A.HARBOURS) for (let a = -450; a <= 450; a += S / 2) for (let n = -60; n <= 180; n += S / 2) put(H.x - H.nz * a + H.nx * n, H.z + H.nx * a + H.nz * n, [150, 158, 168, 255]);
{ const T2 = A.TRACK_Z; for (let dx = -T2.hx; dx <= T2.hx; dx += S / 2) for (let dz = -T2.hz; dz <= T2.hz; dz += S / 2) put(T2.x + dx, T2.z + dz, [120, 150, 110, 255]); }
for (const b of A.BLD) for (let x = b.x0; x <= b.x1; x += S / 2) for (let z = b.z0; z <= b.z1; z += S / 2) put(x, z, [120, 60, 60, 255]);
for (const L of A.BUS_LINES) for (let i = 0; i < L.n; i += 6) put(L.x[i], L.z[i], [190, 120, 230, 255]);
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
  // wegennet voor de routeplanner: knopen = plaatsen, takken = wegen (lengte, soort, vorm om de ~250 m)
  roads: A.ROADS.map(R => { const pts = []; for (let k = 0; k < R.n; k += 31) pts.push([Math.round(R.x[k]), Math.round(R.z[k])]); pts.push([Math.round(R.x[R.n - 1]), Math.round(R.z[R.n - 1])]); let up = 0, down = 0; for (let k = 1; k < R.n; k++) { const d = R.y[k] - R.y[k - 1]; if (d > 0) up += d; else down -= d; } return { a: R.a, b: R.b, kind: R.kind, name: R.name || null, len: Math.round(R.s[R.n - 1]), climb: Math.round(up), desc: Math.round(down), pts }; }),
  districts: A.AREAS.map(a => ({ name: a.name, x: Math.round(a.x), z: Math.round(a.z), kind: a.kind })),
  heights: { min: Math.round(HT.reduce((a, b) => Math.min(a, b), 1e9)), max: Math.round(HT.reduce((a, b) => Math.max(a, b), -1e9)) },
};
writeFileSync(new URL('../assets/greenisland-labels.json', import.meta.url), JSON.stringify(lab));
console.log('kaart', NX + '×' + NZ, 'in', Date.now() - t0, 'ms ·', lab.places.length, 'plaatsen', lab.stations.length, 'stations', lab.sights.length, 'bezienswaardigheden');
