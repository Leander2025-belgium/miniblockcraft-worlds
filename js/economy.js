// Economie van de carrière (TERRANOVA 16, fase 7). De munt is de bestaande ViridCoin (VC, js/viridcoin.js, zelfde
// opslag 'blokstad-viridcoin'): wat je in Greenisland al verdiende blijft. Fictief spelgeld, geen echt geld, geen
// aankopen met echt geld.
//
//   - Rijbewijzen per voertuigsoort (bus, tram, metro, trein): je eerste dienst in een soort is het examen; met 60
//     punten of meer haal je het rijbewijs (+50 VC). Zonder rijbewijs mag je gewoon rijden (sandbox), maar een
//     dienst levert dan geen loon op.
//   - Loon per dienst (met rijbewijs): naar de score en het aantal bediende haltes.
//   - Bouwopdrachten betalen ook (één keer per opdracht).
//   - Dagelijkse uitdagingen: elke dag drie, voor iedereen dezelfde op dezelfde datum, gevolgd op echte gebeurtenissen
//     (dienst afgerond, blokken geplaatst, bouwopdracht, haltes bediend, meegereden als passagier).
//   - Statistieken.
// Sandbox: niets in de game is afgesloten achter VC (de Zenvo-showroom in Greenisland bestond al).
export const LICENSES = { bus: 'Rijbewijs D (bus)', tram: 'Trambrevet', metro: 'Metrobrevet', trein: 'Treinbestuurderslicentie', taxi: 'Taxivergunning' };
export const EXAM_PASS = 60;
export const wage = (score, served) => Math.round(score * 0.6 + served * 6);
export const TASK_PAY = { woning: 120, bushalte: 80, park: 100, appartement: 120, plein: 180, station: 250, weg: 140, spoorlijn: 200 };

const POOL = [
  { id: 'dienst70', text: 'Rond een dienst af met minstens 70 punten', kind: 'shift', min: 70, need: 1, vc: 60, xp: 40 },
  { id: 'dienst-bus', text: 'Rond een busdienst af', kind: 'shift', of: 'bus', need: 1, vc: 45, xp: 30 },
  { id: 'dienst-rail', text: 'Rond een tram-, metro- of treindienst af', kind: 'shift', of: 'rail', need: 1, vc: 55, xp: 35 },
  { id: 'haltes8', text: 'Bedien 8 haltes of stations', kind: 'served', need: 8, vc: 50, xp: 30 },
  { id: 'bouw60', text: 'Plaats 60 blokken', kind: 'place', need: 60, vc: 30, xp: 20 },
  { id: 'bouw200', text: 'Plaats 200 blokken', kind: 'place', need: 200, vc: 70, xp: 45 },
  { id: 'opdracht', text: 'Voltooi een bouwopdracht', kind: 'task', need: 1, vc: 80, xp: 50 },
  { id: 'passagier1', text: 'Rij 1 km mee als passagier', kind: 'ride', need: 1000, vc: 25, xp: 15 },
  { id: 'passagier3', text: 'Rij 3 km mee als passagier', kind: 'ride', need: 3000, vc: 55, xp: 30 },
];
const today = () => new Date().toISOString().slice(0, 10);
// drie uitdagingen voor een datum (deterministisch: zelfde datum = zelfde uitdagingen), verschillende soorten
export function dailyFor(date) {
  let h = 2166136261; for (const c of date) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const out = [], kinds = new Set();
  for (let i = 0; out.length < 3 && i < 50; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const c = POOL[h % POOL.length]; if (kinds.has(c.kind)) continue; kinds.add(c.kind); out.push(c);
  }
  return out;
}

export class Economy {
  // p: de opgeslagen carrière (js/career.js); wallet: Wallet uit js/viridcoin.js
  constructor(p, wallet, toast) {
    this.p = p; this.w = wallet; this.toast = toast || (() => {});
    p.licenses = p.licenses || {}; p.stats = p.stats || { diensten: 0, haltes: 0, blokken: 0, opdrachten: 0, verdiend: 0, passagierKm: 0 };
    this.ensureDaily();
  }
  ensureDaily(date = today()) {
    const d = this.p.daily;
    if (!d || d.date !== date) this.p.daily = { date, items: dailyFor(date).map(c => ({ id: c.id, prog: 0, done: false })) };
    return this.p.daily;
  }
  pay(n, what) { if (n <= 0 || !this.w) return 0; this.w.earn(n, what); this.p.stats.verdiend += n; return n; }
  // gebeurtenis voor de dagelijkse uitdagingen; geeft de voltooide uitdagingen terug
  event(kind, amount = 1, info = {}) {
    const D = this.ensureDaily(), done = [];
    for (const it of D.items) {
      if (it.done) continue; const c = POOL.find(x => x.id === it.id); if (!c || c.kind !== kind) continue;
      if (kind === 'shift') { if (c.min && (info.score || 0) < c.min) continue; if (c.of === 'bus' && info.kind !== 'bus') continue; if (c.of === 'rail' && info.kind === 'bus') continue; }
      it.prog = Math.min(c.need, it.prog + amount);
      if (it.prog >= c.need) { it.done = true; this.pay(c.vc, 'dagelijkse uitdaging: ' + c.text); done.push(c); this.toast(`🎯 Uitdaging gehaald: ${c.text} · +${c.vc} VC`); }
    }
    return done;
  }
  // na een afgeronde dienst: examen of loon
  shiftDone(kind, score, served, finished) {
    const S = this.p.stats; S.diensten += finished ? 1 : 0; S.haltes += served;
    const r = { examen: false, rijbewijs: null, loon: 0 };
    if (!this.p.licenses[kind]) {
      r.examen = true;
      if (finished && score >= EXAM_PASS) { this.p.licenses[kind] = { date: today(), score }; r.rijbewijs = LICENSES[kind]; this.pay(50, `${LICENSES[kind]} gehaald`); this.toast(`🪪 ${LICENSES[kind]} gehaald (${score} punten) · +50 VC`); }
      else if (finished) this.toast(`🪪 Examen ${LICENSES[kind]} niet gehaald (${score}/${EXAM_PASS} punten nodig). Probeer opnieuw.`);
    } else if (finished) r.loon = this.pay(wage(score, served), `loon ${kind}dienst`);
    if (served) this.event('served', served);
    if (finished) this.event('shift', 1, { kind, score });
    return r;
  }
  taskDone(id) { this.p.stats.opdrachten++; const n = this.pay(TASK_PAY[id] || 60, 'bouwopdracht ' + id); this.event('task', 1); return n; }
  placed(n = 1) { this.p.stats.blokken += n; this.event('place', n); }
  ride(m) { this.p.stats.passagierKm = Math.round((this.p.stats.passagierKm + m / 1000) * 100) / 100; this.event('ride', m); }
  dailyView() { const D = this.ensureDaily(); return D.items.map(it => ({ ...POOL.find(c => c.id === it.id), prog: it.prog, done: it.done })); }
}
