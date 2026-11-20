// Automatische treinen over de overloopwissels van Greenisland (TERRANOVA 14, js/railroute.js):
// - de doorgaande diensten S11 en S12 staan in de dienstregeling en hun spoor loopt naadloos door (geen sprongen);
// - over een hele dag (elke 5 s): elke rit van S11/S12 rijdt echt over het verbindingsspoor van zijn wissel;
// - zolang een trein op het verbindingsspoor staat, staat geen enkele andere trein op een conflicterend stuk
//   (lijn A rond de wissel in beide richtingen, lijn B rond de aansluiting): geen botsing door de rijweginstelling.
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { NET } = await import('../js/rail-green.js');
const R = await import('../js/rail.js');
R.useNet(NET);
const through = R.RUNS.filter(r => r.sv.through);
let fail = 0; const out = { diensten: through.map(r => r.sv.id), sprong: 0, overWissel: {}, conflicten: 0, voorbeeld: null };
if (through.length < 2) { console.log('FOUT: doorgaande diensten ontbreken', out.diensten); process.exit(1); }
for (const r of through) { const L = r.pr.L; let prev = null; for (let s = 0; s <= L.len; s += 2) { const q = L.at(s); if (prev) out.sprong = Math.max(out.sprong, Math.hypot(q.x - prev.x, q.z - prev.z)); prev = q; } }
if (out.sprong > 2.6) { fail++; console.log('FOUT: sprong in het spoor van een doorgaande route', out.sprong); }
const passed = new Map();
for (let now = 0; now < 86400; now += 5) {
  const act = R.activeAt(now);
  for (const a of act) {
    const Ro = a.run.pr.L.route; if (!Ro) continue;
    const s = a.run.pr.s0 + a.run.dir * a.x, m = Ro.locate(s);
    if (a.hold && a.hold.dep) (out.laterVertrek || (out.laterVertrek = new Map())).set(a.id, a.hold.dep);
    if (a.held) {
      // wachtend voor het inrijsein: niemand mag op hetzelfde spoor in de trein rijden
      out.wachtSec = (out.wachtSec || 0) + 5; out.wachtRitten = (out.wachtRitten || new Set()).add(a.id);
      const len = a.run.pr.len, lo = Math.min(m.s, m.s - m.dir * len), hi = Math.max(m.s, m.s - m.dir * len);
      for (const b of act) { if (b === a || b.run.pr.L.route) continue; const sb = b.run.pr.s0 + b.run.dir * b.x, lb = b.run.pr.len || 120;
        if (b.run.pr.L === m.L && b.run.dir === m.dir && Math.max(sb, sb - b.run.dir * lb) > lo - 20 && Math.min(sb, sb - b.run.dir * lb) < hi + 20) { out.conflicten++; out.voorbeeld ||= { tijd: now, a: a.id, b: b.id, waar: 'wachtend voor het sein' }; } }
    }
    if (!m.X) continue;
    const X = m.X; passed.set(a.id, X.id);
    const zA0 = Math.min(X.sA, X.sA + X.aDir * X.len) - 30, zA1 = Math.max(X.sA, X.sA + X.aDir * X.len) + 30;
    for (const b of act) {
      if (b === a) continue;
      const len = b.run.pr.len || 120, sb = b.run.pr.s0 + b.run.dir * b.x;
      const mb = b.run.pr.L.route ? b.run.pr.L.route.locate(sb) : { L: b.run.pr.L, s: sb, dir: b.run.dir };
      if (mb.X) { if (mb.X === X) { out.conflicten++; out.voorbeeld ||= { tijd: now, a: a.id, b: b.id, waar: 'zelfde wissel' }; } continue; }
      const lo = Math.min(mb.s, mb.s - mb.dir * len), hi = Math.max(mb.s, mb.s - mb.dir * len);
      const hit = (mb.L === X.A && hi > zA0 && lo < zA1) || (mb.L === X.B && hi > X.sBend - 30 && lo < X.sBend + 30);
      if (hit) { out.conflicten++; out.voorbeeld ||= { tijd: now, a: a.id, b: b.id, lijn: mb.L.id, s: Math.round(mb.s) }; }
    }
  }
}
for (const [, x] of passed) out.overWissel[x] = (out.overWissel[x] || 0) + 1;
if (!out.overWissel.X1 || !out.overWissel.X2) { fail++; console.log('FOUT: niet over beide wissels gereden', JSON.stringify(out.overWissel)); }
if (out.conflicten) { fail++; console.log('FOUT: conflicterende rijwegen', out.conflicten, JSON.stringify(out.voorbeeld)); }
console.log(`${out.diensten.join(', ')}: ${Object.entries(out.overWissel).map(([x, n]) => `${n} ritten over ${x}`).join(', ')} per dag, 0 conflicten: ${!out.conflicten}, ${out.wachtRitten ? out.wachtRitten.size : 0} ritten wachtten voor het inrijsein (samen ${Math.round((out.wachtSec || 0) / 60)} min), ${out.laterVertrek ? out.laterVertrek.size : 0} ritten later vertrokken voor een vrije rijweg, grootste stap ${out.sprong.toFixed(2)} m per 2 m`);
process.exit(fail ? 1 : 0);
