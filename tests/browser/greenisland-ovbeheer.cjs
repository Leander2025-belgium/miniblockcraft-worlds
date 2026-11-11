// Greenisland OV-beheer: spoorkaart openen, dienstregeling aanpassen (S1 elke 10 min), vertragingen en depot bekijken.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal' })); localStorage.removeItem('blokstad-ov-greenisland'); });
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.paused = false; g.alpRail.openMap(); g.showOverlay('rail'); });
  await p.waitForTimeout(1000);
  const click = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
  await click('[data-tab="plan"]'); await p.waitForTimeout(300);
  const rows = await p.evaluate(() => document.querySelectorAll('#rail-panel tr[data-sv]').length);
  // S1 elke 10 minuten
  await p.evaluate(() => { const r = document.querySelector('#rail-panel tr[data-sv="S1"]'); const sel = r.querySelector('.ov-h'); sel.value = '10'; });
  await click('#ov-save'); await p.waitForTimeout(500);
  const s1 = await p.evaluate(async () => { const R = await import('./js/rail.js'); return R.RUNS.filter(r => r.sv.id === 'S1').map(r => r.h); });
  const opgeslagen = await p.evaluate(() => localStorage.getItem('blokstad-ov-greenisland'));
  await click('[data-tab="delay"]'); await p.waitForTimeout(300);
  const vertraging = await p.evaluate(() => document.querySelector('#rail-panel').textContent.match(/Nu \d+ ritten met vertraging/)?.[0]);
  await click('[data-tab="depot"]'); await p.waitForTimeout(300);
  const depot = await p.evaluate(() => document.querySelector('#rail-panel').textContent.match(/Totaal \([a-z]+\): \d+ stellen nodig, \d+ nu onderweg/)?.[0]);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await click('[data-tab="plan"]'); await p.waitForTimeout(300); await click('#ov-reset'); await p.waitForTimeout(300);
  const herstel = await p.evaluate(async () => { const R = await import('./js/rail.js'); return R.RUNS.filter(r => r.sv.id === 'S1').map(r => r.h); });
  console.log('ov-beheer:', JSON.stringify({ rows, s1, opgeslagen, vertraging, depot, herstel }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
