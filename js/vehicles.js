// 3D-modellen voor het verkeer: auto's, bussen, trams, treinen en mensen.
// Elk model bestaat uit drie delen: 'paint' (krijgt per voertuig een kleur), 'trim' (vaste kleuren:
// ramen, banden, bumpers) en 'light' (koplampen en achterlichten, 's nachts niet donkerder).
// Voorkant = +z, onderkant = y 0 (op de grond of de rails).
import * as THREE from 'three';

// schaduw per richting van het vlak (zoals bij de blokken)
function shadeFor(nx, ny, nz) {
  if (ny > 0.5) return 1.0;
  if (ny < -0.5) return 0.5;
  if (Math.abs(nx) > Math.abs(nz)) return 0.8;
  return 0.68 + 0.04 * Math.sign(nz);
}

export class Parts {
  constructor() { this.p = { paint: [], trim: [], light: [], win: [] }; this.inside = 0; } // win = passagiersramen ('s nachts verlicht)
  // interieur (stoelen, stangen, handgrepen, binnenbekleding, plafond): apart bijgehouden, zodat er een lichte
  // versie zonder interieur gemaakt kan worden voor verre voertuigen (trimLo, zie done() en js/traffic.js)
  inner(fn) { this.inside++; try { fn(); } finally { this.inside--; } return this; }
  // doos (gecentreerd op x, y, z) — taper: bovenkant smaller/korter (voor ruiten en neuzen)
  box(kind, w, h, l, x, y, z, color = 0xffffff, taper = null) {
    const g = new THREE.BoxGeometry(w, h, l);
    if (taper) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) {
          pos.setX(i, pos.getX(i) * (taper.sx ?? 1));
          const zz = pos.getZ(i);
          // voor (+z) en achter (-z) apart inkorten
          pos.setZ(i, zz > 0 ? zz - (taper.front || 0) : zz + (taper.back || 0));
        }
      }
    }
    g.translate(x, y, z);
    this.add(kind, g, color);
    return this;
  }
  // wiel / cilinder met as langs x
  wheel(r, w, x, y, z, color = 0x1a1a1a, seg = 12) {
    const g = new THREE.CylinderGeometry(r, r, w, seg);
    g.rotateZ(Math.PI / 2); g.translate(x, y, z);
    this.add('trim', g, color);
    const hub = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, seg);
    hub.rotateZ(Math.PI / 2); hub.translate(x, y, z);
    this.add('trim', hub, 0x8d9196);
    return this;
  }
  add(kind, g, color) {
    g = g.toNonIndexed(); g.computeVertexNormals();
    const c = new THREE.Color(color), n = g.attributes.normal, cnt = g.attributes.position.count;
    const col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      const s = kind === 'light' ? 1 : shadeFor(n.getX(i), n.getY(i), n.getZ(i));
      col[i * 3] = c.r * s; col[i * 3 + 1] = c.g * s; col[i * 3 + 2] = c.b * s;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    if (kind === 'trim' && this.inside) (this.p.trimIn || (this.p.trimIn = [])).push(g);
    else this.p[kind].push(g);
  }
  done() {
    const out = {}, inn = this.p.trimIn;
    for (const [k, list] of Object.entries(this.p)) if (k !== 'trimIn') out[k] = list.length ? merge(list) : null;
    // volledig model = buitenkant + interieur; trimLo = alleen de buitenkant (LOD voor verre voertuigen)
    if (inn && inn.length) { out.trimLo = out.trim; out.trim = merge([...this.p.trim.map(g => g.clone()), ...inn]); }
    return out;
  }
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}

const GLASS = 0x26323d, GLASS_LIGHT = 0x5d7487, TYRE = 0x161616, DARK = 0x2b2d30, GREY = 0x8a8f95, CHROME = 0xc3c7cc;
const WINLIT = 0xffe9c4; // passagiersramen: overdag donker getint (materiaal), 's nachts warm verlicht
const HEAD = 0xfff4d6, TAIL = 0xd2151c, AMBER = 0xffb02e;

