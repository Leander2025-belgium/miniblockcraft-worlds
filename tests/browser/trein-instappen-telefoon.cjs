const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGE ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]');
  await p.click('#btn-berg');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 90000 });
  // op perron 2-3 (eilandperron) van de Hauptbahnhof gaan staan
  await p.evaluate(async () => { const A = await import('./js/alpen.js'); const g = window.blokGame(); g.touch = true; g.paused = false; g.showOverlay(null); const q = g.player, H = A.HBF, pt = H.L.at(H.mid + 40); q.pos.set(pt.x - pt.tz * -7.5, H.y + 2.1, pt.z + pt.tx * -7.5); q.fly = false; g.tiled.aheadKey = null; g.updateTiles(true); });
  await p.waitForTimeout(4000);
  const btn = await p.evaluate(() => ({ show: document.getElementById('t-drive').classList.contains('show'), here: window.blokGame().alpRail.stationHere()?.name }));
  console.log('knop', JSON.stringify(btn));
  await p.evaluate(() => { document.getElementById('t-drive').click(); document.getElementById('dc-ride').click(); });
  const toast = await p.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(e => e.innerText).join(' | '));
  console.log('melding', toast.slice(0, 300));
  let ok = false;
  for (let i = 0; i < 48 && !ok; i++) { await p.waitForTimeout(5000); ok = await p.evaluate(() => !!window.blokGame().aboard); }
  console.log('aan boord', ok, await p.evaluate(() => { const g = window.blokGame(); return g.aboard ? g.aboard.train.name : ''; }));
  console.log('fouten:', errs.length ? errs.join('\n') : 'geen');
  await b.close();
})();
