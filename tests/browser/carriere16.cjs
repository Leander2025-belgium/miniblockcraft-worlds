// TERRANOVA 16 fase 7 (rest) — winkel en nieuwe carrière: hoofddeksels kopen met ViridCoin (te weinig geld en zonder
// brevet geweigerd, gekocht = blijft, de avatar draagt het), taxidienst (examen → taxivergunning, straf voor rood licht
// en een STS-melding van de treinbeveiliging tellen mee), bouwopdrachten 'weg' en 'spoorlijn' met de wereldbouwer.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => { localStorage.setItem('blokstad-settings', JSON.stringify({ weather: 'clear', weatherSet: true, hour: 11, cycle: false, quality: 'fast', auto: false, view: 64 })); localStorage.setItem('blokstad-viridcoin', JSON.stringify({ balance: 500, history: [], cars: [], lastBonus: new Date().toISOString().slice(0, 10) })); localStorage.removeItem('terranova-shop'); localStorage.removeItem('terranova-career'); });
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-flat').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.career && g.meta.id === 'bouwwereld' && g.readyHere(); }, null, { timeout: 240000 });
  const R = {};
  // winkel via het carrièrescherm
  R.winkel = await p.evaluate(async () => {
    const g = window.blokGame(), C = g.career, out = {};
    g.setPaused(true); document.getElementById('btn-career').click();
    const click = (k) => { const el = document.querySelector(`#career-body [data-cr="${k}"]`); if (!el) return false; el.click(); return true; };
    out.knoppen = ['buy:helm', 'buy:ovpet', 'buy:tophoed'].every(k => !!document.querySelector(`#career-body [data-cr="${k}"]`));
    out.saldo0 = g.wallet.balance;
    click('buy:helm'); out.helm = { gekocht: C.shop.owns('helm'), saldo: g.wallet.balance, gedragen: g.settings.look.hat, zichtbaar: g.avatar.helm.visible };
    click('buy:ovpet'); out.ovpetZonderBrevet = C.shop.owns('ovpet');
    click('buy:tophoed'); out.hoedTeDuur = C.shop.owns('tophoed'); out.saldoNaWeigeringen = g.wallet.balance;
    out.bewaard = JSON.parse(localStorage.getItem('terranova-shop')).owned;
    // hoed-keuze in de instellingen: alleen gekochte zijn te kiezen
    g.applySettings?.(); const sel = document.getElementById('look-hat'); out.keuze = Object.fromEntries([...sel.options].map(o => [o.value, !o.disabled]));
    return out;
  });
  // taxidienst (spellus stil; voertuig nagebootst: de dienstlogica is wat getest wordt)
  R.taxi = await p.evaluate(() => {
    const g = window.blokGame(), C = g.career; g.running = false; cancelAnimationFrame(g.raf);
    const car = { speed: 0 }; g.drive = { car, mode: 'drive', bus: false, reds: 0 };
    const a = C.available(), s = C.startShift(); if (!s) return { error: 'geen dienst', a };
    const dest = s.dest, pos = g.player.pos, out = { beschikbaar: a.kind, label: a.label, afstand: Math.round(dest.d) };
    // rijden naar de bestemming in 60 stappen, één keer door rood, één STS-melding
    const from = { x: pos.x, z: pos.z };
    for (let i = 1; i <= 60; i++) { const t = i / 60; pos.x = from.x + (dest.x - from.x) * t; pos.z = from.z + (dest.z - from.z) * t; car.speed = i < 60 ? 12 : 0; if (i === 20) g.drive.reds = 1; if (i === 30) C.safetyEvent('sts'); const st = s.update(1); if (st) { out.status = st; break; } }
    out.straf = s.pen.map(q => q.wat); out.score = s.score();
    const rec = C.endShift(out.status || 'afgebroken'); out.rec = { resultaat: rec.resultaat, score: rec.score, examen: rec.examen, rijbewijs: rec.rijbewijs };
    out.vergunning = !!C.p.licenses.taxi;
    // tweede rit zonder fouten: loon
    const s2 = C.startShift(); const d2 = s2.dest; pos.x = d2.x; pos.z = d2.z; car.speed = 0; out.tweede = s2.update(1); const rec2 = C.endShift(out.tweede); out.tweedeRec = { score: rec2.score, examen: rec2.examen, rijbewijs: rec2.rijbewijs }; out.vergunningNa2 = !!C.p.licenses.taxi;
    // derde rit: met vergunning → loon
    const s3 = C.startShift(); pos.x = s3.dest.x; pos.z = s3.dest.z; car.speed = 0; const rec3 = C.endShift(s3.update(1)); out.loon = rec3.loon;
    g.drive = null;
    return out;
  });
  // OV-pet na een brevet (de taxivergunning telt niet; een busrijbewijs wel)
  R.ovpet = await p.evaluate(() => { const g = window.blokGame(), C = g.career; const r1 = C.buyItem('ovpet'); C.p.licenses.bus = { date: '2026-11-22', score: 80 }; g.wallet.add(300, 'test'); const r2 = C.buyItem('ovpet'); return { zonderBusbrevet: r1, metBusbrevet: r2, gedragen: g.settings.look.hat, zichtbaar: g.avatar.ovpet.visible, helmWeg: !g.avatar.helm.visible }; });
  // bouwopdrachten met de wereldbouwer
  R.opdrachten = await p.evaluate(async () => {
    const g = window.blokGame(), C = g.career, Bd = g.builder, G = g.meta.ground, X = 2048 - 30, Z = 2048 - 20; // geladen stuk bij de start
    g.player.pos.set(2048, G + 2, 2048);
    C.p.xp = 900; Bd.toggle(true);
    const voorWeg = C.check('weg');
    Bd.a = [X, G, Z]; Bd.b = [X + 60, G, Z]; Bd.world('road'); while (Bd.job) { Bd.update(); await new Promise(r => setTimeout(r, 10)); }
    Bd.a = [X, G, Z + 40]; Bd.b = [X + 80, G, Z + 40]; Bd.world('rail'); while (Bd.job) { Bd.update(); await new Promise(r => setTimeout(r, 10)); }
    g.player.pos.set(X + 30, G + 2, Z + 20);
    const w = C.check('weg'), s = C.check('spoorlijn');
    return { voorWeg: voorWeg.ok, voorWegWaarom: voorWeg.waarom, weg: w.ok, wegWaarom: w.waarom, spoor: s.ok, spoorWaarom: s.waarom, betaald: C.p.tasks.weg && C.p.tasks.weg.vc, betaaldSpoor: C.p.tasks.spoorlijn && C.p.tasks.spoorlijn.vc };
  });
  console.log('carriere16:', JSON.stringify(R));
  const W = R.winkel, T = R.taxi, O = R.ovpet, Q = R.opdrachten;
  const ok = W.knoppen && W.helm.gekocht && W.helm.saldo === W.saldo0 - 150 && W.helm.gedragen === 'helm' && W.helm.zichtbaar && !W.ovpetZonderBrevet && !W.hoedTeDuur && W.saldoNaWeigeringen === W.helm.saldo && W.bewaard.join() === 'helm'
    && W.keuze.helm === true && W.keuze.tophoed === false && W.keuze.cap === true
    && T.beschikbaar === 'taxi' && T.status === 'klaar' && T.straf.some(s => /rode licht/.test(s)) && T.straf.some(s => /STS/.test(s)) && T.rec.examen && T.score < 60 && !T.vergunning && T.tweedeRec.rijbewijs === 'Taxivergunning' && T.vergunningNa2 && T.loon > 0
    && O.zonderBusbrevet === 'brevet' && O.metBusbrevet === 'ok' && O.gedragen === 'ovpet' && O.zichtbaar && O.helmWeg
    && !Q.voorWeg && Q.weg && Q.spoor && Q.betaald === 140 && Q.betaaldSpoor === 200;
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