// ---------- auto's ----------
function carBase(P, { L, W, Hb, wheelR, cabin, cabinH, cabinBack, cabinFront, roofLen, wheelBase }) {
  const yb = wheelR * 0.75 + Hb / 2;
  P.box('paint', W, Hb, L, 0, yb, 0);                                           // carrosserie
  P.box('paint', W * 0.98, 0.12, L * 0.42, 0, yb + Hb / 2 + 0.03, L * 0.27);    // motorkap
  const cy = yb + Hb / 2 + cabinH / 2;
  P.box('trim', W * 0.86, cabinH, cabin, 0, cy, cabinBack, GLASS, { sx: 0.9, front: cabinFront, back: 0.12 });   // ramen
  P.box('paint', W * 0.84, 0.07, roofLen, 0, cy + cabinH / 2 + 0.03, cabinBack - 0.05);                          // dak
  P.box('trim', W + 0.02, 0.2, 0.14, 0, wheelR * 0.75 + 0.1, L / 2 + 0.02, DARK);    // bumpers
  P.box('trim', W + 0.02, 0.2, 0.14, 0, wheelR * 0.75 + 0.1, -L / 2 - 0.02, DARK);
  P.box('trim', W + 0.03, 0.1, L * 0.9, 0, wheelR * 0.8, 0, DARK);                   // sierlijst onderaan
  P.box('trim', 0.5, 0.12, 0.03, 0, yb - 0.05, L / 2 + 0.1, 0xf2f2f2);               // nummerplaten
  P.box('trim', 0.5, 0.12, 0.03, 0, yb - 0.05, -L / 2 - 0.1, 0xf2f2f2);
  P.box('trim', 0.08, 0.08, 0.16, W / 2 + 0.04, cy - cabinH / 2 + 0.05, cabinBack + cabin / 2 - 0.2, DARK); // spiegels
  P.box('trim', 0.08, 0.08, 0.16, -W / 2 - 0.04, cy - cabinH / 2 + 0.05, cabinBack + cabin / 2 - 0.2, DARK);
  P.box('light', 0.36, 0.12, 0.05, W / 2 - 0.3, yb + Hb / 2 - 0.12, L / 2 + 0.01, HEAD);
  P.box('light', 0.36, 0.12, 0.05, -W / 2 + 0.3, yb + Hb / 2 - 0.12, L / 2 + 0.01, HEAD);
  P.box('light', 0.32, 0.14, 0.05, W / 2 - 0.25, yb + Hb / 2 - 0.1, -L / 2 - 0.01, TAIL);
  P.box('light', 0.32, 0.14, 0.05, -W / 2 + 0.25, yb + Hb / 2 - 0.1, -L / 2 - 0.01, TAIL);
  for (const sz of [wheelBase / 2, -wheelBase / 2]) for (const sx of [W / 2 - 0.12, -W / 2 + 0.12]) P.wheel(wheelR, 0.24, sx, wheelR, sz, TYRE);
  // detail: velgen, grille, deurnaden en -klinken, zijruiten-stijl, spatborden
  for (const sz of [wheelBase / 2, -wheelBase / 2]) for (const sx of [W / 2 - 0.1, -W / 2 + 0.1]) P.wheel(wheelR * 0.62, 0.26, sx, wheelR, sz, 0xb8bec6, 10);
  P.box('trim', W * 0.5, 0.16, 0.04, 0, yb + 0.02, L / 2 + 0.03, 0x22252a);                                     // grille
  for (const sx of [W / 2 + 0.005, -W / 2 - 0.005]) {
    P.box('trim', 0.02, Hb * 0.8, 0.03, sx, yb + 0.02, cabinBack + 0.15, 0x2a2d32);                              // deurnaad
    P.box('trim', 0.03, 0.04, 0.16, sx + Math.sign(sx) * 0.01, yb + Hb * 0.25, cabinBack + 0.55, 0xc0c4c8);      // klink voor
    P.box('trim', 0.03, 0.04, 0.16, sx + Math.sign(sx) * 0.01, yb + Hb * 0.25, cabinBack - 0.45, 0xc0c4c8);      // klink achter
    P.box('trim', 0.03, cabinH * 0.9, 0.06, sx * 0.93, cy, cabinBack + 0.15, DARK);                               // B-stijl
  }
}
const CAR_MODELS = {
  sedan: () => { const P = new Parts(); carBase(P, { L: 4.6, W: 1.82, Hb: 0.62, wheelR: 0.33, cabin: 2.5, cabinH: 0.52, cabinBack: -0.25, cabinFront: 0.55, roofLen: 1.45, wheelBase: 2.75 }); return P.done(); },
  hatch: () => { const P = new Parts(); carBase(P, { L: 4.0, W: 1.76, Hb: 0.64, wheelR: 0.31, cabin: 2.6, cabinH: 0.56, cabinBack: -0.45, cabinFront: 0.5, roofLen: 1.9, wheelBase: 2.5 }); return P.done(); },
  suv: () => { const P = new Parts(); carBase(P, { L: 4.7, W: 1.92, Hb: 0.8, wheelR: 0.38, cabin: 2.9, cabinH: 0.6, cabinBack: -0.4, cabinFront: 0.45, roofLen: 2.3, wheelBase: 2.85 });
    P.box('trim', 0.05, 0.05, 1.9, 0.75, 1.98, -0.45, CHROME).box('trim', 0.05, 0.05, 1.9, -0.75, 1.98, -0.45, CHROME); return P.done(); },
  van: () => {
    const P = new Parts(), L = 5.1, W = 1.98, R = 0.34;
    P.box('paint', W, 1.6, L - 0.9, 0, 1.25, -0.45);                     // laadruimte
    P.box('paint', W, 0.75, 0.95, 0, 0.83, L / 2 - 0.47);                // neus
    P.box('trim', W * 0.94, 0.8, 0.9, 0, 1.6, L / 2 - 1.1, GLASS, { sx: 0.97, front: 0.45 }); // voorruit
    P.box('trim', W + 0.02, 0.55, 0.9, 0, 1.6, L / 2 - 1.45, GLASS);     // zijruiten cabine
    P.box('trim', W + 0.03, 0.12, L * 0.9, 0, 0.42, 0, DARK);
    P.box('trim', W + 0.02, 0.22, 0.14, 0, 0.42, L / 2 + 0.02, DARK).box('trim', W + 0.02, 0.22, 0.14, 0, 0.42, -L / 2 - 0.02, DARK);
    P.box('light', 0.3, 0.16, 0.05, W / 2 - 0.25, 0.95, L / 2 + 0.01, HEAD).box('light', 0.3, 0.16, 0.05, -W / 2 + 0.25, 0.95, L / 2 + 0.01, HEAD);
    P.box('light', 0.18, 0.4, 0.05, W / 2 - 0.12, 1.0, -L / 2 - 0.01, TAIL).box('light', 0.18, 0.4, 0.05, -W / 2 + 0.12, 1.0, -L / 2 - 0.01, TAIL);
    for (const sz of [1.6, -1.65]) for (const sx of [W / 2 - 0.13, -W / 2 + 0.13]) P.wheel(R, 0.25, sx, R, sz, TYRE);
    return P.done();
  },
  police: () => { const P = new Parts(); carBase(P, { L: 4.8, W: 1.84, Hb: 0.64, wheelR: 0.34, cabin: 2.5, cabinH: 0.52, cabinBack: -0.25, cabinFront: 0.55, roofLen: 1.5, wheelBase: 2.85 });
    P.box('trim', 1.86, 0.18, 3.6, 0, 0.8, 0, 0x1d3f9e); P.box('trim', 1.1, 0.1, 0.3, 0, 1.53, -0.25, 0x2b2d30); return P.done(); },
  ambulance: () => {
    const P = new Parts(), L = 5.8, W = 2.05, R = 0.36;
    P.box('paint', W, 1.9, L - 1.0, 0, 1.35, -0.5); P.box('paint', W, 0.8, 1.0, 0, 0.85, L / 2 - 0.5);
    P.box('trim', W * 0.94, 0.85, 0.9, 0, 1.75, L / 2 - 1.1, GLASS, { sx: 0.97, front: 0.45 });
    P.box('trim', W + 0.02, 0.25, L - 1.2, 0, 1.1, -0.5, 0x2a9d3a); P.box('trim', W + 0.02, 0.2, L - 1.2, 0, 1.4, -0.5, 0xf2c200);
    P.box('trim', W + 0.03, 0.12, L * 0.9, 0, 0.42, 0, DARK);
    P.box('light', 0.3, 0.16, 0.05, W / 2 - 0.25, 0.95, L / 2 + 0.01, HEAD).box('light', 0.3, 0.16, 0.05, -W / 2 + 0.25, 0.95, L / 2 + 0.01, HEAD);
    for (const sz of [1.8, -1.9]) for (const sx of [W / 2 - 0.13, -W / 2 + 0.13]) P.wheel(R, 0.25, sx, R, sz, TYRE);
    return P.done();
  },
  fire: () => {
    const P = new Parts(), L = 9, W = 2.5, R = 0.5;
    P.box('paint', W, 2.2, 2.2, 0, 1.6, L / 2 - 1.1); P.box('trim', W * 0.95, 0.9, 0.1, 0, 2.1, L / 2 + 0.01, GLASS);
    P.box('paint', W, 2.0, L - 2.4, 0, 1.6, -1.2); P.box('trim', W + 0.02, 0.15, L - 2.4, 0, 1.2, -1.2, 0xf2f2f2);
    P.box('trim', 0.6, 0.25, L - 1.5, 0.5, 2.8, -0.8, 0xc0c4c9); P.box('trim', 0.6, 0.25, L - 1.5, -0.5, 2.8, -0.8, 0xc0c4c9); // ladder
    for (let z = -L / 2 + 1; z < L / 2 - 1; z += 0.6) P.box('trim', 1.1, 0.08, 0.06, 0, 2.95, z, 0xc0c4c9);
    P.box('light', 0.3, 0.18, 0.05, W / 2 - 0.3, 0.9, L / 2 + 0.01, HEAD).box('light', 0.3, 0.18, 0.05, -W / 2 + 0.3, 0.9, L / 2 + 0.01, HEAD);
    for (const sz of [L / 2 - 1.4, -L / 2 + 1.6, -L / 2 + 3]) for (const sx of [W / 2 - 0.2, -W / 2 + 0.2]) P.wheel(R, 0.35, sx, R, sz, TYRE);
    return P.done();
  },
  taxi: () => { const P = new Parts(); carBase(P, { L: 4.7, W: 1.82, Hb: 0.62, wheelR: 0.33, cabin: 2.5, cabinH: 0.52, cabinBack: -0.25, cabinFront: 0.55, roofLen: 1.45, wheelBase: 2.8 });
    P.box('light', 0.6, 0.16, 0.22, 0, 1.6, -0.3, 0xfff1a8); return P.done(); },
};

// ---------- bus (12 m) ----------
function busModel() {
  const P = new Parts(), L = 12, W = 2.55;
  P.box('paint', W, 1.05, L, 0, 0.88, 0);                                  // onderkant
  P.box('win', W + 0.02, 1.2, L - 0.6, 0, 2.0, -0.2, WINLIT);               // ramenband
  P.box('paint', W, 0.38, L, 0, 2.79, 0);                                   // boven de ramen
  P.box('trim', W * 0.96, 0.2, L * 0.94, 0, 3.07, -0.2, 0xe9ebee);          // dak
  P.box('trim', 1.6, 0.3, 2.4, 0, 3.3, -2.2, 0xd5d8dc);                     // airco
  P.box('trim', W - 0.1, 1.55, 0.05, 0, 1.95, L / 2 + 0.01, GLASS);         // voorruit
  P.box('light', 1.7, 0.24, 0.05, 0, 2.82, L / 2 + 0.02, AMBER);           // bestemmingsbord
  P.box('trim', 0.05, 2.1, 1.25, W / 2 + 0.01, 1.4, L / 2 - 1.2, GLASS_LIGHT);  // deuren (rechts)
  P.box('trim', 0.05, 2.1, 1.25, W / 2 + 0.01, 1.4, 0.4, GLASS_LIGHT);
  P.box('trim', 0.05, 2.1, 1.25, W / 2 + 0.01, 1.4, -L / 2 + 2.4, GLASS_LIGHT);
  P.box('trim', W + 0.02, 0.28, 0.16, 0, 0.45, L / 2 + 0.03, DARK).box('trim', W + 0.02, 0.28, 0.16, 0, 0.45, -L / 2 - 0.03, DARK);
  P.box('light', 0.32, 0.18, 0.05, W / 2 - 0.3, 0.8, L / 2 + 0.03, HEAD).box('light', 0.32, 0.18, 0.05, -W / 2 + 0.3, 0.8, L / 2 + 0.03, HEAD);
  P.box('light', 0.2, 0.5, 0.05, W / 2 - 0.15, 1.1, -L / 2 - 0.03, TAIL).box('light', 0.2, 0.5, 0.05, -W / 2 + 0.15, 1.1, -L / 2 - 0.03, TAIL);
  P.box('trim', 0.1, 0.35, 0.1, W / 2 + 0.1, 2.2, L / 2 - 0.1, DARK).box('trim', 0.1, 0.35, 0.1, -W / 2 - 0.1, 2.2, L / 2 - 0.1, DARK); // spiegels
  for (const sz of [L / 2 - 2.6, -L / 2 + 3.2]) for (const sx of [W / 2 - 0.2, -W / 2 + 0.2]) P.wheel(0.5, 0.32, sx, 0.5, sz, TYRE);
  return P.done();
}

