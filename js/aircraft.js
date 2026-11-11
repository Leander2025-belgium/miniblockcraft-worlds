// Luchthavens en vliegtuigen.
// - Gladde 3D-modellen (geen blokken): romp (lathe), gepijlde vleugels, staartvlakken, motoren,
//   landingsgestel en kleppen die uitklappen bij opstijgen en landen. Typen: A320, B737, A350, B787,
//   A380 (dubbeldeks), B747 (bult), B747 vracht, privéjet en Cessna.
// - Vliegtuigen staan aan gates, taxiën naar de baan, stijgen op, vliegen weg; andere naderen,
//   landen en taxiën naar een vrije gate.
// - Instappen aan de gate (H): binnenin een cabine met stoelen, gangpad, bagagevakken, ramen,
//   keuken en cockpit. Je blijft netjes zitten/staan tijdens taxiën, opstijgen en vliegen.
// - Pilotenmodus (H in de cockpit): toegankelijk vliegmodel met gas, hoogteroer, rolroer, kleppen
//   en landingsgestel. Tijdens een vlucht kan je een bestemming kiezen (reizen naar een andere wereld).
import * as THREE from 'three';
import { B } from './blocks.js';
import { Parts } from './vehicles.js';
import { meshChunk } from './mesher.js';

export const PLANES = {
  a320: { name: 'Airbus A320', L: 37.6, span: 35.8, r: 2.0, eng: 2, engR: 1.0, tail: 11.8, wide: false },
  b737: { name: 'Boeing 737-800', L: 39.5, span: 35.9, r: 1.95, eng: 2, engR: 0.95, tail: 12.5, wide: false },
  a350: { name: 'Airbus A350', L: 66.8, span: 64.8, r: 3.0, eng: 2, engR: 1.6, tail: 17, wide: true },
  b787: { name: 'Boeing 787', L: 56.7, span: 60.1, r: 2.9, eng: 2, engR: 1.5, tail: 17, wide: true },
  a380: { name: 'Airbus A380', L: 72.7, span: 79.8, r: 3.6, eng: 4, engR: 1.5, tail: 24, wide: true, deck2: true },
  b747: { name: 'Boeing 747', L: 70.7, span: 64.4, r: 3.2, eng: 4, engR: 1.3, tail: 19, wide: true, hump: true },
  b747f: { name: 'Boeing 747 vracht', L: 70.7, span: 64.4, r: 3.2, eng: 4, engR: 1.3, tail: 19, wide: true, hump: true, cargo: true },
  jet: { name: 'Privéjet', L: 20, span: 19, r: 1.1, eng: 2, engR: 0.55, tail: 6, wide: false, rearEng: true, small: true },
  cessna: { name: 'Cessna 172', L: 8.3, span: 11, r: 0.6, eng: 0, engR: 0, tail: 2.7, wide: false, prop: true, highWing: true, small: true },
};
const LIVERIES = [[0xffffff, 0x0b3d91], [0xffffff, 0xd4121c], [0xffffff, 0x1c7c54], [0xf4f4f4, 0x16213e], [0xffffff, 0xf2a900], [0xe8eef4, 0x7a1f6e]];
// GreenAir (canon: de luchtvaartmaatschappij van Greenisland): witte romp, groene staart; in Greenisland vliegt zij het meest
const GREENAIR = [0xf7faf6, 0x1f9d4b];

