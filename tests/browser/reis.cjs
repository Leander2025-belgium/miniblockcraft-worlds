// TERRANOVA 14 — een volledige reis met overstap door reizigers-AI (js/travelers.js) in Megatower City:
// straat bij Oude Markt → trap af naar het metroperron → metro M1 richting Megatower (juiste richting) → uitstappen
// in Metro Megatower → trappen op naar de straat → bushalte Megatower Plaza → bus → uitstappen aan de volgende halte.
// Controles: elk punt van elk looppad is beloopbaar (vaste grond, 2 blokken lucht), elke stap ≤ 1,5 m horizontaal en
// ≤ 1 blok hoog; nooit in een muur; geen sprong in de positie (behalve meerijden met het voertuig, dat ook gemeten
// wordt); juiste voertuig (lijn en richting); bezetting +1 bij instappen en −1 bij uitstappen; in- en uitstappen
// naast het voertuig. De simulatie loopt versneld (stappen van 0,1 s) met de echte wereld, het echte verkeer en de
// echte ritten; de camera volgt de reiziger zodat de wereld en het verkeer rond hem geladen zijn.
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
  // camera naar een plek, wachten tot de wereld en het verkeer daar geladen zijn
  const goto = async (x, z) => {
    await p.evaluate(([x, z]) => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(x, g.meta.ground + 30, z); g.updateTiles(true); }, [x, z]);
    for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 30; })) break; }
  };
  // de hele strook Oude Markt – Megatower laden (de versnelde simulatie rijdt sneller dan het spel tegels laadt)
  await p.evaluate(() => { const g = window.blokGame(); g.settings.view = 700; });
  await goto(4672, 5120);
  await p.evaluate(() => { const g = window.blokGame(); g.traffic.rebuild(g.world.tiles, g.player.pos); });
  await goto(4160, 5120);
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.blokGame().traffic.stops.some(s => s.name === 'Metro Oude Markt'))); i++) await p.waitForTimeout(1000);
  const setup = await p.evaluate(() => {
    const g = window.blokGame(), tr = g.traffic, T = g.travelersOn(), ground = g.meta.ground;
    const om = tr.stops.find(s => s.name === 'Metro Oude Markt');
    // vertrek: op straat, 40 m van de metrohalte (de reiziger moet zelf de ingang en de trap vinden)
    let from = null; for (let r = 30; r < 90 && !from; r += 6) for (let a = 0; a < 6.28 && !from; a += 0.4) { const q = T.nav.snap(om.x + Math.cos(a) * r, ground + 1, om.z + Math.sin(a) * r, 2); if (q && q.y >= ground - 1) from = q; }
    const MT = { x: 40 * 128 + 64, z: 40 * 128 };
    window.__R = T.add({ from, type: 'pendelaar', steps: [
      { ride: { kind: 'metro', line: 'M1', board: 'Metro Oude Markt', alight: 'Metro Megatower', toward: MT, wait: { x: om.x, y: om.y + 1, z: om.z } } },
      { walk: { x: MT.x, y: ground + 1, z: MT.z - 70 } }, // naar boven, de straat op (richting bushalte)
    ] });
    g.running = false; cancelAnimationFrame(g.raf); // eigen, versnelde simulatie
    return { from, metrohalte: [om.x, om.y, om.z], ground };
  });
  const R = { start: setup };
  // versneld simuleren: verkeer, bushaltes, reizigers; de camera volgt de reiziger
  const sim = (sec) => p.evaluate((sec) => {
    const g = window.blokGame(), tr = g.traffic, T = g.travelers, t = window.__R, out = { jumps: [], track: [] };
    for (let i = 0; i < sec * 10; i++) {
      const before = { x: t.x, y: t.y, z: t.z, st: t.state };
      tr.update(0.1, g.player.pos, 1, 8); g.updateBusPax(0.1, 1); T.update(0.1, g.player.pos);
      const d = Math.hypot(t.x - before.x, t.z - before.z), dy = Math.abs(t.y - before.y);
      if (t.state !== 'aan boord' && before.st !== 'aan boord' && (d > 0.3 || dy > 1.01)) out.jumps.push({ d: +d.toFixed(2), dy, st: t.state });
      if (i % 10 === 0) out.track.push([+t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1), t.state]);
      if (t.done || t.state === 'geen pad' || t.state === 'gestrand') break;
    }
    g.player.pos.set(t.x, Math.max(t.y + 25, g.meta.ground + 25), t.z);
    if (g.world.tiles.size !== window.__nT) { window.__nT = g.world.tiles.size; tr.rebuild(g.world.tiles, g.player.pos); } // net bijwerken als er tegels bij zijn
    g.updateTiles(); for (let q = 0; q < 400 && g.queue.length; q++) g.buildSome();
    return { state: t.state, i: t.i, pos: [Math.round(t.x), Math.round(t.y), Math.round(t.z)], jumps: out.jumps, track: out.track };
  }, sec);
  const jumps = [], states = [];
  for (let k = 0; k < 240; k++) {
    const r = await sim(15);
    jumps.push(...r.jumps); if (states[states.length - 1] !== r.state) states.push(r.state);
    if (process.env.DBG) console.log(k, r.state, r.pos.join(','), JSON.stringify(await p.evaluate(() => { const v = window.__R.vehicle; const tr = window.blokGame().traffic; return v ? { atStop: v.atStop, v: +v.v.toFixed(1), wait: v.wait && +v.wait.toFixed(1), doors: v.doorsOpen, dead: !!v.dead, next: (tr.nextStop(v) || {}).name } : { tegels: window.blokGame().world.tiles.size, metros: tr.agents.filter(a => a.kind === 'metro' && !a.dead).map(a => { const h = tr.behind(a, 0, {}), e = tr.behind(a, a.L, {}); return [Math.round(h.x), Math.round(h.z), Math.sign(h.x - e.x), a.atStop, +a.v.toFixed(1), !!a.doorsOpen]; }) }; })));
    if (['aangekomen', 'geen pad', 'gestrand'].includes(r.state)) break;
    await p.waitForTimeout(300); // tegels laden
  }
  // eerste deel klaar: daarna de bus vanaf de dichtste bushalte (naar de volgende halte)
  const t1 = await p.evaluate(() => { const t = window.__R; return { state: t.state, hist: t.hist }; });
  R.metro = t1.hist.filter(h => h.wat !== 'vertrek');
  if (t1.state === 'aangekomen') {
    await p.evaluate(() => {
      const g = window.blokGame(), tr = g.traffic, T = g.travelers, t = window.__R;
      const bs = tr.stops.filter(s => s.kind === 'busstop').sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z))[0];
      t.steps.push({ ride: { kind: 'bus', board: bs.name, alight: '*', wait: { x: bs.x, y: bs.y + 1, z: bs.z } } }); t.done = false; t.state = 'volgende';
      window.__bus = bs.name;
    });
    for (let k = 0; k < 240; k++) {
      const r = await sim(15);
      jumps.push(...r.jumps); if (states[states.length - 1] !== r.state) states.push(r.state);
      if (['aangekomen', 'geen pad', 'gestrand'].includes(r.state)) break;
      await p.waitForTimeout(300);
    }
  }
  // alle looppaden nakijken in de echte blokken
  R.controle = await p.evaluate(() => {
    const g = window.blokGame(), t = window.__R, c = t.check || {};
    return { paden: (t.paths || []).length, punten: c.punten, nietBeloopbaar: c.nietBeloopbaar, grootsteStap: +(c.grootsteStap || 0).toFixed(2), grootsteHoogtestap: c.grootsteHoogtestap, laagste: Math.min(...(t.paths || []).flat().map(q => q.y)), hoogste: Math.max(...(t.paths || []).flat().map(q => q.y)), eind: t.state, bus: window.__bus || null, stappen: t.hist.map(h => h.wat + (h.halte ? ' @' + h.halte : '') + (h.bezettingVoor != null ? ` (${h.bezettingVoor}→${h.bezetting})` : '') + (h.afstandTotDeur != null ? ` ${h.afstandTotDeur} m` : '')) };
  });
  R.sprongen = jumps.length; R.voorbeeldSprong = jumps[0] || null; R.toestanden = states;
  const H = (await p.evaluate(() => window.__R.hist));
  const ins = H.filter(h => h.wat === 'ingestapt'), uit = H.filter(h => h.wat === 'uitgestapt');
  const occOk = ins.every(h => h.bezetting === h.bezettingVoor + 1) && uit.every(h => h.bezetting === h.bezettingVoor - 1);
  const metroIn = ins.find(h => h.lijn === 'M1'), metroUit = uit[0];
  console.log('reis:', JSON.stringify(R));
  const ok = R.controle.eind === 'aangekomen' && R.controle.nietBeloopbaar === 0 && R.controle.grootsteStap <= 1.5 && R.controle.grootsteHoogtestap <= 1 && !R.sprongen
    && ins.length === 2 && uit.length === 2 && occOk && metroIn && metroUit && metroUit.halte === 'Metro Megatower' && ins.concat(uit).every(h => h.afstandTotDeur <= 4)
    && R.controle.laagste < setup.ground - 10 && R.controle.hoogste >= setup.ground - 1;
  console.log('bezetting klopt:', occOk, '· alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
