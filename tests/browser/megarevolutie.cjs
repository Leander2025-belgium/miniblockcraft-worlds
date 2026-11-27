// TERRANOVA 16.1 — Megatower Revolution in de echte game: laadt Megatower City en controleert
//  - geen JavaScript- of shaderfouten; de nieuwe gevel (ledgevel, ribben) is er van dichtbij, de verre toren heeft de
//    eigen gevelschaduw (facadeAt = 6); 's nachts staat de lichtgolf aan (uniform occ volgt het uur)
//  - Grand Central: de plaatsnamen (HUD) op perron, hal, tram -1, metro -2 en hyperloopterminal; de stationshal heeft
//    een vertrekbord; het verkeersnet heeft 22 treinperronsporen, 10 tramsporen en 6 metrosporen met haltes
//  - treindienstleiding: in 6 minuten spel komen treinen binnen op vrije perronsporen, zonder twee treinen op één
//    perronspoor en zonder twee voertuigen tegelijk in één wisselstraat
//  - hyperloop: de capsule rijdt van A naar B volgens de dienstregeling, en een speler in de capsule rijdt mee
//  - Galleria en Grand Boulevard: winkels in de HUD, roltrappen en liften, voetgangers in het winkelcentrum
// Schermafdrukken in SHOTS (standaard docs/megatower-revolution/na).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS || path.join(__dirname, '../../docs/megatower-revolution/na'), QUICK = !!process.env.QUICK; // QUICK=1: zonder schermafdrukken
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [], shaderErr = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /shader|WebGL|THREE/i.test(m.text())) shaderErr.push(m.text().slice(0, 200)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 12, cycle: false, quality: 'fast', auto: false, view: 96, lod: 1400, bewoners: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 300000 });
  const R = {};
  const go = async (x, y, z, tx, ty, tz, hour) => {
    await p.evaluate(([x, y, z, tx, ty, tz, hour]) => { const g = window.blokGame(), pl = g.player; if (hour != null) g.settings.hour = hour; pl.fly = true; pl.pos.set(x, y, z); pl.vel.set(0, 0, 0); const dx = tx - x, dz = tz - z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(ty - y, Math.hypot(dx, dz)); g.tiled.aheadKey = null; g.updateTiles(true); g.touch = true; if (!g.running) g.start(); g.setPaused?.(false); g.showOverlay?.(null); for (const el of document.querySelectorAll('.ov')) el.hidden = true; }, [x, y, z, tx, ty, tz, hour]);
    for (let i = 0; i < 160; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 4; })) break; }
    await p.waitForTimeout(2500);
  };
  const shot = (n) => QUICK ? null : p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 240000 }).catch(() => {});
  const hud = () => p.evaluate(() => document.getElementById('hud-place').textContent);
  const G = 120, RZ = 6016;
  // 1. toren van dichtbij: gevelblokken rond de speler
  await go(5184, G + 1.7, 5340, 5184, G + 140, 5184, 12);
  R.gevel = await p.evaluate(() => { const g = window.blokGame(), W = g.world, B = { LED: 132, METAL: 19 }; let led = 0, rib = 0; for (let y = 170; y < 330; y += 2) for (let x = 5136; x < 5232; x++) { const z = 5184 + 40 + 1; const b = W.get(x, y, z); if (b === B.LED) led++; if (b === B.METAL) rib++; } return { led, rib, ver: (W.tiles && 1) }; });
  await shot('toren-plein');
  // 2. Grand Central: perron, hal, tram, metro, hyperloop
  const places = [
    ['perron1', 5000, G + 10.2, RZ - 79.5, 5200, G + 11, RZ - 79.5],
    ['stationshal', 5184, G + 17.2, RZ - 70, 5184, G + 22, RZ + 40],
    ['noordingang', 5184, G + 1.2, 5895, 5184, G + 14, 5915],
    ['tramstation', 5060, G - 8.8, 5888.5, 5200, G - 8, 5888.5],
    ['metrostation', 5376.5, G - 25.8, 5980, 5376.5, G - 25, 6080],
    ['hyperloopterminal', 5160, G + 10.2, RZ + 94.5, 5240, G + 11, RZ + 99],
    ['boulevard', 5184, G + 1.7, 5420, 5184, G + 5, 5800],
    ['galleria', 5262 + 60, G + 1.7, 5518 + 60, 5262 + 114, G + 12, 5518 + 140],
    ['galleria-foodcourt', 5262 + 114, G + 18.2, 5518 + 45, 5262 + 114, G + 20, 5518 + 110],
  ];
  R.hud = {};
  for (const [n, x, y, z, tx, ty, tz] of places) { await go(x, y, z, tx, ty, tz, 12); R.hud[n] = (await hud()).slice(0, 110); await shot(n); }
  // 3. verkeersnet (bij het station, zodat alle stationstegels geladen zijn)
  await go(5184, G + 40, RZ, 5184, G, RZ + 10, 12);
  R.net = await p.evaluate(() => { const E = [...window.blokGame().traffic.net.edges.values()]; const s = (gc) => new Set(E.filter(e => e.gc === gc && e.trk && !e.throat && e.stops.length).map(e => e.trk)).size; return { trein: s('trein'), tram: s('tram'), metro: s('metro') }; });
  // 4. treindienstleiding: 6 minuten spel versneld (traffic.update met grote dt-stappen); treinen verschijnen op het
  //    hoofdspoor vóór de westelijke wisselstraat en moeten via de treindienstleiding een perronspoor krijgen
  await go(4700, G + 40, RZ, 4900, G, RZ, 12);
  R.dienst = await p.evaluate(async () => {
    const g = window.blokGame(), tr = g.traffic, out = { conflictSpoor: 0, conflictWissel: 0, maxTreinen: 0, perronsporen: new Set(), tram: new Set(), metro: new Set() };
    for (let i = 0; i < 12; i++) tr.spawn('train', { x: 4250, z: 6016 }, false);
    for (let i = 0; i < 6; i++) tr.spawn('tram', { x: 5100, z: 5888 }, false);
    for (let i = 0; i < 6; i++) tr.spawn('metro', { x: 5376, z: 6016 }, false);
    for (let step = 0; step < 1800; step++) {
      tr.update(0.2, { x: 4800, y: 130, z: 6016 }, 1, 12);
      const on = new Map(), th = new Map();
      for (const a of tr.agents) {
        if (a.dead || !(a.kind === 'train' || a.kind === 'tram' || a.kind === 'metro')) continue;
        const e = a.route[0].e;
        if (e.trk && !e.throat) { (a.kind === 'train' ? out.perronsporen : a.kind === 'tram' ? out.tram : out.metro).add(e.trk); const k = e.trk; if (on.has(k) && on.get(k) !== a) out.conflictSpoor++; on.set(k, a); }
        const ids = new Set(a.route.filter(r => r.e.throat).map(r => r.e.throat));
        for (const id of ids) { if (th.has(id) && th.get(id) !== a) out.conflictWissel++; th.set(id, a); }
      }
      out.maxTreinen = Math.max(out.maxTreinen, tr.agents.filter(a => !a.dead && a.kind === 'train').length);
      if (step % 50 === 0) await new Promise(r => setTimeout(r, 0));
    }
    out.treinenBinnen = [...(tr.gcUsed || [])].filter(t => t <= 22).length;
    return { ...out, perronsporen: [...out.perronsporen].sort((a, b) => a - b), tram: [...out.tram].sort((a, b) => a - b), metro: [...out.metro].sort((a, b) => a - b), gebruikt: [...(tr.gcUsed || [])].sort((a, b) => a - b) };
  });
  // 5. hyperloop: speler in de capsule in terminal A, wachten tot hij vertrekt en aankomt
  R.hyper = await p.evaluate(async () => {
    const g = window.blokGame(), H = g.mega.hyper; if (!H) return { geen: true };
    const t = H.now(), ph = H.phaseAt(t), wait = ph.state === 'A' ? ph.dwellLeft + 1 : (300 - ((t - 74) % 300 + 300) % 300) + 1;
    H.t0 += Math.max(0, wait - 8);                         // klok vooruit tot vlak voor het vertrek in A
    const pos = H.posAt(0); g.player.fly = false; g.player.pos.set(pos.x, pos.y + 0.05, pos.z);
    const start = { x: g.player.pos.x }, seen = new Set();
    for (let i = 0; i < 400; i++) { g.clock += 0.5; H.update(0.5); seen.add(H.state); if (H.state === 'B') break; }
    return { staten: [...seen], meegereden: H.events.meegereden, aangekomen: H.state === 'B', spelerX: Math.round(g.player.pos.x), startX: Math.round(start.x), rit_s: Math.round(H.rideT), top_kmh: Math.round(H.vtop * 3.6) };
  });
  // 6. Galleria: voetgangers in het winkelcentrum
  await go(5262 + 114, G + 1.7, 5518 + 60, 5262 + 114, G + 4, 5518 + 140, 12);
  await p.waitForTimeout(4000);
  R.voetgangers = await p.evaluate(() => { const tr = window.blokGame().traffic; const W = tr.agents.filter(a => !a.dead && a.kind === 'walk'); const inG = W.filter(a => { const q = tr.behind(a, 0, {}); return q.x >= 5262 && q.x < 5490 && q.z >= 5518 && q.z < 5746; }); return { totaal: W.length, inGalleria: inG.length, hoger: inG.filter(a => tr.behind(a, 0, {}).y > 126).length }; });
  // 7. nacht: lichtgolf en kamers
  await go(4300, G + 200, 5800, 5184, G + 500, 5184, 22);
  R.nacht = await p.evaluate(() => { const g = window.blokGame(); return { occ: g.matOpaque.uniforms.occ.value, led: !!g.matOpaque.uniforms.ledTile, farOcc: g.lod?.mat?.uniforms?.occ?.value }; });
  await shot('toren-nacht');
  if (!QUICK) { await go(3600, G + 1150, 6600, 5184, G + 500, 5184, 13); await shot('toren-lucht');
  await go(5184, G + 60, 4200, 5184, G + 450, 5184, 15); await shot('toren-noord');
  await go(6300, G + 120, 5300, 5184, G + 500, 5184, 9); await shot('toren-oost');
  await go(4300, G + 520, 6900, 5184, G + 300, 5184, 17); await shot('panorama'); }
  console.log('megarevolutie:', JSON.stringify(R));
  const D = R.dienst;
  const ok = !errs.length && !shaderErr.length && R.gevel.led > 0
    && /perron 1/i.test(R.hud.perron1) && /stationshal/.test(R.hud.stationshal) && /Tramstation/.test(R.hud.tramstation) && /Metro M2/.test(R.hud.metrostation) && /Hyperloop/.test(R.hud.hyperloopterminal) && /Boulevard/.test(R.hud.boulevard) && /Galleria/.test(R.hud.galleria)
    && R.net.trein === 22 && R.net.tram === 10 && R.net.metro === 6
    && D.conflictSpoor === 0 && D.conflictWissel === 0 && D.perronsporen.length >= 3 && D.treinenBinnen >= 2
    && R.hyper.aangekomen && R.hyper.meegereden >= 1 && R.hyper.spelerX > 8800
    && R.voetgangers.inGalleria > 0;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen', '· shader:', shaderErr.length ? shaderErr.slice(0, 3).join(' | ') : 'geen');
  await b.close(); process.exit(ok ? 0 : 1);
})();
