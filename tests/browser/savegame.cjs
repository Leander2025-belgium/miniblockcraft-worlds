// Savegames over versies heen (TERRANOVA 14): de vaste oude bestanden uit tests/fixtures (gemaakt met release
// 2026-11-20a) importeren in een lege browser en controleren dat alles er is; daarna een volledige back-up maken,
// alles wissen, de back-up terugzetten en opnieuw controleren. Ook: een import overschrijft bestaand bouwwerk niet
// zonder back-up, de extensies .blokstad/.terranova werken allebei, en een kapot bestand wordt geweigerd.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const FX = path.join(__dirname, '../fixtures'), EXP = JSON.parse(fs.readFileSync(path.join(FX, 'oud-2026-11-20a.json')));
const file = (name, as) => ({ name: as || name, mimeType: 'application/octet-stream', buffer: fs.readFileSync(path.join(FX, name)) });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 500 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], R = {}; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal', sens: 1.7 })));
  await p.reload();
  // terug naar het menu: zonder 'blokstad-ingame' (anders zet de game je na het herladen meteen terug in je wereld)
  const toMenu = async () => { await p.evaluate(() => sessionStorage.clear()); await p.reload(); await p.waitForTimeout(800); };
  const msg = () => p.evaluate(() => document.getElementById('menu-msg')?.textContent || '');
  const imp = async (f) => { await p.setInputFiles('#import', f); await p.waitForTimeout(1200); return msg(); };
  const checkRegion = () => p.evaluate(async (E) => {
    const S = await import('./js/storage.js'), all = await S.listRegions(), r = all.find(x => x.name.startsWith(E.stuk.naam));
    if (!r) return { gevonden: false };
    const vox = await S.loadRegionData(r.id); let sum = 0; for (let i = 0; i < vox.length; i++) sum = (sum * 31 + vox[i]) >>> 0;
    const at = (x, y, z) => vox[(z * r.size + x) * r.H + y];
    const blokken = Object.fromEntries(Object.entries(E.stuk.blokken).map(([k, [x, y, z, v]]) => [k, at(x, y, z) === v]));
    return { gevonden: true, id: r.id, aantal: all.filter(x => x.name.startsWith(E.stuk.naam)).length, controlegetal: sum === E.stuk.controlegetal, blokken, speler: JSON.stringify(r.player) === JSON.stringify(E.stuk.speler) };
  }, EXP);

  // 1. oud .blokstad-bestand in een lege browser
  R.importStuk = await imp(file('oud-2026-11-20a.blokstad'));
  R.stuk = await checkRegion();
  // ook onder de nieuwe extensie .terranova (zelfde inhoud)
  await imp(file('oud-2026-11-20a.blokstad', 'oud.terranova'));
  R.terranovaExtensie = (await checkRegion()).aantal === 2;
  // 2. oud bouwbestand
  R.importBouw = await imp(file('oud-2026-11-20a.blokstad-bouw'));
  // 3. het stuk spelen: blokken in de echte wereld en de spelerpositie
  await p.evaluate((id) => [...document.querySelectorAll('#regions .region')].find(c => c.querySelector('.r-title').textContent.startsWith('Oud stuk') && !c.querySelector('.r-title').textContent.includes('(import) (import)'))?.querySelector('[data-a=play]').click(), R.stuk.id);
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.world && g.world.get; }, null, { timeout: 120000 });
  R.spelen = await p.evaluate((E) => { const g = window.blokGame(), w = g.world; return { blokken: Object.fromEntries(Object.entries(E.stuk.blokken).map(([k, [x, y, z, v]]) => [k, w.get(x, y, z) === v])), speler: [g.player.pos.x, g.player.pos.y, g.player.pos.z].map(v => +v.toFixed(1)) }; }, EXP);
  R.spelen.spelerJuist = Math.hypot(R.spelen.speler[0] - EXP.stuk.speler.x, R.spelen.speler[2] - EXP.stuk.speler.z) < 0.6;
  await toMenu();
  // 4. het bouwwerk in de Alpenwereld
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg');
  const B = EXP.bouw.blokken;
  await p.evaluate(([x, z]) => { const g0 = () => window.blokGame && window.blokGame(); const t = setInterval(() => { const g = g0(); if (g && g.tiled) { g.player.pos.set(x + 0.5, g.player.pos.y, z - 3.5); g.updateTiles(true); clearInterval(t); } }, 50); }, [B.x, B.z]);
  await p.waitForFunction(([x, z]) => { const g = window.blokGame && window.blokGame(); const t = g && g.world.tileAt && g.world.tileAt(x, z); return t && t.ready; }, [B.x, B.z], { timeout: 180000 });
  R.alpenBouw = await p.evaluate(([x, y, z]) => { const g = window.blokGame(); return [0, 1, 2, 3, 4].map(k => g.world.get(x, y + k, z)); }, [B.x, B.y, B.z]);
  R.alpenBouwJuist = R.alpenBouw.every(v => v === B.blok);
  // 5. nogmaals importeren terwijl dat bouwwerk al bestaat: de vorige versie moet in een back-upsleutel staan
  await toMenu();
  await imp(file('oud-2026-11-20a.blokstad-bouw', 'nieuw.terranova-bouw'));
  R.vorigeVersieBewaard = await p.evaluate(async () => (await (await import('./js/storage.js')).cacheGetPrefix('backup-edit-')).length);
  // 6. kapot bestand
  R.kapot = await imp({ name: 'kapot.blokstad', mimeType: 'application/octet-stream', buffer: Buffer.from('dit is geen savegame') });
  // 7. volledige back-up via de knop, alles wissen, terugzetten
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-backup')]);
  const bkPath = await dl.path(), bkName = dl.suggestedFilename();
  R.backup = { naam: bkName, bytes: fs.statSync(bkPath).size, melding: await msg() };
  const before = await p.evaluate(async () => { const S = await import('./js/storage.js'); return { stukken: (await S.listRegions()).length, bouw: (await S.cacheGetPrefix('reuzenberg-edit-')).length, instellingen: localStorage.getItem('blokstad-settings') }; });
  await p.evaluate(() => new Promise((res) => { localStorage.clear(); const r = indexedDB.deleteDatabase('blokstad'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await toMenu();
  R.naWissen = await p.evaluate(async () => { const S = await import('./js/storage.js'); return { stukken: (await S.listRegions()).length, instellingen: localStorage.getItem('blokstad-settings') }; });
  R.terugzetten = await imp({ name: bkName, mimeType: 'application/octet-stream', buffer: fs.readFileSync(bkPath) });
  const after = await p.evaluate(async () => { const S = await import('./js/storage.js'); return { stukken: (await S.listRegions()).length, bouw: (await S.cacheGetPrefix('reuzenberg-edit-')).length, instellingen: localStorage.getItem('blokstad-settings') }; });
  R.herstel = { voor: { ...before, instellingen: !!before.instellingen }, na: { ...after, instellingen: !!after.instellingen }, gelijk: before.stukken === after.stukken && before.bouw === after.bouw && before.instellingen === after.instellingen };
  R.stukNaHerstel = await checkRegion();
  console.log('savegame:', JSON.stringify(R));
  const ok = R.stuk.controlegetal && Object.values(R.stuk.blokken).every(Boolean) && R.stuk.speler && R.terranovaExtensie && Object.values(R.spelen.blokken).every(Boolean) && R.spelen.spelerJuist
    && R.alpenBouwJuist && R.vorigeVersieBewaard >= 1 && /geen TERRANOVA-bestand/.test(R.kapot) && R.herstel.gelijk && R.naWissen.stukken === 0 && R.stukNaHerstel.controlegetal;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
