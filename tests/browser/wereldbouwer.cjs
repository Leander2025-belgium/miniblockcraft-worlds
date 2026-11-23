// TERRANOVA 16 fase 8 — wereldbouwer in de lege bouwwereld: weg (asfalt, middenstreep, stoepen, helling, pijlers
// boven een gegraven dal), spoor (ballast, spoorstaven, dwarsliggers), voetpad, heuvel, terrein vlak maken,
// beplanten; alles als één stap ongedaan te maken; bewaard na herladen. Screenshot met SHOTS=map.
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
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 11, cycle: false, quality: 'fast', auto: false, view: 96 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-flat').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.meta && g.meta.id === 'bouwwereld' && g.readyHere(); }, null, { timeout: 240000 });
  const R = {};
  const job = () => p.waitForFunction(() => !window.blokGame().builder.job, null, { timeout: 120000 });
  R.werk = await p.evaluate(async () => {
    const g = window.blokGame(), Bd = g.builder, W = g.world, BL = (await import('./js/blocks.js')).B, G = g.meta.ground, X = 2048, Z = 2048, out = {};
    g.player.fly = true; g.player.pos.set(X - 30, G + 25, Z - 30);
    Bd.toggle(true);
    // een dal graven onder het tweede deel van de weg (voor de pijlers)
    Bd.a = [X + 40, G - 10, Z - 8]; Bd.b = [X + 70, G, Z + 8]; Bd.fill('clear');
    // weg van (X, G) naar (X+100, G+6): helling, boven het dal pijlers
    Bd.a = [X, G, Z]; Bd.b = [X + 100, G + 6, Z]; const u0 = Bd.undoStack.length; Bd.world('road');
    out.wegStap = Bd.undoStack.length - u0;
    return out;
  });
  await job();
  Object.assign(R.werk, await p.evaluate(async () => {
    const g = window.blokGame(), W = g.world, BL = (await import('./js/blocks.js')).B, G = g.meta.ground, X = 2048, Z = 2048, out = {};
    out.weg = { midden: W.get(X + 3, G, Z), streep: [0, 1, 2, 3, 4, 5].map(i => W.get(X + i, G, Z)).filter(v => v === BL.LINE_WHITE).length, asfalt: W.get(X + 3, G, Z + 2), stoep: W.get(X + 3, G, Z + 4), helling: [0, 50, 100].map(x => { for (let y = G + 10; y > G - 5; y--) { const v = W.get(X + x, y, Z + 2); if (v === BL.ASPHALT) return y - G; } return null; }),
      pijler: (() => { let n = 0; for (let x = X + 40; x <= X + 70; x++) for (let y = G - 10; y < G; y++) if (W.get(x, y, Z) === BL.CONCRETE) n++; return n; })(), lantaarns: (() => { let n = 0; for (let x = X; x <= X + 100; x++) for (const z of [Z - 5, Z + 5]) for (let y = G; y < G + 9; y++) if (W.get(x, y, z) === BL.LAMP) n++; return n; })() };
    return out;
  }));
  // spoor, voetpad, heuvel, vlak maken, beplanten
  const tool = async (a, b2, k) => { await p.evaluate(([a, b2, k]) => { const Bd = window.blokGame().builder; Bd.a = a; Bd.b = b2; Bd.world(k); }, [a, b2, k]); await job(); };
  const G = await p.evaluate(() => window.blokGame().meta.ground), X = 2048, Z = 2048;
  await tool([X, G, Z + 40], [X + 80, G, Z + 40], 'rail');
  await tool([X, G, Z + 70], [X + 60, G, Z + 90], 'path');
  await tool([X + 120, G, Z], [X + 160, G + 14, Z + 40], 'hill');
  R.heuvel = await p.evaluate(([X, Z, G]) => { const W = window.blokGame().world; let top = 0; for (let y = G + 20; y >= G; y--) if (W.get(X + 140, y, Z + 20)) { top = y - G; break; } return { top }; }, [X, Z, G]);
  await tool([X + 120, G, Z - 60], [X + 160, G + 4, Z - 20], 'plant');
  R.werk2 = await p.evaluate(async ([X, Z, G]) => {
    const W = window.blokGame().world, BL = (await import('./js/blocks.js')).B, cnt = (x0, x1, z0, z1, y0, y1, id) => { let n = 0; for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) if (W.get(x, y, z) === id) n++; return n; };
    return { ballast: cnt(X, X + 80, Z + 37, Z + 43, G, G, BL.BALLAST), rails: cnt(X, X + 80, Z + 37, Z + 43, G + 1, G + 1, BL.METAL), liggers: cnt(X, X + 80, Z + 37, Z + 43, G + 1, G + 1, BL.DARK_PLANKS), pad: cnt(X, X + 60, Z + 68, Z + 92, G - 1, G + 1, BL.GRAVEL), bomen: cnt(X + 120, X + 160, Z - 60, Z - 20, G + 1, G + 12, BL.LOG) + cnt(X + 120, X + 160, Z - 60, Z - 20, G + 1, G + 12, BL.BIRCH_LOG) };
  }, [X, Z, G]);
  // heuvel weer vlak maken (laagste hoek op de grond)
  await tool([X + 120, G, Z], [X + 160, G + 14, Z + 40], 'flat');
  R.vlak = await p.evaluate(([X, Z, G]) => { const W = window.blokGame().world; let bad = 0; for (let x = X + 120; x <= X + 160; x += 4) for (let z = Z; z <= Z + 40; z += 4) { if (W.get(x, G, z) !== 3 || W.get(x, G + 1, z)) bad++; } return { afwijkend: bad }; }, [X, Z, G]);
  // ongedaan maken: één stap haalt het vlak maken weg (heuvel terug)
  R.ongedaan = await p.evaluate(([X, Z, G]) => { const g = window.blokGame(), W = g.world; g.builder.undo(); let top = 0; for (let y = G + 20; y >= G; y--) if (W.get(X + 140, y, Z + 20)) { top = y - G; break; } return { heuvelTerug: top }; }, [X, Z, G]);
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.evaluate(([X, Z, G]) => { const g = window.blokGame(); g.builder.toggle(false); g.player.pos.set(X - 25, G + 18, Z - 25); g.player.yaw = -Math.PI * 0.75; g.player.pitch = -0.35; g.touch = true; g.setPaused(false); g.showOverlay(null); }, [X, Z, G]); await p.waitForTimeout(4000); await p.screenshot({ path: path.join(SHOTS, 'wereldbouwer.png') }); }
  // bewaren en herladen
  await p.evaluate(() => document.getElementById('btn-save').click());
  await p.waitForTimeout(2500);
  await p.reload(); await p.evaluate(() => document.getElementById('btn-flat').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.meta && g.meta.id === 'bouwwereld'; }, null, { timeout: 240000 });
  await p.evaluate(([X, Z, G]) => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(X + 20, G + 20, Z + 20); g.tiled.aheadKey = null; g.updateTiles(true); }, [X, Z, G]);
  for (let i = 0; i < 200; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  R.bewaard = await p.evaluate(async ([X, Z, G]) => { const W = window.blokGame().world, BL = (await import('./js/blocks.js')).B; return { asfalt: W.get(X + 3, G, Z + 2) === BL.ASPHALT, ballast: W.get(X + 20, G, Z + 40) === BL.BALLAST }; }, [X, Z, G]);
  console.log('wereldbouwer:', JSON.stringify(R));
  const w = R.werk.weg, BL = { ASPHALT: 4, LINE_WHITE: 5, SIDEWALK: 7 };
  const ok = R.werk.wegStap === 1 && w.streep >= 2 && w.asfalt === BL.ASPHALT && w.stoep === BL.SIDEWALK && w.helling[0] === 0 && w.helling[1] === 3 && w.helling[2] === 6 && w.pijler >= 4 && w.lantaarns >= 2
    && R.werk2.ballast > 300 && R.werk2.rails > 140 && R.werk2.liggers > 30 && R.werk2.pad > 60 && R.werk2.bomen >= 4
    && R.heuvel.top >= 12 && R.vlak.afwijkend === 0 && R.ongedaan.heuvelTerug >= 12 && R.bewaard.asfalt && R.bewaard.ballast;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
