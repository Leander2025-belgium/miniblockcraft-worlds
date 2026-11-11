// GREENISLAND – centrale gegevens (aanpasbaar zonder de wereld te herprogrammeren).
// Coördinaten in meter: x van west (0) naar oost (145 000), z van noord (0) naar zuid (50 000). 1 blok = 1 m.
// canon: true  = eerder door de ontwerper vastgelegd (zie greenisland-canon.md)
// canon: false = voorlopig voorstel (mag later aangepast worden)

export const COUNTRY = {
  name: 'Greenisland', capital: 'Munkbay', lengthKm: 145, widthKm: 50, areaKm2: 7250, population: 15034500, places: 220,
  provinces: 5, currency: 'ViridCoin', airline: 'GreenAir', weather: 'GNMI', carMaker: 'Zenvo', postcode: 'G-XXXX', sea: 'Noordzee',
};
export const W = 145000, L = 50000, G = 12; // G = zeeniveau (water tot G-1)

// ---------- kustlijn (voorstel): middenlijn en halve breedte per x, plus baaien en schiereilanden ----------
export const COAST = {
  // [x, middenlijn z, halve breedte] – tussenliggende waarden worden geïnterpoleerd
  profile: [[0, 26000, 0], [3000, 26500, 9000], [9000, 25500, 15500], [22000, 24000, 19000], [40000, 25500, 20500], [52000, 27500, 18000], [64000, 25500, 21200],
    [80000, 24500, 21500], [96000, 25500, 19000], [108000, 24500, 20500], [122000, 26000, 20500], [134000, 26500, 17500], [141000, 26000, 11000], [144800, 26000, 0]],
  // baaien (water dat het land in komt) en schiereilanden (land dat uitsteekt): x, z, straal
  bays: [
    { name: 'Munkbaai', x: 141000, z: 31500, r: 5200, canon: false },
    { name: 'Zuidbaai', x: 76000, z: 48200, r: 3600, canon: false },
    { name: 'Westhaven', x: 3500, z: 30500, r: 3000, canon: false },
    { name: 'Groene Baai', x: 30000, z: 46600, r: 3000, canon: false },
    { name: 'Noordinham', x: 104000, z: 4300, r: 2600, canon: false },
  ],
  capes: [
    { name: 'Black Point', x: 90000, z: 3600, r: 2000, canon: false },
    { name: 'Kaap Northcliff', x: 60000, z: 3800, r: 1800, canon: false },
    { name: 'Easthaven-schiereiland', x: 139500, z: 13500, r: 3000, canon: false },
  ],
};

// ---------- provincies (Munkbay en Riverside in East Greenisland zijn canon; de grenzen zijn een voorstel) ----------
export const PROVINCES = [
  { id: 'W', name: 'West Greenisland', postcode: 1, color: '#7fb069', canon: true },
  { id: 'N', name: 'North Greenisland', postcode: 2, color: '#6aa8c4', canon: true },
  { id: 'C', name: 'Central Greenisland', postcode: 3, color: '#c4a36a', canon: true },
  { id: 'S', name: 'South Greenisland', postcode: 4, color: '#d07b5a', canon: true },
  { id: 'E', name: 'East Greenisland', postcode: 5, color: '#a77bd0', canon: true },
];
export const PROVINCE_BOUNDS = { west: 34000, east: 106000, north: 15500, south: 35000, canon: false };
export function provinceAt(x, z) {
  const B = PROVINCE_BOUNDS;
  if (x < B.west) return 'W';
  if (x > B.east) return 'E';
  if (z < B.north) return 'N';
  if (z > B.south) return 'S';
  return 'C';
}

