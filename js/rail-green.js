// Treinnet van Greenisland voor rail.js: lijnen en stations uit het centrale netwerkmodel (green-net.js),
// diensten uit greenisland-data.js (canon en voorstellen), de spoorkaart en de internationale reizen.
import { LINES, LINE, STATIONS_ALL, TRACK, trackOffset } from './green-net.js';
import { groundAt, MW, ML, PEAKS, AREAS } from './greenisland.js';
import { SERVICES as RAIL_SERVICES, METRO_SERVICES, METRO_LINES } from './greenisland-data.js';

const SERVICES = [...RAIL_SERVICES, ...METRO_SERVICES];
const MPAINT = { M1: B.PAINT_RED, M2: B.PAINT_BLUE, M3: B.PAINT_YELLOW, M4: B.PAINT_GREEN, M5: B.PAINT_GREEN, M6: B.PAINT_BLACK, M7: B.PAINT_RED, M8: B.PAINT_BLUE, M9: B.PAINT_ORANGE, M10: B.PAINT_WHITE };
const metroLiv = Object.fromEntries(Object.keys(METRO_LINES).map(id => ['M' + id.slice(1), [B.PAINT_WHITE, MPAINT[id]]]));
import { B } from './blocks.js';

export const NET = {
  id: 'greenisland', LINES, LINE, STATIONS_ALL, TRACK, trackOffset, LIFTS: [], CROSSINGS: [], groundAt, MW, ML, SERVICES,
  liveries: { AX: [B.PAINT_GREEN, B.PAINT_WHITE], GS: [B.PAINT_WHITE, B.PAINT_GREEN], GI: [B.PAINT_GREEN, B.PAINT_YELLOW], GV: [B.PAINT_GREEN, B.PAINT_ORANGE], GR: [B.PAINT_WHITE, B.PAINT_BLUE], GB: [B.PAINT_RED, B.PAINT_WHITE], ...metroLiv },
  mapImage: './assets/greenisland-map.jpg',
  mapLabels: [...PEAKS.map(p => [`▲ ${p.name} ${p.h}`, p.x, p.z]), ...AREAS.filter(a => a.kind === 'airport').map(a => ['✈ Munkbay Airport', a.x, a.z, '#dfe'])],
  // internationale treinen: aan het einde van de Noordzeetunnel reis je verder naar een echte stad
  international: { frankfurt: { name: 'Frankfurt am Main', id: 'frankfurt' }, amsterdam: { name: 'Amsterdam', city: 'Amsterdam' } },
};
