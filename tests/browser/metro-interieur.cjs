// Metro M1 als passagier (Megatower City, tunnel rond x 5337, z 5116): wat ziet de camera?
// Meet: wat er recht boven, onder en opzij van de camera zit (stralen tegen de voertuigmodellen), of de camera in een
// massief onderdeel staat, de HUD-teksten (geen undefined/null/[object Object]) en of HUD-onderdelen overlappen.
// Maakt screenshots (SHOTS=map) van binnen en van buiten.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS, TAG = process.env.TAG || 'na';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CON ' + m.text().slice(0, 200)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 13, cycle: false, weather: 'clear', weatherSet: true, view: 96 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  await p.evaluate(() => { const g = window.blokGame(); g.player.pos.set(5337, g.meta.ground - 17, 5116); g.player.fly = true; g.updateTiles(true); });
  await p.waitForFunction(() => { const g = window.blokGame(); return g.traffic && g.traffic.agents && g.traffic.agents.some(a => a.kind === 'metro' && !a.dead); }, null, { timeout: 400000, polling: 1000 });
  for (let i = 0; i < 120; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.tiled.inFlight === 0 && g.queue.length < 10; })) break; }
  const R = await p.evaluate(async (tag) => {
    const g = window.blokGame(), THREE = await import('three'), { Drive } = await import('./js/drive.js'), tr = g.traffic, out = { tag };
    g.running = false; cancelAnimationFrame(g.raf);
    const P = g.player.pos;
    const m = tr.agents.filter(a => a.kind === 'metro' && !a.dead).sort((a, b) => { const ha = tr.behind(a, a.L / 2, {}), hb = tr.behind(b, b.L / 2, {}); return Math.hypot(ha.x - P.x, ha.z - P.z) - Math.hypot(hb.x - P.x, hb.z - P.z); })[0];
    out.metro = { lijn: m.line, kleur: '#' + m.color.toString(16).padStart(6, '0'), delen: m.secs.map(s => s.m) };
    g.drive = new Drive(g, m, 'passenger');
    m.v = Math.max(m.v, 16.7); // ± 60 km/h
    const frame = (n = 1) => { for (let i = 0; i < n; i++) { tr.update(1 / 30, g.player.pos, 1, 13); g.drive.hudT = -1; g.drive.update(1 / 30); g.drive.placeCamera(g.camera); g.updateHud?.(true); } g.camera.updateMatrixWorld(true); g.render(); };
    // de tunnel rond de metro eerst helemaal opbouwen (anders kijk je door nog niet getekende wanden)
    const build = () => { for (let k = 0; k < 400 && g.queue.length > 0; k++) { g.updateTiles(); g.buildSome(); } };
    frame(20); build(); frame(2);
    const cam = g.camera.position.clone();
    out.wachtrij = g.queue.length;
    out.camera = [Math.round(cam.x), +cam.y.toFixed(2), Math.round(cam.z)];
    // stralen vanuit de camera tegen de voertuigmodellen
    const ray = new THREE.Raycaster(); ray.near = 0; ray.far = 20;
    const meshes = []; tr.group.traverse(o => { if (o.isInstancedMesh && o.count > 0) { o.boundingSphere = null; o.boundingBox = null; meshes.push(o); } });
    const kindOf = (o) => { for (const [k, M] of Object.entries(tr.meshes)) for (const [part, im] of Object.entries(M.set)) if (im === o) return k + '.' + part; return o.name || '?'; };
    const cast = (dir) => { ray.set(cam, dir); const h = ray.intersectObjects(meshes, false)[0]; return h ? { afstand: +h.distance.toFixed(2), onderdeel: kindOf(h.object) } : null; };
    const yaw = g.camera.rotation.y;
    out.boven = cast(new THREE.Vector3(0, 1, 0)); out.onder = cast(new THREE.Vector3(0, -1, 0));
    out.links = cast(new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw))); out.rechts = cast(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)));
    out.vooruit = cast(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)));
    // HUD
    const vis = (el) => el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
    const texts = [...document.querySelectorAll('#hud-place, #hud-coords, #drive-hud, #toast, .toast')].filter(vis).map(e => e.textContent).join(' | ');
    out.hudFout = /undefined|null|\[object Object\]|NaN/.test(texts) ? texts.match(/.{0,40}(undefined|null|\[object Object\]|NaN).{0,20}/)[0] : null;
    out.plaats = document.getElementById('hud-place')?.textContent; out.coords = document.getElementById('hud-coords')?.textContent;
    const els = ['drive-hud', 'drive-pad', 'toast', 'minimap', 'nav-hud', 'fps-hud', 'hotbar', 'hud-place', 'hud-coords'].map(id => document.getElementById(id)).filter(vis);
    const ov = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect(); if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) ov.push(els[i].id + '×' + els[j].id); }
    out.overlap = ov;
    // wereldblokken binnen de bak van de metro (mag niet: dan steekt de wereld in het voertuig)
    { const { BLOCKS } = await import('./js/blocks.js'); const hits = {}; let n = 0, ex = [];
      for (let sd = 1; sd < m.L - 1; sd += 0.5) { const h = tr.behind(m, sd, {}), b2 = tr.behind(m, sd + 1, {}), dx = h.x - b2.x, dz = h.z - b2.z, l = Math.hypot(dx, dz) || 1, rx = dz / l, rz = -dx / l;
        for (let lat = -1.25; lat <= 1.25; lat += 0.25) for (let yy = 1.2; yy <= 3.1; yy += 0.3) { const x = Math.floor(h.x + rx * lat), y = Math.floor(h.y + yy), z = Math.floor(h.z + rz * lat); if (g.world.solidAt(x, y, z)) { n++; const nm = BLOCKS[g.world.get(x, y, z)]?.name; hits[nm] = (hits[nm] || 0) + 1; if (ex.length < 4) ex.push([x, y, z, nm, +lat.toFixed(2), +yy.toFixed(1)]); } } }
      out.blokkenInMetro = n; out.blokSoorten = hits; out.voorbeelden = ex; out.metroY = +tr.behind(m, m.L / 2, {}).y.toFixed(2); }
    window.__frame = (n) => { frame(n); build(); frame(1); };
    out.scherm = g.drive.scr ? g.drive.scr.text : null; out.hud = (document.getElementById('drive-hud')?.textContent || '').replace(/\s+/g, ' ').trim();
    return out;
  }, TAG);
  if (SHOTS) {
    await p.evaluate(() => { for (const el of document.querySelectorAll('.ov')) el.hidden = true; });
    await p.screenshot({ path: path.join(SHOTS, `metro-binnen-${TAG}.png`) });
    await p.evaluate(() => { const g = window.blokGame(); g.drive.cam = 'stand'; g.player.yaw = 0; window.__frame(2); });
    await p.screenshot({ path: path.join(SHOTS, `metro-staand-${TAG}.png`) });
    // ook met de echte spellus (zoals tijdens het spelen)
    await p.evaluate(() => { const g = window.blokGame(); g.drive.cam = 'seat'; g.player.yaw = 0; g.touch = true; g.running = false; g.start(); g.setPaused?.(false); for (const el of document.querySelectorAll('.ov')) el.hidden = true; });
    await p.waitForTimeout(4000);
    await p.screenshot({ path: path.join(SHOTS, `metro-spellus-${TAG}.png`) });
    await p.evaluate(() => { const g = window.blokGame(); g.running = false; cancelAnimationFrame(g.raf); });
    await p.evaluate(() => { const g = window.blokGame(); g.drive.cam = 'window'; window.__frame(2); });
    await p.screenshot({ path: path.join(SHOTS, `metro-raam-${TAG}.png`) });
    await p.evaluate(() => { const g = window.blokGame(); g.drive.cam = 'chase'; window.__frame(3); });
    await p.screenshot({ path: path.join(SHOTS, `metro-buiten-${TAG}.png`) });
  }
  console.log('metro-interieur:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
