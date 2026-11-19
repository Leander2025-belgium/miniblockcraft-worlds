// TERRANOVA-benchmark: vaste scènes met vaste camera, uur, weer en grafisch profiel. Meet per scène de laadtijd
// (tot de eerste speelbare frame en tot alles rond de speler klaar is), de frametijden van de echte spellus
// (gemiddelde FPS, mediaan, 95e percentiel, langste frame, 1%-low), tekenopdrachten, driehoeken, JS-geheugen,
// geladen tegels/chunks, voertuigen en reizigers. Schermafdrukken met SHOTS=map, resultaat als JSON (BENCH_OUT=bestand).
// Let op: deze browser rekent zonder grafische kaart (SwiftShader). Cijfers zijn alleen onderling vergelijkbaar
// (vóór/na op dezelfde machine), niet met een echte GPU of telefoon.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS, OUT = process.env.BENCH_OUT, SAMPLE = +(process.env.SAMPLE || 15000), ONLY = process.env.ONLY;
const PROFILE = { quality: 'normal', shadows: true, view: 160, lod: 1600, auto: false, fps: false };

// wereld → scènes. place(g, mods) zet de speler en de camera; alles is deterministisch (generatoren, geen netwerk)
const WORLDS = [
  { id: 'mega', start: (p) => p.evaluate(() => document.getElementById('btn-mega').click()), ready: 'g.mega', scenes: [
    { id: 'mega-dag', hour: 13, place: 'P(5184, g.meta.ground + 2, 4990, Math.PI, 0.18)' },
    { id: 'mega-nacht', hour: 22, place: 'P(5184, g.meta.ground + 2, 4990, Math.PI, 0.18)' },
    { id: 'mega-straat', hour: 9, place: 'P(30 * 128 + 4, g.meta.ground + 3, 4600, Math.PI, -0.05)' },
    { id: 'mega-metro', hour: 13, place: 'P(5337, g.meta.ground - 17, 5116, Math.PI / 2, 0)' },
    { id: 'mega-centraal', hour: 13, place: 'P(38 * 128 + 64, g.meta.ground + 14, 47 * 128 + 30, 0, -0.1)' },
  ] },
  { id: 'green', start: async (p) => { await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play'); }, ready: 'g.alpRail', scenes: [
    { id: 'munkbay', hour: 12, place: `(async () => { const A = await import('./js/greenisland.js'); const L = A.LINE.M1, st = L.stations.find(s => s.name === 'Munkbay-Centraal'), q = L.at(st.s), d = 6.7; P(q.x - q.tz * d, st.y + 2.2, q.z + q.tx * d, Math.atan2(q.tz, -q.tx) + Math.PI / 2, 0); })()` },
  ] },
  { id: 'alpen', start: async (p) => { await p.click('[data-mode="fantasy"]'); await p.evaluate(() => document.getElementById('btn-berg').click()); }, ready: 'g.alpRail', scenes: [
    { id: 'alpen-hbf', hour: 15, place: `(async () => { const A = await import('./js/alpen.js'); const H = A.HBF, pt = H.L.at(H.mid + 40); P(pt.x + pt.tz * 7.5, H.y + 2.1, pt.z - pt.tx * 7.5, 0, 0); })()` },
  ] },
];

