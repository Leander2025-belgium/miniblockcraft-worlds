// Greenisland – procedurele architectuur (City Rebuild 2.0).
// Een gebouw = een familie (bouwtype) + een vorm (grondplan, per kolom een hoogte) + een dak + een gevelpatroon + materialen.
// Alles volgt deterministisch uit het kavelnummer, zodat elke tegel hetzelfde gebouw tekent (ook over tegelgrenzen heen).
// Geen three.js: draait in de worker.
import { B } from './blocks.js';
import { hash } from './city.js';

const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
// ---------- de families (minstens twintig bouwtypes, elk met veel varianten) ----------
// lot: kavelbreedte (m), depth: diepte van het gebouw (m), floors: verdiepingen, fh: verdiepingshoogte,
// shapes/roofs: mogelijke vormen en daken, fac: gevelpatroon, kind: inrichting (zie interior() in greenisland.js)
export const FAMILIES = {
  rijhuis:      { name: 'klassiek rijhuis', lot: [6, 8], depth: [10, 13], floors: [2, 3], fh: 3, shapes: ['rows'], roofs: ['gable'], fac: 'brick', kind: 'house', attached: true,
                  wall: [B.BRICK, B.BRICK_DARK, B.YELLOWBRICK, B.BRICK], accent: [B.LIMESTONE, B.PAINT_WHITE], roof: [B.ROOF_DARK, B.CLAY_ROOF, B.ROOF_RED] },
  herenhuis:    { name: 'Belgisch herenhuis', lot: [7, 10], depth: [12, 16], floors: [3, 4], fh: 4, shapes: ['rows'], roofs: ['mansard'], fac: 'classic', kind: 'old', attached: true, balc: 0.5,
                  wall: [B.PLASTER_BEIGE, B.LIMESTONE, B.PLASTER, B.PLASTER_GREY, B.PLASTER_PINK], accent: [B.ASHLAR, B.LIMESTONE, B.PAINT_WHITE], roof: [B.ROOF_DARK, B.COPPER] },
  gevelhuis:    { name: 'Nederlands gevelhuis', lot: [5, 7], depth: [11, 14], floors: [3, 5], fh: 3, shapes: ['rows'], roofs: ['stepGable', 'neckGable'], fac: 'gevel', kind: 'old', attached: true,
                  wall: [B.BRICK_DARK, B.BRICK, B.RED_SANDSTONE, B.BRICK_DARK], accent: [B.PAINT_WHITE, B.LIMESTONE], roof: [B.ROOF_DARK, B.CLAY_ROOF] },
  vrijstaand:   { name: 'vrijstaande woning', lot: [16, 22], depth: [9, 12], floors: [1, 2], fh: 3, shapes: ['rect', 'L'], roofs: ['hip', 'gable'], fac: 'house', kind: 'house', setback: 4,
                  wall: [B.BRICK, B.PLASTER, B.YELLOWBRICK, B.PLASTER_BEIGE, B.HALF_TIMBER], accent: [B.PAINT_WHITE, B.DARK_PLANKS], roof: [B.ROOF_RED, B.CLAY_ROOF, B.ROOF_DARK] },
  halfopen:     { name: 'halfopen bebouwing', lot: [20, 26], depth: [9, 11], floors: [2, 2], fh: 3, shapes: ['twin'], roofs: ['gable'], fac: 'house', kind: 'house', setback: 3,
                  wall: [B.BRICK, B.PLASTER_GREY, B.YELLOWBRICK], accent: [B.PAINT_WHITE], roof: [B.ROOF_DARK, B.ROOF_RED] },
  moderneVilla: { name: 'moderne villa', lot: [18, 26], depth: [10, 14], floors: [1, 2], fh: 3, shapes: ['L', 'stepped', 'rect'], roofs: ['flat', 'green'], fac: 'villa', kind: 'villa', setback: 4,
                  wall: [B.PAINT_WHITE, B.PLASTER_GREY, B.DARK_PLANKS, B.CONCRETE], accent: [B.DARK_PLANKS, B.PANEL_DARK], roof: [B.CONCRETE, B.PANEL_DARK] },
  appartement:  { name: 'modern appartementsgebouw', lot: [24, 36], depth: [12, 16], floors: [4, 8], fh: 3, shapes: ['rect', 'L', 'stepped'], roofs: ['flat', 'flatTerrace'], fac: 'modern', kind: 'apartment', balc: 0.8, setback: 2,
                  wall: [B.PLASTER, B.PLASTER_GREY, B.PANEL_WHITE, B.BRICK, B.YELLOWBRICK], accent: [B.PAINT_ORANGE, B.PANEL_DARK, B.DARK_PLANKS, B.PAINT_GREEN, B.TERRACOTTA], roof: [B.CONCRETE] },
  hofblok:      { name: 'woonblok met binnenhof', lot: [40, 56], depth: [30, 44], floors: [5, 7], fh: 3, shapes: ['court', 'U'], roofs: ['flat', 'mansard'], fac: 'classic', kind: 'apartment', balc: 0.6, setback: 1,
                  wall: [B.PLASTER_BEIGE, B.BRICK, B.PLASTER_GREY, B.LIMESTONE], accent: [B.ASHLAR, B.PAINT_WHITE, B.LIMESTONE], roof: [B.ROOF_DARK, B.CONCRETE] },
  woontoren:    { name: 'luxe woontoren', lot: [30, 44], depth: [24, 34], floors: [14, 30], fh: 3, shapes: ['stepped', 'podium', 'round'], roofs: ['crown', 'flatTerrace'], fac: 'residentialTower', kind: 'apartment', balc: 0.9, setback: 3,
                  wall: [B.PANEL_WHITE, B.GLASS, B.PLASTER_GREY], accent: [B.GLASS_BLUE, B.PANEL_DARK], roof: [B.CONCRETE] },
  kantoor:      { name: 'kantoorgebouw', lot: [30, 46], depth: [20, 30], floors: [6, 12], fh: 4, shapes: ['rect', 'L', 'U'], roofs: ['flat'], fac: 'office', kind: 'office', setback: 2,
                  wall: [B.LIMESTONE, B.CONCRETE, B.GRANITE, B.PANEL_WHITE], accent: [B.GLASS, B.GLASS_BLUE, B.DARKGLASS], roof: [B.CONCRETE] },
  wolkenkrabber:{ name: 'glazen wolkenkrabber', lot: [36, 50], depth: [32, 46], floors: [25, 66], fh: 4, shapes: ['podium', 'stepped', 'round', 'rect'], roofs: ['crown', 'spire', 'flat'], fac: 'curtain', kind: 'tower', setback: 3,
                  wall: [B.GLASS_BLUE, B.GLASS, B.MIRROR, B.GLASS_GREEN, B.DARKGLASS], accent: [B.PANEL_DARK, B.PANEL_WHITE, B.METAL], roof: [B.PANEL_DARK] },
  hotel:        { name: 'hotel', lot: [30, 40], depth: [20, 28], floors: [10, 22], fh: 3, shapes: ['podium', 'rect', 'L'], roofs: ['crown', 'flat'], fac: 'hotel', kind: 'tower', setback: 2,
                  wall: [B.PLASTER_BEIGE, B.LIMESTONE, B.PANEL_WHITE, B.RED_GRANITE], accent: [B.DARKGLASS, B.GLASS_BLUE, B.COPPER], roof: [B.CONCRETE] },
  winkelpand:   { name: 'winkelpand met woningen erboven', lot: [7, 12], depth: [12, 18], floors: [3, 5], fh: 3, shapes: ['rows'], roofs: ['flat', 'gable', 'mansard'], fac: 'shop', kind: 'shop', attached: true,
                  wall: [B.PLASTER, B.BRICK, B.PLASTER_BEIGE, B.PLASTER_PINK, B.YELLOWBRICK, B.PLASTER_GREY], accent: [B.PAINT_RED, B.PAINT_GREEN, B.PAINT_BLUE, B.PAINT_BLACK, B.PAINT_ORANGE], roof: [B.ROOF_DARK, B.CONCRETE] },
  winkelcentrum:{ name: 'winkelcentrum', lot: [60, 96], depth: [40, 70], floors: [2, 3], fh: 5, shapes: ['rect', 'U'], roofs: ['parkingRoof', 'flat'], fac: 'mall', kind: 'shop', setback: 3,
                  wall: [B.PANEL_WHITE, B.CONCRETE, B.TERRACOTTA], accent: [B.GLASS, B.PAINT_RED, B.PAINT_BLUE], roof: [B.ASPHALT] },
  magazijn:     { name: 'pakhuis', lot: [26, 40], depth: [20, 30], floors: [3, 5], fh: 4, shapes: ['rect'], roofs: ['gable', 'flat'], fac: 'warehouse', kind: 'warehouse', setback: 2,
                  wall: [B.BRICK, B.BRICK_DARK, B.YELLOWBRICK], accent: [B.PAINT_WHITE, B.PAINT_GREEN, B.METAL], roof: [B.ROOF_DARK] },
  fabriek:      { name: 'fabriek', lot: [40, 70], depth: [30, 50], floors: [1, 2], fh: 6, shapes: ['rect'], roofs: ['sawtooth'], fac: 'industrial', kind: 'factory', setback: 3, chimney: 0.5,
                  wall: [B.PANEL_WHITE, B.BRICK, B.METAL], accent: [B.PANEL_DARK, B.PAINT_BLUE], roof: [B.METAL] },
  school:       { name: 'school', lot: [40, 60], depth: [24, 36], floors: [2, 3], fh: 4, shapes: ['L', 'U'], roofs: ['flat', 'gable'], fac: 'school', kind: 'campus', setback: 5,
                  wall: [B.BRICK, B.YELLOWBRICK, B.PLASTER], accent: [B.PAINT_WHITE, B.PAINT_ORANGE, B.PAINT_BLUE], roof: [B.CONCRETE, B.ROOF_DARK] },
  sporthal:     { name: 'sporthal', lot: [36, 50], depth: [28, 40], floors: [1, 1], fh: 9, shapes: ['rect'], roofs: ['barrel'], fac: 'hall', kind: 'warehouse', setback: 4,
                  wall: [B.PANEL_WHITE, B.CONCRETE], accent: [B.PAINT_GREEN, B.PAINT_BLUE, B.PAINT_ORANGE], roof: [B.METAL] },
  parkeergarage:{ name: 'parkeergarage', lot: [30, 46], depth: [28, 40], floors: [4, 7], fh: 3, shapes: ['rect'], roofs: ['parkingRoof'], fac: 'parking', kind: 'parking', setback: 2,
                  wall: [B.CONCRETE], accent: [B.PAINT_YELLOW, B.PAINT_BLUE], roof: [B.ASPHALT] },
  kerk:         { name: 'kerk', lot: [24, 34], depth: [34, 46], floors: [1, 1], fh: 12, shapes: ['church'], roofs: ['gable'], fac: 'church', kind: 'church', setback: 4,
                  wall: [B.LIMESTONE, B.ASHLAR, B.BRICK, B.GRANITE], accent: [B.ASHLAR, B.LIMESTONE], roof: [B.ROOF_DARK, B.COPPER] },
  stadhuis:     { name: 'gemeentehuis', lot: [36, 50], depth: [22, 30], floors: [3, 3], fh: 5, shapes: ['towerFront'], roofs: ['hip'], fac: 'classic', kind: 'office', setback: 4,
                  wall: [B.LIMESTONE, B.ASHLAR, B.BRICK], accent: [B.ASHLAR, B.PAINT_WHITE], roof: [B.ROOF_DARK, B.COPPER] },
  museum:       { name: 'museum', lot: [40, 60], depth: [30, 44], floors: [2, 4], fh: 5, shapes: ['stepped', 'round', 'L'], roofs: ['flat', 'green'], fac: 'museum', kind: 'museum', setback: 5,
                  wall: [B.MARBLE, B.PANEL_WHITE, B.CONCRETE, B.TERRACOTTA, B.COPPER], accent: [B.GLASS, B.DARKGLASS], roof: [B.CONCRETE] },
  studentenhuis:{ name: 'studentenwoningen', lot: [24, 34], depth: [12, 16], floors: [4, 7], fh: 3, shapes: ['rect', 'L'], roofs: ['flat'], fac: 'student', kind: 'apartment', setback: 2,
                  wall: [B.PANEL_WHITE, B.PLASTER_GREY, B.BRICK], accent: [B.PAINT_ORANGE, B.PAINT_GREEN, B.PAINT_BLUE, B.PAINT_YELLOW, B.PAINT_RED], roof: [B.CONCRETE] },
  campus:       { name: 'campusgebouw', lot: [40, 60], depth: [24, 36], floors: [3, 6], fh: 4, shapes: ['L', 'U', 'stepped'], roofs: ['flat', 'green'], fac: 'office', kind: 'campus', setback: 4,
                  wall: [B.BRICK, B.CONCRETE, B.PANEL_WHITE], accent: [B.GLASS, B.GLASS_GREEN], roof: [B.CONCRETE] },
  rijtjesModern:{ name: 'moderne rijwoningen', lot: [6, 8], depth: [10, 12], floors: [2, 3], fh: 3, shapes: ['rows'], roofs: ['flat'], fac: 'villa', kind: 'house', attached: true,
                  wall: [B.PAINT_WHITE, B.BRICK_DARK, B.DARK_PLANKS, B.PLASTER_GREY], accent: [B.PANEL_DARK, B.DARK_PLANKS], roof: [B.CONCRETE] },
  chalet:       { name: 'chalet', lot: [14, 20], depth: [9, 12], floors: [2, 3], fh: 3, shapes: ['rect'], roofs: ['gable'], fac: 'chalet', kind: 'chalet', setback: 3, balc: 1,
                  wall: [B.DARK_PLANKS, B.LOG, B.PLANKS], accent: [B.ASHLAR, B.PLASTER], roof: [B.ROOF_DARK, B.CLAY_ROOF] },
  tropenvilla:  { name: 'tropische villa', lot: [16, 22], depth: [10, 13], floors: [1, 2], fh: 3, shapes: ['L', 'rect'], roofs: ['flat', 'hip'], fac: 'villa', kind: 'villa', setback: 4,
                  wall: [B.PLASTER, B.PLASTER_BEIGE, B.PAINT_WHITE, B.PLASTER_PINK], accent: [B.PLANKS, B.DARK_PLANKS], roof: [B.ROOF_GREEN, B.CLAY_ROOF, B.CONCRETE] },
};
export const FAMILY_COUNT = Object.keys(FAMILIES).length;

