const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  // luchthaven en zee
  await p.evaluate(async () => { const g = window.blokGame(); const A = await import('./js/greenisland.js'); g.running = false; const q = g.player; q.pos.set(A.AIRPORT.cx, 80, A.AIRPORT.cz); q.fly = true; g.tiled.aheadKey = null; g.updateTiles(true); g.start?.(); g.running = true; g.touch = true; g.paused = false; });
  await p.waitForTimeout(25000);
  console.log('luchthaven:', JSON.stringify(await p.evaluate(() => { const g = window.blokGame(); return { banen: g.airports.runways.length, gates: g.airports.gates.length, vliegtuigen: g.airports.planes.length, tiles: g.world.tiles.size }; })));
  await p.evaluate(() => { const g = window.blokGame(), q = g.player; q.pos.set(118130, 30, 46640); q.fly = true; g.tiled.aheadKey = null; g.updateTiles(true); });
  await p.waitForTimeout(30000);
  console.log('zee:', JSON.stringify(await p.evaluate(() => { const g = window.blokGame(); return { zeeLengte: Math.round(g.traffic.net.len.sea || 0), schepen: g.ships ? g.ships.list.size : -1, agents: g.traffic.agents.filter(a => a.kind === 'ship').length, place: g.ui.place.textContent }; })));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