// ---------- 3D-model ----------
function wing(P, color, rootX, rootChord, tipChord, span, sweep, th, y, z, dihedral, side) {
  const g = new THREE.BufferGeometry();
  const x0 = rootX * side, x1 = (rootX + span) * side, dy = Math.tan(dihedral) * span;
  // 8 hoekpunten: voor/achterrand, boven/onder, wortel en tip
  const v = [
    [x0, y + th / 2, z + rootChord / 2], [x0, y + th / 2, z - rootChord / 2], [x0, y - th / 2, z + rootChord / 2], [x0, y - th / 2, z - rootChord / 2],
    [x1, y + dy + th / 4, z - sweep + tipChord / 2], [x1, y + dy + th / 4, z - sweep - tipChord / 2], [x1, y + dy - th / 4, z - sweep + tipChord / 2], [x1, y + dy - th / 4, z - sweep - tipChord / 2],
  ];
  const f = [[0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3], [4, 6, 7, 5], [0, 1, 3, 2]];
  const pos = [];
  for (const q of f) { let [a, b, c, d] = q; if (side < 0) [b, d] = [d, b]; for (const k of [a, b, c, a, c, d]) pos.push(...v[k]); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  P.add('trim', g, color);
}
function buildModel(type, livery) {
  const T = PLANES[type], [body, tailC] = livery, P = new Parts(), L = T.L, r = T.r;
  // romp: profiel van neus tot staart, dan als lathe rond de lengteas
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, z = -L / 2 + t * L;
    let rr = r;
    if (t > 0.88) rr = r * Math.sqrt(Math.max(0, 1 - ((t - 0.88) / 0.12) ** 2)) * 0.98 + 0.05; // neus
    else if (t < 0.22) rr = r * (0.18 + 0.82 * Math.pow(t / 0.22, 0.7));                    // staartkegel
    prof.push(new THREE.Vector2(Math.max(0.05, rr), z));
  }
  const fus = new THREE.LatheGeometry(prof, 20); fus.rotateX(Math.PI / 2); fus.rotateZ(Math.PI); fus.scale(1, T.deck2 ? 1.22 : 1, -1);
  P.add('paint', fus, body);
  if (T.hump) { const h = new THREE.SphereGeometry(r * 0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2); h.scale(1, 0.75, 6); h.translate(0, r * 0.55, L * 0.26); P.add('paint', h, body); }
  // ramen en cockpitruit
  if (!T.cargo) for (const sx of [1, -1]) P.box('trim', 0.05, 0.28, L * 0.62, sx * (r * (T.deck2 ? 1.0 : 0.985)), r * 0.28, L * 0.03, 0x1d2731);
  if (T.deck2) for (const sx of [1, -1]) P.box('trim', 0.05, 0.28, L * 0.55, sx * r * 0.86, r * 0.95, L * 0.04, 0x1d2731);
  P.box('trim', r * 1.1, r * 0.25, 0.6, 0, r * 0.45, L / 2 - r * 0.9, 0x1d2731, { sx: 0.8 });
  // vleugels
  const wy = T.highWing ? r * 0.9 : -r * 0.45, wz = T.highWing ? L * 0.08 : -L * 0.02;
  const rootC = T.small ? L * 0.13 : L * 0.2, tipC = rootC * 0.3, half = T.span / 2 - r * 0.8, sweep = T.small ? 0.3 : half * 0.48;
  for (const side of [1, -1]) {
    wing(P, 0xd9dde2, r * 0.8, rootC, tipC, half, sweep, T.small ? 0.25 : r * 0.28, wy, wz, T.highWing ? 0 : 0.09, side);
    if (!T.small) wing(P, tailC, T.span / 2 - 0.3, tipC, tipC * 0.6, 0.2, 0, 0.3, wy + Math.tan(0.09) * half + 0.1, wz - sweep - tipC * 0.1, 1.2, side); // winglet
    // staartvlak
    wing(P, 0xd9dde2, r * 0.25, L * 0.09, L * 0.04, T.span * 0.17, T.span * 0.1, 0.25, r * 0.3, -L / 2 + L * 0.08, 0.05, side);
  }
  // kielvlak (verticaal)
  { const g = new THREE.BufferGeometry(), c0 = L * 0.15, c1 = L * 0.06, h = T.tail - r, z0 = -L / 2 + L * 0.1, y0 = r * 0.6;
    const v = [[0.18, y0, z0 + c0 / 2], [0.18, y0, z0 - c0 / 2], [0.1, y0 + h, z0 - h * 0.7 + c1 / 2], [0.1, y0 + h, z0 - h * 0.7 - c1 / 2]];
    const pos = []; const quad = (a, b, c, d, s) => { const q = s ? [a, b, c, a, c, d] : [a, c, b, a, d, c]; for (const k of q) pos.push(...k); };
    const m = v.map(p => [-p[0], p[1], p[2]]);
    quad(v[0], v[1], v[3], v[2], true); quad(m[0], m[1], m[3], m[2], false); quad(v[0], v[2], m[2], m[0], true); quad(v[1], m[1], m[3], v[3], true); quad(v[2], v[3], m[3], m[2], true);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); P.add('trim', g, tailC); }
  // motoren
  const engs = [];
  if (T.rearEng) engs.push([r + T.engR, r * 0.3, -L * 0.3], [-(r + T.engR), r * 0.3, -L * 0.3]);
  else if (T.eng === 2) engs.push([half * 0.36 + r, wy - T.engR * 1.1, wz + rootC * 0.55], [-(half * 0.36 + r), wy - T.engR * 1.1, wz + rootC * 0.55]);
  else if (T.eng === 4) for (const f of [0.3, 0.62]) for (const s of [1, -1]) engs.push([s * (half * f + r), wy + Math.tan(0.09) * half * f - T.engR * 1.1, wz + rootC * 0.55 - half * f * 0.48]);
  for (const [x, y, z] of engs) {
    const g = new THREE.CylinderGeometry(T.engR, T.engR * 0.8, T.engR * 3.2, 16); g.rotateX(Math.PI / 2); g.translate(x, y, z); P.add('paint', g, body === 0xffffff ? 0xc8ccd2 : body);
    const inl = new THREE.CylinderGeometry(T.engR * 0.85, T.engR * 0.85, 0.1, 16); inl.rotateX(Math.PI / 2); inl.translate(x, y, z + T.engR * 1.62); P.add('trim', inl, 0x22252a);
    if (!T.rearEng) P.box('trim', 0.25, T.engR * 0.8, T.engR * 2.2, x, y + T.engR * 0.9, z - 0.3, 0xc8ccd2);
  }
  if (T.prop) { P.box('trim', 2.0, 0.12, 0.06, 0, 0, L / 2 + 0.05, 0x222222); P.box('trim', 0.12, 2.0, 0.06, 0, 0, L / 2 + 0.05, 0x222222); }
  // lichten
  P.box('light', 0.2, 0.2, 0.2, half + r * 0.8 - 0.2, wy + 0.3, wz - sweep, 0x29d13a);
  P.box('light', 0.2, 0.2, 0.2, -(half + r * 0.8 - 0.2), wy + 0.3, wz - sweep, 0xe0202a);
  P.box('light', 0.25, 0.25, 0.25, 0, T.tail - 0.2, -L / 2 + 0.6, 0xffffff);
  const model = P.done();
  // landingsgestel en kleppen apart (bewegen)
  const G = new Parts(), gh = T.small ? 0.9 : r * 0.9 + 0.6, wr = T.small ? 0.3 : 0.55;
  const legs = [[0, L * 0.38], [r * 1.1, wz - 0.5], [-r * 1.1, wz - 0.5]];
  if (T.eng === 4) legs.push([r * 0.5, wz - 4], [-r * 0.5, wz - 4]);
  for (const [x, z] of legs) {
    G.box('trim', 0.25, gh, 0.25, x, -r - gh / 2 + 0.2, z, 0x8a8f95);
    for (const dx of x === 0 ? [0.3, -0.3] : [0.45, -0.45]) G.wheel(wr, 0.35, x + dx, -r - gh + 0.2 + wr * 0, z, 0x1a1a1a);
  }
  const gear = G.done().trim;
  const F = new Parts();
  for (const side of [1, -1]) F.box('trim', half * 0.55, 0.12, rootC * 0.22, side * (r + half * 0.35), 0, 0, 0xc6cbd1);
  const flaps = F.done().trim;
  return { model, gear, flaps, flapPos: [0, wy - 0.05, wz - rootC * 0.55 - sweep * 0.3], groundY: r + gh - 0.2 + wr };
}