// ---------- bussen 2.0: stadsbus, gelede bus (voor- en achterwagen met balg), elektrische bus, touringcar, buurtbus ----------
// o = { L, H, front (neus met chauffeur), rear (achterkant met lichten), bellowFront (balg vooraan: achterwagen),
//       coach (hoge vloer, getinte ruiten, bagageruimte), electric (accu's op het dak), doors: [z…] }
function busBody(o) {
  const P = new Parts(), L = o.L, W = 2.55, H = o.H || 3.1, hz = L / 2;
  const floorY = o.coach ? 1.3 : 0.62;
  // holle bak (vroeger massieve blokken onder en boven de ramen): vloer, wandpanelen met lichte binnenbekleding
  P.box('trim', W - 0.12, 0.08, L - 0.2, 0, floorY - 0.04, 0, FLOOR);                                  // vloer
  P.box('paint', W, 0.3, L, 0, 0.5, 0);                                                              // schort onder de vloer
  P.box('trim', W + 0.02, 0.04, L - 0.2, 0, o.coach ? 1.6 : 1.42, 0, 0xc9cdd2);               // sierlijst
  const wy = o.coach ? 2.45 : 2.05, wh = o.coach ? 1.1 : 1.2;
  // ruiten met stijlen (niet over de deuren)
  for (const sx of [1, -1]) for (let z = -hz + 0.6; z < hz - (o.front ? 1.6 : 0.6); z += 1.55) {
    if ((o.doors || []).some(dz => Math.abs(z + 0.65 - dz) < 1.1)) continue;
    P.box('win', 0.04, wh, 1.35, sx * (W / 2 + 0.01), wy, z + 0.65, WINLIT);
    P.box('trim', 0.05, wh + 0.05, 0.12, sx * (W / 2 + 0.015), wy, z + 1.4, DARK);
  }
  const wTop = wy + wh / 2, wBot = wy - wh / 2;
  const bands = o.dd ? [[0.65, wBot, 'paint'], [wTop, 3.08, 'paint'], [4.03, H, 'paint']] : [[0.65, wBot, 'paint'], [wTop, H, 'paint']];
  hollowSides(P, { W, z0: -hz, z1: hz, doors: o.doors || [], DW: 1.25, bands, ceil: (o.dd ? 2.5 : H - 0.12) });
  for (const ez of [hz - 0.04, -hz + 0.04]) P.box('paint', W, wBot - 0.65, 0.08, 0, (wBot + 0.65) / 2, ez); // voor- en achterwand onder de ruit
  if (o.dd) P.box('trim', W - 0.16, 0.03, L - 0.3, 0, H - 0.12, 0, CEIL);                             // plafond boven
  P.box('trim', W * 0.95, 0.18, L * 0.96, 0, H + 0.05, 0, 0xe9ebee, { sx: 0.92 });            // dak
  if (o.electric) { P.box('trim', 2.0, 0.32, L * 0.55, 0, H + 0.3, -0.5, 0x6b7c8c); P.box('light', 0.5, 0.06, 0.4, 0.6, H + 0.47, 1.5, 0x5fe08a); }
  else P.box('trim', 1.6, 0.3, 2.4, 0, H + 0.28, -hz + 3, 0xd5d8dc);                         // airco
  if (o.gen2) {
    // nieuwe e-bus (TERRANOVA 14.2): doorlopende dakbekleding over de accu's, zwart frontmasker, ledlijn, glazen achterkant, wielkappen
    P.box('trim', W * 0.94, 0.42, L - 0.8, 0, H + 0.24, 0, 0xdde1e6, { sx: 0.9 });
    if (o.front) { P.box('trim', W + 0.02, H - 0.55, 0.05, 0, (H + 0.55) / 2 + 0.05, hz + 0.02, 0x101215); P.box('light', W - 0.4, 0.06, 0.05, 0, 0.95, hz + 0.04, HEAD); }
    if (o.rear) P.box('trim', W - 0.1, 1.4, 0.05, 0, 2.15, -hz - 0.03, GLASS);
    for (const sz of o.axles || [hz - 2.6, -hz + 3.2]) for (const sx of [1, -1]) P.box('trim', 0.03, 0.55, 1.1, sx * (W / 2 + 0.02), 0.62, sz, 0x2b2e33);
  }
  if (o.front) {
    P.box('trim', W - 0.1, H - 1.1, 0.06, 0, (H + 1.1) / 2 + 0.1, hz + 0.01, GLASS);          // grote voorruit
    P.box('light', 1.9, 0.26, 0.05, 0, H - 0.28, hz + 0.03, AMBER);                           // bestemmingsscherm (lijn en bestemming)
    P.box('light', 0.34, 0.18, 0.05, W / 2 - 0.3, 0.75, hz + 0.03, HEAD).box('light', 0.34, 0.18, 0.05, -W / 2 + 0.3, 0.75, hz + 0.03, HEAD);
    P.box('trim', W + 0.02, 0.3, 0.16, 0, 0.42, hz + 0.04, DARK);
    for (const sx of [1, -1]) { P.box('trim', 0.06, 0.06, 0.5, sx * (W / 2 + 0.25), H - 0.45, hz - 0.1, DARK); P.box('trim', 0.12, 0.45, 0.08, sx * (W / 2 + 0.48), H - 0.75, hz + 0.12, 0x101215); } // spiegels op armen
    P.box('trim', 0.5, 0.9, 0.5, -0.7, floorY + 0.6, hz - 1.1, 0x30343b);                      // chauffeursstoel en dashboard
    P.box('trim', W - 0.3, 0.35, 0.4, 0, floorY + 0.95, hz - 0.45, 0x22252a);
  }
  if (o.rear) {
    P.box('light', 0.22, 0.55, 0.05, W / 2 - 0.15, 1.15, -hz - 0.03, TAIL).box('light', 0.22, 0.55, 0.05, -W / 2 + 0.15, 1.15, -hz - 0.03, TAIL);
    P.box('light', 0.18, 0.12, 0.05, W / 2 - 0.15, 1.55, -hz - 0.03, 0xffa21a).box('light', 0.18, 0.12, 0.05, -W / 2 + 0.15, 1.55, -hz - 0.03, 0xffa21a); // richtingaanwijzers
    P.box('trim', W + 0.02, 0.3, 0.16, 0, 0.42, -hz - 0.04, DARK);
    P.box('trim', W - 0.2, 0.9, 0.05, 0, 2.2, -hz - 0.02, o.coach ? 0x1a2230 : GLASS);
  }
  if (o.bellowFront) P.box('trim', W - 0.25, H - 0.6, 0.9, 0, (H + 0.4) / 2, hz + 0.45, 0x1c1d20); // balg
  // interieur: stoelen in rijen, stangen, rolstoelplaats bij de middendeur
  for (let z = -hz + 1.2; z < hz - (o.front ? 2.2 : 0.8); z += 0.95) {
    if ((o.doors || []).some(dz => Math.abs(z - dz) < 1.6)) continue;
    for (const sx of [0.62, -0.62]) { P.box('trim', 0.5, 0.1, 0.45, sx * 1.15, floorY + 0.45, z, o.coach ? 0x3c4a73 : 0x2e5c9e); P.box('trim', 0.5, 0.6, 0.08, sx * 1.15, floorY + 0.8, z - 0.2, o.coach ? 0x3c4a73 : 0x2e5c9e); }
  }
  if (o.dd) {
    // dubbeldekker: tweede ramenband, bovenverdieping met stoelen en een trap achter de voordeur
    const y2 = 2.55, wy2 = 3.55;
    P.box('trim', W - 0.1, 0.12, L - 0.6, 0, y2, 0, 0x3a3e45);
    for (const sx of [1, -1]) for (let z = -hz + 0.5; z < hz - 0.5; z += 1.55) {
      P.box('win', 0.04, 0.95, 1.35, sx * (W / 2 + 0.01), wy2, z + 0.65, WINLIT);
      P.box('trim', 0.05, 1.0, 0.12, sx * (W / 2 + 0.015), wy2, z + 1.4, DARK);
    }
    if (o.front) P.box('trim', W - 0.2, 0.9, 0.06, 0, wy2, hz + 0.01, GLASS);               // panoramaruit boven
    for (let z = -hz + 1.0; z < hz - 1.2; z += 0.95) for (const sx of [0.62, -0.62]) { P.box('trim', 0.5, 0.1, 0.45, sx * 1.15, y2 + 0.45, z, 0xa8323a); P.box('trim', 0.5, 0.55, 0.08, sx * 1.15, y2 + 0.78, z - 0.2, 0xa8323a); }
    for (let i = 0; i < 7; i++) P.box('trim', 0.8, 0.12, 0.3, -0.75, 0.75 + i * 0.28, hz - 3.2 - i * 0.28, 0x55595f); // trap
  }
  if (o.regio) for (let z = -hz + 1.4; z < hz - 2.4; z += 1.9) for (const sx of [1, -1]) P.box('trim', 0.4, 0.06, 0.3, sx * 0.95, 2.75, z, 0x2a2d33); // bagagerekjes
  // stangen bij de deuren met stopknoppen, horizontale stangen met handgrepen (niet in een touringcar), scherm, rolstoelplaats
  if (!o.coach) {
    const ceilY = o.dd ? 2.5 : H - 0.12;
    for (const dz of o.doors || []) for (const sx of [0.45, -0.45]) { pole(P, sx, dz + 0.7, floorY, ceilY); P.box('light', 0.06, 0.08, 0.06, sx, floorY + 1.25, dz + 0.7, 0xff3b30); } // stopknop
    for (const sx of [0.62, -0.62]) { rail(P, sx, floorY + 1.75, -hz + 1, hz - 2.2); for (let z = -hz + 1.3; z < hz - 2.3; z += 0.7) strap(P, sx, floorY + 1.75, z); }
    P.box('trim', 0.6, 0.22, 0.05, 0, ceilY - 0.2, hz - 2.0, 0x16181c); P.box('light', 0.54, 0.16, 0.06, 0, ceilY - 0.2, hz - 2.0, 0x2b6cd8);   // scherm volgende halte
    if ((o.doors || []).length > 1) P.box('trim', 1.0, 0.012, 1.3, -0.6, floorY + 0.01, o.doors[1], 0x2f7fd0);                              // rolstoelplaats
  }
  if (o.front) P.box('win', 0.04, 1.2, 0.9, -0.15, floorY + 1.05, hz - 1.7, 0xffe9c4);                                                         // glazen wand achter de chauffeur
  // wielen
  const axles = o.axles || [hz - 2.6, -hz + 3.2];
  for (const sz of axles) for (const sx of [W / 2 - 0.2, -W / 2 + 0.2]) P.wheel(0.5, 0.32, sx, 0.5, sz, TYRE);
  if (o.coach) P.box('trim', 0.04, 0.7, L * 0.5, W / 2 + 0.02, 0.85, -0.5, 0x5a5e66).box('trim', 0.04, 0.7, L * 0.5, -W / 2 - 0.02, 0.85, -0.5, 0x5a5e66); // bagageluiken
  return P.done();
}
function busDoors(o) {
  const P = new Parts(), W = 2.55, h = o.coach ? 2.4 : 2.1, y = o.coach ? 1.65 : 1.4;
  for (const dz of o.doors || []) P.box('trim', 0.06, h, 1.25, W / 2 + 0.02, y, dz, GLASS_LIGHT);
  return { trim: P.done().trim };
}
export const BUS_TYPES = {
  busCity: { L: 12, front: true, rear: true, doors: [4.6, 0.3, -3.6] },
  busElec: { L: 12, front: true, rear: true, electric: true, doors: [4.6, 0.3, -3.6] },
  busArtF: { L: 11, front: true, rear: false, doors: [4.1, -0.2], axles: [2.9, -2.6] },
  busArtR: { L: 7, front: false, rear: true, bellowFront: true, doors: [1.2], axles: [-1.9] },
  busCoach: { L: 13, front: true, rear: true, coach: true, H: 3.6, doors: [5.4], axles: [3.9, -3.4, -4.7] },
  busMini: { L: 8, front: true, rear: true, H: 2.9, doors: [2.9, -1.2], axles: [2.2, -2.3] },
  busDD: { L: 11.5, front: true, rear: true, dd: true, H: 4.3, doors: [4.4, -0.4], axles: [3.2, -2.9] },
  busRegio: { L: 12.5, front: true, rear: true, regio: true, H: 3.25, doors: [4.9, -0.6], axles: [3.6, -3.2] },
  busNew: { L: 12, front: true, rear: true, electric: true, gen2: true, doors: [4.6, 0.3, -3.6] },
};

