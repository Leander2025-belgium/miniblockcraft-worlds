// TERRANOVA 16.1 fasen 5–7 — controle van Megatower Grand Central zonder browser. De tegels van het station worden
// gemaakt zoals in de worker en het echte verkeersnet (js/traffic.js Network) wordt erover gebouwd.
//  - capaciteit: 22 treinperronsporen, 10 tramsporen (-1), 6 metrosporen (-2), 2 hyperloopperrons
//  - bereikbaarheid in het net: vanaf het hoofdspoor (trein), de straattram T5 en de metro M2 komt een voertuig via de
//    wisselstraat op elk perronspoor en daarna weer op het hoofdspoor aan de andere kant
//  - elk perronspoor heeft zijn eigen halte met perronnummer; vrijprofiel boven elk spoor (geen blokken in het profiel)
//  - per perron een lift (straat, perron, hal), een roltrap naar de hal en een trap naar de onderdoorgang
//  - winkels en horeca in de hal zijn ingericht; de hyperloopbuis loopt ononderbroken van terminal A tot B
import { generateTile, landmark } from '../js/megacity.js';
import * as GCm from '../js/grandcentral.js';
import { Network } from '../js/traffic.js';
import { B } from '../js/blocks.js';
import { FURNISHING } from '../js/shops.js';
import { CX, CZ } from '../js/megatower.js';

