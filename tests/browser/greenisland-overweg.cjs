// Greenisland overweg: naar een overweg gaan waar een trein nadert; de overweg gaat dicht (lichten, slagbomen)
// en het verkeer krijgt een wachtzone.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal', weather: 'clear', weatherSet: true })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.alpRail && g.alpRail.active && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  // een overweg waar binnen 2 km een trein naartoe rijdt
  const target = await p.evaluate(async () => {
    const g = window.blokGame(), R = await import('./js/rail.js'), N = (await import('./js/rail-green.js')).NET;
    let best = null;
    for (const c of N.CROSSINGS) for (const a of g.alpRail.active) { if (a.run.pr.L.id !== c.line || a.t < 0) continue; const s = a.run.pr.s0 + a.run.dir * a.x, d = (c.s - s) * a.run.dir; if (d > 800 && d < 2500 && (!best || d < best.d)) best = { c, d }; }
    if (!best) return null;
    const c = best.c; g.player.fly = true; g.player.pos.set(c.x + c.uz * 25, c.y + 12, c.z - c.ux * 25); g.tiled.aheadKey = null; g.updateTiles(true); g.touch = true; g.paused = false;
    return { x: Math.round(c.x), z: Math.round(c.z), lijn: c.line, soort: c.kind, afstandTrein: Math.round(best.d), totaal: N.CROSSINGS.length };
  });
  let seen = { dicht: false, slagbomen: 0, wachtzones: 0 };
  if (target) for (let i = 0; i < 40 && !seen.dicht; i++) {
    await p.waitForTimeout(3000);
    seen = await p.evaluate((t) => { const g = window.blokGame(), c = (g.traffic.stopZones || []).find(z => Math.abs(z.x - t.x) < 2 && Math.abs(z.z - t.z) < 2); return { dicht: !!c, slagbomen: g.alpRail.armMesh.count, wachtzones: (g.traffic.stopZones || []).length }; }, target);
  }
  console.log('overweg:', JSON.stringify({ target, ...seen }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
