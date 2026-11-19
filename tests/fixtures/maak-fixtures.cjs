// Maakt de vaste oude opslagbestanden voor tests/browser/savegame.cjs, met de opslagcode van release 2026-11-20a
// (js/storage.js uit commit 68765ba, via git show, zodat het echt het oude formaat is):
// - oud-2026-11-20a.blokstad: een klein opgeslagen stuk (64 × 64, bakstenen huis met ramen en een lamp);
// - oud-2026-11-20a.blokstad-bouw: bouwwerk in de Alpenwereld (5 bakstenen naast het startpunt);
// - oud-2026-11-20a.json: wat er in de bestanden hoort te zitten (controlegetallen, blokposities).
// Eenmalig gemaakt en mee in git gezet; alleen opnieuw maken als het oude formaat gecontroleerd moet worden.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '../..'), REF = process.env.REF || '68765ba';
const THREE_PATH = path.join(ROOT, 'node_modules/three/build/three.module.js');
const OLD_STORAGE = execSync(`git show ${REF}:js/storage.js`, { cwd: ROOT }).toString();
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route('**/js/storage.js', r => r.fulfill({ body: OLD_STORAGE, contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ view: 96, lod: 1000, hour: 15, quality: 'normal' })));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  // 1. klein stuk
  const region = await p.evaluate(async () => {
    const S = await import('./js/storage.js'), size = 64, H = 40, G = 10, vox = new Uint8Array(size * size * H);
    const set = (x, y, z, v) => { vox[(z * size + x) * H + y] = v; };
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) { for (let y = 0; y < G - 1; y++) set(x, y, z, 1); set(x, G - 1, z, 2); set(x, G, z, 3); }
    for (let y = G + 1; y <= G + 6; y++) for (let z = 20; z <= 27; z++) for (let x = 20; x <= 27; x++) if (x === 20 || x === 27 || z === 20 || z === 27) set(x, y, z, (y === G + 3 || y === G + 4) && (x === 23 || z === 23) ? 10 : 8);
    for (let z = 20; z <= 27; z++) for (let x = 20; x <= 27; x++) set(x, G + 7, z, 9);
    set(24, G + 6, 24, 21); set(23, G + 1, 20, 0); set(23, G + 2, 20, 0); // lamp, deuropening
    let sum = 0; for (let i = 0; i < vox.length; i++) sum = (sum * 31 + vox[i]) >>> 0;
    const meta = { id: 'rfixture1', name: 'Oud stuk (2026-11-20a)', x0: 0, z0: 0, size, H, ground: G, created: 1763600000000, type: 'Fantasie', wijk: 'Test', player: { x: 23.5, y: G + 1, z: 14.5, yaw: Math.PI, pitch: 0, fly: false } };
    const blob = await S.exportFile(meta, vox);
    return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), sum, blocks: { lamp: [24, G + 6, 24, 21], muur: [20, G + 1, 21, 8], raam: [27, G + 3, 23, 10], dak: [24, G + 7, 24, 9], deur: [23, G + 1, 20, 0] }, meta };
  });
  // 2. bouwwerk in de Alpen (zoals tests/browser/opslaan-herladen.cjs)
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-berg');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z) && g.world.tileAt(g.player.pos.x, g.player.pos.z).ready; }, null, { timeout: 180000 });
  const placed = await p.evaluate(() => {
    const g = window.blokGame(); g.touch = true; g.paused = false; g.showOverlay(null);
    const q = g.player.pos, x = Math.floor(q.x) + 2, z = Math.floor(q.z) + 2;
    let y = Math.floor(q.y) + 6; while (y > 0 && !g.world.solidAt(x, y - 1, z)) y--;
    for (let k = 0; k < 5; k++) { g.target = { x, y: y - 1 + k, z, b: 1, n: [0, 1, 0] }; g.slot = 1; g.act('place'); }
    return { x, y, z, blok: g.world.get(x, y, z), map: g.meta.map ? g.meta.map.id : g.meta.id };
  });
  await p.waitForTimeout(8000);
  const builds = await p.evaluate(async () => {
    const S = await import('./js/storage.js'), { META } = await import('./js/alpen-meta.js');
    const r = await S.exportBuilds(await S.getRegionMeta(META.id));
    return { bytes: Array.from(new Uint8Array(await r.blob.arrayBuffer())), count: r.count, id: META.id };
  });
  const D = __dirname;
  fs.writeFileSync(path.join(D, 'oud-2026-11-20a.blokstad'), Buffer.from(region.bytes));
  fs.writeFileSync(path.join(D, 'oud-2026-11-20a.blokstad-bouw'), Buffer.from(builds.bytes));
  fs.writeFileSync(path.join(D, 'oud-2026-11-20a.json'), JSON.stringify({ gemaaktMet: REF, stuk: { id: region.meta.id, naam: region.meta.name, controlegetal: region.sum, blokken: region.blocks, speler: region.meta.player }, bouw: { wereld: builds.id, tegels: builds.count, blokken: placed } }, null, 1));
  console.log('klaar', region.bytes.length, 'bytes stuk,', builds.bytes.length, 'bytes bouw,', builds.count, 'tegels', JSON.stringify(placed));
  await b.close();
})();