// ---------- gebergte, rivieren, meren, regenwoud (voorstel) ----------
export const MOUNTAINS = [
  { name: 'Viridonia Gebergte', x: 76000, z: 18500, rx: 23000, rz: 9500, top: 2480, canon: true, canonNote: 'naam canon, ligging en hoogte voorstel' },
  { name: 'Westheuvels', x: 20000, z: 16000, rx: 9000, rz: 6000, top: 420, canon: false },
  { name: 'Kliffenrug', x: 58000, z: 6500, rx: 9000, rz: 3500, top: 380, canon: false },
];
export const PEAKS = [
  { name: 'Viridonia Piek', x: 76500, z: 17500, h: 2480, canon: false },
  { name: 'Silverpine Horn', x: 84500, z: 15500, h: 2190, canon: false },
  { name: 'Groene Wachter', x: 66000, z: 19500, h: 1960, canon: false },
];
export const RIVERS = [
  // punten van bron naar monding; breedte in m
  { name: 'Munk', w: 38, canon: false, pts: [[86000, 21000], [96000, 23500], [106000, 22500], [112000, 22800], [120000, 25500], [128500, 28500], [137000, 30500]] },
  { name: 'Viri', w: 26, canon: false, pts: [[70000, 24000], [68000, 30000], [62000, 35500], [56000, 41000], [52000, 46500], [50500, 50000]] },
  { name: 'Westbeek', w: 18, canon: false, pts: [[30000, 20000], [22000, 23000], [15000, 25500], [8000, 27000]] },
];
export const LAKES = [
  { name: 'Silvermeer', x: 80500, z: 21500, rx: 900, rz: 600, canon: false },
  { name: 'Groenmeer', x: 44000, z: 27000, rx: 1400, rz: 900, canon: false },
  { name: 'Noordermeer', x: 52000, z: 12000, rx: 1100, rz: 700, canon: false },
];
export const RAINFOREST = { name: 'Regenwoud', x: 56000, z: 39500, rx: 13000, rz: 6500, canon: true, canonNote: 'regenwoud canon (Rainforest City), ligging voorstel' };

// ---------- benoemde plaatsen (namen canon, ligging/status voorstel tenzij anders vermeld) ----------
// kind: capital, city, town, village; r = straal van de bebouwing in m
export const PLACES = [
  { name: 'Munkbay', kind: 'capital', x: 130500, z: 27500, r: 8200, prov: 'E', canon: true, note: 'hoofdstad in East Greenisland (canon); ca. 1,5 × Brussel', postcode: 'G-5000' },
  { name: 'Riverside', kind: 'city', x: 111500, z: 22000, r: 2600, prov: 'E', canon: true, note: 'East Greenisland (canon), aan de rivier (voorstel)' },
  { name: 'Westport', kind: 'city', x: 9500, z: 27500, r: 3200, prov: 'W', canon: true, note: 'grote havenstad' },
  { name: 'Rainforest City', kind: 'city', x: 55000, z: 38500, r: 2400, prov: 'S', canon: true, note: 'moderne stad bij het regenwoud' },
  { name: 'Silverpine', kind: 'town', x: 81500, z: 20500, r: 900, prov: 'C', canon: true, note: 'bergstad in het Viridonia Gebergte' },
  { name: 'Black Point', kind: 'village', x: 90000, z: 3000, r: 700, prov: 'N', canon: true, note: 'ruige kust, vuurtoren, wrak SS Viridonia (1923)' },
  { name: 'Northcliff', kind: 'town', x: 60000, z: 3400, r: 1300, prov: 'N', canon: true, note: 'noordelijke kustplaats met kliffen' },
  { name: 'Rodenberg', kind: 'town', x: 38000, z: 23500, r: 1500, prov: 'C', canon: true },
  { name: 'Viridonia', kind: 'city', x: 70000, z: 28500, r: 2200, prov: 'C', canon: true },
  { name: 'Greenport', kind: 'city', x: 31000, z: 42600, r: 2200, prov: 'S', canon: true, note: 'havenstad' },
  { name: 'Easthaven', kind: 'town', x: 137000, z: 14500, r: 1500, prov: 'E', canon: true },
  { name: 'Southbay', kind: 'town', x: 76000, z: 44000, r: 1700, prov: 'S', canon: true },
  { name: 'Northfield', kind: 'town', x: 44000, z: 11000, r: 1400, prov: 'N', canon: true },
];
// stadsdelen van Munkbay (namen canon; ligging voorstel) – dx, dz t.o.v. het centrum van Munkbay
export const MUNKBAY_AREAS = [
  { name: 'Munkbay Central', dx: 0, dz: 0, r: 1300, kind: 'cbd' },
  { name: 'Munkbay Old Town', dx: 2600, dz: 900, r: 1100, kind: 'oldtown' },
  { name: 'Munkbay Central Park', dx: -2300, dz: 1200, r: 800, kind: 'park' },
  { name: 'Munkbay University', dx: -4300, dz: 400, r: 900, kind: 'campus' },
  { name: 'Munkbay-Haven', dx: 6500, dz: 3000, r: 1800, kind: 'harbour' },
  { name: 'Munkbay-Noord', dx: 300, dz: -4600, r: 2600, kind: 'residential' },
  { name: 'Munkbay-Zuid', dx: -500, dz: 4800, r: 2600, kind: 'residential' },
  { name: 'Munkbay-West', dx: -6200, dz: 0, r: 2200, kind: 'residential' },
  { name: 'Munkbay-Oost', dx: 4600, dz: -2700, r: 1800, kind: 'residential' },
  { name: 'Eastside', dx: 5300, dz: -500, r: 1300, kind: 'mixed' },
  { name: 'Eastport Central', dx: 7400, dz: 300, r: 1000, kind: 'mixed' },
  { name: 'West Munkbay', dx: -7600, dz: 1500, r: 1600, kind: 'residential' },
  { name: 'Munkbay Strand', dx: 9000, dz: 5600, r: 1400, kind: 'beach' },
  { name: 'Munkbay-Airport', dx: -1500, dz: 9800, r: 2400, kind: 'airport' },
];
export const MUNKBAY_CANON_AREAS = ['Munkbay Central', 'Munkbay-Noord', 'Munkbay-Zuid', 'Munkbay-West', 'Munkbay-Oost', 'Munkbay-Haven', 'Munkbay Old Town', 'Munkbay University', 'Munkbay Central Park', 'Eastside', 'Eastport Central', 'West Munkbay'];

