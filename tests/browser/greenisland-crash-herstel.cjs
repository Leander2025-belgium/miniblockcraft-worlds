// Greenisland: valt de pagina tijdens het spelen weg (geheugen), dan komt de speler meteen terug in de wereld,
// zonder eerst de startpagina, met een lagere kijkafstand en een melding.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 500 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await ctx.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await ctx.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 128, lod: 1000, hour: 12, quality: 'normal', weather: 'clear', weatherSet: true })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.waitForTimeout(4000); // hartslag
  // de pagina valt weg zonder pagehide (zoals bij geheugengebrek): sessionStorage blijft, 'clean' niet gezet
  await p.evaluate(() => { window.onpagehide = null; sessionStorage.removeItem('blokstad-clean'); });
  const ss = await p.evaluate(() => JSON.stringify(sessionStorage));
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push('PAGE2 ' + e.message));
  // de nieuwe pagina krijgt dezelfde sessiegegevens vóór de game start (zoals na een herstart door de browser)
  await p2.addInitScript((s) => { if (!sessionStorage.getItem('__gezet')) { for (const [k, v] of Object.entries(JSON.parse(s))) sessionStorage.setItem(k, v); sessionStorage.setItem('__gezet', '1'); } }, ss);
  await p.close();
  await p2.goto('http://localhost:8765/#debug');
  let menuZichtbaar = null; await p2.waitForTimeout(400); menuZichtbaar = await p2.evaluate(() => !document.getElementById('menu').hidden);
  await p2.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running; }, null, { timeout: 120000 });
  await p2.waitForTimeout(6000);
  const r = await p2.evaluate(() => ({ terugInWereld: !!(window.blokGame() && window.blokGame().running), kijkafstand: JSON.parse(localStorage.getItem('blokstad-settings')).view, melding: document.getElementById('toast').textContent }));
  await p2.evaluate(() => { const g = window.blokGame(); g.setPaused(true); document.getElementById('btn-diag').click(); });
  await p2.waitForTimeout(500);
  const dg = await p2.evaluate(() => ({ zichtbaar: !document.getElementById('ov-diag').hidden, crashInLog: /crash":true/.test(document.getElementById('diag-text').value), regels: document.getElementById('diag-text').value.split('\n').length }));
  console.log('crash-herstel:', JSON.stringify({ menuNaHerladen: menuZichtbaar, ...r, diagnose: dg }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