// ---------- welke families in welke wijk (gewicht) ----------
export function familyMix(akind, dens, style, capital) {
  if (akind === 'cbd') return [['wolkenkrabber', 5], ['kantoor', 3], ['hotel', 1.4], ['woontoren', 1.4], ['winkelcentrum', 0.5], ['parkeergarage', 0.5], ['museum', 0.2]];
  if (akind === 'oldtown') return [['herenhuis', 4], ['gevelhuis', 3.5], ['winkelpand', 3], ['kerk', 0.12], ['stadhuis', 0.05], ['hotel', 0.2]];
  if (akind === 'harbour') return [['magazijn', 4], ['fabriek', 2.5], ['kantoor', 0.6], ['parkeergarage', 0.3]];
  if (akind === 'campus') return [['campus', 4], ['studentenhuis', 3], ['sporthal', 0.6], ['museum', 0.4], ['appartement', 0.8]];
  if (akind === 'mixed') return [['winkelpand', 3], ['appartement', 3], ['kantoor', 1.2], ['winkelcentrum', 0.4], ['parkeergarage', 0.3], ['hotel', 0.3], ['school', 0.2]];
  if (style === 'berg') return dens > 0.5 ? [['chalet', 3], ['hotel', 0.6], ['winkelpand', 1.4]] : [['chalet', 4], ['vrijstaand', 0.6]];
  if (style === 'tropisch') return dens > 0.6 ? [['appartement', 3], ['winkelpand', 1.5], ['tropenvilla', 1.5]] : [['tropenvilla', 4], ['moderneVilla', 1.5]];
  if (dens > 0.8) return capital ? [['hofblok', 3], ['appartement', 3], ['winkelpand', 2], ['woontoren', 0.6], ['kantoor', 0.6], ['school', 0.15], ['parkeergarage', 0.1]]
                             : [['appartement', 3], ['winkelpand', 3], ['herenhuis', 1.4], ['kantoor', 0.5], ['school', 0.15]];
  if (dens > 0.55) return [['rijhuis', 3], ['herenhuis', 1.4], ['appartement', 2], ['winkelpand', 1.2], ['rijtjesModern', 1.2], ['school', 0.2], ['sporthal', 0.05]];
  if (dens > 0.35) return [['rijhuis', 2.5], ['halfopen', 2], ['vrijstaand', 1.6], ['rijtjesModern', 1], ['appartement', 0.6], ['school', 0.1]];
  return [['vrijstaand', 3], ['halfopen', 1.3], ['moderneVilla', 1], ['rijhuis', 0.5]];
}
export function chooseFamily(mix, r) {
  let tot = 0; for (const [, w] of mix) tot += w;
  let x = r * tot; for (const [f, w] of mix) { x -= w; if (x <= 0) return f; }
  return mix[mix.length - 1][0];
}