const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const res = { machine: 'headless Chromium + SwiftShader (software-rendering, geen GPU)', viewport: '960x540', profile: PROFILE, scenes: {} }, errs = [];
  for (const W of WORLDS) {
    const scenes = W.scenes.filter(s => !ONLY || ONLY.split(',').includes(s.id));
    if (!scenes.length) continue;
    const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', e => errs.push(W.id + ': ' + e.message));
    await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
    await p.route(/tile\.openstreetmap|nominatim|overpass|elevation/, r => r.abort());
    await p.goto((process.env.BASE || 'http://localhost:8765/') + '#debug');
    await p.evaluate((S) => localStorage.setItem('blokstad-settings', JSON.stringify(S)), { ...PROFILE, hour: scenes[0].hour, cycle: false, weather: 'clear', weatherSet: true });
    await p.reload();
    const t0 = Date.now();
    await W.start(p);
    await p.waitForFunction(`(() => { const g = window.blokGame && window.blokGame(); return g && g.running && ${W.ready}; })()`, null, { timeout: 240000 });
    const tStart = Date.now() - t0;
    for (const S of scenes) {
      const r = { wereld: W.id, uur: S.hour };
      if (S === scenes[0]) r.wereldStart_ms = tStart;
      await p.evaluate(async ([place, hour]) => {
        const g = window.blokGame();
        window.P = (x, y, z, yaw, pitch) => { const pl = g.player; if (g.drive) g.drive.exit?.(); g.seat = null; pl.fly = true; pl.pos.set(x, y, z); pl.vel?.set?.(0, 0, 0); pl.yaw = yaw; pl.pitch = pitch; g.tiled && (g.tiled.aheadKey = null); g.updateTiles(true); };
        g.settings.hour = hour; g.settings.cycle = false;
        await eval(place);
        g.touch = true; if (!g.running) g.start(); g.setPaused?.(false); g.showOverlay?.(null);
        for (const el of document.querySelectorAll('.ov')) el.hidden = true;
      }, [S.place, S.hour]);
      const tp = Date.now();
      // tijd tot de eerste frame met de tegel van de speler, en tot alles rond de speler klaar is
      await p.waitForFunction(() => { const g = window.blokGame(); return g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 240000, polling: 100 }).catch(() => {});
      r.eersteFrame_ms = Date.now() - tp;
      r.klaar = false; for (let i = 0; i < 480; i++) { if (r.klaar = await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && (!g.tiled || g.tiled.inFlight === 0) && g.queue.length < 4; })) break; await p.waitForTimeout(250); }
      r.omgevingKlaar_ms = Date.now() - tp;
      await p.waitForTimeout(2500); // inlopen (verkeer verschijnt, automatische kwaliteit staat uit)
      Object.assign(r, await p.evaluate((ms) => new Promise(done => {
        const g = window.blokGame(), R = g.renderer, ft = [], calls = [], tris = [];
        R.info.autoReset = false; R.info.reset();
        let last = performance.now(); const end = last + ms;
        const step = () => {
          const now = performance.now(); ft.push(now - last); last = now;
          calls.push(R.info.render.calls); tris.push(R.info.render.triangles); R.info.reset();
          if (now < end) requestAnimationFrame(step);
          else {
            R.info.autoReset = true;
            const tr = g.traffic, mem = performance.memory;
            let meshes = 0; for (const c of g.chunks.values()) for (const m of [c.o, c.t]) if (m && m.visible) meshes++;
            done({ ft: ft.slice(1), calls: calls.slice(1), tris: tris.slice(1), heap_MB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
              geom: R.info.memory.geometries, tex: R.info.memory.textures, tegels: g.world.tiles ? g.world.tiles.size : null, chunks: g.chunks.size, chunkMeshes: meshes,
              voertuigen: (tr ? tr.agents.filter(a => !a.dead && a.kind !== 'walk' && a.kind !== 'ped').length : 0) + (g.alpRail ? g.alpRail.trains?.length || 0 : 0),
              npc: (tr ? tr.agents.filter(a => !a.dead && (a.kind === 'walk' || a.kind === 'ped')).length : 0) + (g.busPax?.list.length || 0) + (g.alpRail?.pax?.list?.length || 0),
              hud: (document.getElementById('hud-place')?.textContent || '').slice(0, 80) });
          }
        };
        requestAnimationFrame(() => { last = performance.now(); requestAnimationFrame(step); });
      }), SAMPLE));
      const ft = r.ft; delete r.ft;
      const avg = ft.reduce((a, x) => a + x, 0) / ft.length;
      r.frames = ft.length; r.fps = +(1000 / avg).toFixed(1); r.mediaan_ms = +pct(ft, 0.5).toFixed(1); r.p95_ms = +pct(ft, 0.95).toFixed(1); r.max_ms = +Math.max(...ft).toFixed(1);
      const worst = [...ft].sort((x, y) => y - x).slice(0, Math.max(1, Math.round(ft.length / 100)));
      r.low1_fps = ft.length >= 100 ? +(1000 / (worst.reduce((a, x) => a + x, 0) / worst.length)).toFixed(1) : null; // pas zinvol vanaf 100 frames
      r.tekenopdr = Math.round(r.calls.reduce((a, x) => a + x, 0) / r.calls.length); r.driehoeken_k = Math.round(r.tris.reduce((a, x) => a + x, 0) / r.tris.length / 1000);
      delete r.calls; delete r.tris;
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, S.id + '.png'), timeout: 240000 }).catch(e => { r.foto = 'mislukt: ' + e.message.split('\n')[0]; });
      res.scenes[S.id] = r;
      if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); // na elke scène bewaren
      console.log(S.id, JSON.stringify(r));
    }
    await p.close();
  }
  res.fouten = errs;
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