// ---------- tram (lagevloertram, gelede bakken) ----------
function tramSection(cab, gen2 = false) {
  const P = new Parts(), L = cab ? 7.6 : 7.0, W = 2.4;
  const zc = cab ? -0.3 : 0, Lb = cab ? L - 0.6 : L;
  // lagevloertram: holle bak, vloer op 0,38 m, grote ruiten, plafond met LED op 2,6 m
  const tz0 = zc - Lb / 2, tz1 = zc + Lb / 2, tdoors = [zc + 0.5, zc - 1.5];
  P.box('trim', W - 0.1, 0.1, Lb - 0.1, 0, 0.33, zc, FLOOR);                    // vloer
  P.box('paint', W, 0.3, Lb, 0, 0.2, zc);                                       // schort
  hollowSides(P, { W, z0: tz0, z1: tz1, doors: tdoors, DW: 1.35, bands: [[0.35, 1.0, 'paint'], [1.0, 2.35, 'win'], [2.35, 2.95, 'paint']], roof: 3.02, ceil: 2.62 });
  P.box('trim', W * 0.9, 0.22, Lb, 0, 3.15, zc, 0xb8bcc2);                      // dak
  // interieur: stoelen in groepen van 4 (tegenover elkaar), stangen met handgrepen, scherm, rolstoelplaats
  for (const sx of [1, -1]) { const zs = sx > 0 ? [zc - 2.6, zc + 2.4] : [zc + 1.6, zc + 2.6]; for (const z of zs) if (Math.abs(z - zc) < Lb / 2 - 0.4 && !tdoors.some(dz => Math.abs(z - dz) < 1)) seat(P, sx * 0.72, z, 0.38, z > zc ? 'z-' : 'z+'); }
  for (const dz of tdoors) for (const sx of [1, -1]) pole(P, sx * 0.4, dz, 0.38, 2.62);
  for (const sx of [1, -1]) { rail(P, sx * 0.62, 2.2, tz0 + 0.3, tz1 - 0.3); for (let z = tz0 + 0.5; z < tz1 - 0.3; z += 0.6) strap(P, sx * 0.62, 2.2, z); }
  P.box('trim', 0.5, 0.2, 0.05, 0, 2.4, zc + 1.0, 0x16181c); P.box('light', 0.44, 0.14, 0.06, 0, 2.4, zc + 1.0, 0x2b6cd8); // scherm volgende halte
  P.box('trim', 0.9, 0.012, 1.2, -0.6, 0.39, zc - 0.5, 0x2f7fd0);                                                      // rolstoelplaats
  P.box('trim', 0.05, 2.15, 1.3, W / 2 + 0.01, 1.4, zc + 0.5, GLASS_LIGHT);      // deur
  P.box('trim', 0.05, 2.15, 1.3, -W / 2 - 0.01, 1.4, zc - 1.5, GLASS_LIGHT);
  P.box('trim', W - 0.3, 0.45, 2.0, 0, 0.3, zc, DARK);                          // draaistel
  if (gen2) {
    // nieuwe generatie (TERRANOVA 14.2): dakbekleding over de apparatuur, zijschorten over de draaistellen, ledlijn
    P.box('trim', W * 0.86, 0.36, Lb - 0.4, 0, 3.32, zc, 0xd7dbe0, { sx: 0.88 });
    for (const sx of [1, -1]) P.box('paint', 0.05, 0.32, Lb - 0.3, sx * (W / 2 + 0.02), 0.28, zc);
    for (const sx of [1, -1]) P.box('trim', 0.03, 0.08, Lb - 0.4, sx * (W / 2 + 0.005), 2.45, zc, 0x2b2e33);
  }
  if (cab && gen2) {
    // wigvormige neus met zwart masker en omlopende voorruit
    P.box('paint', W, 0.8, 1.1, 0, 0.72, L / 2 - 0.55, 0xffffff, { sx: 0.9, front: 0.45 });
    P.box('trim', W - 0.04, 1.85, 0.95, 0, 2.0, L / 2 - 0.62, 0x101215, { sx: 0.84, front: 0.7 });
    P.box('trim', W - 0.4, 1.35, 0.06, 0, 2.05, L / 2 - 0.1, GLASS);
    P.box('light', W - 0.5, 0.07, 0.05, 0, 1.05, L / 2 - 0.02, HEAD);
    P.box('light', 1.5, 0.2, 0.05, 0, 2.9, L / 2 - 0.35, AMBER);
    P.box('trim', W + 0.02, 0.25, 0.15, 0, 0.3, L / 2 + 0.02, DARK);
  } else if (cab) {
    // afgeronde neus met grote voorruit
    P.box('paint', W, 0.95, 0.9, 0, 0.78, L / 2 - 0.45, 0xffffff, { sx: 0.92, front: 0.1 });
    P.box('trim', W - 0.1, 1.5, 0.75, 0, 1.98, L / 2 - 0.45, GLASS, { sx: 0.88, front: 0.4 });
    P.box('paint', W * 0.94, 0.4, 0.55, 0, 2.9, L / 2 - 0.62);
    P.box('light', 1.4, 0.18, 0.05, 0, 2.82, L / 2 - 0.33, AMBER);               // lijnnummer
    P.box('light', 0.28, 0.14, 0.05, W / 2 - 0.35, 0.75, L / 2 + 0.01, HEAD).box('light', 0.28, 0.14, 0.05, -W / 2 + 0.35, 0.75, L / 2 + 0.01, HEAD);
    P.box('trim', W + 0.02, 0.25, 0.15, 0, 0.32, L / 2 + 0.02, DARK);
  } else {
    // stroomafnemer (pantograaf) op het dak
    P.box('trim', 1.6, 0.2, 1.2, 0, 3.45, 0, DARK);
    P.box('trim', 0.08, 0.08, 1.9, 0, 4.0, 0.35, GREY, null);
    const arm = new THREE.BoxGeometry(0.07, 0.07, 1.25); arm.rotateX(-0.55); arm.translate(0, 3.75, 0.15); P.add('trim', arm, GREY);
    const arm2 = new THREE.BoxGeometry(0.07, 0.07, 1.25); arm2.rotateX(0.55); arm2.translate(0, 4.05, 0.7); P.add('trim', arm2, GREY);
    P.box('trim', 1.6, 0.06, 0.12, 0, 4.4, 0.95, DARK);
  }
  // open doorloop naar de volgende bak: balg als ring (wanden, dak, vloer), je kijkt en loopt erdoor
  { const bz = zc - Lb / 2 - 0.12; for (const sx of [1, -1]) P.box('trim', 0.12, 2.3, 0.25, sx * (W / 2 - 0.12), 1.5, bz, 0x222428); P.box('trim', W - 0.1, 0.25, 0.25, 0, 2.7, bz, 0x222428); P.box('trim', W - 0.3, 0.06, 0.3, 0, 0.36, bz, FLOOR); }
  return P.done();
}

