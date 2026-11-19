// TERRANOVA 14 — graphics en prestaties in Megatower City (echte spellus, SwiftShader):
// 1. shaders: geen compileerfouten (wereldshader met materiaalklassen en tonemapping, voertuigmaterialen);
// 2. lichtschakelaar: een hotelkamer (verdieping 40) wordt 's nachts echt donker op het scherm (helderheid in de
//    schermafdruk, niet alleen de lampkleur);
// 3. renderprioriteit in de metrotunnel: minder driehoeken en tekenopdrachten dan zonder (zelfde plek, zelfde frame),
//    zonder dat de tunnel zelf verdwijnt (helderheid van het beeld blijft gelijk);
// 4. voertuig-LOD: verre voertuigen zonder interieur, dichtbij volledig; metro in de tunnel krijgt tunnellicht;
// 5. ritten: OV-voertuigen hebben een rit met bezetting; uit beeld gereden ritten blijven bewaard.
// Schermafdrukken met SHOTS=map.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { readPng, stats } = require('./_png.cjs');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errs = [], shaderErr = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { const t = m.text(); if (/WebGLProgram|Shader Error|ERROR: 0:|VALIDATE_STATUS/.test(t)) shaderErr.push(t.slice(0, 300)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 23, cycle: false, weather: 'clear', weatherSet: true, view: 96, lod: 1000, quality: 'normal', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  const frames = async (n) => { for (let i = 0; i < n; i++) await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
  const settle = async (ms = 150000) => { const t0 = Date.now(); await frames(3); while (Date.now() - t0 < ms) { await p.waitForTimeout(400); if (await p.evaluate(() => window.blokGame().readyHere())) return Date.now() - t0; } return -1; };
  const shot = async (name, box) => { const buf = await p.screenshot({ timeout: 240000 }); if (SHOTS) fs.writeFileSync(path.join(SHOTS, name + '.png'), buf); const im = readPng(buf); return stats(im, box || [0, 60, im.w, im.h - 100]); };
  const live = () => p.evaluate(() => { const g = window.blokGame(); g.touch = true; if (!g.running) g.start(); g.setPaused?.(false); g.showOverlay?.(null); for (const el of document.querySelectorAll('.ov')) el.hidden = true; });
  const R = {};
  await live();

  // 2. lichtschakelaar 's nachts (23 u) in een hotelkamer op verdieping 40
  await p.evaluate(() => { const g = window.blokGame(); g.teleportTo(5184.5, 280, 5184 - 28.5); g.updateTiles(true); });
  R.laad = await settle();
  const sw = await p.evaluate(async () => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js'), q = g.player.pos;
    for (let d = 1; d < 12; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) { const x = Math.floor(q.x) + dx, z = Math.floor(q.z) + dz, y = Math.floor(q.y) + 1; if (g.world.get(x, y, z) === B.SWITCH) return [x, y, z]; }
    return null;
  });
  R.schakelaar = !!sw;
  if (sw) {
    // de kamer in kijken (weg van de schakelaar, naar het midden van de kamer)
    await p.evaluate(() => { const g = window.blokGame(); g.player.pitch = -0.25; });
    await frames(20); await p.waitForTimeout(1500);
    const aan = await shot('licht-aan');
    await p.evaluate(async ([x, y, z]) => { const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'); actionFor(g, { x, y, z, b: B.SWITCH }).run(); }, sw);
    await frames(40); await p.waitForTimeout(2500); await frames(10);
    const uit = await shot('licht-uit');
    R.licht = { aan: aan.lum, uit: uit.lum, verhouding: +(uit.lum / Math.max(1, aan.lum)).toFixed(2) };
    await p.evaluate(async ([x, y, z]) => { const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'); actionFor(g, { x, y, z, b: B.SWITCH }).run(); }, sw); // weer aan
  }

  // 3 + 4. metrotunnel M1 overdag: renderprioriteit en tunnellicht op de metro
  await p.evaluate(() => { const g = window.blokGame(); g.settings.hour = 13; g.player.fly = true; g.player.pos.set(5337, g.meta.ground - 17, 5116); g.player.yaw = Math.PI / 2; g.player.pitch = 0; g.updateTiles(true); });
  await settle(); await frames(10); await p.waitForTimeout(3000);
  const measure = () => p.evaluate(() => new Promise(done => { const g = window.blokGame(), R2 = g.renderer; R2.info.autoReset = false; R2.info.reset(); requestAnimationFrame(() => { R2.info.reset(); requestAnimationFrame(() => { const r = { calls: R2.info.render.calls, tri: R2.info.render.triangles, ingesloten: !!g.enclosed }; R2.info.autoReset = true; done(r); }); }); }));
  const met = await measure(), metShot = await shot('metro-met-prioriteit');
  await p.evaluate(() => { window.blokGame().noPrio = true; }); await frames(4);
  const zonder = await measure(), zonderShot = await shot('metro-zonder-prioriteit');
  await p.evaluate(() => { window.blokGame().noPrio = false; }); await frames(4);
  R.prioriteit = { met, zonder, minderDriehoeken: +(1 - met.tri / Math.max(1, zonder.tri)).toFixed(3), minderTekenopdr: +(1 - met.calls / Math.max(1, zonder.calls)).toFixed(3), helderheid: [metShot.lum, zonderShot.lum] };
  // metro's: in de tunnel 'covered', LOD-telling
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => window.blokGame().traffic.agents.some(a => a.kind === 'metro' && !a.dead && a.covered !== undefined))) break; await p.waitForTimeout(1000); }
  R.voertuigen = await p.evaluate(() => {
    const g = window.blokGame(), tr = g.traffic, m = tr.agents.filter(a => a.kind === 'metro' && !a.dead);
    return { metros: m.length, inTunnelBelicht: m.filter(a => a.covered).length, lod: tr.lodStat, ritten: tr.trips.stats, voorbeeldRit: (tr.agents.find(a => a.trip && a.kind === 'bus') || m.find(a => a.trip) || {}).trip || null };
  });

  // 5. ritten blijven bewaard: een bus ver weg sturen (buiten beeld) en terug
  R.ritBewaard = await p.evaluate(() => {
    const g = window.blokGame(), tr = g.traffic, T = tr.trips, a = tr.agents.find(x => x.trip && !x.dead && (x.kind === 'bus' || x.kind === 'metro'));
    if (!a) return null;
    a.trip.occ = Math.min(a.trip.cap, 42); const id = a.trip.id, key = a.trip.key;
    a.dead = true; tr.sweepDead(); // alsof hij uit het verkeersgebied rijdt
    const ghost = T.ghosts.find(gh => gh.trip.id === id);
    // een nieuw voertuig op dezelfde lijn en richting neemt de rit weer over
    const b = { kind: a.kind, secs: a.secs, route: a.route, line: a.line };
    T.assign(b, { clock: tr.clock, period: tr.period, line: key.split('|')[1], dir: +key.split('|')[2] });
    return { buitenBeeld: !!ghost && ghost.trip.state === 'buiten beeld', hervat: b.trip && b.trip.id === id, bezetting: b.trip && b.trip.occ };
  });
  console.log('graphics:', JSON.stringify(R));
  const ok = !shaderErr.length && R.schakelaar && R.licht && R.licht.verhouding < 0.6 && R.prioriteit.met.ingesloten && R.prioriteit.minderDriehoeken > 0.3
    && Math.abs(R.prioriteit.helderheid[0] - R.prioriteit.helderheid[1]) < 6 && R.ritBewaard && R.ritBewaard.hervat && R.ritBewaard.bezetting === 42;
  console.log('shaderfouten:', shaderErr.length ? shaderErr.slice(0, 3).join(' | ') : 'geen');
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
