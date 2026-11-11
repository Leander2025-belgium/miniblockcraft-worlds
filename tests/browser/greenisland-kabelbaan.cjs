// Greenisland kabelbaan: in het dalstation van de Zilvergrat-Gondelbaan instappen (toggleRide) en omhoog rijden.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push('CONSOLE ' + m.text()); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForTimeout(1000); await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.evaluate(async () => {
    const g = window.blokGame(), A = await import('./js/greenisland.js'), L = A.LIFTS.find(l => l.kind === 'gondola');
    g.player.pos.set(L.ax + L.ux * 4, L.ya + 1.1, L.az + L.uz * 4); g.player.fly = false; g.tiled.aheadKey = null; g.updateTiles(true); g.touch = true; g.paused = false;
  });
  await p.waitForTimeout(8000);
  const r0 = await p.evaluate(() => { const g = window.blokGame(); g.toggleRide(); return { rit: !!(g.ride && g.ride.lift), naam: g.ride && g.ride.lift && g.ride.lift.name, y: Math.round(g.player.pos.y) }; });
  await p.waitForTimeout(15000);
  const r1 = await p.evaluate(() => { const g = window.blokGame(); return { rit: !!g.ride, s: g.ride ? Math.round(g.ride.s) : null, y: Math.round(g.player.pos.y), info: g.rideInfo || '' }; });
  console.log('kabelbaan:', JSON.stringify({ start: r0, na15s: r1 }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
