// Blokdefinities voor Blokstad.
// Elk blok heeft een id (index), naam, kaartkleur en textuurinformatie.

export const B = {
  AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, ASPHALT: 4, LINE_WHITE: 5, LINE_YELLOW: 6,
  SIDEWALK: 7, BRICK: 8, CONCRETE: 9, GLASS: 10, DARKGLASS: 11, PLANKS: 12, LOG: 13,
  LEAVES: 14, WATER: 15, SAND: 16, ROOF_RED: 17, ROOF_DARK: 18, METAL: 19, BEDROCK: 20,
  LAMP: 21, PLASTER: 22, YELLOWBRICK: 23, PAINT_RED: 24, PAINT_BLUE: 25, PAINT_GREEN: 26,
  GRAVEL: 27, COBBLE: 28, TILE: 29, POST: 30, PAINT_ORANGE: 31, PAINT_BLACK: 32, FLOWERS: 33,
  PAINT_WHITE: 34, HEDGE: 35,
};

// tex: [boven, zijkant, onder] — tegelnamen uit textures.js
export const BLOCKS = [
  { id: 0, name: 'Lucht', color: [0, 0, 0] },
  { id: 1, name: 'Steen', color: [125, 125, 125], tex: ['stone'] },
  { id: 2, name: 'Aarde', color: [134, 96, 67], tex: ['dirt'] },
  { id: 3, name: 'Gras', color: [96, 160, 64], tex: ['grass_top', 'grass_side', 'dirt'] },
  { id: 4, name: 'Asfalt', color: [58, 60, 64], tex: ['asphalt'] },
  { id: 5, name: 'Witte streep', color: [225, 225, 225], tex: ['line_white', 'asphalt', 'asphalt'] },
  { id: 6, name: 'Gele streep', color: [230, 190, 40], tex: ['line_yellow', 'asphalt', 'asphalt'] },
  { id: 7, name: 'Stoeptegel', color: [170, 168, 160], tex: ['sidewalk'] },
  { id: 8, name: 'Baksteen', color: [160, 72, 54], tex: ['brick'] },
  { id: 9, name: 'Beton', color: [180, 180, 176], tex: ['concrete'] },
  { id: 10, name: 'Glas', color: [170, 210, 230], tex: ['glass'], transparent: true },
  { id: 11, name: 'Donker glas', color: [60, 90, 120], tex: ['darkglass'], transparent: true },
  { id: 12, name: 'Planken', color: [168, 128, 78], tex: ['planks'] },
  { id: 13, name: 'Boomstam', color: [100, 76, 48], tex: ['log_top', 'log', 'log_top'] },
  { id: 14, name: 'Bladeren', color: [56, 120, 40], tex: ['leaves'] },
  { id: 15, name: 'Water', color: [50, 100, 190], tex: ['water'], transparent: true, liquid: true },
  { id: 16, name: 'Zand', color: [220, 205, 150], tex: ['sand'] },
  { id: 17, name: 'Rode dakpan', color: [168, 60, 44], tex: ['roof_red'] },
  { id: 18, name: 'Leisteen dak', color: [70, 72, 80], tex: ['roof_dark'] },
  { id: 19, name: 'Metaal', color: [150, 158, 166], tex: ['metal'] },
  { id: 20, name: 'Grondgesteente', color: [40, 40, 40], tex: ['bedrock'] },
  { id: 21, name: 'Lamp', color: [255, 236, 160], tex: ['lamp'] },
  { id: 22, name: 'Witte gevel', color: [228, 224, 214], tex: ['plaster'] },
  { id: 23, name: 'Gele baksteen', color: [204, 170, 110], tex: ['yellowbrick'] },
  { id: 24, name: 'Rode verf', color: [190, 40, 40], tex: ['paint_red'] },
  { id: 25, name: 'Blauwe verf', color: [40, 80, 180], tex: ['paint_blue'] },
  { id: 26, name: 'Groene verf', color: [40, 140, 70], tex: ['paint_green'] },
  { id: 27, name: 'Grind', color: [150, 140, 128], tex: ['gravel'] },
  { id: 28, name: 'Kasseien', color: [110, 108, 104], tex: ['cobble'] },
  { id: 29, name: 'Vloertegel', color: [200, 196, 186], tex: ['tile'] },
  { id: 30, name: 'Paal', color: [50, 54, 58], tex: ['post'] },
  { id: 31, name: 'Oranje verf', color: [230, 130, 30], tex: ['paint_orange'] },
  { id: 32, name: 'Zwarte verf', color: [30, 30, 34], tex: ['paint_black'] },
  { id: 33, name: 'Bloemen', color: [120, 170, 70], tex: ['flowers', 'grass_side', 'dirt'] },
  { id: 34, name: 'Witte verf', color: [235, 235, 235], tex: ['paint_white'] },
  { id: 35, name: 'Haag', color: [44, 100, 36], tex: ['hedge'] },
];

export const N_BLOCKS = BLOCKS.length;

// Eigenschappen-tabellen voor snelle opzoekingen
export const IS_TRANSPARENT = new Uint8Array(256); // glas, water (doorzichtige mesh)
export const IS_CUTOUT = new Uint8Array(256);      // bladeren
export const IS_SOLID = new Uint8Array(256);       // botsing
export const IS_OPAQUE = new Uint8Array(256);      // voor AO en verbergen van vlakken
for (const b of BLOCKS) {
  if (b.id === 0) continue;
  if (b.transparent) IS_TRANSPARENT[b.id] = 1;
  if (b.cutout) IS_CUTOUT[b.id] = 1;
  if (!b.liquid) IS_SOLID[b.id] = 1;
  if (!b.transparent && !b.cutout) IS_OPAQUE[b.id] = 1;
}

// Blokken die je kan kiezen in de inventaris
export const PLACEABLE = BLOCKS.filter(b => b.id !== 0 && b.id !== B.BEDROCK).map(b => b.id);
