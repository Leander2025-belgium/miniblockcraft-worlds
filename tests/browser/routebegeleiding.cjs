// TERRANOVA 15 — routebegeleiding (js/routeguide.js) in Megatower City: de aanwijzing verandert met wat de speler doet.
// Stappen: lopen naar de halte → wachten → verkeerde lijn instappen (waarschuwing) → juiste lijn (meerijden) →
// uitstappen aan de juiste halte → (overstap) → wandelen → aankomen. Daarnaast: elders uitstappen geeft een nieuwe
// route vanaf die plek. Het instappen wordt hier nagebootst (de speler zit als passagier in een voertuig met die lijn);
// het echte instappen zelf testen bushalte.cjs en metro-interieur.cjs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 8, cycle: false, weather: 'clear', weatherSet: true, view: 64, quality: 'fast', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), m = await import('./js/megaplan.js'), G = await import('./js/routeguide.js'), P = g.player.pos; g.running = false; cancelAnimationFrame(g.raf); // spellus stil: de test bootst het instappen na
    const steps = [], say = (lbl) => { const t = guide.update(); steps.push({ lbl, staat: guide.state, tekst: t }); return t; };
    const from = { x: 3990, z: 5060, name: 'A' }, dest = { x: 6656, z: 7168, name: 'Bestemming' };
    P.set(from.x, P.y, from.z); g.player.yaw = 0;
    const plan = m.plan(from, dest, 8);
    const guide = new G.RouteGuide(g, plan, dest, (f) => m.plan(f, dest, 8));
    const rides = guide.rides.map(r => ({ lijn: r.line, mode: r.mode, van: r.from.name, naar: r.to.name }));
    const KIND = { metro: 'metro', trein: 'train', tram: 'tram', bus: 'bus' };
    say('start');
    for (let i = 0; i < guide.rides.length && i < 4; i++) {
      const Rd = guide.rides[i];
      P.set(Rd.from.x + 5, P.y, Rd.from.z); say('bij halte ' + (i + 1));
      g.drive = { mode: 'passenger', a: { kind: Rd.mode === 'bus' ? 'tram' : 'bus', line: 'X9' } }; say('verkeerde lijn');
      g.drive = { mode: 'passenger', a: { kind: KIND[Rd.mode], line: Rd.line } }; say('juiste lijn');
      P.set(Rd.to.x, P.y, Rd.to.z + 3); say('aan de uitstaphalte');
      g.drive = null; say('uitgestapt ' + (i + 1));
    }
    P.set(dest.x + 10, P.y, dest.z); const last = say('bij de bestemming');
    // elders uitstappen: nieuwe route vanaf daar
    const g2 = new G.RouteGuide(g, plan, dest, (f) => m.plan(f, dest, 8)); const R0 = g2.rides[0];
    P.set(R0.from.x, P.y, R0.from.z); g2.update(); g.drive = { mode: 'passenger', a: { kind: KIND[R0.mode], line: R0.line } }; g2.update();
    P.set((R0.from.x + R0.to.x) / 2 + 400, P.y, (R0.from.z + R0.to.z) / 2 + 400); g.drive = null; const before = g2.plan; g2.update();
    return { ritten: rides, stappen: steps.map(s => `${s.lbl}: ${s.staat} · ${s.tekst}`), klaar: guide.state, laatste: last, herpland: g2.plan !== before, logboek: g2.log.map(l => l.wat) };
  });
  console.log('routebegeleiding:', JSON.stringify(R, null, 1));
  const S = R.stappen.join('\n');
  const ok = R.ritten.length >= 1 && /Loop naar/.test(S) && /Wacht op/.test(S) && /niet /.test(S) && /Rij mee met/.test(S) && R.klaar === 'klaar' && R.laatste === null && R.herpland && R.logboek.includes('elders uitgestapt');
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
