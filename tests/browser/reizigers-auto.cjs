// TERRANOVA 14.1 — reizigers verschijnen vanzelf rond de speler (js/travelers.js spawnTick) in Megatower City.
// Versnelde simulatie met de echte wereld, het echte verkeer en de echte ritten bij Westpoort (bus en metro; sinds de
// vaste buslijnen van 14.2 ligt er bij Oude Markt geen bushalte meer binnen 120 m, alleen de metro):
// controles: er verschijnen reizigers, ze stappen in en uit (bezetting van de rit ±1), elk looppad is beloopbaar
// (vaste grond, 2 blokken lucht, stappen ≤ 1,5 m en ≤ 1 blok), het aantal blijft binnen het maximum per periode,
// en de A*-kost per frame blijft klein.
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
  await p.evaluate(() => { const g = window.blokGame(); g.settings.view = 420; g.player.fly = true; g.player.pos.set(720, g.meta.ground + 30, 5120); g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 30; })) break; }
  await p.evaluate(() => { const g = window.blokGame(); g.traffic.rebuild(g.world.tiles, g.player.pos); g.running = false; cancelAnimationFrame(g.raf); });
  const R = { max: 0, spitsMax: 14, msPerTick: [] };
  for (let k = 0; k < (+process.env.N || 90); k++) {
    const r = await p.evaluate(() => {
      const g = window.blokGame(), tr = g.traffic, T = g.travelersOn(); let worst = 0;
      for (let i = 0; i < 100; i++) {
        tr.update(0.1, g.player.pos, 1, 8); g.updateBusPax(0.1, 1);
        const t0 = performance.now(); T.spawnTick(0.1, g.player.pos, tr.period || 'dal'); T.update(0.1, g.player.pos); worst = Math.max(worst, performance.now() - t0);
      }
      return { n: T.list.filter(t => t.auto).length, worst, stats: T.stats, states: T.list.filter(t => t.auto).map(t => t.state) };
    });
    R.max = Math.max(R.max, r.n); R.msPerTick.push(+r.worst.toFixed(1)); R.stats = r.stats; R.states = r.states;
    if (process.env.DBG) console.log(k, r.n, JSON.stringify(r.stats), r.states.join(","), JSON.stringify(await p.evaluate(() => { const T = window.blokGame().travelers; return T.list.filter(t => t.auto).map(t => { const R = t.steps[t.i]?.ride; const v = t.vehicle; return t.state === "aan boord" ? { ab: v.kind, at: v.atStop, w: +(v.wait || 0).toFixed(1), v: +v.v.toFixed(1), dead: !!v.dead, lk: v.lastStop, bk: t.boardKey } : R ? { wacht: R.kind + ":" + R.board, wt: Math.round(t.waitT || 0) } : t.state; }); })));
  }
  if (process.env.DBG3) console.log(JSON.stringify(await p.evaluate(() => { const g = window.blokGame(), tr = g.traffic, P = g.player.pos; const out = {}; for (const e of tr.net.edges.values()) { if (!e.stops.length) continue; for (const sd of e.stops) { const k = e.net; (out[k] || (out[k] = [])).push(Math.round(Math.hypot(e.pts[0] - P.x, e.pts[2] - P.z))); } } const served = [...tr.served.values()].map(q => q.kind + ':' + Math.round(Math.hypot(q.x - P.x, q.z - P.z))); return { out, served, tiles: g.world.tiles.size }; })));
  if (process.env.DBG4) console.log(JSON.stringify(await p.evaluate(() => { const g = window.blokGame(), T = g.travelers, P = g.player.pos; return T.list.filter(t => t.auto).map(t => ({ s: t.state, i: t.i, n: t.steps.length, d: Math.round(Math.hypot(t.x - P.x, t.z - P.z)), pi: t.pi, pl: t.path && t.path.length, last: t.hist.slice(-2).map(h => h.wat + '@' + h.t) })); })));
  if (process.env.DBG2) console.log(JSON.stringify(await p.evaluate(() => { const g = window.blokGame(), tr = g.traffic, T = g.travelers; return T.list.filter(t => t.state === 'aan boord').map(t => { const v = t.vehicle; return { line: v.line, seq: v.stopSeq, bseq: t.boardSeq, route: v.route.map(r => ({ id: r.e.id, net: r.e.net, len: Math.round(r.e.len), stops: r.e.stops, dir: r.dir })).slice(0, 6), d: Math.round(v.d), pos: [Math.round(t.x), Math.round(t.z)] }; }); }), null, 0));
  // bezetting: elke instap/uitstap van een rit telt ±1 in de ritlaag
  R.occ = await p.evaluate(() => { const T = window.blokGame().travelers; const h = T.log.filter(e => e.wat === 'ingestapt' || e.wat === 'uitgestapt'); return { n: h.length, ok: h.every(e => e.bezettingVoor == null || e.bezetting === e.bezettingVoor + (e.wat === 'ingestapt' ? 1 : -1) || (e.wat === 'ingestapt' && e.bezetting === e.bezettingVoor)), deur: Math.max(0, ...h.map(e => e.afstandTotDeur || 0)), fout: h.filter(e => !(e.bezettingVoor == null || e.bezetting === e.bezettingVoor + (e.wat === 'ingestapt' ? 1 : -1) || (e.wat === 'ingestapt' && e.bezetting === e.bezettingVoor))).slice(0, 4) }; });
  const s = R.stats, sorted = [...R.msPerTick].sort((a, b) => a - b);
  R.p95ms = sorted[Math.floor(sorted.length * 0.95)];
  // types (TERRANOVA 14.2): beperkte mobiliteit nooit een trap en nooit metro/trein; toeristen pauzeren; elk type komt voor
  const TY = s.types || {};
  R.types = Object.fromEntries(Object.entries(TY).map(([k, v]) => [k, { v: v.verschenen, in: v.ingestapt, uit: v.uitgestapt, op: v.opgegeven, treden: v.treden, hs: v.grootsteHoogtestap, pauzes: v.pauzes, soorten: v.soorten }]));
  const typesOk = Object.keys(TY).length >= 5 && (!TY.beperkt || (TY.beperkt.treden === 0 && !TY.beperkt.soorten.metro && !TY.beperkt.soorten.train)) && (!TY.toerist || !TY.toerist.paden || TY.toerist.pauzes > 0);
  console.log('reizigers-auto:', JSON.stringify({ ...R, msPerTick: undefined }));
  const ok = typesOk && s.verschenen >= 10 && (s.ingestapt || 0) >= 3 && (s.uitgestapt || 0) >= 1 && s.aangekomen >= 1 /* metro-reizigers rijden meestal buiten beeld verder (volgende halte ±1 km); uitstappen aan een halte bewijst ook reis.cjs */ && s.nietBeloopbaar === 0 && s.grootsteStap <= 1.5 && s.grootsteHoogtestap <= 1 && R.max <= R.spitsMax && R.occ.ok && R.occ.deur <= 4;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
