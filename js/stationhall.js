// Stations 3.0: inrichting van een stationshal (Alpen: houten stationsgebouwen in chaletstijl).
// u = langs de voorgevel (0..W), v = diepte vanaf de voorgevel (0..D), ly = hoogte boven de vloer (1 = vloerhoogte).
// Indeling van links naar rechts: wachtruimte achter glas met banken en vertrekbord · loketten en
// ticketautomaten · (doorgang van de ingang naar de perrondeur) · kiosk met rekken · café met tafels en stoelen ·
// toiletten in de hoek achteraan. Het vertrekbord (bord) toont echte vertrektijden (E, js/rail.js signText).
import { B } from './blocks.js';

export function hallBlock(u, v, W, D, ly, style = 'alpen') {
  const mid = W / 2, wood = style === 'alpen';
  if (Math.abs(u - mid) <= 2) return ly === 2 && v === D - 1 && u === Math.round(mid) - 2 ? B.SIGN : -1; // doorgang, vertrekbord aan de achterwand
  const wr = Math.round(W * 0.25), ca = Math.round(W * 0.72);
  // wachtruimte (glazen wand met deur)
  if (u === wr) return Math.abs(v - Math.round(D / 2)) <= 1 ? -1 : B.GLASS;
  if (u < wr) {
    if (ly === 2 && v === D - 1 && u === Math.round(wr / 2)) return B.SIGN;
    if (ly === 1 && u >= 1 && u <= wr - 2 && v % 3 === 1 && v < D - 1) return wood ? B.CHAIR : B.CHAIR_RED;
    if (ly === 1 && u === 1 && v === D - 1) return B.PLANTER;
    return -1;
  }
  // loketten en automaten
  if (u < mid - 2) {
    if (v === D - 2 && ly === 1) return B.COUNTER;
    if (v === D - 1 && ly === 2 && u % 3 === 0) return B.SIGN;
    if (v === 1 && ly === 1 && u % 3 === 1) return B.TICKET;
    return -1;
  }
  // kiosk
  if (u < ca) {
    if (v === D - 1) return B.SHELF;
    if (v === D - 3 && ly === 1 && u > mid + 3 && u < ca - 1) return B.COUNTER;
    if (v === 1 && ly === 1 && u === ca - 1) return B.CRATE;
    return -1;
  }
  // toiletten in de hoek achteraan (twee hokjes met deuropening)
  if (u >= W - 4 && v >= D - 4) {
    if (u === W - 4 || v === D - 4) return (u === W - 4 && v === D - 2) || (v === D - 4 && u === W - 2) ? -1 : (wood ? B.WALL_WOOD : B.PANEL_WHITE);
    if (ly === 1 && v === D - 1 && u === W - 1) return B.TOILET;
    if (ly === 1 && v === D - 1 && u === W - 3) return B.TOILET;
    if (ly === 1 && v === D - 3 && u === W - 1) return B.SINK;
    return -1;
  }
  // café
  if (ly === 1 && u === W - 1 && v <= 3) return B.COUNTER;
  if (ly === 2 && u === W - 1 && v === 2) return B.STOVE;
  if (ly === 1 && (u - ca) % 3 === 1 && v % 3 === 1 && v < D - 4) return B.TABLE;
  if (ly === 1 && (u - ca) % 3 === 1 && v % 3 === 2 && v < D - 4) return B.CHAIR;
  if (ly === 1 && (u - ca) % 3 === 0 && v % 3 === 1 && v < D - 4 && u > ca) return B.CHAIR;
  return -1;
}
// vloer per zone (café en wachtruimte in hout, de rest marmer)
export function hallFloor(u, v, W, D) {
  const wr = Math.round(W * 0.25), ca = Math.round(W * 0.72);
  if (u < wr || (u >= ca && !(u >= W - 4 && v >= D - 4))) return B.PARQUET;
  if (u >= W - 4 && v >= D - 4) return B.TILE;
  return B.MARBLE;
}
