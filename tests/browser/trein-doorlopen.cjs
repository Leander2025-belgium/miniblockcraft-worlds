const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGE ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]');
  await p.click('#btn-berg');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 90000 });
  // stap voor stap simuleren zonder te tekenen (de testbrowser tekent traag)
  const r = await p.evaluate(async () => {
    const g = window.blokGame(); g.touch = true; g.paused = false; g.showOverlay(null); g.running = false; cancelAnimationFrame(g.raf);
    const R = g.alpRail, out = {};
    const step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { R.update(dt, 1); if (g.aboard && g.player.loc && !g.drive) { g.aboard.toWorld(g.player.loc, g.player.pos); } g.update(dt); } };
    // stilstaande trein met minstens 3 rijtuigen om in te lopen
    let tr = null; let off = 0; const realNow = Date.now; Date.now = () => realNow() + off;
    for (let tries = 0; tries < 400 && !tr; tries++) {
      R.update(0, 1);
      for (const a of R.active) { if (a.v < 0.1 && a.t > 0 && a.t < a.run.pr.T && !a.run.sv.freight && a.run.sv.cars.length >= 4) { const L = a.run.pr.L, s = a.run.pr.s0 + a.run.dir * a.x, q = L.at(s); g.player.pos.set(q.x, q.y + 4, q.z); R.update(0, 1); tr = R.trains.get(a.id); if (tr) break; } }
      if (!tr) off += 20000;
    }
    if (!tr) return { error: 'geen trein' };
    const c = tr.cars.find(c => c.d.walk);
    const w = c.body.toWorld({ x: -1.4, y: 1.1, z: c.d.doors[0] + 0.5 }, g.player.pos.clone()); g.player.pos.set(w.x, w.y + 0.02, w.z);
    out.board = R.board(); out.train = tr.name; out.car0 = g.aboard && g.aboard.i;
    // naar achteren door de trein lopen (lokaal -z)
    g.player.yaw = g.aboard.yaw; g.keys.add('KeyW');
    const cars = [];
    for (let i = 0; i < 40; i++) { step(10); cars.push(g.aboard ? g.aboard.i : -1); }
    g.keys.delete('KeyW');
    out.cars = [...new Set(cars)]; out.loc = g.player.loc && g.player.loc.toArray().map(v => +v.toFixed(2));
    out.sit = R.sit(); out.seated = g.player.seated;
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('fouten:', errs.length ? errs.join('\n') : 'geen');
  await b.close();
})();
