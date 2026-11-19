// Nieuwe treinmodellen (Alpen): historische stoomtrein (dienst DS, 10–18 u), slaaprijtuig, bergtrein; eenvoudig model
// op afstand (LOD); stroomafnemer gaat neer bij een geparkeerde trein en weer op.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 13, weather: 'clear', weatherSet: true, cycle: false })));
  await p.reload();
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.alpRail && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 180000 });
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), Rl = g.alpRail, rail = await import('./js/rail.js'); g.running = false; cancelAnimationFrame(g.raf);
    const out = {};
    // klok naar 12:00 lokale tijd (stoomtrein rijdt van 10 tot 18 u)
    const rn = Date.now, d = new Date(); d.setHours(12, 0, 0, 0); let off = d.getTime() - rn(); Date.now = () => rn() + off;
    out.stoomRitten = rail.RUNS.filter(r => r.sv.id === 'DS').length;
    // een rijdende stoomtrein zoeken en de speler ernaast zetten
    let st = null;
    for (let i = 0; i < 400 && !st; i++) {
      const act = Rl.active || []; const a = act.find(a => a.run.sv.id === 'DS' && a.t > 0);
      if (a) { const L = a.run.pr.L, s = a.run.pr.s0 + a.run.dir * a.x, q = L.at(s); g.player.pos.set(q.x + 12, q.y + 3, q.z + 12); Rl.update(0.05, 1); st = Rl.trains.get(a.id); }
      else { off += 60000; Rl.update(0.05, 1); }
    }
    if (!st) return { ...out, error: 'geen stoomtrein gevonden' };
    out.stoomtrein = st.name;
    const loco = st.cars[0];
    out.locModel = { onderdelen: loco.shell.g.children.length, stroomafnemer: !!loco.shell.panto, stijl: loco.shell.lod ? 'met LOD' : 'zonder LOD' };
    // LOD: speler ver weg zetten
    const pos = loco.shell.g.position.clone();
    g.player.pos.set(pos.x + 800, pos.y, pos.z); Rl.update(0.05, 1);
    out.lodVer = st.cars.map(c => c.shell.far);
    g.player.pos.set(pos.x + 10, pos.y + 2, pos.z + 10); Rl.update(0.05, 1);
    out.lodDichtbij = st.cars.map(c => c.shell.far);
    // stroomafnemer: een elektrische trein geparkeerd laten staan
    const el = [...Rl.trains.values()].find(t => t.cars.some(c => c.shell && c.shell.panto));
    if (el) { const sh = el.cars.find(c => c.shell && c.shell.panto).shell; const v0 = el.v; el.v = 0;
      for (let i = 0; i < 80; i++) Rl.dressTrain(el, false, 0.5, 0); out.pantoNaParkeren = +sh.up.toFixed(2);
      for (let i = 0; i < 10; i++) Rl.dressTrain(el, false, 0.5, 1); out.pantoBijVertrek = +sh.up.toFixed(2); el.v = v0; }
    // camera op de stoomlocomotief
    window.__cam = { x: pos.x, y: pos.y, z: pos.z, yaw: loco.shell.g.rotation.y };
    { const frozen = rn() + off; Date.now = () => frozen; } // klok stilzetten voor de foto (de trein blijft staan)
    return out;
  });
  console.log('treinmodellen:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
