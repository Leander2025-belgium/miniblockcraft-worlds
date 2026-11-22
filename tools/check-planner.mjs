// Reisplanner met voorkeuren (js/megaplan.js, TERRANOVA 16): 'snelste' is dezelfde zoektocht als voorheen; de
// andere voorkeuren mogen trager zijn, maar moeten doen wat ze beloven (minder overstappen, minder wandelen).
import { plan, alternatives, PREFS } from '../js/megaplan.js';
const pts = [[1200, 1500], [8800, 8600], [5184, 4990], [3000, 7000], [7600, 2400], [600, 9400], [9500, 500], [4100, 5100]];
let ok = true, n = 0; const out = [];
for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) {
  if (i === j) continue;
  const A = { x: pts[i][0], z: pts[i][1] }, B = { x: pts[j][0], z: pts[j][1] }, h = [7.5, 12, 17.25, 23][(i + j) % 4];
  const R = Object.fromEntries(Object.keys(PREFS).map(k => [k, plan(A, B, h, k)]));
  const s = R.snelste;
  const good = R.overstappen.overstappen <= s.overstappen && R.wandelen.wandelen <= s.wandelen + 1
    && Object.values(R).every(r => r.arr >= s.arr - 1) // niets is sneller dan 'snelste'
    && R.toegankelijk.legs.filter(l => l.mode === 'wandelen').every(l => l.m <= 700 || !R.toegankelijk.ritten);
  if (!good) { ok = false; out.push({ i, j, h, s: [s.arr - s.dep, s.overstappen, s.wandelen], o: [R.overstappen.overstappen], w: [R.wandelen.wandelen] }); }
  n++;
}
const alt = alternatives({ x: 1200, z: 1500 }, { x: 8800, z: 8600 }, 8.25);
const altOk = alt.length >= 2 && alt.every(r => r.voorkeuren.length >= 1) && new Set(alt.map(r => r.legs.map(l => l.line || 'w').join('>'))).size === alt.length;
console.log('planner:', JSON.stringify({ reizen: n, fouten: out.slice(0, 3), alternatieven: alt.map(r => ({ v: r.voorkeuren, min: Math.round((r.arr - r.dep) / 60), ov: r.overstappen, m: r.wandelen })) }));
console.log(ok && altOk ? 'alles goed' : 'FOUT'); process.exitCode = ok && altOk ? 0 : 1;
