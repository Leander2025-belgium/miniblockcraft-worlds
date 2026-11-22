// Controle van de economie (js/economy.js) zonder browser: dagelijkse uitdagingen, examen en rijbewijs, loon,
// bouwopdrachten, passagierskilometers, geen dubbele beloning.
import { Economy, dailyFor, wage, EXAM_PASS } from '../js/economy.js';
const wallet = { balance: 500, hist: [], earn(n, w) { this.balance += n; this.hist.push([n, w]); } };
const toasts = [], p = { xp: 0, history: [], tasks: {}, achievements: [] };
const E = new Economy(p, wallet, (t) => toasts.push(t));
const R = {};
R.zelfdeDag = JSON.stringify(dailyFor('2026-11-22').map(c => c.id)) === JSON.stringify(dailyFor('2026-11-22').map(c => c.id));
R.andereDag = ['2026-11-23', '2026-11-24', '2026-11-25'].some(d => JSON.stringify(dailyFor(d).map(c => c.id)) !== JSON.stringify(dailyFor('2026-11-22').map(c => c.id)));
R.drieSoorten = new Set(dailyFor('2026-11-22').map(c => c.kind)).size === 3;
// examen niet gehaald → geen rijbewijs, geen loon
const b0 = wallet.balance;
const r1 = E.shiftDone('bus', EXAM_PASS - 5, 4, true);
R.examenGezakt = r1.examen && !r1.rijbewijs && !p.licenses.bus && r1.loon === 0;
// examen gehaald → rijbewijs + 50 VC
const r2 = E.shiftDone('bus', 82, 4, true);
R.examenGehaald = r2.rijbewijs && !!p.licenses.bus && p.licenses.bus.score === 82;
// volgende dienst → loon
const r3 = E.shiftDone('bus', 90, 4, true);
R.loon = r3.loon === wage(90, 4) && r3.loon === 78;
// afgebroken dienst → geen loon
R.afgebroken = E.shiftDone('bus', 90, 2, false).loon === 0;
R.bouwopdracht = E.taskDone('woning') === 120;
for (let i = 0; i < 250; i++) E.placed(1);
E.ride(1200); E.ride(2000);
R.stats = p.stats;
R.uitdagingen = E.dailyView().map(c => ({ id: c.id, prog: c.prog, done: c.done }));
R.saldo = wallet.balance - b0;
const ok = R.zelfdeDag && R.andereDag && R.drieSoorten && R.examenGezakt && R.examenGehaald && R.loon && R.afgebroken && R.bouwopdracht
  && p.stats.blokken === 250 && p.stats.passagierKm === 3.2 && p.stats.diensten === 3
  && wallet.hist.every(([n]) => n > 0) && wallet.hist.filter(([, w]) => /gehaald/.test(w) && /Rijbewijs/.test(w)).length === 1;
console.log('economie:', JSON.stringify(R));
console.log(ok ? 'alles goed' : 'FOUT'); process.exitCode = ok ? 0 : 1;
