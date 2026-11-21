// TERRANOVA 15 — busremise Oostkade (js/megacity.js BUS_DEPOT, js/traffic.js depotTick).
// 's Nachts staan er veel bussen op de stalling, bij het begin van de spits rijden er uit (door de poort naar de
// rijstrook van B11, daar een echte lijnbus met rit), 's avonds rijden er in. Controles: aantallen volgen de periode,
// uitgerukte bussen hebben een lijn en een rit, niemand staat dubbel op een plaats. SHOT=bestand (stalling 's nachts).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 3, cycle: false, weather: 'clear', weatherSet: true, view: 160, quality: 'fast', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic && g.traffic.busDepot; }, null, { timeout: 180000 });
  await p.evaluate(() => { const g = window.blokGame(), D = g.traffic.busDepot; g.player.fly = true; g.player.pos.set(D.cx + 30, g.meta.ground + 26, D.cz - 60); g.player.yaw = Math.atan2(-(D.cx + 30 - g.player.pos.x), -(D.cz - 30 - g.player.pos.z)); g.player.pitch = -0.55; g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 30; })) break; }
  await p.evaluate(() => { const g = window.blokGame(); g.traffic.rebuild(g.world.tiles, g.player.pos); });
  const sim = (hour, sec) => p.evaluate(([hour, sec]) => {
    const g = window.blokGame(), tr = g.traffic, out = { dubbel: 0, uitZonderLijn: 0, uit: [] };
    for (let i = 0; i < sec * 10; i++) {
      tr.update(0.1, g.player.pos, hour > 6 && hour < 20 ? 1 : 0.1, hour);
      const bays = tr.agents.filter(a => a.parked && !a.dead).map(a => a.bay); if (new Set(bays).size !== bays.length) out.dubbel++;
    }
    for (const u of tr.depotStats.uit || []) { out.uit.push(u); if (!u.lijn || !u.rit) out.uitZonderLijn++; }
    return { ...tr.depotStats, periode: tr.period, ...out, uit: out.uit.slice(0, 4) };
  }, [hour, sec]);
  const R = {};
  R.nacht = await sim(3, 60);
  await p.evaluate(() => { document.getElementById('ov-start').hidden = true; const g = window.blokGame(); g.settings.hour = 3; });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: process.env.SHOT || '/tmp/busremise.png', timeout: 240000 });
  R.spits = await sim(8, 420);
  R.avond = await sim(21, 420);
  console.log('busremise:', JSON.stringify(R));
  const ok = R.nacht.geparkeerd >= 9 && R.nacht.reserve === 6 && R.spits.uitgerukt >= 5 && R.spits.geparkeerd <= 3 && R.spits.uitZonderLijn === 0 && R.spits.uit.length >= 1
    && R.avond.ingerukt >= 1 && R.nacht.dubbel + R.spits.dubbel + R.avond.dubbel === 0;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
