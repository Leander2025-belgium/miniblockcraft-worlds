// TERRANOVA 15 — de historische stoomtrein (Alpen) puft rook uit de schoorsteen (js/smoke.js via js/rail.js).
// De speler gaat naast de rijdende stoomlocomotief staan; na een paar seconden moeten er rookwolkjes zijn die
// boven de schoorsteen hangen en opstijgen. Schermafdruk: SHOT=bestand.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.addInitScript(() => { const o = Date.now.bind(Date); window.__off = 0; Date.now = () => o() + window.__off; window.__setHour = (h) => { const t = o(), loc = ((t / 1000 - new Date().getTimezoneOffset() * 60) % 86400 + 86400) % 86400; window.__off = ((h * 3600 - loc) % 86400 + 86400) % 86400 * 1000; }; });
  await p.goto((process.env.BASE || 'http://localhost:8765/') + '#debug');
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 12, cycle: false, weather: 'clear', weatherSet: true, view: 96, quality: 'fast', auto: false })); window.__setHour(12.5); });
  await p.reload();
  await p.evaluate(() => window.__setHour(12.5));
  await p.click('[data-mode="fantasy"]'); await p.evaluate(() => document.getElementById('btn-berg').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.alpRail; }, null, { timeout: 240000 });
  // de stoomtrein in de dienstregeling: waar rijdt hij nu?
  const R = {};
  for (let k = 0; k < 40 && !R.loc; k++) {
    R.loc = await p.evaluate(() => { const r = window.blokGame().alpRail, a = (r.active || []).find(x => x.run && x.run.sv && x.run.sv.style === 'hist'); if (!a) return null; const L = a.run.pr.L, s = a.run.pr.s0 + a.run.dir * a.x, q = L.at(s); return { x: q.x, y: q.y, z: q.z, tx: q.tx, tz: q.tz, id: a.id }; });
    if (!R.loc) await p.waitForTimeout(1500);
  }
  if (!R.loc) { console.log('stoomrook: geen stoomtrein in dienst gevonden'); console.log('alles goed: false'); await b.close(); process.exit(1); }
  // naast het spoor gaan staan (20 m opzij, 6 m hoger) en naar de trein kijken
  const follow = () => p.evaluate(() => { const g = window.blokGame(), r = g.alpRail, a = (r.active || []).find(x => x.run && x.run.sv && x.run.sv.style === 'hist'); if (!a) return null; const tr = r.trains.get(a.id), sh = tr && tr.cars[0] && tr.cars[0].shell; const L = a.run.pr.L, q = L.at(a.run.pr.s0 + a.run.dir * a.x); const P = g.player; P.fly = true; const ahead = 18; const fx = q.x + q.tx * a.run.dir * ahead, fz = q.z + q.tz * a.run.dir * ahead; P.pos.set(fx - q.tz * 28, q.y + 40, fz + q.tx * 28); P.yaw = Math.atan2(-(q.x - P.pos.x), -(q.z - P.pos.z)); P.pitch = -0.85; document.getElementById('ov-start').hidden = true; g.updateTiles(true); return { trein: !!tr, buitenkant: !!sh, v: tr ? +(tr.v || 0).toFixed(1) : null }; });
  R.plaats = await follow();
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(500); R.plaats = await follow(); }
  await p.evaluate(() => { const g = window.blokGame(); for (let q = 0; q < 600 && g.queue.length; q++) g.buildSome(); });
  await p.waitForTimeout(1500); await follow();
  R.rook = await p.evaluate(() => { const r = window.blokGame().alpRail, sm = r.smoke; if (!sm) return null; const a = (r.active || []).find(x => x.run && x.run.sv && x.run.sv.style === 'hist'), tr = r.trains.get(a.id), sh = tr.cars[0].shell.g.position; const ys = sm.p.map(q => q.y); return { wolkjes: sm.stats.wolkjes, zichtbaar: sm.mesh.count, laagste: Math.min(...ys) - sh.y, hoogste: Math.max(...ys) - sh.y, dichtbij: sm.p.filter(q => Math.hypot(q.x - sh.x, q.z - sh.z) < 25).length, v: +(tr.v || 0).toFixed(1) }; });
  await p.screenshot({ path: process.env.SHOT || '/tmp/stoomrook.png' });
  console.log('stoomrook:', JSON.stringify(R));
  const ok = !!R.rook && R.rook.wolkjes >= 5 && R.rook.zichtbaar >= 3 && R.rook.laagste >= 3.5 && R.rook.hoogste < 60 && R.rook.dichtbij >= 1;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
