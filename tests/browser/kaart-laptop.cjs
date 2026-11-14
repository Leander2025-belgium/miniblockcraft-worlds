// Laptop: de kaart moet te openen zijn vanuit het pauzemenu (knop), met M als de muis vrij is, en via een klik
// op de minikaart (ook als 'Klik om te spelen' of het pauzemenu erover ligt); daarna teleporteren met een klik.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  for (const [wereld, knop, kaart] of [['Nova Metropool', '#btn-metro', '#ov-map'], ['Greenisland', '#btn-gi-play', '#ov-rail']]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
    await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
    await p.goto('http://localhost:8765/#debug');
    await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true })));
    await p.click('[data-mode="fantasy"]'); await p.click(knop);
    await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.player && (!g.tiled || g.world.tileAt(g.player.pos.x, g.player.pos.z)); }, null, { timeout: 150000 });
    await p.waitForTimeout(2000);
    const open = () => p.evaluate((k) => !document.querySelector(k).hidden, kaart);
    const sluit = () => p.evaluate(() => { const g = window.blokGame(); g.invOpen = false; g.setPaused(true); });
    const r = {};
    // 1. 'Klik om te spelen' ligt over alles: klik op de minikaart
    await p.evaluate(() => window.blokGame().showOverlay('start'));
    await p.click('#minimap'); await p.waitForTimeout(800); r.minikaart = await open();
    // 2. pauzemenu: knop
    await sluit(); await p.click('#btn-map'); await p.waitForTimeout(800); r.knop = await open();
    // 3. pauzemenu: toets M
    await sluit(); await p.keyboard.press('KeyM'); await p.waitForTimeout(800); r.toetsM = await open();
    // 4. teleporteren met een klik op de kaart (Metropool: gewone kaart)
    if (kaart === '#ov-map') {
      const voor = await p.evaluate(() => { const q = window.blokGame().player.pos; return [Math.round(q.x), Math.round(q.z)]; });
      const bb = await p.locator('#bigmap').boundingBox(); await p.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.3); await p.waitForTimeout(800);
      const na = await p.evaluate(() => { const q = window.blokGame().player.pos; return [Math.round(q.x), Math.round(q.z)]; });
      r.teleport = voor.join(',') !== na.join(',');
    }
    r.fouten = errs.length ? errs.join(' | ') : 'geen';
    out[wereld] = r; await p.close();
  }
  console.log('kaart-laptop:', JSON.stringify(out));
  await b.close();
})();
