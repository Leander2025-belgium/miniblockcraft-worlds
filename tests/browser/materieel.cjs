// TERRANOVA 14.1 — materieel per categorie (js/trainshell.js CAR_BASE): S-Bahn, metro, Airport Express, regionale
// motorwagen en diesellocomotief hebben elk een eigen buitenkant, lengte en deuren; de diensten gebruiken ze.
// Opstelling naast elkaar op de opstelsporen van Remise Southbay (Greenisland), met een IC-trein op het hoofdspoor.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOT = process.env.SHOT || null;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 11, cycle: false, quality: 'normal', weather: 'clear', weatherSet: true })));
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 180000 });
  // naar Remise Southbay, camera schuin op de opstelsporen
  await p.evaluate(async () => {
    const g = window.blokGame(), G = await import('./js/greenisland.js'), D = G.DEPOTS.find(d => d.name === 'Remise Southbay');
    const P = D.sidings[0], q = P.at(P.len - 200), o = D.side;
    const pl = g.player; pl.fly = true; pl.pos.set(q.x - q.tz * o * -26 + q.tx * -45, q.y + 16, q.z + q.tx * o * -26 + q.tz * -45);
    const tx = P.at(P.len - 150); pl.yaw = Math.atan2(-(tx.x - pl.pos.x), -(tx.z - pl.pos.z)); pl.pitch = -0.28;
    g.tiled.aheadKey = null; g.updateTiles(true);
  });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 20; })) break; }
  await p.waitForTimeout(4000);
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), Rl = g.alpRail, G = await import('./js/greenisland.js'), D = G.DEPOTS.find(d => d.name === 'Remise Southbay');
    const { NET } = await import('./js/rail-green.js'), SV = (id) => NET.SERVICES.find(s => s.id === id) || NET.SERVICES.find(s => s.metro);
    Rl.update = () => {}; // de dienstregeling even stil: alleen de opstelling
    for (const [id, tr] of Rl.trains) Rl.dropTrain(tr); Rl.trains.clear();
    const lineup = [['S1', 0], ['M1', 1], ['AX1', 2], ['IR4', 3]], out = {};
    for (const [id, k] of lineup) {
      const sv = SV(id), tr = Rl.makeTrain({ id: 'show:' + id, run: { sv, pr: { last: { name: 'Toon' } } } }), P = D.sidings[k];
      Rl.place(tr, P, P.len - 226, 1); Rl.trains.set('show:' + id, tr); // kop net voor de hal
      const c0 = tr.cars[0], sp = c0.shell;
      out[id] = { soort: sv.cars, lengte: tr.cars.map(c => c.d.L), deuren: c0.d.doors.length, stroomafnemer: !!(sp && sp.panto), onderdelen: sp ? sp.g.children.reduce((a, m) => a + (m.geometry ? m.geometry.attributes.position.count : 0), 0) : 0 };
    }
    // goederentrein met diesellocomotief op het hoofdspoor ernaast
    const gw = SV('GW'), trG = Rl.makeTrain({ id: 'show:GW', run: { sv: gw, pr: { last: { name: 'Toon' } } } });
    Rl.place(trG, D.L, D.sEdge + D.e * (D.uThroat + 180 + 220), -D.e); Rl.trains.set('show:GW', trG);
    out.GW = { soort: gw.cars, lengte: trG.cars.map(c => c.d.L), stroomafnemer: !!(trG.cars[0].shell && trG.cars[0].shell.panto), onderdelen: trG.cars[0].shell ? trG.cars[0].shell.g.children.reduce((a, m) => a + (m.geometry ? m.geometry.attributes.position.count : 0), 0) : 0 };
    for (const tr of Rl.trains.values()) Rl.dressTrain(tr, false, 0.1, 0);
    // camera aan de ingang van de hal, boven het midden van de opstelsporen, kijkend naar de koppen
    const P1 = D.sidings[1], P2 = D.sidings[2], a = P1.at(P1.len - 196), c = P2.at(P2.len - 196), t1 = P1.at(P1.len - 290), t2 = P2.at(P2.len - 290);
    const pl = g.player; pl.pos.set((a.x + c.x) / 2, a.y + 3.2, (a.z + c.z) / 2); pl.yaw = Math.atan2(-((t1.x + t2.x) / 2 - pl.pos.x), -((t1.z + t2.z) / 2 - pl.pos.z)); pl.pitch = -0.06;
    g.showOverlay(null);
    return out;
  });
  await p.waitForTimeout(3000);
  if (SHOT) await p.screenshot({ path: SHOT });
  console.log('materieel:', JSON.stringify(R));
  const parts = ['S1', 'M1', 'AX1', 'IR4', 'GW'].map(k => R[k].onderdelen);
  const ok = R.S1.soort[0] === 'sbCab' && R.S1.lengte[0] === 22 && R.S1.deuren === 3 && R.S1.stroomafnemer
    && R.M1.soort[0] === 'mCab' && R.M1.lengte[0] === 18 && R.M1.deuren === 3 && !R.M1.stroomafnemer
    && R.AX1.soort[0] === 'axCab' && R.IR4.soort[0] === 'regCab' && R.GW.soort[0] === 'locoD' && !R.GW.stroomafnemer
    && new Set(parts).size === parts.length; // elk model een andere geometrie
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
