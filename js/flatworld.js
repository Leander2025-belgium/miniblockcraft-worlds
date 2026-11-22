// TERRANOVA 16 fase 8 — lege bouwwereld: 4 × 4 km vlak gras om vanaf nul te bouwen met de bouwmodus en de
// wereldbouwer (wegen, spoor, terrein, beplanten). Onder het gras aarde, steen en bodemrots; aan de rand water.
// Eigen ID ('bouwwereld'), eigen opslag; verandert niets aan de andere werelden.
import { B } from './blocks.js';

export const T = 128, TILES = 32, SIZE = T * TILES, G = 64;
export const META = {
  id: 'bouwwereld', name: 'Lege bouwwereld', kind: 'proc', tile: T,
  tilesX: TILES, tilesZ: TILES, tiles: TILES,
  ground: G, version: 1, superTiles: 4, miniStep: 2, groundColor: [0.4, 0.62, 0.3], maxH: 400, bouwwereld: true,
};
export const SPAWN = { x: SIZE / 2 + 0.5, y: G + 2, z: SIZE / 2 + 0.5, yaw: 0, pitch: 0.2, fly: false };
const EDGE = 48; // water langs de rand
export function groundAt(x, z) { return Math.min(x, z, SIZE - x, SIZE - z) < EDGE ? G - 4 : G; }
export function zoneName(x, z) { return Math.min(x, z, SIZE - x, SIZE - z) < EDGE ? 'Rand (water)' : 'Bouwterrein'; }
export function generateTile(tx, tz) {
  const X0 = tx * T, Z0 = tz * T, Y0 = G - 16, H = 48, vox = new Uint8Array(T * T * H);
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    const top = groundAt(X0 + x, Z0 + z), base = (z * T + x) * H;
    for (let y = Y0; y <= top; y++) vox[base + y - Y0] = y === Y0 ? B.BEDROCK : y === top ? (top < G ? B.SAND : B.GRASS) : y > top - 3 ? B.DIRT : B.STONE;
    for (let y = top + 1; y < G; y++) vox[base + y - Y0] = B.WATER;
  }
  const edge = new Int16Array(4 * T);
  for (let i = 0; i < T; i++) { edge[i] = groundAt(X0 - 1, Z0 + i); edge[T + i] = groundAt(X0 + T, Z0 + i); edge[2 * T + i] = groundAt(X0 + i, Z0 - 1); edge[3 * T + i] = groundAt(X0 + i, Z0 + T); }
  return { vox, H, y0: Y0, edge, ground: G, paths: [] };
}
