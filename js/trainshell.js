// Gladde buitenkant van de treinen (Greenisland, Alpen): gestroomlijnde neus, ramen met stijlen, schuifdeuren die
// op een station opengaan, draaistellen met wielen, koppelingen en balgen, kop- en sluitlichten, bestemmingsbord,
// pantograaf en dakinstallaties. Het rijtuig uit blokken (js/rail.js) blijft het interieur waar je rondloopt en zit:
// van buiten zie je deze buitenkant, aan boord het interieur.
// Assenstelsel zoals een rijtuig in rail.js: x -2..2 (breedte 4), y 0..6, z -L/2..L/2, voorkant = +z.
import * as THREE from 'three';
import { Parts } from './vehicles.js';
import { BLOCKS } from './blocks.js';

const GLASS = 0x1f2a36, PILLAR = 0x2a2e33, DARK = 0x222428, BOGIE = 0x2b2d31, STEEL = 0x9aa1a9, ROOF = 0xb9bec4, HEAD = 0xfff4d6, TAIL = 0xd0181c, AMBER = 0xffb22a;
const hexOf = (id) => { const c = BLOCKS[id] ? BLOCKS[id].color : [200, 200, 200]; return (c[0] << 16) | (c[1] << 8) | c[2]; };
const CAB = new Set(['loco', 'emuCab', 'iceHead', 'rack', 'rackLoco', 'tram', 'bus']);
const ELECTRIC = new Set(['loco', 'emuCab', 'iceHead', 'tram', 'rackLoco']);

