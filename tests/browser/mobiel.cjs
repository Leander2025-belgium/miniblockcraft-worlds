// Telefoon en tablet (emulatie: Pixel 7, iPhone 13, iPad Mini; aanraakscherm, schermgrootte, pixeldichtheid).
// Per toestel: Megatower City laden, aanraakknoppen zichtbaar en groot genoeg (≥ 40 px), niets buiten het scherm,
// menu openen met een tik, reisplanner openen en een reis plannen met een tik, minikaart, FPS en laadtijd meten.
// Let op: de testbrowser rekent zonder grafische kaart (software), de FPS hier zegt niets over een echte telefoon.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  for (const name of (process.env.TOESTEL ? [process.env.TOESTEL] : ['Pixel 7', 'iPhone 13', 'iPad Mini'])) {
    const ctx = await b.newContext({ ...devices[name] });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
    await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
    await p.goto('http://localhost:8765/#debug');
    await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 8, cycle: false, weather: 'clear', weatherSet: true, fps: true })));
    await p.reload();
    const t0 = Date.now(), R0 = {};
    await p.tap('[data-mode="fantasy"]'); await p.waitForTimeout(300);
    R0.menuBreedte = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await p.locator('#btn-mega').scrollIntoViewIfNeeded(); await p.tap('#btn-mega');
    await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 240000 });
    const load = Date.now() - t0;
    await p.waitForTimeout(6000);
    const R = await p.evaluate(() => {
      const g = window.blokGame(), vw = innerWidth, vh = innerHeight, small = [], outside = [];
      for (const el of document.querySelectorAll('.tbtn, .touch.tbtn')) {
        const s = getComputedStyle(el); if (el.hidden || s.display === 'none' || s.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        if (r.width < 40 || r.height < 40) small.push(el.id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) outside.push(el.id);
      }
      return { touch: g.touch, scherm: [vw, vh], scrollbreedte: document.documentElement.scrollWidth, teKlein: small, buitenScherm: outside, fps: Math.round(g.fpsNow || 0), minikaart: !!document.getElementById('minimap') && getComputedStyle(document.getElementById('minimap')).display !== 'none' };
    });
    // menu en reisplanner met een tik
    await p.tap('#t-menu').catch(() => {});
    await p.waitForTimeout(500);
    R.menu = await p.evaluate(() => !document.getElementById('ov-pause').hidden);
    R.plannerKnop = await p.evaluate(() => !document.getElementById('btn-megaplan').hidden);
    if (R.plannerKnop) {
      await p.tap('#btn-megaplan'); await p.waitForTimeout(800);
      R.planner = await p.evaluate(() => { const ov = document.getElementById('ov-megaplan'), card = ov.querySelector('.card').getBoundingClientRect(); return { open: !ov.hidden, past: card.width <= innerWidth + 1, reis: (document.getElementById('mp-result').textContent || '').slice(0, 120) }; });
      await p.tap('#mp-nav'); await p.waitForTimeout(800);
      R.toast = await p.evaluate(() => document.getElementById('toast')?.textContent);
      R.navigatie = await p.evaluate(() => { const g = window.blokGame(), n = g.mega.navTo; const pp = g.player.pos; g.mega.updateNav(); return { doel: n && n.name, afstand: n ? Math.round(Math.hypot(n.x - pp.x, n.z - pp.z)) : null, hud: document.getElementById('nav-hud').textContent }; });
    }
    R.laadtijdMs = load; Object.assign(R, R0);
    R.fouten = errs.slice(0, 3);
    out[name] = R;
    await ctx.close();
  }
  console.log('mobiel:', JSON.stringify(out));
  await b.close();
})();
