// TERRANOVA 15 — wijken van Megatower City 2.0: vaste camera's (zelfde scène vóór en na: BASE=… voor de oude versie).
// Historisch centrum (Oude Markt), winkelkwartier, villawijk, havenpakhuizen en een laan met straatmeubilair.
// SHOTS=map voor de schermafdrukken. Controle: alle scènes laden zonder JavaScript-fouten.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS || '/tmp/wijken';
const SCENES = [
  { id: 'historisch', cam: [4163, 16, 5205], at: [4118, 6, 5150] },
  { id: 'winkelkwartier', cam: [4490, 15, 5630], at: [4515, 1, 5667] },
  { id: 'villawijk', cam: [1250, 22, 1250], at: [1310, 2, 1300] },
  { id: 'haven', cam: [2215, 16, 3880], at: [2120, 6, 3930] },
  { id: 'laan', cam: [3080, 4, 3380], at: [3058, 2, 3430] },
  { id: 'laan-nacht', hour: 22, cam: [3085, 9, 3330], at: [3072, 1, 3420] }, // koplampbundels, verlichte reclamezuilen
];
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto((process.env.BASE || 'http://localhost:8765/') + '#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 11, cycle: false, weather: 'clear', weatherSet: true, view: 160, lod: 1600, quality: 'normal', shadows: true, auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 240000 });
  const R = {};
  for (const S of SCENES) {
    await p.evaluate(({ cam, at, hour }) => { const g = window.blokGame(), P = g.player, G = g.meta.ground; g.settings.hour = hour ?? 11; P.fly = true; P.pos.set(cam[0], G + cam[1], cam[2]); P.yaw = Math.atan2(-(at[0] - cam[0]), -(at[2] - cam[2])); P.pitch = Math.atan2(at[1] - cam[1], Math.hypot(at[0] - cam[0], at[2] - cam[2])); g.updateTiles(true); document.getElementById('ov-start').hidden = true; }, S);
    for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 4; })) break; }
    await p.evaluate(() => { const g = window.blokGame(); for (let q = 0; q < 800 && g.queue.length; q++) g.buildSome(); document.getElementById('ov-start').hidden = true; });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(SHOTS, S.id + '.png'), timeout: 240000 });
    R[S.id] = await p.evaluate(() => document.getElementById('hud-place')?.textContent?.slice(0, 60));
  }
  console.log('wijken:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