// ---------- het plan van een gebouw (eenmaal per gebouw) ----------
const PLANS = new Map();
export function planOf(b) {
  const key = b.id + ':' + b.x0 + ':' + b.z0;
  let p = PLANS.get(key); if (p) return p;
  if (PLANS.size > 30000) PLANS.clear();
  p = makePlan(b); PLANS.set(key, p); return p;
}
function makePlan(b) {
  const F = FAMILIES[b.fam], R = (k) => hash(b.id | 0, (b.x0 * 7 + b.z0) | 0, 900 + k);
  const W = b.x1 - b.x0, D = b.z1 - b.z0, fh = F.fh;
  const floors = b.floors, H = floors * fh;
  const front = b.face; // 'z0' (noordkant) of 'z1'
  const shape = b.shape || pick(F.shapes, R(1)), roof = b.roof || pick(F.roofs, R(2));
  const wall = pick(F.wall, R(3)), accent = pick(F.accent, R(4)), roofMat = pick(F.roof, R(5));
  const glass = F.fac === 'curtain' ? wall : (F.fac === 'gevel' || F.fac === 'classic') ? B.GLASS : pick([B.GLASS, B.GLASS, B.GLASS_BLUE, B.DARKGLASS], R(6));
  const distFront = (lz) => front === 'z0' ? lz : D - lz;
  // per kolom de hoogte (0 = geen gebouw)
  let height;
  const wingD = Math.max(8, Math.min(14, Math.round(D * 0.38))), wingW = Math.max(8, Math.min(14, Math.round(W * 0.35)));
  switch (shape) {
    case 'L': { const side = R(7) < 0.5; height = (lx, lz) => distFront(lz) <= wingD || (side ? lx <= wingW : lx >= W - wingW) ? H : 0; break; }
    case 'U': height = (lx, lz) => distFront(lz) <= wingD || lx <= wingW || lx >= W - wingW ? H : 0; break;
    case 'court': { const ring = Math.max(8, Math.min(13, Math.round(Math.min(W, D) * 0.3))); height = (lx, lz) => lx <= ring || lx >= W - ring || lz <= ring || lz >= D - ring ? H : 0; break; }
    case 'stepped': { const s1 = Math.max(3, Math.round(Math.min(W, D) * 0.14)), f1 = Math.max(1, Math.round(floors * (0.45 + R(8) * 0.2))); height = (lx, lz) => { const e = Math.min(lx, W - lx, lz, D - lz); return e < s1 ? f1 * fh : e < 2 * s1 ? Math.round((f1 + floors) / 2) * fh : H; }; break; }
    case 'podium': { const pf = 2 + Math.floor(R(9) * 3), ins = Math.max(4, Math.round(Math.min(W, D) * 0.18)); height = (lx, lz) => Math.min(lx, W - lx, lz, D - lz) < ins ? pf * fh : H; break; }
    case 'round': { const cx = W / 2, cz = D / 2, rr = Math.min(W, D) / 2 - 0.5, podium = R(10) < 0.5 ? 2 * fh : 0; height = (lx, lz) => { const d = Math.hypot(lx - cx, lz - cz); return d <= rr ? H : podium; }; break; }
    case 'twin': { const gap = R(11) < 0.5 ? 0 : 3; height = (lx, lz) => distFront(lz) <= D && (Math.abs(lx - W / 2) >= gap / 2) ? H : 0; break; }
    case 'church': { const tw = Math.max(6, Math.round(W * 0.3)), tc = W / 2; height = (lx, lz) => { const f = distFront(lz); if (Math.abs(lx - tc) <= tw / 2 && f <= tw) return H + 22; return Math.abs(lx - tc) <= W * 0.32 || (f > D * 0.55 && f < D * 0.7) ? H : 0; }; break; }
    case 'towerFront': { const tw = 6, tc = W / 2; height = (lx, lz) => Math.abs(lx - tc) <= tw / 2 && distFront(lz) <= tw ? H + 14 : H; break; }
    case 'rows': default: { // één eenheid (rijhuis, gevelhuis …): volle breedte, diepte vanaf de straat
      height = (lx, lz) => distFront(lz) <= D ? H : 0;
    }
  }
  { const raw = height; height = (lx, lz) => (lx < 0 || lz < 0 || lx > W || lz > D) ? 0 : raw(lx, lz); }
  // hoekgebouw: een eenheid aan het einde van een straat krijgt een hoektoren (afgeronde of verhoogde hoek)
  if (b.corner && (F.fac === 'classic' || F.fac === 'modern' || F.fac === 'shop')) {
    const base = height, cs = b.corner;
    height = (lx, lz) => { const h = base(lx, lz); if (!h) return 0; const ex = cs < 0 ? lx : W - lx; return ex < 5 && distFront(lz) < 6 ? h + 2 * fh : h; };
  }
  const p = { F, fam: b.fam, W, D, fh, floors, H, front, shape, roof, wall, accent, roofMat, glass, height, distFront,
    balc: F.balc && R(12) < F.balc, ridgeX: W >= D, units: 1, seed: R(13),
    win: 2 + Math.floor(R(14) * 2), pitch: roof === 'gable' ? 0.75 : 0.6, door: Math.round(W / 2), chimney: F.chimney && R(15) < F.chimney };
  // rijen (smalle eenheden): nok loodrecht op de straat, deur en ramen per eenheid
  if (shape === 'rows') { p.ridgeX = false; p.door = 1 + Math.floor(R(16) * Math.max(1, W - 2)); }
  return p;
}

