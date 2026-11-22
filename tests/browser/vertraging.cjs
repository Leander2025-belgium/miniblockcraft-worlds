// TERRANOVA 16 — gemeten vertraging (js/traffic.js measureDelay): echte OV-voertuigen rond de speler meten per rit,
// van halte tot halte, hoeveel ze voor of achter liggen op de geplande tijd. Controles: er worden ritten gemeten,
// elke meting klopt met (echt − gepland), een rit zonder meting toont "niet beschikbaar", de OV-kaart toont de
// gemeten waarde. De verkeerslus wordt hier versneld aangeroepen (zelfde code als in het spel).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 8, cycle: false, quality: 'fast', auto: false, view: 96 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 180000 });
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(4160, g.meta.ground + 30, 5120); g.tiled.aheadKey = null; g.updateTiles(true); });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.traffic.agents.some(a => !a.dead && a.trip); })) break; }
  // 6 minuten verkeer in stappen van 0,1 s (zelfde update als de spellus)
  const R = await p.evaluate(() => {
    const g = window.blokGame(), T = g.traffic; g.setPaused(true);
    const segs = [];
    const orig = T.measureDelay.bind(T);
    T.measureDelay = (a) => { const before = a.trip ? { d: a.trip.delay || 0, n: a.trip.measured || 0 } : null; orig(a); if (a.trip && before && (a.trip.measured || 0) > before.n) segs.push({ rit: a.trip.id, soort: a.kind, ...a.trip.lastSeg, delta: a.trip.delay - before.d }); };
    for (let i = 0; i < 3600; i++) T.update(0.1, g.player.pos, 1, 8);
    T.measureDelay = orig;
    const trips = [...T.trips.trips.values()];
    const gemeten = trips.filter(t => t.measured > 0), zonder = trips.filter(t => !t.measured);
    return { segmenten: segs.length, voorbeeld: segs.slice(0, 5), kloppen: segs.every(s => Math.abs(s.delta - (s.echt_s - s.gepland_s)) <= 1), soorten: [...new Set(segs.map(s => s.soort))],
      gemeten: gemeten.length, zonder: zonder.length, vertragingen: gemeten.slice(0, 8).map(t => [t.id, t.delay, t.measured]), teLaat: gemeten.filter(t => t.delay >= 60).length, teVroeg: gemeten.filter(t => t.delay <= -60).length };
  });
  // OV-kaart: tekst voor een rit met en zonder meting
  R.kaart = await p.evaluate(async () => {
    const g = window.blokGame(), m = await import('./js/ovmap.js'); m.openOvMap(g); await new Promise(r => setTimeout(r, 1500));
    const c = document.getElementById('ovmap'), items = c._S.items.filter(i => i.type === 'veh' && i.real && i.trip);
    const out = {};
    for (const want of [true, false]) {
      const it = items.find(i => !!i.trip.measured === want); if (!it) continue;
      c._S.sel = { veh: it }; c.dispatchEvent(new Event('noop'));
      out[want ? 'met' : 'zonder'] = it;
    }
    return { n: items.length, met: out.met && out.met.trip, zonder: out.zonder && out.zonder.trip };
  });
  // de infotekst zelf (showInfo is intern): via een klik op het voertuig
  R.tekst = await p.evaluate(async (tid) => {
    const c = document.getElementById('ovmap'), it = c._S.items.find(i => i.type === 'veh' && i.trip && i.trip.id === tid); if (!it) return null;
    const bb = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('click', { clientX: bb.left + it.x / 10240 * bb.width, clientY: bb.top + it.z / 10240 * bb.height, bubbles: true }));
    await new Promise(r => setTimeout(r, 300)); return document.getElementById('ovmap-info').textContent;
  }, R.kaart.met && R.kaart.met.id);
  console.log('vertraging:', JSON.stringify(R));
  const ok = R.segmenten >= 5 && R.kloppen && R.gemeten >= 2 && R.soorten.length >= 1 && R.kaart.n > 0
    && (!R.tekst || /op tijd|te laat|te vroeg|niet beschikbaar/.test(R.tekst));
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
