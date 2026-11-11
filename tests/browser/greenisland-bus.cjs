// Greenisland bus: bij een halte van stadsbus B3 op de stoep staan en bussen zien rijden.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
const SHOT = process.env.SHOT || null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  const info = await p.evaluate(async () => {
    const g = window.blokGame(); const A = await import('./js/greenisland.js');
    const L = A.BUS_LINES.find(l => l.id === 'B3'), st = L.stations[3], q = L.at(st.s);
    const d = 5, x = q.x - q.tz * d, z = q.z + q.tx * d;
    const pl = g.player; pl.fly = false; pl.pos.set(x, st.y + 2.2, z); pl.vel?.set?.(0, 0, 0);
    g.tiled.aheadKey = null; g.updateTiles(true); g.touch = true; g.paused = false;
    const yaw = Math.atan2(-q.tz * -1, q.tx); if (pl.yaw !== undefined) pl.yaw = Math.atan2(q.tz, -q.tx) + Math.PI / 2;
    return { x: Math.round(x), z: Math.round(z), y: st.y };
  });
  await p.waitForTimeout(30000);
  const r = await p.evaluate((info) => {
    const g = window.blokGame(), pl = g.player;
    const metro = [...g.alpRail.trains.values()].filter(t => t.run && t.run.sv && t.run.sv.bus).length;
    const blk = (x, y, z) => g.world.getBlock ? g.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) : -1;
    return { bussen: metro, spelerY: Math.round(pl.pos.y * 10) / 10, straatY: info.y + 1, onder: blk(pl.pos.x, pl.pos.y - 1, pl.pos.z), place: g.ui.place.textContent };
  }, info);
  console.log('bus:', JSON.stringify(r));
  if (SHOT) await p.screenshot({ path: SHOT });
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
