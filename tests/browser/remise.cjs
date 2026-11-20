// TERRANOVA 14.1 — remises in Greenisland (js/depot.js, js/depotsim.js): 's nachts staan de treinstellen op de
// opstelsporen in de hal, een uitrukrit rijdt van de remise naar het perron en sluit aan op de trein van de
// dienstregeling; het depot-tabblad toont de remises. De klok wordt verzet met een verschuiving op Date.now.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOT = process.env.SHOT || null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // klok: lokale tijd op een gekozen uur (window.__setHour)
  await p.addInitScript(() => { const o = Date.now.bind(Date); window.__off = 0; Date.now = () => o() + window.__off; window.__setHour = (h) => { const t = o(), loc = ((t / 1000 - new Date().getTimezoneOffset() * 60) % 86400 + 86400) % 86400; window.__off = ((h * 3600 - loc) % 86400 + 86400) % 86400 * 1000; }; });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, cycle: false, quality: 'fast', weather: 'clear', weatherSet: true })); window.__setHour(3); });
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 180000 });
  await p.evaluate(() => window.__setHour(3));
  // naar Remise Southbay (IC1): boven de hal, schuin naar beneden kijken
  const where = await p.evaluate(async () => {
    const g = window.blokGame(), G = await import('./js/greenisland.js'), D = G.DEPOTS.find(d => d.name === 'Remise Southbay');
    const P = D.sidings[1], q = P.at(P.len - 110), b = P.at(P.len - 330);
    // schuin achter de keel, opzij van de sporen: de opstelsporen en de hal in beeld
    const pl = g.player; pl.fly = true; pl.pos.set(b.x - b.tz * D.side * 55, q.y + 28, b.z + b.tx * D.side * 55);
    pl.yaw = Math.atan2(-(q.x - pl.pos.x), -(q.z - pl.pos.z)); pl.pitch = -0.32;
    g.tiled.aheadKey = null; g.updateTiles(true);
    return { x: Math.round(q.x), z: Math.round(q.z) };
  });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 20; })) break; }
  await p.waitForTimeout(8000);
  await p.evaluate(() => { const g = window.blokGame(); g.showOverlay(null); });
  const R = { plek: where };
  R.nacht = await p.evaluate(() => { const g = window.blokGame(), T = [...g.alpRail.trains.keys()]; return { opgesteld: T.filter(k => k.startsWith('dep:')).length, rangeer: T.filter(k => k.startsWith('sh:')).length }; });
  if (SHOT) await p.screenshot({ path: SHOT });
  // de eerste uitrukrit van vandaag in Remise Southbay: halverwege en vlak voor de overdracht aan de dienstregeling
  const sh = await p.evaluate(() => { const g = window.blokGame(), plan = g.alpRail.depotPlans().find(q => q.D.name === 'Remise Southbay'); const s = plan.shunts.find(q => q.kind === 'uit' && q.t0 > 4 * 3600); return { t0: s.t0, t1: s.t1, sv: s.sv.id, k: s.k, rid: `${s.sv.id}${s.r.dir > 0 ? 'a' : 'b'}${s.k}` }; });
  R.uitrukken = { van: sh.t0, tot: sh.t1, dienst: sh.sv };
  const pos = async (h) => p.evaluate(([h, rid]) => { window.__setHour(h); const g = window.blokGame(); g.alpRail.update(0.016, 0); const T = [...g.alpRail.trains.entries()]; const s = T.find(([k]) => k.startsWith('sh:')), tt = T.find(([k]) => k === rid); const head = (tr) => tr && tr.cars[0] && tr.cars[0].grp.position; return { rangeer: s ? s[0] : null, kop: s ? [Math.round(head(s[1]).x), Math.round(head(s[1]).z)] : null, dienst: tt ? [Math.round(head(tt[1]).x), Math.round(head(tt[1]).z)] : null, opgesteld: T.filter(([k]) => k.startsWith('dep:')).length }; }, [h, sh.rid]);
  // de speler naar het station (de treinen worden binnen 3 km getoond)
  await p.evaluate(async () => { const g = window.blokGame(), G = await import('./js/greenisland.js'), D = G.DEPOTS.find(d => d.name === 'Remise Southbay'); const q = D.L.at(D.sEdge + D.e * 800); g.player.pos.set(q.x, q.y + 60, q.z); });
  R.halverwege = await pos(((sh.t0 + sh.t1) / 2) / 3600);
  // vlak voor en vlak na de overdracht (vertrek − 120 s): eerst de rangeerrit aan het perron, dan de trein van de dienstregeling op dezelfde plek
  const hand = await p.evaluate(() => { const g = window.blokGame(), plan = g.alpRail.depotPlans().find(q => q.D.name === 'Remise Southbay'); const s = plan.shunts.find(q => q.kind === 'uit' && q.t0 > 4 * 3600); return s.t - 120; });
  R.eind = await pos((hand - 2) / 3600);
  R.overdracht = await pos((hand + 2) / 3600);
  R.sprongBijOverdracht = R.eind.kop && R.overdracht.dienst ? Math.round(Math.hypot(R.eind.kop[0] - R.overdracht.dienst[0], R.eind.kop[1] - R.overdracht.dienst[1]) * 10) / 10 : null;
  R.nietDubbel = !(R.overdracht.rangeer && R.overdracht.dienst);
  // depot-tabblad
  R.tab = await p.evaluate(() => { const g = window.blokGame(), r = g.alpRail; r.tab = 'depot'; r.ovKind = 'trein'; const html = r.panelHtml ? r.panelHtml() : null; return null; });
  R.tabTekst = await p.evaluate(() => { const g = window.blokGame(), r = g.alpRail; r.openMap(); r.tab = 'depot'; r.ovKind = 'trein'; r.renderPanel(); const t = document.getElementById('ov-rail').textContent; g.resume(); return (t.match(/Remises met opstelsporen.{0,400}/) || [''])[0]; });
  console.log('remise:', JSON.stringify(R));
  const ok = R.nacht.opgesteld >= 2 && R.halverwege.rangeer && R.halverwege.kop && R.sprongBijOverdracht !== null && R.sprongBijOverdracht < 3 && R.nietDubbel && /Remise Southbay/.test(R.tabTekst);
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