// ---------- nationale instellingen (namen canon, plaats voorstel) ----------
export const LANDMARKS = [
  { name: 'Nationaal Parlement van Greenisland', town: 'Munkbay', dx: 1600, dz: -700, w: 120, d: 70, floors: 5, kind: 'parliament', canon: true },
  { name: 'Presidentieel Paleis', town: 'Munkbay', dx: 2100, dz: 1800, w: 110, d: 60, floors: 4, kind: 'palace', canon: true },
  { name: 'GNMI – Greenislands Nationaal Meteorologisch Instituut', town: 'Munkbay', dx: -3500, dz: -1200, w: 60, d: 40, floors: 7, kind: 'office', canon: true },
  { name: 'Zenvo hoofdkantoor', town: 'Munkbay', dx: -5200, dz: 2600, w: 70, d: 50, floors: 14, kind: 'office', canon: true },
  { name: 'Zenvo autofabriek', town: 'Riverside', dx: 1800, dz: 900, w: 260, d: 140, floors: 3, kind: 'factory', canon: true },
  { name: 'Universiteit van Munkbay', town: 'Munkbay', dx: -4300, dz: 400, w: 140, d: 90, floors: 6, kind: 'university', canon: false },
  { name: 'Centraal Ziekenhuis Munkbay', town: 'Munkbay', dx: -1600, dz: -2300, w: 120, d: 80, floors: 9, kind: 'hospital', canon: false },
  { name: 'GreenAir hoofdkantoor', town: 'Munkbay', dx: -900, dz: 7600, w: 80, d: 50, floors: 8, kind: 'office', canon: true },
  { name: 'Nationale Bank (ViridCoin)', town: 'Munkbay', dx: 500, dz: 600, w: 60, d: 50, floors: 20, kind: 'office', canon: true },
  { name: 'Vuurtoren Black Point', town: 'Black Point', dx: 0, dz: -1500, w: 8, d: 8, floors: 14, kind: 'lighthouse', canon: true },
];
export const WRECK = { name: 'Wrak SS Viridonia (1923)', x: 91200, z: -200, canon: true };

