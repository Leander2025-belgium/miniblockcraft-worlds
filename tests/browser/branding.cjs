// TERRANOVA-rebranding: titel, logo, favicon, manifest, hoofdmenu, oude opslag (blokstad-sleutels), import van oude
// .blokstad-bestanden, laadscherm (echte status), service worker (cache blokstad-v3 blijft), smartphone, geen JS-fouten.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [], R = {};
  // ---- desktop ----
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|openstreetmap|tile\./.test(m.text())) errs.push('CON ' + m.text().slice(0, 160)); });
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/');
  // bestaande opslag van een Blokstad-speler nabootsen
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 7.5, view: 112, cycle: false, weather: 'clear', weatherSet: true })); localStorage.setItem('blokstad-mode', 'fantasy'); });
  await p.reload();
  await p.waitForFunction(() => !document.getElementById('fantasy-panel').hidden || document.querySelector('[data-mode].on'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1000);
  Object.assign(R, await p.evaluate(async () => {
    const logo = document.querySelector('header.top img.tn-logo'), fav = document.querySelector('link[rel="icon"]');
    const mf = await fetch(document.querySelector('link[rel="manifest"]').href).then(r => r.json()).catch(() => null);
    const favOk = await fetch(fav.href).then(r => r.ok).catch(() => false);
    const menuText = document.getElementById('menu').innerText;
    return {
      titel: document.title, h1: document.querySelector('h1')?.textContent, logoGeladen: !!(logo && logo.complete && logo.naturalWidth > 0), favicon: favOk,
      manifest: mf && { naam: mf.name, iconen: mf.icons.length }, versie: document.getElementById('app-version')?.textContent,
      blokstadInMenu: (menuText.match(/Blokstad/g) || []).length, // alleen "(vroeger Blokstad)" en de uitleg over het bestandsformaat
      oudeModusBewaard: document.querySelector('[data-mode="fantasy"]')?.classList.contains('on'),
      instellingen: JSON.parse(localStorage.getItem('blokstad-settings') || '{}').view,
    };
  }));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'terranova-menu.png') });
  // ---- oud .blokstad-bestand exporteren en weer importeren (ook met de extensie .terranova) ----
  R.import = await p.evaluate(async () => {
    const store = await import('./js/storage.js');
    const meta = { id: 'test-oud-stuk', name: 'Oud stuk', size: 16, H: 8, tiles: 1 }, vox = new Uint8Array(16 * 16 * 8).map((_, i) => i % 7 ? 0 : 8);
    const blob = await store.exportFile(meta, vox), out = {};
    for (const name of ['oud.blokstad', 'nieuw.terranova']) { const f = new File([blob], name); try { const r = await store.importFile(f); out[name] = !!r && (r.meta?.name || r.name || true); } catch (e) { out[name] = 'fout: ' + e.message; } }
    try { await store.importFile(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], 'kapot.blokstad')); out.kapot = 'geen fout?'; } catch (e) { out.kapot = e.message; }
    return out;
  });
  // ---- service worker: actief en de oude cachenaam blijft ----
  R.serviceWorker = await p.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'niet beschikbaar'; const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]); await new Promise(r => setTimeout(r, 1500)); return { actief: !!(reg && reg.active), caches: await caches.keys() }; });
  // ---- wereld starten: laadscherm met naam en echte status, daarna weg ----
  await p.evaluate(() => document.getElementById('btn-mega').click());
  let seen = null;
  for (let i = 0; i < 120 && !seen; i++) { await p.waitForTimeout(250); seen = await p.evaluate(() => { const L = document.getElementById('tn-loader'); return L && !L.hidden ? { wereld: document.getElementById('tn-loader-world').textContent, status: document.getElementById('tn-loader-phase').textContent, tip: document.getElementById('tn-loader-tip').textContent } : null; }); }
  if (SHOTS && seen) await p.screenshot({ path: path.join(SHOTS, 'terranova-laden.png') });
  R.laadscherm = seen;
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 240000 }).catch(() => {});
  await p.waitForTimeout(1500);
  R.naLaden = await p.evaluate(() => ({ laadschermWeg: document.getElementById('tn-loader').hidden, wereld: document.getElementById('game-title')?.textContent }));
  await ctx.close();
  // ---- smartphone ----
  const mctx = await b.newContext({ ...devices['iPhone 13'] }), m = await mctx.newPage();
  m.on('pageerror', e => errs.push('MOBIEL ' + e.message));
  await m.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await m.goto('http://localhost:8765/'); await m.waitForTimeout(1500);
  R.mobiel = await m.evaluate(() => { const l = document.querySelector('header.top img.tn-logo').getBoundingClientRect(); return { breedte: innerWidth, scrollbreedte: document.documentElement.scrollWidth, logo: [Math.round(l.width), Math.round(l.height)], logoInBeeld: l.right <= innerWidth + 1 }; });
  if (SHOTS) await m.screenshot({ path: path.join(SHOTS, 'terranova-mobiel.png') });
  await mctx.close();
  console.log('branding:', JSON.stringify(R));
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
})();
