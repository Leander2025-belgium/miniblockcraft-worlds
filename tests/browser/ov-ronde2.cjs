// OV ronde 2 in de browser:
// Alpen: bovenleiding, seinpalen, wissels; zelf een trein besturen (dashboard met hendels, 4 camera's, buitenkant
// zichtbaar bij de buitencamera's); reisplanner (van/naar, wandelen, overstappen) en navigatie.
// Greenisland: metrostation met lift van het perron naar de straat en een vertrekbord met echte vertrektijden.
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
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15 })));
  const R = {};
  // ---------- Alpen ----------
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  R.alpen = await p.evaluate(async () => {
    const g = window.blokGame(); g.running = false; cancelAnimationFrame(g.raf);
    const Rl = g.alpRail, out = {};
    let off = 0; const realNow = Date.now; Date.now = () => realNow() + off;
    Rl.update(0.05, 1);
    out.infra = { ...Rl.infra.counts };
    // een trein zoeken die stilstaat en zelf besturen
    let tr = null;
    for (let i = 0; i < 300 && !tr; i++) { Rl.update(0.05, 1); for (const a of Rl.active) if (a.v < 0.05 && a.t > 20 && a.t < a.run.pr.T && !a.run.sv.freight) { const t = Rl.trains.get(a.id); if (t && t.cars.some(c => c.d.cab)) { tr = t; break; } } if (!tr) off += 20000; }
    if (!tr) return { ...out, error: 'geen trein' };
    const c = tr.cars.find(c => c.d.cab) || tr.cars[0];
    Rl.startDriving(tr, c);
    const pt = Rl.player;
    out.cabine = !!g.drive;
    // tractie geven en rijden
    g.keys.add('KeyW'); for (let i = 0; i < 60; i++) { g.drive.update(0.05); Rl.update(0.05, 1); } g.keys.delete('KeyW');
    for (let i = 0; i < 40; i++) { g.drive.update(0.05); Rl.update(0.05, 1); }
    out.snelheid = Math.round(pt.v * 3.6); out.tractie = +pt.throttle.toFixed(2);
    g.drive.t = 1; g.drive.update(0.05);
    const hud = document.getElementById('drive-hud');
    out.dashboard = { hendels: hud.querySelectorAll('.lever').length, sein: !!hud.querySelector('.sig-lamp'), meter: !!hud.querySelector('svg') };
    // camera's
    const cams = [];
    for (let i = 0; i < 4; i++) { g.drive.cycleCam(); g.drive.placeCamera(g.camera); cams.push({ cam: g.drive.cam, buiten: tr.cars[0].shell.g.visible }); }
    out.cameras = cams;
    // noodrem
    g.keys.add('Space'); g.drive.update(0.05); g.keys.delete('Space'); out.noodrem = pt.emergency;
    for (let i = 0; i < 200 && pt.v > 0; i++) { g.drive.update(0.05); Rl.update(0.05, 1); }
    out.stil = pt.v === 0;
    g.drive.exit(); g.leaveVessel?.();
    // reisplanner
    const rail = await import('./js/rail.js'), ni = rail.netInfo(), names = ni.STATIONS_ALL.map(s => s.name);
    Rl.tab = 'route'; Rl.renderPanel?.();
    const r = rail.plan(names[0], names[names.length - 1], rail.railClock());
    out.planner = r ? { stappen: r.legs.length, wandelen: r.legs.filter(l => l.walk).length, ritten: r.legs.filter(l => !l.walk).map(l => l.run.sv.id) } : null;
    out.periode = rail.periodOf(rail.railClock());
    Rl.navTo(ni.STATIONS_ALL[0]); Rl.updateNav();
    out.navigatie = document.getElementById('nav-hud').textContent;
    Date.now = realNow;
    return out;
  });
  // ---------- Greenisland: metrostation ----------
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => document.getElementById('btn-gi-play').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail; }, null, { timeout: 120000 });
  await p.evaluate(async () => { const g = window.blokGame(), m = await import('./js/greenisland.js'), L = m.LINE.M1, st = L.stations[2], q = L.at((st.s0 + st.s1) / 2); g.player.pos.set(q.x, q.y + 3, q.z); g.player.fly = true; g.updateTiles(true); window.__st = { name: st.name, x: q.x, y: q.y, z: q.z }; });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.tiled.inFlight === 0 && g.queue.length < 30; })) break; }
  R.metro = await p.evaluate(async () => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'), S = window.__st, out = { station: S.name };
    let lift = null, sign = null;
    for (let dz = -60; dz <= 60; dz++) for (let dx = -60; dx <= 60; dx++) for (let dy = -2; dy <= 6; dy++) {
      const x = Math.floor(S.x) + dx, y = Math.round(S.y) + dy, z = Math.floor(S.z) + dz, bl = g.world.get(x, y, z);
      if (bl === B.ELEVATOR && !lift && dy <= 3) lift = { x, y, z };
      if (bl === B.SIGN && !sign) sign = { x, y, z, b: bl };
    }
    out.lift = !!lift; out.bord = !!sign;
    if (sign) { let txt = ''; const t0 = g.toast; g.toast = (t) => { txt = t; }; actionFor(g, sign).run(); g.toast = t0; out.bordTekst = txt.split('\n').slice(0, 3); }
    if (lift) {
      // op het liftblok staan en springen: naar de straat
      g.player.fly = false; g.player.pos.set(lift.x + 0.5, lift.y + 1.01, lift.z + 0.5); g.player.vel.set(0, 0, 0); g.player.onGround = true; g.upWas = false;
      const y0 = g.player.pos.y; g.keys.add('Space'); g.paused = false; g.touch = true; g.updateMain(0.016); g.keys.delete('Space'); g.updateMain(0.016);
      out.liftOmhoog = Math.round(g.player.pos.y - y0);
    }
    return out;
  });
  console.log('ov-ronde2:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
