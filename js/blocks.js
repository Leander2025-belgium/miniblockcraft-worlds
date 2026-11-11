// Blokdefinities voor Blokstad.
// Elk blok heeft een id (index), naam, kaartkleur en textuurinformatie.

export const B = {
  AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, ASPHALT: 4, LINE_WHITE: 5, LINE_YELLOW: 6,
  SIDEWALK: 7, BRICK: 8, CONCRETE: 9, GLASS: 10, DARKGLASS: 11, PLANKS: 12, LOG: 13,
  LEAVES: 14, WATER: 15, SAND: 16, ROOF_RED: 17, ROOF_DARK: 18, METAL: 19, BEDROCK: 20,
  LAMP: 21, PLASTER: 22, YELLOWBRICK: 23, PAINT_RED: 24, PAINT_BLUE: 25, PAINT_GREEN: 26,
  GRAVEL: 27, COBBLE: 28, TILE: 29, POST: 30, PAINT_ORANGE: 31, PAINT_BLACK: 32, FLOWERS: 33,
  PAINT_WHITE: 34, HEDGE: 35, ASHLAR: 36, LIMESTONE: 37,
  GLASS_GREEN: 38, MIRROR: 39, GLASS_BLUE: 40, PANEL_WHITE: 41, PANEL_DARK: 42, BRICK_DARK: 43,
  PLASTER_BEIGE: 44, PLASTER_GREY: 45, TERRACOTTA: 46, COPPER: 47, PLASTER_PINK: 48,
  RED_GRANITE: 49, RED_SANDSTONE: 50, HALF_TIMBER: 51, SNOW: 52, SPRUCE: 53, BALLAST: 54,
  BIRCH_LOG: 55, BIRCH_LEAVES: 56, MOSSY_STONE: 57, DARK_PLANKS: 58, MARBLE: 59, GRANITE: 60, ICE: 61, PAINT_YELLOW: 62,
  WOOL_RED: 63, BOOKSHELF: 64, CRATE: 65, CHECKER: 66, ROOF_GREEN: 67, SOLAR: 68, PINE_LEAVES: 69, CLAY_ROOF: 70,
  DEEPSLATE: 71, COAL_ORE: 72, IRON_ORE: 73, GOLD_ORE: 74, DIAMOND_ORE: 75, LADDER: 76, ELEVATOR: 77, BASALT: 78, CLAY: 79, ESCALATOR: 80,
  DOOR: 81, DOOR_TOP: 82, DOOR_GLASS: 83, BIKE_PATH: 84, BUS_LANE: 85,
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
  { id: 36, name: 'Natuursteen', color: [150, 150, 146], tex: ['ashlar'] },
  { id: 37, name: 'Zandsteen', color: [200, 186, 156], tex: ['limestone'] },
  { id: 38, name: 'Groen glas', color: [150, 190, 180], tex: ['glass_green'], transparent: true },
  { id: 39, name: 'Spiegelglas', color: [150, 180, 200], tex: ['mirror'], transparent: true },
  { id: 40, name: 'Blauw glas', color: [80, 130, 190], tex: ['glass_blue'], transparent: true },
  { id: 41, name: 'Wit gevelpaneel', color: [232, 234, 236], tex: ['panel_white'] },
  { id: 42, name: 'Antraciet paneel', color: [58, 62, 68], tex: ['panel_dark'] },
  { id: 43, name: 'Donkere baksteen', color: [100, 56, 44], tex: ['brick_dark'] },
  { id: 44, name: 'Beige pleister', color: [222, 204, 170], tex: ['plaster_beige'] },
  { id: 45, name: 'Grijze pleister', color: [170, 170, 168], tex: ['plaster_grey'] },
  { id: 46, name: 'Terracotta', color: [190, 105, 70], tex: ['terracotta'] },
  { id: 47, name: 'Koper', color: [96, 160, 140], tex: ['copper'] },
  { id: 48, name: 'Roze pleister', color: [226, 180, 170], tex: ['plaster_pink'] },
  { id: 49, name: 'Rood graniet', color: [128, 66, 58], tex: ['red_granite'] },
  { id: 50, name: 'Rode zandsteen', color: [166, 86, 72], tex: ['red_sandstone'] },
  { id: 51, name: 'Vakwerk', color: [200, 190, 172], tex: ['half_timber'] },
  { id: 52, name: 'Sneeuw', color: [236, 240, 246], tex: ['snow', 'snow_side', 'stone'] },
  { id: 53, name: 'Sparrennaalden', color: [34, 80, 50], tex: ['spruce'] },
  { id: 54, name: 'Spoorballast', color: [118, 110, 102], tex: ['ballast'] },
  { id: 55, name: 'Berkenstam', color: [220, 216, 206], tex: ['birch_top', 'birch', 'birch_top'] },
  { id: 56, name: 'Berkenblad', color: [118, 168, 70], tex: ['birch_leaves'] },
  { id: 57, name: 'Bemoste steen', color: [104, 116, 92], tex: ['mossy_stone'] },
  { id: 58, name: 'Donker hout', color: [86, 60, 40], tex: ['dark_planks'] },
  { id: 59, name: 'Marmer', color: [232, 230, 226], tex: ['marble'] },
  { id: 60, name: 'Graniet', color: [146, 138, 134], tex: ['granite'] },
  { id: 61, name: 'IJs', color: [176, 210, 236], tex: ['ice'] },
  { id: 62, name: 'Gele verf', color: [236, 196, 40], tex: ['paint_yellow'] },
  { id: 63, name: 'Rode stof', color: [168, 36, 40], tex: ['wool_red'] },
  { id: 64, name: 'Boekenkast', color: [120, 84, 50], tex: ['planks', 'bookshelf', 'planks'] },
  { id: 65, name: 'Houten kist', color: [150, 110, 64], tex: ['crate'] },
  { id: 66, name: 'Dambordvloer', color: [128, 128, 128], tex: ['checker'] },
  { id: 67, name: 'Groen metalen dak', color: [64, 118, 88], tex: ['roof_green'] },
  { id: 68, name: 'Zonnepaneel', color: [36, 52, 86], tex: ['solar', 'metal', 'metal'] },
  { id: 69, name: 'Dennennaalden', color: [44, 92, 52], tex: ['pine_leaves'] },
  { id: 70, name: 'Kleidakpan', color: [176, 88, 56], tex: ['clay_roof'] },
  { id: 71, name: 'Diepe leisteen', color: [74, 74, 80], tex: ['deepslate'] },
  { id: 72, name: 'Steenkool-erts', color: [92, 92, 92], tex: ['coal_ore'] },
  { id: 73, name: 'IJzererts', color: [150, 128, 112], tex: ['iron_ore'] },
  { id: 74, name: 'Gouderts', color: [170, 150, 80], tex: ['gold_ore'] },
  { id: 75, name: 'Diamanterts', color: [110, 170, 170], tex: ['diamond_ore'] },
  { id: 76, name: 'Ladder', color: [150, 110, 64], tex: ['ladder'], cutout: true, climb: true },
  { id: 77, name: 'Lift (spring = omhoog, Shift = omlaag)', color: [170, 176, 184], tex: ['elevator_top', 'elevator', 'metal'] },
  { id: 78, name: 'Basalt', color: [52, 52, 58], tex: ['basalt'] },
  { id: 79, name: 'Klei', color: [150, 140, 128], tex: ['clay'] },
  { id: 80, name: 'Roltrap (voert je mee omhoog)', color: [96, 98, 104], tex: ['escalator', 'metal', 'metal'] },
  // deuren: je kan er gewoon doorheen lopen (onderste helft met klink, bovenste helft met raampje; glazen deur)
  { id: 81, name: 'Deur', color: [120, 78, 44], tex: ['planks', 'door_low', 'planks'], passable: true },
  { id: 82, name: 'Deur (bovenkant)', color: [120, 78, 44], tex: ['planks', 'door_high', 'planks'], passable: true },
  { id: 83, name: 'Glazen deur', color: [170, 210, 230], tex: ['glass', 'door_glass', 'glass'], transparent: true, passable: true },
  { id: 84, name: 'Fietspad (rood asfalt)', color: [150, 62, 50], tex: ['bike_path', 'asphalt', 'asphalt'] },
  { id: 85, name: 'Busbaan', color: [112, 40, 44], tex: ['bus_lane', 'asphalt', 'asphalt'] },
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
  if (!b.liquid && !b.climb && !b.passable) IS_SOLID[b.id] = 1;
  if (!b.transparent && !b.cutout) IS_OPAQUE[b.id] = 1;
}

// Blokken die je kan kiezen in de inventaris
export const PLACEABLE = BLOCKS.filter(b => b.id !== 0 && b.id !== B.BEDROCK).map(b => b.id);