// ---------- treinen ----------
function trainCar({ L, W = 2.9, H = 3.9, cab = false, stripe = null, doubleDeck = false }) {
  const P = new Parts();
  const zb = cab ? -0.8 : 0, Lb = cab ? L - 1.6 : L;
  P.box('trim', W - 0.4, 0.55, Lb - 1, 0, 0.55, zb, 0x33363a);                   // onderbak
  // holle bak: zijwanden met ruiten tussen stijlen, openingen bij de deuren, plafond met LED (vroeger één massief blok)
  const tdz = [Lb / 2 - 1.4, -Lb / 2 + 1.4].map(z => zb + z), z0 = zb - Lb / 2, z1 = zb + Lb / 2;
  P.box('paint', W, 0.12, Lb, 0, 0.86, zb);                                                  // vloerrand
  if (doubleDeck) {
    hollowSides(P, { W, z0, z1, doors: tdz, DW: 1.15, bands: [[0.9, 1.15, 'paint'], [1.15, 1.97, 'win'], [1.97, 2.75, 'paint'], [2.75, 3.57, 'win'], [3.57, H - 0.15, 'paint']], roof: H - 0.08, ceil: H - 0.3 });
    P.box('trim', W * 0.86, 0.3, Lb, 0, H - 0.05, zb, 0x9ea3a8, { sx: 0.8 });
  } else {
    hollowSides(P, { W, z0, z1, doors: tdz, DW: 1.15, bands: [[0.9, 1.87, 'paint'], [1.87, 2.83, 'win'], [2.83, H - 0.35, 'paint']], roof: H - 0.3, ceil: 3.45 });
    P.box('trim', W * 0.9, 0.35, Lb, 0, H - 0.25, zb, 0xc6cacf, { sx: 0.82 });   // dak
  }
  for (const ez of [z0, z1]) { for (const sx of [1, -1]) P.box('trim', 0.9, H - 1.3, 0.06, sx * 0.95, 0.9 + (H - 1.3) / 2, ez, 0xd9dde2); P.box('trim', W - 0.2, 0.5, 0.06, 0, H - 0.6, ez, 0xd9dde2); } // kopwanden
  if (stripe) for (const sx of [1, -1]) P.box('trim', 0.03, 0.22, Lb - 0.6, sx * (W / 2 + 0.005), 1.35, zb, stripe); // sierstreep alleen op de buitenwanden
  // deuren
  for (const dz of [Lb / 2 - 1.4, -Lb / 2 + 1.4]) {
    P.box('trim', 0.04, 2.0, 1.1, W / 2 + 0.01, 1.85, zb + dz, 0x5f6670).box('trim', 0.04, 2.0, 1.1, -W / 2 - 0.01, 1.85, zb + dz, 0x5f6670);
  }
  // draaistellen met wielen
  for (const bz of [Lb / 2 - 3, -Lb / 2 + 3]) {
    P.box('trim', W - 0.5, 0.45, 2.8, 0, 0.45, zb + bz, 0x26282b);
    for (const wz of [0.9, -0.9]) for (const wx of [0.75, -0.75]) P.wheel(0.46, 0.14, wx, 0.46, zb + bz + wz, 0x3a3c40, 10);
  }
  P.box('trim', W - 0.4, H - 1.2, 0.3, 0, 0.8 + (H - 1.2) / 2, zb - Lb / 2 - 0.15, 0x1c1d20); // overgang
  // interieur (zichtbaar door de ramen en als je meerijdt): vloer, stoelrijen 2+2 met hoofdsteunen en tafeltjes,
  // bagagerekken, verlichting, infoschermen, toilet en tussendeuren
  const floors = doubleDeck ? [1.05, 2.65] : [1.25];
  P.inside++; // alles hieronder tot de cabine is interieur (niet in de verre LOD-versie)
  for (const fy of floors) {
    P.box('trim', W - 0.25, 0.06, Lb - 0.6, 0, fy, zb, 0x4a4e55);
    const seatC = cab ? 0x8a2a2e : 0x2e4f8e;
    for (let z = -Lb / 2 + 2.6; z < Lb / 2 - 2.6; z += 1.0) {
      if (Math.abs(z) < 0.5 && !doubleDeck) continue;
      for (const sx of [0.95, 0.5, -0.5, -0.95]) {
        P.box('trim', 0.42, 0.1, 0.45, sx, fy + 0.45, zb + z, seatC);
        P.box('trim', 0.42, 0.62, 0.08, sx, fy + 0.8, zb + z - 0.22, seatC);
        P.box('trim', 0.3, 0.12, 0.08, sx, fy + 1.15, zb + z - 0.22, 0xd8dade);  // hoofdsteun
      }
      if (Math.round(z * 2) % 4 === 0) for (const sx of [0.72, -0.72]) P.box('trim', 0.8, 0.05, 0.5, sx, fy + 0.72, zb + z + 0.5, 0x6b5a46); // tafeltje
    }
    for (const sx of [1.05, -1.05]) P.box('trim', 0.4, 0.05, Lb - 3, sx, fy + 1.55, zb, 0x9aa0a8);                  // bagagerek
    P.box('light', 0.25, 0.03, Lb - 2, 0, fy + (doubleDeck ? 1.45 : 2.25), zb, 0xf4f6ff);                              // plafondlicht
    P.box('light', 0.6, 0.3, 0.05, 0, fy + 1.6, zb + Lb / 2 - 2.0, 0x2a6cff);                                          // infoscherm
  }
  P.box('trim', 1.0, 2.0, 1.4, 0.75, floors[0] + 1.0, zb - Lb / 2 + 1.6, 0xd9dbe0);                                    // toilet
  P.box('trim', 0.9, 2.0, 0.06, 0, floors[0] + 1.0, zb + Lb / 2 - 0.4, 0x7a8088);                                     // tussendeur
  P.inside--;
  if (cab) {
    // gestroomlijnde neus
    P.box('paint', W, H - 1.25, 1.7, 0, 0.8 + (H - 1.25) / 2, L / 2 - 0.85, 0xffffff, { sx: 0.82, front: 1.2 });
    P.box('trim', W * 0.8, 0.75, 1.2, 0, H - 1.0, L / 2 - 1.15, GLASS, { sx: 0.8, front: 0.6 });
    P.box('trim', W - 0.4, 0.45, 1.6, 0, 0.55, L / 2 - 0.9, 0x33363a, { sx: 0.9, front: 0.6 });
    P.box('light', 0.35, 0.16, 0.05, 0.85, 1.25, L / 2 - 0.05, HEAD).box('light', 0.35, 0.16, 0.05, -0.85, 1.25, L / 2 - 0.05, HEAD);
    if (stripe) P.box('trim', W * 0.85, 0.2, 1.4, 0, 1.35, L / 2 - 0.9, stripe, { sx: 0.9, front: 0.4 });
    // pantograaf
    P.box('trim', 1.5, 0.2, 1.4, 0, H + 0.1, -L / 2 + 4, DARK);
    const a1 = new THREE.BoxGeometry(0.07, 0.07, 1.5); a1.rotateX(-0.5); a1.translate(0, H + 0.45, -L / 2 + 3.7); P.add('trim', a1, GREY);
    const a2 = new THREE.BoxGeometry(0.07, 0.07, 1.5); a2.rotateX(0.5); a2.translate(0, H + 0.85, -L / 2 + 4.3); P.add('trim', a2, GREY);
    P.box('trim', 1.7, 0.06, 0.12, 0, H + 1.2, -L / 2 + 4.6, DARK);
  }
  return P.done();
}

