// TERRANOVA 14.1 — prestatietest op het eigen toestel (js/perftest.js): knop in het menu, 5 vaste scènes in
// Megatower City met een vast profiel, resultaat met grafische kaart en cijfers per scène, kopieerbaar; daarna staan
// de eigen instellingen van de speler weer zoals ze waren. (Korte meetduur voor deze test.)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.route(/tile\.openstreetmap|nominatim|elevation|overpass/, r => r.abort());
  await p.goto('http://localhost:8765/');
  const mine = { view: 64, quality: 'fast', hour: 7, cycle: true, lod: 600, eigen: 'blijft' };
  await p.evaluate((m) => { localStorage.setItem('blokstad-settings', JSON.stringify(m)); sessionStorage.setItem('tn-perf-kort', '1'); }, mine);
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-perftest').click());
  await p.waitForFunction(() => !document.getElementById('ov-perf').hidden, null, { timeout: 900000, polling: 1000 });
  const R = await p.evaluate(() => ({ res: window.__perfResult, html: document.getElementById('perf-result').textContent.slice(0, 300), html2: document.getElementById('perf-result').textContent, hash: location.hash, instellingen: JSON.parse(localStorage.getItem('blokstad-settings') || '{}') }));
  const sc = Object.values(R.res.scenes);
  console.log('prestatietest:', JSON.stringify({ toestel: R.res.toestel.gpu, scenes: Object.fromEntries(Object.entries(R.res.scenes).map(([k, v]) => [k, { fps: v.fps, p95: v.p95_ms, tekenopdr: v.tekenopdr, tris_k: v.driehoeken_k }])), hash: R.hash, instellingen: R.instellingen }));
  console.log("ritme:", JSON.stringify(R.res.ritme), "vsync:", JSON.stringify(sc.map(s => s.vsync)));
  const ok = !!R.res.ritme && R.res.ritme.hz > 0 && sc.every(s => s.vsync) && /Ritme van de browser/.test(R.html2 || "") && sc.length === 5 && sc.every(r => r.fps > 0 && r.frames > 0 && r.tekenopdr > 0) && !!R.res.toestel.gpu && R.res.versie && R.hash === ''
    && R.instellingen.view === 64 && R.instellingen.quality === 'fast' && R.instellingen.eigen === 'blijft' && /Grafische kaart/.test(R.html);
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
