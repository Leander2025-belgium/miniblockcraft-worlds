// Greenisland GNMI-weer: weer volgens de regio in het spel, het weerpaneel met alle regio's en waarschuwingen.
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
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.paused = false; });
  await p.waitForTimeout(12000);
  const r = await p.evaluate(() => { const g = window.blokGame(); return { weer: g.curWeather, gnmi: g.gnmiNow && { regio: g.gnmiNow.name, soort: g.gnmiNow.kind, temp: g.gnmiNow.temp }, hud: g.ui.coords.textContent }; });
  await p.evaluate(() => { const g = window.blokGame(); g.setPaused(true); });
  const knop = await p.evaluate(() => !document.getElementById('btn-gnmi').hidden);
  await p.evaluate(() => document.getElementById('btn-gnmi').click()); await p.waitForTimeout(800);
  const paneel = await p.evaluate(() => ({ zichtbaar: !document.getElementById('ov-gnmi').hidden, regios: document.querySelectorAll('#gnmi-body tr').length - 1 }));
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  console.log('gnmi:', JSON.stringify({ ...r, knop, paneel }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
