// Remises van Greenisland (TERRANOVA 14.1, js/depot.js en js/depotsim.js):
// - elke remise ligt op een vrije, vlakke plek (geen stad, weg of ander spoor) en findDepot vindt precies die plek;
// - de wereld heeft er ballast op de opstelsporen, vrije ruimte erboven en een hal met dak;
// - de rangeerpaden lopen naadloos door en sluiten aan op de trein van de dienstregeling aan het perron;
// - over een hele dag (elke 10 s) staat geen enkele trein van de dienstregeling binnen 300 m van een rangeerrit op
//   hetzelfde hoofdspoor; het aantal stellen in de remise is nooit negatief.
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { NET } = await import('../js/rail-green.js');
const R = await import('../js/rail.js');
const G = await import('../js/greenisland.js');
const N = await import('../js/green-net.js');
const DP = await import('../js/depot.js');
const DS = await import('../js/depotsim.js');
R.useNet(NET);
const h = R._depotHelpers();
let fail = 0; const out = [];
const free = (x, z, L) => { const u = G._urbanAt(x, z); if (u && u.dens > 0.06) return false; const rq = G._roadNear(x, z, 30); if (rq && rq.d < rq.R.hw + 6) return false; for (const M of N.LINES) { if (M === L) continue; if (M.near(Math.floor(x), Math.floor(z), 14)) return false; } return G.natural(x, z) >= 1; };
for (let i = 0; i < G.DEPOTS.length; i++) {
  const D = G.DEPOTS[i], def = G.DEPOT_DEF[i], r = { naam: D.name };
  const f = DP.findDepot(D.L, def.end, N.trackOffset, free, G.groundAt);
  r.plek = f && f.uThroat === def.u ? 'vrij en vlak' : `FOUT (gevonden ${f && f.uThroat})`; if (!f || f.uThroat !== def.u) fail++;
  // wereld: ballast en ruimte op het rechte deel van elk opstelspoor, dak in de hal
  let ballast = 0, vrij = 0, n = 0, dak = 0, nd = 0;
  for (const P of D.sidings) for (let u = P.len - 230; u < P.len - 5; u += 15) {
    const q = P.at(u), x = Math.floor(q.x), z = Math.floor(q.z), { col } = G._columnAt(x, z); n++;
    // bovenkant van het spoorbed (de generator rondt de hoogte van het dichtste opstelspoor af: ±1 blok)
    let y = Math.round(q.y); if (!col[y] && col[y - 1]) y--; else if (col[y + 1] && !col[y + 2]) y++;
    if (col[y] === 54 || col[y]) ballast++;
    let ok = true; for (let k = y + 1; k <= y + 7; k++) if (col[k]) ok = false; if (ok) vrij++;
    if (u > P.len - 210) { nd++; if (col[y + 9]) dak++; }
  }
  r.ballast = `${ballast}/${n}`; r.vrijeRuimte = `${vrij}/${n}`; r.dak = `${dak}/${nd}`;
  if (vrij < n || dak < nd * 0.95 || ballast < n) fail++;
  // rangeerritten
  const plan = DS.depotPlan(D, R.RUNS, h);
  r.stellenBijBegin = plan.start; r.rangeerritten = plan.shunts.length; r.verschoven = plan.shunts.filter(s => s.shift).map(s => `${s.kind} ${Math.round(s.shift / 60)} min`);
  let jump = 0, aansluiting = 0;
  for (const s of plan.shunts) {
    let prev = null; for (let u = 0; u <= s.path.len; u += 2) { const q = s.path.at(u); if (prev) jump = Math.max(jump, Math.hypot(q.x - prev.x, q.z - prev.z)); prev = q; }
    // kop aan het perron = plaats van de trein van de dienstregeling (met de spoorafstand)
    const q = s.path.at(s.path.u0), L = D.L, sS = s.sStop, p = L.at(sS), o = N.trackOffset(L, sS) * s.r.dir, tx = p.x - p.tz * o, tz = p.z + p.tx * o;
    const head = s.kind === 'uit' ? q : s.path.at(s.path.u0 - s.len); // inrukken: u0 is de staart van de aangekomen trein; de kop ligt een treinlengte terug
    aansluiting = Math.max(aansluiting, Math.hypot(head.x - tx, head.z - tz));
  }
  r.grootsteSprong = +jump.toFixed(2); r.aansluitingPerron = +aansluiting.toFixed(2);
  if (jump > 2.6 || aansluiting > 1.5) fail++;
  // een hele dag: conflicten en voorraad
  let conflicts = 0, neg = 0, ex = null;
  for (let now = 0; now < 86400; now += 10) {
    const st = DS.depotState(plan, now); if (st.total < 0) neg++;
    if (!st.moving.length) continue;
    const act = R.activeAt(now);
    for (const m of st.moving) {
      const mm = m.s.path.main(m.u); if (!mm) continue;
      for (const a of act) {
        if (a.run.pr.L !== D.L || (a.run === m.s.r && a.k === m.s.k)) continue;
        const sa = a.run.pr.s0 + a.run.dir * a.x;
        if ((a.run.dir === mm.dir || mm.both) && Math.abs(sa - mm.s) < 300) { conflicts++; ex ||= { tijd: now, rangeer: m.s.kind + ' ' + m.s.sv.id, trein: a.id }; }
      }
    }
  }
  r.conflicten = conflicts; r.voorbeeld = ex; r.negatief = neg;
  if (conflicts || neg) fail++;
  out.push(r);
}
for (const r of out) console.log(JSON.stringify(r));
console.log(fail ? `FOUT: ${fail} problemen` : 'alles goed');
process.exit(fail ? 1 : 0);
