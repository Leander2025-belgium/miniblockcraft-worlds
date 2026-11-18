// Treinsimulatie (Greenisland): massa en lengte van de trein, optrekken tot 60 km/h, remweg vanaf 60 km/h, wielslip
// bij sneeuw en zand strooien, klikbare hendel op het dashboard, noodrem.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => document.getElementById('btn-gi-play').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 180000 });
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), Rl = g.alpRail, rail = await import('./js/rail.js'); g.running = false; cancelAnimationFrame(g.raf);
    let off = 0; const rn = Date.now; Date.now = () => rn() + off;
    let tr = null; for (let i = 0; i < 100 && !tr; i++) { Rl.update(0.05, 1); tr = [...Rl.trains.values()].find(t => t.cars.some(c => c.d.cab) && t.a && !t.a.run.sv.freight && t.cars.length >= 3); if (!tr) off += 30000; }
    if (!tr) return { error: 'geen trein' };
    Rl.startDriving(tr, tr.cars.find(c => c.d.cab)); const pt = Rl.player, out = { trein: tr.name, ...rail.trainPhysics(tr) };
    const start = { L: pt.L, s: pt.s, dir: pt.dir };
    const run = (w) => {
      Object.assign(pt, start); pt.trail = null; // elke meting op dezelfde plek (zelfde helling)
      Rl.active = []; // geen andere treinen: geen rood sein (anders remt de treinbeïnvloeding)
      g.curWeather = w; pt.v = 0; pt.brake = 0; pt.throttle = 0; pt.emergency = false; pt.doors = false; pt.sandT = 0;
      g.keys.add('KeyW'); let t = 0, slip = false; for (; t < 150 && pt.v < 16.67; t += 0.1) { g.drive.update(0.1); slip = slip || pt.slip; } g.keys.delete('KeyW');
      const s0 = pt.s; pt.throttle = 0; for (let k = 0; k < 900 && pt.v > 0; k++) { pt.brake = 1; Rl.drivePhys(0.1); }
      return { tot60: +t.toFixed(1), wielslip: slip, remvertraging: +pt.bMax.toFixed(2), remweg60berekend: Math.round(16.67 ** 2 / (2 * pt.bMax)), remweg60gemeten: Math.round(Math.abs(pt.s - s0)) };
    };
    out.droog = run('clear'); out.sneeuw = run('snow');
    // zand bij sneeuw: met zand minder slip
    Rl.active = []; g.curWeather = 'snow'; pt.v = 0; g.drive.key('KeyZ'); g.keys.add('KeyW'); let sl = 0; for (let i = 0; i < 60; i++) { g.drive.update(0.1); if (pt.slip) sl++; } g.keys.delete('KeyW'); out.slipMetZand = sl;
    // klikbare hendel: tractiehendel halverwege aanklikken
    g.drive.t = 1; g.drive.update(0.01); pt.throttle = 0;
    const lv = document.querySelector('#drive-hud .lever[data-k="t"]'), r = lv.getBoundingClientRect();
    lv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.5, buttons: 1 }));
    out.hendelKlik = +pt.throttle.toFixed(2);
    document.querySelector('#drive-hud .cab-btn[data-k="nood"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    out.noodremKnop = pt.emergency;
    out.dashboard = (document.querySelector('#drive-hud .small')?.textContent || '').replace(/\s+/g, ' ').match(/\d+ t · \d+ m · kleefkracht [\d.]+[^·]*· remweg \d+ m/)?.[0] || null;
    Date.now = rn; g.drive.exit();
    return out;
  });
  console.log('treinsim:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
