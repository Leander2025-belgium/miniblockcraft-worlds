// TERRANOVA 15 — crashherstel en veilig opslaan (js/storage.js saveRegion/loadRegionSafe, js/app.js saveTile/provider).
// 1. Regio: twee keer opslaan → de vorige versie blijft bewaard (met controlegetal). Daarna een onvolledige
//    schrijfactie nabootsen (de gegevens half overschrijven): bij het laden wordt dat gezien, komt de vorige versie
//    terug en blijft de beschadigde kopie apart bewaard. Terugzetten van de vorige versie werkt in beide richtingen.
// 2. Bewerkte tegel van Megatower City: blok A bewaren, blok B bewaren, dan de opslag van de tegel afkappen.
//    Na herladen staat de tegel met blok A er (vorige versie), en is de beschadigde opslag apart bewaard.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  const R = {};
  R.regio = await p.evaluate(async () => {
    const S = await import('./js/storage.js'), id = 'test-crash-' + Date.now(), size = 16, H = 16;
    const v1 = new Uint8Array(size * size * H).fill(0); v1[5] = 8; const v2 = v1.slice(); v2[6] = 9;
    await S.saveRegion({ id, name: 'Crashtest', size, H }, v1);
    await S.saveRegion({ id, name: 'Crashtest', size, H }, v2);
    const okEerst = await S.loadRegionSafe(id), vorigeBestaat = await S.hasPrevious(id);
    // onvolledige schrijfactie: de gegevens van de laatste opslag half vervangen door rommel (meta blijft de nieuwe)
    const d = await new Promise((res) => { const q = indexedDB.open('blokstad'); q.onsuccess = () => res(q.result); });
    const rle = await new Promise((res) => { const g = d.transaction('data').objectStore('data').get(id); g.onsuccess = () => res(g.result); });
    const bad = rle.slice(0, Math.floor(rle.length / 2));
    await new Promise((res) => { const t = d.transaction('data', 'readwrite'); t.objectStore('data').put(bad, id); t.oncomplete = res; });
    const L = await S.loadRegionSafe(id);
    const beschadigd = await new Promise((res) => { const g = d.transaction('data').objectStore('data').getKey(id + S.BROKEN); g.onsuccess = () => res(!!g.result); });
    // terugzetten: de huidige (v1, hersteld) ↔ de vorige
    const naHerstel = L.vox ? [L.vox[5], L.vox[6]] : null;
    await S.restorePrevious(id); const L2 = await S.loadRegionSafe(id);
    await S.deleteRegion(id);
    return { eerst: [okEerst.vox[5], okEerst.vox[6]], vorigeBestaat, hersteld: L.hersteld, naHerstel, beschadigdApart: beschadigd, naTerugzetten: L2.vox ? [L2.vox[5], L2.vox[6]] : null };
  });
  // 2. Megatower City: bewerkte tegel
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 12, cycle: false, weather: 'clear', weatherSet: true, view: 64, quality: 'fast', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  const X = 1520, Z = 1530;
  await p.evaluate(([X, Z]) => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(X + 4, g.meta.ground + 10, Z + 4); g.updateTiles(true); }, [X, Z]);
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  R.tegel = await p.evaluate(async ([X, Z]) => {
    const g = window.blokGame(), S = await import('./js/storage.js'), Y = g.meta.ground + 12;
    const t = g.world.tileAt(X, Z), key = `${g.meta.id || 'megatower'}-edit-${t.tx}-${t.tz}`;
    g.builder.begin(); g.builder.set(X, Y, Z, 8); g.builder.commit(); g.saveDirtyTiles(); await new Promise(r => setTimeout(r, 800));
    g.builder.begin(); g.builder.set(X + 1, Y, Z, 9); g.builder.commit(); g.saveDirtyTiles(); await new Promise(r => setTimeout(r, 800));
    const cur = await S.cacheGet(key), prev = await S.cacheGet(key + S.PREV);
    // onvolledige schrijfactie: de opslag van de tegel afkappen
    await S.cachePut(key, { ...cur, rle: cur.rle.slice(0, Math.floor(cur.rle.length * 0.6)) });
    return { key, heeftCrc: cur.crc !== undefined, vorigeBestaat: !!(prev && prev.rle), Y };
  }, [X, Z]);
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  await p.evaluate(([X, Z]) => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(X + 4, g.meta.ground + 10, Z + 4); g.updateTiles(true); }, [X, Z]);
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  R.naHerladen = await p.evaluate(async ([X, Z, Y, key]) => { const g = window.blokGame(), S = await import('./js/storage.js'); const broken = await S.cacheGet(key + '-beschadigd'); const cur = await S.cacheGet(key); await S.cacheDelete(key); await S.cacheDelete(key + S.PREV); await S.cacheDelete(key + '-beschadigd'); return { blokA: g.world.get(X, Y, Z), blokB: g.world.get(X + 1, Y, Z), beschadigdApart: !!broken, huidigeIsGoed: !!(cur && S.fnv(cur.rle) === cur.crc) }; }, [X, Z, R.tegel.Y, R.tegel.key]);
  console.log('crashherstel:', JSON.stringify(R));
  const ok = JSON.stringify(R.regio.eerst) === '[8,9]' && R.regio.vorigeBestaat && R.regio.hersteld && JSON.stringify(R.regio.naHerstel) === '[8,0]' && R.regio.beschadigdApart && JSON.stringify(R.regio.naTerugzetten) === '[8,0]' /* de beschadigde versie is niet te redden: terugzetten geeft de goede */
    && R.tegel.heeftCrc && R.tegel.vorigeBestaat && R.naHerladen.blokA === 8 && R.naHerladen.blokB === 0 && R.naHerladen.beschadigdApart && R.naHerladen.huidigeIsGoed;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
