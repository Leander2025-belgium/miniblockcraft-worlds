// Plant de tramlijnen van Munkbay over de lanen (22 m breed, tramsporen in het midden) en schrijft js/greenisland-trams.js.
// Canon: 15 lijnen T1–T15, T1 en T1s elke 15 min van 06:30 tot 23:00. Voorstel: de ligging, de haltes en hun namen.
// Gebruik: node tools/plan-tram.mjs   (daarna node tests/run-all.mjs)
import { writeFileSync } from 'fs';
import * as A from '../js/greenisland.js';

const P = A.PLACE['Munkbay'], g = A._gridFor(P), C = 11.5; // as van de tramsporen vanaf de blokrand
const NS = ['Koningslaan', 'Parklaan', 'Groenlaan', 'Universiteitslaan', 'Stationslaan', 'Lindelaan', 'Eikenlaan', 'Kastanjelaan', 'Beukenlaan', 'Platanenlaan', 'Wilgenlaan', 'Iepenlaan', 'Esdoornlaan', 'Berkenlaan', 'Populierenlaan', 'Ceder­laan'.replace('­', ''), 'Notenlaan', 'Vlierlaan', 'Hazelaarlaan', 'Olmenlaan'];
const EW = ['Munkboulevard', 'Vrijheidsboulevard', 'Zeeboulevard', 'Noorderboulevard', 'Zuiderboulevard', 'Republiekboulevard', 'Viridiaboulevard', 'Groene Boulevard', 'Kustboulevard', 'Parlementsboulevard', 'Zonneboulevard', 'Sterrenboulevard', 'Havenboulevard', 'Oosterboulevard', 'Westerboulevard', 'Dageraadboulevard'];
const CROSS = ['Rozen', 'Tulpen', 'Dahlia', 'Iris', 'Lelie', 'Klaver', 'Distel', 'Varen', 'Mos', 'Heide', 'Duin', 'Klif', 'Golf', 'Zeil', 'Anker', 'Kompas', 'Molen', 'Smids', 'Bakkers', 'Brouwers', 'Kuipers', 'Wevers', 'Vissers', 'Schippers', 'Lantaarn', 'Toren', 'Poort', 'Markt', 'Kerk', 'School'];
const nameOf = (list, i) => list[((i % list.length) + list.length) % list.length];
const runs = [];
for (const isX of [true, false]) {
  const o = isX ? g.ox : g.oz, oa = isX ? g.oz : g.ox, c = isX ? P.x : P.z, ca = isX ? P.z : P.x;
  for (let k = Math.ceil((c - 7000 - o) / g.B / 4) * 4; o + k * g.B < c + 7000; k += 4) {
    const fixed = o + k * g.B + C;
    let cur = null;
    const flush = () => { if (cur && cur.b - cur.a >= 1400) runs.push(cur); cur = null; };
    for (let a = ca - 7000; a <= ca + 7000; a += 4) {
      const x = isX ? fixed : a, z = isX ? a : fixed;
      // beide sporen moeten kunnen
      const s1 = A._tramSpot(isX ? x - 2.5 : x, isX ? z : z - 2.5), s2 = s1 && A._tramSpot(isX ? x + 2.5 : x, isX ? z : z + 2.5);
      if (!s1 || !s2) { flush(); continue; }
      const y = s1.y;
      if (cur && (Math.abs(y - cur.ys[cur.ys.length - 1]) > 1 || (cur.ys.length >= 10 && Math.abs(y - cur.ys[cur.ys.length - 10]) > 3))) flush(); // te steil (max ± 8 %)
      if (!cur) cur = { isX, k, fixed, a, b: a, ys: [] };
      cur.b = a; cur.ys.push(y);
    }
    flush();
  }
}
runs.sort((p, q) => (q.b - q.a) - (p.b - p.a));
console.log('kandidaten: noord-zuid', runs.filter(r => r.isX).length, '· oost-west', runs.filter(r => !r.isX).length);
// T1 = de lijn die het dichtst bij het centrum loopt; daarna de langste
const dc = (r) => Math.abs(r.fixed - (r.isX ? P.x : P.z));
const pick = [];
const t1 = runs.filter(r => r.b - r.a > 3000).sort((p, q) => dc(p) - dc(q))[0];
if (t1) pick.push(t1);
for (const r of runs) { if (pick.length >= 15) break; if (pick.includes(r)) continue; if (pick.some(q => q.isX === r.isX && q.k === r.k && Math.min(q.b, r.b) > Math.max(q.a, r.a))) continue; pick.push(r); }
const COLORS = ['#e2231a', '#0072bc', '#f7a600', '#00a651', '#8dc63f', '#662d91', '#ec008c', '#00aeef', '#a0522d', '#808285', '#f15a24', '#006837', '#2e3192', '#c1272d', '#29abe2'];
const out = {}, usedNames = new Set();
pick.forEach((r, i) => {
  const id = 'T' + (i + 1); let avn = r.isX ? nameOf(NS, r.k / 4 + 7) : nameOf(EW, r.k / 4 + 5);
  if (usedNames.has(avn)) avn = avn.replace(/(laan|boulevard)$/, (m) => (r.isX ? 'Nieuwe ' : 'Grote ') + m).replace(/^(\S+) (Nieuwe|Grote) /, '$2 $1'); usedNames.add(avn);
  const oa = r.isX ? g.oz : g.ox;
  // haltes midden tussen twee zijstraten, om de 4 blokken (± 480 m); begin- en eindhalte zo dicht mogelijk bij de uiteinden
  const stops = [];
  for (let j = Math.ceil((r.a + 40 - oa - 66) / g.B); oa + j * g.B + 66 <= r.b - 40; j++) {
    const a = oa + j * g.B + 66;
    stops.push({ j, a });
  }
  const keep = stops.filter((s, n) => n === 0 || n === stops.length - 1 || ((s.j - stops[0].j) % 4 === 0 && Math.abs(s.a - stops[stops.length - 1].a) > 300));
  const a0 = keep[0].a - 40, a1 = keep[keep.length - 1].a + 40;
  const P0 = r.isX ? [r.fixed, a0] : [a0, r.fixed], P1 = r.isX ? [r.fixed, a1] : [a1, r.fixed];
  const ys = []; for (let a = a0; a <= a1; a += 8) { const x = r.isX ? r.fixed : a, z = r.isX ? a : r.fixed; ys.push(Math.round(A.heightAt(x, z))); }
  out[id] = { name: `${id} ${avn}`, color: COLORS[i], avenue: avn, pts: [P0, P1], ys, stops: keep.map(s => ({ name: `${avn} / ${nameOf(CROSS, s.j)}straat`, x: r.isX ? r.fixed : s.a, z: r.isX ? s.a : r.fixed })) };
  console.log(id, avn, Math.round(a1 - a0), 'm', keep.length, 'haltes');
});
writeFileSync(new URL('../js/greenisland-trams.js', import.meta.url), `// Gemaakt door tools/plan-tram.mjs (tramlijnen T1–T15 over de lanen van Munkbay; ligging en haltenamen voorstel).\nexport const TRAMS = ${JSON.stringify(out)};\n`);
