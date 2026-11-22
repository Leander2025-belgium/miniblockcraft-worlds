// TERRANOVA 16 — oude gegevens blijven: een carrière, portemonnee en instellingen zoals TERRANOVA 15 ze bewaarde
// worden geladen zonder iets te verliezen; de nieuwe velden (rijbewijzen, statistieken, uitdagingen, profiel) komen
// erbij. Na opslaan staan de oude waarden er nog. De opslagsleutels zijn ongewijzigd.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  const OLD = {
    'blokstad-settings': { view: 112, sens: 1.3, hour: 9, cycle: false, lod: 1200, quality: 'normal', auto: true, profile: 'hoog', shadows: true, look: { shirt: '#aa3311' } },
    'terranova-career': { xp: 470, history: [{ titel: 'Busdienst B8', resultaat: 'klaar', score: 81, sterren: 4, xp: 120, datum: '2026-11-24 08:10' }], tasks: { woning: { date: '2026-11-24', xp: 120 } }, achievements: [{ id: 'level2', name: 'Level 2', date: '2026-11-24' }], v: 1 },
    'blokstad-viridcoin': { balance: 777.5, history: [{ t: 1, n: 500, what: 'startkapitaal' }], cars: ['city'], lastBonus: '2026-11-23' },
    'terranova-build-fav': ['STONE', 'GLASS'],
  };
  await p.evaluate((O) => { for (const [k, v] of Object.entries(O)) localStorage.setItem(k, JSON.stringify(v)); }, OLD);
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.career; }, null, { timeout: 180000 });
  await p.waitForTimeout(1500);
  const R = await p.evaluate(() => {
    const g = window.blokGame(), C = g.career; C.save(); g.wallet.save();
    const st = JSON.parse(localStorage.getItem('blokstad-settings')), cr = JSON.parse(localStorage.getItem('terranova-career')), vc = JSON.parse(localStorage.getItem('blokstad-viridcoin'));
    return {
      instellingen: { view: g.settings.view, lod: g.settings.lod, quality: g.settings.quality, profile: g.settings.profile, shirt: g.settings.look?.shirt, bewaardView: st.view },
      carriere: { xp: C.p.xp, level: C.level, geschiedenis: C.p.history.length, opdrachten: Object.keys(C.p.tasks), prestaties: C.p.achievements.length, nieuw: { rijbewijzen: typeof C.p.licenses, stats: !!C.p.stats, uitdagingen: C.p.daily?.items?.length }, bewaardXp: cr.xp, bewaardGeschiedenis: cr.history.length },
      portemonnee: { saldo: g.wallet.balance, autos: g.wallet.cars, bewaardSaldo: vc.balance, bewaardAutos: vc.cars },
      favorieten: JSON.parse(localStorage.getItem('terranova-build-fav') || '[]'),
      sleutels: Object.keys(localStorage).filter(k => /^(blokstad|terranova)/.test(k)).sort(),
    };
  });
  console.log('compat16:', JSON.stringify(R));
  const ok = R.instellingen.view === 112 && R.instellingen.bewaardView === 112 && R.instellingen.lod === 1200 && R.instellingen.shirt === '#aa3311'
    && R.carriere.xp === 470 && R.carriere.bewaardXp === 470 && R.carriere.geschiedenis === 1 && R.carriere.bewaardGeschiedenis === 1 && R.carriere.opdrachten.includes('woning') && R.carriere.prestaties === 1
    && R.carriere.nieuw.rijbewijzen === 'object' && R.carriere.nieuw.stats && R.carriere.nieuw.uitdagingen === 3
    && R.portemonnee.saldo === 777.5 && R.portemonnee.bewaardSaldo === 777.5 && R.portemonnee.autos.includes('city') && R.portemonnee.bewaardAutos.includes('city')
    && R.favorieten.join() === 'STONE,GLASS';
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