// ---------- een kolom van een gebouw ----------
// geeft de bovenkant terug, of -1 als deze kolom buiten het gebouw ligt (tuin, binnenhof)
export function archColumn(b, F, x, z, col, top, interior) {
  const p = planOf(b), lx = x - b.x0, lz = z - b.z0;
  const h = p.height(lx, lz);
  if (!h) return balconyColumn(b, p, F, lx, lz, col, top);
  const hN = [p.height(lx - 1, lz), p.height(lx + 1, lz), p.height(lx, lz - 1), p.height(lx, lz + 1)];
  // fundering en vloer
  for (let y = Math.max(1, Math.min(top, F) - 3); y < F; y++) col[y] = y <= top - 4 ? (col[y] || B.STONE) : B.ASHLAR;
  for (let y = F + 1; y <= top; y++) col[y] = 0;
  col[F] = p.F.kind === 'parking' ? B.ASPHALT : p.F.kind === 'church' ? B.CHECKER : p.F.fac === 'curtain' || p.F.fac === 'hotel' || p.F.fac === 'mall' ? B.MARBLE : B.PLANKS;
  const minN = Math.min(...hN);
  const frontEdge = p.distFront(lz) === 0, isFrontWall = (p.front === 'z0' ? hN[2] : hN[3]) === 0;
  for (let y = F + 1; y <= F + h - 1; y++) {
    const rel = y - F, lvl = rel - 1, fl = Math.floor(lvl / p.fh), inLvl = lvl % p.fh;
    // buitenmuur op deze hoogte? (een buur is lager of er is geen buur)
    const ext = minN < rel;
    if (!ext) {
      if (inLvl === p.fh - 1 && y + 1 < F + h) col[y + 1] = p.F.kind === 'parking' ? B.CONCRETE : p.F.fac === 'curtain' ? B.CONCRETE : B.PLANKS;
      const it = p.F.kind === 'parking' ? parkingInside(p, lx, lz, inLvl, fl) : p.F.kind === 'church' ? churchInside(p, lx, lz, rel) : interior(b, x, z, fl, inLvl, p.fh);
      if (it) col[y] = it;
      continue;
    }
    // richting van de gevel: langs x of langs z
    const alongZ = hN[0] < rel || hN[1] < rel, along = alongZ ? lz : lx, corner = (hN[0] < rel || hN[1] < rel) && (hN[2] < rel || hN[3] < rel);
    // voordeur(en) op de straatkant
    if (fl === 0 && isFrontWall && frontEdge && inLvl < 2 && Math.abs(lx - p.door) <= (p.W > 20 ? 1 : 0)) { col[y] = p.F.fac === 'curtain' || p.F.fac === 'office' || p.F.fac === 'hotel' || p.F.fac === 'mall' || p.F.fac === 'shop' || p.F.fac === 'museum' ? B.DOOR_GLASS : inLvl === 0 ? B.DOOR : B.DOOR_TOP; continue; }
    if (p.F.kind === 'parking' && fl === 0 && isFrontWall && frontEdge && Math.abs(lx - p.door) <= 2 && inLvl < 2) { col[y] = 0; continue; } // inrit
    col[y] = facade(p, fl, inLvl, along, corner, rel, isFrontWall && frontEdge, lx);
  }
  return roofColumn(b, p, F, lx, lz, h, hN, col, top);
}

