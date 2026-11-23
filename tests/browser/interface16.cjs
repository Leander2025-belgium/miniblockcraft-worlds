// TERRANOVA 16 fase 11 — interface en toegankelijkheid: tabbladen in het pauzemenu (klik en pijltjestoetsen, alle
// oude instellingen nog bereikbaar), tekstgrootte, grote knoppen, hoog contrast, minder beweging (geen bliksemflits),
// kleurfilter op het spelbeeld (echt andere pixels), geluiden als tekst, en alles bewaard en al toegepast in het menu.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 12, cycle: false, quality: 'fast', auto: false, view: 64 })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.readyHere(); }, null, { timeout: 240000 });
  await p.evaluate(() => { const g = window.blokGame(); g.touch = true; g.setPaused(true); g.showOverlay('pause'); });
  await p.waitForTimeout(500);
  const R = {};
  const vis = (id) => p.evaluate((id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; }, id);
  R.tabs = { begin: { knoppen: await vis('btn-resume'), mixer: await vis('mix-master') } };
  await p.click('[data-tab="geluid"]');
  R.tabs.geluid = { knoppen: await vis('btn-resume'), mixer: await vis('mix-master') };
  await p.focus('[data-tab="geluid"]'); await p.keyboard.press('ArrowRight');
  R.tabs.pijl = await p.evaluate(() => ({ gekozen: document.querySelector('#pause-tabs [aria-selected="true"]').dataset.tab, focus: document.activeElement.dataset.tab, sens: document.getElementById('set-sens').offsetParent !== null }));
  // elke oude instelling staat nog in precies één tabblad
  R.tabs.alleInstellingen = await p.evaluate(() => [...document.querySelectorAll('#ov-pause [id^="set-"], #ov-pause [id^="look-"], #ov-pause [id^="mix-"]')].filter(e => !e.closest('.tabpane')).map(e => e.id));
  // toegankelijkheid
  await p.click('[data-tab="toegankelijk"]');
  R.a11y = await p.evaluate(async () => {
    const g = window.blokGame(), $ = (id) => document.getElementById(id);
    const sc = $('set-uiscale'); sc.value = 130; sc.dispatchEvent(new Event('input'));
    const fsz = getComputedStyle(document.documentElement).fontSize;
    for (const id of ['set-bigbtn', 'set-contrast', 'set-motion', 'set-captions']) { $(id).checked = true; $(id).dispatchEvent(new Event('change')); }
    const btn = getComputedStyle($('btn-resume')), card = getComputedStyle(document.querySelector('#ov-pause .card'));
    const tr = getComputedStyle(document.querySelector('.tab')).transitionDuration;
    // minder beweging: donder zonder flits
    const n0 = g.sounds ? g.sounds.events.donder : 0; if (!g.sounds) { const S = await import('./js/soundscape.js'); g.sounds = new S.Soundscape(g); }
    document.getElementById('lightning')?.remove(); g.sounds.thunder(0.1);
    const flits = !!document.getElementById('lightning');
    // ondertitels: gong van een metro vlakbij
    const pp = g.player.pos; g.sounds.arrive({ kind: 'metro', atStop: 'Centraal' }, { x: pp.x + 5, y: pp.y, z: pp.z });
    const caps = [...document.querySelectorAll('#captions .cap')].map(e => e.textContent);
    const saved = JSON.parse(localStorage.getItem('blokstad-settings'));
    return { fontSize: fsz, knopHoogte: parseFloat(btn.minHeight), kaartAchtergrond: card.backgroundColor, kaartRand: card.borderTopWidth, overgang: tr, calm: document.body.classList.contains('a11y-calm'), flits, ondertitels: caps,
      bewaard: { uiScale: saved.uiScale, bigButtons: saved.bigButtons, contrast: saved.contrast, reduceMotion: saved.reduceMotion, captions: saved.captions } };
  });
  // kleurfilter: dezelfde frame met en zonder filter vergelijken (pixels van het spelbeeld)
  await p.evaluate(() => { const g = window.blokGame(); g.showOverlay(null); for (const e of document.querySelectorAll('.ov')) e.hidden = true; });
  await p.waitForTimeout(800);
  const clip = { x: 200, y: 150, width: 300, height: 200 };
  // twee beelden zonder filter (verschil door bewegend verkeer = basis), dan één met filter
  const shot0 = await p.screenshot({ clip }); await p.waitForTimeout(400); const shotB = await p.screenshot({ clip });
  await p.evaluate(() => { const cf = document.getElementById('set-colorfilter'); cf.value = 'deutan'; cf.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  const shot1 = await p.screenshot({ clip });
  R.zichtbaarOverlay = await p.evaluate(() => [...document.querySelectorAll('.ov')].filter(e => !e.hidden).map(e => e.id));
  if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOTS, 'zonder-filter.png'), shot0); fs.writeFileSync(path.join(process.env.SHOTS, 'groenzwak-filter.png'), shot1); }
  const cmp = (x, y) => p.evaluate(async ([a, c]) => {
    const load = (b64) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const [A, C] = await Promise.all([load(a), load(c)]), cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height;
    const x = cv.getContext('2d'); x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, cv.width, cv.height).data; x.drawImage(C, 0, 0); const dc = x.getImageData(0, 0, cv.width, cv.height).data;
    let diff = 0; for (let i = 0; i < da.length; i += 4) diff += Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]) + Math.abs(da[i + 2] - dc[i + 2]);
    return +(diff / (da.length / 4)).toFixed(2);
  }, [x.toString('base64'), y.toString('base64')]);
  // controle van de matrix: het beeld met filter moet gelijk zijn aan de deutan-matrix toegepast op het beeld zonder filter
  const predErr = await p.evaluate(async ([a, c]) => {
    const M = (await import('./js/a11y.js')).COLOR_MATRIX.deutan.trim().split(/\s+/).map(Number);
    const load = (b64) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const [A, C] = await Promise.all([load(a), load(c)]), cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height;
    const x = cv.getContext('2d'); x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, cv.width, cv.height).data; x.drawImage(C, 0, 0); const dc = x.getImageData(0, 0, cv.width, cv.height).data;
    const cl = (v) => Math.max(0, Math.min(255, v)); let err = 0, n = 0;
    for (let i = 0; i < da.length; i += 4) { const r = da[i], g = da[i + 1], b = da[i + 2];
      for (let k = 0; k < 3; k++) { err += Math.abs(cl(M[k * 5] * r + M[k * 5 + 1] * g + M[k * 5 + 2] * b) - dc[i + k]); n++; } }
    return +(err / n).toFixed(2);
  }, [shotB.toString('base64'), shot1.toString('base64')]);
  R.filter = { matrixFout: predErr, css: await p.evaluate(() => document.getElementById('game-canvas').style.filter), svg: await p.evaluate(() => !!document.getElementById('cf-deutan')), basis: await cmp(shot0, shotB), gemVerschil: await cmp(shotB, shot1) };
  // na herladen: al toegepast in het menu, vóór er een wereld is
  await p.reload(); await p.waitForTimeout(1500);
  R.menu = await p.evaluate(() => ({ fontSize: document.documentElement.style.fontSize, contrast: document.body.classList.contains('a11y-contrast'), big: document.body.classList.contains('a11y-big'), wereld: !!(window.blokGame && window.blokGame()) }));
  console.log('interface16:', JSON.stringify(R));
  const A = R.a11y, T = R.tabs;
  const ok = T.begin.knoppen && !T.begin.mixer && !T.geluid.knoppen && T.geluid.mixer && T.pijl.gekozen === 'besturing' && T.pijl.focus === 'besturing' && T.pijl.sens && T.alleInstellingen.length === 0
    && A.fontSize === '20.8px' && A.knopHoogte >= 48 && A.kaartAchtergrond === 'rgb(0, 0, 0)' && A.kaartRand === '2px' && /^0s/.test(A.overgang) && A.calm && !A.flits
    && A.ondertitels.some(t => /Donder/.test(t)) && A.ondertitels.some(t => /Gong: metro komt aan in Centraal/.test(t))
    && A.bewaard.uiScale === 130 && A.bewaard.bigButtons && A.bewaard.contrast && A.bewaard.reduceMotion && A.bewaard.captions
    && R.filter.css === 'url("#cf-deutan")' && R.filter.svg && R.filter.gemVerschil > 3 * R.filter.basis && R.filter.matrixFout < 1.5 && R.zichtbaarOverlay.length === 0
    && R.menu.fontSize === '130%' && R.menu.contrast && R.menu.big;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
