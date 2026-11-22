// Controle van de reisplanner over een verkeersnet (js/localplan.js) met een nagebootst net, zonder browser:
// een metrolijn west-oost (4 km), een tramlijn noord-zuid (2 km) die de metro kruist bij 'Kruispunt', en een bus.
// Verwacht: kort = lopen; ver langs de metro = metro; naar het einde van de tramlijn = metro + overstap + tram,
// stukken sluiten aan, sneller dan lopen.
import { planLocal, buildGraph, planText } from '../js/localplan.js';

function edge(id, net, pts, stops = [], names = [], line = '') {
  const p = new Float32Array(pts.flatMap(([x, z]) => [x, 0, z])); let len = 0;
  for (let i = 3; i < p.length; i += 3) len += Math.hypot(p[i] - p[i - 3], p[i + 2] - p[i - 1]);
  return { id, net, pts: p, len, stops, stopNames: names, line, next: [[], []] };
}
const metro = edge('m', 'metro', [[0, 0], [4000, 0]], [200, 1500, 2000, 3800], ['West', 'Midden', 'Kruispunt', 'Oost']);
const tram1 = edge('t1', 'tram', [[2000, 0], [2000, 1000]], [30, 900], ['Kruispunt tram', 'Noordpark']);
const tram2 = edge('t2', 'tram', [[2000, 1000], [2000, 2000]], [950], ['Noordeinde']);
tram1.next[1].push({ e: tram2, dir: 1 }); tram2.next[0].push({ e: tram1, dir: -1 });
const bus = edge('b', 'road', [[0, 300], [1000, 300]], [100, 900], ['Bus A', 'Bus B'], 'B1');
const net = { edges: new Map([metro, tram1, tram2, bus].map(e => [e.id, e])) };
const G = buildGraph(net), R = {};
const legsOf = (r) => (r.legs || []).map(l => l.naam ? `${l.mode}:${l.van}>${l.naar}` : l.mode);
let r = planLocal(net, { x: 210, z: 40 }, { x: 260, z: 60, name: 'vlakbij' }, G); R.kort = { lopen: !!r.lopen, min: r.minuten };
r = planLocal(net, { x: 190, z: 20 }, 'Oost', G); R.metro = { min: r.minuten, lopen: r.lopenZouDuren, legs: legsOf(r), overstappen: r.overstappen };
r = planLocal(net, { x: 190, z: 20 }, 'Noordeinde', G); R.overstap = { min: r.minuten, lopen: r.lopenZouDuren, legs: legsOf(r), overstappen: r.overstappen, tekst: planText(r) };
r = planLocal(net, { x: 120, z: 290 }, 'Bus B', G); R.bus = { legs: legsOf(r) };
console.log(JSON.stringify(R, null, 1));
const ok = G.stops.length === 9 && R.kort.lopen
  && R.metro.legs.join() === 'wandelen,metro:West>Oost,wandelen' && R.metro.min < R.metro.lopen
  && R.overstap.legs.join() === 'wandelen,metro:West>Kruispunt,overstap,tram:Kruispunt tram>Noordeinde,wandelen' && R.overstap.overstappen === 1 && R.overstap.min < R.overstap.lopen
  && R.bus.legs.join() === 'wandelen,bus:Bus A>Bus B,wandelen';
console.log(ok ? 'alles goed' : 'FOUT');
process.exitCode = ok ? 0 : 1;
