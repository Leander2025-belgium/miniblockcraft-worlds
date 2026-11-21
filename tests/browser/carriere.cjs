// TERRANOVA 15 — carrièremodus (js/career.js).
// 1. Bouwopdrachten op echt geplaatste blokken: een lege plek telt niet; een woning (dichte ruimte met deur, ramen en
//    dak) wel; een bushalte naast de weg; een appartement pas vanaf level 2 en alleen met meubels in de ruimte.
// 2. Diensten: de beoordeling van een busdienst en een treindienst met nagebootste bestuurderstoestand (snelheid,
//    deuren, haltes, rode lichten, noodrem). Het echte rijden zelf testen bushalte.cjs en treinsim.cjs.
// 3. Voortgang (XP, level, geschiedenis, opdrachten) blijft bewaard na herladen; sandbox: zonder dienst geen HUD.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.removeItem('terranova-career'); localStorage.removeItem('terranova-career-placed'); localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 12, cycle: false, weather: 'clear', weatherSet: true, view: 64, quality: 'fast', auto: false })); });
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.career; }, null, { timeout: 180000 });
  // naar een grasveld in de villawijk (vlak, bij een laan), wachten tot de tegels er zijn
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(1290 + 14 + 32, g.meta.ground + 1, 1280 + 14 + 38); g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  const R = await p.evaluate(() => {
    const g = window.blokGame(), C = g.career, G = g.meta.ground, B = window.__B || null;
    g.running = false; cancelAnimationFrame(g.raf);
    const P = g.player.pos, x0 = Math.floor(P.x) - 3, z0 = Math.floor(P.z) - 3, y0 = G;
    const set = (x, y, z, b) => { g.builder.begin(); g.builder.set(x, y, z, b); g.builder.commit(); };
    const out = { leeg: C.check('woning') };
    // bouwplek leegmaken (bomen, struiken van de villawijk)
    for (let x = x0 - 1; x <= x0 + 8; x++) for (let z = z0 - 1; z <= z0 + 7; z++) for (let y = y0; y < y0 + 12; y++) if (g.world.get(x, y, z)) set(x, y, z, 0);
    for (let x = x0 - 1; x <= x0 + 8; x++) for (let z = z0 - 1; z <= z0 + 7; z++) if (!g.world.solidAt(x, y0 - 1, z)) set(x, y0 - 1, z, 3);
    // woning: 6 × 5 binnen (vloer op straatniveau), muren 3 hoog, deur, 2 ramen, plat dak
    const ID = { wall: 8, glass: 10, door: 81, doorTop: 82, roof: 9, bed: 86, table: 90, chair: 89, lamp: 21, plank: 12, post: 30, sign: 112 };
    for (let x = x0; x <= x0 + 7; x++) for (let z = z0; z <= z0 + 6; z++) {
      const edge = x === x0 || x === x0 + 7 || z === z0 || z === z0 + 6;
      for (let y = y0; y < y0 + 3; y++) if (edge) {
        let b = ID.wall;
        if (z === z0 && x === x0 + 3) b = y === y0 ? ID.door : y === y0 + 1 ? ID.doorTop : ID.wall;
        else if (y === y0 + 1 && ((x === x0 + 5 && z === z0) || (x === x0 && z === z0 + 3))) b = ID.glass;
        set(x, y, z, b);
      }
      set(x, y0 + 3, z, ID.roof);
    }
    out.woning = C.check('woning'); out.xpNaWoning = C.p.xp; out.levelNaWoning = C.level;
    out.appartementTeVroeg = C.check('appartement');
    C.p.xp = Math.max(C.p.xp, 160); // level 2 (de gate zelf is hierboven getest)
    out.appartementLeeg = C.check('appartement');
    set(x0 + 2, y0, z0 + 4, ID.bed); set(x0 + 4, y0, z0 + 2, ID.table); set(x0 + 5, y0, z0 + 2, ID.chair); set(x0 + 4, y0 + 2, z0 + 3, ID.lamp);
    out.appartement = C.check('appartement');
    // busdienst: haltes bedienen, één keer door rood, één keer deuren open buiten een halte, te snel rijden
    const fake = { mode: 'drive', bus: true, car: { speed: 0, doorsOpen: false }, stop: null, reds: 0 };
    g.drive = fake; const s1 = C.startShift(); out.busStart = !!s1;
    const tick = (n, f) => { for (let i = 0; i < n; i++) { f && f(i); C.update(0.1); } };
    for (let k = 0; k < 4; k++) {
      tick(200, (i) => { fake.car.speed = Math.min(12, i * 0.1); g.player.pos.x += 0.6; });   // 20 s rijden (± 120 m)
      if (k === 1) fake.reds = 1;
      if (k === 2) tick(50, () => { fake.car.speed = 17; });                                     // te snel (61 km/h)
      fake.car.speed = 0; tick(10);
      if (k === 0) { fake.car.doorsOpen = true; tick(2); fake.car.doorsOpen = false; tick(2); } // deuren buiten de halte
      fake.stop = { d: 5, key: 'h' + k, name: 'Halte ' + k }; fake.car.doorsOpen = true; tick(30); fake.car.doorsOpen = false; fake.stop = null; tick(5);
    }
    out.busDienst = C.p.history[0];
    // treindienst: drie stations, één te laat, één noodremming
    const L = { stations: [{ name: 'A', s: 1000, len: 200 }, { name: 'B', s: 3000, len: 200 }, { name: 'C', s: 6000, len: 200 }] };
    const pt = { L, s: 0, dir: 1, v: 0, lim: 25, atStation: null, doors: false, emergency: false, atpWarn: false, tr: { name: 'IC 2105' }, id: 'speler' };
    g.alpRail = { player: pt }; g.drive = null;
    C.schedArrival = (q, st) => ({ A: 100, B: 260, C: 520 })[st.name]; let clock = 0; C.clock = () => clock;
    const s2 = C.startShift(); out.treinStart = !!s2;
    const drive = (to, late) => { while (pt.s < to - 2) { pt.v = Math.min(22, pt.v + 0.2); pt.s += pt.v * 0.1; clock += 0.1; C.update(0.1); } pt.v = 0; pt.s = to; clock = late; pt.atStation = L.stations.find(q => q.s === to); pt.doors = true; C.update(0.1); pt.doors = false; C.update(0.1); pt.atStation = null; };
    drive(1000, 100); pt.emergency = true; pt.v = 10; C.update(0.1); pt.emergency = false; drive(3000, 260 + 240); drive(6000, 520);
    out.treinDienst = C.p.history[0];
    g.alpRail = null; C.update(0.1); out.hudZonderDienst = document.getElementById('career-hud').hidden;
    out.profiel = { xp: C.p.xp, level: C.level, opdrachten: Object.keys(C.p.tasks), prestaties: C.p.achievements.map(a => a.name), geschiedenis: C.p.history.length };
    C.save();
    return out;
  });
  await p.reload();
  R.naHerladen = await p.evaluate(() => { const j = JSON.parse(localStorage.getItem('terranova-career') || '{}'); return { xp: j.xp, opdrachten: Object.keys(j.tasks || {}), geschiedenis: (j.history || []).length }; });
  console.log('carriere:', JSON.stringify(R, null, 1).slice(0, 5000));
  const bd = R.busDienst || {}, td = R.treinDienst || {};
  const ok = !R.leeg.ok && R.woning.ok && R.levelNaWoning >= 1 && !R.appartementTeVroeg.ok && !R.appartementLeeg.ok && R.appartement.ok
    && bd.resultaat === 'klaar' && bd.bediend === 4 && bd.straf.some(s => /rode licht/.test(s.wat)) && bd.straf.some(s => /buiten een halte/.test(s.wat)) && bd.teSnel_s >= 3 && bd.score < 100
    && td.resultaat === 'klaar' && td.bediend === 3 && td.straf.some(s => /noodrem/.test(s.wat)) && td.straf.some(s => /\+4 min/.test(s.wat))
    && R.hudZonderDienst && R.naHerladen.xp === R.profiel.xp && R.naHerladen.opdrachten.length >= 2 && R.naHerladen.geschiedenis === 2;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
