// Tunnelvalidatie (node tools/check-tunnels.mjs [greenisland|alpen|megatower] [--snel] [--lijn ID] [--json uit.json]):
// loopt langs elk spoor door een tunnel (en elke metrolijn) en controleert het volledige vrijprofiel van een trein
// in de echte gegenereerde wereld: 3 m breed rond elk spoor, 4,4 m hoog boven de spoorstaaf.
// Elk geblokkeerd blok wordt gemeld met coördinaten, het blok en de generator (tegel of diepe ondergrond).
// Met --json worden de geblokkeerde plekken weggeschreven (de OV-diagnose in de game kan ze rood tonen).
import fs from 'fs';
import { IS_SOLID, BLOCKS, B } from '../js/blocks.js';
import { CarveIndex } from '../js/carve.js';

const args = process.argv.slice(2);
const world = args.find(a => !a.startsWith('--') && !/^[A-Z]/.test(a) && !a.endsWith('.json')) || 'greenisland';
const quick = args.includes('--snel');
const onlyLine = args.includes('--lijn') ? args[args.indexOf('--lijn') + 1] : null;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
// voertuigprofiel zoals de treinen in de game (js/trainshell.js): bak 4,06 m breed tot 5 m boven de spoorstaaf, afgerond dak
// tot 5,5 m (3,3 m breed). Per blokhoogte h boven de spoorstaaf (blok y = spoor + h, de spoorstaaf ligt op spoor + 1):
// h = 1 (0–1 m boven de spoorstaaf): alleen draaistellen en onderstel (2,9 m breed) — een perronrand mag daar onder de bak
// h = 7: de stroomafnemer (1,8 m breed) tot 6,1 m. Megatower City: metrostellen 2,8 m breed, 3,5 m hoog.
const PROFILE = world === 'megatower' ? [0, 1.4, 1.4, 1.4, 1.4] : [0, 1.5, 2.03, 2.03, 2.03, 2.03, 1.65, 0.9];
const HALF_W = Math.max(...PROFILE), CLEAR_H = PROFILE.length - 1;

const W = await import(world === 'alpen' ? '../js/alpen.js' : world === 'megatower' ? '../js/megacity.js' : '../js/greenisland.js');
const T = 128;
// tegels maken en bewaren (de laatste 80)
const tiles = new Map(), carves = new CarveIndex();
function tile(tx, tz) {
  const k = tx + ',' + tz;
  let t = tiles.get(k);
  if (t) { tiles.delete(k); tiles.set(k, t); return t; }
  t = W.generateTile(tx, tz);
  for (const sg of t.tunnels || []) carves.add(sg);
  tiles.set(k, t);
  if (tiles.size > 80) tiles.delete(tiles.keys().next().value);
  return t;
}
// blok op een plek: in de tegel, of eronder in de diepe ondergrond (gegraven tunnels, anders rots)
function blockAt(x, y, z) {
  const tx = Math.floor(x / T), tz = Math.floor(z / T), t = tile(tx, tz), lx = x - tx * T, lz = z - tz * T, ly = y - (t.y0 || 0);
  if (ly >= t.H) return { b: 0, src: 'tegel' };
  if (ly >= 0) return { b: t.vox[(lz * T + lx) * t.H + ly], src: 'tegel' };
  const c = carves.at(x, y, z);
  return { b: c >= 0 ? c : 1, src: c >= 0 ? 'ondergrond (gegraven)' : 'ondergrond (rots)' };
}

