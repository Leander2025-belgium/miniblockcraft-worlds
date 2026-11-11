// Treinnet van Greenisland voor rail.js: lijnen en stations uit het centrale netwerkmodel (green-net.js),
// diensten uit greenisland-data.js (canon en voorstellen), de spoorkaart en de internationale reizen.
import { LINES, LINE, STATIONS_ALL, TRACK, trackOffset } from './green-net.js';
import { groundAt, MW, ML, PEAKS, AREAS } from './greenisland.js';
import { SERVICES } from './greenisland-data.js';
import { B } from './blocks.js';

export const NET = {
  id: 'greenisland', LINES, LINE, STATIONS_ALL, TRACK, trackOffset, LIFTS: [], CROSSINGS: [], groundAt, MW, ML, SERVICES,
  liveries: { AX: [B.PAINT_GREEN, B.PAINT_WHITE], GS: [B.PAINT_WHITE, B.PAINT_GREEN], GI: [B.PAINT_GREEN, B.PAINT_YELLOW], GV: [B.PAINT_GREEN, B.PAINT_ORANGE], GR: [B.PAINT_WHITE, B.PAINT_BLUE], GB: [B.PAINT_RED, B.PAINT_WHITE] },
  mapImage: './assets/greenisland-map.jpg',
  mapLabels: [...PEAKS.map(p => [`▲ ${p.name} ${p.h}`, p.x, p.z]), ...AREAS.filter(a => a.kind === 'airport').map(a => ['✈ Munkbay Airport', a.x, a.z, '#dfe'])],
  // internationale treinen: aan het einde van de Noordzeetunnel reis je verder naar een echte stad
  international: { frankfurt: { name: 'Frankfurt am Main', id: 'frankfurt' }, amsterdam: { name: 'Amsterdam', city: 'Amsterdam' } },
};
