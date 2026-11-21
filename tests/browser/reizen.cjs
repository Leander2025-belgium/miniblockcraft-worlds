// TERRANOVA 15 — hele reizen van deur tot deur (js/journeys.js + js/travelers.js) in Megatower City.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 8, cycle: false, weather: 'clear', weatherSet: true, view: 96, lod: 600, quality: 'fast', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 180000 });
  await p.evaluate(() => { const g = window.blokGame(); g.settings.view = 420; g.player.fly = true; g.player.pos.set(4160, g.meta.ground + 30, 5120); g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 30; })) break; }
  await p.evaluate(() => { const g = window.blokGame(); g.traffic.rebuild(g.world.tiles, g.player.pos); g.running = false; cancelAnimationFrame(g.raf); });
  // wachten tot de planner gekoppeld is (dynamische import)
  await p.waitForFunction(() => { const g = window.blokGame(); const T = g.travelersOn(); return !!T.journey; }, null, { timeout: 30000 });
  const R = { msPerTick: [] };
  for (let k = 0; k < (+process.env.N || 120); k++) {
    const r = await p.evaluate(() => {
      const g = window.blokGame(), tr = g.traffic, T = g.travelersOn(); let worst = 0;
      for (let i = 0; i < 100; i++) {
        tr.update(0.1, g.player.pos, 1, 8); g.updateBusPax(0.1, 1);
        const t0 = performance.now(); T.spawnTick(0.1, g.player.pos, tr.period || 'dal'); T.update(0.1, g.player.pos); worst = Math.max(worst, performance.now() - t0);
      }
      return { worst, j: T.jstats, n: T.list.filter(t => t.journey).length, states: T.list.filter(t => t.journey).map(t => t.state) };
    });
    R.msPerTick.push(r.worst); R.j = r.j;
    if (k % 20 === 0) console.log(k, JSON.stringify(r.j), r.n, JSON.stringify(r.states));
  }
  // controles op het logboek van elke reiziger: instappen alleen in de geplande lijn, uitstappen aan de geplande halte
  R.check = await p.evaluate(() => {
    const g = window.blokGame(), T = g.travelers, tr = g.traffic, out = { ingestapt: 0, juisteLijn: 0, uitgestaptZichtbaar: 0, juisteHalte: 0, fouten: [] };
    const all = [...T.list, ...(T.done15 || [])];
    for (const t of T.journeyLog || []) {
      const rides = t.steps.filter(s => s.ride).map(s => s.ride);
      for (const h of t.hist) {
        if (h.wat === 'ingestapt') { out.ingestapt++; if (rides.some(r => r.line === h.lijn && r.board === h.halte)) out.juisteLijn++; else out.fouten.push({ r: t.id, h, plan: rides.map(r => r.line + '@' + r.board) }); }
        if (h.wat === 'uitgestapt' && !h.opAfstand) { out.uitgestaptZichtbaar++; if (rides.some(r => r.alight === h.halte)) out.juisteHalte++; else out.fouten.push({ r: t.id, h, plan: rides.map(r => r.line + '>' + r.alight) }); }
      }
    }
    // bezetting: geen negatieve ritten, en reizigers op afstand tellen mee
    const trips = tr.trips.list(); out.negatief = trips.filter(T2 => T2.occ < 0).length; out.opAfstandInRit = trips.reduce((a, T2) => a + (T2.remote || 0), 0);
    out.stats = { paden: T.stats.paden, nietBeloopbaar: T.stats.nietBeloopbaar, grootsteStap: T.stats.grootsteStap, grootsteHoogtestap: T.stats.grootsteHoogtestap };
    out.voorbeeld = (T.journeyLog || []).filter(t => t.hist.some(h => h.wat === 'ingestapt')).slice(0, 2).map(t => ({ type: t.type, plan: t.journey0, stappen: t.hist.map(h => h.wat + (h.halte ? ' @' + h.halte : '') + (h.lijn ? ' ' + h.lijn : '') + (h.opAfstand ? ' (op afstand)' : '')) }));
    return out;
  });
  const sorted = [...R.msPerTick].sort((a, b) => a - b); R.p95ms = sorted[Math.floor(sorted.length * 0.95)];
  console.log('reizen:', JSON.stringify({ j: R.j, check: R.check, p95ms: R.p95ms }));
  const j = R.j, c = R.check;
  const ok = j.gestart >= 5 && j.vanuitDeur >= 1 && c.ingestapt >= 2 && c.juisteLijn === c.ingestapt && c.juisteHalte === c.uitgestaptZichtbaar && j.opAfstand >= 1 && j.aangekomen >= 1
    && c.negatief === 0 && c.stats.nietBeloopbaar === 0 && c.stats.grootsteStap <= 1.5 && c.stats.grootsteHoogtestap <= 1 && R.p95ms < 40;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
