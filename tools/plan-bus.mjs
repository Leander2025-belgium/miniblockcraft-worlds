// Kiest de straten voor de stadsbussen van Munkbay (rechte straten noord-zuid zonder water, spoor op straatniveau of te steile stukken)
// en schrijft js/greenisland-buses.js. Gebruik: node tools/plan-bus.mjs
import { writeFileSync } from 'fs';
import * as A from '../js/greenisland.js';
const P = A.PLACE['Munkbay'], g = A._gridFor(P);
const NAMES = ['Rozenstraat', 'Tulpenstraat', 'Molenstraat', 'Kerkstraat', 'Schoolstraat', 'Marktstraat', 'Torenstraat', 'Poortstraat', 'Ankerstraat', 'Zeilstraat', 'Kompasstraat', 'Duinstraat', 'Klaverstraat', 'Heidestraat', 'Varenstraat', 'Dahliastraat', 'Irisstraat', 'Leliestraat', 'Distelstraat', 'Mosstraat'];
const runs = [];
for (let bx = Math.ceil((P.x - 5000 - g.ox) / g.B); g.ox + bx * g.B < P.x + 5000; bx++) {
  if (((bx % 4) + 4) % 4 === 0) continue; // lanen: daar rijdt de tram
  const r = A._cityBusRun(bx, P.z - 5500, P.z + 5500); if (r && r.b - r.a > 2200) runs.push({ bx, a: r.a, b: r.b });
}
runs.sort((p, q) => (q.b - q.a) - (p.b - p.a));
const pick = []; for (const r of runs) { if (pick.length >= 8) break; if (pick.some(q => Math.abs(q.bx - r.bx) < 3)) continue; pick.push(r); }
pick.sort((p, q) => p.bx - q.bx);
// (geen luchthavenshuttle over de straten: geen stadsstraat loopt tot aan de luchthaven; daar rijden AX1 en metro M1)
const out = pick.map((r, i) => ({ ...r, street: NAMES[i % NAMES.length] }));
for (const r of out) console.log(r.street, r.bx, Math.round(r.b - r.a), 'm', r.airport ? '(luchthaven)' : '');
writeFileSync(new URL('../js/greenisland-buses.js', import.meta.url), `// Gemaakt door tools/plan-bus.mjs (stadsbuslijnen van Munkbay: straat, begin en einde; voorstel).\nexport const CITY_BUS = ${JSON.stringify(out)};\n`);