// het gevelpatroon per familie
function facade(p, fl, inLvl, along, corner, rel, front, lx) {
  const W = p.wall, A = p.accent, G = p.glass, fh = p.fh, top = rel >= p.H - 1, a = ((along % 60) + 60) % 60;
  switch (p.F.fac) {
    case 'curtain': // vliesgevel: glas met stijlen om de 3 m en een donkere band per verdieping
      if (corner) return A;
      if (inLvl === fh - 1) return fl === 0 ? A : (a % 3 === 0 ? A : W);
      if (fl === 0) return a % 6 === 0 ? A : B.GLASS;
      return a % 3 === 0 && p.seed < 0.5 ? A : W;
    case 'office': // liggende banden: glas en natuursteen
      if (corner) return W;
      if (fl === 0) return a % 5 === 0 ? W : B.GLASS;
      return inLvl <= 1 && a % 4 !== 0 ? A : W;
    case 'hotel': // staande lamellen, donkere sokkel
      if (fl <= 1) return a % 4 === 0 ? W : A;
      return a % 2 === 0 ? W : (inLvl === fh - 1 ? W : A);
    case 'residentialTower':
      if (corner) return A;
      return inLvl === fh - 1 ? W : a % 4 === 0 ? W : B.GLASS;
    case 'modern': { // lintramen met gekleurde panelen
      if (fl === 0 && p.F.kind !== 'apartment') return a % 4 === 0 ? W : G;
      if (inLvl === fh - 1) return W;
      const panel = a % 8 === 3 && p.seed > 0.4;
      return panel ? A : (a % 4 === 0 ? W : (inLvl === 1 || inLvl === 0 && a % 4 === 2 ? G : W)); }
    case 'classic': { // herenhuis, hofblok, stadhuis: plint, hoge ramen, kroonlijst en lijsten tussen de verdiepingen
      if (fl === 0 && inLvl === 0 && !(a % 3 === 1)) return B.ASHLAR;
      if (top || inLvl === fh - 1) return A;
      if (corner) return A;
      const win = a % 3 === 1 && inLvl >= 1 && inLvl <= Math.max(1, fh - 2);
      return win ? G : W; }
    case 'gevel': // Nederlandse gevel: donkere baksteen, witte kozijnen, hoge ramen
      if (corner) return W;
      if (inLvl === fh - 1) return a % 3 === 1 ? A : W;
      if (fl === 0 && a % 3 !== 0) return inLvl === 0 && a % 3 === 2 ? A : G;
      return a % 3 !== 0 ? (inLvl === 0 ? A : G) : W;
    case 'brick': // rijhuis
      if (corner) return W;
      if (inLvl === fh - 1) return fl === 0 ? A : W;
      return (a % 4 === 1 || a % 4 === 2) && inLvl === 1 ? G : W;
    case 'house':
      if (corner) return W;
      return a % 4 === 1 && inLvl === 1 ? G : (a % 4 === 2 && inLvl === 1 ? A : W);
    case 'villa': // grote glaspartijen en houten delen
      if (corner) return A;
      return a % 6 < 3 && inLvl < fh - 1 ? G : (a % 6 === 4 ? A : W);
    case 'chalet':
      if (fl === 0) return inLvl === 1 && a % 4 === 2 ? G : A;
      return inLvl === 1 && a % 3 === 1 ? G : W;
    case 'shop': // winkelpui op de begane grond, gekleurde luifelband, ramen erboven
      if (fl === 0) return inLvl === fh - 1 ? A : (a === 0 ? W : G);
      if (inLvl === fh - 1 && top) return A;
      return a % 3 === 1 && inLvl === 1 ? G : W;
    case 'mall':
      if (fl === 0) return a % 8 < 5 ? G : W;
      return inLvl === fh - 1 ? A : (a % 16 < 4 ? A : W);
    case 'warehouse': // pakhuis: rondboogramen (vierkant), luiken in een kolom
      if (corner) return W;
      if (a % 12 === 6) return inLvl <= 2 ? B.DARK_PLANKS : A;
      return (a % 4 === 2) && inLvl === 2 ? G : W;
    case 'industrial':
      if (fl === 0 && a % 20 >= 8 && a % 20 <= 12 && inLvl <= 3) return B.PANEL_DARK; // roldeur
      return inLvl >= fh - 2 && a % 3 !== 0 ? G : (a % 10 === 0 ? A : W);
    case 'school':
      if (inLvl === fh - 1) return A;
      return a % 4 !== 0 && inLvl >= 1 ? G : W;
    case 'hall':
      return rel > p.H - 3 && a % 2 === 0 ? G : (rel < 3 ? A : W);
    case 'parking': // open gevel: borstwering, kolommen
      if (a % 8 === 0) return W;
      return inLvl === 0 ? (fl % 2 ? A : W) : 0;
    case 'church':
      if (a % 6 === 3 && rel > 2 && rel < p.H - 2) return B.GLASS_BLUE; // hoge glas-in-loodramen
      return corner || a % 6 === 0 ? A : W;
    case 'museum':
      return rel % 6 < 2 && a % 7 < 5 ? B.GLASS : W;
    case 'student':
      if (inLvl === fh - 1) return W;
      return a % 3 === 1 ? G : ((a + fl) % 5 === 0 ? A : W);
    default:
      return a % 3 === 1 && inLvl === 1 ? G : W;
  }
}

