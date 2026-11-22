// TERRANOVA 16 fase 6 — reisplanner in de verkeerswerelden zonder eigen planner (echte OSM-steden; getest op het verkeersnet van Megatower City, want offline hebben alleen Megatower City en
// Greenisland een OV-net met haltes en Nova Metropool heeft er geen): over het
// geladen OV-net (metro, trein, tram, bus), met lopen en overstappen. Controles: er zijn haltes, een reis naar een
// verre halte gebruikt het OV en is sneller dan lopen, de stukken sluiten op elkaar aan (instaphalte = vorige
// uitstaphalte of overstap), een halte vlakbij = lopen, en het scherm in het pauzemenu werkt.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 12, cycle: false, quality: 'fast', auto: false, view: 320 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 300000 });
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(38 * 128 + 64, g.meta.ground + 30, 46 * 128); g.tiled.aheadKey = null; g.updateTiles(true); });
  for (let i = 0; i < 200; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0; })) break; }
  await p.evaluate(() => { const g = window.blokGame(); g.trafficDirty = true; g.traffic.rebuild(g.world.tiles, g.player.pos); });
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => { const g = window.blokGame(); g.traffic.rebuild(g.world.tiles, g.player.pos); return new Set(g.traffic.net.stops.map(s => s.name)).size >= 6; })) break; await p.waitForTimeout(2000); }
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), m = await import('./js/localplan.js'), G = m.buildGraph(g.traffic.net), pos = { x: g.player.pos.x, z: g.player.pos.z };
    const soorten = {}; for (const s of G.stops) soorten[s.mode] = (soorten[s.mode] || 0) + 1;
    // verste en dichtste halte
    const byD = G.stops.map(s => ({ s, d: Math.hypot(s.n.x - pos.x, s.n.z - pos.z) })).sort((a, b) => a.d - b.d);
    const ver = byD[byD.length - 1], dicht = byD[0];
    const t0 = performance.now(), r = m.planLocal(g.traffic.net, pos, ver.s.n.name, G), ms = performance.now() - t0;
    const rides = r.legs ? r.legs.filter(l => l.naam) : [];
    let aansluit = true; for (let i = 1; i < r.legs?.length; i++) { const a = r.legs[i - 1], c = r.legs[i]; if (a.naam && c.naam && a.naar !== c.van) aansluit = false; }
    const kort = m.planLocal(g.traffic.net, pos, { x: dicht.s.n.x + 30, z: dicht.s.n.z, name: 'vlakbij' }, G);
    return { haltes: G.stops.length, namen: G.names.length, soorten, ver: { naam: ver.s.n.name, afstand: Math.round(ver.d) }, plan: { minuten: r.minuten, lopenZouDuren: r.lopenZouDuren, ritten: r.ritten, overstappen: r.overstappen, legs: r.legs, ms: Math.round(ms), lopen: !!r.lopen }, aansluit, rides: rides.length, kort: { lopen: !!kort.lopen, minuten: kort.minuten }, tekst: m.planText(r).slice(0, 300) };
  });
  // het scherm
  await p.evaluate(() => { const g = window.blokGame(); g.setPaused(true); g.showOverlay('pause'); });
  R.knopInMegatower = await p.evaluate(() => !document.getElementById('btn-localplan').hidden); // Megatower City heeft de eigen planner: knop verborgen
  await p.evaluate(() => { document.getElementById('btn-localplan').hidden = false; });
  await p.evaluate(() => document.getElementById('btn-localplan').click());
  await p.waitForFunction(() => document.getElementById('lp-to').options.length >= 1 && /haltes geladen|Geen OV/.test(document.getElementById('lp-out').textContent), null, { timeout: 30000 });
  await p.evaluate((n) => { const s = document.getElementById('lp-to'); s.value = n; document.getElementById('lp-go').click(); }, R.ver.naam);
  await p.waitForTimeout(800);
  R.scherm = await p.evaluate(() => ({ zichtbaar: !document.getElementById('ov-localplan').hidden, uitvoer: document.getElementById('lp-out').textContent.slice(0, 200) }));
  console.log('planner-overal:', JSON.stringify(R));
  // de rekenkern zelf (overstappen, metro/tram/bus, sneller dan lopen) staat in tools/check-localplan.mjs; hier: het
  // echte net van het spel wordt een graaf met haltes, plannen lukt zonder fout en het scherm toont een reisadvies
  const ok = R.haltes > 5 && R.plan.minuten >= 0 && R.aansluit && R.kort.lopen && R.plan.ms < 2000
    && R.knopInMegatower === false && R.scherm.zichtbaar && /⏱|Te voet/.test(R.scherm.uitvoer);
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
