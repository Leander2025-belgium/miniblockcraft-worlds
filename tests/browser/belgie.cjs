// Heel België: de wereld starten vanuit het menu, naar steden springen (ook de Botrange), de knop om een streek te
// downloaden, en de kaart (M). OpenStreetMap is in de test niet bereikbaar: de tegels zelf worden niet geladen.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|overpass|elevation-tiles/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true })));
  await p.click('[data-mode="real"]').catch(() => {});
  await p.evaluate(() => document.getElementById('btn-belgie').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.player; }, null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => { const g = window.blokGame(), m = g.meta.map; return { wereld: g.meta.name, km: Math.round(m.tile * m.tiles / 1000), groot: !!m.bigWorld, minikaart: [g.lod.canvas.width, g.lod.canvas.height], positie: [Math.round(g.player.pos.x), Math.round(g.player.pos.y), Math.round(g.player.pos.z)] }; });
  await p.evaluate(() => window.blokGame().setPaused(true));
  const menu = await p.evaluate(() => ({ snelNaar: document.querySelectorAll('#tp-list .chip').length, streekKnop: !document.getElementById('btn-area-dl').hidden }));
  // naar de Botrange springen
  const bot = await p.evaluate(() => { const c = [...document.querySelectorAll('#tp-list .chip')].find(b => b.textContent.includes('Botrange')); c.click(); const q = window.blokGame().player.pos; return [Math.round(q.x), Math.round(q.y), Math.round(q.z)]; });
  await p.waitForTimeout(800);
  const kaart = await p.evaluate(() => { const g = window.blokGame(); g.setPaused(true); document.getElementById('btn-map').click(); return !document.getElementById('ov-map').hidden; });
  console.log('belgie:', JSON.stringify({ ...r, ...menu, botrange: bot, kaart }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