// geometrie per rijtuigsoort (gedeeld door alle treinen): { body: {paint,trim,light}, door: geometry }
const cache = new Map();
export function shellParts(d, liv) {
  const key = d.type + ':' + liv.join(',');
  let s = cache.get(key);
  if (s) return s;
  const [c1b, c2b] = liv, c1 = hexOf(c1b), c2 = hexOf(c2b);
  const P = new Parts(), L = d.L, type = d.type, hz = L / 2;
  const cab = CAB.has(type), freight = type === 'box' || type === 'tank' || type === 'flat';
  // onderstel, draaistellen met wielen, koppelingen
  P.box('trim', 2.9, 0.5, L - 1.6, 0, 0.7, 0, DARK);
  // draaistel apart (draait in bochten mee met het spoor): frame, 4 wielen met asdozen, veren, remblokken
  const B = new Parts();
  B.box('trim', 2.9, 0.4, 2.9, 0, 0.58, 0, BOGIE);
  for (const wz of [0.95, -0.95]) {
    for (const wx of [1.05, -1.05]) { B.wheel(0.48, 0.16, wx, 0.5, wz, 0x3a3d42, 14); B.box('trim', 0.22, 0.26, 0.3, wx * 1.32, 0.5, wz, 0x1c1d20); }
    B.box('trim', 2.3, 0.1, 0.1, 0, 0.5, wz, STEEL);                                   // as
  }
  for (const sx of [1.45, -1.45]) { B.box('trim', 0.12, 0.3, 2.6, sx, 0.66, 0, STEEL); for (const z of [-0.45, 0.45]) B.box('trim', 0.16, 0.26, 0.16, sx, 0.9, z, 0x5c6168); } // veren
  const bogieZ = [hz - 3, -hz + 3];
  P.box('trim', 0.4, 0.35, 0.8, 0, 0.85, hz + 0.1, DARK).box('trim', 0.4, 0.35, 0.8, 0, 0.85, -hz - 0.1, DARK); // koppelingen
  if (freight) {
    if (type === 'tank') {
      const g = new THREE.CylinderGeometry(1.55, 1.55, L - 1.6, 20); g.rotateX(Math.PI / 2); g.translate(0, 2.9, 0); P.add('paint', g, c1);
      P.box('trim', 0.8, 0.4, 0.8, 0, 4.55, 0, DARK);
    } else if (type === 'box') {
      P.box('paint', 3.9, 3.6, L - 0.4, 0, 2.95, 0, c1);
      for (let z = -hz + 1.5; z < hz - 1; z += 2.4) P.box('trim', 3.95, 3.6, 0.12, 0, 2.95, z, DARK);
      P.box('trim', 3.7, 0.15, L - 0.6, 0, 4.82, 0, ROOF, { sx: 0.9 });
    } else {
      P.box('trim', 3.9, 0.3, L - 0.4, 0, 1.1, 0, 0x5a4632);
      P.box('paint', 3.6, 2.8, 6, 0, 2.65, -3.2, hexOf(25)); P.box('paint', 3.6, 2.8, 6, 0, 2.65, 3.4, 0xe07a1f); // containers
    }
    s = { body: P.done(), door: null, doorsZ: [], key, bogie: B.done(), bogieZ };
    cache.set(key, s); return s;
  }
  // bak: onderste band in de hoofdkleur, ramenband, bovenste band, afgerond dak
  const z0 = cab ? -hz : -hz, z1 = cab ? hz - 2.2 : hz, bl = z1 - z0, bc = (z0 + z1) / 2;
  P.box('paint', 4.06, 1.9, bl, 0, 2.0, bc, c1);
  P.box('paint', 4.06, 0.22, bl, 0, 2.6, bc, c2);                                // sierlijn
  P.box('paint', 4.06, 0.9, bl, 0, 4.55, bc, c1);
  P.box('trim', 3.9, 0.55, bl, 0, 5.25, bc, ROOF, { sx: 0.84 });                 // dak (afgerond)
  // ramen: aparte ruiten met stijlen, niet bij de deuren
  const doorsZ = d.doors.map(z => z - hz + 0.5);
  for (const sx of [1, -1]) {
    for (let z = z0 + 1.2; z < z1 - 1.2; z += 2.2) {
      if (doorsZ.some(dz => Math.abs(z + 0.9 - dz) < 1.6)) continue;
      P.box('trim', 0.05, 1.05, 1.8, sx * 2.04, 3.55, z + 0.9, GLASS);
      P.box('trim', 0.06, 1.15, 0.12, sx * 2.04, 3.55, z + 1.9, PILLAR);
    }
    // deurkozijnen
    for (const dz of doorsZ) P.box('trim', 0.05, 2.5, 1.7, sx * 2.035, 2.85, dz, DARK);
  }
  if (type === 'panorama') P.box('trim', 3.2, 0.3, bl - 3, 0, 5.4, bc, GLASS, { sx: 0.9 });
  // kopwanden met balg (niet bij de neus)
  if (!cab) { P.box('trim', 2.6, 3.4, 0.25, 0, 3.1, hz + 0.12, 0x1a1b1e); }
  P.box('trim', 2.6, 3.4, 0.25, 0, 3.1, -hz - 0.12, 0x1a1b1e);
  if (cab) {
    // gestroomlijnde neus: onderkant en kap schuin naar voren, grote voorruit, lichten, bestemmingsbord
    const nz = hz - 1.1, nose = type === 'iceHead' ? 1.6 : type === 'tram' || type === 'bus' ? 0.4 : 1.0;
    P.box('paint', 4.06, 2.5, 2.2, 0, 2.15, nz, c1, { sx: 0.9, front: nose * 0.8 });
    P.box('trim', 3.6, 1.35, 2.0, 0, 3.95, nz - 0.1, GLASS, { sx: 0.82, front: nose });
    P.box('paint', 3.7, 0.7, 1.6, 0, 5.0, nz - 0.4, c2, { sx: 0.8, front: nose * 0.6 });
    P.box('trim', 3.2, 0.5, 1.2, 0, 0.95, nz + 0.4, DARK, { sx: 0.9, front: 0.4 });  // schortplaat
    P.box('light', 0.5, 0.22, 0.06, 1.15, 1.75, hz - 0.02, HEAD).box('light', 0.5, 0.22, 0.06, -1.15, 1.75, hz - 0.02, HEAD);
    P.box('light', 0.18, 0.18, 0.06, 1.6, 1.4, hz - 0.03, TAIL).box('light', 0.18, 0.18, 0.06, -1.6, 1.4, hz - 0.03, TAIL);
    P.box('light', 2.0, 0.32, 0.06, 0, 4.85, hz - 1.0, AMBER);                     // bestemmingsbord
    P.box('trim', 0.12, 0.35, 0.12, 2.15, 3.3, hz - 1.4, DARK).box('trim', 0.12, 0.35, 0.12, -2.15, 3.3, hz - 1.4, DARK); // spiegels
  }
  if (ELECTRIC.has(type)) {
    // pantograaf en dakinstallaties
    const pz = -hz + 4;
    P.box('trim', 1.6, 0.25, 1.6, 0, 5.62, pz, DARK);
    const a1 = new THREE.BoxGeometry(0.08, 0.08, 1.6); a1.rotateX(-0.55); a1.translate(0, 6.0, pz - 0.3); P.add('trim', a1, STEEL);
    const a2 = new THREE.BoxGeometry(0.08, 0.08, 1.6); a2.rotateX(0.55); a2.translate(0, 6.45, pz + 0.35); P.add('trim', a2, STEEL);
    P.box('trim', 1.8, 0.07, 0.14, 0, 6.85, pz + 0.75, DARK);
    P.box('trim', 1.2, 0.4, 3.0, 0, 5.7, 0, 0x7d838a);
  } else if (type !== 'panorama') P.box('trim', 1.0, 0.35, 2.0, 0, 5.65, 0, 0x7d838a); // ventilatie
  // schuifdeur (één helft; links en rechts, beide kanten van de bak worden in de game geplaatst)
  const D = new Parts(); D.box('paint', 0.06, 2.35, 0.82, 0, 0, 0, 0xffffff); D.box('trim', 0.07, 0.9, 0.55, 0, 0.35, 0, GLASS);
  s = { body: P.done(), door: D.done(), doorsZ, key, c1, bogie: B.done(), bogieZ };
  cache.set(key, s);
  return s;
}

