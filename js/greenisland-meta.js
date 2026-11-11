// Licht: alleen wat het menu en de opslag over Greenisland moeten weten (zonder de wereld te berekenen).
import { W as MW, L as ML, G, COUNTRY } from './greenisland-data.js';
const T = 128;
export const META = {
  id: 'greenisland', name: 'Greenisland', kind: 'proc', tile: T,
  tilesX: Math.ceil(MW / T), tilesZ: Math.ceil(ML / T), tiles: Math.ceil(MW / T),
  ground: G, version: 2, superTiles: 4, miniStep: 8, groundColor: [0.33, 0.48, 0.28], maxH: 3000, longView: 60000, smoothLod: true,
  greenisland: true, cityLod: true, viewModule: './greenview.js', railNet: './rail-green.js',
};
export { COUNTRY };
