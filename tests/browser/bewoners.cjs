// TERRANOVA 16 fase 5 — bewoners met een dagritme (js/society.js): de bevolking komt uit de echte percelen van
// Megatower City, elke bewoner heeft een sluitende dagplanning, de reizigers die rond de speler verschijnen zijn
// bewoners met een echte verplaatsing (naam, beroep, doel, vertrek of aankomst in de buurt), de drukte volgt het uur
// (spits > nacht) en het weekend verschilt, en het scherm Bewoners toont dit alles.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 640 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 8.3, cycle: false, quality: 'fast', auto: false, view: 64, dag: 2 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.travelers && g.travelers.society && g.travelers.journey; }, null, { timeout: 240000 });
  // bij het centraal station: veel woningen en kantoren in de buurt
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(38 * 128 + 64, g.meta.ground + 2, 47 * 128 - 40); g.tiled.aheadKey = null; g.updateTiles(true); });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  const R = {};
  R.model = await p.evaluate(() => {
    const S = window.blokGame().society, soc = S.soc, n = soc.people.length;
    let gaten = 0; for (const q of soc.people) for (const d of [2, 6]) { const pl = soc.plan(q, d); let t = 0; for (const s of pl) { if (s.van - t > 0.01) gaten++; t = Math.max(t, s.tot); } if (t < 23.99) gaten++; }
    const sum = (c) => Object.values(c).reduce((a, b) => a + b, 0);
    const c3 = soc.census(3, 2), c8 = soc.census(8.3, 2), c12 = soc.census(12, 2), z12 = soc.census(12, 6);
    const jobs = {}; for (const q of soc.people) jobs[q.job] = (jobs[q.job] || 0) + 1;
    return { n, gaten, som: [sum(c3), sum(c8), sum(c12)], nacht: c3, spits: c8, middag: c12, zaterdag: z12, jobs, drukte: { '3u': +soc.busyFactor(3, 2).toFixed(2), '8u': +soc.busyFactor(8.3, 2).toFixed(2), '17u30': +soc.busyFactor(17.5, 2).toFixed(2) } };
  });
  // het spel laten lopen: reizigers verschijnen (bewoners met een verplaatsing)
  await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.setPaused(false); g.showOverlay(null); });
  // dezelfde functie als de spellus (spawnTick → spawnJourney), hier rechtstreeks: de speltijd loopt in deze testbrowser te traag
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => { const g = window.blokGame(), T = g.travelers; if (!T.planBusy) T.spawnJourney(g.player.pos); });
    await p.waitForTimeout(700);
    if (await p.evaluate(() => window.blokGame().travelers.list.filter(t => t.who).length >= 3)) break;
  }
  R.reizigers = await p.evaluate(() => {
    const g = window.blokGame(), T = g.travelers, soc = g.society.soc, pos = g.player.pos;
    const ws = T.list.filter(t => t.who);
    return { totaal: T.list.length, bewoners: ws.length, stats: g.society.stats, voorbeelden: ws.slice(0, 4).map(t => {
      const q = soc.people.find(x => x.id === t.who.id), pl = soc.plan(q, 2), cd = (a) => { const d = ((a % 24) + 24) % 24; return Math.min(d, 24 - d); }, s = pl.find(s => s.act === 'onderweg' && cd(8.3 - s.van) < 1.5);
      const dHome = s ? Math.min(Math.hypot(s.at.x - pos.x, s.at.z - pos.z), Math.hypot(s.naar.x - pos.x, s.naar.z - pos.z)) : null;
      const verwacht = s ? soc.purpose(pl, s) : null;
      return { naam: t.who.naam, beroep: t.who.beroep, doel: t.who.doel, verwacht, staat: t.state, ritten: t.journey && t.journey.ritten, klopt: !!s, afstandTotPlek: dHome && Math.round(dHome) };
    }) };
  });
  // scherm Bewoners
  await p.evaluate(() => { const g = window.blokGame(); g.setPaused(true); g.showOverlay('pause'); });
  await p.evaluate(() => document.getElementById('btn-society').click());
  await p.waitForFunction(() => window.__society && document.querySelectorAll('.soc-person').length > 0, null, { timeout: 30000 });
  R.scherm = await p.evaluate(() => ({ zichtbaar: !document.getElementById('ov-society').hidden, balken: document.querySelectorAll('.soc-bar').length, personen: document.querySelectorAll('.soc-person').length, tekst: document.getElementById('soc-body').textContent.slice(0, 160), onderweg: window.__society.onderweg }));
  await p.evaluate(() => { const s = document.getElementById('soc-dow'); s.value = '6'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(800);
  R.scherm.zaterdag = await p.evaluate(() => ({ dag: window.__society.dow, tekst: /zaterdag/.test(document.getElementById('soc-body').textContent) }));
  console.log('bewoners:', JSON.stringify(R));
  const M = R.model;
  const ok = M.n === 12000 && M.gaten === 0 && M.som.every(v => v === 12000)
    && M.nacht.slapen > 9000 && M.spits.onderweg > 300 && M.middag.werk > 4500 && M.zaterdag.werk < M.middag.werk / 3 && M.zaterdag.winkelen > M.middag.winkelen
    && M.drukte['8u'] > 2 * M.drukte['3u'] && M.drukte['17u30'] > 2 * M.drukte['3u']
    && Object.keys(M.jobs).length >= 8
    && R.reizigers.bewoners >= 2 && new Set(R.reizigers.voorbeelden.map(v => v.naam)).size === R.reizigers.voorbeelden.length && R.reizigers.voorbeelden.every(v => v.naam && v.beroep && v.doel && v.klopt && v.doel === v.verwacht && v.afstandTotPlek < 450)
    && R.scherm.zichtbaar && R.scherm.balken === 7 && R.scherm.personen >= 6 && R.scherm.zaterdag.dag === 6 && R.scherm.zaterdag.tekst;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
