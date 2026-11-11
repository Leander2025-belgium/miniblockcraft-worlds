// Treinnet van de Alpenwereld voor rail.js (lijnen, stations, diensten en de spoorkaart).
import { LINES, LINE, STATIONS_ALL, TRACK } from './alpen-net.js';
import { trackOffset, LIFTS, PATCHES, HEMEL, MW, ML, SUMMIT_XZ, STATIONS as CABLE_ST, CROSSINGS, groundAt } from './alpen.js';

export const SERVICES = [
  { id: 'ICE', line: 'HSL', name: 'ICE', liv: 'ICE', cars: ['iceHead', 'ice', 'ice', 'dining', 'ice', 'iceHead'], vmax: 69, h: 1200, acc: 0.8 },
  { id: 'IC', line: 'NZ', name: 'IC Noord-Zuid', liv: 'IC', stops: ['Sneeuwbrück', 'Grenspas', 'Reuzenberg Hauptbahnhof', 'Hemelpoort'], cars: ['loco', 'coach1', 'coach2', 'dining', 'coach2', 'coach2'], vmax: 39, h: 1800 },
  { id: 'AE', line: 'AE', name: 'IC Alpenexpress', liv: 'AE', stops: ['Wolkendorf', 'Reuzendal', 'Reuzenberg Hauptbahnhof', 'Oostpoort'], cars: ['loco', 'coach1', 'coach2', 'dining', 'coach2'], vmax: 44, h: 3600 },
  { id: 'RB', line: 'AE', name: 'Reuzenberg Bahn', liv: 'RB', cars: ['emuCab', 'emuMid', 'emuCab'], vmax: 33, h: 3600, acc: 0.9 },
  { id: 'S1', line: 'NZ', name: 'S1', liv: 'S1', cars: ['emuCab', 'emuMid', 'emuCab'], vmax: 30, h: 1800, acc: 0.9 },
  { id: 'PE', line: 'PE', name: 'Panorama Express', liv: 'PE', cars: ['loco', 'panorama', 'panorama', 'dining', 'panorama'], vmax: 22, h: 3600 },
  { id: 'ZB', line: 'ZB', name: 'Zugspitzbahn', liv: 'ZB', cars: ['rack', 'rack'], vmax: 9, h: 1800, acc: 0.5 },
  { id: 'ME', line: 'ME', name: 'Matterhorn Express', liv: 'ME', cars: ['rackLoco', 'panorama', 'coach2'], vmax: 17, h: 3600, acc: 0.5 },
  { id: 'EN', line: 'AE', name: 'Nachttrein Alpenster', liv: 'EN', stops: ['Wolkendorf', 'Reuzenberg Hauptbahnhof', 'Oostpoort'], cars: ['loco', 'sleeper', 'sleeper', 'dining', 'coach2'], vmax: 36, h: 14400 },
  { id: 'GAE', line: 'AE', name: 'Goederentrein', liv: 'G', stops: [], cars: ['loco', 'box', 'tank', 'box', 'flat', 'box', 'tank', 'box'], vmax: 25, h: 7200, freight: true, acc: 0.35 },
  { id: 'GNZ', line: 'NZ', name: 'Goederentrein', liv: 'G', stops: [], cars: ['loco', 'flat', 'box', 'box', 'tank', 'flat', 'box'], vmax: 25, h: 7200, freight: true, acc: 0.35 },
];
export const NET = {
  id: 'alpen', LINES, LINE, STATIONS_ALL, TRACK, trackOffset, LIFTS, CROSSINGS, groundAt, MW, ML, SERVICES,
  mapImage: './assets/alpen-map.jpg',
  mapCables: [[CABLE_ST[0].x, CABLE_ST[0].z, CABLE_ST[1].x, CABLE_ST[1].z]],
  mapLabels: [['▲ Reuzenberg 2067', SUMMIT_XZ[0], SUMMIT_XZ[1]], ...PATCHES.map(P => [`▲ ${P.name} ${P.target}`, P.px, P.pz]), ['▲ Hemelhoorn 5000', HEMEL.x, HEMEL.z]],
};
