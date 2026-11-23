// TERRANOVA 16 — grafische profielen, adaptieve kwaliteit (js/adaptive.js), vaste FPS-grens, geheugendiagnose
// (js/memdiag.js). Draait in SwiftShader (zonder grafische kaart, ±1–3 FPS): de adaptieve regelaar moet dat merken
// en een trede omlaag gaan (resolutie lager, doel 30 FPS). De vaste grens wordt getest met een lage waarde (0,5 FPS),
// zodat ze ook in deze trage omgeving zichtbaar is.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 14, cycle: false, quality: 'normal', auto: false, view: 96 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.player && g.mega; }, null, { timeout: 180000 });
  for (let i = 0; i < 300; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => window.blokGame().readyHere())) break; }
  const R = {};
  // 1. profiel Adaptief kiezen via het menu
  R.profiel = await p.evaluate(() => {
    const g = window.blokGame(), sel = document.getElementById('set-profile');
    sel.value = 'adaptief'; sel.dispatchEvent(new Event('change'));
    const st = JSON.parse(localStorage.getItem('blokstad-settings'));
    return { opties: [...sel.options].map(o => o.value), auto: g.settings.auto, adaptView: g.settings.adaptView, fpsCap: g.settings.fpsCap, bewaard: st.profile, view: g.settings.view };
  });
  // 2. de regelaar ziet de trage frames en gaat omlaag
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(1000); if (await p.evaluate(() => (window.blokGame().adaptive?.state.level || 0) >= 2)) break; }
  R.regelaar = await p.evaluate(() => { const g = window.blokGame(), A = g.adaptive; return { state: A?.state, log: A?.log.slice(-4), pixelRatio: g.renderer.getPixelRatio(), viewNow: g.viewNow(), schaduwLaag: g.autoLow }; });
  // 3. automatische kwaliteit uit → alles terug op volle kwaliteit
  R.uit = await p.evaluate(() => { const g = window.blokGame(), el = document.getElementById('set-auto'); el.checked = false; el.dispatchEvent(new Event('change')); return { adaptive: !!g.adaptive, viewNow: g.viewNow(), view: g.settings.view, low: g.autoLow }; });
  // 4. vaste grens: tel getekende frames met en zonder grens van 2 FPS (4 s elk)
  R.grens = await p.evaluate(async () => {
    const g = window.blokGame(), orig = g.render.bind(g); let n = 0, ts = [];
    g.render = (...a) => { n++; ts.push(performance.now()); return orig(...a); };
    const count = async (cap) => { g.settings.fpsCap = cap; n = 0; ts = []; await new Promise(r => setTimeout(r, 4000)); const iv = ts.slice(1).map((t, i) => t - ts[i]); return { n, kortste: iv.length ? Math.round(Math.min(...iv)) : null }; };
    const zonder = await count(0), met = await count(0.5);
    g.settings.fpsCap = 0; g.render = orig;
    return { zonder, met };
  });
  // 5. Batterijbesparing zet de grens op 30
  R.batterij = await p.evaluate(() => { const g = window.blokGame(), sel = document.getElementById('set-profile'); sel.value = 'batterij'; sel.dispatchEvent(new Event('change')); return { fpsCap: g.settings.fpsCap, quality: g.settings.quality, shadows: g.settings.shadows, view: g.settings.view }; });
  // 6. geheugendiagnose via de knop
  R.geheugen = await p.evaluate(() => { document.getElementById('btn-memdiag').click(); return null; });
  await p.waitForTimeout(500);
  R.geheugen = await p.evaluate(() => ({ tekst: document.getElementById('diag-text').value.slice(0, 160), r: window.__memReport && { grafisch: window.__memReport.grafisch, wereld: window.__memReport.wereld, verkeer: window.__memReport.verkeer } }));
  console.log('adaptief:', JSON.stringify(R));
  const ok = R.profiel.opties.includes('batterij') && R.profiel.opties.includes('adaptief') && R.profiel.auto === true && R.profiel.adaptView === true && R.profiel.bewaard === 'adaptief'
    && R.regelaar.state && R.regelaar.state.level >= 2 && R.regelaar.state.scale < 1
    && R.uit.adaptive === false && R.uit.viewNow === R.uit.view && !R.uit.low
    && R.grens.met.n < R.grens.zonder.n && R.grens.met.n <= 3 && (R.grens.met.kortste === null || R.grens.met.kortste >= 1950)
    && R.batterij.fpsCap === 30 && R.batterij.shadows === false
    && /geheugendiagnose/.test(R.geheugen.tekst) && R.geheugen.r && R.geheugen.r.grafisch.meshes > 0 && R.geheugen.r.wereld.tegels > 0;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
