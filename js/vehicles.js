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
  constructor() { this.p = { paint: [], trim: [], light: [] }; }
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
    this.p[kind].push(g);
  }
  done() {
    const out = {};
    for (const [k, list] of Object.entries(this.p)) out[k] = list.length ? merge(list) : null;
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
  taxi: () => { const P = new Parts(); carBase(P, { L: 4.7, W: 1.82, Hb: 0.62, wheelR: 0.33, cabin: 2.5, cabinH: 0.52, cabinBack: -0.25, cabinFront: 0.55, roofLen: 1.45, wheelBase: 2.8 });
    P.box('light', 0.6, 0.16, 0.22, 0, 1.6, -0.3, 0xfff1a8); return P.done(); },
};

// ---------- bus (12 m) ----------
function busModel() {
  const P = new Parts(), L = 12, W = 2.55;
  P.box('paint', W, 1.05, L, 0, 0.88, 0);                                  // onderkant
  P.box('trim', W + 0.02, 1.2, L - 0.6, 0, 2.0, -0.2, GLASS);               // ramenband
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

// ---------- tram (lagevloertram, gelede bakken) ----------
function tramSection(cab) {
  const P = new Parts(), L = cab ? 7.6 : 7.0, W = 2.4;
  const zc = cab ? -0.3 : 0, Lb = cab ? L - 0.6 : L;
  P.box('paint', W, 0.95, Lb, 0, 0.78, zc);                                    // onderkant
  P.box('trim', W + 0.02, 1.35, Lb - 0.3, 0, 1.92, zc, GLASS);                  // ramen
  P.box('paint', W, 0.55, Lb, 0, 2.87, zc);                                     // boven de ramen
  P.box('trim', W * 0.9, 0.22, Lb, 0, 3.25, zc, 0xb8bcc2);                      // dak
  P.box('trim', 0.05, 2.15, 1.3, W / 2 + 0.01, 1.4, zc + 0.5, GLASS_LIGHT);      // deur
  P.box('trim', 0.05, 2.15, 1.3, -W / 2 - 0.01, 1.4, zc - 1.5, GLASS_LIGHT);
  P.box('trim', W - 0.3, 0.45, 2.0, 0, 0.3, zc, DARK);                          // draaistel
  if (cab) {
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
  P.box('trim', W - 0.1, 2.6, 0.25, 0, 1.6, zc - Lb / 2 - 0.12, 0x222428);       // balg naar de volgende bak
  return P.done();
}

// ---------- treinen ----------
function trainCar({ L, W = 2.9, H = 3.9, cab = false, stripe = null, doubleDeck = false }) {
  const P = new Parts();
  const zb = cab ? -0.8 : 0, Lb = cab ? L - 1.6 : L;
  P.box('trim', W - 0.4, 0.55, Lb - 1, 0, 0.55, zb, 0x33363a);                   // onderbak
  if (doubleDeck) {
    P.box('paint', W, H - 1.0, Lb, 0, 0.8 + (H - 1.0) / 2, zb);
    P.box('trim', W + 0.02, 0.85, Lb - 2.4, 0, 1.55, zb, GLASS);                  // onderste ramen
    P.box('trim', W + 0.02, 0.85, Lb - 2.4, 0, 3.15, zb, GLASS);                  // bovenste ramen
    P.box('trim', W * 0.86, 0.3, Lb, 0, H - 0.05, zb, 0x9ea3a8, { sx: 0.8 });
  } else {
    P.box('paint', W, H - 1.2, Lb, 0, 0.8 + (H - 1.2) / 2, zb);
    P.box('trim', W + 0.02, 0.95, Lb - 2.6, 0, 2.35, zb, GLASS);                  // ramenband
    P.box('trim', W * 0.9, 0.35, Lb, 0, H - 0.25, zb, 0xc6cacf, { sx: 0.82 });   // dak
  }
  if (stripe) P.box('trim', W + 0.03, 0.22, Lb - 0.6, 0, 1.35, zb, stripe);
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
function metroCar(cab, doorsOnly) {
  const P = new Parts(), L = 18, W = 2.8, H = 3.5, zb = cab ? -0.3 : 0, Lb = cab ? L - 0.6 : L;
  const doorZ = [-Lb / 2 + 3, 0, Lb / 2 - 3];
  if (doorsOnly) {
    for (const dz of doorZ) for (const sx of [1, -1]) P.box('trim', 0.06, 2.0, 1.3, sx * (W / 2 + 0.01), 1.55, zb + dz, 0x9aa3ad);
    return P.done().trim;
  }
  // buitenkant
  P.box('paint', W, 0.9, Lb, 0, 0.95, zb);                                  // onderkant (lijnkleur)
  P.box('trim', W + 0.02, 1.15, Lb - 0.4, 0, 1.95, zb, GLASS);               // ramen
  P.box('paint', W, 0.55, Lb, 0, 2.8, zb);                                  // boven de ramen
  P.box('trim', W * 0.9, 0.25, Lb, 0, 3.2, zb, 0xc0c4c9);                    // dak
  P.box('trim', W - 0.4, 0.5, Lb - 2, 0, 0.3, zb, 0x26282b);                 // onderstel
  for (const bz of [Lb / 2 - 3, -Lb / 2 + 3]) for (const wz of [0.9, -0.9]) for (const wx of [0.75, -0.75]) P.wheel(0.4, 0.12, wx, 0.4, zb + bz + wz, 0x3a3c40, 10);
  // interieur: vloer, banken langs de wanden, palen, plafondverlichting
  P.box('trim', W - 0.2, 0.06, Lb - 0.4, 0, 1.42, zb, 0x4a4e55);
  for (let z = -Lb / 2 + 1.6; z < Lb / 2 - 1; z += 1.1) {
    if (doorZ.some(dz => Math.abs(z - dz) < 1)) continue;
    for (const sx of [1, -1]) { P.box('trim', 0.5, 0.08, 0.5, sx * 1.05, 1.9, zb + z, 0x2e5c9e); P.box('trim', 0.08, 0.55, 0.5, sx * 1.3, 2.2, zb + z, 0x2e5c9e); }
  }
  for (const dz of doorZ) for (const sx of [0.6, -0.6]) P.box('trim', 0.05, 1.8, 0.05, sx, 2.35, zb + dz, 0xcfd3d8);
  P.box('light', 0.3, 0.04, Lb - 1.4, 0.5, 3.08, zb, 0xf4f6ff); P.box('light', 0.3, 0.04, Lb - 1.4, -0.5, 3.08, zb, 0xf4f6ff);
  if (cab) {
    P.box('paint', W, 1.4, 0.7, 0, 1.15, L / 2 - 0.35, 0xffffff, { sx: 0.92, front: 0.15 });
    P.box('trim', W - 0.2, 1.3, 0.6, 0, 2.3, L / 2 - 0.4, GLASS, { sx: 0.9, front: 0.25 });
    P.box('light', 1.6, 0.26, 0.05, 0, 3.0, L / 2 - 0.05, AMBER);           // bestemmingsscherm met lijnnummer
    P.box('light', 0.3, 0.16, 0.05, 0.95, 0.9, L / 2 + 0.01, HEAD).box('light', 0.3, 0.16, 0.05, -0.95, 0.9, L / 2 + 0.01, HEAD);
    P.box('trim', 0.9, 0.9, 0.5, 0.5, 1.9, L / 2 - 1.2, 0x30333a);           // bestuurderspult
  }
  P.box('trim', W - 0.3, 2.6, 0.25, 0, 1.9, zb - Lb / 2 - 0.12, 0x222428);   // overgang
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
  M.tramCab = tramSection(true); M.tramMid = tramSection(false);
  M.iceHead = trainCar({ L: 20.5, cab: true, stripe: 0xd4121c, H: 3.85 });
  M.iceCoach = trainCar({ L: 26.4, stripe: 0xd4121c, H: 3.85 });
  M.regioCab = trainCar({ L: 26.8, cab: true, doubleDeck: true, H: 4.6 });
  M.regioCoach = trainCar({ L: 26.8, doubleDeck: true, H: 4.6 });
  M.metroCab = metroCar(true); M.metroMid = metroCar(false);
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