// ---------- metro (met interieur: je kan erin meerijden) ----------
// ---------- gedeelde interieuronderdelen (metro, tram, bus, trein) ----------
// Alle maten in m. Stoel: zitting, rugleuning en hoofdsteun (geen massief blok); face = richting waarin je kijkt.
const FABRIC = 0x2f4d7a, FABRIC_DARK = 0x1d2e4b, PRIORITY = 0xa8323a, POLE = 0xd6dade, CEIL = 0xe9ecef, FLOOR = 0x3c424b;
export function seat(P, x, z, floor, face, color = FABRIC, head = FABRIC_DARK) { P.inner(() => seatIn(P, x, z, floor, face, color, head)); }
function seatIn(P, x, z, floor, face, color, head) {
  // face: 'x+', 'x-', 'z+', 'z-' (kijkrichting); de rugleuning zit aan de andere kant
  const ax = face[0] === 'x', sg = face[1] === '+' ? 1 : -1;
  const back = (d) => ax ? [x - sg * d, z] : [x, z - sg * d];
  P.box('trim', ax ? 0.44 : 0.46, 0.09, ax ? 0.46 : 0.44, x, floor + 0.44, z, color);                  // zitting
  const [bx, bz] = back(0.21); P.box('trim', ax ? 0.07 : 0.46, 0.58, ax ? 0.46 : 0.07, bx, floor + 0.79, bz, color); // rugleuning
  const [hx, hz] = back(0.22); P.box('trim', ax ? 0.08 : 0.34, 0.16, ax ? 0.34 : 0.08, hx, floor + 1.17, hz, head);  // hoofdsteun
  P.box('trim', ax ? 0.3 : 0.06, 0.38, ax ? 0.06 : 0.3, x, floor + 0.2, z, 0x6b7079);                // poot / steun
}
export function pole(P, x, z, y0, y1) { P.inside++; const g = new THREE.CylinderGeometry(0.022, 0.022, y1 - y0, 8); g.translate(x, (y0 + y1) / 2, z); P.add('trim', g, POLE); P.inside--; }
export function rail(P, x, y, z0, z1) { P.inside++; const g = new THREE.CylinderGeometry(0.02, 0.02, Math.abs(z1 - z0), 8); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); P.add('trim', g, POLE); P.inside--; }
export function strap(P, x, y, z) { P.inside++; P.box('trim', 0.02, 0.16, 0.02, x, y - 0.08, z, 0x30343a); P.box('trim', 0.03, 0.09, 0.11, x, y - 0.21, z, 0xf2c94c); P.inside--; } // handgreep
// holle zijwanden: banden van onder naar boven (paneel in de lakkleur met lichte binnenbekleding, of ruiten met stijlen),
// openingen bij de deuren, dak en plafond met LED. o: { W, z0, z1, doors: [z], DW, bands: [[y0, y1, 'paint'|'win']], roof, ceil }
export function hollowSides(P, o) {
  const hw = o.W / 2, DW = o.DW || 1.3, cuts = [o.z0, ...(o.doors || []).flatMap(dz => [dz - DW / 2, dz + DW / 2]), o.z1];
  for (const sx of [1, -1]) {
    const x = sx * (hw - 0.04);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1], len = b - a, c = (a + b) / 2; if (len < 0.15) continue;
      for (const [y0, y1, kind] of o.bands) {
        const h = y1 - y0, yc = (y0 + y1) / 2;
        if (kind === 'win') { const n = Math.max(1, Math.round(len / 1.5)), pw = len / n; for (let k = 0; k < n; k++) { P.box('win', 0.03, h - 0.04, pw - 0.1, x + sx * 0.02, yc, a + pw * (k + 0.5), 0xffe9c4); P.box('trim', 0.09, h, 0.09, x, yc, a + pw * k, 0x3a3f46); } P.box('trim', 0.09, h, 0.09, x, yc, b, 0x3a3f46); }
        else { P.box('paint', 0.08, h, len, x, yc, c); P.inner(() => P.box('trim', 0.02, h - 0.02, len, x - sx * 0.05, yc, c, 0xdfe3e8)); }
      }
    }
    // boven de deuren doorlopend paneel
    const top = o.bands[o.bands.length - 1]; P.box('paint', 0.08, top[1] - top[0], o.z1 - o.z0, x, (top[0] + top[1]) / 2, (o.z0 + o.z1) / 2);
  }
  const L = o.z1 - o.z0, zc = (o.z0 + o.z1) / 2;
  if (o.roof) P.box('trim', o.W * 0.9, 0.12, L, 0, o.roof, zc, 0xc8ccd1);
  if (o.ceil) { P.inner(() => P.box('trim', o.W - 0.16, 0.03, L - 0.2, 0, o.ceil, zc, CEIL)); for (const sx of [0.45, -0.45]) P.box('light', 0.1, 0.02, L - 0.8, sx * o.W / 2.4, o.ceil - 0.025, zc, 0xf4f6ff); }
}
// ---------- metro (Megatower City, ook de andere verkeerswerelden) ----------
// Holle bak (dunne wanden, ruiten tussen stijlen), vloer op 1,1 m, plafond met LED op 2,9 m, deuren als losse
// schuivende deurbladen (METRO_LEAVES), interieur met afwisselende zitopstelling, rolstoelplaats, stangen,
// handgrepen, deurknoppen, noodintercom, routekaarten, informatieschermen en tussendeuren.
const M_L = 18, M_W = 2.8, M_FL = 0.9, M_CEIL = 3.05; // binnenhoogte 2,15 m
function metroDoorZ(cab) { const Lb = cab ? M_L - 0.6 : M_L, zb = cab ? -0.3 : 0; return [-Lb / 2 + 3, 0, Lb / 2 - 3].map(z => z + zb); }
export const METRO_LEAVES = {}; // per model: deurbladen { x, y, z, dir } (dicht); schuiven 0,62 m opzij
// zitplaatsen voor de passagierscamera: lokale z (vooruit = +z), afstand tot de as en kijkrichting (x- = naar de overkant)
export const SEAT_SPOTS = { metroMid: [{ z: -7.85, lat: 0.9 }, { z: 7.6, lat: 0.9 }], metroCab: [{ z: -7.85, lat: 0.9 }] };
function metroCar(cab, doorsOnly, gen2 = false) {
  const P = new Parts(), L = M_L, W = M_W, hw = W / 2, zb = cab ? -0.3 : 0, Lb = cab ? L - 0.6 : L, z0 = zb - Lb / 2, z1 = zb + Lb / 2;
  const doorZ = metroDoorZ(cab), DW = 1.32; // deuropening
  if (doorsOnly) { const Q = new Parts(); for (const dz of doorZ) for (const sx of [1, -1]) Q.box('trim', 0.06, 2.0, 1.3, sx * (hw + 0.01), 2.1, dz, 0x9aa3ad); return Q.done().trim; }
  const inDoor = (z, m = 0) => doorZ.some(dz => Math.abs(z - dz) < DW / 2 + m);
  // ---- buitenkant: onderstel, draaistellen, vloer ----
  P.box('trim', W - 0.4, 0.5, Lb - 2, 0, 0.55, zb, 0x26282b);
  for (const bz of [Lb / 2 - 3, -Lb / 2 + 3]) { P.box('trim', 2.3, 0.35, 2.4, 0, 0.42, zb + bz, 0x303236); for (const wz of [0.9, -0.9]) for (const wx of [0.75, -0.75]) P.wheel(0.4, 0.12, wx, 0.4, zb + bz + wz, 0x3a3c40, 10); }
  P.box('trim', W - 0.12, 0.12, Lb - 0.1, 0, M_FL - 0.06, zb, FLOOR);                                   // vloer
  P.box('trim', 0.5, 0.005, Lb - 1, 0, M_FL + 0.003, zb, 0x4a515b);                                    // middenstrook
  // ---- zijwanden: onder de ramen (lijnkleur), ruiten met stijlen, boven de ramen, dak ----
  for (const sx of [1, -1]) {
    const x = sx * (hw - 0.04);
    // segmenten tussen de deuren
    const cuts = [z0, ...doorZ.flatMap(dz => [dz - DW / 2, dz + DW / 2]), z1];
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1], len = b - a, c = (a + b) / 2; if (len < 0.2) continue;
      P.box('paint', 0.08, 0.55, len, x, 1.22, c);                                                       // borstwering (lijnkleur)
      P.box('trim', 0.02, 0.6, len, x - sx * 0.05, M_FL + 0.33, c, 0xdfe3e8);                            // binnenbekleding (licht)
      P.box('trim', 0.06, 0.04, len, x - sx * 0.04, 1.52, c, 0xb9bec5);                                  // vensterbank
      // ruiten van ± 1,6 m met stijlen
      const n = Math.max(1, Math.round(len / 1.6)), pw = len / n;
      for (let k = 0; k < n; k++) { const zc = a + pw * (k + 0.5); P.box('win', 0.03, 1.02, pw - 0.12, x + sx * 0.02, 2.06, zc, 0xffe9c4); P.box('trim', 0.09, 1.06, 0.1, x, 2.06, a + pw * k, 0x3a3f46); }
      P.box('trim', 0.09, 1.06, 0.1, x, 2.06, b, 0x3a3f46);
    }
    P.box('paint', 0.08, 0.5, Lb, x, 2.84, zb);                                                          // boven de ramen / deuren
    P.box('trim', 0.02, 0.47, Lb - 0.2, x - sx * 0.05, 2.82, zb, 0xdfe3e8);                              // binnenbekleding
    P.box('trim', 0.1, 0.14, Lb, x, 3.12, zb, 0xc0c4c9);                                                 // dakrand
    // deurkozijnen (binnen en buiten), deurknoppen, noodintercom
    for (const dz of doorZ) {
      for (const e of [-1, 1]) P.box('trim', 0.1, 2.12, 0.08, x, M_FL + 1.06, dz + e * (DW / 2 + 0.02), 0x2f3338);
      P.box('trim', 0.1, 0.1, DW + 0.1, x, M_FL + 2.12, dz, 0x2f3338);
      for (const e of [-1, 1]) P.box('light', 0.04, 0.09, 0.09, x - sx * 0.07, 1.95, dz + e * (DW / 2 + 0.14), 0x4ee07a); // deurknop
      P.box('light', 0.03, 0.12, 0.08, x - sx * 0.07, 1.72, dz - DW / 2 - 0.32, 0xff3b30);                                // noodintercom
      P.box('trim', 0.03, 0.12, 0.08, x - sx * 0.065, 1.55, dz - DW / 2 - 0.32, 0xf2c94c);
    }
  }
  // dak (afgerond), plafond met LED-lijnen
  P.box('trim', W * 0.86, 0.12, Lb, 0, 3.32, zb, 0xc8ccd1); for (const sx of [1, -1]) P.box('trim', 0.3, 0.16, Lb, sx * (hw - 0.22), 3.2, zb, 0xc0c4c9);
  P.box('trim', W - 0.16, 0.03, Lb - 0.3, 0, M_CEIL, zb, CEIL);
  for (const sx of [0.55, -0.55]) P.box('light', 0.12, 0.02, Lb - 1, sx, M_CEIL - 0.025, zb, 0xf4f6ff);
  for (let z = z0 + 1.5; z < z1 - 1; z += 3) P.box('trim', 0.6, 0.06, 0.5, 0, M_CEIL - 0.04, z, 0xd2d6db);   // ventilatieroosters
  // ---- interieur: zitplaatsen per vak tussen de deuren ----
  const bays = []; { const cuts = [z0 + (cab ? 2.6 : 0.35), ...doorZ.flatMap(dz => [dz - DW / 2 - 0.15, dz + DW / 2 + 0.15]), z1 - 0.35]; for (let i = 0; i + 1 < cuts.length; i += 2) bays.push([cuts[i], cuts[i + 1]]); }
  bays.forEach(([a, b], bi) => {
    const len = b - a, mid = (a + b) / 2;
    const wheelchair = bi === 1; // rolstoel- en kinderwagenplaats in het tweede vak (bij de middendeur)
    if (len > 3.6) {
      // middenvakken: groepen van 4 tegenover elkaar (2 + 2), aan beide kanten; daartussen staanplaats
      for (const sx of [1, -1]) {
        if (wheelchair && sx < 0) { // rolstoelplaats: geen stoelen, wel klapstoel, leuning en vloermarkering
          P.box('trim', 1.0, 0.012, 1.3, sx * 0.8, M_FL + 0.01, mid, 0x2f7fd0); P.box('trim', 0.04, 0.6, 1.2, sx * (hw - 0.12), M_FL + 0.7, mid, 0x5a6270);
          rail(P, sx * (hw - 0.2), M_FL + 0.95, mid - 0.6, mid + 0.6); P.box('trim', 0.4, 0.06, 0.4, sx * (hw - 0.35), M_FL + 0.5, mid - 0.9, FABRIC); continue;
        }
        for (const c of [mid - 0.75, mid + 0.75]) {
          const face = c < mid ? 'z+' : 'z-';
          for (const lx of [hw - 0.42, hw - 0.9]) seat(P, sx * lx, c + (c < mid ? -0.25 : 0.25), M_FL, face, bi === 0 || bi === bays.length - 1 ? PRIORITY : FABRIC);
        }
        pole(P, sx * 0.62, mid, M_FL, M_CEIL);
      }
    } else {
      // eindvakken: banken in de lengte langs de wand (kijken naar het middenpad)
      for (const sx of [1, -1]) for (let z = a + 0.3; z < b - 0.2; z += 0.5) seat(P, sx * (hw - 0.36), z, M_FL, sx > 0 ? 'x-' : 'x+');
    }
    // horizontale stangen boven de stoelen met handgrepen
    for (const sx of [1, -1]) { rail(P, sx * 0.7, M_FL + 1.78, a + 0.1, b - 0.1); for (let z = a + 0.35; z < b - 0.2; z += 0.55) strap(P, sx * 0.7, M_FL + 1.78, z); }
    // routekaart boven de ramen (wit met de lijn in de lijnkleur)
    for (const sx of [1, -1]) { P.box('trim', 0.02, 0.22, Math.min(1.6, len - 0.4), sx * (hw - 0.09), 2.8, mid, 0xf4f4f2); P.box('paint', 0.025, 0.03, Math.min(1.4, len - 0.6), sx * (hw - 0.1), 2.8, mid); }
  });
  // verticale stangen bij elke deur, informatieschermen boven de deuren
  for (const dz of doorZ) { for (const sx of [1, -1]) pole(P, sx * 0.5, dz, M_FL, M_CEIL); P.box('trim', 0.7, 0.24, 0.06, 0, 2.82, dz, 0x16181c); for (const fz of [0.035, -0.035]) P.box('light', 0.62, 0.17, 0.005, 0, 2.82, dz + fz, 0x2b6cd8); }
  // kopwanden met tussendeur (glas) naar het volgende rijtuig, balg aan de buitenkant
  const endWall = (z, sgn) => {
    for (const sx of [1, -1]) P.box('trim', 0.86, 2.0, 0.06, sx * 0.97, M_FL + 1.0, z, 0xd9dde2);
    P.box('trim', W - 0.2, M_CEIL - M_FL - 2.0, 0.06, 0, M_FL + 2.0 + (M_CEIL - M_FL - 2.0) / 2, z, 0xd9dde2);
    P.box('win', 1.0, 1.0, 0.02, 0, M_FL + 1.45, z, 0xffe9c4); P.box('trim', 1.04, 0.95, 0.04, 0, M_FL + 0.48, z, 0xa7adb5); // glazen tussendeur
    P.box('trim', W - 0.3, 2.6, 0.25, 0, 1.9, z + sgn * 0.16, 0x222428);                                                   // balg
  };
  endWall(z0, -1); if (!cab) endWall(z1, 1);
  if (cab && gen2) {
    // nieuwe generatie (TERRANOVA 14.2): schuine neus met omlopende voorruit in een zwart masker, ledlijn als koplamp
    P.box('paint', W, 1.2, 0.9, 0, 1.1, L / 2 - 0.45, 0xffffff, { sx: 0.9, front: 0.35 });
    P.box('trim', W - 0.05, 1.75, 0.8, 0, 2.45, L / 2 - 0.55, 0x101215, { sx: 0.86, front: 0.55 });     // zwart masker
    P.box('trim', W - 0.35, 1.25, 0.06, 0, 2.5, L / 2 - 0.12, GLASS);                                   // voorruit
    for (const sx of [1, -1]) P.box('trim', 0.05, 1.1, 0.7, sx * (W / 2 - 0.1), 2.45, L / 2 - 0.7, GLASS); // omlopend zijglas
    P.box('light', W - 0.5, 0.07, 0.05, 0, 1.55, L / 2 - 0.02, HEAD);                                 // ledlijn
    P.box('light', 1.8, 0.24, 0.05, 0, 3.12, L / 2 - 0.3, AMBER);
    P.box('trim', 1.6, 0.85, 0.6, 0, M_FL + 0.45, L / 2 - 1.1, 0x30333a); P.box('trim', 0.5, 0.5, 0.5, 0.45, M_FL + 0.3, L / 2 - 1.8, 0x1f2328);
    const pz = z1; for (const sx of [1, -1]) P.box('trim', 0.9, M_CEIL - M_FL, 0.06, sx * 0.95, (M_FL + M_CEIL) / 2, pz, 0xd9dde2);
    P.box('win', 1.0, 0.8, 0.02, 0, M_FL + 1.5, pz, 0xffe9c4); P.box('trim', 1.0, 1.0, 0.05, 0, M_FL + 0.5, pz, 0x7b818a); P.box('trim', 1.0, 0.4, 0.05, 0, M_CEIL - 0.2, pz, 0xd9dde2);
  }
  if (gen2) for (const sx of [1, -1]) P.box('trim', 0.03, 0.1, Lb - 0.4, sx * (hw + 0.005), 1.58, zb, 0xf2f2f2); // witte sierstreep langs de ramen
  if (gen2) P.box('trim', W * 0.7, 0.18, Lb - 1.5, 0, 3.47, zb, 0xb4b9bf);                                   // dakbekleding
  if (cab && !gen2) {
    // cabine vooraan: neus, voorruit, lichten, bestemmingsscherm; scheidingswand met deur en ruit
    P.box('paint', W, 1.45, 0.7, 0, 1.25, L / 2 - 0.35, 0xffffff, { sx: 0.92, front: 0.15 });
    P.box('trim', W - 0.2, 1.3, 0.6, 0, 2.35, L / 2 - 0.4, GLASS, { sx: 0.9, front: 0.25 });
    P.box('paint', W * 0.9, 0.45, 0.5, 0, 3.1, L / 2 - 0.45);
    P.box('light', 1.6, 0.26, 0.05, 0, 3.02, L / 2 - 0.05, AMBER);
    P.box('light', 0.3, 0.16, 0.05, 0.95, 0.95, L / 2 + 0.01, HEAD).box('light', 0.3, 0.16, 0.05, -0.95, 0.95, L / 2 + 0.01, HEAD);
    P.box('trim', 1.6, 0.85, 0.6, 0, M_FL + 0.45, L / 2 - 1.1, 0x30333a);   // bestuurderspult
    P.box('trim', 0.5, 0.5, 0.5, 0.45, M_FL + 0.3, L / 2 - 1.8, 0x1f2328); // stoel bestuurder
    const pz = z1; for (const sx of [1, -1]) P.box('trim', 0.9, M_CEIL - M_FL, 0.06, sx * 0.95, (M_FL + M_CEIL) / 2, pz, 0xd9dde2);
    P.box('win', 1.0, 0.8, 0.02, 0, M_FL + 1.5, pz, 0xffe9c4); P.box('trim', 1.0, 1.0, 0.05, 0, M_FL + 0.5, pz, 0x7b818a); P.box('trim', 1.0, 0.4, 0.05, 0, M_CEIL - 0.2, pz, 0xd9dde2);
  }
  // deurbladen (los, schuivend): twee per deur per kant
  METRO_LEAVES[(gen2 ? 'metro2' : 'metro') + (cab ? 'Cab' : 'Mid')] = doorZ.flatMap(dz => [1, -1].flatMap(sx => [{ x: sx * (hw - 0.02), z: dz - DW / 4, dir: -1, side: sx }, { x: sx * (hw - 0.02), z: dz + DW / 4, dir: 1, side: sx }]));
  return P.done();
}
function metroLeaf() {
  const P = new Parts();
  P.box('trim', 0.05, 2.02, 0.64, 0, M_FL + 1.01, 0, 0xb3bac2);                // deurblad
  P.box('win', 0.055, 1.0, 0.44, 0, M_FL + 1.45, 0, 0xffe9c4);                // ruit in de deur
  P.box('trim', 0.06, 0.03, 0.5, 0, M_FL + 0.9, 0, 0xffd400);                 // waarschuwingsstreep
  return P.done();
}

