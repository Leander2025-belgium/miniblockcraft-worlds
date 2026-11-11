// Analyse van de infrastructuur van Greenisland: kruisingen weg × spoor en straat × spoor, wegen die eindigen
// en de verscheidenheid van gebouwen. Gebruik: node tools/analyse-green-infra.mjs
import * as A from '../js/greenisland.js';
const RAIL = A.LINES.filter(L => !L.metro && !L.tram);
const out = { roadX: { n: 0, over: 0, under: 0, tunnel: 0, conflict: 0, list: [] }, streetX: { n: 0, over: 0, under: 0, tunnel: 0, grade: 0, conflict: 0 }, ends: 0, endList: [] };
// 1. nationale wegen × spoor: elk wegpunt op of vlak naast een spoorbed moet bij een getypeerde kruising horen
for (const R of A.ROADS) {
  let last = -1e9;
  for (let k = 0; k < R.n; k++) for (const L of RAIL) {
    const q = L.near(R.x[k], R.z[k], 5.4 + R.hw); if (!q || q.kind === 1) continue;
    const c = (R.xings || []).find(c => c.L === L && Math.abs(R.s[k] - c.s) <= c.half + 12);
    if (c) { if (R.s[k] - last > 60) { out.roadX.n++; out.roadX[c.type === 'brug' ? 'over' : c.type === 'onder' ? 'under' : c.type === 'overweg' ? 'overweg' : 'tunnel'] = (out.roadX[c.type === 'brug' ? 'over' : c.type === 'onder' ? 'under' : c.type === 'overweg' ? 'overweg' : 'tunnel'] || 0) + 1; last = R.s[k]; } continue; }
    if (R.s[k] - last < 60) continue; last = R.s[k]; out.roadX.n++; out.roadX.conflict++;
    if (out.roadX.list.length < 40) out.roadX.list.push(`${R.kind} ${R.a}–${R.b} × ${L.id} bij (${Math.round(R.x[k])},${Math.round(R.z[k])}) afstand ${q.d.toFixed(1)} m, weg ${(R.y[k] - 1).toFixed(1)} spoor ${q.y.toFixed(1)}`);
  }
}
// 2. stadsstraten × spoor (alle plaatsen): elke straat die een spoorbed raakt, moet een ontwerp hebben
for (const p of A.ALL_PLACES) {
  const g = A._gridFor(p);
  for (const isX of [true, false]) for (let k = -Math.ceil(p.r / g.B); k <= Math.ceil(p.r / g.B); k++) {
    const fixed = (isX ? g.ox : g.oz) + k * g.B + 4; let last = -1e9;
    for (let a = (isX ? p.z : p.x) - p.r; a <= (isX ? p.z : p.x) + p.r; a += 2) {
      const x = isX ? fixed : a, z = isX ? a : fixed, u = A._urbanAt(x, z); if (!u || u.p !== p || u.dens <= 0.12) continue;
      const st = A._streetAt(x, z, u); if (!st.street) continue;
      for (const L of RAIL) { const q = L.near(x, z, 3); if (!q || q.kind === 1 || a - last < 40) continue; last = a;
        out.streetX.n++;
        const r = A._streetRail(x, z, st, u);
        const t = !r ? 'conflict' : r.type === 'brug' ? 'over' : r.type === 'onder' ? 'under' : r.type === 'overweg' ? 'grade' : r.type === 'einde' ? 'einde' : 'conflict';
        out.streetX[t] = (out.streetX[t] || 0) + 1;
      }
    }
  }
}
// 3. wegen die eindigen zonder plaats of andere weg
// een wegeinde moet samenvallen met een ander wegeinde of een punt van een andere weg (knooppunt), of in de bebouwde kom op een straat uitkomen
const endsAt = (x, z, self) => A.ROADS.some(R => R !== self && Array.from({ length: R.n }, (_, k) => k).some(k => Math.abs(R.x[k] - x) < 12 && Math.abs(R.z[k] - z) < 12 && Math.hypot(R.x[k] - x, R.z[k] - z) < 12))
  || (() => { const u = A._urbanAt(x, z); if (!u || u.dens <= 0.12) return false; for (let d = 0; d <= 14; d += 2) for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const st = A._streetAt(x + dx, z + dz, u); if (st.street) return true; } return false; })();
for (const R of A.ROADS) for (const k of [0, R.n - 1]) if (!endsAt(R.x[k], R.z[k], R) && !A.ROAD_ENDS.some(e => e.R === R && Math.hypot(e.x - R.x[k], e.z - R.z[k]) < 1)) { out.ends++; if (out.endList.length < 20) out.endList.push(`${R.a}–${R.b} eindigt bij (${Math.round(R.x[k])},${Math.round(R.z[k])})`); }
// 4. gebouwen: verscheidenheid in Munkbay (kenmerken per kavel)
const P = A.PLACE.Munkbay, sig = new Map(); let lots = 0;
for (let z = P.z - 3000; z < P.z + 3000; z += 13) for (let x = P.x - 3000; x < P.x + 3000; x += 13) {
  const u = A._urbanAt(x, z); if (!u || u.p !== P) continue; const st = A._streetAt(x, z, u); if (st.street) continue;
  const l = A._lotAt(x, z, u, st); if (!l.b) continue;
  const b = l.b, s = `${b.fam || b.kind}|${b.floors}|${b.x1 - b.x0}x${b.z1 - b.z0}|${b.shape || 'rect'}|${b.roof || ''}`; sig.set(s, (sig.get(s) || 0) + 1); lots++;
}
const kinds = new Map(); for (const [s, n] of sig) { const k = s.split('|')[0]; kinds.set(k, (kinds.get(k) || 0) + n); }
console.log('== nationale wegen × spoor:', JSON.stringify({ ...out.roadX, list: undefined }));
for (const l of out.roadX.list.slice(0, 15)) console.log('   ' + l);
console.log('== stadsstraten × spoor:', JSON.stringify(out.streetX));
console.log('== wegeinden zonder aansluiting (geen knooppunt, straat, dorpsplein of keerlus):', out.ends, '· ontworpen einden:', A.ROAD_ENDS.length); for (const l of out.endList) console.log('   ' + l);
console.log('== gebouwen in Munkbay (steekproef):', lots, 'kavels ·', sig.size, 'verschillende kenmerkcombinaties · soorten:', JSON.stringify(Object.fromEntries(kinds)));