// Alle buitenkanten van een treinset: één groep per rijtuig, met de deurpanelen apart (die schuiven open)
export class TrainShells {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matLight = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.group = new THREE.Group(); scene.add(this.group);
  }
  make(d, liv, livHex) {
    const sp = shellParts(d, liv), g = new THREE.Group();
    g.rotation.order = 'YXZ';
    for (const k of ['paint', 'trim']) if (sp.body[k]) g.add(new THREE.Mesh(sp.body[k], this.mat));
    if (sp.body.light) g.add(new THREE.Mesh(sp.body.light, this.matLight));
    const bogies = [];
    for (const bz of sp.bogieZ || []) {
      const b = new THREE.Group(); for (const k of ['paint', 'trim']) if (sp.bogie[k]) b.add(new THREE.Mesh(sp.bogie[k], this.mat));
      b.position.z = bz; b.userData.z = bz; g.add(b); bogies.push(b);
    }
    const doors = [];
    if (sp.door) for (const dz of sp.doorsZ) for (const sx of [1, -1]) for (const half of [-1, 1]) {
      const m = new THREE.Mesh(sp.door.paint, this.mat); const t = new THREE.Mesh(sp.door.trim, this.mat);
      const h = new THREE.Group(); h.add(m, t); h.position.set(sx * 2.07, 2.95, dz + half * 0.41); h.userData = { z: dz + half * 0.41, half };
      g.add(h); doors.push(h);
    }
    // de kleur van de deuren = bijkleur van het rijtuig
    void livHex;
    this.group.add(g);
    return { g, doors, bogies, open: 0 };
  }
  setDoors(s, f) { if (Math.abs(s.open - f) < 1e-3) return; s.open = f; for (const h of s.doors) h.position.z = h.userData.z + h.userData.half * f * 0.8; }
  update(day) { const l = 0.25 + 0.75 * day; this.mat.color.setScalar(l); }
  dispose() { this.group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) { /* gedeelde geometrie blijft in de cache */ } }); this.group.removeFromParent(); }
}
