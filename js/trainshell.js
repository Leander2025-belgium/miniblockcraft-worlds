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
export function shellParts(d, liv, style = '') {
  const key = d.type + ':' + liv.join(',') + ':' + style;
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
  // ---------- historische stoomtrein (stijl 'hist') ----------
  if (style === 'hist' && type === 'loco') {
    const G = 0x1d3b26, RED = 0x8c1c13, BRASS = 0xc9a24a, BLACK = 0x17181a;
    P.box('trim', 3.0, 0.35, L - 0.6, 0, 1.15, 0, BLACK);                                       // loopplank / frame
    const boil = new THREE.CylinderGeometry(1.25, 1.25, L - 8, 18); boil.rotateX(Math.PI / 2); boil.translate(0, 2.75, 2.2); P.add('paint', boil, G); // ketel
    const smoke = new THREE.CylinderGeometry(1.3, 1.3, 1.4, 18); smoke.rotateX(Math.PI / 2); smoke.translate(0, 2.75, hz - 1.2); P.add('trim', smoke, BLACK); // rookkast
    const chim = new THREE.CylinderGeometry(0.32, 0.26, 1.3, 12); chim.translate(0, 4.45, hz - 1.4); P.add('trim', chim, BLACK); // schoorsteen
    const dome = new THREE.CylinderGeometry(0.5, 0.6, 0.7, 12); dome.translate(0, 4.2, 1.2); P.add('trim', dome, BRASS); // stoomdom
    for (const bz of [-0.6, 3.4]) { const band = new THREE.CylinderGeometry(1.28, 1.28, 0.12, 18); band.rotateX(Math.PI / 2); band.translate(0, 2.75, bz); P.add('trim', band, BRASS); }
    P.box('paint', 3.3, 2.9, 3.0, 0, 3.3, -hz + 5.6, G);                                       // cabine
    P.box('trim', 3.5, 0.25, 3.4, 0, 4.85, -hz + 5.6, BLACK);
    for (const sx of [1, -1]) P.box('win', 0.05, 0.8, 1.1, sx * 1.66, 3.7, -hz + 5.6, 0xffe9c4);
    P.box('paint', 3.2, 2.2, 4.0, 0, 2.3, -hz + 2.0, G); P.box('trim', 2.9, 0.6, 3.6, 0, 3.6, -hz + 2.0, BLACK); // tender met kolen
    for (const wz of [-1.2, 0.8, 2.8]) for (const sx of [1, -1]) P.wheel(0.85, 0.18, sx * 1.15, 0.85, wz, RED, 16); // drijfwielen
    for (const sx of [1, -1]) P.box('trim', 0.08, 0.14, 4.2, sx * 1.32, 0.95, 0.8, 0xb8bec6);  // koppelstang
    for (const wz of [hz - 2.4]) for (const sx of [1, -1]) P.wheel(0.45, 0.15, sx * 1.1, 0.45, wz, RED, 12); // looprad
    P.box('trim', 3.1, 0.45, 0.3, 0, 1.0, hz - 0.1, RED);                                       // bufferbalk
    P.box('light', 0.35, 0.35, 0.06, 0, 3.0, hz - 0.45, HEAD);                                  // lantaarn
    s = { body: P.done(), door: null, doorsZ: [], key, bogie: null, bogieZ: [], panto: null, lod: lodParts(L, 0x1d3b26, false) };
    cache.set(key, s); return s;
  }
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
    s = { body: P.done(), door: null, doorsZ: [], key, bogie: B.done(), bogieZ, panto: null, lod: lodParts(L, c1, true) };
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
  const sleeper = type === 'sleeper', mountain = type === 'rack' || type === 'rackLoco' || type === 'panorama', hist = style === 'hist';
  if (sleeper) for (const sx of [1, -1]) P.box('paint', 0.03, 0.3, bl - 1, sx * 2.045, 4.45, bc, c2);                    // slaaprijtuig: band met 'WL'
  if (hist) for (const sx of [1, -1]) { P.box('trim', 0.03, 0.08, bl, sx * 2.05, 2.75, bc, 0xc9a24a); P.box('trim', 0.03, 0.9, bl, sx * 2.04, 3.6, bc, 0xe9dfc0); } // goudlijn, crème ramenband
  for (const sx of [1, -1]) {
    for (let z = z0 + 1.2; z < z1 - 1.2; z += sleeper ? 2.6 : 2.2) {
      if (doorsZ.some(dz => Math.abs(z + 0.9 - dz) < 1.6)) continue;
      // ramen: slaaprijtuig kleine coupéramen hoog, bergtrein grote panoramaruiten, historisch kleinere ramen
      if (sleeper) { P.box('win', 0.05, 0.75, 1.1, sx * 2.04, 3.75, z + 0.9, 0xffe9c4); P.box('trim', 0.06, 0.85, 0.12, sx * 2.04, 3.75, z + 1.55, PILLAR); continue; }
      if (mountain) { P.box('win', 0.05, 1.6, 1.95, sx * 2.04, 3.65, z + 0.9, 0xffe9c4); P.box('trim', 0.06, 1.7, 0.1, sx * 2.04, 3.65, z + 1.95, PILLAR); continue; }
      if (hist) { P.box('win', 0.05, 0.8, 1.2, sx * 2.05, 3.6, z + 0.9, 0xffe9c4); continue; }
      P.box('win', 0.05, 1.05, 1.8, sx * 2.04, 3.55, z + 0.9, 0xffe9c4);
      P.box('trim', 0.06, 1.15, 0.12, sx * 2.04, 3.55, z + 1.9, PILLAR);
    }
    // deurkozijnen
    for (const dz of doorsZ) P.box('trim', 0.05, 2.5, 1.7, sx * 2.035, 2.85, dz, DARK);
  }
  if (type === 'panorama') P.box('trim', 3.2, 0.3, bl - 3, 0, 5.4, bc, GLASS, { sx: 0.9 });
  if (hist) { P.box('trim', 1.6, 0.45, bl - 2, 0, 5.65, bc, 0x5a3b26); for (let z = z0 + 2; z < z1 - 2; z += 1.6) for (const sx of [1, -1]) P.box('win', 0.04, 0.22, 0.7, sx * 0.81, 5.65, z, 0xffe9c4); // lichtkap met raampjes
    for (const ez of [hz + 0.35, -hz - 0.35]) { P.box('trim', 3.4, 0.12, 0.7, 0, 1.3, ez, 0x2a2b2e); for (const sx of [1, -1]) P.box('trim', 0.06, 1.0, 0.7, sx * 1.6, 1.85, ez, 0xb8bec6); } } // balkons met hekjes
  if (mountain && type !== 'panorama') { const cog = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16); cog.rotateZ(Math.PI / 2); cog.translate(0, 0.55, 0); B.add('trim', cog, 0x55595f); } // tandrad onder het draaistel
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
    // stroomafnemer apart (beweegt: neer bij een geparkeerde trein, op als hij in dienst is); oorsprong op de voet
    var PG = new Parts();
    const a1 = new THREE.BoxGeometry(0.08, 0.08, 1.6); a1.rotateX(-0.55); a1.translate(0, 0.38, -0.3); PG.add('trim', a1, STEEL);
    const a2 = new THREE.BoxGeometry(0.08, 0.08, 1.6); a2.rotateX(0.55); a2.translate(0, 0.83, 0.35); PG.add('trim', a2, STEEL);
    PG.box('trim', 1.8, 0.07, 0.14, 0, 1.23, 0.75, DARK);
    var pantoAt = [0, 5.62, pz];
    P.box('trim', 1.2, 0.4, 3.0, 0, 5.7, 0, 0x7d838a);
  } else if (type !== 'panorama') P.box('trim', 1.0, 0.35, 2.0, 0, 5.65, 0, 0x7d838a); // ventilatie
  // schuifdeur (één helft; links en rechts, beide kanten van de bak worden in de game geplaatst)
  const D = new Parts(); D.box('paint', 0.06, 2.35, 0.82, 0, 0, 0, 0xffffff); D.box('trim', 0.07, 0.9, 0.55, 0, 0.35, 0, GLASS);
  s = { body: P.done(), door: D.done(), doorsZ, key, c1, bogie: B.done(), bogieZ, panto: typeof PG !== 'undefined' && PG ? PG.done() : null, pantoAt: typeof pantoAt !== 'undefined' ? pantoAt : null, lod: lodParts(L, c1, freight) };
  cache.set(key, s);
  return s;
}

