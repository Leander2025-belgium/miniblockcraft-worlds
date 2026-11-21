// Remises in de dienstregeling (TERRANOVA 14.1): omloop, uit- en inrukken, opstellen (bij js/depot.js en js/rail.js).
//
// Omloop per remise en per materieelsoort (zelfde samenstelling van rijtuigen): een trein die aan het eindstation
// aankomt, keert en vertrekt weer als er binnen 7–45 min een vertrek is (keerrit, niets naar de remise). Een vertrek
// zonder zo'n aankomst krijgt een treinstel uit de remise (uitrukken), een aankomst zonder vertrek gaat naar de
// remise (inrukken). Over twee dagen nagespeeld zodat de stand om middernacht klopt; het aantal stellen in de remise
// bij het begin van de dag is het minimum dat nodig is om nooit tekort te komen.
//
// Rijweg voor een rangeerbeweging: de rangeerrit rijdt op het hoofdspoor (aankomstspoor bij uitrukken, vertrekspoor
// bij inrukken). Er mag geen dienstregelingstrein op hetzelfde spoor binnen 400 m zijn zolang de rangeerrit daar rijdt;
// anders vertrekt hij eerder (uitrukken: wacht dan aan het perron) of later (inrukken: wacht aan het perron), in
// stappen van 30 s. Zo rijden rangeerritten en treinen nooit in elkaar.
import { shuntPath, DEPOT_DIM } from './depot.js';
const P = 86400, V = 11, TURN_MIN = 420, TURN_MAX = 2700, PRE = 120, POST = 60, CLEAR = 400;

