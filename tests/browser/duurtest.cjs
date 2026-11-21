// TERRANOVA 15 — lange speelsessie (standaard 30 minuten, MIN=…): afwisselend door Megatower City vliegen, in de
// Megatower op verschillende verdiepingen, groot bouwen en ongedaan maken, opslaan, naar de Alpen en terug.
// Elke minuut: JS-geheugen (performance.memory, met --enable-precise-memory-info), geometrieën en texturen van de
// renderer, tegels, voertuigen, reizigers. Controle op lekken: in de tweede helft groeit het geheugen niet blijvend
// (helling van de minima per minuut), en geometrieën/texturen blijven binnen een grens. Geen JavaScript-fouten.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const MIN = +(process.env.MIN || 30);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto((process.env.BASE || 'http://localhost:8765/') + '#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 12, cycle: true, weather: 'clear', weatherSet: true, view: 96, quality: 'fast', auto: false })));
  await p.reload();
  const start = async (w) => {
    if (w === 'mega') await p.evaluate(() => document.getElementById('btn-mega').click());
    else { await p.click('[data-mode="fantasy"]'); await p.evaluate(() => document.getElementById('btn-berg').click()); }
    await p.waitForFunction((w) => { const g = window.blokGame && window.blokGame(); return g && g.running && (w === 'mega' ? g.mega : g.alpRail); }, w, { timeout: 300000 });
    await p.evaluate(() => { document.getElementById('ov-start').hidden = true; });
  };
  const exitToMenu = () => p.evaluate(() => document.getElementById('btn-exit')?.click());
  const sample = (label) => p.evaluate((label) => { const g = window.blokGame(), m = performance.memory, r = g.renderer.info; try { window.gc && window.gc(); } catch { /* geen gc */ } return { t: Math.round(performance.now() / 1000), label, heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null, geom: r.memory.geometries, tex: r.memory.textures, tegels: g.world && g.world.tiles ? g.world.tiles.size : 0, voertuigen: g.traffic ? g.traffic.agents.length : 0, reizigers: g.travelers ? g.travelers.list.length : 0, chunks: g.chunks ? g.chunks.size : 0 }; }, label);
  const T0 = Date.now(), S = [];
  await start('mega');
  let k = 0;
  while (Date.now() - T0 < MIN * 60000) {
    const step = k++ % 6;
    if (step === 0) { // door de stad vliegen (6 plaatsen, telkens 25 s)
      for (const [x, z] of [[4160, 5120], [3072, 3400], [5800, 6450], [2200, 3900], [1300, 1300], [5184, 4990]]) { await p.evaluate(([x, z]) => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(x, g.meta.ground + 30, z); g.updateTiles(true); }, [x, z]); await p.waitForTimeout(25000); }
    } else if (step === 1) { // Megatower: lobby, 100, 200
      for (const f of [0, 100, 200]) { await p.evaluate(async (f) => { const m = await import('./js/megatower.js'), g = window.blokGame(); g.player.fly = false; g.player.pos.set(m.CX + 0.5, m.floorY(f), m.CZ - 14.5); g.player.vel.set(0, 0, 0); g.updateTiles(true); }, f); await p.waitForTimeout(30000); }
    } else if (step === 2) { // groot bouwen en ongedaan maken
      await p.evaluate(() => { const g = window.blokGame(), Bd = g.builder, G = g.meta.ground; g.player.fly = true; g.player.pos.set(1500, G + 40, 1500); g.updateTiles(true); Bd.a = [1470, G + 1, 1470]; Bd.b = [1529, G + 15, 1529]; g.hotbar[g.slot] = 1; Bd.fill('fill'); });
      await p.waitForTimeout(40000); await p.evaluate(() => window.blokGame().builder.undo()); await p.waitForTimeout(20000);
    } else if (step === 3) { // opslaan
      await p.evaluate(() => document.getElementById('btn-save')?.click()); await p.waitForTimeout(15000);
    } else if (step === 4) { // naar de Alpen en terug
      await exitToMenu(); await p.waitForTimeout(4000); await start('alpen'); await p.waitForTimeout(60000); await exitToMenu(); await p.waitForTimeout(4000); await start('mega'); await p.waitForTimeout(20000);
    } else { await p.waitForTimeout(30000); }
    S.push(await sample(['stad', 'toren', 'bouwen', 'opslaan', 'wereldwissel', 'rust'][step]));
    console.log(JSON.stringify(S[S.length - 1]));
  }
  // lekken: helling van het geheugen in de tweede helft (lineaire regressie, MB per minuut)
  const half = S.slice(Math.floor(S.length / 2)).filter(s => s.heapMB != null);
  const n = half.length, mt = half.reduce((a, s) => a + s.t, 0) / n, mh = half.reduce((a, s) => a + s.heapMB, 0) / n;
  const slope = n > 2 ? half.reduce((a, s) => a + (s.t - mt) * (s.heapMB - mh), 0) / half.reduce((a, s) => a + (s.t - mt) ** 2, 0) * 60 : 0;
  const R = { minuten: Math.round((Date.now() - T0) / 60000), metingen: S.length, heapMin: Math.min(...S.map(s => s.heapMB)), heapMax: Math.max(...S.map(s => s.heapMB)), hellingTweedeHelftMBperMin: +slope.toFixed(2), geomMax: Math.max(...S.map(s => s.geom)), texMax: Math.max(...S.map(s => s.tex)) };
  console.log('duurtest:', JSON.stringify(R));
  fs.writeFileSync(process.env.OUT || '/tmp/duurtest.json', JSON.stringify({ R, S }, null, 1));
  const ok = R.minuten >= MIN - 1 && R.hellingTweedeHelftMBperMin < 3 && R.geomMax < 6000 && R.texMax < 400;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
