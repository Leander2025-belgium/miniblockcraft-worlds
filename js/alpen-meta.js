// Licht: alleen de gegevens van de Alpenwereld die het menu en de opslag nodig hebben (zonder het landschap te berekenen).
// De rest (js/alpen.js) wordt pas geladen als je de wereld opent.
export const OX = 17920, OZ = 17920, W = 50000, T = 128, G = 12;
export const META = {
  id: 'reuzenberg', name: 'Reuzenberg · Alpen', kind: 'proc', tile: T,
  tilesX: Math.ceil(W / T), tilesZ: Math.ceil(W / T), tiles: Math.ceil(W / T),
  ground: G, version: 7, superTiles: 4, miniStep: 4, groundColor: [0.33, 0.45, 0.26], maxH: 5600, longView: 60000, smoothLod: true,
  alps: { ox: OX, oz: OZ, tiles: OX / T },
};