const T = 128, G = 120, { TRACKS, PLATFORMS, TRAM_TRACKS, TRAM_PLATS, M2_TRACKS, M2_PLATS, HALL, HYPER, RAIL_Z, DECK } = GCm;
const R = {}, fails = [];
const fail = (m) => { fails.push(m); if (fails.length < 25) console.log('  ✗ ' + m); };
// tegels: het station (36..43 × 46..47), de tramlaan (rij 45/46) en de metro (kolom 41..42), plus de buren voor het net
const want = new Set();
for (let tx = 34; tx <= 45; tx++) for (let tz = 45; tz <= 48; tz++) want.add(tx + ',' + tz);
for (let tz = 40; tz <= 50; tz++) for (const tx of [41, 42]) want.add(tx + ',' + tz);
const t0 = Date.now(), tiles = new Map(), vox = new Map();
for (const k of want) {
  const [tx, tz] = k.split(',').map(Number), r = generateTile(tx, tz);
  tiles.set(k, { key: k, ox: tx * T, oz: tz * T, paths: r.paths });
  vox.set(k, r);
}
R.tegels = tiles.size; R.ms = Date.now() - t0;
const at = (x, y, z) => { const tx = Math.floor(x / T), tz = Math.floor(z / T), r = vox.get(tx + ',' + tz); if (!r) return -1; const ly = y - r.y0; if (ly < 0 || ly >= r.H) return 0; return r.vox[((z - tz * T) * T + (x - tx * T)) * r.H + ly]; };
const net = new Network(); net.build(tiles, T);
const E = [...net.edges.values()];
// 1. capaciteit (perronsporen in het net, met halte)
const platEdges = (gc) => E.filter(e => e.gc === gc && e.trk && !e.throat && e.stops.length);
const trkSet = (gc) => new Set(platEdges(gc).map(e => e.trk));
R.treinsporen = trkSet('trein').size; R.tramsporen = trkSet('tram').size; R.metrosporen = trkSet('metro').size;
R.perrons = { trein: PLATFORMS.length, tram: TRAM_PLATS.length, metro: M2_PLATS.length, hyperloop: 2 };
R.haltes = { trein: [...new Set(platEdges('trein').map(e => e.stopNames[0]))], plat: [...new Set(platEdges('trein').map(e => e.stopPlat))].length };
// 2. bereikbaarheid: zoeken in het net (een voertuig rijdt van rand naar rand via next[eind])
function reach(start, dir) {
  const seen = new Set(), q = [[start, dir]], hit = new Set();
  while (q.length) {
    const [e, d] = q.shift(), k = e.id + d; if (seen.has(k)) continue; seen.add(k);
    if (e.trk) hit.add(e.trk);
    for (const n of e.next[d > 0 ? 1 : 0]) q.push([n.e, n.dir]);
    if (seen.size > 20000) break;
  }
  return hit;
}
function mainEdge(net, pred) { return E.find(e => e.net === net && !e.trk && !e.conn && pred(e)); }
const midZ = (e) => e.pts[2], midX = (e) => e.pts[0];
const trainN = mainEdge('rail', e => Math.abs(midZ(e) - (RAIL_Z - 3)) < 0.6 && midX(e) < GCm.WX0 && midX(e) > GCm.WX0 - 200);
const trainS = mainEdge('rail', e => Math.abs(midZ(e) - (RAIL_Z + 2)) < 0.6 && midX(e) > GCm.EX1 && midX(e) < GCm.EX1 + 200);
const dirTo = (e, fx) => (e.pts[e.pts.length - 3] - e.pts[0]) * fx > 0 ? 1 : -1; // rijrichting naar oost (fx 1) of west (-1)
const rN = trainN ? reach(trainN, dirTo(trainN, 1)) : new Set(), rS = trainS ? reach(trainS, dirTo(trainS, -1)) : new Set();
R.trein = { start: trainN && trainN.id, noordHoofdspoor: !!trainN, zuidHoofdspoor: !!trainS, bereiktNoord: [...rN].sort((a, b) => a - b), bereiktZuid: [...rS].sort((a, b) => a - b) };
const allTrain = new Set([...rN, ...rS]);
// en ook weer buiten het station: van een perronspoor naar het hoofdspoor erna
const exitOk = (() => { const pe = platEdges('trein').find(e => e.trk === 1); if (!pe) return false; const seen = new Set(), q = [[pe, dirTo(pe, 1)]]; while (q.length) { const [e, d] = q.shift(); if (seen.has(e.id)) continue; seen.add(e.id); if (!e.trk && e.net === 'rail' && midX(e) > GCm.EX1) return true; for (const n of e.next[d > 0 ? 1 : 0]) q.push([n.e, n.dir]); } return false; })();
R.trein.uitrijden = exitOk;
const tramW = mainEdge('tram', e => e.line === 'T5' && midX(e) < GCm.TRAM.u0 - 40 && midX(e) > GCm.TRAM.u0 - 300 && Math.abs(midZ(e) - (GCm.TRAM_Z0 - 3)) < 0.6);
const tramE = mainEdge('tram', e => e.line === 'T5' && midX(e) > GCm.TRAM.u1 + 40 && midX(e) < GCm.TRAM.u1 + 300 && Math.abs(midZ(e) - (GCm.TRAM_Z0 + 2)) < 0.6);
const rTW = tramW ? reach(tramW, dirTo(tramW, 1)) : new Set(), rTE = tramE ? reach(tramE, dirTo(tramE, -1)) : new Set();
R.tram = { bereikt: [...new Set([...rTW, ...rTE])].filter(t => t > 100 && t < 200).sort((a, b) => a - b) };
const mN = mainEdge('metro', e => e.line === 'M2' && Math.abs(midX(e) - (GCm.M2_X + 5)) < 0.6 && e.pts[2] < GCm.M2_GC.f0 && e.pts[2] > 5300);
const mS = mainEdge('metro', e => e.line === 'M2' && Math.abs(midX(e) - (GCm.M2_X - 4)) < 0.6 && e.pts[2] > GCm.M2_GC.f1 && e.pts[2] < 6400);
const dirZ = (e, fz) => (e.pts[e.pts.length - 1] - e.pts[2]) * fz > 0 ? 1 : -1;
const rMN = mN ? reach(mN, dirZ(mN, 1)) : new Set(), rMS = mS ? reach(mS, dirZ(mS, -1)) : new Set();
R.metro = { bereikt: [...new Set([...rMN, ...rMS])].filter(t => t > 200).sort((a, b) => a - b) };
// 3. vrijprofiel boven elk perronspoor (trein 5 m hoog, ±1,4 m), tram en metro
let blocked = 0;
for (const t of TRACKS) for (let x = GCm.PX0 + 2; x <= GCm.PX1 - 2; x += 3) for (const dz of [-1, 0]) for (let y = DECK + 1; y <= DECK + 5; y++) { const b = at(x, y, RAIL_Z + t.o + dz); if (b > 0 && b !== B.LINE_YELLOW) { blocked++; if (blocked < 4) fail(`vrijprofiel trein spoor ${t.n} op ${x},${y}: blok ${b}`); } }
for (const t of TRAM_TRACKS) for (let x = GCm.TRAM.p0; x <= GCm.TRAM.p1; x += 3) for (const dz of [-1, 0]) for (let y = GCm.TRAM.row + 1; y <= GCm.TRAM.row + 4; y++) { const b = at(x, y, GCm.TRAM_Z0 + t.o + dz); if (b > 0) { blocked++; if (blocked < 8) fail(`vrijprofiel tram spoor ${t.n} op ${x},${y}`); } }
for (const t of M2_TRACKS) for (let z = GCm.M2_GC.p0; z <= GCm.M2_GC.p1; z += 3) for (const dx of [-1, 0]) for (let y = GCm.M2_ROW + 1; y <= GCm.M2_ROW + 4; y++) { const b = at(GCm.M2_X + t.o + dx, y, z); if (b > 0) { blocked++; if (blocked < 12) fail(`vrijprofiel metro spoor ${t.n} op ${z},${y}`); } }
// ook in de tunnel van T5 en de helling
for (let x = GCm.TRAM.r0; x <= GCm.TRAM.e1; x += 2) for (const k of [4, 5]) { const c = GCm.tramO(k, x), row = GCm.tramRow(x); for (let y = row + 1; y <= row + 4; y++) for (const dz of [-1, 0]) { const b = at(x, y, GCm.TRAM_Z0 + Math.round(c) + dz); if (b > 0) { blocked++; if (blocked < 16) fail(`vrijprofiel tramtunnel op ${x},${y}`); } } }
R.vrijprofielBlokken = blocked;
// 4. verbindingen per perron
let lifts = 0, esc = 0, stairs = 0;
for (const P of PLATFORMS) {
  const lx = 5140, lz = RAIL_Z + P.o0 + 6;
  if (at(lx, G - 1, lz) === B.ELEVATOR && at(lx, DECK + 1, lz) === B.ELEVATOR && at(lx, HALL.floor, lz) === B.ELEVATOR) lifts++; else fail(`lift perron ${P.n}`);
  if (at(5150, DECK + 1, RAIL_Z + P.o0 + 3) === B.ESCALATOR && at(5156, DECK + 7, RAIL_Z + P.o0 + 3) === B.ESCALATOR) esc++; else fail(`roltrap perron ${P.n}`);
  if (at(5160, G - 1, RAIL_Z + P.o1 - 2) === B.TILE && at(5169, G + 8, RAIL_Z + P.o1 - 2) === B.TILE) stairs++; else fail(`trap perron ${P.n}`);
}
R.perronverbindingen = { liften: lifts, roltrappen: esc, trappen: stairs };
// 5. winkels in de hal: per winkel tellen hoeveel inrichtingsblokken er staan
const shops = [];
for (const [row, list] of Object.entries(GCm.HALL_SHOPS)) for (const S of list) {
  let n = 0; const o0 = HALL.o0 + 1 + S.u0;
  for (let u = 1; u < S.w - 1; u++) for (let v = 1; v < 15; v++) for (let l = 1; l <= 3; l++) {
    const x = row === 'west' ? HALL.x0 + 16 - v : HALL.x1 - 16 + v;
    if (FURNISHING.has(at(x, HALL.floor + l, RAIL_Z + o0 + u))) n++;
  }
  shops.push({ naam: S.name, soort: S.soort, inrichting: n });
}
R.halwinkels = shops.length; R.leeg = shops.filter(s => s.inrichting < 4).map(s => s.naam);
R.soorten = [...new Set(shops.map(s => s.soort))];
// 6. hyperloopbuis: elke 4 m de bodem op de juiste plek
let gaps = 0; for (let x = HYPER.A.x1 + 2; x < Math.min(HYPER.B.x0 - 2, 5800); x += 4) { const c = GCm.hyperO(x), z = RAIL_Z + Math.round(c); if (at(x, HYPER.y, z) !== B.METAL) gaps++; }
R.hyperloopBuisGaten = gaps;
R.hyperloopPad_m = Math.round(GCm.hyperPath().reduce((s, p, i, a) => i ? s + Math.hypot(p[0] - a[i - 1][0], p[2] - a[i - 1][2]) : 0, 0));
// 7. geen tunnel door de toren (kelders tot -100 m in x 5136..5231, z 5136..5231)
R.metroVerVanToren = GCm.M2_X - 24 > CX + 48;
console.log(JSON.stringify(R, null, 1));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ok = R.treinsporen === 22 && R.tramsporen === 10 && R.metrosporen === 6 && R.perrons.trein === 11
  && R.trein.bereiktNoord.join() === range(1, 11).join() && R.trein.bereiktZuid.join() === range(12, 22).join() && R.trein.uitrijden
  && R.tram.bereikt.length === 10 && R.metro.bereikt.length === 6 && R.vrijprofielBlokken === 0
  && lifts === 11 && esc === 11 && stairs === 11 && R.halwinkels >= 15 && !R.leeg.length && gaps === 0 && R.metroVerVanToren && !fails.length;
console.log(ok ? 'alles goed' : 'FOUT');
process.exitCode = ok ? 0 : 1;
