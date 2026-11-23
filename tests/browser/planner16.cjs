// TERRANOVA 16 — reisplanner: voorkeur kiezen, andere verbindingen tonen en er één kiezen; samen spelen-scherm
// heeft zijn eigen knoppen (geen dubbele id's met de reisplanner).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 8, cycle: false, quality: 'fast', auto: false, view: 64 })));
  await p.reload();
  const R = {};
  R.dubbeleIds = await p.evaluate(() => { const c = {}; for (const e of document.querySelectorAll('[id]')) c[e.id] = (c[e.id] || 0) + 1; return Object.entries(c).filter(([, n]) => n > 1).map(([k]) => k); });
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega; }, null, { timeout: 180000 });
  await p.evaluate(() => document.getElementById('btn-megaplan').click());
  await p.waitForFunction(() => document.getElementById('mp-pref').options.length > 0, null, { timeout: 30000 });
  R.ui = await p.evaluate(async () => {
    const g = window.blokGame(), from = document.getElementById('mp-from'), to = document.getElementById('mp-to'), pf = document.getElementById('mp-pref');
    // een reis zoeken waarbij de voorkeuren verschillende routes geven
    pf.value = 'snelste';
    outer: for (let i = 1; i < from.options.length; i++) for (let j = to.options.length - 1; j >= 0; j--) {
      from.value = from.options[i].value; to.value = to.options[j].value; if (from.value === to.value) continue;
      from.dispatchEvent(new Event('change'));
      if (document.querySelectorAll('#mp-alts [data-alt]').length) break outer;
    }
    const res = {};
    for (const k of ['snelste', 'overstappen', 'wandelen', 'toegankelijk']) { pf.value = k; pf.dispatchEvent(new Event('change')); res[k] = { pref: g.mega.lastPlan.voorkeur, ov: g.mega.lastPlan.overstappen, m: g.mega.lastPlan.wandelen }; }
    const altBtn = document.querySelector('#mp-alts [data-alt]'), before = g.mega.lastPlan;
    if (altBtn) altBtn.click();
    return { res, alts: document.querySelectorAll('#mp-alts [data-alt]').length, altTekst: document.getElementById('mp-alts').textContent.slice(0, 200), gekozen: g.mega.lastPlan !== before };
  });
  console.log('planner16:', JSON.stringify(R));
  const u = R.ui, ok = R.dubbeleIds.length === 0 && u.res.snelste.pref === 'snelste' && u.res.toegankelijk.pref === 'toegankelijk' && u.res.overstappen.ov <= u.res.snelste.ov && u.res.wandelen.m <= u.res.snelste.m + 1
    && u.alts > 0 && u.gekozen;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
