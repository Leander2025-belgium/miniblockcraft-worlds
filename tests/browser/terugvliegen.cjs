// Frankfurt (testgegevens): 2,1 km wegvliegen aan 120 m/s en terug; daarna tellen hoe tegels terugkwamen.
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const { chromium } = require('playwright');
const fs = require('fs');
const budget = +(process.argv[2] || 0);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation/, r => r.abort());
  const data = fs.readFileSync(require('path').join(__dirname, '../data/fake-frankfurt.json'));
  await p.route(/overpass|mail\.ru/, r => r.fulfill({ body: data, contentType: 'application/json' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal' })));
  await p.click('#btn-city');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.evaluate((budget) => { const g = window.blokGame(); g.touch = true; g.paused = false; g.showOverlay(null); if (budget) g._mem = budget; }, budget);
  const ready = () => p.evaluate(() => { const g = window.blokGame(), q = g.player.pos, T = g.world.T; let n = 0, r = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { n++; const t = g.world.tiles.get(g.world.key(Math.floor(q.x / T) + dx, Math.floor(q.z / T) + dz)); if (t && t.ready) r++; } return r === n; });
  for (let i = 0; i < 90 && !(await ready()); i++) await p.waitForTimeout(1000);
  const fly = async (dir) => p.evaluate((dir) => new Promise((res) => {
    const g = window.blokGame(), q = g.player; q.fly = true; let d = 0;
    const iv = setInterval(() => { const st = 120 * 0.1; q.pos.x += dir * st; d += st; q.vel.set(dir * 120, 0, 0); g.tiled.aheadKey = null; if (d >= 2100) { clearInterval(iv); q.vel.set(0, 0, 0); res(); } }, 100);
  }), dir);
  await fly(1); await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = window.blokGame(); g.tiled.stats = { memory: 0, cache: 0, net: 0, gen: 0 }; });
  await fly(-1);
  const t0 = Date.now(); while (!(await ready()) && Date.now() - t0 < 120000) await p.waitForTimeout(250);
  const st = await p.evaluate(() => { const g = window.blokGame(), td = g.tiled; let rle = 0; for (const t of td.parked.values()) if (t.rle) rle++; return { stats: td.stats, parked: td.parked.size, compressed: rle, active: g.world.tiles.size, budget: g.memBudget() }; });
  console.log(`budget ${budget || 'standaard'} · klaar na terugkeer: ${((Date.now() - t0) / 1000).toFixed(1)} s ·`, JSON.stringify(st));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