// ---------- cabine (blokken, om in rond te lopen) ----------
function cabin(type) {
  const T = PLANES[type], W = T.wide ? 8 : 6, H = 5, Lc = Math.max(10, Math.round(T.L * 0.78));
  const size = Math.max(W, Lc), vox = new Uint8Array(size * size * H);
  const set = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < Lc) vox[(z * size + x) * H + y] = b; };
  for (let z = 0; z < Lc; z++) for (let x = 0; x < W; x++) {
    set(x, 0, z, (x === Math.floor(W / 2) || (T.wide && x === 2)) ? B.WOOL_RED : B.CHECKER === undefined ? B.TILE : B.PANEL_DARK); // vloer, gangpad met loper
    set(x, 4, z, B.PANEL_WHITE); // plafond
    if (x === 0 || x === W - 1) { set(x, 1, z, B.PANEL_WHITE); set(x, 2, z, z % 2 ? B.GLASS : B.PANEL_WHITE); set(x, 3, z, B.PANEL_WHITE); }
  }
  for (let x = 0; x < W; x++) for (let y = 1; y < 4; y++) { set(x, y, 0, B.PANEL_WHITE); set(x, y, Lc - 1, B.PANEL_WHITE); }
  // stoelrijen (rij om de 1 m), gangpaden vrij
  const aisle = (x) => T.wide ? (x === 2 || x === W - 3) : x === Math.floor(W / 2) || x === Math.floor(W / 2) - 1;
  const seatC = T.cargo ? 0 : B.PAINT_BLUE;
  for (let z = 3; z < Lc - 6; z++) {
    if (z === Math.floor(Lc / 2)) continue; // nooduitgang
    for (let x = 1; x < W - 1; x++) if (!aisle(x) && seatC) set(x, 1, z, seatC);
  }
  if (T.cargo) for (let z = 3; z < Lc - 6; z += 3) for (let x = 1; x < W - 1; x++) if (!aisle(x)) { set(x, 1, z, B.CRATE); set(x, 2, z, B.CRATE); }
  // bagagevakken boven de stoelen
  for (let z = 3; z < Lc - 6; z++) for (const x of [1, W - 2]) set(x, 3, z, B.PANEL_WHITE);
  // keuken achteraan, deur vooraan links
  for (let x = 1; x < W - 1; x++) if (!aisle(x)) { set(x, 1, 1, B.METAL); set(x, 2, 1, B.METAL); }
  set(0, 1, Lc - 6, 0); set(0, 2, Lc - 6, 0); // deuropening
  // cockpit: wand met deur, pult, twee stoelen, ruiten
  const cz = Lc - 4;
  for (let x = 1; x < W - 1; x++) for (let y = 1; y < 4; y++) set(x, y, cz, x === Math.floor(W / 2) && y < 3 ? 0 : B.PANEL_WHITE);
  for (let x = 1; x < W - 1; x++) { set(x, 1, Lc - 2, B.PANEL_DARK); set(x, 2, Lc - 1, B.GLASS); set(x, 3, Lc - 1, B.GLASS); }
  set(Math.floor(W / 2) - 1, 1, Lc - 3, B.WOOL_RED); set(Math.floor(W / 2) + 1, 1, Lc - 3, B.WOOL_RED);
  set(Math.floor(W / 2), 2, Lc - 2, B.LAMP);
  return { W, H, L: Lc, size, vox, door: [0.5, 1.05, Lc - 6 + 0.5], cockpit: [W / 2, 1.05, Lc - 3] };
}

