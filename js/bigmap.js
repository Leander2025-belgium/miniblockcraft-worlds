// Grote kaarten (kilometers) die in tegels van 128 m laden. Werkt voor elke plek op aarde.
import { REAL_GROUND } from './osm.js';

export const MAP_VERSION = 5; // verhogen als de omzetting verandert, zodat tegels opnieuw gemaakt worden
export const MZ = 110574;

// spec: { id, name, lat, lon, km }
export function makeMap(spec) {
  const tile = 128;
  const tiles = Math.max(2, Math.ceil((spec.km * 1000) / tile));
  const superTiles = 4; // downloads van ~500 m: klein genoeg om vlot en betrouwbaar te zijn
  return { ...spec, tile, tiles, superTiles, ground: REAL_GROUND, version: MAP_VERSION };
}
export function mapMX(m) { return 111320 * Math.cos(m.lat * Math.PI / 180); }
export function mapSize(m) { return m.tile * m.tiles; }
export function toBlocks(m, lat, lon) {
  const S = mapSize(m);
  return [(lon - m.lon) * mapMX(m) + S / 2, (m.lat - lat) * MZ + S / 2];
}
export function tileCenter(m, tx, tz) {
  const S = mapSize(m);
  const x = (tx + 0.5) * m.tile - S / 2, z = (tz + 0.5) * m.tile - S / 2;
  return { lat: m.lat - z / MZ, lon: m.lon + x / mapMX(m) };
}
export function superCount(m) { return Math.ceil(m.tiles / m.superTiles); }
export function superBox(m, sx, sz, margin = 40) {
  const S = mapSize(m), B = m.tile * m.superTiles, MX = mapMX(m);
  const x0 = sx * B - S / 2 - margin, x1 = Math.min((sx + 1) * B, S) - S / 2 + margin;
  const z0 = sz * B - S / 2 - margin, z1 = Math.min((sz + 1) * B, S) - S / 2 + margin;
  return { s: m.lat - z1 / MZ, n: m.lat - z0 / MZ, w: m.lon + x0 / MX, e: m.lon + x1 / MX };
}
export function spawnFor(m) {
  const S = mapSize(m);
  return { x: S / 2, y: REAL_GROUND + 45, z: S / 2, yaw: 0, pitch: 0.05, fly: true };
}
export const keys = {
  osm: (m, sx, sz) => `${m.id}-osm${m.superTiles}q2-${sx}-${sz}`,
  tile: (m, tx, tz) => `${m.id}-tile-v${m.version}-${tx}-${tz}`,
  edit: (m, tx, tz) => `${m.id}-edit-${tx}-${tz}`,
  player: (m) => `${m.id}-player`,
  prefix: (m) => `${m.id}-`,
};