// ---------- mensen ----------
function personParts() {
  const mk = (w, h, d, ty, color) => { const P = new Parts(); P.box('paint', w, h, d, 0, ty, 0, color); return P.done().paint; };
  return {
    // benen en armen draaien rond heup/schouder (oorsprong bovenaan)
    leg: mk(0.17, 0.86, 0.19, -0.43, 0xffffff),
    shoe: (() => { const P = new Parts(); P.box('trim', 0.18, 0.1, 0.28, 0, -0.85, 0.04, 0x1d1d1f); return P.done().trim; })(),
    torso: mk(0.44, 0.62, 0.24, 0.31, 0xffffff),
    arm: mk(0.12, 0.6, 0.14, -0.3, 0xffffff),
    head: mk(0.22, 0.25, 0.23, 0.13, 0xffffff),
    hair: (() => { const P = new Parts(); P.box('paint', 0.235, 0.09, 0.245, 0, 0.27, -0.01, 0xffffff); return P.done().paint; })(),
  };
}

export function buildModels() {
  const M = {};
  for (const [k, f] of Object.entries(CAR_MODELS)) M[k] = f();
  M.bus = busModel();
  // zwaailichten (links en rechts apart, om te knipperen)
  for (const [k, y, z] of [['Car', 1.6, -0.25], ['Van', 2.4, 1.6], ['Truck', 2.85, 3.3]]) for (const sx of [1, -1]) {
    const P = new Parts(); P.box('light', 0.42, 0.16, 0.22, sx * 0.3, y, z, 0x2d6bff); M['beacon' + k + (sx > 0 ? 'L' : 'R')] = P.done();
  }
  { const P = new Parts(); P.box('light', 0.28, 0.28, 0.12, 0, 0, 0, 0xffffff); M.signalHead = P.done(); }
  M.tramCab = tramSection(true); M.tramMid = tramSection(false);
  M.tram2Cab = tramSection(true, true); M.tram2Mid = tramSection(false, true); // nieuwe generatie (zelfde deuren)
  for (const [k, o] of Object.entries(BUS_TYPES)) { M[k] = busBody(o); M[k + 'Doors'] = busDoors(o); }
  M.tramDoorsCab = { trim: (() => { const P = new Parts(); P.box('trim', 0.06, 2.15, 1.3, 1.22, 1.4, 0.2, GLASS_LIGHT); P.box('trim', 0.06, 2.15, 1.3, -1.22, 1.4, -1.8, GLASS_LIGHT); return P.done().trim; })() };
  M.tramDoorsMid = { trim: (() => { const P = new Parts(); P.box('trim', 0.06, 2.15, 1.3, 1.22, 1.4, 0.5, GLASS_LIGHT); P.box('trim', 0.06, 2.15, 1.3, -1.22, 1.4, -1.5, GLASS_LIGHT); return P.done().trim; })() };
  M.iceHead = trainCar({ L: 20.5, cab: true, stripe: 0xd4121c, H: 3.85 });
  M.iceCoach = trainCar({ L: 26.4, stripe: 0xd4121c, H: 3.85 });
  M.regioCab = trainCar({ L: 26.8, cab: true, doubleDeck: true, H: 4.6 });
  M.regioCoach = trainCar({ L: 26.8, doubleDeck: true, H: 4.6 });
  // zitplaatsen in de treinen: in een stoelrij aan het raam, vooruit kijkend (onderdek van de dubbeldekker)
  SEAT_SPOTS.regioCoach = [{ z: -4.66, lat: 0.95, look: 'fwd', floor: 1.05, ceil: 2.6 }];
  SEAT_SPOTS.iceCoach = [{ z: -4.46, lat: 0.95, look: 'fwd', floor: 1.25, ceil: 3.45 }];
  M.metroCab = metroCar(true); M.metroMid = metroCar(false); M.metroLeaf = metroLeaf();
  M.metro2Cab = metroCar(true, false, true); M.metro2Mid = metroCar(false, false, true); // nieuwe generatie (zelfde deuren en zitplaatsen)
  SEAT_SPOTS.metro2Cab = SEAT_SPOTS.metroCab; SEAT_SPOTS.metro2Mid = SEAT_SPOTS.metroMid;
  M.metroDoorsCab = { trim: metroCar(true, true) }; M.metroDoorsMid = { trim: metroCar(false, true) };
  M.person = personParts();
  return M;
}