// ---------- een vliegtuig ----------
export class Plane {
  constructor(game, type, livery) {
    this.game = game; this.type = type; this.T = PLANES[type];
    const m = buildModel(type, livery);
    this.groundY = m.groundY;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.group = new THREE.Group();
    const add = (geo, mat) => { if (!geo) return null; const me = new THREE.Mesh(geo, mat); me.layers.enable(1); this.group.add(me); return me; };
    this.paint = add(m.model.paint, this.mat); add(m.model.trim, this.mat); add(m.model.light, this.lightMat);
    this.gear = add(m.gear, this.mat);
    this.flapMesh = add(m.flaps, this.mat); this.flapMesh.position.set(...m.flapPos);
    game.scene.add(this.group);
    // cabine
    const c = cabin(type);
    this.cab = c; this.world = game.makeWorld({ size: c.size, H: c.H }, c.vox);
    this.inner = new THREE.Group(); this.inner.visible = false;
    for (let cz = 0; cz < this.world.nc; cz++) for (let cx = 0; cx < this.world.nc; cx++) {
      const out = meshChunk(this.world, cx, cz);
      for (const [buf, mat] of [[out.opaque, game.matOpaque], [out.trans, game.matTrans]]) {
        if (!buf.n) continue;
        const geo = new THREE.BufferGeometry();
        for (const [k, n] of [['pos', 3], ['uv', 2], ['tile', 2], ['light', 1], ['face', 1]]) geo.setAttribute(k === 'pos' ? 'position' : k, new THREE.Float32BufferAttribute(buf[k], n));
        geo.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
        const me = new THREE.Mesh(geo, mat); me.position.set(-c.W / 2, -1.2, -c.L / 2); this.inner.add(me);
      }
    }
    this.group.add(this.inner);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.roll = 0; this.speed = 0; this.flaps = 0; this.gearDown = true;
    // interface zoals een schip (aan boord lopen): afmetingen en de plek van het stuur
    this.g = { W: c.W, L: c.L, H: c.H, bridge: c.cockpit };
  }
  get name() { return this.T.name; }
  // schip-interface voor de speler aan boord (alleen draaien om de verticale as)
  toLocal(v, out) { const dx = v.x - this.pos.x, dz = v.z - this.pos.z, c = Math.cos(-this.yaw), s = Math.sin(-this.yaw); return out.set(dx * c + dz * s + this.cab.W / 2, v.y - this.pos.y + 1.2, -dx * s + dz * c + this.cab.L / 2); }
  toWorld(v, out) { const lx = v.x - this.cab.W / 2, lz = v.z - this.cab.L / 2, c = Math.cos(this.yaw), s = Math.sin(this.yaw); return out.set(this.pos.x + lx * c + lz * s, this.pos.y + v.y - 1.2, this.pos.z - lx * s + lz * c); }
  inside(l, m = 0) { return l.x >= -m && l.z >= -m && l.x < this.cab.W + m && l.z < this.cab.L + m && l.y > -1 && l.y < this.cab.H + 1; }
  update(dt, day, inside) {
    this.mat.color.setScalar(0.2 + 0.8 * day);
    this.group.position.copy(this.pos);
    // van binnen blijft de cabine waterpas (je blijft netjes staan of zitten)
    if (inside) this.group.rotation.set(0, this.yaw, 0, 'YXZ'); else this.group.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.gear.visible = this.gearDown;
    this.flapMesh.rotation.x = this.flaps * 0.45;
    // binnen: cabine tonen, romp verbergen (zo zie je door de ramen naar buiten)
    this.inner.visible = inside;
    for (const c of this.group.children) if (c !== this.inner) c.visible = !inside && (c !== this.gear || this.gearDown);
  }
  dispose() { this.group.traverse(o => o.geometry && o.geometry.dispose()); this.mat.dispose(); this.lightMat.dispose(); this.group.removeFromParent(); }
}