// h: { runs(r,k), delayOf(r,k), posAt(pr,t), trackOffset }
export function depotPlan(D, RUNS, h) {
  const L = D.L, deps = [], arrs = [];
  // doorgaande diensten over een wissel (S11/S12) eindigen op een andere lijn: die tellen niet mee in de omloop van deze remise
  const ownA = (r) => r.pr.L === L;
  for (const r of RUNS) {
    const n = Math.round(P / r.h);
    const dep = r.dir === D.e && ownA(r), arr = r.pr.L === L && r.dir === -D.e;
    if (!dep && !arr) continue;
    const comp = r.sv.cars.join(',');
    for (let k = 0; k < n; k++) {
      if (!h.runs(r, k)) continue;
      const t0 = r.off + k * r.h + h.delayOf(r, k);
      if (dep) deps.push({ t: ((t0 % P) + P) % P, r, k, comp });
      if (arr) { const ta = t0 + r.pr.T; arrs.push({ t: ((ta % P) + P) % P, r, k, comp }); }
    }
  }
  // twee dagen naspelen: keerritten koppelen, de rest uit- of inrukken
  const ev = [];
  for (const day of [0, 1]) { for (const a of arrs) ev.push({ type: 'arr', t: a.t + day * P, x: a, day }); for (const d of deps) ev.push({ type: 'dep', t: d.t + day * P, x: d, day }); }
  ev.sort((p, q) => p.t - q.t || (p.type === 'arr' ? -1 : 1));
  const waiting = []; const shunts = [];
  for (const e of ev) {
    if (e.type === 'arr') { waiting.push(e); continue; }
    const i = waiting.findIndex(w => w.x.comp === e.x.comp && e.t - w.t >= TURN_MIN && e.t - w.t <= TURN_MAX && !w.used);
    if (i >= 0) waiting[i].used = true;
    else if (e.day === 1) shunts.push({ kind: 'uit', t: e.t - P, x: e.x });
  }
  for (const w of waiting) if (!w.used && w.day === 1 && !ev.some(e => e.type === 'dep' && e.x.comp === w.x.comp && e.t - w.t >= TURN_MIN && e.t - w.t <= TURN_MAX)) shunts.push({ kind: 'in', t: w.t - P, x: w.x });
  // ook een aankomst van dag 1 die pas op dag 2 gekoppeld had kunnen worden, telt correct: hierboven alleen dag 1
  shunts.sort((a, b) => a.t - b.t);
  // stellen per soort bij het begin van de dag: minimum zodat er nooit een tekort is
  const start = {}, cur = {};
  for (const s of shunts) { const c = s.x.comp; cur[c] = (cur[c] || 0) + (s.kind === 'uit' ? -1 : 1); start[c] = Math.max(start[c] || 0, -cur[c]); }
  // rangeerritten: pad, duur en rijweg zonder conflict
  const DIM = DEPOT_DIM, out = [];
  for (const s of shunts) {
    const r = s.x.r, pr = r.pr, len = pr.len;
    const sStop = s.kind === 'uit' ? pr.s0 : pr.s0 + r.dir * pr.D; // kop aan het perron
    out.push({ ...s, comp: s.x.comp, sv: r.sv, r, k: s.x.k, len, sStop });
  }
  // opstelsporen toewijzen: 4 sporen, wat niet past staat 'achteraan' (telt mee, wordt niet getoond)
  const plan = { D, shunts: out, start, days: 0, compSv: {} };
  for (const q of [...deps, ...arrs]) plan.compSv[q.comp] ||= q.r.sv;
  assignSidings(plan);
  for (const s of out) placeShunt(plan, s, RUNS, h);
  return plan;
}
function assignSidings(plan) {
  const N = DEPOT_DIM.NTRACK, sid = new Array(N).fill(null), extra = [];
  let id = 0;
  for (const [c, n] of Object.entries(plan.start)) for (let i = 0; i < n; i++) { const set = { id: `${plan.D.id}#${++id}`, comp: c }; const f = sid.indexOf(null); if (f >= 0) sid[f] = set; else extra.push(set); }
  plan.initial = sid.map(x => x && { ...x }); plan.initialExtra = extra.map(x => ({ ...x }));
  for (const s of plan.shunts) {
    if (s.kind === 'uit') {
      let k = sid.findIndex(x => x && x.comp === s.comp);
      if (k >= 0) { s.set = sid[k]; s.siding = k; sid[k] = extra.length && extra[0].comp === s.comp ? extra.shift() : null; if (sid[k]) s.refill = sid[k]; }
      else { const j = extra.findIndex(x => x.comp === s.comp); s.set = j >= 0 ? extra.splice(j, 1)[0] : { id: `${plan.D.id}#${++id}`, comp: s.comp }; s.siding = 0; s.hidden = true; }
    } else {
      const f = sid.indexOf(null), set = { id: `${plan.D.id}#${++id}`, comp: s.comp };
      if (f >= 0) { s.siding = f; sid[f] = set; } else { extra.push(set); s.siding = 0; s.hidden = true; }
      s.set = set;
    }
  }
}
// pad en tijden van een rangeerrit, met een rijweg zonder conflict met de dienstregeling
function placeShunt(plan, s, RUNS, h) {
  const D = plan.D;
  s.path = shuntPath(D, s.siding, s.sStop, s.kind === 'in', s.len);
  s.dur = s.path.len / V + 20;
  // uitrukken: aankomen aan het perron uiterlijk wanneer de trein van de dienstregeling verschijnt (t - 120 s);
  // inrukken: vertrekken van het perron zodra de trein van de dienstregeling verdwijnt (t + 60 s)
  const base = s.kind === 'uit' ? s.t - PRE - s.dur : s.t + POST;
  s.shift = 0;
  for (let tries = 0; tries < 40; tries++) {
    const t0 = base + (s.kind === 'uit' ? -1 : 1) * s.shift;
    if (!conflict(D, s, t0, RUNS, h)) break;
    s.shift += 30;
  }
  s.t0 = base + (s.kind === 'uit' ? -1 : 1) * s.shift; s.t1 = s.t0 + s.dur;
}
// rangeerrit op tijd tau na zijn vertrek: plaats op het pad (kop, in de richting van de remise)
export function shuntPos(s, tau) {
  const park = s.path.parkU ?? s.path.len - 12;
  const P0 = s.kind === 'uit' ? park : s.path.u0, P1 = s.kind === 'uit' ? s.path.u0 : park, D = Math.abs(P1 - P0);
  const x = Math.max(0, Math.min(D, (tau - 10) * V)); // 10 s stilstaan aan het begin (rijweg, deuren), dan rijden
  return P0 + Math.sign(P1 - P0) * x;
}
function conflict(D, s, t0, RUNS, h) {
  const L = D.L;
  for (let tau = 0; tau <= s.dur; tau += 10) {
    const u = shuntPos(s, tau), m = s.path.main(u); if (!m) continue; // op het opstelterrein: geen conflict met de lijn
    const now = t0 + tau;
    for (const r of RUNS) {
      if (r.pr.L !== L && !(r.pr.L.route && r.pr.L.route.A === L)) continue;
      const n = Math.round(P / r.h);
      for (let k = 0; k < n; k++) {
        if (r === s.r && k === s.k) continue;
        // met de vertraging van die rit (dezelfde als in de dienstregeling, js/rail.js delayOf/effDelay): een vertraagde
        // trein staat later op de lijn (zonder deze correctie botste een uitrukrit soms met een vertraagde trein)
        const dl = h.effDelay ? h.effDelay(r, k, now - (r.off + k * r.h)) : h.delayOf(r, k);
        let t = now - (r.off + k * r.h + dl); t = ((t % P) + P) % P; if (t > P / 2) t -= P;
        if (t < -PRE || t > r.pr.T + POST) continue;
        if (!h.runs(r, k)) continue;
        const [x] = h.posAt(r.pr, t), sr = r.pr.s0 + r.dir * x;
        if (r.pr.L.route) { const lo = r.pr.L.route.locate(sr); if (!lo.L || lo.L !== L) continue; if (lo.dir !== m.dir && !m.both) continue; if (Math.abs(lo.s - m.s) < CLEAR + r.pr.len) return true; continue; }
        if (r.dir !== m.dir && !m.both) continue;
        if (Math.abs(sr - m.s) < CLEAR + r.pr.len) return true;
      }
    }
  }
  return false;
}
// stand van de remise op tijdstip now (seconden sinds middernacht): stellen per opstelspoor en de lopende rangeerritten
export function depotState(plan, now) {
  const N = DEPOT_DIM.NTRACK, sid = plan.initial.map(x => x), moving = [];
  for (const s of plan.shunts) {
    // overdracht: het uitrukkende stel verdwijnt zodra de trein van de dienstregeling aan het perron verschijnt (vertrek − 120 s);
    // vertrok het eerder (rijweg), dan wacht het tot dan aan het perron. Inrukken begint waar de aangekomen trein verdwijnt
    // (aankomst + 60 s) en wacht daar als de rijweg pas later vrij is.
    if (s.kind === 'uit') {
      if (now < s.t0) continue;
      if (now < s.t - PRE) { moving.push({ s, u: shuntPos(s, now - s.t0) }); if (!s.hidden) sid[s.siding] = s.refill || null; continue; }
      if (!s.hidden) sid[s.siding] = s.refill || null;
    } else {
      if (now < s.t + POST) continue;
      if (now < s.t1) { moving.push({ s, u: shuntPos(s, Math.max(0, now - s.t0)) }); continue; }
      if (!s.hidden) sid[s.siding] = s.set;
    }
  }
  let total = 0; for (const n of Object.values(plan.start)) total += n;
  for (const s of plan.shunts) if (s.kind === 'uit' ? now >= s.t0 : now >= s.t1) total += s.kind === 'uit' ? -1 : 1;
  return { sidings: sid.slice(0, N), moving, total: Math.max(0, total) };
}
export const SHUNT_SPEED = V;
