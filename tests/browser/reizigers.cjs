// Reizigers op de perrons (Alpen en Greenisland): wachten, instappen en uitstappen bij een trein met open deuren;
// niemand staat in een muur of zweeft (voeten en hoofd in de lucht, blok eronder vast). Screenshot met SHOTS=map.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' / ')));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 8, weather: 'clear', weatherSet: true, cycle: false })));
  await p.reload();
  const out = {};
  for (const world of ['alpen', 'greenisland']) {
    if (world === 'alpen') { await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg'); }
    else { await p.goto('http://localhost:8765/#debug'); await p.evaluate(() => { window.__bad = []; document.getElementById('btn-gi-play').click(); }); }
    await p.waitForFunction((w) => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && (w === 'greenisland') === !!(g.isGreen && g.isGreen()) && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, world, { timeout: 180000 });
    // naar een gewoon station met dubbelspoor (niet het hoofdstation)
    await p.evaluate(async () => {
      const g = window.blokGame(), rail = await import('./js/rail.js'), ni = rail.netInfo();
      const L = ni.LINES.find(l => !l.tram && !l.bus && !l.metro && !l.single && l.stations.length > 2), st = L.stations[1], sm = (st.s0 + st.s1) / 2, q = L.at(sm), o = ni.trackOffset(L, sm) + 2.2 + 2;
      g.player.pos.set(q.x - q.tz * o, Math.round(q.y) + 2.05, q.z + q.tx * o); g.player.fly = false; g.player.vel.set(0, 0, 0); g.updateTiles(true);
      window.__st = { line: L.id, name: st.name };
    });
    for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.tiled.inFlight === 0 && g.queue.length < 20; })) break; }
    const R = await p.evaluate(async () => {
      const g = window.blokGame(), Rl = g.alpRail; g.running = false; cancelAnimationFrame(g.raf);
      const { IS_SOLID } = await import('./js/blocks.js');
      let off = 0; const rn = Date.now; Date.now = () => rn() + off;
      let maxW = 0, slecht = 0, getest = 0;
      const openNear = () => { const S = window.__st; for (const t of Rl.trains.values()) { if (!t.a || !t.L || t.L.id !== S.line) continue; const r = (t.a.run.pr.stops || []).find(x => x.st.name === S.name); if (r && t.a.t >= r.arr + 1.5 && t.a.t <= r.dep - 4 && t.a.v < 0.05) return true; } return false; };
      const check = () => { for (const q of Rl.pax.list) { const a = q.L.at(q.s); const x = Math.floor(a.x - a.tz * q.side * q.lat), z = Math.floor(a.z + a.tx * q.side * q.lat), y = Math.round(a.y) + 2; if (!g.world.get(x, y - 2, z) && !g.world.get(x, y - 1, z)) continue; getest++; if (IS_SOLID[g.world.get(x, y, z)] || IS_SOLID[g.world.get(x, y + 1, z)] || !IS_SOLID[g.world.get(x, y - 1, z)]) { slecht++; if ((window.__bad = window.__bad || []).length < 6) window.__bad.push(q.state + ' lat ' + q.lat.toFixed(1) + ' s-s0 ' + Math.round(q.s - q.st.s0) + '/' + Math.round(q.st.s1 - q.st.s0) + ' ' + [g.world.get(x, y - 1, z), g.world.get(x, y, z), g.world.get(x, y + 1, z)].join(',')); } } };
      let opens = 0;
      for (let i = 0; i < 1400; i++) {
        const open = openNear();
        if (open) opens++;
        // geen trein aan het perron: de klok vooruit (in stappen van 20 s) tot de volgende trein er staat
        if (!open && i % 2 === 0) { off += 20000; Rl.update(0.05, 1); } else { off += 250; Rl.update(0.25, 1); }
        maxW = Math.max(maxW, Rl.pax.stats.wachtend);
        if (i % 25 === 0) check();
        if (Rl.pax.stats.ingestapt > 3 && Rl.pax.stats.uitgestapt > 3 && opens > 40) break;
      }
      check();
      window.__opens = opens;
      Date.now = rn;
      const amb = g.ambient ? (g.ambient.start(), g.ambient.update(0.5, { vehicles: 20, height: 900, weather: 'rain', under: false }), { aan: g.ambient.on, ...g.ambient.levels }) : null;
      return { omgevingsgeluid: amb, omroepen: Rl.annCount || 0, station: window.__st, maxWachtend: maxW, ...Rl.pax.stats, stappenMetOpenDeuren: window.__opens, posGetest: getest, inMuurOfZwevend: slecht, voorbeelden: window.__bad };
    });
    if (SHOTS) { await p.evaluate(() => { const g = window.blokGame(); g.running = true; g.loop && 0; }); await p.screenshot({ path: path.join(SHOTS, 'reizigers-' + world + '.png') }); }
    out[world] = R;
  }
  console.log('reizigers:', JSON.stringify(out));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
