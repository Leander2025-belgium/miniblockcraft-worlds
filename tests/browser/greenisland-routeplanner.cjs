// Greenisland wereldkaart: hoogtekaart aan/uit en de routeplanner (auto, fiets, te voet).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/');
  await p.click('[data-mode="fantasy"]');
  await p.evaluate(() => document.getElementById('btn-gi-map').click());
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('gi-height').click()); await p.waitForTimeout(1500);
  const res = {};
  for (const m of ['car', 'bike', 'walk']) {
    await p.fill('#gi-from', 'Munkbay'); await p.fill('#gi-to', 'Westport');
    await p.evaluate((m) => document.querySelector(`[data-rmode="${m}"]`).click(), m); await p.waitForTimeout(400);
    res[m] = await p.evaluate(() => document.getElementById('gi-route-out').textContent.split('Via')[0]);
  }
  await p.fill('#gi-from', 'Silverpine'); await p.fill('#gi-to', 'Black Point');
  await p.evaluate(() => document.querySelector('[data-rmode="bike"]').click()); await p.waitForTimeout(400);
  res.berg = await p.evaluate(() => document.getElementById('gi-route-out').textContent.split('Via')[0]);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  console.log('route:', JSON.stringify(res, null, 1));
  console.log('fouten:', errs.length ? errs.join(' | ') : 'geen');
  await b.close();
})();
