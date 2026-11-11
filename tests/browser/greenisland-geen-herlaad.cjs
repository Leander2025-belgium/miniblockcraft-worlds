// Greenisland mag niet naar de startpagina springen: (1) een oudere version.json op de server (cache van GitHub Pages)
// laat de pagina niet herladen; (2) een verloren grafische context wordt hersteld zonder herladen.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  let loads = 0; p.on('load', () => loads++);
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  // de server geeft (nog) een oudere versie
  await p.route('**/version.json*', r => r.fulfill({ body: JSON.stringify({ version: '2026-01-01a' }), contentType: 'application/json' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal', weather: 'clear', weatherSet: true })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.paused = false; window.__marker = 42; });
  await p.waitForTimeout(8000);
  const na1 = await p.evaluate(() => window.__marker === 42);
  // grafische context kwijt en terug
  const r = await p.evaluate(async () => {
    const g = window.blokGame(), c = g.ui.canvas, gl = c.getContext('webgl2') || c.getContext('webgl'), ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return { ext: false };
    const f0 = g.frame ?? g.frames ?? 0; ext.loseContext(); await new Promise(r => setTimeout(r, 1500)); ext.restoreContext(); await new Promise(r => setTimeout(r, 4000));
    return { ext: true, verloren: gl.isContextLost() };
  });
  await p.waitForTimeout(9000); // langer dan de 8 s wachttijd: geen herlaad als de context terug is
  const na2 = await p.evaluate(() => ({ zelfdePagina: window.__marker === 42, inSpel: !document.getElementById('game').hidden, menuVerborgen: document.getElementById('menu').hidden }));
  // (3) context kwijt en niet terug: geen herlaad, wel een knop
  const r3 = await p.evaluate(async () => { const c = window.blokGame().ui.canvas, gl = c.getContext('webgl2') || c.getContext('webgl'), ext = gl.getExtension('WEBGL_lose_context'); ext.loseContext(); await new Promise(r => setTimeout(r, 12000)); return { knop: !document.getElementById('ctx-lost').hidden, zelfdePagina: window.__marker === 42 }; });
  na2.zonderHerstel = r3;
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  console.log('geen-herlaad:', JSON.stringify({ oudereVersieGeenHerlaad: na1, context: r, ...na2, paginaLaadbeurten: loads }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
