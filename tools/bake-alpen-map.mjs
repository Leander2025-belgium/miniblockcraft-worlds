// Overzichtskaart voor het menu: assets/alpen-map.png (terrein met heuvelschaduw, spoorlijnen, liften, stations)
// en assets/alpen-labels.json (namen). Opnieuw maken na een wijziging aan het landschap: node tools/bake-alpen-map.mjs
import { writeFileSync } from 'fs';
import { PNG } from './node_modules/pngjs/lib/png.js';
const A = await import('../js/alpen.js');
const S = 100, N = Math.round(A.MW / S), png = new PNG({ width: N, height: N });
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const c = A.overviewColor(i * S + S / 2, j * S + S / 2, S), o = (j * N + i) * 4;
  png.data[o] = Math.min(255, c[0]); png.data[o + 1] = Math.min(255, c[1]); png.data[o + 2] = Math.min(255, c[2]); png.data[o + 3] = 255;
}
const put = (x, z, rgb, r = 0) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = Math.floor(x / S) + dx, j = Math.floor(z / S) + dz; if (i >= 0 && j >= 0 && i < N && j < N) png.data.set(rgb, (j * N + i) * 4); } };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
// wandelpad en kabelbanen
for (let i = 0; i < A.TRAIL.length; i += 9) put(A.TRAIL[i], A.TRAIL[i + 1], [255, 211, 77, 255]);
for (const L of A.LIFTS) for (let u = 0; u <= L.len; u += S / 3) put(L.ax + L.ux * u, L.az + L.uz * u, [255, 255, 255, 255]);
{ const [a, b] = A.STATIONS; for (let t = 0; t <= 1; t += 0.01) put(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, [255, 255, 255, 255]); }
// spoorlijnen (tunnels donkerder)
for (const L of A.LINES) { const c = hex(L.color), d = c.map((v, k) => k < 3 ? v * 0.45 : 255); for (let i = 0; i < L.n; i += 4) put(L.x[i], L.z[i], L.kind[i] === 1 ? d : c, L.kind[i] === 1 ? 0 : 1); }
for (const st of A.STATIONS_ALL) put(st.x, st.z, [255, 255, 255, 255], 2);
writeFileSync(new URL('../assets/alpen-map.png', import.meta.url), PNG.sync.write(png));
// het menu gebruikt een JPEG (kleiner): python3 -c "from PIL import Image; Image.open('assets/alpen-map.png').convert('RGB').save('assets/alpen-map.jpg', quality=82, optimize=True)" && rm assets/alpen-map.png
const lab = {
  towns: A.TOWNS.filter(t => t.kind === 'city' || t.kind === 'town').map(t => [t.name, Math.round(t.x), Math.round(t.z)]),
  peaks: [['Reuzenberg', A.SUMMIT_XZ[0], A.SUMMIT_XZ[1]], ...A.PATCHES.map(P => [P.name, P.px, P.pz]), ['Hemelhoorn', A.HEMEL.x, A.HEMEL.z]].map(([n, x, z]) => [n, Math.round(x), Math.round(z)]),
};
writeFileSync(new URL('../assets/alpen-labels.json', import.meta.url), JSON.stringify(lab));
console.log('assets/alpen-map.png', N + '×' + N, '·', lab.towns.length, 'steden', lab.peaks.length, 'toppen');
