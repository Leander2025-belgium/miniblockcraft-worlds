// Vaste kaart: Frankfurt am Main, 2,5 × 2,5 km rond de binnenstad en de skyline.
import { makeMap, toBlocks as tb, mapSize } from './bigmap.js';
import { REAL_GROUND } from './osm.js';

export const CITY = makeMap({ id: 'frankfurt', name: 'Frankfurt am Main', lat: 50.1105, lon: 8.6690, km: 2.56 });
CITY.tiles = 20; CITY.superTiles = 4;
export const SIZE = mapSize(CITY);
export const toBlocks = (lat, lon) => tb(CITY, lat, lon);

// Startplek: Willy-Brandt-Platz, tussen de torens, vliegend op 45 m
const [sx, sz] = toBlocks(50.1086, 8.6738);
export const SPAWN = { x: sx, y: REAL_GROUND + 45, z: sz, yaw: 0.35, pitch: 0.05, fly: true };

export const PLACES = [
  ['Commerzbank Tower', 50.1102, 8.6743], ['Messeturm', 50.1123, 8.6526], ['Main Tower', 50.1125, 8.6720],
  ['Römerberg', 50.1104, 8.6821], ['Kaiserdom', 50.1107, 8.6853], ['Alte Oper', 50.1159, 8.6723],
  ['Hauptbahnhof', 50.1071, 8.6635], ['Eiserner Steg', 50.1086, 8.6827], ['Hauptwache', 50.1139, 8.6788],
];
