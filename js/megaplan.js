// Reisplanner van Megatower City: metro M1 (9 stations van Westpoort tot Luchthaven, met halte Megatower onder de
// toren), de trein van Megatower Centraal naar de Luchthaven, en wandelen. Gebruikt de echte dienstregeling van het
// verkeer (js/service.js: interval en haltetijd per periode spits/dal/avond/nacht, volgens het speluur).
// plan(van, naar, uur) geeft de snelste reis: alleen wandelen, metro, trein, of metro + trein met een overstap.
import { periodOfHour, HEADWAY, DWELL, PERIOD_LABEL } from './service.js';

const T = 128, METRO_Z = 40 * T, RAIL_Z = 47 * T;
const METRO = [[5, 'Westpoort'], [12, 'Parkzicht'], [24, 'Universiteit'], [32, 'Oude Markt'], [40, 'Megatower'], [48, 'Oostkade'], [56, 'Ziekenhuis'], [64, 'Fabriekshallen'], [70, 'Luchthaven']]
  .map(([tx, name]) => ({ id: 'M:' + name, name: 'Metro ' + name, line: 'M1', x: tx * T + 64, z: METRO_Z, kind: 'metro' }));
const RAIL = [{ id: 'T:Centraal', name: 'Station Megatower Centraal', line: 'IC', x: 38 * T + 64, z: RAIL_Z, kind: 'train' }, { id: 'T:Luchthaven', name: 'Station Luchthaven', line: 'IC', x: 70 * T + 64, z: RAIL_Z, kind: 'train' }];
export const STOPS = [...METRO, ...RAIL];
export const PLACES = [
  { id: 'P:toren', name: 'The Megatower (hoofdingang)', x: 40 * T + 64, z: 40 * T + 64 },
  { id: 'P:centraal', name: 'Station Megatower Centraal', x: 38 * T + 64, z: RAIL_Z + 18 },
  { id: 'P:luchthaven', name: 'Luchthaven (terminal)', x: 72 * T, z: 40 * T },
  { id: 'P:busstation', name: 'Busstation Centraal', x: 38 * T + 64, z: 47 * T + 110 },
  { id: 'P:park', name: 'Centraal Park', x: 45 * T + 64, z: 34 * T },
  { id: 'P:ziekenhuis', name: 'Ziekenhuis Sint-Elisabeth', x: 56 * T + 64, z: 42 * T },
  { id: 'P:uni', name: 'Universiteitscampus', x: 24 * T + 64, z: 38 * T },
  ...METRO.map(s => ({ id: s.id, name: s.name, x: s.x, z: s.z })),
];
const WALK = 1.35, METRO_V = 16, TRAIN_V = 33, TRAIN_HEADWAY = { spits: 600, dal: 900, avond: 1200, nacht: 1800 }, TRAIN_DWELL = 60;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) * 1.25; // wandelen langs straten (omweg)
const fmt = (sec) => { const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
// eerstvolgend vertrek na tijd t (seconden sinds middernacht) bij een interval h en een vaste verschuiving
const nextDep = (t, h, off) => Math.ceil((t - off) / h) * h + off;

function rideMetro(a, b, t, per) {
  const ia = METRO.indexOf(a), ib = METRO.indexOf(b), n = Math.abs(ib - ia);
  const dep = nextDep(t, HEADWAY[per].metro, (ia * 97) % HEADWAY[per].metro), ride = Math.abs(b.x - a.x) / METRO_V + (n - 1) * DWELL[per].metro;
  return { mode: 'metro', line: 'M1', from: a, to: b, dep, arr: dep + ride, stops: n, dir: ib > ia ? 'Luchthaven' : 'Westpoort', perron: ib > ia ? 1 : 2 };
}
function rideTrain(a, b, t, per) {
  const dep = nextDep(t, TRAIN_HEADWAY[per], a === RAIL[0] ? 120 : 420), ride = Math.abs(b.x - a.x) / TRAIN_V + TRAIN_DWELL;
  return { mode: 'trein', line: 'IC', from: a, to: b, dep, arr: dep + ride, stops: 1, dir: b.name.replace('Station ', ''), perron: a === RAIL[0] ? 2 : 1 };
}
const walk = (from, to, t) => { const s = dist(from, to) / WALK; return { mode: 'wandelen', from, to, dep: t, arr: t + s, m: Math.round(dist(from, to)) }; };
const nearest = (p, list) => list.reduce((b, s) => (!b || dist(p, s) < dist(p, b) ? s : b), null);

export function plan(from, to, hour) {
  const per = periodOfHour(hour), t0 = Math.round(hour * 3600), opts = [];
  opts.push([walk(from, to, t0)]);
  // metro: de dichtste stations bij vertrek en aankomst (en het tweede dichtste, voor het geval dat korter is)
  const mA = [...METRO].sort((a, b) => dist(from, a) - dist(from, b)).slice(0, 2), mB = [...METRO].sort((a, b) => dist(to, a) - dist(to, b)).slice(0, 2);
  for (const a of mA) for (const b of mB) if (a !== b) { const w1 = walk(from, a, t0), r = rideMetro(a, b, w1.arr, per), w2 = walk(b, to, r.arr); opts.push([w1, r, w2]); }
  // trein, en metro + trein (overstap Megatower ↔ Centraal, of Luchthaven)
  const tA = nearest(from, RAIL), tB = nearest(to, RAIL);
  if (tA !== tB) {
    { const w1 = walk(from, tA, t0), r = rideTrain(tA, tB, w1.arr, per), w2 = walk(tB, to, r.arr); opts.push([w1, r, w2]); }
    for (const a of mA) { // metro naar het treinstation, dan de trein
      const xm = nearest(tA, METRO); if (a === xm) continue;
      const w1 = walk(from, a, t0), r1 = rideMetro(a, xm, w1.arr, per), w2 = walk(xm, tA, r1.arr), r2 = rideTrain(tA, tB, w2.arr, per), w3 = walk(tB, to, r2.arr); opts.push([w1, r1, w2, r2, w3]);
    }
    for (const b of mB) { // trein, dan de metro
      const xm = nearest(tB, METRO); if (b === xm) continue;
      const w1 = walk(from, tA, t0), r1 = rideTrain(tA, tB, w1.arr, per), w2 = walk(tB, xm, r1.arr), r2 = rideMetro(xm, b, w2.arr, per), w3 = walk(b, to, r2.arr); opts.push([w1, r1, w2, r2, w3]);
    }
  }
  let best = null;
  for (const o of opts) { const legs = o.filter(l => l.mode !== 'wandelen' || l.m > 15); const arr = o[o.length - 1].arr; if (!best || arr < best.arr) best = { legs, arr, dep: t0, per }; }
  best.ritten = best.legs.filter(l => l.mode !== 'wandelen').length;
  best.overstappen = Math.max(0, best.ritten - 1);
  best.wandelen = best.legs.filter(l => l.mode === 'wandelen').reduce((a, l) => a + l.m, 0);
  return best;
}
const ICON = { metro: '🚇', trein: '🚆', wandelen: '🚶' };
export function planHtml(r) {
  const min = (s) => Math.max(1, Math.round(s / 60));
  return `<div class="small muted">Dienstregeling: ${PERIOD_LABEL[r.per]} (metro om de ${HEADWAY[r.per].metro / 60} min, trein om de ${TRAIN_HEADWAY[r.per] / 60} min)</div>
    <div><b>Aankomst ${fmt(r.arr)}</b> · reistijd ${min(r.arr - r.dep)} min · ${r.overstappen} overstap${r.overstappen === 1 ? '' : 'pen'} · ${r.wandelen} m wandelen</div>
    <ol class="plan-legs">${r.legs.map(l => l.mode === 'wandelen'
      ? `<li>${ICON.wandelen} ${fmt(l.dep)} wandel ${l.m} m naar <b>${l.to.name}</b> (${min(l.arr - l.dep)} min)</li>`
      : `<li>${ICON[l.mode]} ${fmt(l.dep)} <b>${l.line}</b> richting ${l.dir}, perron ${l.perron}, van ${l.from.name} naar <b>${l.to.name}</b> · aankomst ${fmt(l.arr)} (${l.stops} halte${l.stops === 1 ? '' : 's'})</li>`).join('')}</ol>`;
}
