// OV-diagnose in de browser: Greenisland bij een metrotunnel (geen geblokkeerde tunnels in de geladen wereld),
// Megatower City (metro, bussen met de nieuwe modellen, losgekoppelde sporen), met de echte meshes en tegels.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 128, lod: 1200, hour: 14 })));
  const R = {};
  const waitReady = async () => { for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.tiled.inFlight === 0 && g.queue.length < 20; })) return; } };
  // Greenisland: midden van metrolijn M1
  await p.click('[data-mode="fantasy"]').catch(() => {});
  await p.evaluate(() => document.getElementById('btn-gi-play').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail; }, null, { timeout: 120000 });
  await p.evaluate(async () => { const g = window.blokGame(), m = await import('./js/greenisland.js'), L = m.LINE.M1, q = L.at(L.len * 0.4); g.player.pos.set(q.x, q.y + 1.2, q.z); g.player.fly = true; g.updateTiles(true); });
  await waitReady(); await p.waitForTimeout(2000);
  R.greenisland = await p.evaluate(async () => { const m = await import('./js/ovdiag.js'), r = await m.runOvDiag(window.blokGame()); return { tunnelpunten: r.tunnels.punten, geblokkeerd: r.tunnels.geblokkeerd.length, voorbeeld: r.tunnels.geblokkeerd.slice(0, 3), lijnen: r.lijnen, hellingen: r.hellingen.length, botsingen: r.botsingen.length }; });
  // Megatower City: bussen en metro
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.traffic; }, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.blokGame(); g.player.pos.set(5184, 125, 5100); g.player.fly = true; g.updateTiles(true); });
  await waitReady(); await p.waitForTimeout(4000);
  R.megatower = await p.evaluate(async () => {
    const g = window.blokGame(), m = await import('./js/ovdiag.js'), r = await m.runOvDiag(g);
    const kinds = {}; for (const a of g.traffic.agents) if (a.secs) for (const s of a.secs) if (/^bus|^tram|^metro/.test(s.m)) kinds[s.m] = (kinds[s.m] || 0) + 1;
    return { los: r.los.length, voorbeeldLos: r.los.slice(0, 3), voertuigen: kinds, tekst: m.ovDiagText(r).split('\n').slice(0, 3) };
  });
  console.log('ov-diagnose:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
