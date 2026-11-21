// TERRANOVA 15 — bezoekers in de Megatower (js/travelers.js towerTick): in de lobby (verdieping 0) en in de sky
// gardens lopen mensen rond over de echte vloer (A*), alleen op de verdieping van de speler. Controles: er komen
// bezoekers, ze bewegen, elk looppad is beloopbaar, niemand staat op een andere verdieping. SHOT=bestand.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 14, cycle: false, quality: 'fast', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.player && g.mega && g.traffic; }, null, { timeout: 180000 });
  const R = {};
  for (const [name, f] of [['lobby', 0], ['sky', 130]]) {
    await p.evaluate(async (f) => { const m = await import('./js/megatower.js'), g = window.blokGame(); g.seat = null; Object.assign(g.player, { fly: false, yaw: Math.PI, pitch: -0.15 }); g.player.pos.set(m.CX + 0.5, m.floorY(f), m.CZ - 14.5); g.player.vel.set(0, 0, 0); g.updateTiles(true); }, f);
    for (let i = 0; i < 300; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
    for (let i = 0; i < 60; i++) { const st = await p.evaluate(() => { const g = window.blokGame(); const T = g.travelersOn(); return { traffic: !!g.traffic, T: !!T, tower: !!(T && T.tower) }; }); if (st.tower) break; if (i === 59) console.log('toestand:', JSON.stringify(st)); await p.waitForTimeout(500); }
    R[name] = await p.evaluate(async (f) => {
      const g = window.blokGame(), T = g.travelersOn(), m = await import('./js/megatower.js'), y = m.floorY(f);
      const pos0 = new Map();
      for (let i = 0; i < 900; i++) { g.player.pos.y = y; T.spawnTick(0.1, g.player.pos, g.traffic.period || 'dal'); T.update(0.1, g.player.pos); if (i === 400) for (const t of T.list) if (t.towerF === f) pos0.set(t, [t.x, t.z]); }
      const V = T.list.filter(t => t.towerF === f), moved = V.filter(t => pos0.has(t) && Math.hypot(t.x - pos0.get(t)[0], t.z - pos0.get(t)[1]) > 1).length;
      return { zone: m.zoneOf(f), bezoekers: V.length, bewogen: moved, andereVerdieping: V.filter(t => Math.abs(t.y - y) > 1.5).length, toestanden: [...new Set(V.map(t => t.state))], nietBeloopbaar: T.stats.nietBeloopbaar || 0, grootsteHoogtestap: T.stats.grootsteHoogtestap || 0 };
    }, f);
    if (name === 'lobby') { await p.evaluate(() => { const g = window.blokGame(), T = g.travelers, V = T.list.filter(t => t.towerF === 0), c = V[0]; if (c) { g.player.yaw = Math.atan2(-(c.x - g.player.pos.x), -(c.z - g.player.pos.z)); g.player.pitch = -0.12; } T.update(0.05, g.player.pos); document.getElementById('ov-start').hidden = true; }); await p.waitForTimeout(1500); await p.screenshot({ path: process.env.SHOT || '/tmp/torenbezoekers.png', timeout: 240000 }); }
  }
  console.log('torenbezoekers:', JSON.stringify(R));
  const ok = R.lobby.bezoekers >= 5 && R.lobby.bewogen >= 2 && R.lobby.andereVerdieping === 0 && R.sky.bezoekers >= 3 && R.sky.andereVerdieping === 0 && R.sky.nietBeloopbaar === 0 && R.sky.grootsteHoogtestap <= 1;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
