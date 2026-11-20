// TERRANOVA 14.2 — metroremise met kopsporen in een tunnelhal (js/depot.js tailDepotAt), Greenisland. Eerder: remises in Greenisland (js/depot.js, js/depotsim.js): 's nachts staan de treinstellen op de
// opstelsporen in de hal, een uitrukrit rijdt van de remise naar het perron en sluit aan op de trein van de
// dienstregeling; het depot-tabblad toont de remises. De klok wordt verzet met een verschuiving op Date.now.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOT = process.env.SHOT || null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // klok: lokale tijd op een gekozen uur (window.__setHour)
  await p.addInitScript(() => { const o = Date.now.bind(Date); window.__off = 0; Date.now = () => o() + window.__off; window.__setHour = (h) => { const t = o(), loc = ((t / 1000 - new Date().getTimezoneOffset() * 60) % 86400 + 86400) % 86400; window.__off = ((h * 3600 - loc) % 86400 + 86400) % 86400 * 1000; }; });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, cycle: false, quality: 'fast', weather: 'clear', weatherSet: true })); window.__setHour(3); });
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 180000 });
  await p.evaluate(() => window.__setHour(3));
  // in de tunnelhal van Metroremise Munkbay-Noord (M1), 's nachts: de stellen staan op de kopsporen
  const where = await p.evaluate(async () => {
    const g = window.blokGame(), G = await import('./js/greenisland.js'), D = G.DEPOTS.find(d => d.name.startsWith('Metroremise Munkbay-Noord'));
    const P = D.sidings[1], q = P.at(P.len - 6), t = P.at(P.len - 120);
    const pl = g.player; pl.fly = true; pl.pos.set((q.x + D.sidings[2].at(D.sidings[2].len - 6).x) / 2, q.y + 2.6, (q.z + D.sidings[2].at(D.sidings[2].len - 6).z) / 2);
    pl.yaw = Math.atan2(-(t.x - pl.pos.x), -(t.z - pl.pos.z)); pl.pitch = -0.05;
    g.tiled.aheadKey = null; g.updateTiles(true);
    return { x: Math.round(q.x), z: Math.round(q.z), y: Math.round(q.y) };
  });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 20; })) break; }
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const g = window.blokGame(); g.showOverlay(null); });
  const R = { plek: where };
  R.nacht = await p.evaluate(() => { const g = window.blokGame(), T = [...g.alpRail.trains.entries()].filter(([k]) => k.startsWith('dep:T:M1')); return { opgesteld: T.length, soort: T.map(([, t]) => t.sv.cars[0]) }; });
  R.ruimte = await p.evaluate(() => { const g = window.blokGame(), q = g.player.pos; let lucht = 0; for (let y = -1; y <= 3; y++) if (!g.world.solidAt(Math.floor(q.x), Math.floor(q.y + y), Math.floor(q.z))) lucht++; return lucht; });
  if (SHOT) await p.screenshot({ path: SHOT, timeout: 240000 });
  console.log('metroremise:', JSON.stringify(R));
  const ok = R.nacht.opgesteld >= 2 && R.nacht.soort.every(s => s === 'mCab') && R.ruimte >= 4;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
