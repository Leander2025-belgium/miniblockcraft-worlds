// TERRANOVA 15 — bouwmodus (js/build.js, js/buildlib.js): vloer, kamer, lijn, kopiëren, spiegelen, draaien, plakken
// met botsingscontrole, een grote vulling in stukjes (geen bevriezing) en ongedaan maken/opnieuw daarvan, en de
// bouwbibliotheek (categorieën, zoeken, favorieten, recent).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.removeItem('terranova-build-fav'); localStorage.removeItem('terranova-build-recent'); localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 12, cycle: false, weather: 'clear', weatherSet: true, view: 64, quality: 'fast', auto: false })); });
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.builder; }, null, { timeout: 180000 });
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(1500, g.meta.ground + 40, 1500); g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  const R = await p.evaluate(() => {
    const g = window.blokGame(), Bd = g.builder, w = g.world, G = g.meta.ground, out = {};
    g.running = false; cancelAnimationFrame(g.raf);
    const X = 1480, Z = 1480, Y = G + 20; // in de lucht: niets in de weg
    const count = (x0, y0, z0, x1, y1, z1, id) => { let n = 0; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (id === undefined ? w.get(x, y, z) : w.get(x, y, z) === id) n++; return n; };
    g.hotbar[g.slot] = 9; Bd.on = true;
    // vloer 10 × 8
    Bd.a = [X, Y, Z]; Bd.b = [X + 9, Y + 4, Z + 7]; Bd.floor();
    out.vloer = { bodem: count(X, Y, Z, X + 9, Y, Z + 7), erboven: count(X, Y + 1, Z, X + 9, Y + 4, Z + 7) };
    Bd.undo(); out.vloerOngedaan = count(X, Y, Z, X + 9, Y, Z + 7); Bd.redo(); out.vloerOpnieuw = count(X, Y, Z, X + 9, Y, Z + 7); Bd.undo();
    // kamer 8 × 4 × 6: alleen de schil
    Bd.a = [X, Y, Z]; Bd.b = [X + 7, Y + 3, Z + 5]; Bd.room();
    out.kamer = { schil: count(X, Y, Z, X + 7, Y + 3, Z + 5), binnen: count(X + 1, Y + 1, Z + 1, X + 6, Y + 2, Z + 4), verwacht: 8 * 4 * 6 - 6 * 2 * 4 };
    Bd.undo();
    // lijn van (X,Y,Z) naar (X+9,Y+4,Z+9)
    Bd.a = [X, Y, Z]; Bd.b = [X + 9, Y + 4, Z + 9]; g.hotbar[g.slot] = 8; Bd.line();
    out.lijn = { blokken: count(X, Y, Z, X + 9, Y + 4, Z + 9, 8), begin: w.get(X, Y, Z), einde: w.get(X + 9, Y + 4, Z + 9) };
    Bd.undo();
    // kopiëren, spiegelen, draaien: een L-vorm van 3 blokken
    w.set(X, Y, Z, 8); w.set(X + 1, Y, Z, 9); w.set(X, Y, Z + 1, 10);
    Bd.a = [X, Y, Z]; Bd.b = [X + 1, Y, Z + 1]; Bd.copy();
    const d0 = [...Bd.clip.data]; Bd.mirror('x'); const d1 = [...Bd.clip.data]; Bd.rotate(); const d2 = [...Bd.clip.data];
    out.spiegel = { voor: d0, gespiegeld: d1, gedraaid: d2 };
    // plakken met botsingscontrole: plek waar al een blok staat
    Bd.pasteSpot = () => [X, Y, Z];
    const before = count(X - 2, Y, Z - 2, X + 2, Y, Z + 2);
    Bd.paste(); out.botsingEerst = { gewijzigd: count(X - 2, Y, Z - 2, X + 2, Y, Z + 2) !== before || !!Bd.job, gevraagd: !!Bd.confirmKey };
    Bd.paste(); out.botsingBevestigd = { blokken: count(X - 2, Y, Z - 2, X + 2, Y, Z + 2) };
    Bd.pasteSpot = null; delete Bd.pasteSpot;
    // grote vulling (60 × 20 × 60 = 72 000 blokken) in stukjes van ±8 ms
    g.hotbar[g.slot] = 1; const BX = X + 30, BY = G + 1, BZ = Z; // op de grond: hoog boven een lage tegel kan niet gebouwd worden (bestaande grens)
    Bd.a = [BX, BY, BZ]; Bd.b = [BX + 59, BY + 19, BZ + 59];
    const tf = performance.now(); Bd.fill('fill'); const t1 = performance.now() - tf;
    let frames = 0, worst = 0; while (Bd.job && frames < 400) { const t0 = performance.now(); Bd.update(); worst = Math.max(worst, performance.now() - t0); frames++; }
    out.grootDbg = { n: Bd.stats, eerste: w.get(BX, BY, BZ), H: w.H, G, BY, tile: !!w.tileAt?.(BX, BZ), undo: Bd.undoStack.length, laatste: Bd.undoStack[Bd.undoStack.length - 1]?.length };
    out.groot = { startMs: +t1.toFixed(1), frames, slechtsteFrameMs: +worst.toFixed(1), gevuld: count(BX, BY, BZ, BX + 59, BY + 19, BZ + 59, 1) };
    Bd.undo(); out.grootOngedaan = count(BX, BY, BZ, BX + 59, BY + 19, BZ + 59, 1);
    // bouwbibliotheek
    g.buildInventory(); const lib = g.lib;
    lib.q = 'glas'; const glas = lib.list(); lib.q = '';
    lib.toggleFav(10); lib.used(81); lib.used(21);
    out.bibliotheek = { tabs: lib.tabs(), zoekGlas: glas.length, alleGlas: glas.every(id => /glas|spiegel/i.test(window.BLOCKS_NAME ? '' : (document.querySelector('#inv-grid') ? 'glas' : ''))), favorieten: lib.list('★ Favorieten'), recent: lib.list('🕘 Recent'), deuren: lib.list('Deuren').length, meubels: lib.list('Meubels').length };
    return out;
  });
  await p.reload();
  R.bibNaHerladen = await p.evaluate(() => ({ fav: JSON.parse(localStorage.getItem('terranova-build-fav') || '[]'), rec: JSON.parse(localStorage.getItem('terranova-build-recent') || '[]') }));
  console.log('bouwmodus:', JSON.stringify(R, null, 1).slice(0, 4000));
  const ok = R.vloer.bodem === 80 && R.vloer.erboven === 0 && R.vloerOngedaan === 0 && R.vloerOpnieuw === 80
    && R.kamer.schil === R.kamer.verwacht && R.kamer.binnen === 0 && R.lijn.blokken === 10 && R.lijn.begin === 8 && R.lijn.einde === 8
    && JSON.stringify(R.spiegel.gespiegeld) === JSON.stringify([9, 8, 0, 10]) && R.spiegel.gedraaid.filter(Boolean).length === 3
    && !R.botsingEerst.gewijzigd && R.botsingEerst.gevraagd && R.groot.frames >= 4 && R.groot.gevuld === 72000 && R.groot.slechtsteFrameMs < 60 && R.grootOngedaan === 0
    && R.bibliotheek.zoekGlas >= 3 && R.bibliotheek.favorieten.includes(10) && R.bibliotheek.recent[0] === 21 && R.bibliotheek.deuren >= 2 && R.bibliotheek.meubels >= 6
    && R.bibNaHerladen.fav.includes(10) && R.bibNaHerladen.rec[0] === 21;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
