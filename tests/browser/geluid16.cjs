// TERRANOVA 16 fase 10 — geluid: mixer met volume per categorie (bewaard in de instellingen), echt hoorbaar signaal
// (gemeten met een AnalyserNode achter de mixer), voetstappen per ondergrond, donder + bliksem bij onweer (niet bij
// 'minder beweging'), vogels overdag en krekels 's nachts, gong bij aankomst van een metro vlakbij (niet ver weg),
// demping bij sneeuw, piepende banden zonder grip, versnellingen van de motor.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 10, cycle: false, quality: 'fast', auto: false, view: 64 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  await p.keyboard.press('KeyQ'); // eerste toets: geluid mag starten
  await p.waitForFunction(() => { const g = window.blokGame(); return g.sounds && g.ambient && g.ambient.on; }, null, { timeout: 60000 });
  const R = {};
  R.mixer = await p.evaluate(async () => {
    const g = window.blokGame(), S = await import('./js/sound.js');
    document.getElementById('btn-settings')?.click();
    const el = document.getElementById('mix-voertuigen'); el.value = 30; el.dispatchEvent(new Event('input'));
    const st = S.mixState(), saved = JSON.parse(localStorage.getItem('blokstad-settings')).mix;
    return { voertuigen: st.gain && st.gain.voertuigen, bewaard: saved && saved.voertuigen, actief: st.actief, ctx: S.audioCtx().state };
  });
  // vanaf hier rechtstreeks de geluidslaag aansturen met een vaste toestand (spel op pauze, geen toeval van de spellus)
  R.signaal = await p.evaluate(async () => {
    const g = window.blokGame(), S = await import('./js/sound.js'), a = S.audioCtx(); g.setPaused(true);
    const an = a.createAnalyser(); an.fftSize = 2048; S.bus('effecten').connect(an);
    const rms = () => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); };
    const stil = rms(); g.sounds.gong(); let max = 0; for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 40)); max = Math.max(max, rms()); }
    return { stil: +stil.toFixed(5), gong: +max.toFixed(5) };
  });
  R.stappen = await p.evaluate(async () => {
    const g = window.blokGame(), SC = await import('./js/soundscape.js'), BL = await import('./js/blocks.js'), id = (n) => BL.BLOCKS.find(b => b.name === n)?.id;
    const soorten = { gras: SC.surfaceOf(id('Gras')), asfalt: SC.surfaceOf(id('Asfalt')), planken: SC.surfaceOf(id('Planken')), grasSneeuw: SC.surfaceOf(id('Gras'), 0.8) };
    const s = g.sounds, pl = g.player, n0 = s.events.stappen;
    Object.assign(pl, { fly: false, onGround: true, inWater: false }); pl.vel.set(4, 0, 0);
    const o = { weather: 'clear', under: false, hour: 10, vehicles: 40, height: 5, muted: false };
    for (let i = 0; i < 60; i++) s.update(1 / 30, o); // 2 s lopen aan 4 m/s = 8 m
    return { soorten, stappen: s.events.stappen - n0, laatste: s.lastSurface };
  });
  R.weer = await p.evaluate(async () => {
    const g = window.blokGame(), S = await import('./js/sound.js'), s = g.sounds; g.player.vel.set(0, 0, 0);
    const out = {};
    s.update(0.1, { weather: 'snow', under: false, hour: 12, vehicles: 0, height: 5 }); out.sneeuwDemping = S.mixState().muffleHz;
    s.update(0.1, { weather: 'clear', under: false, hour: 12, vehicles: 0, height: 5 }); out.helder = S.mixState().muffleHz;
    let d0 = s.events.donder; for (let i = 0; i < 60; i++) s.update(1, { weather: 'storm', under: false, hour: 12, vehicles: 0, height: 5 });
    out.donder = s.events.donder - d0; out.flits = !!document.getElementById('lightning');
    g.settings.reduceMotion = true; document.getElementById('lightning').style.opacity = '0';
    s.thunder(0.2); out.flitsBijMinderBeweging = +document.getElementById('lightning').style.opacity; g.settings.reduceMotion = false;
    d0 = s.events.donder; for (let i = 0; i < 60; i++) s.update(1, { weather: 'storm', under: true, hour: 12, vehicles: 0, height: 5 }); out.donderOndergronds = s.events.donder - d0;
    let v0 = s.events.vogels; for (let i = 0; i < 40; i++) s.update(1, { weather: 'clear', under: false, hour: 9, vehicles: 2, height: 5 }); out.vogels = s.events.vogels - v0;
    v0 = s.events.vogels; for (let i = 0; i < 40; i++) s.update(1, { weather: 'rain', under: false, hour: 9, vehicles: 2, height: 5 }); out.vogelsInRegen = s.events.vogels - v0;
    let k0 = s.events.krekels; for (let i = 0; i < 20; i++) s.update(1, { weather: 'clear', under: false, hour: 23, vehicles: 2, height: 5 }); out.krekels = s.events.krekels - k0;
    // gong: metro vlakbij en ver weg
    const p = g.player.pos, g0 = s.events.gong;
    s.arrive({ kind: 'metro' }, { x: p.x + 10, y: p.y, z: p.z }); out.gongDichtbij = s.events.gong - g0;
    s.arrive({ kind: 'metro' }, { x: p.x + 300, y: p.y, z: p.z }); out.gongVer = s.events.gong - g0 - out.gongDichtbij;
    s.arrive({ kind: 'bus' }, { x: p.x + 5, y: p.y, z: p.z }); out.gongBus = s.events.gong - g0 - out.gongDichtbij;
    return out;
  });
  R.auto = await p.evaluate(async () => {
    const g = window.blokGame(), D = await import('./js/drive.js'), s = g.sounds;
    const gears = [0, 3, 7, 12, 20, 28, 40].map(v => D.gearOf(v).gear), busGears = [2, 6, 10, 15, 25].map(v => D.gearOf(v, true).gear);
    const real = g.drive; g.drive = { car: { speed: 22 }, mode: 'driver', grip: 0.45, braking: true, steer: 0 };
    const p0 = s.events.piep; s.update(0.1, { weather: 'rain', under: false, hour: 12, vehicles: 0, height: 5 });
    const piep = s.events.piep - p0, actief = !!s.squealG; g.drive = real;
    const dry = { car: { speed: 22 }, mode: 'driver', grip: 1, braking: false, steer: 0 };
    g.drive = dry; s.update(0.1, { weather: 'clear', under: false, hour: 12, vehicles: 0, height: 5 }); g.drive = real; // nep-voertuig nooit over een frame heen laten staan
    await new Promise(r => setTimeout(r, 600));
    g.drive = dry; s.update(0.1, { weather: 'clear', under: false, hour: 12, vehicles: 0, height: 5 }); g.drive = real;
    return { gears, busGears, piep, piepActief: actief, droogStil: !s.squealG || s.squealG.gn.gain.value < 0.005 };
  });
  console.log('geluid16:', JSON.stringify(R));
  const W = R.weer, A = R.auto;
  const ok = R.mixer.actief && R.mixer.ctx === 'running' && Math.abs(R.mixer.voertuigen - 0.3) < 0.01 && R.mixer.bewaard === 0.3
    && R.signaal.gong > 0.002 && R.signaal.gong > R.signaal.stil * 3
    && R.stappen.soorten.gras === 'zacht' && R.stappen.soorten.asfalt === 'hard' && R.stappen.soorten.planken === 'hout' && R.stappen.soorten.grasSneeuw === 'sneeuw'
    && R.stappen.stappen >= 6 && R.stappen.stappen <= 12
    && W.sneeuwDemping < 5000 && W.helder >= 19000 && W.donder >= 2 && W.flits && W.flitsBijMinderBeweging === 0 && W.donderOndergronds === 0
    && W.vogels >= 4 && W.vogelsInRegen === 0 && W.krekels >= 5 && W.gongDichtbij === 1 && W.gongVer === 0 && W.gongBus === 0
    && A.gears.join() === '1,1,2,3,4,5,6' && A.busGears.join() === '1,2,3,4,5' && A.piep === 1 && A.piepActief && A.droogStil;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
