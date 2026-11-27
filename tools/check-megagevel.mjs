// TERRANOVA 16.1 fase 1 — controle van de nieuwe buitenkant van The Megatower, zonder browser: de torentegel wordt
// opgebouwd zoals in de worker (writeTower) en dan nagemeten.
//  - hoogte exact 1.000 m (niets boven het dak), 250 verdiepingen + 25 kelders, elke verdieping met een liftstop
//  - de gevel is niet meer één raamraster: per zijde minstens 4 gevelmaterialen, pijlers, twee glassoorten, ribben
//    buiten de gevel (om de 12 m), lichtbanden bij elke sectie-overgang, sky gardens met gras en bomen, luifel en portaal
//  - met OUT=map ook een gevelaanzicht (noord en oost) als PNG
import { writeTower, buildFloor, LIFTS, F_MIN, F_MAX, G, Y0, TILE_H, floorY, plateOf, SKY_GARDENS, CANOPY, HEIGHT_M } from '../js/megatower.js';
import { B, BLOCKS } from '../js/blocks.js';
import fs from 'fs';

const T = 128, H = TILE_H, vox = new Uint8Array(T * T * H);
const t0 = Date.now();
writeTower(vox, H, Y0);
const ms = Date.now() - t0;
const at = (x, y, z) => { const ly = y - Y0; return ly < 0 || ly >= H ? 0 : vox[(z * T + x) * H + ly]; };
const R = { bouwen_ms: ms };
// 1. hoogte
let top = 0; for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) for (let y = Y0 + H - 1; y > top; y--) if (at(x, y, z)) { top = y; break; }
R.hoogte_m = top + 1 - G; R.dak = top;
// 2. verdiepingen en liften
const stops = new Set(); for (const L of LIFTS) for (const f of L.stops) stops.add(f);
const missing = []; for (let f = F_MIN; f <= F_MAX; f++) if (!stops.has(f)) missing.push(f);
R.verdiepingen = F_MAX + 1; R.kelders = -F_MIN; R.zonderLift = missing.length;
// 3. gevel: per zijde de materialen van de gevelcellen (laag 1..3) op enkele verdiepingen
const sides = { noord: (i, d) => [i, d], zuid: (i, d) => [i, T - 1 - d], west: (i, d) => [d, i], oost: (i, d) => [T - 1 - d, i] };
R.gevel = {};
for (const [name, fn] of Object.entries(sides)) {
  const mats = new Set();
  for (const f of [12, 50, 100, 140, 180, 215, 240]) for (let l = 1; l < 4; l++) {
    const y = floorY(f) - 1 + l;
    for (let i = 0; i < T; i++) { for (let d = 0; d < 64; d++) { const [x, z] = fn(i, d); const b = at(x, y, z); if (b) { mats.add(b); break; } } }
  }
  R.gevel[name] = [...mats].map(b => BLOCKS[b].name);
}
// 4. ribben: cellen buiten het plaatmasker met metaal of ledgevel, op verdieping 50 (noordzijde)
{
  const f = 50, y = floorY(f) + 1, a = plateOf(f).a; let rib = 0, led = 0;
  for (let x = 0; x < T; x++) { const b = at(x, y, 64 - a - 1); if (b === B.METAL) rib++; if (b === B.FACADE_LED) led++; }
  R.ribben50 = { metaal: rib, led };
}
// 5. lichtbanden op de laatste verdieping van elke sectie (verdiepingen 9, 29, 79, 119, 149, 199, 229)
R.lichtbanden = [9, 29, 79, 119, 149, 199, 229].map(f => { const F = buildFloor(f); let n = 0; for (let i = 0; i < F.b.length; i += 4) if (F.b[i + 3] === B.FACADE_LED) n++; return n; });
// 6. sky gardens
R.skyGardens = Object.keys(SKY_GARDENS).map(Number).map(f => { const F = buildFloor(f); let g = 0, tree = 0; for (let i = 0; i < F.b.length; i += 4) { if (F.b[i] === B.GRASS) g++; if (F.b[i + 1] === B.LOG) tree++; } return { f, gras: g, bomen: tree, naam: F.rooms.some(r => r && /Sky garden/.test(r.name)) }; });
// 7. luifel en portaal bij de hoofdingang
{ let glass = 0; for (let z = 64 + CANOPY.cj0; z <= 64 + CANOPY.cj1; z++) for (let x = 64 + CANOPY.ci0; x <= 64 + CANOPY.ci1; x++) if (at(x, CANOPY.y, z) === B.GLASS) glass++; R.luifelGlas = glass; R.portaalNaam = at(64, G + 11, 64 - 48) === B.SIGN; }
// 8. verschillende gevelmaterialen per verdieping over de hele hoogte (aantal verschillende combinaties)
{ const combos = new Set(); for (let f = 0; f <= F_MAX; f++) { const y = floorY(f) + 1, a = plateOf(f).a; const row = []; for (let x = 64 - 24; x < 64 + 24; x++) row.push(at(x, y, 64 - a)); combos.add(row.join(',')); } R.gevelpatronen = combos.size; }
console.log(JSON.stringify(R, null, 1));
const ok = R.hoogte_m === HEIGHT_M && R.verdiepingen === 250 && R.kelders === 25 && R.zonderLift === 0
  && Object.values(R.gevel).every(m => m.length >= 4) && R.ribben50.metaal >= 4 && R.ribben50.led >= 2
  && R.lichtbanden.every(n => n > 50) && R.skyGardens.every(s => s.gras >= 24 && s.bomen >= 2 && s.naam)
  && R.luifelGlas > 200 && R.portaalNaam && R.gevelpatronen >= 6;
// gevelaanzicht
if (process.env.OUT) {
  const { PNG } = await import('pngjs');
  for (const [name, fn] of [['noord', sides.noord], ['oost', sides.oost]]) {
    const S = 1, W = T, Hh = 1000 + 30, png = new PNG({ width: W * 2, height: Hh });
    for (let yy = 0; yy < Hh; yy++) for (let i = 0; i < W; i++) {
      const y = G + 1000 + 10 - yy; let c = [150, 190, 230];
      for (let d = 0; d < 64; d++) { const [x, z] = fn(i, d); const b = at(x, y, z); if (b) { c = BLOCKS[b].color.map(v => v * (1 - d / 110)); break; } }
      for (let q = 0; q < 2; q++) { const p = (yy * W * 2 + i * 2 + q) * 4; png.data[p] = c[0]; png.data[p + 1] = c[1]; png.data[p + 2] = c[2]; png.data[p + 3] = 255; }
    }
    fs.writeFileSync(`${process.env.OUT}/gevel-${name}.png`, PNG.sync.write(png));
  }
}
console.log(ok ? 'alles goed' : 'FOUT');
process.exitCode = ok ? 0 : 1;
