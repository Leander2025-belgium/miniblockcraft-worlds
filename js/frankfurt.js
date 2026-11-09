// Vaste kaart: Frankfurt am Main, 2,5 × 2,5 km rond de binnenstad en de skyline.
import { REAL_GROUND } from './osm.js';

export const CITY = {
  id: 'frankfurt',
  name: 'Frankfurt am Main',
  lat: 50.1105, lon: 8.6690,   // middelpunt (tussen Messeturm, Bankenviertel en Römer)
  tile: 128, tiles: 20,        // 20 × 128 m = 2560 m
  superTiles: 4,               // één OpenStreetMap-download per 4 × 4 tegels (512 m)
  ground: REAL_GROUND,
  version: 2,                  // verhogen als de omzetting verandert, zodat tegels opnieuw gemaakt worden
};
export const MX = 111320 * Math.cos(CITY.lat * Math.PI / 180);
export const MZ = 110574;
export const SIZE = CITY.tile * CITY.tiles;

export function toBlocks(lat, lon) {
  return [(lon - CITY.lon) * MX + SIZE / 2, (CITY.lat - lat) * MZ + SIZE / 2];
}
export function tileCenter(tx, tz) {
  const x = (tx + 0.5) * CITY.tile - SIZE / 2, z = (tz + 0.5) * CITY.tile - SIZE / 2;
  return { lat: CITY.lat - z / MZ, lon: CITY.lon + x / MX };
}
export function superBox(sx, sz, margin = 60) {
  const S = CITY.tile * CITY.superTiles;
  const x0 = sx * S - SIZE / 2 - margin, x1 = (sx + 1) * S - SIZE / 2 + margin;
  const z0 = sz * S - SIZE / 2 - margin, z1 = (sz + 1) * S - SIZE / 2 + margin;
  return { s: CITY.lat - z1 / MZ, n: CITY.lat - z0 / MZ, w: CITY.lon + x0 / MX, e: CITY.lon + x1 / MX };
}

// Startplek: Willy-Brandt-Platz, tussen de torens, vliegend op 45 m
const [sx, sz] = toBlocks(50.1086, 8.6738);
export const SPAWN = { x: sx, y: REAL_GROUND + 45, z: sz, yaw: 0.35, pitch: 0.05, fly: true };

export const PLACES = [
  ['Commerzbank Tower', 50.1102, 8.6743], ['Messeturm', 50.1123, 8.6526], ['Main Tower', 50.1125, 8.6720],
  ['Römerberg', 50.1104, 8.6821], ['Kaiserdom', 50.1107, 8.6853], ['Alte Oper', 50.1159, 8.6723],
  ['Hauptbahnhof', 50.1071, 8.6635], ['Eiserner Steg', 50.1086, 8.6827], ['Hauptwache', 50.1139, 8.6788],
];
