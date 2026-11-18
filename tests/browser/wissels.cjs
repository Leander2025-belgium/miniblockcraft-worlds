// Overloopwissels tussen lijnen (Greenisland): zelf een trein besturen van IC1 via het verbindingsspoor naar S1.
// Controle: de trein komt echt op S1, de rijtuigen blijven aan elkaar (geen gaten) terwijl ze over de wissel rijden,
// de snelheid op het verbindingsspoor is begrensd, de wisseltongen liggen om.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => document.getElementById('btn-gi-play').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail; }, null, { timeout: 120000 });
  const R = await p.evaluate(async () => {
    const g = window.blokGame(); g.running = false; cancelAnimationFrame(g.raf);
    const Rl = g.alpRail, rail = await import('./js/rail.js'), ni = rail.netInfo(), X = ni.JUNCTIONS, out = { wissels: X.length, lijst: X.map(c => c.A.id + '→' + c.B.id) };
    const c = X.find(q => q.A.id === 'IC1') || X[0]; if (!c) return out;
    let tr = null, off = 0; const rn = Date.now; Date.now = () => rn() + off;
    for (let i = 0; i < 200 && !tr; i++) { Rl.update(0.05, 1); for (const a of Rl.active) { const t = Rl.trains.get(a.id); if (t && t.cars.some(k => k.d.cab) && !a.run.sv.freight) { tr = t; break; } } if (!tr) off += 30000; }
    if (!tr) return { ...out, error: 'geen trein' };
    Rl.startDriving(tr, tr.cars.find(k => k.d.cab) || tr.cars[0]);
    const pt = Rl.player; pt.L = c.A; pt.dir = c.aDir; pt.s = c.sA - c.aDir * 500; pt.sIn = undefined; pt.trail = null;
    const q0 = c.A.at(pt.s); g.player.pos.set(q0.x, q0.y + 3, q0.z);
    g.drive.update(0.05); g.drive.key('KeyD'); out.gezet = !!pt.jSel;
    const seq = []; let maxGap = 0, maxV = 0, onConn = 0, tong = null;
    for (let i = 0; i < 2400; i++) {
      pt.v = Math.min(pt.v + 0.3, 10); pt.throttle = 0; pt.brake = 0;
      g.drive.update(0.1); Rl.update(0.1, 1);
      const id = pt.L.connector ? 'verbinding' : pt.L.id; if (seq[seq.length - 1] !== id) seq.push(id);
      if (pt.L.connector) { onConn++; if (onConn === 60) { g.drive.t = 1; g.drive.update(0.01); out.hudVerbinding = (document.getElementById('drive-hud')?.textContent || '').includes('verbindingsspoor'); } maxV = Math.max(maxV, pt.v); if (!tong) tong = Rl.infra.jsw.filter(w => w.c === c).map(w => +w.throw.toFixed(2)); }
      // afstand tussen opeenvolgende rijtuigen (midden tot midden) min. de halve lengtes = koppelafstand
      const cs = pt.tr.cars; for (let k = 1; k < cs.length; k++) { const a = cs[k - 1], b2 = cs[k]; const d = Math.hypot(a.grp.position.x - b2.grp.position.x, a.grp.position.z - b2.grp.position.z) - (a.d.L + b2.d.L) / 2; maxGap = Math.max(maxGap, d); }
      if (seq.length >= 3 && !pt.trail && (pt.s - c.sBend) * pt.dir > 300) break;
    }
    Date.now = rn;
    Object.assign(out, { volgorde: seq, nuOp: pt.L.id, koppelMax: +maxGap.toFixed(2), opVerbinding: onConn, vmaxVerbinding: Math.round(maxV * 3.6), tongen: tong });
    g.drive.exit(); g.leaveVessel?.();
    return out;
  });
  console.log('wissels:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
