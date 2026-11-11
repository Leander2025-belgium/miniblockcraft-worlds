// Treinnet van Greenisland voor rail.js: lijnen en stations uit het centrale netwerkmodel (green-net.js),
// diensten uit greenisland-data.js (canon en voorstellen), de spoorkaart en de internationale reizen.
import { LINES as RAIL_LINES, TRACK, trackOffset, stationsOf } from './green-net.js';
import { groundAt, MW, ML, PEAKS, AREAS, BUS_LINES } from './greenisland.js';
import { SERVICES as RAIL_SERVICES, METRO_SERVICES, METRO_LINES, tramServices } from './greenisland-data.js';
import { TRAMS } from './greenisland-trams.js';

// bussen (voorstel): stads-, streek-, snel-, berg- en nachtbussen
const BUS_HOURS = { city: [5.5, 0.5], regional: [5.5, 23.5], express: [6, 22], mountain: [7, 20] };
const BUS_LIV = { city: 'BC', regional: 'BR', express: 'BX', mountain: 'BM' };
const busServices = BUS_LINES.flatMap(L => {
  const sv = [{ id: L.id, line: L.id, name: L.name, liv: BUS_LIV[L.bus] || 'BC', cars: ['bus'], vmax: L.plan.vmax, h: L.busH, acc: 1.0, hours: BUS_HOURS[L.bus], canon: false, bus: L.bus }];
  if (L.id === 'B3' || L.id === 'B6') sv.push({ id: 'N' + L.id.slice(1), line: L.id, name: 'N' + L.id.slice(1) + ' Nachtbus ' + L.name.replace(/^B\d+ /, ''), liv: 'BN', cars: ['bus'], vmax: L.plan.vmax, h: 3600, acc: 1.0, hours: [0.5, 5.5], canon: false, bus: 'night' });
  return sv;
});
const LINES = [...RAIL_LINES, ...BUS_LINES], LINE = Object.fromEntries(LINES.map(L => [L.id, L])), STATIONS_ALL = stationsOf(LINES);
const SERVICES = [...RAIL_SERVICES, ...METRO_SERVICES, ...tramServices(TRAMS), ...busServices];
const MPAINT = { M1: B.PAINT_RED, M2: B.PAINT_BLUE, M3: B.PAINT_YELLOW, M4: B.PAINT_GREEN, M5: B.PAINT_GREEN, M6: B.PAINT_BLACK, M7: B.PAINT_RED, M8: B.PAINT_BLUE, M9: B.PAINT_ORANGE, M10: B.PAINT_WHITE };
const metroLiv = Object.fromEntries(Object.keys(METRO_LINES).map(id => ['M' + id.slice(1), [B.PAINT_WHITE, MPAINT[id]]]));
import { B } from './blocks.js';

export const NET = {
  id: 'greenisland', title: '🚆 OV-kaart Greenisland (trein, metro, tram, bus)', LINES, LINE, STATIONS_ALL, TRACK, trackOffset, LIFTS: [], CROSSINGS: [], groundAt, MW, ML, SERVICES,
  liveries: { AX: [B.PAINT_GREEN, B.PAINT_WHITE], GS: [B.PAINT_WHITE, B.PAINT_GREEN], GI: [B.PAINT_GREEN, B.PAINT_YELLOW], GV: [B.PAINT_GREEN, B.PAINT_ORANGE], GR: [B.PAINT_WHITE, B.PAINT_BLUE], GB: [B.PAINT_RED, B.PAINT_WHITE], ...metroLiv, TR: [B.PAINT_WHITE, B.PAINT_GREEN], TS: [B.PAINT_GREEN, B.PAINT_YELLOW], BC: [B.PAINT_GREEN, B.PAINT_WHITE], BR: [B.PAINT_YELLOW, B.PAINT_GREEN], BX: [B.PAINT_BLUE, B.PAINT_WHITE], BM: [B.PAINT_RED, B.PAINT_WHITE], BN: [B.PAINT_BLACK, B.PAINT_YELLOW] },
  mapImage: './assets/greenisland-map.jpg',
  mapLabels: [...PEAKS.map(p => [`▲ ${p.name} ${p.h}`, p.x, p.z]), ...AREAS.filter(a => a.kind === 'airport').map(a => ['✈ Munkbay Airport', a.x, a.z, '#dfe'])],
  // internationale treinen: aan het einde van de Noordzeetunnel reis je verder naar een echte stad
  international: { frankfurt: { name: 'Frankfurt am Main', id: 'frankfurt' }, amsterdam: { name: 'Amsterdam', city: 'Amsterdam' } },
};
