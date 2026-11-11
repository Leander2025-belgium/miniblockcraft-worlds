// Controle van Greenisland (zoals de tegels in het spel gebouwd worden):
// 1. spoor: ballast onder de rails, 5 m vrij erboven, geen te steile stukken of sprongen, perrons op de juiste hoogte
// 2. gebouwen: geen lucht tussen grond en vloer (zwevend), in tegels uit Munkbay, steden, dorpen en de bergen
// 3. nationale wegen: geen treden van meer dan 1 blok tussen opeenvolgende wegkolommen (vloeiende wegen)
// 4. naden: de rand van een tegel past op de buurtegel
// node tools/check-green.mjs
import { B } from '../js/blocks.js';
const A = await import('../js/greenisland.js');
const { LINES, trackOffset, ROADS } = A;
const T = 128, fails = [], out = { rail: 0, railN: 0, clear: 0, grade: 0, plat: 0, bld: 0, bldCols: 0, road: 0, roadN: 0, seam: 0, seamN: 0 };
const BED = new Set([B.BALLAST, B.CONCRETE, B.ASPHALT, B.GRAVEL, B.STONE, B.METAL, B.LINE_WHITE]); // (overweg: rails in het asfalt)
const cache = new Map(), col = (x, z) => A._columnAt(Math.floor(x), Math.floor(z), cache);
// trams: beide sporen liggen in de straat (rails of bedding) en de ruimte erboven is vrij
out.tramN = 0; out.tram = 0;
const TRAMBED = new Set([B.METAL, B.COBBLE, B.ASPHALT, B.LINE_WHITE, B.SIDEWALK, B.BIKE_PATH, B.GRASS]);
for (const L of LINES) if (L.tram) for (let s = 10; s < L.len - 10; s += 20) for (const side of [1, -1]) {
  const p = L.at(s), x = p.x - p.tz * 2.5 * side, z = p.z + p.tx * 2.5 * side, { col: c } = col(x, z), by = Math.round(p.y);
  if (LINES.some(L2 => L2.tram && L2 !== L && L2.near(x, z, 6))) continue; // kruising van twee tramlijnen: hoogte mag 1 blok verschillen
  out.tramN++;
  let bad = !TRAMBED.has(c[by]) ? `blok ${c[by]} op het spoor` : '';
  for (let y = by + 1; y <= by + 5 && !bad; y++) if (c[y] && c[y] !== B.LAMP) bad = `blok ${c[y]} boven het spoor`;
  if (bad) { out.tram++; if (fails.length < 40) fails.push(`${L.id} bij s=${Math.round(s)} (${Math.round(x)},${Math.round(z)}): ${bad}`); }
}
// kruisingen weg × spoor: overweg = wegdek op spoorhoogte en vrij; brug = wegdek hoog genoeg boven het spoor; onder = wegdek onder het viaduct, vrije doorrit
out.xN = 0; out.xBad = 0; const xt = {};
for (const R of A.ROADS) for (const c of R.xings) {
  if (c.type === 'tunnel') continue;
  out.xN++; xt[c.type] = (xt[c.type] || 0) + 1;
  const k = R.s.findIndex(v => v >= c.s), x = R.x[k], z = R.z[k], { col: cc } = col(x, z), ry = Math.round(R.y[k]) - 1, rail = Math.round(c.railY);
  let bad = '';
  if (c.type === 'overweg') { if (Math.abs(ry - rail) > 1) bad = `wegdek ${ry} ≠ spoor ${rail}`; else for (let y = ry + 1; y <= ry + 5; y++) if (cc[y] && cc[y] !== B.LAMP) { bad = `niet vrij (blok ${cc[y]} op ${y})`; break; } }
  else if (c.type === 'brug') { if (ry - rail < 9) bad = `brug te laag (${ry - rail} m boven het spoor)`; else if (![B.ASPHALT, B.LINE_WHITE, B.METAL, B.CONCRETE].includes(cc[ry])) bad = `geen brugdek (blok ${cc[ry]})`; }
  else if (c.type === 'onder') { if (rail - ry < 8) bad = `te weinig doorrijhoogte (${rail - ry} m)`; else for (let y = ry + 1; y <= ry + 5; y++) if (cc[y] && cc[y] !== B.LAMP) { bad = `onderdoorgang dicht (blok ${cc[y]} op ${y})`; break; } }
  if (bad) { out.xBad++; if (fails.length < 40) fails.push(`kruising ${c.type} ${R.a}–${R.b} × ${c.L.id} bij (${Math.round(x)},${Math.round(z)}): ${bad}`); }
}
// straten × spoor in Munkbay en enkele steden: elk ontwerp correct gebouwd
out.sxN = 0; out.sxBad = 0; const sxt = {};
for (const pn of ['Munkbay', 'Riverside', 'Westport', 'Viridonia']) {
  const p = A.PLACE[pn], g = A._gridFor(p);
  for (const isX of [true, false]) for (let k = -Math.ceil(p.r / g.B); k <= Math.ceil(p.r / g.B); k++) {
    const fixed = (isX ? g.ox : g.oz) + k * g.B; let last = null;
    for (let a = (isX ? p.z : p.x) - p.r; a <= (isX ? p.z : p.x) + p.r; a += 3) {
      const u = A._urbanAt(isX ? fixed + 3 : a, isX ? a : fixed + 3); if (!u || u.p !== p || u.dens <= 0.12) continue;
      const st0 = A._streetAt(isX ? fixed + 3 : a, isX ? a : fixed + 3, u); if (!st0.street) continue;
      const cx = isX ? fixed + st0.hw / 2 : a, cz = isX ? a : fixed + st0.hw / 2, st = A._streetAt(cx, cz, u); if (!st.street) continue;
      const r = A._streetRail(cx, cz, st, u); if (!r || r.a > 1.6) continue;
      const key = r.L.id + ':' + Math.round(r.s); if (key === last) continue; last = key;
      out.sxN++; sxt[r.type] = (sxt[r.type] || 0) + 1;
      const { col: cc } = col(cx, cz); let bad = '';
      const free = (y0, n) => { for (let y = y0; y < y0 + n; y++) if (cc[y] && cc[y] !== B.LAMP) return y; return 0; };
      if (r.type === 'overweg') { const y0 = Math.round(r.ry + A.G + 1), y = [y0, y0 - 1, y0 + 1].find(v => [B.METAL, B.ASPHALT, B.LINE_WHITE].includes(cc[v])) ?? y0; if (![B.METAL, B.ASPHALT, B.LINE_WHITE].includes(cc[y]) || free(y + 1, 5)) bad = `overweg niet vrij (blok ${cc[y]})`; }
      else if (r.type === 'brug') { const y = r.deckY; if (![B.ASPHALT, B.LINE_WHITE].includes(cc[y]) || free(y + 1, 4)) bad = `geen vrij brugdek op ${y} (blok ${cc[y]})`; }
      else if (r.type === 'onder') { let y = Math.round(A.G + r.sy); while (y > 1 && !cc[y]) y--; if (free(y + 1, 6)) bad = `onderdoorgang dicht boven ${y}`; }
      if (bad) { out.sxBad++; if (fails.length < 40) fails.push(`${pn}: straat × ${r.L.id} (${r.type}) bij (${Math.round(cx)},${Math.round(cz)}): ${bad}`); }
    }
  }
}
// Munkbay Central: van perron 5 (S1) de trap af, door de reizigerstunnel onder alle sporen, aan de zuidkant de trap op naar het plein
{
  const L = LINES.find(l => l.id === 'S1'), st = L.stations.find(q => q.central), mid = (st.s0 + st.s1) / 2, at = (ds, off) => { const p = L.at(mid + ds); return [p.x - p.tz * off, p.z + p.tx * off]; };
  const route = []; for (let ds = 14; ds >= 0; ds -= 0.5) route.push(at(ds, 2.5 + 2.2 + 2.6));
  const [cx0, cz0] = at(0, 0), north = LINES.find(l => l.id === 'ICEF'), nst = north.stations.find(q => q.central), nz = north.at((nst.s0 + nst.s1) / 2).z - (2.5 + 2.2 + 4.2 + 3.6);
  for (let zz = cz0 + 7; zz >= nz; zz -= 1) route.push([cx0, zz]);
  for (let xx = cx0; xx <= cx0 + 16; xx += 0.5) route.push([xx, nz]); // trap omhoog naar het stationsplein
  let y = st.y + 2, ok = true, why = '';
  for (const [x, z] of route) {
    const { col: c } = col(x, z); let f = null;
    for (const fy of [y - 1, y - 2, y]) if (c[fy] && c[fy] !== B.WATER && !c[fy + 1] && !c[fy + 2]) { f = fy; break; }
    if (f === null) { ok = false; why = `vast bij (${Math.round(x)},${Math.round(z)}) y ${y}`; break; }
    y = f + 1;
  }
  out.central = ok ? `ok (eindigt op het plein, y ${y - 1})` : why;
  if (!ok) fails.push('Munkbay Central reizigerstunnel: ' + why);
}
// architectuur in Munkbay: aantal gebouwfamilies en hoe vaak twee buren identiek zijn (zelfde type, vorm, dak, materiaal, maten)
{
  const P = A.PLACE.Munkbay, g = A._gridFor(P), fams = new Set(); let pairs = 0, same = 0, run = 1, maxRun = 1;
  for (let bz = -20; bz <= 20; bz++) for (let bx = -20; bx <= 20; bx++) for (const row of [0, 1]) {
    let prev = null;
    for (let x = g.ox + bx * g.B + 23; x < g.ox + (bx + 1) * g.B - 1; x += 1) {
      const z = g.oz + bz * g.B + 23 + row * 50, u = A._urbanAt(x, z); if (!u || u.p !== P) continue;
      const st = A._streetAt(x, z, u); if (st.street) continue;
      const l = A._lotAt(x, z, u, st); if (!l.b || !l.b.fam || (prev && prev.id === l.b.id)) continue;
      const p = A._planOf(l.b); fams.add(l.b.fam);
      const sig = [l.b.fam, p.shape, p.roof, p.wall, p.floors, p.W, p.D].join('|');
      if (prev) { pairs++; if (sig === prev.sig) { same++; run++; maxRun = Math.max(maxRun, run); } else run = 1; }
      prev = { id: l.b.id, sig };
    }
  }
  out.arch = { fams: fams.size, pairs, same, maxRun };
  if (same / Math.max(1, pairs) > 0.15 || maxRun > 4) fails.push(`architectuur: te veel identieke buren (${same}/${pairs}, langste reeks ${maxRun})`);
}
// kabelbanen: stationsvloer op de juiste hoogte en vrij erboven, masten tot aan de kabel
out.liftSt = 0; out.liftBad = 0;
for (const L of A.LIFTS) for (const [u, y] of [[0, L.ya], [L.len, L.yb]]) for (const v of [-(L.stW - 2), 0, L.stW - 2]) {
  const x = L.ax + L.ux * u - L.uz * v, z = L.az + L.uz * u + L.ux * v, { col: c } = col(x, z);
  out.liftSt++;
  if (![B.TILE, B.LINE_YELLOW].includes(c[y]) || c[y + 1] || c[y + 2]) { out.liftBad++; fails.push(`${L.name}: station op u=${u} v=${v} niet begaanbaar (blok ${c[y]}, erboven ${c[y + 1]})`); }
}
// bussen: beide rijstroken liggen op de weg of straat en de ruimte erboven is vrij
out.busN = 0; out.bus = 0;
const ROADBED = new Set([B.ASPHALT, B.LINE_WHITE, B.BUS_LANE, B.METAL, B.CONCRETE, B.COBBLE, B.SIDEWALK, B.BIKE_PATH, B.GRASS, B.LINE_YELLOW]);
for (const L of A.BUS_LINES) for (let s = 10; s < L.len - 10; s += 40) for (const side of [1, -1]) {
  const p = L.at(s), off = L.trackAt(s) * side, x = p.x - p.tz * off, z = p.z + p.tx * off, { col: c } = col(x, z), by = Math.round(p.y);
  if (LINES.some(L2 => !L2.metro && L2.near(x, z, 8))) continue; // overweg of perron: daar ligt het spoor
  out.busN++;
  // het wegdek mag door afronding 1 blok hoger of lager liggen dan de bus (de bus volgt het vloeiende wegprofiel)
  let sy = [by, by - 1, by + 1].find(y => ROADBED.has(c[y]) && !c[y + 1]);
  let bad = sy === undefined ? `blok ${c[by]} op de rijstrook (y ${by})` : '';
  for (let y = (sy ?? by) + 1; y <= (sy ?? by) + 4 && !bad; y++) if (c[y] && c[y] !== B.LAMP) bad = `blok ${c[y]} boven de rijstrook`;
  if (bad) { out.bus++; if (fails.length < 40) fails.push(`${L.id} bij s=${Math.round(s)} (${Math.round(x)},${Math.round(z)}): ${bad}`); }
}
for (const L of LINES) if (!L.tram) {
  for (let i = 25; i < L.n; i += 5) { const g = Math.abs(L.y[i] - L.y[i - 25]) / (L.s[i] - L.s[i - 25]); if (g > L.maxGrade * 1.08) { out.grade++; if (fails.length < 30) fails.push(`${L.id} helling ${(g * 100).toFixed(1)} % bij s=${Math.round(L.s[i])}`); } }
  const p = {};
  for (let s = 20; s < L.len - 20; s += 25) {
    L.at(s, p);
    if (p.y < 4) continue; // onderzeese tunnel (onder het tegelbereik): de diepe ondergrond graaft die uit
    for (const side of [1, -1]) {
      const off = trackOffset(L, s) * side, x = p.x - p.tz * off, z = p.z + p.tx * off, q = L.near(Math.floor(x), Math.floor(z), 40), by = Math.round(q ? q.y : p.y), { col: c } = col(x, z);
      out.railN++;
      if (!BED.has(c[by])) { out.rail++; if (fails.length < 30) fails.push(`${L.id} geen spoorbed bij s=${Math.round(s)} (${Math.round(x)},${Math.round(z)}) blok ${c[by]}`); }
      let blocked = 0; for (let y = by + 1; y <= by + 5; y++) if (c[y] && c[y] !== B.LAMP && c[y] !== B.WATER) blocked++;
      if (blocked) { out.clear++; if (fails.length < 30) fails.push(`${L.id} spoor niet vrij bij s=${Math.round(s)} (${Math.round(x)},${Math.round(z)}) soort ${p.kind}`); }
    }
  }
  for (const st of L.stations) {
    if (st.intl && st.y < 4) continue;
    let ok = 0;
    for (const f of [-0.2, 0.05, 0.3]) for (const side of [1, -1]) { const q = L.at(st.s + f * st.len), d = (L.single ? 2.5 : 2.5) + 2.2 + 2.6, x = q.x - q.tz * d * side, z = q.z + q.tx * d * side, { col: c } = col(x, z); if ([B.TILE, B.LINE_YELLOW, B.LINE_WHITE, B.CONCRETE].includes(c[st.y + 1])) ok++; }
    if (ok < 4) { out.plat++; fails.push(`${L.id} perron ${st.name}: ${ok}/6 meetpunten op perronhoogte`); }
  }
}
// metro: van elk perron (beide kanten) via de doorgang en de trap te voet tot op straat (treden van hooguit 1 blok, 2 blokken hoofdruimte)
out.metroSt = 0; out.metroBad = 0;
const SOLID = (b) => b && b !== B.WATER && b !== B.LAMP && b !== B.DOOR && b !== B.DOOR_TOP && b !== B.DOOR_GLASS;
for (const L of LINES) if (L.metro) for (const st of L.stations) for (const side of [1, -1]) {
  out.metroSt++;
  const mid = (st.s0 + st.s1) / 2, P0 = 2.5 + 2.2 + 4.2;
  const pt = (s, d) => { const q = L.at(s); return [q.x - q.tz * d * side, q.z + q.tx * d * side]; };
  // route: over het perron naar de doorgang, door de wand, dan de trap op
  const dir = A.metroStair(L, st, side);
  if (!dir) { out.metroNoStair = (out.metroNoStair || 0) + 1; continue; } // geen trap aan deze kant (bovengronds spoor erboven): de andere kant telt
  const route = [[mid - dir * 9.5, P0 + 0.1], [mid - dir * 9.5, P0 + 0.9], [mid - dir * 9.5, P0 + 3.4]];
  for (let u = -1; u < 70; u++) route.push([mid - dir * 8 + dir * (u + 0.5), P0 + 3.4]);
  let y = st.y + 2, ok = false, why = '';
  for (const [s, d] of route) {
    const [x, z] = pt(s, d), { col: c } = col(x, z);
    let f = null; for (const fy of [y - 1, y, y - 2]) if (SOLID(c[fy]) && !SOLID(c[fy + 1]) && !SOLID(c[fy + 2])) { f = fy; break; }
    if (f === null) { why = `vast bij (${Math.round(x)},${Math.round(z)}) y ${y}`; break; }
    y = f + 1;
    const top = Math.round(A.heightAt(x, z));
    if (f >= top - 1) { let sky = true; for (let k = f + 3; k < f + 12; k++) if (SOLID(c[k])) { sky = false; break; } if (sky || f >= top) { ok = true; break; } }
  }
  if (!ok) { out.metroBad++; if (fails.length < 40) fails.push(`${L.id} ${st.name} (kant ${side}): trap niet tot op straat – ${why || 'te kort'}`); }
}
// gebouwen en naden in echte tegels
const spots = { 'Munkbay Central': [130700, 27900], 'Munkbay CBD': [130200, 27200], 'Old Town': [133100, 28400], 'Munkbay-Noord': [130800, 22900], Westport: [9600, 27600], Viridonia: [70100, 28600], Silverpine: [81500, 20500], Riverside: [111500, 22100], dorp: [A.ALL_PLACES[40].x, A.ALL_PLACES[40].z], gehucht: [A.ALL_PLACES[200].x, A.ALL_PLACES[200].z], ...Object.fromEntries(A.HARBOURS.map(H => [H.name, [H.x - H.nz * 300 + H.nx * 100, H.z + H.nx * 300 + H.nz * 100]])), 'Zenvo Showroom': [125471, 30271], 'Zenvo-testterrein': [115000, 22500] };
// grondhoogte aan de rand: alleen natuurlijke grond, wegen en stoepen (in gebouwen staan muren en meubels)
const NAT = new Set([B.GRASS, B.DIRT, B.SAND, B.STONE, B.GRAVEL, B.FLOWERS, B.SNOW, B.COBBLE, B.SIDEWALK, B.ASPHALT, B.LINE_WHITE]);
const ground = (r, x, z) => { const base = (z * T + x) * r.H; for (let y = 1; y < r.H; y++) { const b = r.vox[base + y]; if (!b || b === B.WATER) return NAT.has(r.vox[base + y - 1]) ? r.y0 + y - 1 : null; } return null; };
for (const [name, [x, z]] of Object.entries(spots)) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T), r = A.generateTile(tx, tz), nb = A.generateTile(tx + 1, tz);
  let bad = 0;
  for (let i = 0; i < T * T; i++) {
    const base = i * r.H; let firstAir = -1;
    // zwevend = lucht tussen natuurlijke grond (gras, aarde, zand, steen) en een vloer erboven (verdiepingsvloeren binnen een gebouw tellen niet)
    const GROUND = new Set([B.GRASS, B.DIRT, B.SAND, B.STONE, B.GRAVEL, B.FLOWERS, B.SNOW, B.COBBLE, B.SIDEWALK, B.ASPHALT]);
    for (let y = 1; y < r.H; y++) { const v = r.vox[base + y]; if (!v) { if (firstAir < 0) { firstAir = y; if (!GROUND.has(r.vox[base + y - 1])) break; } } else if (firstAir > 0) { if ((v === B.MARBLE || v === B.PLANKS) && y - firstAir < 6) bad++; break; } }
  }
  out.bld += bad; out.bldCols += T * T;
  if (bad) fails.push(`${name}: ${bad} kolommen met lucht onder een vloer`);
  for (let zz = 0; zz < T; zz += 2) { const a = ground(r, T - 1, zz), c = ground(nb, 0, zz); if (a === null || c === null) continue; out.seamN++; if (Math.abs(a - c) > 2) { out.seam++; if (fails.length < 40) fails.push(`naad ${name} bij (${(tx + 1) * T},${tz * T + zz}): ${a} ↔ ${c}`); } }
}
// wegen: hoogte van het wegdek langs de as (om de 2 m), geen treden > 1 blok
for (const R of ROADS.slice(0, 120)) {
  let prev = null;
  for (let k = 0; k < R.n; k += 1) {
    const x = R.x[k], z = R.z[k], q = { y: R.y[k] };
    const ry = Math.round(q.y) - 1;
    if (prev !== null) { out.roadN++; if (Math.abs(ry - prev) > 1) { out.road++; if (fails.length < 40) fails.push(`weg ${R.a}–${R.b}: trede van ${ry - prev} blokken bij (${Math.round(x)},${Math.round(z)})`); } }
    prev = ry;
  }
}
console.log(`metrostations (perronkanten) ${out.metroSt} · trap niet tot op straat ${out.metroBad} · zonder eigen trap ${out.metroNoStair || 0}`);
console.log(`kruisingen weg × spoor ${out.xN} (${Object.entries(xt).map(([k, v]) => v + ' ' + k).join(', ')}) · fout ${out.xBad}`);
console.log(`kruisingen straat × spoor ${out.sxN} (${Object.entries(sxt).map(([k, v]) => v + ' ' + k).join(', ')}) · fout ${out.sxBad}`);
console.log(`Munkbay Central reizigerstunnel (perron → tunnel → onder alle sporen): ${out.central}`);
console.log(`architectuur Munkbay: ${out.arch.fams} gebouwfamilies · identieke buren ${out.arch.same}/${out.arch.pairs} (${(100 * out.arch.same / Math.max(1, out.arch.pairs)).toFixed(1)} %) · langste reeks identiek ${out.arch.maxRun}`);
console.log(`kabelbaanstations (meetpunten) ${out.liftSt} · niet begaanbaar ${out.liftBad}`);
console.log(`buspunten ${out.busN} · niet op de weg of niet vrij ${out.bus}`);
console.log(`trampunten ${out.tramN} · niet vrij of niet in de straat ${out.tram}`);
console.log(`spoorpunten ${out.railN} · zonder spoorbed ${out.rail} · niet vrij ${out.clear} · te steil ${out.grade} · perronfouten ${out.plat}`);
console.log(`gebouwkolommen ${out.bldCols} · zwevende vloeren ${out.bld} · naden >2 blokken ${out.seam}/${out.seamN} · wegtreden >1 blok ${out.road}/${out.roadN}`);
for (const f of fails.slice(0, 40)) console.log('  ' + f);
if (out.rail + out.clear + out.grade + out.plat + out.bld + out.road || out.seam > out.seamN * 0.03) process.exitCode = 1;
