// TERRANOVA 16 fase 4 — treinbeveiliging in het spel: zelf een metro besturen in Megatower City (zelfde
// rijdynamica als de spellus, versneld). Volle tractie zonder remmen: de ATB waarschuwt (bel) en remt de metro zelf
// af tot onder de toegestane snelheid; het dashboard toont sein, toegestane snelheid en de ingreep; bij een tijdige
// rem geen ingreep; de waakinrichting remt na 65 s zonder bediening en B bevestigt.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 13, cycle: false, quality: 'fast', auto: false, view: 96, bewoners: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 240000 });
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(5337, g.meta.ground - 17, 5116); g.tiled.aheadKey = null; g.updateTiles(true); });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.traffic.agents.some(a => a.kind === 'metro' && !a.dead); })) break; }
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), tr = g.traffic, { Drive } = await import('./js/drive.js');
    g.running = false; cancelAnimationFrame(g.raf);
    const a = tr.agents.find(x => x.kind === 'metro' && !x.dead); if (!a) return { error: 'geen metro' };
    for (const o of tr.agents) if (o !== a && (o.kind === 'metro' || o.kind === 'train' || o.kind === 'tram')) o.dead = true; // vrij spoor (zoals treinsim.cjs): geen rood sein door een ander voertuig
    tr.sweepDead?.();
    g.drive = new Drive(g, a, 'drive'); const d = g.drive, c = a.player, out = {};
    const step = (n, keys) => { for (let i = 0; i < n; i++) { for (const k of ['KeyW', 'KeyS']) g.keys.delete(k); for (const k of keys) g.keys.add(k); tr.update(0.1, g.player.pos, 1, 13); d.update(0.1); } };
    // 1. volle tractie, nooit remmen: waarschuwing, dan ingreep van de ATB
    // tot 4 pogingen: komt de metro aan het einde van zijn lijn, dan andere cabine (R) en opnieuw
    let maxV = 0, warned = false, forced = false, vAtForce = null, events = new Set(); const trace = [], pogingen = [];
    for (let attempt = 0; attempt < 4 && !forced; attempt++) {
      if (a.endOfLine || attempt) { a.v = 0; c.throttle = 0; d.safety.forced = null; d.key('KeyR'); step(3, []); }
      a.v = 25; // 90 km/h: boven de lijnsnelheid (80) + marge
      for (let i = 0; i < 200 && !forced && !a.endOfLine; i++) { step(1, ['KeyW']); const st = d.safety.state; if (i % 10 === 0) trace.push([attempt, i / 10, Math.round(a.v * 3.6), st.allowedKmh, st.aspect, st.sigDist]); maxV = Math.max(maxV, a.v); if (st.warn) warned = true; if (st.forced === 'atb') { forced = true; vAtForce = a.v; } if (st.event) events.add(st.event); }
      pogingen.push(a.endOfLine ? 'einde lijn' : forced ? 'ingreep' : 'geen');
    }
    let vMin = vAtForce; for (let i = 0; i < 80; i++) { step(1, ['KeyW']); vMin = Math.min(vMin, a.v); } // ATB remt, ook met de hendel op tractie
    const st1 = d.safety.state;
    out.trace = trace.slice(0, 40); out.negeren = { pogingen,  maxKmh: Math.round(maxV * 3.6), gewaarschuwd: warned, ingreep: forced, kmhBijIngreep: vAtForce && Math.round(vAtForce * 3.6), laagsteKmhDaarna: Math.round(vMin * 3.6), toegestaan: st1.allowedKmh, beeld: st1.aspect, log: { ...d.safety.log }, hud: (d.hud && d.hud.textContent || '').match(/sein \w+ over \d+ m · toegestaan \d+ km\/h/)?.[0] || null };
    // 2. waakremming in het spel (de timer zelf: tools/check-atb.mjs): de metro rijdt, de beveiliging staat op
    //    'waakremming' → de verkeerssimulatie remt tot stilstand, ook met de hendel op tractie; B geeft vrij
    step(5, []); if (a.endOfLine) { d.key('KeyR'); step(2, []); }
    a.v = 12; d.safety.forced = 'waak'; d.safety.sifaT = 66; d.safety.sifaWarn = true;
    let t0 = null; for (let i = 0; i < 300 && a.v > 0.05; i++) { step(1, ['KeyW']); if (i === 0) t0 = d.hud && d.hud.textContent; }
    out.waak = { stil: a.v < 0.1, forced: d.safety.state.forced, hud: /WAAK/.test(t0 || '') };
    d.key('KeyB'); step(2, []); out.waak.naB = d.safety.state.forced;
    // 3. de waaktimer loopt echt in het spel: 20 s rijden met de hendel vast (geen nieuwe bediening)
    if (a.endOfLine) { d.key('KeyR'); step(2, []); }
    a.v = 8; g.keys.delete('KeyS'); g.keys.add('KeyW'); d.update(0.1); d.safety.sifaT = 0; let minV = 99;
    let streak = 0, longest = 0, maxSifa = 0;
    for (let i = 0; i < 200; i++) { tr.update(0.1, g.player.pos, 1, 13); d.update(0.1); minV = Math.min(minV, a.v); streak = a.v >= 0.5 ? streak + 1 : 0; longest = Math.max(longest, streak); maxSifa = Math.max(maxSifa, d.safety.sifaT); }
    g.keys.delete('KeyW');
    out.waakTimer = { rijdend_s: longest / 10, timerMax_s: +maxSifa.toFixed(1), na20s: +d.safety.sifaT.toFixed(1), laagsteKmh: Math.round(minV * 3.6), throttle: +c.throttle.toFixed(2), deuren: !!c.doors };
    return out;
  });
  console.log('atb16:', JSON.stringify(R));
  const N = R.negeren || {};
  const ok = !R.error && N.gewaarschuwd && N.ingreep && N.log.ingrepen >= 1 && N.laagsteKmhDaarna <= N.toegestaan && N.hud
    && R.waakTimer.rijdend_s >= 3 && R.waakTimer.timerMax_s >= R.waakTimer.rijdend_s - 0.4 && R.waak.stil && R.waak.forced === 'waak' && R.waak.hud && R.waak.naB === null;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
