// Het plan van het Alpenspoornet: lijnen, stations (in volgorde) en hun ligging in de wereld.
// dir = rijrichting door het station in graden (0 = oost, 90 = zuid; zonder dir: de richting van de lijn), len = perronlengte.
// De tracés tussen de stations zoekt tools/plan-alpen.mjs automatisch door de dalen (js/alpen-routes.js).
// wp = doorgangspunt zonder station (bv. om een kruising ver genoeg van het station te leggen).
// 'old' = het bestaande spoor door het Reuzendal (ligt al in de oude Reuzenberg en blijft precies zo).

export const OLD_RAIL = { start: [17922, 30440], startDir: -1.3, end: [31918, 30170], endDir: 1.4 };
const HBF_X = 34500;

export const LINE_PLAN = {
  AE: {
    name: 'Alpenexpress', color: '#d6262b', vmax: 44, rmin: 450, ref: 300, tun: 170, via: [
      { name: 'Wolkendorf', x: 10050, z: 29700, len: 320 },
      { name: 'Gletsjerdal', x: 14100, z: 30250, len: 220 },
      { old: true, ...OLD_RAIL },
      { name: 'Reuzenberg Hauptbahnhof', x: HBF_X, z: 30150, dir: 0, len: 420, hbf: 0 },
      { name: 'Oostbrug', x: 40200, z: 31400, len: 220 },
      { name: 'Oostpoort', x: 46400, z: 31600, len: 320 },
    ],
  },
  NZ: {
    name: 'Noord-Zuidlijn', color: '#1f6fd1', vmax: 39, rmin: 400, ref: 500, tun: 150, via: [
      { name: 'Sneeuwbrück', x: 34500, z: 4300, len: 320 },
      { name: 'Kloosterdal', x: 33300, z: 11800, len: 220 },
      { name: 'Grenspas', x: 33700, z: 19500, len: 220 },
      { name: 'Reuzenberg Hauptbahnhof', x: HBF_X, z: 30135, dir: 0, len: 420, hbf: 1 },
      { wp: true, x: 36500, z: 30060, dir: 0, len: 600 },
      { name: 'Spiraaldorp', x: 33800, z: 38600, len: 220 },
      { name: 'Hemelpoort', x: 36400, z: 46600, len: 320 },
    ],
  },
  HSL: {
    name: 'Hogesnelheidslijn', color: '#7a3db8', vmax: 69, rmin: 1100, ref: 350, high: true, tun: 45, via: [
      { name: 'Reuzenberg Hauptbahnhof', x: HBF_X, z: 30120, dir: 0, len: 420, hbf: 2 },
      { wp: true, x: 36700, z: 29990, dir: 0, len: 900 },
      { name: 'Hemelpoort', x: 36400, z: 46570, len: 320 },
    ],
  },
  PE: {
    name: 'Panorama Express', color: '#e39a12', vmax: 22, rmin: 200, maxGrade: 0.07, ref: 250, tun: 320, via: [
      { name: 'Oostpoort', x: 46400, z: 31630, len: 320 },
      { name: 'Hemelblik', x: 46600, z: 38200, len: 200 },
      { name: 'Gemsenkam', x: 42500, z: 46900, len: 160 },
      { name: 'Hemelpoort', x: 36400, z: 46630, len: 320 },
    ],
  },
  ZB: {
    name: 'Zugspitzbahn', color: '#b01c3c', vmax: 9, rmin: 90, rack: true, maxGrade: 0.2, ref: 3000, tun: 70, via: [
      { name: 'Sneeuwbrück', x: 34560, z: 4300, len: 120 },
      { name: 'Eibmeer', x: 37300, z: 6900, len: 90 },
      { name: 'Zugspitzplatt', x: 40250, z: 11900, len: 90 },
    ],
  },
  ME: {
    name: 'Matterhorn Express', color: '#2e9e4f', vmax: 17, rmin: 110, rack: true, maxGrade: 0.12, ref: 1500, tun: 110, via: [
      { name: 'Wolkendorf', x: 10050, z: 29660, len: 200 },
      { name: 'IJsdal', x: 13600, z: 21800, len: 120 },
      { name: 'Matterdorf', x: 15400, z: 9600, len: 200 },
    ],
  },
};
