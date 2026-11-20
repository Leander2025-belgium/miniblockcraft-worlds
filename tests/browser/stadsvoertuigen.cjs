// TERRANOVA 14.2 — nieuwe generatie stadsvoertuigen (js/vehicles.js): metro2, tram2 en de nieuwe e-bus rijden mee in
// Megatower City, met een andere buitenkant dan de oude modellen, en dezelfde deuren (schuifdeuren metro werken).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOT = process.env.SHOT || null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 12, cycle: false, weather: 'clear', weatherSet: true, view: 96, lod: 600, quality: 'normal', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 180000 });
  // tramlaan T1 (x = 30 × 128) bij de metro: trams, metro's en bussen
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(30 * 128 + 6, g.meta.ground + 8, 4800); g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 30; })) break; }
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), tr = g.traffic, V = await import('./js/vehicles.js');
    const verts = (m) => m ? Object.values(m).reduce((a, geo) => a + (geo && geo.attributes ? geo.attributes.position.count : 0), 0) : 0;
    const M = V.buildModels();
    const out = { modellen: {}, rijden: {}, deurbladen: !!V.METRO_LEAVES.metro2Cab && V.METRO_LEAVES.metro2Cab.length === V.METRO_LEAVES.metroCab.length };
    for (const [n, o] of [['metro2Cab', 'metroCab'], ['tram2Cab', 'tramCab'], ['busNew', 'busElec']]) out.modellen[n] = { nieuw: verts(M[n]), oud: verts(M[o]) };
    // verkeer een tijd laten rijden en tellen welke modellen in dienst komen
    const seen = {};
    for (let i = 0; i < 1500; i++) { tr.update(0.1, g.player.pos, 1, 12); if (i % 50 === 0) for (const a of tr.agents) if (!a.dead && a.secs) for (const s of a.secs) seen[s.m] = (seen[s.m] || 0) + 1; }
    out.rijden = seen;
    return out;
  });
  // camera naast een nieuwe tram (als er een rijdt)
  R.tram2Gezien = await p.evaluate(() => {
    const g = window.blokGame(), tr = g.traffic, a = tr.agents.find(a => !a.dead && a.kind === 'tram' && a.secs[0].m === 'tram2Cab') || tr.agents.find(a => !a.dead && a.secs && a.secs[0].m === 'busNew');
    if (!a) return false;
    const h = tr.behind(a, 0, {}), t = tr.behind(a, 6, {}), dx = h.x - t.x, dz = h.z - t.z, l = Math.hypot(dx, dz) || 1;
    const pl = g.player; pl.pos.set(h.x + dx / l * 9 + dz / l * 5, h.y + 2.2, h.z + dz / l * 9 - dx / l * 5); pl.yaw = Math.atan2(-(h.x - pl.pos.x), -(h.z - pl.pos.z)); pl.pitch = -0.1;
    tr.frozen = true; const up = tr.update.bind(tr); tr.update = (dt, ...r) => up(0, ...r); // stilzetten voor de foto
    return true;
  });
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.blokGame().showOverlay(null));
  if (SHOT) await p.screenshot({ path: SHOT, timeout: 240000 });
  console.log('stadsvoertuigen:', JSON.stringify(R));
  const anders = Object.values(R.modellen).every(m => m.nieuw > 0 && m.nieuw !== m.oud);
  const ok = anders && R.deurbladen && (R.rijden.metro2Cab || 0) > 0 && (R.rijden.tram2Cab || 0) > 0 && (R.rijden.busNew || 0) > 0 && (R.rijden.metroCab || 0) > 0;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
