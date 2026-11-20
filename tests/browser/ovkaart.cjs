// TERRANOVA 14.1 — live OV-kaart en multimodale reisplanner in Megatower City.
// Controles: de kaart opent vanuit het pauzemenu, toont lijnen, echte voertuigen (rond de speler) en voertuigen volgens
// de dienstregeling; klikken op een echt voertuig geeft lijn, rit en bezetting (gelijk aan de ritlaag); klikken op een
// halte geeft vertrekken; de kaart verandert vanzelf (live); de planner vindt een reis met tram en een overstap.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const THREE_PATH = process.env.THREE_PATH || path.join(__dirname, '../../node_modules/three/build/three.module.js');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync(THREE_PATH), contentType: 'application/javascript' }));
  await p.goto('http://localhost:8765/#debug');
  await p.evaluate(() => localStorage.setItem('blokstad-settings', JSON.stringify({ hour: 8, cycle: false, weather: 'clear', weatherSet: true, view: 96, lod: 600, quality: 'fast', auto: false })));
  await p.reload();
  await p.evaluate(() => document.getElementById('btn-mega').click());
  await p.waitForFunction(() => { const g = window.blokGame && window.blokGame(); return g && g.running && g.mega && g.traffic; }, null, { timeout: 180000 });
  // bij Metro Oude Markt: daar rijden metro's, trams en bussen
  await p.evaluate(() => { const g = window.blokGame(); g.player.fly = true; g.player.pos.set(4160, g.meta.ground + 30, 5120); g.updateTiles(true); });
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => { const g = window.blokGame(); return g.readyHere() && g.tiled.inFlight === 0 && g.queue.length < 30 && g.traffic.agents.some(a => !a.dead && ['metro', 'tram', 'bus'].includes(a.kind) && a.trip); })) break; }
  const R = {};
  await p.evaluate(() => window.blokGame().setPaused(true));
  R.knop = await p.evaluate(() => !document.getElementById('btn-ovmap').hidden);
  await p.click('#btn-ovmap');
  await p.waitForFunction(() => !document.getElementById('ov-ovmap').hidden && document.getElementById('ovmap-count').textContent.length > 0, null, { timeout: 30000 });
  R.teller = await p.textContent('#ovmap-count');
  const items = async () => p.evaluate(() => { const c = document.getElementById('ovmap'); return c._S.items.filter(i => i.type === 'veh').map(i => ({ real: i.real, x: i.x, z: i.z, line: i.line, trip: i.trip && i.trip.id })); });
  const v0 = await items();
  R.echt = v0.filter(v => v.real).length; R.dienstregeling = v0.filter(v => !v.real).length;
  // klik op een echt OV-voertuig met een rit
  const clickAt = async (x, z) => { const bb = await p.locator('#ovmap').boundingBox(); await p.mouse.click(bb.x + x / 10240 * bb.width, bb.y + z / 10240 * bb.height); };
  const target = v0.find(v => v.real && v.trip);
  if (target) {
    await clickAt(target.x, target.z);
    R.voertuigInfo = (await p.textContent('#ovmap-info')).trim();
    R.ritKlopt = await p.evaluate((id) => { const g = window.blokGame(), T = g.traffic.trips.trips.get(id); const txt = document.getElementById('ovmap-info').textContent; return !!T && txt.includes(id) && txt.includes(`${T.occ}/${T.cap}`); }, target.trip);
  }
  // klik op een halte: Metro Megatower
  await clickAt(40 * 128 + 64, 40 * 128);
  R.halteInfo = (await p.textContent('#ovmap-info')).trim().slice(0, 200);
  // live: na 3 s zijn de voertuigen verschoven
  await p.waitForTimeout(3000);
  const v1 = await items();
  const moved = v1.filter(v => !v0.some(w => Math.abs(w.x - v.x) < 0.5 && Math.abs(w.z - v.z) < 0.5)).length;
  R.verschoven = moved;
  await p.screenshot({ path: process.env.SHOT || '/tmp/ovkaart.png' });
  // planner: van de tramlaan in het noorden naar het zuidoosten (tram + overstap)
  R.plan = await p.evaluate(async () => { const m = await import('./js/megaplan.js'); const r = m.plan({ x: 3840, z: 900, name: 'A' }, { x: 6656, z: 7168, name: 'B' }, 8); return { modi: r.modi, overstappen: r.overstappen, legs: r.legs.map(l => l.mode === 'wandelen' ? 'lopen ' + l.m : l.line + ' ' + l.from.name + '>' + l.to.name), html: m.planHtml(r).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) }; });
  // buslijnen (14.2): elke bus heeft een lijn, blijft op zijn laan en stopt aan haltes in beide richtingen
  R.bus = await p.evaluate(async () => {
    const g = window.blokGame(), tr = g.traffic, mc = await import('./js/megacity.js');
    const axis = (line) => { const n = +line.slice(1); return n <= mc.BUS_NS.length ? { ax: 'x', v: mc.BUS_NS[n - 1] * 128 } : { ax: 'z', v: mc.BUS_EW[n - mc.BUS_NS.length - 1] * 128 }; };
    let maxOff = 0, n = 0, zonder = 0; const dirs = new Map();
    for (let i = 0; i < 900; i++) {
      tr.update(0.1, g.player.pos, 1, 8);
      if (i % 10) continue;
      for (const a of tr.agents) {
        if (a.dead || a.kind !== 'bus') continue;
        if (!a.line || a.line[0] !== 'B') { zonder++; continue; }
        const h = tr.behind(a, 0, {}), A = axis(a.line), off = Math.abs((A.ax === 'x' ? h.x : h.z) - A.v);
        if (a.route[0].e.conn) continue; // op het kruispunt
        maxOff = Math.max(maxOff, off); n++;
      }
    }
    for (const q of tr.served?.values() || []) if (q.kind === 'bus') { const k = q.name; dirs.set(k, (dirs.get(k) || 0) + 1); }
    return { metingen: n, zonderLijn: zonder, grootsteAfstandTotLaan: +maxOff.toFixed(1), bedieendeHaltes: [...(tr.served?.values() || [])].filter(q => q.kind === 'bus').length, lijnen: [...new Set(tr.agents.filter(a => a.kind === 'bus' && !a.dead).map(a => a.line))] };
  });
  R.busPlan = await p.evaluate(async () => { const m = await import('./js/megaplan.js'); const r = m.plan({ x: 2 * 128 + 300, z: 1000, name: 'A' }, { x: 2 * 128 + 300, z: 8000, name: 'B' }, 8); return { modi: r.modi, legs: r.legs.map(l => l.mode === 'wandelen' ? 'lopen ' + l.m : l.line + ' (' + l.stops + ')') }; });
  // planner in het spel (knop), met tram in de uitleg
  await p.click('#ovmap-close');
  await p.evaluate(() => window.blokGame().setPaused(true));
  await p.evaluate(() => document.getElementById('btn-megaplan').click());
  await p.waitForFunction(() => document.getElementById('mp-result').textContent.includes('Aankomst'), null, { timeout: 30000 });
  R.plannerUI = (await p.textContent('#mp-result')).replace(/\s+/g, ' ').slice(0, 200);
  console.log('ovkaart:', JSON.stringify(R));
  const ok = R.knop && R.echt > 0 && R.dienstregeling > 20 && R.ritKlopt && /bezetting \d+\/\d+/.test(R.voertuigInfo) && /Metro Megatower/.test(R.halteInfo) && /\d\d:\d\d/.test(R.halteInfo) && R.verschoven > 0
    && R.bus.metingen > 20 && R.bus.zonderLijn === 0 && R.bus.grootsteAfstandTotLaan <= 13 && R.bus.bedieendeHaltes >= 2 && R.busPlan.modi.includes('bus') && R.plan.modi.includes('tram') && R.plan.overstappen >= 1 && /tram om de/.test(R.plannerUI);
  console.log('alles goed:', ok);
  console.log('fouten:', errs.length ? errs.slice(0, 5).join(' | ') : 'geen');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
