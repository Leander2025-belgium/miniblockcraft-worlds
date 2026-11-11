// Greenisland ViridCoin en Zenvo: saldo, in de showroom een Zenvo kopen, hem oproepen en ermee rijden; testterrein.
const { chromium } = require('playwright');
const THREE_PATH = process.env.THREE_PATH || require('path').join(__dirname, '../../node_modules/three/build/three.module.js');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ view: 64, lod: 600, hour: 12, quality: 'normal' })); localStorage.removeItem('blokstad-viridcoin'); });
  await p.click('[data-mode="fantasy"]'); await p.click('#btn-gi-play');
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.tiled && g.world.tileAt(g.player.pos.x, g.player.pos.z); }, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.paused = false; });
  await p.waitForFunction(() => !!window.blokGame().wallet, null, { timeout: 30000 });
  const start = await p.evaluate(() => window.blokGame().wallet.balance);
  // naar de showroom (binnen)
  await p.evaluate(async () => { const g = window.blokGame(), A = await import('./js/greenisland.js'); g.player.fly = true; const b = A.BLD.find(q => q.name === 'Zenvo Showroom'), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; g.player.pos.set(cx, A.heightAt(cx, cz) + 2, cz); g.tiled.aheadKey = null; g.updateTiles(true); });
  await p.waitForTimeout(15000);
  await p.evaluate(() => window.blokGame().showWallet()); await p.waitForTimeout(800);
  const knoppen = await p.evaluate(() => document.querySelectorAll('#vc-body [data-buy]').length);
  await p.evaluate(() => document.querySelector('#vc-body [data-buy="city"]').click()); await p.waitForTimeout(500);
  const na = await p.evaluate(() => ({ saldo: window.blokGame().wallet.balance, autos: window.blokGame().wallet.cars }));
  await p.evaluate(() => document.querySelector('#vc-body [data-call="city"]').click()); await p.waitForTimeout(3000);
  const rit = await p.evaluate(() => { const g = window.blokGame(); return { rijden: !!g.drive, zenvo: g.drive && g.drive.a && g.drive.a.zenvo }; });
  // testterrein: testauto's op de baan
  await p.evaluate(() => { const g = window.blokGame(); if (g.drive) g.leaveVehicle(); g.player.fly = true; g.player.pos.set(115000, 140, 22400); g.tiled.aheadKey = null; g.updateTiles(true); });
  await p.waitForTimeout(25000);
  const baan = await p.evaluate(() => { const g = window.blokGame(), q = g.player.pos; return { plek: g.ui.place.textContent.split(' · ')[0], autos: g.traffic.agents.filter(a => { if (a.kind !== 'car') return false; const e = a.route[0].e, i = Math.min(e.pts.length - 3, Math.floor(e.pts.length / 6) * 3), x = e.pts[i], z = e.pts[i + 2]; return Math.abs(x - 115000) < 450 && Math.abs(z - 22500) < 180; }).length }; });
  console.log('zenvo:', JSON.stringify({ start, knoppen, na, rit, baan }));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
