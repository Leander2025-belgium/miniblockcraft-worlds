// Megatower City: stationshal boven de sporen van Megatower Centraal. Inrichting, vertrekbord, trappen naar de drie
// perrons (doorlopend met hoofdruimte), lift vanaf het eilandperron, en echt de trap op wandelen met de spelbesturing.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 8, cycle: false, weather: 'clear', weatherSet: true })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  await p.evaluate(async () => { const g = window.blokGame(), m = await import('./js/megacity.js'), H = m.MEGA_HALL; g.player.pos.set(H.x0 + 40, H.floor + 1.05, (H.z0 + H.z1) / 2); g.player.fly = true; g.updateTiles(true); window.__H = H; window.__RZ = m.RAIL_Z; });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.tiled.inFlight === 0 && g.queue.length < 10; })) break; }
  const R = await p.evaluate(async () => {
    const g = window.blokGame(), { B, BLOCKS } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'), H = window.__H, RZ = window.__RZ, FL = H.floor, DECK = FL - 7, out = {};
    const W = g.world, cnt = {}; let sign = null;
    for (let x = H.x0; x <= H.x1; x++) for (let z = H.z0; z <= H.z1; z++) for (let y = FL + 1; y <= FL + 4; y++) { const bl = W.get(x, y, z); if ([B.SIGN, B.TICKET, B.COUNTER, B.SHELF, B.TABLE, B.CHAIR, B.CHAIR_RED, B.TOILET, B.SINK].includes(bl)) { cnt[BLOCKS[bl].name] = (cnt[BLOCKS[bl].name] || 0) + 1; if (bl === B.SIGN && !sign) sign = { x, y, z, b: bl }; } }
    out.inrichting = cnt;
    if (sign) { let txt = ''; const t0 = g.toast; g.toast = (t) => { txt = t; }; actionFor(g, sign).run(); g.toast = t0; out.bord = txt.split('\n').slice(0, 2); }
    // trappen: 7 treden van het perron (DECK+1) tot de halvloer (FL), telkens 2 blokken vrij erboven
    out.trappen = {};
    for (const o of [-14, 12, -1]) { let ok = true; for (let k = 0; k < 7; k++) { const x = H.x0 + 6 + k, z = RZ + o, y = DECK + 1 + k; if (!W.solidAt(x, y, z) || W.solidAt(x, y + 1, z) || W.solidAt(x, y + 2, z)) ok = false; } out.trappen[o] = ok; }
    // echt naar boven over de trap (noordelijk zijperron), zoals op een computer: vooruit lopen met spatie ingedrukt
    g.running = false; cancelAnimationFrame(g.raf); g.paused = false; g.touch = true;
    const start = { x: H.x0 + 4.5, y: DECK + 2.02, z: RZ - 13.5 }; // trap (o = -14), naast de roltrap
    let yawOk = null;
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { g.player.fly = false; g.player.pos.set(start.x, start.y, start.z); g.player.vel.set(0, 0, 0); g.player.yaw = yaw; g.player.pitch = 0; g.keys.add('KeyW'); for (let i = 0; i < 10; i++) g.updateMain(0.05); g.keys.delete('KeyW'); if (g.player.pos.x > start.x + 0.5) { yawOk = yaw; break; } }
    if (yawOk !== null) { g.player.pos.set(start.x, start.y, start.z); g.player.vel.set(0, 0, 0); g.player.yaw = yawOk; g.keys.add('KeyW'); let maxY = 0; const tr = []; g.keys.add('Space'); for (let i = 0; i < 600; i++) { g.updateMain(1 / 60); maxY = Math.max(maxY, g.player.pos.y); if (g.player.pos.x > H.x0 + 16) break; } out.spoor = tr; out.kolom = [6,7,8,9].map(hu => hu + ':' + [0,1,2,3,4,5,6,7].map(k => W.get(H.x0 + hu, DECK + 1 + k, RZ - 14)).join(',')); g.keys.delete('KeyW'); out.trapOp = { van: Math.round(start.y), tot: Math.round(maxY), hal: FL + 1, gelukt: maxY >= FL + 0.9 }; }
    // lift: op het liftblok van het eilandperron springen
    const lx = H.x0 + 20, lz = RZ - 1;
    out.liftBlokken = [W.get(lx, DECK + 1, lz) === B.ELEVATOR, W.get(lx, FL, lz) === B.ELEVATOR];
    g.player.fly = false; g.player.pos.set(lx + 0.5, DECK + 2.01, lz + 0.5); g.player.vel.set(0, 0, 0); g.player.onGround = true; g.upWas = false;
    const y0 = g.player.pos.y; g.keys.add('Space'); g.updateMain(0.016); g.keys.delete('Space'); g.updateMain(0.016);
    out.liftOmhoog = Math.round(g.player.pos.y - y0);
    return out;
  });
  console.log('centraal:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