// lijnen en welke stukken onder de grond liggen
let tracks = [];
if (world === 'megatower') {
  const { METRO_Z } = W, { G } = await import('../js/megatower.js');
  tracks.push({ id: 'M1', name: 'Metro M1', samples: (() => { const out = []; for (let x = 520; x < 9060; x += quick ? 12 : 3) for (const o of [-4, 5]) out.push({ x, z: METRO_Z + o + 0.5, y: G - 18, tx: 1, tz: 0 }); return out; })() });
} else {
  const LINES = world === 'alpen' ? W.LINES || (await import('../js/rail-alpen.js')).NET.lines : W.LINES;
  const trackOffset = W.trackOffset || ((L) => L.single ? 0 : 2.5);
  for (const L of LINES) {
    if (L.tram || (onlyLine && L.id !== onlyLine)) continue;
    const under = (s) => L.metro || (L.inTunnel && L.inTunnel(s));
    const samples = [], p = {};
    const step = quick ? 15 : 2;
    for (let s = 0; s <= L.len; s += step) {
      if (!under(s)) continue;
      L.at(s, p);
      const off = trackOffset(L, s);
      for (const side of off ? [1, -1] : [0]) {
        const cx = p.x - p.tz * off * side, cz = p.z + p.tx * off * side, q = L.near(Math.floor(cx), Math.floor(cz), 40);
        samples.push({ x: cx, z: cz, y: Math.round(q ? q.y : p.y), tx: p.tx, tz: p.tz, s });
      }
    }
    if (samples.length) tracks.push({ id: L.id, name: L.name || L.id, samples });
  }
}
// controleren
const blocked = [], perLine = [];
let checked = 0, steps = 0, minCeil = { h: 99 };
const ceil = {}, hitStat = {}, low = [];
const BED = new Set([B.BALLAST, B.CONCRETE, B.TILE, B.LINE_WHITE, B.LINE_YELLOW, B.METAL, B.GRAVEL, B.STONE]);
for (const tr of tracks) {
  let bad = 0;
  for (const sp of tr.samples) {
    checked++;
    let hit = null, step = false;
    for (let o = -HALF_W; o <= HALF_W + 1e-6 && !hit; o += HALF_W / 4) {
      const x = Math.floor(sp.x - sp.tz * o), z = Math.floor(sp.z + sp.tx * o);
      // valt dit blok echt binnen de breedte van het rijtuig? (afstand van het midden van het blok tot de spooras)
      const lat = Math.abs((x + 0.5 - sp.x) * -sp.tz + (z + 0.5 - sp.z) * sp.tx);
      if (lat > HALF_W + 0.5) continue;
      for (let h = 1; h <= CLEAR_H; h++) {
        if (lat - 0.5 >= PROFILE[h]) continue; // dit blok raakt het profiel op deze hoogte niet
        const r = blockAt(x, sp.y + h, z);
        if (!IS_SOLID[r.b]) continue;
        // een trede van 1 blok in de spoorbedding (helling in blokken), met vrije ruimte erboven: geen muur
        if (h === 1 && BED.has(r.b) && [2, 3, 4, 5].every(k => !IS_SOLID[blockAt(x, sp.y + k, z).b])) { step = true; break; }
        hitStat[h + '@' + (lat - 0.5).toFixed(1)] = (hitStat[h + '@' + (lat - 0.5).toFixed(1)] || 0) + 1;
        hit = { x, y: sp.y + h, z, h, blok: BLOCKS[r.b] ? BLOCKS[r.b].name : r.b, generator: r.src, s: sp.s }; break;
      }
    }
    // vrije hoogte boven het spoormidden (voor de bovenleiding): eerste vaste blok boven de spoorstaaf
    { const x = Math.floor(sp.x), z = Math.floor(sp.z); let h = 1; while (h < 14 && !IS_SOLID[blockAt(x, sp.y + h, z).b]) h++; ceil[h] = (ceil[h] || 0) + 1; if (h < minCeil.h) minCeil = { h, x, y: sp.y, z, lijn: tr.id }; }
    if (step) steps++;
    // alleen de stroomafnemer (6–7 m) raakt: geen muur voor het rijtuig, wel apart gemeld (laag plafond)
    if (hit && hit.h === 7) { low.push({ lijn: tr.id, ...hit }); hit = null; }
    if (hit) { bad++; blocked.push({ lijn: tr.id, ...hit }); }
  }
  perLine.push({ lijn: tr.id, punten: tr.samples.length, geblokkeerd: bad });
}
for (const l of perLine) console.log(`${l.geblokkeerd ? '✗' : '✓'} ${l.lijn}: ${l.punten} punten, ${l.geblokkeerd} geblokkeerd`);
const byGen = {}; for (const b of blocked) byGen[b.generator + ' / ' + b.blok] = (byGen[b.generator + ' / ' + b.blok] || 0) + 1;
if (blocked.length) { console.log('oorzaken:', JSON.stringify(byGen)); for (const b of blocked.slice(0, 12)) console.log('  ', JSON.stringify(b)); }
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ world, blocked }, null, 1));
console.log(`${world}: ${checked} punten langs ${tracks.length} lijnen gecontroleerd · geblokkeerd: ${blocked.length} · treden van 1 blok in de bedding (geen muur): ${steps}`);
// bovenleiding: de rijdraad hangt in de game op 6 m boven de spoorstaaf, in een tunnel op (plafond − 0,4 m)
console.log(`vrije hoogte boven het spoor (blokken: aantal meetpunten): ${JSON.stringify(ceil)} · laagste: ${minCeil.h} (${minCeil.lijn} bij ${minCeil.x},${minCeil.y},${minCeil.z})`);
if (blocked.length) console.log('raakpunten (hoogte@zijafstand):', JSON.stringify(hitStat));
if (low.length) { const by = {}; for (const b of low) { const k = b.lijn + ' bij ' + Math.round(b.x / 100) * 100 + ',' + Math.round(b.z / 100) * 100; by[k] = (by[k] || 0) + 1; } console.log(`laag plafond (alleen de stroomafnemer, 6–7 m boven de spoorstaaf): ${low.length} meetpunten ${JSON.stringify(by)}`); }
process.exitCode = blocked.length || low.length ? 1 : 0; // sinds Blokstad 13: ook de stroomafnemer moet overal vrij zijn