// ---------- treinlijnen ----------
// stops: in volgorde; stations met dezelfde naam op verschillende lijnen vormen één station.
// Munkbay Central: lijnen lopen evenwijdig door het station (oost-west), met vaste sporen (canon: 1 ICE Frankfurt, 2 AX1, 3 ICE Amsterdam, 5 S1).
export const CENTRAL = { name: 'Munkbay Central', x: 130500, z: 27500, canon: true };
export const LINE_PLAN = {
  ICEF: { name: 'ICE Frankfurt', color: '#9b1b30', vmax: 69, rmin: 1200, tun: 10, high: true, international: 'frankfurt', platform: 1, canon: true,
    via: [{ name: 'Munkbay Central', x: 130500, z: 27440, dir: 0, len: 400, central: 1 }, { wp: true, x: 138000, z: 27440, dir: 0, len: 900 }, { name: 'Noordzeetunnel (grens)', x: 144600, z: 27440, dir: 0, len: 400, intl: true }] },
  AX1: { name: 'AX1 Airport Express', color: '#13a6a6', vmax: 44, rmin: 450, tun: 9, deep: 22, maxGrade: 0.04, platform: 2, canon: true,
    via: [{ name: 'Munkbay Central', x: 130500, z: 27455, dir: 180, len: 400, central: 2 }, { wp: true, x: 129400, z: 27455, dir: 180, len: 800 }, { name: 'Munkbay-Airport', x: 129000, z: 37300, len: 300 }] },
  ICEA: { name: 'ICE Amsterdam', color: '#c4261d', vmax: 69, rmin: 1200, tun: 10, high: true, international: 'amsterdam', platform: 3, canon: true,
    via: [{ name: 'Munkbay Central', x: 130500, z: 27470, dir: 0, len: 400, central: 3 }, { wp: true, x: 137000, z: 23500, len: 900 }, { name: 'Noordzeetunnel Noord (grens)', x: 144600, z: 21500, dir: 0, len: 400, intl: true }] },
  S1: { name: 'S1 Munkbay S-Bahn', color: '#2a9d4b', vmax: 25, rmin: 300, tun: 25, maxGrade: 0.045, platform: 5, canon: true, canonNote: 'stations en volgorde canon; ligging voorstel',
    via: [{ name: 'West Munkbay', x: 122700, z: 28900, len: 160 }, { name: 'Harbour', x: 124600, z: 29700, len: 160 }, { name: 'University', x: 126600, z: 29500, len: 160 },
      { name: 'Central Park', x: 128500, z: 28500, len: 160 }, { wp: true, x: 129500, z: 27500, dir: 0, len: 600 }, { name: 'Munkbay Central', x: 130500, z: 27500, dir: 0, len: 400, central: 5 }, { wp: true, x: 131500, z: 27500, dir: 0, len: 600 },
      { name: 'Old Town', x: 132900, z: 28000, len: 160 }, { name: 'Eastside', x: 135000, z: 27900, len: 160 }, { name: 'Eastport Central', x: 137100, z: 28500, len: 180 }] },
  IC1: { name: 'IC1 Oostkustlijn', color: '#1f6fd1', vmax: 44, rmin: 600, tun: 120, maxGrade: 0.035, canon: true, canonNote: 'naam canon, tracé voorstel',
    via: [{ name: 'Easthaven', x: 136500, z: 15500, len: 260 }, { name: 'Munkbay-Noord', x: 130900, z: 22700, len: 220 }, { wp: true, x: 129400, z: 27485, dir: 0, len: 800 }, { name: 'Munkbay Central', x: 130500, z: 27485, dir: 0, len: 400, central: 4 }, { wp: true, x: 131500, z: 27485, dir: 0, len: 600 },
      { name: 'Munkbay-Zuid', x: 130000, z: 32400, len: 220 }, { name: 'Kustdorp', x: 112000, z: 40500, len: 200 }, { name: 'Southbay', x: 76000, z: 43300, len: 260 }] },
  IC2: { name: 'IC2 Viridonia Express', color: '#e39a12', vmax: 44, rmin: 700, tun: 150, canon: true, canonNote: 'naam canon, tracé voorstel',
    via: [{ name: 'Munkbay Central', x: 130500, z: 27515, dir: 180, len: 400, central: 6 }, { wp: true, x: 129500, z: 27515, dir: 180, len: 600 }, { name: 'Munkbay-West', x: 124300, z: 27600, len: 220 }, { name: 'Riverside', x: 111500, z: 22600, len: 260 },
      { name: 'Viridonia', x: 70000, z: 28000, dir: 180, len: 300 }, { name: 'Rodenberg', x: 38000, z: 24200, len: 260 }, { name: 'Westport', x: 9500, z: 27000, len: 320 }] },
  IC3: { name: 'IC3 Noordlijn', color: '#5a4fcf', vmax: 39, rmin: 500, tun: 120, canon: false,
    via: [{ name: 'Westport', x: 9500, z: 26960, len: 320 }, { name: 'Northfield', x: 44000, z: 11600, len: 240 }, { name: 'Northcliff', x: 60000, z: 4200, len: 240 }, { name: 'Black Point', x: 89500, z: 3700, len: 180 }, { name: 'Easthaven', x: 136500, z: 15560, len: 260 }] },
  IR4: { name: 'IR4 Zuidlijn', color: '#d34f8a', vmax: 39, rmin: 500, tun: 120, canon: false,
    via: [{ name: 'Westport', x: 9500, z: 27040, len: 320 }, { name: 'Greenport', x: 31000, z: 42000, len: 260 }, { name: 'Rainforest City', x: 55000, z: 38000, len: 260 }, { name: 'Southbay', x: 76000, z: 43360, len: 260 }] },
  VB: { name: 'Silverpine Bergbahn', color: '#8a2be2', vmax: 12, rmin: 120, tun: 90, rack: true, maxGrade: 0.12, canon: false, canonNote: 'bergspoorweg naar Silverpine (Silverpine canon)',
    via: [{ name: 'Viridonia', x: 70000, z: 27965, dir: 0, len: 160 }, { name: 'Silverpine', x: 81500, z: 21200, len: 140 }] },
};
// diensten (canon: alleen wat eerder vastgelegd is; de rest voorstel). hours = [van, tot] in uren.
export const SERVICES = [
  { id: 'ICE-F', line: 'ICEF', name: 'ICE naar Frankfurt', liv: 'ICE', cars: ['iceHead', 'ice', 'ice', 'dining', 'ice', 'iceHead'], vmax: 69, h: 3600, acc: 0.8, international: 'frankfurt', canon: true, platform: { 'Munkbay Central': 1 } },
  { id: 'AX1', line: 'AX1', name: 'AX1 Airport Express', liv: 'AX', cars: ['emuCab', 'emuMid', 'emuCab'], vmax: 44, h: 900, acc: 1.0, canon: true, platform: { 'Munkbay Central': 2 } },
  { id: 'ICE-A', line: 'ICEA', name: 'ICE naar Amsterdam', liv: 'ICE', cars: ['iceHead', 'ice', 'ice', 'dining', 'ice', 'iceHead'], vmax: 69, h: 3600, acc: 0.8, international: 'amsterdam', canon: true, platform: { 'Munkbay Central': 3 } },
  { id: 'S1', line: 'S1', name: 'S1 Munkbay S-Bahn', liv: 'GS', cars: ['emuCab', 'emuMid', 'emuCab'], vmax: 25, h: 900, acc: 1.0, hours: [5, 24], canon: true, platform: { 'Munkbay Central': 5 } },
  { id: 'S1N', line: 'S1', name: 'S1 nachtdienst', liv: 'GS', cars: ['emuCab', 'emuCab'], vmax: 25, h: 3600, acc: 1.0, hours: [0, 5], canon: false },
  { id: 'IC1', line: 'IC1', name: 'IC1 Oostkustlijn', liv: 'GI', cars: ['loco', 'coach1', 'coach2', 'coach2', 'dining', 'coach2'], vmax: 44, h: 1800, canon: true, platform: { 'Munkbay Central': 4 } },
  { id: 'IC2', line: 'IC2', name: 'IC2 Viridonia Express', liv: 'GV', cars: ['loco', 'coach1', 'coach2', 'dining', 'coach2', 'coach2'], vmax: 44, h: 1800, canon: true, platform: { 'Munkbay Central': 6 } },
  { id: 'IC3', line: 'IC3', name: 'IC3 Noordlijn', liv: 'GI', cars: ['loco', 'coach1', 'coach2', 'coach2'], vmax: 39, h: 3600, canon: false },
  { id: 'IR4', line: 'IR4', name: 'IR4 Zuidlijn', liv: 'GR', cars: ['emuCab', 'emuMid', 'emuMid', 'emuCab'], vmax: 39, h: 3600, canon: false },
  { id: 'VB', line: 'VB', name: 'Silverpine Bergbahn', liv: 'GB', cars: ['rack', 'rack'], vmax: 12, h: 3600, acc: 0.5, canon: false },
  { id: 'NT', line: 'IC2', name: 'Nachttrein Westport–Munkbay', liv: 'EN', stops: ['Westport', 'Viridonia', 'Munkbay Central'], cars: ['loco', 'sleeper', 'sleeper', 'dining', 'coach2'], vmax: 39, h: 86400, hours: [22, 6], canon: false },
  { id: 'GW', line: 'IC2', name: 'Goederentrein Westport–Munkbay', liv: 'G', stops: [], cars: ['loco', 'box', 'tank', 'box', 'flat', 'box', 'tank'], vmax: 25, h: 7200, freight: true, acc: 0.35, canon: false },
];

