// Bouwen in de Alpenwereld, 6 s wachten (zonder afsluiten), pagina hard herladen: staat het blok er nog? En de speler?
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal' })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg');
  const wait = () => p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.world.tileAt(g.player.pos.x, g.player.pos.z).ready; }, null, { timeout: 120000 });
  await wait();
  const placed = await p.evaluate(() => {
    const g = window.blokGame(); g.touch = true; g.paused = false; g.showOverlay(null);
    const q = g.player.pos, x = Math.floor(q.x) + 2, z = Math.floor(q.z) + 2;
    let y = Math.floor(q.y) + 6; while (y > 0 && !g.world.solidAt(x, y - 1, z)) y--;
    const out = [];
    for (let k = 0; k < 5; k++) { g.target = { x, y: y - 1 + k, z, b: 1, n: [0, 1, 0] }; g.slot = 1; g.act('place'); out.push(g.world.get(x, y + k, z)); }
    q.x += 3; // verplaatsen
    return { x, y, z, blocks: out, pos: [q.x, q.z] };
  });
  console.log('geplaatst', JSON.stringify(placed));
  await p.waitForTimeout(7000);
  await p.reload(); // geen afsluitknop: alsof de pagina wegvalt
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg');
  await wait();
  const after = await p.evaluate((pl) => { const g = window.blokGame(); const out = []; for (let k = 0; k < 5; k++) out.push(g.world.get(pl.x, pl.y + k, pl.z)); return { blocks: out, pos: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)] }; }, placed);
  console.log('na herladen', JSON.stringify(after), JSON.stringify(after.blocks) === JSON.stringify(placed.blocks) ? 'GELIJK' : 'VERSCHIL');
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