// dak, kroon, toren of dakterras
function roofColumn(b, p, F, lx, lz, h, hN, col, top) {
  const y0 = F + h, edge = hN.some(v => v < h);
  const ext = (dx, dz, max) => { for (let d = 1; d <= max; d++) if (p.height(lx + dx * d, lz + dz * d) < h || lx + dx * d < 0 || lz + dz * d < 0 || lx + dx * d > p.W || lz + dz * d > p.D) return d - 1; return max; };
  switch (p.roof) {
    case 'gable': case 'hip': case 'mansard': case 'stepGable': case 'neckGable': {
      // afstand tot de dakrand: loodrecht op de nok (zadeldak), of naar alle kanten (schilddak, mansarde)
      const across = p.ridgeX ? Math.min(ext(0, -1, 14), ext(0, 1, 14)) : Math.min(ext(-1, 0, 14), ext(1, 0, 14));
      const lengthwise = p.ridgeX ? Math.min(ext(-1, 0, 14), ext(1, 0, 14)) : Math.min(ext(0, -1, 14), ext(0, 1, 14));
      const d = p.roof === 'hip' || p.roof === 'mansard' ? Math.min(across, lengthwise) : across;
      let ry;
      if (p.roof === 'mansard') ry = y0 + Math.min(3, Math.floor(d * 1.6));
      else ry = y0 + Math.floor(d * p.pitch);
      // puntgevel (zadeldak): de muur loopt door tot onder het dak; trap- of halsgevel op de straatkant
      const gableEnd = (p.roof === 'gable' || p.roof === 'stepGable' || p.roof === 'neckGable') && lengthwise === 0;
      if (gableEnd) {
        let gy = ry;
        if (p.roof === 'stepGable') gy = y0 + Math.floor(across / 1) * 1 + (across % 2 === 0 ? 1 : 0);
        if (p.roof === 'neckGable') gy = across >= 1 ? y0 + Math.min(across * 2, 5) + (across >= 2 ? 3 : 0) : y0;
        for (let y = y0; y < gy; y++) col[y] = (y - y0) % 4 === 2 && across === 2 ? p.glass : p.wall;
        col[gy] = p.accent; return Math.max(gy, top);
      }
      for (let y = y0; y < ry; y++) col[y] = 0;
      col[ry] = p.roofMat;
      if (p.roof === 'mansard' && d === 1 && ((p.ridgeX ? lx : lz) % 4 === 2)) { col[ry - 1] = p.glass; col[ry] = p.roofMat; } // dakkapel
      if (p.chimney || (b.r2 > 0.6 && Math.abs((p.ridgeX ? lx : lz) - 3) < 1 && across === 1)) { col[ry + 1] = B.BRICK; col[ry + 2] = B.BRICK; return Math.max(ry + 2, top); }
      return Math.max(ry, top);
    }
    case 'sawtooth': { // sheddak met glas op de steile kant
      const t = ((lx % 8) + 8) % 8, ry = y0 + (t < 6 ? Math.floor(t / 2) : 0);
      col[y0] = p.roofMat; for (let y = y0 + 1; y <= ry; y++) col[y] = t === 5 ? p.roofMat : p.roofMat;
      if (t === 6 || t === 7) { col[y0 + 1] = B.GLASS; col[y0 + 2] = B.GLASS; }
      let tt = Math.max(ry, y0 + (t >= 6 ? 2 : 0));
      if (p.chimney && Math.abs(lx - p.W * 0.8) < 1.5 && Math.abs(lz - p.D * 0.5) < 1.5) { for (let y = y0; y <= y0 + 18; y++) col[y] = B.BRICK; tt = y0 + 18; }
      return Math.max(tt, top);
    }
    case 'barrel': { // gebogen dak (sporthal)
      const across = p.ridgeX ? Math.min(ext(0, -1, 30), ext(0, 1, 30)) : Math.min(ext(-1, 0, 30), ext(1, 0, 30)), R = (p.ridgeX ? p.D : p.W) / 2;
      const ry = y0 + Math.round(Math.sqrt(Math.max(0, R * R - (R - across) * (R - across))) * 0.35);
      for (let y = y0; y < ry; y++) col[y] = 0; col[ry] = p.roofMat; return Math.max(ry, top);
    }
    case 'crown': case 'spire': { // torenkroon: verlichte rand, technische ruimte en (soms) een spits
      col[y0] = p.roofMat;
      if (edge) { col[y0 + 1] = p.accent; col[y0 + 2] = (lx + lz) % 3 === 0 ? B.LAMP : p.accent; return Math.max(y0 + 2, top); }
      const cx = p.W / 2, cz = p.D / 2, d = Math.hypot(lx - cx, lz - cz);
      if (p.roof === 'spire' && d < 1.2) { for (let y = y0 + 1; y <= y0 + 30; y++) col[y] = y > y0 + 26 ? B.LAMP : B.METAL; return Math.max(y0 + 30, top); }
      if (d < Math.min(p.W, p.D) * 0.22) { for (let y = y0 + 1; y <= y0 + 6; y++) col[y] = y === y0 + 6 ? p.roofMat : B.PANEL_DARK; return Math.max(y0 + 6, top); }
      return Math.max(y0, top);
    }
    case 'parkingRoof': // parkeerdak
      col[y0] = B.ASPHALT; if (edge) { col[y0 + 1] = B.CONCRETE; return Math.max(y0 + 1, top); }
      if (lx % 6 === 0) col[y0] = B.LINE_WHITE;
      return Math.max(y0, top);
    case 'green': // groendak met rand
      col[y0] = edge ? p.roofMat : B.GRASS; if (!edge && (lx * 7 + lz) % 11 === 0) { col[y0 + 1] = B.HEDGE; return Math.max(y0 + 1, top); }
      if (edge) { col[y0 + 1] = p.accent; return Math.max(y0 + 1, top); }
      return Math.max(y0, top);
    case 'flatTerrace': // dakterras met glazen borstwering en een paar bakken groen
      col[y0] = edge ? p.roofMat : B.PLANKS; if (edge) { col[y0 + 1] = B.GLASS; return Math.max(y0 + 1, top); }
      if ((lx + lz * 3) % 13 === 0) { col[y0 + 1] = B.HEDGE; return Math.max(y0 + 1, top); }
      return Math.max(y0, top);
    case 'flat': default:
      col[y0] = p.roofMat;
      if (edge) { col[y0 + 1] = p.accent === B.GLASS ? p.wall : p.accent; return Math.max(y0 + 1, top); } // dakrand
      if (p.H > 15 && lx % 11 === 5 && lz % 9 === 4) { col[y0 + 1] = B.METAL; col[y0 + 2] = B.METAL; return Math.max(y0 + 2, top); } // installaties
      if (p.F.kind === 'apartment' && (lx * 3 + lz) % 17 === 0) { col[y0 + 1] = B.SOLAR; return Math.max(y0 + 1, top); }
      return Math.max(y0, top);
  }
}