// ---------- luchthavens: banen, gates en vluchten ----------
const TAXI = 14, VR = 72, VAPP = 70;
export class Airports {
  constructor(game) {
    this.game = game; this.runways = []; this.gates = []; this.planes = []; this.keys = new Set(); this.t = 0;
  }
  // banen en gates uit de geladen tegels (paden van soort 'runway' en 'gate')
  scan(tiles) {
    for (const t of tiles.values()) for (const p of t.paths || []) {
      if (p.type === 'runway') {
        const a = [t.ox + p.pts[0], p.pts[2] + 1, t.oz + p.pts[1]], b = [t.ox + p.pts[3], p.pts[5] + 1, t.oz + p.pts[4]];
        const k = 'r' + Math.round(a[0] / 20) + ',' + Math.round(a[2] / 20) + ',' + Math.round(b[0] / 20) + ',' + Math.round(b[2] / 20);
        if (!this.keys.has(k)) { this.keys.add(k); this.runways.push({ a, b, len: Math.hypot(b[0] - a[0], b[2] - a[2]) }); }
      } else if (p.type === 'gate') {
        const g = { x: t.ox + p.pts[0], y: p.pts[2] + 1, z: t.oz + p.pts[1], yaw: p.pts[3] ?? 0, plane: null };
        const k = 'g' + Math.round(g.x / 4) + ',' + Math.round(g.z / 4);
        if (!this.keys.has(k)) { this.keys.add(k); this.gates.push(g); }
      }
    }
  }
  // piloten en grondpersoneel bij de gates (getekend door het verkeer)
  npcs() {
    const out = [];
    for (const g of this.gates) {
      out.push({ x: g.x + 6, y: g.y, z: g.z + 2, yaw: g.yaw, uniform: [0xf28c00, 0x2b2f38] }, { x: g.x - 7, y: g.y, z: g.z - 3, yaw: g.yaw + 1, uniform: [0xf2e600, 0x2b2f38] });
      if (g.plane) out.push({ x: g.x + 3, y: g.y, z: g.z + 8, yaw: g.yaw + 3, uniform: [0xf4f4f4, 0x111827] });
    }
    return out;
  }
  nearestRunway(x, z) {
    let best = null, bd = 1e9;
    for (const r of this.runways) { const d = Math.hypot((r.a[0] + r.b[0]) / 2 - x, (r.a[2] + r.b[2]) / 2 - z); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  pickType() {
    const r = Math.random();
    return r < 0.22 ? 'a320' : r < 0.42 ? 'b737' : r < 0.54 ? 'a350' : r < 0.66 ? 'b787' : r < 0.74 ? 'a380' : r < 0.82 ? 'b747' : r < 0.88 ? 'b747f' : r < 0.95 ? 'jet' : 'cessna';
  }
  pickLivery() {
    if (this.game.meta && this.game.meta.greenisland && Math.random() < 0.6) return { liv: GREENAIR, airline: 'GreenAir' };
    return { liv: LIVERIES[Math.floor(Math.random() * LIVERIES.length)], airline: null };
  }
  spawnAtGate(g) {
    const lv = this.pickLivery(), pl = new Plane(this.game, this.pickType(), lv.liv); pl.airline = lv.airline;
    pl.state = 'parked'; pl.timer = 40 + Math.random() * 80; pl.gate = g; g.plane = pl;
    pl.yaw = g.yaw; pl.pos.set(g.x, g.y + pl.groundY, g.z);
    this.planes.push(pl); return pl;
  }
  spawnArrival(r, aboard) {
    const lv = this.pickLivery(), pl = new Plane(this.game, aboard ? 'a320' : this.pickType(), lv.liv); pl.airline = lv.airline;
    const dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, dist = 5500;
    pl.pos.set(r.a[0] - ux * dist, r.a[1] + pl.groundY + dist * Math.tan(3 * Math.PI / 180), r.a[2] - uz * dist);
    pl.yaw = Math.atan2(ux, uz); pl.speed = VAPP; pl.state = 'approach'; pl.rw = r; pl.flaps = 1; pl.gearDown = true; pl.pitch = 0.02;
    this.planes.push(pl); return pl;
  }
  update(dt, day) {
    const game = this.game; this.t += dt;
    if (game.tiled && (this.scanT = (this.scanT || 0) + dt) > 3) { this.scanT = 0; this.scan(game.world.tiles); if (game.traffic && this.gates.length) game.traffic.extraNpcs = this.npcs(); }
    const P = game.player.pos;
    // aankomst na een reis: in een naderend vliegtuig op de dichtstbijzijnde baan
    if (game.pendingArrival) {
      const r = this.nearestRunway(P.x, P.z);
      if (r && Math.hypot((r.a[0] + r.b[0]) / 2 - P.x, (r.a[2] + r.b[2]) / 2 - P.z) < 6000) {
        const np = this.spawnArrival(r, true); game.boardVessel(np, true); game.player.loc.z -= 4;
        game.toast(`🛬 Nadering op ${game.pendingArrival.name}. Wij landen zo meteen.`); game.announce('Dames en heren, wij beginnen aan onze landing.');
        game.pendingArrival = null;
      } else if (performance.now() - game.pendingArrival.t > 25000) { game.toast(`✈ Aangekomen in ${game.pendingArrival.name}`); game.pendingArrival = null; }
    }
    // vliegtuigen aan vrije gates in de buurt; af en toe een landing
    if (this.runways.length) {
      for (const g of this.gates) if (!g.plane && Math.hypot(g.x - P.x, g.z - P.z) < 900 && this.planes.length < 14 && Math.random() < 0.6) this.spawnAtGate(g);
      if (this.t - (this.lastArr || 0) > 70 && this.planes.filter(p => p.state === 'approach' || p.state === 'landing').length < 1) {
        const r = this.nearestRunway(P.x, P.z); if (r && Math.hypot((r.a[0] + r.b[0]) / 2 - P.x, (r.a[2] + r.b[2]) / 2 - P.z) < 4000) { this.lastArr = this.t; this.spawnArrival(r); }
      }
    }
    for (const pl of this.planes) {
      if (pl.pilot) { pl.update(dt, day, game.aboard === pl); continue; }
      this.fly(pl, dt);
      pl.update(dt, day, game.aboard === pl);
    }
    // weg met vliegtuigen ver weg (niet als de speler erin zit)
    this.planes = this.planes.filter(pl => {
      const far = Math.hypot(pl.pos.x - P.x, pl.pos.z - P.z) > 7000 || (pl.state === 'gone');
      if (far && game.aboard !== pl && !pl.pilot) { if (pl.gate) pl.gate.plane = null; pl.dispose(); return false; }
      return true;
    });
  }
  // automatisch vliegen: gate → taxi → opstijgen → wegvliegen; naderen → landen → taxi → gate
  fly(pl, dt) {
    const r = pl.rw || (pl.rw = this.nearestRunway(pl.pos.x, pl.pos.z));
    const toward = (x, z, speed) => {
      const dx = x - pl.pos.x, dz = z - pl.pos.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz); let dy = want - pl.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      pl.yaw += Math.max(-0.6 * dt, Math.min(0.6 * dt, dy));
      pl.speed += Math.max(-3 * dt, Math.min(2 * dt, speed - pl.speed));
      const step = Math.min(d, pl.speed * dt);
      pl.pos.x += Math.sin(pl.yaw) * step; pl.pos.z += Math.cos(pl.yaw) * step;
      return d;
    };
    if (!r) return;
    // vertrekken vanaf het dichtstbijzijnde baaneinde
    if (pl.state === 'parked' && pl.rev == null) pl.rev = Math.hypot(r.b[0] - pl.pos.x, r.b[2] - pl.pos.z) < Math.hypot(r.a[0] - pl.pos.x, r.a[2] - pl.pos.z);
    if (pl.rev && (pl.state === 'taxiOut' || pl.state === 'lineup' || pl.state === 'takeoff' || pl.state === 'climb')) return this.flyRw(pl, dt, { a: r.b, b: r.a }, toward);
    return this.flyRw(pl, dt, r, toward);
  }
  flyRw(pl, dt, r, toward) {
    const dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, gy = r.a[1] + pl.groundY;
    if (pl.state === 'parked') {
      pl.timer -= dt; pl.speed = 0;
      if (pl.timer < 0 && (!this.game.aboard || this.game.aboard === pl)) { pl.state = 'taxiOut'; if (pl.gate) { pl.gate.plane = null; pl.gate = null; } if (this.game.aboard === pl) this.game.toast('🛫 Wij taxiën naar de startbaan. Gordels vast!'); }
    } else if (pl.state === 'taxiOut') {
      const d = toward(r.a[0] - ux * 30, r.a[2] - uz * 30, TAXI); pl.pos.y = gy;
      if (d < 6) { pl.state = 'lineup'; }
    } else if (pl.state === 'lineup') {
      const want = Math.atan2(ux, uz); let dyw = want - pl.yaw; while (dyw > Math.PI) dyw -= 2 * Math.PI; while (dyw < -Math.PI) dyw += 2 * Math.PI;
      pl.yaw += Math.max(-0.5 * dt, Math.min(0.5 * dt, dyw)); pl.speed = 2;
      pl.pos.x += Math.sin(pl.yaw) * 2 * dt; pl.pos.z += Math.cos(pl.yaw) * 2 * dt;
      if (Math.abs(dyw) < 0.02) { pl.state = 'takeoff'; pl.flaps = 0.6; }
    } else if (pl.state === 'takeoff') {
      pl.speed += (pl.T.small ? 3 : 2.2) * dt;
      pl.pos.x += ux * pl.speed * dt; pl.pos.z += uz * pl.speed * dt;
      const vr = pl.T.small ? 32 : VR;
      if (pl.speed > vr) { pl.pitch = Math.min(0.17, pl.pitch + dt * 0.08); pl.pos.y += Math.sin(pl.pitch) * pl.speed * dt; }
      else pl.pos.y = gy;
      if (pl.pos.y > gy + 60) { pl.gearDown = false; }
      if (pl.pos.y > gy + 300) { pl.state = 'climb'; pl.flaps = 0; }
    } else if (pl.state === 'climb') {
      pl.speed = Math.min(130, pl.speed + dt * 2); pl.pitch += (0.12 - pl.pitch) * dt;
      pl.pos.x += Math.sin(pl.yaw) * pl.speed * dt; pl.pos.z += Math.cos(pl.yaw) * pl.speed * dt; pl.pos.y += Math.sin(pl.pitch) * pl.speed * dt;
      if (this.game.aboard === pl && pl.pos.y > gy + 700 && !pl.askedTravel) { pl.askedTravel = true; this.game.offerTravel?.(pl); }
      if (pl.pos.y > gy + 1600 && this.game.aboard !== pl) pl.state = 'gone';
      if (this.game.aboard === pl && pl.pos.y > gy + 1400) { pl.state = 'cruise'; }
    } else if (pl.state === 'cruise') {
      // rondje en terug naar dezelfde baan (als je geen bestemming kiest)
      pl.pitch += (0 - pl.pitch) * dt; pl.speed = 130;
      pl.yaw += 0.03 * dt; pl.roll = 0.15;
      pl.pos.x += Math.sin(pl.yaw) * pl.speed * dt; pl.pos.z += Math.cos(pl.yaw) * pl.speed * dt;
      pl.cruiseT = (pl.cruiseT || 0) + dt;
      if (pl.cruiseT > 120) { pl.roll = 0; const np = this.spawnArrival(pl.rw, true); this.game.transferAboard(pl, np); pl.state = 'gone'; }
    } else if (pl.state === 'approach') {
      // glijpad van 3°
      const ax = r.a[0] - pl.pos.x, az = r.a[2] - pl.pos.z, d = Math.hypot(ax, az);
      toward(r.a[0] + ux * 400, r.a[2] + uz * 400, VAPP);
      const want = gy + Math.max(0, d * Math.tan(3 * Math.PI / 180));
      pl.pos.y += (want - pl.pos.y) * Math.min(1, dt * 0.8); pl.pitch = 0.04; pl.gearDown = true; pl.flaps = 1;
      if (d < 30 || (ax * ux + az * uz) < 0) pl.state = 'landing';
    } else if (pl.state === 'landing') {
      pl.pos.y += (gy - pl.pos.y) * Math.min(1, dt * 2); pl.pitch *= 0.95;
      pl.speed = Math.max(TAXI, pl.speed - 5 * dt);
      pl.pos.x += ux * pl.speed * dt; pl.pos.z += uz * pl.speed * dt;
      if (pl.speed <= TAXI + 0.1) {
        pl.state = 'taxiIn'; pl.flaps = 0;
        pl.gate = this.gates.filter(g => !g.plane).sort((a, b) => Math.hypot(a.x - pl.pos.x, a.z - pl.pos.z) - Math.hypot(b.x - pl.pos.x, b.z - pl.pos.z))[0] || null;
        if (pl.gate) pl.gate.plane = pl;
        if (this.game.aboard === pl) { this.game.toast('🛬 Welkom! Wij taxiën naar de gate.'); this.game.announce?.('Dames en heren, welkom. Wij taxiën naar de gate.'); }
      }
    } else if (pl.state === 'taxiIn') {
      if (!pl.gate) { pl.state = 'gone'; return; }
      const d = toward(pl.gate.x, pl.gate.z, TAXI); pl.pos.y = gy;
      if (d < 3) { pl.state = 'parked'; pl.timer = 60 + Math.random() * 60; pl.yaw = pl.gate.yaw; pl.pos.y = pl.gate.y + pl.groundY; }
    }
    if (pl.state !== 'takeoff' && pl.state !== 'climb' && pl.state !== 'cruise') pl.roll *= 0.9;
  }
  nearest(p, maxD = 45) {
    let best = null, bd = maxD;
    for (const pl of this.planes) { const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) - pl.T.L / 2; if (d < bd && Math.abs(pl.pos.y - p.y) < 20) { bd = d; best = pl; } }
    return best;
  }
  dispose() { for (const pl of this.planes) pl.dispose(); this.planes = []; }
}

