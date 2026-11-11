// Greenisland – alle bewoonde plaatsen: de benoemde uit greenisland-data.js plus deterministisch gegenereerde dorpen
// en gehuchten (voorstel), samen ongeveer 220. Elke plaats krijgt een provincie, een soort, een stijl en een postcode G-XXXX.
import { PLACES as NAMED, PROVINCES, provinceAt, generatedPlaceName, GENERATED_TARGET, MOUNTAINS, RAINFOREST, W, L } from './greenisland-data.js';
import { coastDist, rawHeight } from './greenisland-terrain.js';

const hash = (a, b, s) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// stijl van de bebouwing volgens de omgeving
function styleFor(x, z, h, m) {
  if (h > 600) return 'berg';                       // chalets, steen, hout
  const rf = Math.hypot((x - RAINFOREST.x) / RAINFOREST.rx, (z - RAINFOREST.z) / RAINFOREST.rz);
  if (rf < 1.2) return 'tropisch';                   // lichte gevels, platte daken, veel groen
  if (m < 2500) return 'kust';                       // witte en pastel huizen
  return 'land';                                     // baksteen, pannendaken
}
export const ALL_PLACES = (() => {
  const out = NAMED.map(p => {
    const h = rawHeight(p.x, p.z), m = coastDist(p.x, p.z);
    return { ...p, prov: p.prov || provinceAt(p.x, p.z), style: p.name === 'Munkbay' ? 'stad' : styleFor(p.x, p.z, h, m), named: true };
  });
  // kandidaten op een verschoven raster van 3,2 km
  const cand = [];
  const S = 3200;
  for (let gz = 0; gz * S < L; gz++) for (let gx = 0; gx * S < W; gx++) {
    const x = gx * S + hash(gx, gz, 1) * S, z = gz * S + hash(gx, gz, 2) * S;
    const m = coastDist(x, z); if (m < 350) continue;
    const h = rawHeight(x, z); if (h > 1350) continue;
    let ok = true;
    for (const p of out) if (Math.hypot(p.x - x, p.z - z) < p.r + 2200) { ok = false; break; }
    if (!ok) continue;
    // in het hooggebergte maar weinig dorpen
    let mt = 0; for (const M of MOUNTAINS) mt = Math.max(mt, 1 - Math.min(1, Math.hypot((x - M.x) / M.rx, (z - M.z) / M.rz)));
    if (mt > 0.35 && hash(gx, gz, 3) < 0.6) continue;
    cand.push({ x: Math.round(x), z: Math.round(z), h, m, pr: hash(gx, gz, 4) });
  }
  cand.sort((a, b) => a.pr - b.pr);
  const used = new Set(out.map(p => p.name));
  const gen = [];
  for (const c of cand) {
    if (gen.length >= GENERATED_TARGET) break;
    if (gen.some(g => Math.hypot(g.x - c.x, g.z - c.z) < 2800)) continue;
    let name = generatedPlaceName(gen.length), k = 1;
    while (used.has(name)) name = generatedPlaceName(gen.length + 1000 * k++);
    used.add(name);
    const r = hash(c.x, c.z, 5), kind = r < 0.12 ? 'town' : r < 0.62 ? 'village' : 'hamlet';
    gen.push({ name, kind, x: c.x, z: c.z, r: kind === 'town' ? 650 : kind === 'village' ? 330 : 150, prov: provinceAt(c.x, c.z), style: styleFor(c.x, c.z, c.h, c.m), named: false, canon: false });
  }
  const all = [...out, ...gen];
  // postcodes G-XXXX: eerste cijfer = provincie (voorstel), daarna volgnummer per provincie
  const nr = {};
  for (const p of all) {
    if (p.postcode) continue;
    const pv = PROVINCES.find(q => q.id === p.prov);
    nr[p.prov] = (nr[p.prov] || 0) + 1;
    p.postcode = `G-${pv.postcode}${String(nr[p.prov] * 10).padStart(3, '0')}`;
  }
  return all;
})();
export const PLACE = Object.fromEntries(ALL_PLACES.map(p => [p.name, p]));