// balkons: aan de gevel (voor- of achterkant), in de ruimte van de kavel
function balconyColumn(b, p, F, lx, lz, col, top) {
  if (!p.balc) return -1;
  // de gevel ligt één stap verder richting gebouw
  let wallH = 0, along = 0;
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const h = p.height(lx + dx, lz + dz); if (h > wallH) { wallH = h; along = dx ? lz : lx; } }
  if (!wallH) return -1;
  if (((along % 6) + 6) % 6 > 3 || lx < 1 || lx > p.W - 1) return -1;
  let t = -1;
  for (let fl = 1; fl < Math.floor(wallH / p.fh); fl++) {
    const y = F + fl * p.fh; col[y] = B.CONCRETE; col[y + 1] = p.F.fac === 'classic' ? B.METAL : B.GLASS; col[y + 2] = 0; t = y + 1;
  }
  if (t < 0) return -1;
  for (let y = Math.max(1, top - 3); y < top; y++) col[y] = B.DIRT; // grond onder het balkon
  col[top] = B.GRASS;
  return Math.max(t, top);
}

// parkeergarage binnen: geparkeerde auto's in vakken
function parkingInside(p, lx, lz, inLvl) {
  if (inLvl > 1) return 0;
  const slot = ((lx % 3) + 3) % 3, row = ((lz % 12) + 12) % 12;
  if ((row >= 1 && row <= 4) || (row >= 7 && row <= 10)) { if (slot === 0) return 0; const c = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_WHITE, B.PAINT_BLACK, B.METAL, 0][Math.floor(hash(lx, lz, 931) * 6)]; return inLvl === 0 ? c : (c && row % 6 !== 1 && row % 6 !== 4 ? B.GLASS : 0); }
  return 0;
}
// kerk binnen: banken en een altaar
function churchInside(p, lx, lz, rel) {
  if (rel === 1) { const f = p.distFront(lz); if (f > 4 && f < p.D * 0.75 && ((lx % 3) + 3) % 3 !== 0 && Math.abs(lx - p.W / 2) > 1.5 && f % 2 === 0) return B.DARK_PLANKS; if (f > p.D * 0.85 && Math.abs(lx - p.W / 2) < 2) return B.MARBLE; }
  if (rel > p.H - 2 && lx % 5 === 0) return B.LAMP;
  return 0;
}
