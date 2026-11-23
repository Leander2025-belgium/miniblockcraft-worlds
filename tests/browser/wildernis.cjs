// TERRANOVA 16 fase 2 — Wildernis: biomenkaart in het menu, de wereld laadt en start op droog land, de blokken in
// de geladen wereld kloppen met de generator (bodem per bioom: woestijn = zand, toendra = sneeuw, zee = water),
// er zijn grotten en ertsen onder de grond, een ander zaadgetal geeft een andere wereld met een eigen ID, en de
// bestaande werelden blijven bestaan. Screenshots met SHOTS=map.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 11, cycle: false, quality: 'fast', auto: false, view: 96, cam: 'first' })));
  await p.reload(); await p.waitForTimeout(1500);
  const R = {};
  R.menu = await p.evaluate(() => {
    const c = document.getElementById('wild-map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, cols = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return { kleuren: cols.size, knop: !!document.getElementById('btn-wild'), andereWerelden: ['btn-mega', 'btn-metro', 'btn-berg', 'btn-gi-play'].every(id => document.getElementById(id)) };
  });
  await p.evaluate(() => document.getElementById('btn-wild').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.meta && g.meta.id === 'wildernis' && g.readyHere(); }, null, { timeout: 300000 });
  await p.waitForTimeout(3000);
  R.start = await p.evaluate(async () => {
    const g = window.blokGame(), W = await import('./js/wildernis.js'), pl = g.player.pos, x = Math.floor(pl.x), z = Math.floor(pl.z);
    const gy = W.groundAt(x, z), blk = g.world.get(x, gy, z), above = g.world.get(x, gy + 1, z);
    return { id: g.meta.id, bioom: W.zoneName(x, z), hud: document.getElementById('hud-place')?.textContent || '', staat: +(pl.y - gy).toFixed(1), grond: blk, lucht: above, generatorKlopt: blk !== 0 && (above === 0 || above === 33 || above === 13 || above === 53) };
  });
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.evaluate(() => { const g = window.blokGame(); g.player.pitch = 0.05; g.touch = true; g.setPaused(false); g.showOverlay(null); }); await p.waitForTimeout(2500); await p.screenshot({ path: path.join(SHOTS, 'wildernis-start.png') }); }
  // naar andere biomen vliegen en daar de bovenste laag controleren
  const visit = async (want) => p.evaluate(async (want) => {
    const g = window.blokGame(), W = await import('./js/wildernis.js'), pl = g.player.pos;
    let best = null;
    for (let r = 200; r < 4000 && !best; r += 128) for (let a = 0; a < 24 && !best; a++) {
      const x = Math.floor(pl.x + Math.cos(a / 24 * 6.283) * r), z = Math.floor(pl.z + Math.sin(a / 24 * 6.283) * r);
      if (x < 300 || z < 300 || x > W.SIZE - 300 || z > W.SIZE - 300) continue;
      if (W.biomeAt(x, z) === want && W.biomeAt(x + 3, z) === want && W.biomeAt(x, z + 3) === want) best = { x, z };
    }
    if (!best) return { bioom: want, gevonden: false };
    g.player.fly = true; pl.set(best.x + 0.5, W.groundAt(best.x, best.z) + 25, best.z + 0.5); g.player.vel.set(0, 0, 0); g.tiled.aheadKey = null; g.updateTiles(true);
    for (let i = 0; i < 300 && !(g.readyHere() && g.tiled.inFlight === 0); i++) await new Promise(r => setTimeout(r, 400));
    const gy = W.groundAt(best.x, best.z), cnt = {};
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const yy = W.groundAt(best.x + dx, best.z + dz); let v = g.world.get(best.x + dx, Math.max(yy, W.G - 1), best.z + dz);
      if (yy < W.G) v = g.world.get(best.x + dx, W.G - 1, best.z + dz);
      cnt[v] = (cnt[v] || 0) + 1;
    }
    return { bioom: want, gevonden: true, x: best.x, z: best.z, hoogte: gy, bovenlaag: cnt, hud: W.zoneName(best.x, best.z) };
  }, want);
  R.woestijn = await visit('woestijn');
  if (SHOTS && R.woestijn.gevonden) { await p.evaluate(() => { const g = window.blokGame(); g.player.pitch = 0.35; g.setPaused(false); g.showOverlay(null); }); await p.waitForTimeout(2500); await p.screenshot({ path: path.join(SHOTS, 'wildernis-woestijn.png') }); }
  R.toendra = await visit('toendra');
  if (SHOTS && R.toendra.gevonden) { await p.evaluate(() => { const g = window.blokGame(); g.player.pitch = 0.35; g.setPaused(false); g.showOverlay(null); }); await p.waitForTimeout(2500); await p.screenshot({ path: path.join(SHOTS, 'wildernis-toendra.png') }); }
  R.zee = await visit('zee');
  // ondergrond: grotten en ertsen in de geladen wereld onder de speler
  R.ondergrond = await p.evaluate(async () => {
    const g = window.blokGame(), W = await import('./js/wildernis.js'), BL = (await import('./js/blocks.js')).B, pl = g.player.pos;
    let grot = 0, erts = 0, steen = 0;
    for (let dx = -40; dx <= 40; dx += 2) for (let dz = -40; dz <= 40; dz += 2) {
      const x = Math.floor(pl.x) + dx, z = Math.floor(pl.z) + dz, top = W.groundAt(x, z);
      for (let y = top - 8; y > 30; y--) { const v = g.world.get(x, y, z); if (v === 0) grot++; else if ([BL.COAL_ORE, BL.IRON_ORE, BL.GOLD_ORE, BL.DIAMOND_ORE].includes(v)) erts++; else if (v === BL.STONE || v === BL.DEEPSLATE) steen++; }
    }
    return { grot, erts, steen };
  });
  // ander zaadgetal: andere wereld, eigen ID
  await p.goto('http://localhost:8765/#debug'); await p.waitForTimeout(1500);
  R.zaad = await p.evaluate(async () => {
    const W = await import('./js/wildernis.js');
    document.getElementById('wild-seed').value = '42'; document.getElementById('wild-seed').dispatchEvent(new Event('change'));
    let verschil = 0; for (let i = 0; i < 40; i++) { const x = 500 + i * 180, z = 700 + i * 150; if (W.groundAt(x, z, 42) !== W.groundAt(x, z)) verschil++; }
    document.getElementById('btn-wild-seed').click();
    return { verschil, kaartZaad: document.getElementById('wild-map').dataset.seed };
  });
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.meta && g.meta.id === 'wildernis-42' && g.readyHere(); }, null, { timeout: 300000 });
  R.zaad.wereld = await p.evaluate(async () => { const g = window.blokGame(), W = await import('./js/wildernis.js'), pl = g.player.pos, x = Math.floor(pl.x), z = Math.floor(pl.z), gy = W.groundAt(x, z, 42); return { id: g.meta.id, naam: g.meta.name || g.meta.map?.name, grond: g.world.get(x, gy, z), boven: g.world.get(x, gy + 1, z) }; });
  console.log('wildernis:', JSON.stringify(R));
  const top = (r, ids) => r.gevonden && ids.reduce((s, id) => s + (r.bovenlaag[id] || 0), 0) >= 60;
  const ok = R.menu.kleuren >= 5 && R.menu.andereWerelden
    && R.start.id === 'wildernis' && R.start.generatorKlopt && R.start.staat > -0.5 && R.start.staat < 4 && R.start.hud.length > 0
    && top(R.woestijn, [16]) && top(R.toendra, [52, 13, 53]) && top(R.zee, [15, 61])
    && R.ondergrond.grot > 20 && R.ondergrond.erts > 20 && R.ondergrond.steen > 1000
    && R.zaad.verschil >= 30 && R.zaad.kaartZaad === '42' && R.zaad.wereld.id === 'wildernis-42' && R.zaad.wereld.grond !== 0;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
