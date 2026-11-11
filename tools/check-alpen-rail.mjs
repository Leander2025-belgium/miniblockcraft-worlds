// Controle van het Alpenspoornet, de perrons en de kabelbaanstations (zoals ze in de tegels gebouwd worden):
// - spoorbed: onder de rails ballast/beton (geen zwevende rails), erboven 5 m vrij (niet door berg, gebouw of brug)
// - hellingen: nergens steiler dan toegestaan (per 100 m), geen plotse sprongen in de hoogte
// - perrons op de juiste hoogte (1 blok boven het spoorbed), vrije ruimte erboven
// - kabelbaanstations: vloer op de stationshoogte, vrije ruimte erboven
// node tools/check-alpen-rail.mjs
import { B } from '../js/blocks.js';
const A = await import('../js/alpen.js');
const { LINES, LIFTS, trackOffset } = A;
const BED = new Set([B.BALLAST, B.CONCRETE, B.ASPHALT, B.GRAVEL, B.STONE]);
const out = { bed: 0, clear: 0, grade: 0, jump: 0, plat: 0, lift: 0, n: 0 };
const fails = [];
const col = (x, z) => A._columnAt(Math.floor(x), Math.floor(z));
for (const L of LINES) {
  // hellingen (zonder het oude stuk, dat precies zo blijft)
  for (let i = 25; i < L.n; i += 5) {
    if (L.kind[i] === 3 || L.kind[i - 25] === 3) continue;
    const g = Math.abs(L.y[i] - L.y[i - 25]) / (L.s[i] - L.s[i - 25]);
    if (g > L.maxGrade * 1.08) { out.grade++; if (fails.length < 40) fails.push(`${L.id} helling ${(g * 100).toFixed(1)} % bij s=${Math.round(L.s[i])}`); }
    if (Math.abs(L.y[i] - L.y[i - 1]) > 1.2) { out.jump++; if (fails.length < 40) fails.push(`${L.id} sprong ${(L.y[i] - L.y[i - 1]).toFixed(1)} m bij s=${Math.round(L.s[i])}`); }
  }
  const p = {};
  for (let s = 20; s < L.len - 20; s += 10) {
    L.at(s, p);
    if (p.kind === 3) continue;
    for (const side of [1, -1]) {
      const off = trackOffset(L, s) * side, x = p.x - p.tz * off, z = p.z + p.tx * off;
      const q = L.near(Math.floor(x), Math.floor(z), 40), by = Math.round(q ? q.y : p.y), { col: c } = col(x, z);
      out.n++;
      if (!BED.has(c[by])) { out.bed++; if (fails.length < 40) fails.push(`${L.id} geen spoorbed bij s=${Math.round(s)} (${Math.round(x)},${Math.round(z)}) blok ${c[by]} y=${by}`); }
      let blocked = 0; for (let y = by + 1; y <= by + 5; y++) if (c[y] && c[y] !== B.LAMP) blocked++;
      if (blocked) { out.clear++; if (fails.length < 40) fails.push(`${L.id} spoor niet vrij bij s=${Math.round(s)} (${Math.round(x)},${Math.round(z)}) soort ${p.kind}`); }
    }
  }
  // perrons: drie meetpunten langs elk perron, minstens twee moeten in orde zijn (borden, banken en zuilen mogen)
  for (const st of L.stations) {
    if (st.old) continue;
    const pIn = 2.5 + 2.2;
    for (const side of [1, -1]) {
      let ok = 0, last = '';
      for (const f of [-0.2, 0.05, 0.3]) {
        const q = L.at(st.s + f * st.len), d = pIn + 2.6, x = q.x - q.tz * d * side, z = q.z + q.tx * d * side, { col: c } = col(x, z), by = st.y;
        const isPlat = [B.TILE, B.LINE_YELLOW, B.LINE_WHITE, B.CONCRETE].includes(c[by + 1]);
        if (isPlat && (!c[by + 2] || [B.DARK_PLANKS, B.POST, B.PAINT_BLUE, B.METAL].includes(c[by + 2]))) ok++; else last = `blok ${c[by + 1]}, erboven ${c[by + 2]}`;
      }
      if (ok < 2) { out.plat++; fails.push(`${L.id} perron ${st.name} (${side > 0 ? 'rechts' : 'links'}) ${last}`); }
    }
  }
}
for (const L of LIFTS) for (const [u, y] of [[0, L.ya], [L.len, L.yb]]) {
  const x = L.ax + L.ux * (u + (u ? -6 : 6)) - L.uz * 4, z = L.az + L.uz * (u + (u ? -6 : 6)) + L.ux * 4, { col: c } = col(x, z);
  if (!c[y] || c[y + 1] || c[y + 2]) { out.lift++; fails.push(`${L.name}: station ${u ? 'boven' : 'onder'} vloer ${c[y]}, erboven ${c[y + 1]},${c[y + 2]}`); }
}
console.log(`spoorpunten ${out.n} · zonder spoorbed ${out.bed} · niet vrij ${out.clear} · te steil ${out.grade} · sprongen ${out.jump} · perronfouten ${out.plat} · kabelbaanstations ${out.lift}`);
for (const f of fails.slice(0, 40)) console.log('  ' + f);
if (out.bed + out.clear + out.grade + out.jump + out.plat + out.lift) process.exitCode = 1;