// kleuren
export const CAR_COLORS = [0xe8e8e8, 0xf4f4f2, 0x1c1c1e, 0x2a2c30, 0x9aa0a6, 0x7b8086, 0xb8bcc0, 0x5a5f66, 0x8f1d1d, 0x1e3f7a,
  0x2f5d3a, 0x6b4a2e, 0xc9b28f, 0x30425a, 0xb03a2e, 0x6e7f8f];
export const BUS_COLORS = [0xf2efe6, 0xe6c329, 0xc8102e, 0x2c6db5];
export const METRO_COLORS = [0xe2001a, 0x0065ae, 0xf6c400, 0x009a49, 0x8d248a, 0xf28c00, 0x6cb4e4, 0x9b6b3f];
export const TRAM_COLORS = [0xc8102e, 0xf0f0ee, 0x1d6fb8, 0xe0a91b];
export const SHIRTS = [0x2e4a7a, 0xb03a2e, 0xe8e8e8, 0x2f5d3a, 0x1c1c1e, 0xd9a441, 0x7a3b6e, 0x5c7f9c, 0xc96a3d, 0x8a8f96, 0x3a6b5e, 0xe08aa0];
export const PANTS = [0x1f2a44, 0x2b2b2e, 0x4a4f57, 0x3d5a80, 0x6b5a45, 0x1a1a1a, 0x8c7a5b];
export const SKIN = [0xf1c9a5, 0xe0ac87, 0xc68a62, 0x8d5a3b, 0x5e3a24, 0xf5d7bd];
export const HAIR = [0x2a1c12, 0x4a3020, 0x111111, 0x8a6a3a, 0xc9a35a, 0x9a9a9a, 0x6b2f1a];
