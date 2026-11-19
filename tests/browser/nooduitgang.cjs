// Tunnels: nooduitgang via de ladderschacht (Greenisland, ICEF). Het bord in de tunnel toont richting en afstand tot de
// nooduitgang; de speler klimt de ladder op tot boven de grond.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => document.getElementById('btn-gi-play').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.isGreen && g.isGreen(); }, null, { timeout: 180000 });
  await p.evaluate(async () => {
    const g = window.blokGame(), rail = await import('./js/rail.js'), L = rail.netInfo().LINES.find(l => l.id === 'ICEF'), q = L.at(3300);
    g.player.pos.set(q.x, Math.round(q.y) + 2.05, q.z); g.player.fly = true; g.updateTiles(true); window.__q = { x: q.x, y: q.y, z: q.z, tx: q.tx, tz: q.tz };
  });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.tiled.inFlight === 0 && g.queue.length < 10; })) break; }
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'), Q = window.__q, by = Math.round(Q.y), out = {};
    let ladder = null, sign = null;
    for (let dz = -70; dz <= 70; dz++) for (let dx = -70; dx <= 70; dx++) {
      const x = Math.floor(Q.x) + dx, z = Math.floor(Q.z) + dz;
      if (!ladder && g.world.get(x, by + 2, z) === B.LADDER) ladder = { x, z };
      for (let dy = 1; dy <= 5 && !sign; dy++) if (g.world.get(x, by + dy, z) === B.SIGN) sign = { x, y: by + dy, z, b: B.SIGN };
    }
    out.ladder = !!ladder; out.bord = !!sign;
    if (sign) { let txt = ''; const t0 = g.toast; g.toast = (t) => { txt = t; }; actionFor(g, sign)?.run(); g.toast = t0; out.bordTekst = txt.split('\n').slice(0, 2); }
    if (ladder) {
      // de ladder op klimmen (spatie ingedrukt), met de echte bewegingscode
      g.running = false; cancelAnimationFrame(g.raf);
      g.player.fly = false; g.player.pos.set(ladder.x + 0.5, by + 2.02, ladder.z + 0.5); g.player.vel.set(0, 0, 0);
      g.paused = false; g.touch = true; g.keys.add('Space');
      let top = by; for (let i = 0; i < 1200; i++) { g.updateMain(0.05); top = Math.max(top, g.player.pos.y); if (g.world.get(Math.floor(g.player.pos.x), Math.floor(g.player.pos.y), Math.floor(g.player.pos.z)) !== B.LADDER && g.player.pos.y > by + 8 && g.player.onGround) break; }
      g.keys.delete('Space');
      let ground = by + 2; while (g.world.get(ladder.x, ground, ladder.z) === B.LADDER) ground++;
      out.geklommen = Math.round(top - by); out.ladderTot = ground - by; out.boven = top >= ground - 1;
    }
    return out;
  });
  console.log('nooduitgang:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
