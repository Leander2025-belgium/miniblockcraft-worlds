// Megatower City in de browser: liften (roepen, instappen, verdieping kiezen, meerijden, uitstappen),
// deuren, licht, tv, zitten, snelreizen naar elke plek in de toren, verticale streaming (straat, verdieping 100,
// verdieping 249, -100 m), snel langs de toren vliegen, opslaan en opnieuw laden. Schermafdrukken met SHOTS=map.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 600 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|overpass|elevation-tiles/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 14, cycle: false })));
  await p.reload();
  const R = {};
  const start = async () => {
    await p.evaluate(() => document.getElementById('btn-mega').click());
    await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.player && g.mega; }, null, { timeout: 120000 });
  };
  await start();
  const T = await p.evaluate(async () => { const m = await import('./js/megatower.js'); return { CX: m.CX, CZ: m.CZ, G: m.G, lifts: m.LIFTS.map(L => ({ id: L.id, cells: L.cells, door: L.door, button: L.button, out: L.out })) }; });
  const fy = (f) => T.G + 4 * f;
  // wachten tot alles rond de speler geladen en opgebouwd is
  const settle = async (ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await p.waitForTimeout(400); const ok = await p.evaluate(() => window.blokGame().readyHere()); if (ok) { await p.waitForTimeout(300); return Date.now() - t0; } } return -1; };
  const put = (x, y, z, yaw = 0, pitch = 0) => p.evaluate(([x, y, z, yaw, pitch]) => { const g = window.blokGame(); g.seat = null; Object.assign(g.player, { fly: false, yaw, pitch }); g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0); g.updateTiles(true); }, [x, y, z, yaw, pitch]);
  const stats = () => p.evaluate(() => { const g = window.blokGame(); let n = 0, tri = 0, full = 0; for (const c of g.chunks.values()) for (const m of [c.o, c.t]) if (m && m.visible) { n++; tri += m.geometry.index.count / 3; if (c.kind === 'full') full++; } return { meshes: n, tri: Math.round(tri), full, y: +g.player.pos.y.toFixed(2), hud: document.getElementById('hud-place').textContent }; });
  const shot = async (name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 240000 }); };
  const frames = async (n) => { for (let i = 0; i < n; i++) await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };

  // 1. lift: in de lobby voor de Snellift Noord, knop zoeken en roepen
  const XN = T.lifts.find(L => L.id === 'XN');
  await put(T.CX + XN.button[0] + 0.5, fy(0), T.CZ - 14.5, Math.PI, -0.05);
  R.laadLobby = await settle();
  await frames(5);
  for (let i = 0; i < 60 && !R.knop; i++) { await frames(2); R.knop = await p.evaluate(() => { const g = window.blokGame(); g.updateTarget(); return g.action ? g.action.label : null; }); }
  await p.evaluate(() => { const g = window.blokGame(); g.updateTarget(); g.useAction(); });
  if (process.env.DBG) console.log('knop:', R.laadLobby, R.knop, JSON.stringify(await p.evaluate(() => { const g = window.blokGame(), t = g.target; const S = g.mega.S.find(s => s.L.id === 'XN'); return { t: t && [t.x, t.y, t.z, t.b], S: { f: S.f, target: S.target, door: S.door, want: S.want }, pos: g.player.pos.toArray(), eye: g.eye.toArray() }; })));
  await p.waitForFunction(() => { const S = window.blokGame().mega.S.find(s => s.L.id === 'XN'); return S.door >= 1; }, null, { timeout: 180000 });
  // instappen
  await put(T.CX + XN.cells.ci0 + 1.5, fy(0), T.CZ + XN.cells.cj0 + 1.5, Math.PI, 0);
  await frames(10);
  R.paneel = await p.evaluate(() => !document.getElementById('lift-panel').hidden);
  R.knoppen = await p.evaluate(() => [...document.querySelectorAll('#lift-panel .lp-f b')].map(e => e.textContent).join(','));
  await shot('lift-paneel');
  // de testbrowser (software-rendering) loopt veel trager dan echt: de lift sneller laten rijden zodat de test niet uren duurt
  await p.evaluate(() => { window.blokGame().mega.S.find(s => s.L.id === 'XN').L.speed = 120; });
  const t0 = Date.now();
  await p.evaluate(() => { const b = [...document.querySelectorAll('#lift-panel .lp-f')].find(e => e.querySelector('b').textContent === '120'); b.click(); });
  R.rijdt = await p.evaluate(() => !!window.blokGame().mega.riding);
  // tijdens de rit: hoogte volgen, nooit door de vloer
  const track = [];
  for (let i = 0; i < 1200; i++) {
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => { const g = window.blokGame(), S = g.mega.S.find(s => s.L.id === 'XN'); return { y: g.player.pos.y, cab: S.y, f: S.f, riding: !!g.mega.riding, door: S.door }; });
    track.push(s);
    if (!s.riding && s.f === 120 && s.door >= 1) break;
  }
  R.ritSeconden = Math.round((Date.now() - t0) / 1000);
  R.ritMaxAfwijking = +Math.max(...track.map(s => Math.abs(s.y - s.cab))).toFixed(3);
  R.aangekomen = track[track.length - 1];
  await settle();
  // uitstappen en even blijven staan (niet vallen)
  await put(T.CX + XN.cells.ci0 + 1.5, fy(120), T.CZ - 14.5, Math.PI, 0);
  await frames(30); await p.waitForTimeout(1500);
  R.na120 = await stats();
  await shot('verdieping-120');

  // 2. verdieping 100 (appartementen): deur, licht, tv, zitten
  await p.evaluate(() => { const g = window.blokGame(); g.mega.S.find(s => s.L.id === 'W'); });
  await put(T.CX + 0.5, fy(100), T.CZ - 25.5, 0, 0);
  R.laad100 = await settle();
  R.op100 = await stats();
  await shot('verdieping-100-gang');
  const inter = await p.evaluate(async () => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js');
    const p0 = g.player.pos, out = {};
    const find = (b, r = 14) => { for (let d = 0; d <= r; d++) for (let dy = -1; dy <= 3; dy++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue; const x = Math.floor(p0.x) + dx, y = Math.floor(p0.y) + dy, z = Math.floor(p0.z) + dz; if (g.world.get(x, y, z) === b) return { x, y, z, b }; } return null; };
    const door = find(B.DOOR_SHUT);
    out.deur = !!door;
    if (door) {
      const a = actionFor(g, door); out.deurLabel = a && a.label; a.run();
      out.deurOpen = g.world.get(door.x, door.y, door.z) === B.DOOR_OPEN && g.world.get(door.x, door.y + 1, door.z) === B.DOOR_OPEN_TOP;
      out.deurBotsing = g.solid(door.x, door.y, door.z);
      out.deurPos = [door.x, door.y, door.z];
      // terug dicht, dan weer open laten (voor de opslagtest)
      actionFor(g, { ...door, b: B.DOOR_OPEN }).run(); out.deurDicht = g.world.get(door.x, door.y, door.z) === B.DOOR_SHUT;
      actionFor(g, door).run();
    }
    const sw = find(B.SWITCH);
    if (sw) { const before = find(B.LAMP, 9) ? 1 : 0; actionFor(g, sw).run(); out.schakelaar = true; out.lampUit = !!find(B.LAMP_OFF, 9); }
    const tv = find(B.TV, 20);
    if (tv) { actionFor(g, tv).run(); out.tvAan = g.world.get(tv.x, tv.y, tv.z) === B.TV_ON; out.tvPos = [tv.x, tv.y, tv.z]; }
    for (const s of [B.SOFA, B.SOFA_LEATHER, B.CHAIR, B.CHAIR_RED]) { const c = find(s, 20); if (c && !g.world.get(c.x, c.y + 1, c.z)) { const a = actionFor(g, c); if (a) { a.run(); out.zit = !!g.seat && g.seat.kind; out.zitY = +g.player.pos.y.toFixed(2); break; } } }
    return out;
  });
  R.interactie = inter;
  await frames(10);
  // opstaan door te bewegen
  await p.evaluate(() => { const g = window.blokGame(); g.keys.add('KeyW'); });
  await frames(3);
  R.opgestaan = await p.evaluate(() => { const g = window.blokGame(); g.keys.delete('KeyW'); return !g.seat; });
  // bed
  R.bed = await p.evaluate(async () => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js'), { actionFor } = await import('./js/interact.js'), p0 = g.player.pos;
    for (let d = 0; d < 20; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) { const x = Math.floor(p0.x) + dx, z = Math.floor(p0.z) + dz, y = Math.floor(p0.y); const b = g.world.get(x, y, z); if ((b === B.BED || b === B.BED_BLUE) && !g.world.get(x, y + 1, z)) { actionFor(g, { x, y, z, b }).run(); const k = g.seat && g.seat.kind; g.seat = null; return k; } }
    return null;
  });

  // 3. opslaan en opnieuw laden: de open deur en de tv blijven zoals ze waren, ook een geplaatst blok
  await p.evaluate(() => { const g = window.blokGame(); g.world.set(Math.floor(g.player.pos.x), Math.floor(g.player.pos.y) + 2, Math.floor(g.player.pos.z) + 2, 63); g.saveDirtyTiles(); g.ui.onSave?.(true); });
  await p.waitForTimeout(2500);
  const posBefore = await p.evaluate(() => window.blokGame().player.pos.toArray());
  await p.reload();
  await start();
  await settle();
  R.naHerladen = await p.evaluate(async ([dp, tp, pb]) => {
    const g = window.blokGame(), { B } = await import('./js/blocks.js');
    return { deurNogOpen: dp ? g.world.get(dp[0], dp[1], dp[2]) === B.DOOR_OPEN : null, tvNogAan: tp ? g.world.get(tp[0], tp[1], tp[2]) === B.TV_ON : null,
      positie: g.player.pos.toArray().map(v => Math.round(v)), zelfdePlek: g.player.pos.distanceTo({ x: pb[0], y: pb[1], z: pb[2] }) < 3, blok: g.world.get(Math.floor(pb[0]), Math.floor(pb[1]) + 2, Math.floor(pb[2]) + 2) === 63 };
  }, [inter.deurPos, inter.tvPos, posBefore]);

  // 4. snelreizen naar elke plek in de toren (tp-lijst), na 2 s nog op dezelfde hoogte (niet vallen, niet vast)
  R.snelreizen = [];
  const chips = await p.evaluate(() => [...document.querySelectorAll('#tp-list .chip')].map(c => c.textContent));
  for (const name of chips.slice(0, 9)) {
    await p.evaluate((n) => [...document.querySelectorAll('#tp-list .chip')].find(c => c.textContent === n).click(), name);
    await settle(90000);
    const y0 = await p.evaluate(() => window.blokGame().player.pos.y);
    await frames(20); await p.waitForTimeout(1500);
    const s = await p.evaluate(() => { const g = window.blokGame(), q = g.player.pos; return { y: q.y, vast: g.collides(q.x, q.y, q.z), hud: document.getElementById('hud-place').textContent }; });
    R.snelreizen.push({ name, ok: Math.abs(s.y - y0) < 0.6 && !s.vast, dy: +(s.y - y0).toFixed(2), hud: s.hud.slice(0, 70) });
    if (name.includes('Observatie')) await shot('observatie-248');
    if (name.includes('Hotelreceptie')) await shot('hotelreceptie-30');
  }
  // 5. verticale streaming: straat, 249, -100 m en snel langs de toren vliegen
  await put(T.CX + 0.5, fy(249), T.CZ - 14.5, 0, 0); await settle(); R.op249 = await stats();
  await put(T.CX + 13.5, fy(-25), T.CZ + 0.5, 0, 0); await settle(); R.opMin100 = await stats(); await shot('kelder-B25');
  await put(T.CX + 0.5, T.G + 0.02, T.CZ - 60.5, Math.PI, 0.2); await settle(); R.straat = await stats(); await shot('straat-toren');
  const fly = [];
  for (let y = T.G + 20; y < T.G + 1000; y += 120) { await put(T.CX + 0.5, y, T.CZ - 80, Math.PI, 0); await p.waitForTimeout(300); fly.push(await p.evaluate(() => window.blokGame().queue.length)); }
  R.vliegenWachtrij = fly;
  R.fps = await p.evaluate(() => Math.round(window.blokGame().fps || 0));
  console.log('megatower:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