// ---------- zelf vliegen ----------
export class FlightControl {
  constructor(game, plane) {
    this.g = game; this.pl = plane; plane.pilot = true; this.cam = 'cab';
    this.throttle = plane.speed > 10 ? 0.7 : 0; this.hud = document.getElementById('drive-hud'); this.pad = document.getElementById('drive-pad');
    if (this.hud) this.hud.hidden = false;
    if (this.pad) { this.pad.hidden = !game.touch; this.pad.dataset.mode = 'plane'; }
    game.ui.root.classList.add('driving');
    game.player.yaw = 0; game.player.pitch = 0;
    game.toast('✈ Pilotenmodus: W/S gas · ↑/↓ neus omlaag/omhoog · A/D rollen · F kleppen · G landingsgestel · H stoppen');
  }
  camMode() { return 'first'; }
  cycleCam() { this.cam = this.cam === 'cab' ? 'chase' : 'cab'; }
  placeCamera(cam) {
    const pl = this.pl, p = this.g.player, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pl.pitch, pl.yaw, pl.roll, 'YXZ'));
    const off = this.cam === 'cab' ? new THREE.Vector3(0, pl.T.r * 0.5, pl.T.L / 2 - pl.T.r * 1.3) : new THREE.Vector3(0, pl.T.r * 3 + 4, -pl.T.L * 0.9 - 14);
    off.applyQuaternion(q);
    cam.position.copy(pl.pos).add(off);
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch + (this.cam === 'chase' ? -0.15 : 0), p.yaw + Math.PI, 0, 'YXZ'));
    cam.quaternion.copy(q).multiply(look);
    p.pos.set(cam.position.x, cam.position.y - 1.62, cam.position.z);
    return true;
  }
  update(dt) {
    const g = this.g, k = g.keys, pl = this.pl;
    if (k.has('KeyW') || g.padPlus) this.throttle = Math.min(1, this.throttle + dt * 0.4);
    if (k.has('KeyS') || g.padMinus) this.throttle = Math.max(0, this.throttle - dt * 0.4);
    const pitchIn = (k.has('ArrowDown') || g.padDown ? 1 : 0) - (k.has('ArrowUp') || g.padUp ? 1 : 0);
    const rollIn = (k.has('KeyD') || k.has('ArrowRight') || g.padRight ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') || g.padLeft ? 1 : 0);
    const small = pl.T.small, vmax = small ? 65 : 250, vstall = small ? 26 : 62;
    const ground = this.groundY();
    const onGround = pl.pos.y <= ground + 0.05;
    // snelheid: stuwkracht, luchtweerstand, helling
    const thrust = this.throttle * (small ? 4 : 3.2), drag = (pl.speed / vmax) ** 2 * (small ? 4 : 3.2) + (pl.gearDown ? 0.25 : 0) + pl.flaps * 0.4 + (onGround && this.throttle < 0.05 ? 2.5 : 0);
    pl.speed = Math.max(0, pl.speed + (thrust - drag - 9.8 * Math.sin(pl.pitch) * 0.5) * dt);
    // sturen
    pl.pitch += pitchIn * dt * 0.5; pl.pitch = Math.max(onGround ? 0 : -0.6, Math.min(0.5, pl.pitch));
    if (onGround) { pl.roll = 0; pl.yaw += rollIn * dt * 0.4 * Math.min(1, pl.speed / 20); if (pl.speed < vstall * (1 - pl.flaps * 0.2)) pl.pitch = Math.min(pl.pitch, 0.02); }
    else { pl.roll += (rollIn * 0.7 - pl.roll) * dt * 1.5; pl.yaw -= Math.tan(pl.roll) * 9.8 / Math.max(30, pl.speed) * dt; }
    // lift: boven de overtreksnelheid volgt het toestel zijn neus, eronder zakt het
    const st = vstall * (1 - pl.flaps * 0.2);
    let vy = Math.sin(pl.pitch) * pl.speed;
    if (pl.speed < st && !onGround) vy -= (1 - pl.speed / st) * 12;
    pl.pos.x += Math.sin(pl.yaw) * Math.cos(pl.pitch) * pl.speed * dt;
    pl.pos.z += Math.cos(pl.yaw) * Math.cos(pl.pitch) * pl.speed * dt;
    pl.pos.y += vy * dt;
    if (pl.pos.y < ground) {
      if (vy < -7 || Math.abs(pl.roll) > 0.35 || !pl.gearDown) { g.toast('💥 Harde landing! Het toestel wordt teruggezet.'); pl.speed = 0; this.throttle = 0; pl.pitch = 0; pl.roll = 0; pl.gearDown = true; }
      pl.pos.y = ground;
    }
    const alt = Math.round(pl.pos.y - ground), bar = (v) => '▮'.repeat(Math.round(v * 8)).padEnd(8, '▯');
    if (this.hud && (this.t = (this.t || 0) + dt) - (this.ht || 0) > 0.15) {
      this.ht = this.t;
      this.hud.innerHTML = `<div class="dh-speed">${Math.round(pl.speed * 3.6)}<small> km/h</small></div><div class="dh-info"><div class="dh-row"><b>✈ ${pl.T.name}</b> · gas ${bar(this.throttle)} · hoogte <b>${alt} m</b></div>
        <div class="dh-row">kleppen ${Math.round(pl.flaps * 100)}% (F) · landingsgestel ${pl.gearDown ? 'uit' : 'in'} (G) · ${pl.speed < st && !onGround ? '<b class="warn">OVERTREK</b>' : onGround ? 'op de grond' : 'vliegend'}</div></div>`;
    }
  }
  groundY() {
    const w = this.g.world, pl = this.pl, x = Math.floor(pl.pos.x), z = Math.floor(pl.pos.z);
    let top = (this.g.world.groundAt ? this.g.world.groundAt(x, z) : this.g.world.G) || 0;
    const t = w.tileAt && w.tileAt(x, z);
    if (t) top = w.columnTop(x, z);
    return top + 1 + pl.groundY;
  }
  key(code) {
    if (code === 'KeyH') { this.exit(); return true; }
    if (code === 'KeyV') { this.cycleCam(); return true; }
    if (code === 'KeyF') { this.pl.flaps = this.pl.flaps >= 1 ? 0 : this.pl.flaps + 0.5; return true; }
    if (code === 'KeyG') { this.pl.gearDown = !this.pl.gearDown; return true; }
    return false;
  }
  show(on) { if (this.hud) this.hud.hidden = !on; if (this.pad) this.pad.hidden = !on || !this.g.touch; this.g.ui.root.classList.toggle('driving', on); }
  exit() {
    const g = this.g, pl = this.pl;
    pl.pilot = false; if (pl.speed < 1) { pl.state = 'parked'; pl.timer = 1e9; } else pl.state = 'cruise';
    this.show(false); g.drive = null;
    g.boardVessel(pl); g.player.loc.set(pl.cab.cockpit[0], pl.cab.cockpit[1], pl.cab.cockpit[2] - 2);
    g.toast('Stuur losgelaten — de automatische piloot neemt over');
  }
}