// eenvoudig model voor op afstand (LOD): één bak met ramenband en dak, 3 dozen in plaats van honderden onderdelen
function lodParts(L, c1, freight) {
  const P = new Parts();
  P.box('paint', 4.0, freight ? 3.4 : 4.6, L - 0.4, 0, freight ? 2.6 : 3.0, 0, c1);
  if (!freight) P.box('win', 4.06, 1.0, L - 2, 0, 3.55, 0, 0xffe9c4);
  P.box('trim', 3.6, 0.4, L - 0.6, 0, freight ? 4.4 : 5.4, 0, ROOF);
  P.box('trim', 3.0, 0.8, L - 2, 0, 0.6, 0, DARK);
  return P.done();
}
export const LOD_DIST = 450; // verder dan dit: het eenvoudige model
const signCache = new Map(), signGeo = new THREE.PlaneGeometry(1.96, 0.3);
// Alle buitenkanten van een treinset: één groep per rijtuig, met de deurpanelen apart (die schuiven open)
export class TrainShells {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matLight = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matWin = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.group = new THREE.Group(); scene.add(this.group);
  }
  // bestemmingsbord met tekst (lijn en eindbestemming), gedeelde textuur per tekst
  sign(text) {
    let t = signCache.get(text);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 512; c.height = 80;
    const x = c.getContext('2d'); x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, 512, 80);
    x.fillStyle = '#ffb22a'; x.font = 'bold 46px monospace'; x.textBaseline = 'middle';
    let f = 46; while (x.measureText(text).width > 496 && f > 20) { f -= 2; x.font = `bold ${f}px monospace`; }
    x.fillText(text, 8, 42);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; signCache.set(text, t);
    return t;
  }
  make(d, liv, livHex, label, style = '') {
    const sp = shellParts(d, liv, style), g = new THREE.Group();
    g.rotation.order = 'YXZ';
    for (const k of ['paint', 'trim']) if (sp.body[k]) g.add(new THREE.Mesh(sp.body[k], this.mat));
    if (sp.body.light) g.add(new THREE.Mesh(sp.body.light, this.matLight));
    if (sp.body.win) g.add(new THREE.Mesh(sp.body.win, this.matWin));
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
    if (label && CAB.has(d.type) && typeof document !== 'undefined') {
      if (!this.signMats) this.signMats = new Map();
      let m = this.signMats.get(label); if (!m) { m = new THREE.MeshBasicMaterial({ map: this.sign(label) }); this.signMats.set(label, m); }
      const pl = new THREE.Mesh(signGeo, m); pl.position.set(0, 4.85, d.L / 2 - 0.965); g.add(pl);
    }
    this.group.add(g);
    // stroomafnemer (beweegt) en het eenvoudige model voor op afstand
    let panto = null;
    if (sp.panto) { panto = new THREE.Group(); for (const k of ['paint', 'trim']) if (sp.panto[k]) panto.add(new THREE.Mesh(sp.panto[k], this.mat)); panto.position.set(...sp.pantoAt); g.add(panto); }
    const lod = new THREE.Group(); for (const k of ['paint', 'trim']) if (sp.lod[k]) lod.add(new THREE.Mesh(sp.lod[k], this.mat)); if (sp.lod.win) lod.add(new THREE.Mesh(sp.lod.win, this.matWin));
    lod.visible = false; g.add(lod);
    const full = g.children.filter(c => c !== lod);
    return { g, doors, bogies, open: 0, panto, up: 1, lod, full, far: false };
  }
  // stroomafnemer omhoog (1) of neer (0), rustig bewegend
  setPanto(s, want, dt) { if (!s.panto) return; s.up += Math.max(-dt * 0.4, Math.min(dt * 0.4, want - s.up)); s.panto.scale.y = 0.18 + 0.82 * s.up; }
  // ver weg: het eenvoudige model
  setFar(s, far) { if (s.far === far) return; s.far = far; s.lod.visible = far; for (const c of s.full) c.visible = !far; }
  setDoors(s, f) { if (Math.abs(s.open - f) < 1e-3) return; s.open = f; for (const h of s.doors) h.position.z = h.userData.z + h.userData.half * f * 0.8; }
  update(day) { const l = 0.25 + 0.75 * day; this.mat.color.setScalar(l); const n = Math.max(0, Math.min(1, (0.55 - day) / 0.35)); this.matWin.color.setRGB(0.13 + 0.85 * n, 0.16 + 0.78 * n, 0.21 + 0.6 * n); }
  dispose() { this.group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) { /* gedeelde geometrie blijft in de cache */ } }); this.group.removeFromParent(); }
}
