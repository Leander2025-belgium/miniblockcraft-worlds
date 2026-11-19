// Interieurs van trein, bus en tram (Megatower City) als passagier: plafond en vloer op de goede hoogte (stralen vanuit
// de camera), geen massief blok rond de camera, HUD zonder undefined, screenshots (SHOTS=map) van binnen.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {}, errs = [];
  // plekken: bus op een laan bij de toren, tram op de laan x = 30 tegels, trein bij Megatower Centraal (elk een nieuwe pagina)
  for (const [kind, x, z] of [['bus', 5184, 4990], ['tram', 30 * 128, 4600], ['train', 4960, 6016]]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
    p.on('pageerror', e => errs.push(kind + ': ' + e.message));
    await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
    await p.goto('http://localhost:8765/#debug');
    await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 13, cycle: false, weather: 'clear', weatherSet: true, view: 96 })));
    await p.reload();
    await p.evaluate(() => document.getElementById('btn-mega').click());
    await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
    await p.evaluate(([x, z]) => { const g = window.blokGame(); g.player.pos.set(x, g.meta.ground + 2, z); g.player.fly = true; g.updateTiles(true); }, [x, z]);
    for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.tiled.inFlight === 0 && g.queue.length < 10; })) break; }
    const ok = await p.waitForFunction((k) => { const g = window.blokGame(); return g.traffic && g.traffic.agents.some(a => a.kind === k && !a.dead); }, kind, { timeout: 300000, polling: 1000 }).then(() => true).catch(() => false);
    if (!ok) { out[kind] = { fout: 'geen ' + kind + ' gevonden' }; continue; }
    out[kind] = await p.evaluate(async (k) => {
      const g = window.blokGame(), THREE = await import('three'), { Drive } = await import('./js/drive.js'), tr = g.traffic, r = {};
      g.running = false; cancelAnimationFrame(g.raf);
      const P = g.player.pos, v = tr.agents.filter(a => a.kind === k && !a.dead).sort((a, c) => { const ha = tr.behind(a, a.L / 2, {}), hc = tr.behind(c, c.L / 2, {}); return Math.hypot(ha.x - P.x, ha.z - P.z) - Math.hypot(hc.x - P.x, hc.z - P.z); })[0];
      r.model = v.secs.map(s => s.m).join('+');
      if (g.drive) g.drive.exit();
      g.drive = new Drive(g, v, 'passenger');
      const frame = (n = 1) => { for (let i = 0; i < n; i++) { tr.update(1 / 30, g.player.pos, 1, 13); g.drive.hudT = -1; g.drive.update(1 / 30); g.drive.placeCamera(g.camera); g.updateHud?.(true); } for (let q = 0; q < 300 && g.queue.length; q++) { g.updateTiles(); g.buildSome(); } g.camera.updateMatrixWorld(true); g.render(); };
      frame(15);
      const cam = g.camera.position.clone(), ray = new THREE.Raycaster(); ray.far = 20;
      const meshes = []; tr.group.traverse(o => { if (o.isInstancedMesh && o.count > 0) { o.boundingSphere = null; o.boundingBox = null; meshes.push(o); } });
      const nameOf = (o) => { for (const [kk, M] of Object.entries(tr.meshes)) for (const [part, im] of Object.entries(M.set)) if (im === o) return kk + '.' + part; return '?'; };
      const cast = (d) => { ray.set(cam, d); const h = ray.intersectObjects(meshes, false)[0]; return h ? { afstand: +h.distance.toFixed(2), onderdeel: nameOf(h.object) } : null; };
      r.boven = cast(new THREE.Vector3(0, 1, 0)); r.onder = cast(new THREE.Vector3(0, -1, 0));
      const texts = ['hud-place', 'hud-coords', 'drive-hud', 'toast'].map(id => document.getElementById(id)?.textContent || '').join(' | ');
      r.hudFout = /undefined|null|\[object Object\]|NaN/.test(texts);
      r.hud = (document.getElementById('drive-hud')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      window.__frame = frame;
      return r;
    }, kind);
    if (SHOTS && !out[kind].fout) {
      // de echte spellus laten draaien (zoals tijdens het spelen), dan de foto
      await p.evaluate(() => { const g = window.blokGame(); g.drive.cam = 'stand'; g.player.yaw = 0; g.player.pitch = 0; g.touch = true; g.running = false; g.start(); g.setPaused?.(false); for (const el of document.querySelectorAll('.ov')) el.hidden = true; });
      await p.waitForTimeout(5000);
      out[kind].foto = await p.evaluate(() => { const g = window.blokGame(); return { tegels: g.world.tiles.size, pos: [Math.round(g.player.pos.x), Math.round(g.player.pos.y), Math.round(g.player.pos.z)], cam: [Math.round(g.camera.position.x), Math.round(g.camera.position.y), Math.round(g.camera.position.z)], tekenopdr: g.renderer.info.render.calls, verkeerZichtbaar: g.traffic.group.visible, scene: g.traffic.group.parent === g.scene }; });
      await p.screenshot({ path: path.join(SHOTS, `interieur-${kind}.png`) });
    }
    await p.close();
  }
  console.log('voertuig-interieurs:', JSON.stringify(out));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
