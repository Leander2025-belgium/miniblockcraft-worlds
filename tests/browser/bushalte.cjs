// Wachtenden aan bushaltes (Megatower City): wachten, instappen bij een bus met open deuren, uitstappen; niemand staat
// in een muur of zweeft.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 8, cycle: false, weather: 'clear', weatherSet: true, view: 96 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic && g.traffic.net && g.traffic.net.len.road > 1500 && (g.traffic.stops || []).some(s => s.kind === 'busstop'); }, null, { timeout: 400000, polling: 1000 });
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), tr = g.traffic; g.running = false; cancelAnimationFrame(g.raf);
    const { IS_SOLID } = await import('./js/blocks.js');
    const stops = tr.stops.filter(s => s.kind === 'busstop'); let bad = 0, tested = 0, maxW = 0;
    for (let i = 0; i < 3000; i++) {
      tr.update(0.1, g.player.pos, 1, 8); g.updateBusPax(0.1, 1);
      maxW = Math.max(maxW, g.busPax.stats.wachtend);
      if (i % 50 === 0) for (const q of g.busPax.list) { tested++; const X = Math.floor(q.x), Z = Math.floor(q.z), Y = q.y; if (IS_SOLID[g.world.get(X, Y, Z)] || IS_SOLID[g.world.get(X, Y + 1, Z)] || !IS_SOLID[g.world.get(X, Y - 1, Z)]) bad++; }
      if (g.busPax.stats.ingestapt >= 3 && g.busPax.stats.uitgestapt >= 2 && i > 300) break;
    }
    return { haltes: stops.length, haltesInDeBuurt: g.busPax.stops.size, maxWachtend: maxW, ...g.busPax.stats, posGetest: tested, inMuurOfZwevend: bad };
  });
  console.log('bushalte:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
