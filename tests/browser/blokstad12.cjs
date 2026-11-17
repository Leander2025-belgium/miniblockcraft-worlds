// Blokstad 12 fase 1: dienstregeling van het verkeer in Megatower City (spits/dal/avond/nacht), zelf een bus besturen
// (dashboard met stuur, deuren, richtingaanwijzers, verkeerslicht, halte; gelede bus knikt), nieuwe bustypes,
// treingeluid, FPS-meter.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CON ' + m.text().slice(0, 300)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 8, cycle: false, view: 96 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic && g.traffic.net && g.traffic.net.len.metro > 200 && g.traffic.net.len.road > 1500 && g.traffic.agents.length > 10; }, null, { timeout: 400000, polling: 1000 });
  const R = {};
  R.dienst = await p.evaluate(() => {
    const g = window.blokGame(), tr = g.traffic, out = {};
    g.running = false; cancelAnimationFrame(g.raf);
    for (const h of [8, 12, 23, 3, 17]) {
      for (let i = 0; i < 40; i++) tr.update(0.1, g.player.pos, 1, h);
      const n = {}; for (const a of tr.agents) if (!a.dead) n[a.kind] = (n[a.kind] || 0) + 1;
      out['u' + h] = { periode: tr.period, metro: n.metro || 0, bus: n.bus || 0, tram: n.tram || 0, auto: n.car || 0, wil: { ...tr.want } };
    }
    return out;
  });
  R.bord = await p.evaluate(async () => {
    const g = window.blokGame(), { metroStationAt } = await import('./js/megacity.js');
    // een metrostation zoeken en het bord lezen
    for (let x = 200; x < 10000; x += 64) for (let z = 200; z < 10000; z += 64) { const ms = metroStationAt(x, z); if (ms) { g.settings.hour = 17; return g.mega.signText({ x, y: g.meta.ground - 17, z }).split('\n')[2]; } }
    return null;
  });
  R.bus = await p.evaluate(async () => {
    const g = window.blokGame(), tr = g.traffic, { Drive } = await import('./js/drive.js'), out = {};
    const types = {}; for (const a of tr.agents) if (a.kind === 'bus') types[a.secs[0].m] = (types[a.secs[0].m] || 0) + 1;
    out.types = types;
    // een gelede bus in dienst brengen (dienstinterval even negeren)
    let bus = tr.agents.find(a => a.kind === 'bus' && a.secs.length === 2);
    const rnd = Math.random;
    for (let i = 0; i < 60 && !bus; i++) { Math.random = () => 0.1; const a = tr.spawnNear('bus', g.player.pos); Math.random = rnd; if (a && a.secs.length === 2) bus = a; }
    bus = bus || tr.agents.find(a => a.kind === 'bus');
    out.nieuw = (await import('./js/vehicles.js')).BUS_TYPES.busDD ? ['busDD', 'busRegio'].filter(k => tr.meshes[k]) : [];
    if (!bus) return { ...out, error: 'geen bus' };
    g.drive = new Drive(g, bus, 'drive'); const d = g.drive, c = d.car;
    out.geleed = !!c.rear; out.spec = d.spec.L; out.vmax = Math.round(d.spec.vmax * 3.6);
    // deuren open: geen gas
    c.speed = 0; d.key('KeyQ'); g.keys.add('KeyW'); for (let i = 0; i < 20; i++) d.update(0.05); out.deurenOpenSnelheid = +c.speed.toFixed(2);
    d.key('KeyQ'); for (let i = 0; i < 60; i++) d.update(0.05);
    out.snelheid = Math.round(c.speed * 3.6);
    g.keys.add('KeyA'); for (let i = 0; i < 30; i++) d.update(0.05); g.keys.delete('KeyA'); g.keys.delete('KeyW');
    out.stuur = +d.steer.toFixed(2);
    if (c.rear) { out.knik = Math.round(Math.abs(d.knik) * 57.3); out.scharnier = +(Math.hypot(c.x - c.rear.x, c.z - c.rear.z)).toFixed(2); out.verwacht = +(c.rear.a + c.rear.b).toFixed(2); }
    d.key('KeyZ'); d.t += 1; d.hudT = 0; d.update(0.05);
    const hud = document.getElementById('drive-hud');
    out.dashboard = { stuur: !!hud.querySelector('.bus-wheel'), meter: hud.querySelectorAll('svg').length, hendels: hud.querySelectorAll('.lever').length, pinkers: !!hud.querySelector('.bus-ind'), tekst: hud.querySelector('.small')?.textContent.replace(/\s+/g, ' ').slice(0, 260) };
    out.pad = document.getElementById('drive-pad').dataset.mode;
    g.keys.add('KeyS'); for (let i = 0; i < 120 && c.speed > 0.45; i++) d.update(0.05); g.keys.delete('KeyS');
    g.keys.add('Space'); for (let i = 0; i < 20; i++) d.update(0.05); g.keys.delete('Space');
    out.gestopt = Math.abs(c.speed) < 0.2;
    d.key('KeyQ'); out.deurenOpen = c.doorsOpen;
    // gerenderd met deuren dicht?
    tr.update(0.05, g.player.pos, 1, 12);
    out.deurMeshBijOpen = tr.meshes[c.doors]?.n;
    d.key('KeyQ'); tr.update(0.05, g.player.pos, 1, 12); out.deurMeshBijDicht = tr.meshes[c.doors]?.n;
    d.exit(); out.uit = !g.drive;
    return out;
  });
  R.geluid = await p.evaluate(async () => {
    const { RailSound } = await import('./js/sound.js'); const s = new RailSound('train');
    for (let i = 0; i < 50; i++) s.update(0.1, i * 0.6, 0.8, 0, true);
    for (let i = 0; i < 50; i++) s.update(0.1, Math.max(0, 30 - i), 0, 0.9, true);
    const ok = s.on; s.stop(); return { aan: ok, ctx: !!window.AudioContext };
  });
  R.fps = await p.evaluate(() => {
    const g = window.blokGame(); g.settings.fps = true;
    for (let i = 0; i < 10; i++) g.perfHud(0.06);
    const el = document.getElementById('fps-hud'); return el && !el.hidden ? el.textContent : null;
  });
  console.log('blokstad12:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
