// TERRANOVA 16 — weer: sneeuw die blijft liggen en smelt, mist, wind, grip van de weg en voorzichtiger verkeer.
// Screenshots (SHOTS=map): dezelfde plek droog, na sneeuw, en in mist.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && /shader|GLSL|WebGL/i.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 12, cycle: false, quality: 'normal', auto: false, view: 128 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 180000 });
  // villawijk (daken, tuinen, straat)
  await p.evaluate(() => { const g = window.blokGame(); Object.assign(g.player, { fly: true, yaw: Math.PI * 0.75, pitch: -0.35 }); g.player.pos.set(10 * 128 + 40, g.meta.ground + 22, 10 * 128 + 40); g.tiled.aheadKey = null; g.updateTiles(true); });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 20; })) break; }
  const setW = (w) => p.evaluate((w) => { const g = window.blokGame(); g.settings.weather = w; }, w);
  // de spellus versnellen: applyWeather met grote stappen (sneeuw ligt na ± 4 minuten volledig)
  const advance = (sec) => p.evaluate((sec) => { const g = window.blokGame(), env = { sky: [0.5, 0.6, 0.8], top: [0.3, 0.4, 0.7], sunColor: [1, 1, 1], day: 1 }; for (let t = 0; t < sec; t += 5) g.applyWeather(env, 5); }, sec);
  const state = () => p.evaluate(() => { const g = window.blokGame(); return { w: g.curWeather, sneeuw: +(g.snowCover || 0).toFixed(2), nat: +(g.wet || 0).toFixed(2), grip: +(g.grip ?? 1).toFixed(2), verkeer: +(g.traffic.weatherSpeed ?? 1).toFixed(2), wind: +(g.wind?.s || 0).toFixed(1), uniform: +g.mats[0].uniforms.snowCover.value.toFixed(2), neerslag: g.precip?.kind || null }; });
  const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.setPaused(false); g.showOverlay(null); }); await p.waitForTimeout(2500); await p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 240000 }); };
  const R = {};
  await advance(20); R.droog = await state(); await shot('droog');
  await setW('snow'); await advance(120); R.sneeuwHalf = await state();
  await advance(200); R.sneeuw = await state(); await shot('sneeuw');
  await setW('clear'); await advance(300); R.dooi = await state();
  await advance(900); R.weg = await state();
  await setW('mist'); await advance(10); R.mist = await state();
  R.mistZicht = await p.evaluate(() => { const g = window.blokGame(); g.render(0.016); return g.mats[0].uniforms.fogFar.value; });
  await shot('mist');
  await setW('wind'); await advance(10); R.wind = await state();
  await setW('storm'); await advance(60); R.storm = await state();
  // regen valt schuin met de wind: onderkant van de streep verschoven
  R.schuin = await p.evaluate(() => { const P = window.blokGame().precip; return P && P.kind === 'rain' ? Math.hypot(P.pos[3] - P.pos[0], P.pos[5] - P.pos[2]) > 0.05 : false; });
  console.log('weer16:', JSON.stringify(R));
  const ok = R.droog.sneeuw === 0 && R.droog.grip === 1 && R.droog.verkeer === 1
    && R.sneeuwHalf.sneeuw > 0.3 && R.sneeuwHalf.sneeuw < 0.8 && R.sneeuw.sneeuw === 1 && R.sneeuw.uniform === 1 && R.sneeuw.grip <= 0.45 && R.sneeuw.verkeer <= 0.7 && R.sneeuw.neerslag === 'snow'
    && R.dooi.sneeuw > 0 && R.dooi.sneeuw < 1 && R.weg.sneeuw === 0 && R.weg.grip === 1
    && R.mist.w === 'mist' && R.mistZicht <= 120 && R.mist.verkeer === 0.8 && !R.mist.neerslag
    && R.wind.wind > 9 && R.storm.grip < 0.75 && R.storm.neerslag === 'rain' && R.schuin;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
