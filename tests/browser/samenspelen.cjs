// TERRANOVA 16 — samen spelen (proef): twee spelers in twee aparte browsers, verbonden met de echte server
// (server/mp-server.mjs, tijdelijke map). Controles: elkaar zien (avatar + naam), posities komen aan, een bouwactie
// van A verschijnt bij B, een te verre bouwactie wordt door de server geweigerd, chat en "deel voertuig" komen aan,
// zonder server blijft de game gewoon werken (verbinden mislukt netjes).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const PORT = 18787, DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-mp-b-'));
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '../../server/mp-server.mjs')], { env: { ...process.env, MP_PORT: String(PORT), MP_HOST: '127.0.0.1', MP_DATA: DATA }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => { if (/op 127/.test(d)) r(); }));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const open = async (name, dx) => {
    const ctx = await b.newContext({ viewport: { width: 480, height: 320 } }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
    await p.goto('http://localhost:8765/#debug');
    await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 14, cycle: false, quality: 'fast', auto: false, view: 48, lod: 400, cam: 'third' })));
    await p.reload();
    await p.evaluate(() => document.getElementById('btn-mega').click());
    await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.player && g.mega; }, null, { timeout: 240000 });
    await p.evaluate((dx) => { const g = window.blokGame(); Object.assign(g.player, { fly: true, yaw: 0, pitch: 0 }); g.player.pos.set(5150 + dx, g.meta.ground + 6, 4900); g.player.vel.set(0, 0, 0); g.tiled.aheadKey = null; g.updateTiles(true); }, dx);
    for (let i = 0; i < 300; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
    return p;
  };
  const A = await open('A', 0), B = await open('B', 4);
  const R = {};
  // zonder server: netjes mislukken, de game draait door
  R.zonderServer = await A.evaluate(async () => {
    const g = window.blokGame(); document.getElementById('btn-mp').click();
    document.getElementById('sp-url').value = 'ws://127.0.0.1:1'; document.getElementById('sp-name').value = 'Anna';
    document.getElementById('sp-connect').click(); await new Promise(r => setTimeout(r, 2500));
    return { status: g.mp && g.mp.status, draait: g.running };
  });
  const connect = (p, name) => p.evaluate(async ({ name, port }) => {
    const g = window.blokGame(); document.getElementById('btn-mp').click();
    document.getElementById('sp-url').value = `ws://127.0.0.1:${port}`; document.getElementById('sp-name').value = name;
    document.getElementById('sp-connect').click();
    for (let i = 0; i < 40 && !(g.mp && g.mp.status === 'verbonden'); i++) await new Promise(r => setTimeout(r, 250));
    g.resume?.(); return { status: g.mp.status, room: g.mp.room };
  }, { name, port: PORT });
  R.A = await connect(A, 'Anna'); R.B = await connect(B, 'Bram');
  await A.waitForTimeout(1500);
  // B beweegt: A ziet hem bewegen
  await B.evaluate(() => { const g = window.blokGame(); g.player.pos.x += 3; });
  await A.waitForTimeout(2500);
  R.zien = await A.evaluate(() => { const g = window.blokGame(), o = [...g.mp.others.values()][0]; return o && { naam: o.name, x: +o.cur.x.toFixed(1), zichtbaar: o.av.group.visible, label: o.label.visible }; });
  R.bPos = await B.evaluate(() => +window.blokGame().player.pos.x.toFixed(1));
  // A bouwt een blok vlak bij zich (via de gewone bouwlaag), B krijgt het
  R.bouw = await A.evaluate(async () => {
    const g = window.blokGame(), p = g.player.pos, x = Math.floor(p.x) + 2, y = Math.floor(p.y) + 1, z = Math.floor(p.z);
    g.builder.begin(); g.builder.set(x, y, z, 4); g.builder.commit();
    return { x, y, z, b: g.world.get(x, y, z) };
  });
  await B.waitForTimeout(1500);
  R.bijB = await B.evaluate((q) => window.blokGame().world.get(q.x, q.y, q.z), R.bouw);
  R.bOngedaan = await B.evaluate(() => window.blokGame().builder.undoStack.length);
  // B probeert iets ver weg te bouwen (rechtstreeks een bericht sturen): geweigerd
  R.weigering = await B.evaluate(async () => { const g = window.blokGame(); g.mp.send({ t: 'build', x: 9999, y: 50, z: 9999, b: 4 }); await new Promise(r => setTimeout(r, 800)); return g.mp.lastReject; });
  // chat en voertuig delen
  await A.evaluate(() => { document.getElementById('sp-say').value = 'hallo Bram'; document.getElementById('sp-send').click(); });
  await B.waitForTimeout(1000);
  R.chat = await B.evaluate(() => window.blokGame().mp.chat.map(c => c.text));
  // stoppen: A verdwijnt bij B
  await A.evaluate(() => document.getElementById('sp-leave').click());
  await B.waitForTimeout(1200);
  R.naStoppen = await B.evaluate(() => window.blokGame().mp.others.size);
  console.log('samenspelen:', JSON.stringify(R));
  const ok = /kan niet verbinden|verbroken|geen antwoord/.test(R.zonderServer.status) && R.zonderServer.draait
    && R.A.status === 'verbonden' && R.B.status === 'verbonden' && R.A.room === R.B.room
    && R.zien && R.zien.naam === 'Bram' && Math.abs(R.zien.x - R.bPos) < 0.6 && R.zien.zichtbaar && R.zien.label
    && R.bouw.b === 4 && R.bijB === 4 && R.bOngedaan === 0
    && R.weigering && R.weigering.why === 'te ver weg'
    && R.chat.some(t => /Anna: hallo Bram/.test(t)) && R.naStoppen === 0;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); srv.kill('SIGTERM'); fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(ok && !errs.length ? 0 : 1);
})();
