// Megatower City ronde 2: nieuwe hemel en water zonder shaderfouten, een stadstoren binnengaan (verdiepingen worden
// opgebouwd, lift = springen), lichtschakelaar maakt de kamer donker, sprong naar een verre verdieping zonder val.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CON ' + m.text().slice(0, 300)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 19.2, cycle: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 120000 });
  const frames = async (n) => { for (let i = 0; i < n; i++) await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
  const settle = async (ms = 150000) => { const t0 = Date.now(); await frames(4); while (Date.now() - t0 < ms) { await p.waitForTimeout(400); if (await p.evaluate(() => window.blokGame().readyHere())) return Date.now() - t0; } return -1; };
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 240000 }); };
  // lichtniveau van de binnenvlakken rond een punt (de mesh opnieuw maken zoals de game het doet)
  const lightNear = (pos) => p.evaluate(async ([x, y, z]) => {
    const g = window.blokGame(), { meshChunk } = await import('./js/mesher.js'), t = g.world.tileAt(x, z), I = t.interior;
    const lx = x - t.ox, lz = z - t.oz, ly = y - t.w.y0, sct = Math.floor(ly / 8);
    const o = meshChunk(t.w, Math.floor(lx / 16), Math.floor(lz / 16), { ylo: sct * 8, yhi: sct * 8 + 8, indoor: I.indoorL });
    let s = 0, n = 0; const P = o.opaque.pos, Lt = o.opaque.light;
    for (let i = 0; i < Lt.length; i++) if (Lt[i] >= 2 && Math.abs(P[i * 3] - lx) < 5 && Math.abs(P[i * 3 + 2] - lz) < 5) { s += Math.floor((Lt[i] - 2) / 2); n++; }
    return n ? +(s / n).toFixed(2) : null;
  }, pos);
  const R = {};
  // 1. hemel bij zonsondergang vanaf het plein, naar de toren kijken
  await p.evaluate(() => { const g = window.blokGame(); g.player.pos.set(5184.5, 121, 5040); Object.assign(g.player, { yaw: Math.PI, pitch: 0.35, fly: true }); g.updateTiles(true); });
  await settle(); await frames(5); await shot('hemel-zonsondergang');
  // 2. een stadstoren zoeken en binnengaan
  const tw = await p.evaluate(async () => {
    const m = await import('./js/megacity.js');
    for (let r = 200; r < 1200; r += 32) for (let a = 0; a < 6.28; a += 0.3) { const x = Math.floor(5184 + Math.cos(a) * r), z = Math.floor(5184 + Math.sin(a) * r); const bd = m.buildingAt(x, z); if (bd && bd.kind === 'tower' && bd.L.h > 100) return { x0: bd.x0, z0: bd.z0, h: bd.L.h, use: bd.L.use }; }
    return null;
  });
  R.toren = tw;
  if (tw) {
    await p.evaluate(([x, z]) => { const g = window.blokGame(); g.player.pos.set(x, 120.02, z); Object.assign(g.player, { fly: false, yaw: 0, pitch: 0 }); g.player.vel.set(0, 0, 0); g.updateTiles(true); }, [tw.x0 + 21.5, tw.z0 + 21.5]);
    await settle(); await frames(10); await p.waitForTimeout(1500); await frames(5);
    R.lobby = await p.evaluate(async () => { const g = window.blokGame(), { B } = await import('./js/blocks.js'), q = g.player.pos; return { onder: g.world.get(Math.floor(q.x), Math.floor(q.y) - 1, Math.floor(q.z)) === B.ELEVATOR, open: g.mega.open ? g.mega.open.hi - g.mega.open.lo : 0, cellen: g.mega.opened.size }; });
    const ys = [];
    for (let i = 0; i < 3; i++) {
      await p.evaluate(() => { const g = window.blokGame(); g.keys.add('Space'); g.player.onGround = true; g.upWas = false; g.updateMain(0.016); g.keys.delete('Space'); g.updateMain(0.016); });
      await frames(3); await p.waitForTimeout(800); await frames(3);
      ys.push(await p.evaluate(() => Math.round(window.blokGame().player.pos.y)));
    }
    R.liftHoogtes = ys;
    await p.waitForTimeout(1500); await frames(10);
    R.binnen = await p.evaluate(async () => { const g = window.blokGame(), { B } = await import('./js/blocks.js'), q = g.player.pos; let fill = 0, real = 0; for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) { const b = g.world.get(Math.floor(q.x) + dx, Math.floor(q.y) + 1, Math.floor(q.z) + dz); if (b === B.ROOM_FILL) fill++; else if (b) real++; } return { fill, meubels: real, open: g.mega.open && [g.mega.open.lo, g.mega.open.hi] }; });
    await p.evaluate(() => { const g = window.blokGame(); g.player.yaw = 0.6; g.player.pitch = -0.1; });
    await frames(10); await shot('stadstoren-binnen');
    await p.evaluate(([x, z]) => { const g = window.blokGame(); g.player.pos.set(x, 125, z); g.player.fly = true; }, [tw.x0 - 30, tw.z0 - 30]);
    await frames(10); await p.waitForTimeout(1200); await frames(5);
    R.naBuiten = await p.evaluate(() => ({ open: !!window.blokGame().mega.open, cellen: window.blokGame().mega.opened.size }));
  }
  // 3. lichtschakelaar in een hotelkamer (verdieping 40)
  await p.evaluate(() => { const g = window.blokGame(); g.teleportTo(5184.5, 280, 5184 - 28.5); g.updateTiles(true); });
  R.laad40 = await settle();
  R.licht = await p.evaluate(async () => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'), q = g.player.pos;
    let sw = null;
    for (let d = 1; d < 12 && !sw; d++) for (let dz = -d; dz <= d && !sw; dz++) for (let dx = -d; dx <= d && !sw; dx++) { const x = Math.floor(q.x) + dx, z = Math.floor(q.z) + dz, y = Math.floor(q.y) + 1; if (g.world.get(x, y, z) === B.SWITCH) sw = { x, y, z, b: B.SWITCH }; }
    return sw ? { pos: [sw.x, sw.y, sw.z], label: actionFor(g, sw).label } : null;
  });
  if (R.licht) {
    R.licht.voor = await lightNear(R.licht.pos);
    await p.evaluate(async ([x, y, z]) => { const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'); actionFor(g, { x, y, z, b: B.SWITCH }).run(); }, R.licht.pos);
    await frames(40); await p.waitForTimeout(1000); await frames(20);
    R.licht.na = await lightNear(R.licht.pos);
  }
  // 4. sprong naar verdieping 200: niet vallen terwijl de verdieping opgebouwd wordt
  await p.evaluate(() => { const g = window.blokGame(); g.teleportTo(5184.5, 920, 5184 - 14.5); g.updateTiles(true); });
  const yy = [];
  for (let i = 0; i < 8; i++) { await frames(3); yy.push(await p.evaluate(() => +window.blokGame().player.pos.y.toFixed(2))); }
  R.sprong200 = { hoogtes: yy, klaar: await settle() };
  R.tris = await p.evaluate(() => { const g = window.blokGame(); let tri = 0; for (const c of g.chunks.values()) for (const m of [c.o, c.t]) if (m && m.visible) tri += m.geometry.index.count / 3; return Math.round(tri); });
  console.log('ronde2:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 6).join(' | ') : 'geen');
  await b.close();
})();