// ---------- metro en tram (voorlopig: namen en frequenties M1–M3 en T1/T1s canon; de rest voorstel – nog niet gebouwd) ----------
export const METRO_PLAN = {
  canonFrequency: { M1: [15, '06:30', '23:00'], M2: [15, '06:30', '23:00'], M3: [15, '06:30', '23:00'] },
  lines: ['M1 Noord-Zuid', 'M2 West-Oost', 'M3 Ringlijn', 'M4 Havenlijn', 'M5 Binnenstad', 'M6 Express', 'M7 Zuidwest', 'M8 Universiteit', 'M9 Buitenring', 'M10 Haven–Expo'],
  stations: ['Munkbay-Centraal', 'Munkbay-Noord', 'Munkbay-Zuid', 'Munkbay-West', 'Munkbay-Oost', 'Munkbay-Haven', 'Forum', 'Universiteitsplein', 'Munkbay-Airport', 'Cargo-Terminal', 'Expo Munkbay'],
};
export const TRAM_PLAN = { lines: 15, canonFrequency: { T1: [15, '06:30', '23:00'], T1s: [15, '06:30', '23:00'] } };

// ---------- extra plaatsen: deterministisch gegenereerd (voorstel), samen ongeveer 220 bewoonde plaatsen ----------
const PRE = ['Groen', 'Oost', 'West', 'Zuid', 'Noord', 'Hoog', 'Laag', 'Berk', 'Eik', 'Linde', 'Wilg', 'Zand', 'Duin', 'Klif', 'Meer', 'Beek', 'Brug', 'Molen', 'Kerk', 'Ross', 'Ash', 'Elm', 'Fern', 'Glen', 'Kings', 'Mill', 'Oak', 'Rose', 'Stone', 'Brook', 'Marsh', 'Moor', 'Pine', 'Silver', 'Gold', 'Red', 'Black', 'White', 'Ember', 'Lark', 'Wren', 'Hazel', 'Heide', 'Veen', 'Vos', 'Ree', 'Valk', 'Zon', 'Maan', 'Ster'];
const SUF = ['dorp', 'veld', 'dal', 'burg', 'berg', 'wijk', 'hoven', 'broek', 'loo', 'rode', 'ton', 'ford', 'field', 'wood', 'bridge', 'bury', 'ham', 'stead', 'vale', 'mouth', 'haven', 'cliff', 'hill', 'gate', 'kerke', 'zande', 'hout', 'meer'];
export function generatedPlaceName(i) {
  const h = (a) => { const x = Math.imul((i * 2654435761 + a * 97) | 0, 1597334677) >>> 0; return (x ^ (x >>> 15)) >>> 0; };
  const pre = PRE[h(1) % PRE.length]; let suf = SUF[h(2) % SUF.length];
  if (suf.startsWith(pre.toLowerCase().slice(0, 3))) suf = SUF[(h(2) + 7) % SUF.length]; // geen 'Meermeer'
  return pre + suf;
}
export const GENERATED_TARGET = 207;
