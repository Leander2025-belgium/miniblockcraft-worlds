// Schepen en boten als bewegende blokkenrasters: je kan aan boord lopen (dekken, trappen, liften, hutten,
// restaurants, zwembaden, stuurhut) terwijl het schip vaart. Aan boord rekent de natuurkunde in het
// assenstelsel van het schip, zodat je er niet afglijdt. Varen gebeurt over echte waterwegen (OpenStreetMap)
// of de zee/rivier/meren van de fantasiewerelden; schepen keren als een brug te laag is.
import * as THREE from 'three';
import { B } from './blocks.js';
import { meshChunk, CS } from './mesher.js';

// ---------- ontwerpen (x = breedte, y = hoogte, z = lengte, voorkant = +z) ----------
function grid(W, H, L) {
  const size = Math.max(W, L), vox = new Uint8Array(size * size * H);
  const set = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < L) vox[(z * size + x) * H + y] = b; };
  const get = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < L) ? vox[(z * size + x) * H + y] : 0;
  const box = (x0, y0, z0, x1, y1, z1, b) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, b); };
  return { W, H, L, size, vox, set, get, box };
}
// romp met spitse boeg; draft = diepgang (onder water), top = dekhoogte
function hull(g, top, colors, draft) {
  const { W, L } = g, mid = (W - 1) / 2;
  for (let z = 0; z < L; z++) {
    const t = z > L * 0.78 ? (z - L * 0.78) / (L * 0.22) : z < L * 0.06 ? (L * 0.06 - z) / (L * 0.06) * 0.35 : 0;
    const half = Math.max(0.6, (W / 2) * (1 - Math.pow(Math.min(1, t), 1.6)));
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - mid);
      if (d > half) continue;
      for (let y = 0; y <= top; y++) {
        const narrow = half - (top - y < 0 ? 0 : 0) * 0.1 - (y < 2 ? (2 - y) * 0.6 : 0);
        if (d > narrow) continue;
        const edge = d > narrow - 1 || z === 0 || y === 0;
        if (y === top) g.set(x, y, z, colors.deck);
        else if (edge) g.set(x, y, z, y < draft ? colors.bottom : y === top - 1 && colors.stripe ? colors.stripe : colors.side);
      }
    }
  }
}
function railing(g, y, glass) {
  const { W, L } = g;
  for (let z = 0; z < L; z++) for (let x = 0; x < W; x++) {
    if (g.get(x, y - 1, z) && !g.get(x, y, z)) {
      const edge = !g.get(x - 1, y - 1, z) || !g.get(x + 1, y - 1, z) || !g.get(x, y - 1, z - 1) || !g.get(x, y - 1, z + 1);
      if (edge) g.set(x, y, z, glass ? B.GLASS : B.METAL);
    }
  }
}
function stairs(g, x, y0, y1, z0) { for (let y = y0, z = z0; y < y1; y++, z++) { g.set(x, y, z, B.DARK_PLANKS); g.set(x + 1, y, z, B.DARK_PLANKS); for (let k = y + 1; k <= y1 + 2; k++) { g.set(x, k, z, 0); g.set(x + 1, k, z, 0); } } }

export const SHIP_TYPES = {
  motorboat: { L: 9, W: 4, H: 5, draft: 1, speed: 9, name: 'Motorboot', small: true },
  sailboat: { L: 10, W: 4, H: 15, draft: 1, speed: 5, name: 'Zeilboot', small: true },
  watertaxi: { L: 12, W: 5, H: 6, draft: 1, speed: 8, name: 'Watertaxi', small: true },
  ferry: { L: 36, W: 12, H: 10, draft: 2, speed: 6, name: 'Veerboot' },
  rivercruise: { L: 84, W: 11, H: 13, draft: 2, speed: 5, name: 'Riviercruiseschip' },
  barge: { L: 72, W: 10, H: 8, draft: 3, speed: 4.5, name: 'Binnenvaartschip' },
  container: { L: 150, W: 22, H: 30, draft: 7, speed: 8, name: 'Containerschip', sea: true },
  tanker: { L: 132, W: 20, H: 24, draft: 7, speed: 7, name: 'Tanker', sea: true },
  cruise: { L: 172, W: 26, H: 40, draft: 6, speed: 7, name: 'Cruiseschip', sea: true },
};
export function shipTypeFor(cls, r) {
  if (cls === 'sea') return ['container', 'tanker', 'cruise', 'cruise', 'ferry'][Math.floor(r * 5)];
  if (cls === 'boatL') return ['rivercruise', 'barge', 'barge', 'ferry', 'motorboat', 'watertaxi', 'sailboat'][Math.floor(r * 7)];
  return ['motorboat', 'sailboat', 'watertaxi', 'motorboat'][Math.floor(r * 4)];
}

function design(type, seed) {
  const T = SHIP_TYPES[type], g = grid(T.W, T.H, T.L), { W, L } = g, mid = Math.floor(W / 2);
  const r = (k) => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  if (type === 'motorboat' || type === 'watertaxi') {
    const col = type === 'watertaxi' ? B.PAINT_YELLOW : [B.PAINT_WHITE, B.PAINT_BLUE, B.PAINT_RED][Math.floor(r(1) * 3)];
    hull(g, 2, { deck: B.DARK_PLANKS, side: col, bottom: B.PAINT_WHITE }, 1);
    if (type === 'watertaxi') { g.box(0, 3, 3, W - 1, 4, 8, B.GLASS); g.box(1, 3, 4, W - 2, 3, 7, 0); g.box(0, 5, 3, W - 1, 5, 8, B.PAINT_YELLOW); g.box(1, 3, 4, W - 2, 4, 7, 0); g.set(mid, 3, 5, B.PLANKS); }
    else { g.box(0, 3, L - 4, W - 1, 3, L - 4, B.GLASS); g.set(1, 3, 2, B.PLANKS); g.set(W - 2, 3, 2, B.PLANKS); g.set(mid, 3, L - 5, B.PAINT_BLACK); }
  } else if (type === 'sailboat') {
    hull(g, 2, { deck: B.PLANKS, side: B.PAINT_WHITE, bottom: B.PAINT_BLUE }, 1);
    for (let y = 3; y < 15; y++) g.set(mid, y, 6, B.METAL);
    for (let y = 4; y < 14; y++) for (let z = 1; z <= 5; z++) if ((14 - y) / 10 * 5 >= 6 - z) g.set(mid, y, z, B.PAINT_WHITE); // grootzeil
    for (let y = 4; y < 12; y++) for (let z = 7; z <= 9; z++) if ((12 - y) / 8 * 3 >= z - 7) g.set(mid, y, z, B.PAINT_WHITE); // fok
    g.box(1, 3, 1, W - 2, 3, 1, B.METAL);
  } else if (type === 'ferry') {
    hull(g, 3, { deck: B.ASPHALT, side: B.PAINT_WHITE, bottom: B.PAINT_RED, stripe: B.PAINT_BLUE }, 2);
    g.box(0, 4, 0, 0, 5, L - 1, B.PAINT_WHITE); g.box(W - 1, 4, 0, W - 1, 5, L - 1, B.PAINT_WHITE);
    g.box(1, 6, 10, W - 2, 6, 26, B.PAINT_WHITE); // passagiersdek
    g.box(1, 7, 12, W - 2, 8, 24, B.GLASS); g.box(2, 7, 13, W - 3, 8, 23, 0); g.box(1, 9, 12, W - 2, 9, 24, B.PAINT_WHITE);
    for (let z = 14; z < 23; z += 3) { g.set(3, 7, z, B.PLANKS); g.set(W - 4, 7, z, B.PLANKS); }
    stairs(g, 1, 4, 7, 5); railing(g, 10, false);
  } else if (type === 'rivercruise' || type === 'cruise') {
    const big = type === 'cruise';
    const hullTop = big ? 10 : 3, deckH = 3, decks = big ? 8 : 2;
    hull(g, hullTop, { deck: B.TILE, side: big ? B.PAINT_WHITE : B.PAINT_BLUE, bottom: big ? B.PAINT_RED : B.PAINT_BLACK, stripe: B.PAINT_BLUE }, big ? 6 : 2);
    const z0 = big ? 12 : 4, z1 = L - (big ? 22 : 10);
    for (let d = 0; d < decks; d++) {
      const y = hullTop + d * deckH, top = y + deckH, inset = d >= decks - 2 && big ? 2 : 1;
      const a = z0 + (d === decks - 1 ? 10 : 0), b = z1 - (d === decks - 1 ? 14 : 0);
      g.box(inset, top, a, W - 1 - inset, top, b, d === decks - 1 ? B.TILE : B.PAINT_WHITE); // plafond / dek erboven
      for (let z = a; z <= b; z++) for (const x of [inset, W - 1 - inset]) for (let yy = y + 1; yy < top; yy++) {
        const win = yy === y + 1 || yy === y + 2;
        g.set(x, yy, z, win && z % 4 !== 0 ? (big && d < decks - 2 ? B.GLASS_BLUE : B.GLASS) : B.PAINT_WHITE);
      }
      for (let x = inset; x <= W - 1 - inset; x++) for (let yy = y + 1; yy < top; yy++) { g.set(x, yy, a, B.PAINT_WHITE); g.set(x, yy, b, yy === y + 2 ? B.GLASS : B.PAINT_WHITE); }
      // indeling: gang in het midden, hutten aan weerszijden, restaurant achteraan
      const restA = b - (big ? 26 : 16);
      for (let z = a + 1; z < b; z++) {
        if (z >= restA) { if (z % 4 === 0) for (let x = inset + 2; x < W - 1 - inset; x += 3) g.set(x, y + 1, z, B.PLANKS); continue; } // restaurant met tafels
        if (big) for (let yy = y + 1; yy < top; yy++) { g.set(mid - 2, yy, z, z % 6 === 0 ? 0 : B.PLASTER_BEIGE); g.set(mid + 2, yy, z, z % 6 === 0 ? 0 : B.PLASTER_BEIGE); }
        if (z % 6 === 3) for (let x = inset + 1; x < W - 1 - inset; x++) if (Math.abs(x - mid) > 2) { g.set(x, y + 1, z, 0); g.set(x, y + 2, z, B.PLASTER_BEIGE); } // hutwanden
        if (z % 6 === 4) { g.set(inset + 1, y + 1, z, B.WOOL_RED); g.set(W - 2 - inset, y + 1, z, B.WOOL_RED); } // bedden
        if (big && z % 6 === 3) for (let yy = y + 1; yy < top; yy++) for (const x of [inset + 1, W - 2 - inset]) g.set(x, yy, z, B.PLASTER_BEIGE);
      }
      // trap en lift tussen de dekken
      g.set(mid - 1, y, a + 3, B.ELEVATOR); g.set(mid - 1, y + 1, a + 3, 0); g.set(mid - 1, y + 2, a + 3, 0);
      if (d < decks - 1) g.set(mid - 1, top, a + 3, 0);
      if (d < decks - 1) for (let k = 0; k < deckH; k++) { const z = a + 6 + k; g.set(mid + 1, y + 1 + k, z, B.DARK_PLANKS); g.set(mid, y + 1 + k, z, B.DARK_PLANKS); g.set(mid + 1, top, z + 1, 0); g.set(mid, top, z + 1, 0); }
      // balkons op een cruiseschip
      if (big && d > 0 && d < decks - 2) for (let z = a + 2; z < restA; z += 6) for (const x of [inset - 1, W - inset]) { g.set(x, y, z, B.DARK_PLANKS); g.set(x, y + 1, z, B.GLASS); g.set(x, y, z + 1, B.DARK_PLANKS); g.set(x, y + 1, z + 1, B.GLASS); }
    }
    const sun = hullTop + decks * deckH;
    // zonnedek met zwembad, ligstoelen en panoramalounge vooraan
    const pz = Math.floor((z0 + z1) / 2) - 4;
    g.box(mid - 3, sun, pz, mid + 3, sun, pz + (big ? 14 : 6), B.TILE);
    g.box(mid - 2, sun, pz + 1, mid + 2, sun, pz + (big ? 13 : 5), B.WATER);
    if (big) { g.box(mid - 2, sun, pz + 20, mid + 2, sun, pz + 26, B.TILE); g.box(mid - 1, sun, pz + 21, mid + 1, sun, pz + 25, B.WATER); }
    for (let z = z0 + 12; z < z1 - 12; z += 3) { g.set(2, sun + 1, z, B.PANEL_WHITE); g.set(W - 3, sun + 1, z, B.PANEL_WHITE); }
    railing(g, sun + 1, true);
    // brug (stuurhut) vooraan met brede ramen
    const bz = z1 + 1, by = big ? sun - 3 : sun;
    g.box(1, by, bz, W - 2, by + 3, bz + (big ? 5 : 4), B.PAINT_WHITE);
    g.box(2, by + 1, bz + 1, W - 3, by + 2, bz + (big ? 4 : 3), 0);
    g.box(1, by + 1, bz + (big ? 5 : 4), W - 2, by + 2, bz + (big ? 5 : 4), B.GLASS);
    g.box(mid - 1, by, bz + (big ? 3 : 2), mid + 1, by + 1, bz + (big ? 3 : 2), B.PANEL_DARK); // stuurpult
    if (big) { g.box(mid - 3, sun + 1, z0 + 2, mid + 3, sun + 9, z0 + 8, B.PAINT_RED); g.box(mid - 3, sun + 8, z0 + 2, mid + 3, sun + 9, z0 + 8, B.PAINT_BLACK); } // schoorsteen
    if (big) for (let z = z0 + 14; z < z1 - 10; z += 12) for (const x of [0, W - 1]) g.box(x, hullTop + 4, z, x, hullTop + 5, z + 5, B.PAINT_ORANGE); // reddingsboten
    stairs(g, mid - 3, hullTop + 1, hullTop + deckH, Math.max(1, z0 - 6));
  } else if (type === 'barge') {
    hull(g, 4, { deck: B.PAINT_BLACK, side: B.PAINT_BLACK, bottom: B.PAINT_RED, stripe: B.PAINT_WHITE }, 3);
    g.box(1, 1, 8, W - 2, 3, L - 14, 0); g.box(1, 1, 8, W - 2, 1, L - 14, B.PAINT_BLACK);
    const cargo = r(2) < 0.5 ? B.GRAVEL : B.COAL_ORE;
    for (let z = 10; z < L - 15; z++) for (let x = 2; x < W - 2; x++) { const h = 2 + Math.floor(2 * Math.sin((z - 10) / (L - 25) * Math.PI) * (1 - Math.abs(x - mid) / mid)); for (let y = 2; y <= h; y++) g.set(x, y, z, cargo); }
    g.box(1, 5, 1, W - 2, 7, 6, B.PAINT_WHITE); g.box(2, 6, 2, W - 3, 6, 5, B.GLASS); g.box(3, 6, 3, W - 4, 6, 4, 0); g.box(1, 8, 1, W - 2, 8, 6, B.PAINT_BLUE);
    stairs(g, 1, 5, 7, 7);
  } else if (type === 'container' || type === 'tanker') {
    const top = type === 'container' ? 10 : 9;
    hull(g, top, { deck: B.PAINT_RED, side: type === 'container' ? B.PAINT_BLUE : B.PAINT_BLACK, bottom: B.PAINT_RED, stripe: B.PAINT_WHITE }, 7);
    if (type === 'container') {
      const C = [B.PAINT_RED, B.PAINT_BLUE, B.PAINT_GREEN, B.PAINT_ORANGE, B.PAINT_WHITE, B.METAL, B.PAINT_YELLOW];
      for (let z = 24; z < L - 30; z += 7) for (let x = 1; x < W - 2; x += 3) {
        const h = 2 + Math.floor(r(z * 31 + x) * 4);
        for (let k = 0; k < h; k++) { const c = C[Math.floor(r(z * 7 + x * 13 + k) * C.length)]; g.box(x, top + 1 + k * 2.5 | 0, z, x + 1, (top + 1 + k * 2.5 | 0) + 1, z + 5, c); }
      }
    } else {
      for (let z = 20; z < L - 26; z++) g.set(Math.floor(W / 2), top + 1, z, B.METAL);
      for (let z = 26; z < L - 30; z += 18) g.box(Math.floor(W / 2) - 3, top + 1, z, Math.floor(W / 2) + 3, top + 2, z + 6, B.METAL);
    }
    // stuurhuis achteraan
    g.box(2, top + 1, 4, W - 3, top + 16, 14, B.PAINT_WHITE);
    for (let y = top + 2; y <= top + 15; y += 3) g.box(2, y, 14, W - 3, y, 14, B.GLASS);
    g.box(3, top + 1, 5, W - 4, top + 14, 13, 0);
    for (let y = top + 1; y <= top + 13; y += 3) g.box(3, y, 5, W - 4, y, 13, B.TILE);
    for (let y = top + 1; y <= top + 13; y += 3) g.set(4, y, 6, B.ELEVATOR);
    g.box(1, top + 16, 3, W - 2, top + 16, 15, B.PAINT_WHITE);
    g.box(Math.floor(W / 2) - 2, top + 17, 6, Math.floor(W / 2) + 2, top + 20, 10, B.PAINT_BLACK);
    stairs(g, W - 4, 1, top, 20); g.box(W - 4, top, 20 + top - 1, W - 3, top, 20 + top - 1, B.DARK_PLANKS);
  }
  // plek van het stuur (voor de cabinecamera)
  const br = { motorboat: [mid, 4, L - 5], sailboat: [mid, 4, 2], watertaxi: [mid, 4, 6], ferry: [mid, 8, 22], barge: [mid, 7, 4],
    rivercruise: [mid, 15, L - 8], cruise: [mid, 33, L - 18], container: [mid, 26, 12], tanker: [mid, 25, 12] }[type];
  g.bridge = br;
  return { g, T };
}

// ---------- een varend schip ----------
export class Vessel {
  constructor(scene, mats, type, seed, makeWorld) {
    const { g, T } = design(type, seed);
    this.type = type; this.T = T; this.g = g;
    this.world = makeWorld({ size: g.size, H: g.H }, g.vox);
    this.world.vessel = this;
    this.cx = g.W / 2; this.cz = g.L / 2;
    this.group = new THREE.Group();
    this.mats = mats; this.scene = scene;
    this.rebuild();
    scene.add(this.group);
    this.pos = new THREE.Vector3(); this.yaw = 0;
    // kielzog: vervagend lint achter het schip
    this.trail = [];
    const wg = new THREE.BufferGeometry();
    this.wakePos = new Float32Array(40 * 2 * 3); this.wakeA = new Float32Array(40 * 2);
    wg.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3));
    wg.setAttribute('alpha', new THREE.BufferAttribute(this.wakeA, 1));
    const idx = []; for (let i = 0; i < 39; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    wg.setIndex(idx);
    this.wake = new THREE.Mesh(wg, WAKE_MAT); this.wake.frustumCulled = false;
    scene.add(this.wake);
  }
  rebuild() {
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry.dispose(); }
    const nc = this.world.nc;
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) {
      const out = meshChunk(this.world, cx, cz);
      for (const [buf, mat] of [[out.opaque, this.mats.o], [out.trans, this.mats.t]]) {
        if (!buf.n) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
        geo.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tile, 2));
        geo.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 1));
        geo.setAttribute('face', new THREE.Float32BufferAttribute(buf.face, 1));
        geo.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat); m.position.set(-this.cx, 0, -this.cz); m.layers.enable(1);
        if (mat === this.mats.t) m.renderOrder = 1;
        this.group.add(m);
      }
    }
    void CS;
  }
  // wereld <-> schip
  toLocal(v, out) {
    const dx = v.x - this.pos.x, dz = v.z - this.pos.z, c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
    out.set(dx * c + dz * s + this.cx, v.y - this.pos.y, -dx * s + dz * c + this.cz);
    return out;
  }
  toWorld(v, out) {
    const lx = v.x - this.cx, lz = v.z - this.cz, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    out.set(this.pos.x + lx * c + lz * s, this.pos.y + v.y, this.pos.z - lx * s + lz * c);
    return out;
  }
  inside(l, margin = 0) { return l.x >= -margin && l.z >= -margin && l.x < this.g.W + margin && l.z < this.g.L + margin && l.y > -1.5 && l.y < this.g.H + 2; }
  place(x, waterY, z, yaw, dt, moving) {
    this.pos.set(x, waterY - this.T.draft, z); this.yaw = yaw;
    // licht deinen
    const t = performance.now() / 1000;
    this.group.position.copy(this.pos); this.group.position.y += Math.sin(t * 0.8 + this.pos.x * 0.01) * (this.T.small ? 0.08 : 0.03);
    this.group.rotation.set(Math.sin(t * 0.6) * (this.T.small ? 0.025 : 0.006), yaw, Math.sin(t * 0.7 + 1) * (this.T.small ? 0.03 : 0.008));
    // kielzog bijwerken
    const back = { x: x - Math.sin(yaw) * this.T.L * 0.5, z: z - Math.cos(yaw) * this.T.L * 0.5 };
    if (moving) {
      const last = this.trail[0];
      if (!last || Math.hypot(last.x - back.x, last.z - back.z) > 2.5) { this.trail.unshift({ x: back.x, z: back.z, yaw, t }); if (this.trail.length > 40) this.trail.pop(); }
    }
    for (let i = 0; i < 40; i++) {
      const p = this.trail[i];
      const a = p ? Math.max(0, 1 - i / 40 - (t - p.t) / 30) : 0;
      const w = p ? (this.T.W * 0.35 + i * 0.6) : 0, cx = p ? Math.cos(p.yaw) : 0, sx = p ? -Math.sin(p.yaw) : 0;
      const px = p ? p.x : x, pz = p ? p.z : z;
      this.wakePos.set([px + cx * w, waterY + 0.06, pz + sx * w, px - cx * w, waterY + 0.06, pz - sx * w], i * 6);
      this.wakeA[i * 2] = this.wakeA[i * 2 + 1] = a * (moving ? 0.75 : 0.4);
    }
    this.wake.geometry.attributes.position.needsUpdate = true; this.wake.geometry.attributes.alpha.needsUpdate = true;
    void dt;
  }
  dispose() {
    for (const c of this.group.children) c.geometry.dispose();
    this.scene.remove(this.group); this.scene.remove(this.wake); this.wake.geometry.dispose();
  }
}
const WAKE_MAT = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: 'attribute float alpha; varying float vA; varying vec3 vW; void main() { vA = alpha; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying float vA; varying vec3 vW; void main() { float f = 0.6 + 0.4 * sin(vW.x * 1.7 + vW.z * 1.3); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), vA * f * 0.7); }',
});

// ---------- beheer: schepen bij de verkeersagenten van soort 'ship' ----------
export class Ships {
  constructor(game) { this.g = game; this.list = new Map(); this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); }
  update(dt) {
    const g = this.g, tr = g.traffic; if (!tr) return;
    const seen = new Set();
    const p = g.player.pos;
    for (const a of tr.agents) {
      if (a.kind !== 'ship' || a.dead) continue;
      const h = tr.behind(a, a.L / 2, tr.tmpA), d = Math.hypot(h.x - p.x, h.z - p.z);
      let v = this.list.get(a);
      if (!v && d < 700) {
        if (this.list.size >= 8 && !a.free) continue;
        v = new Vessel(g.scene, { o: g.matOpaque, t: g.matTrans }, a.shipType, a.r * 1000, (meta, vox) => g.makeWorld(meta, vox));
        this.list.set(a, v);
      }
      if (!v) continue;
      seen.add(a);
      const f = tr.behind(a, 0, {}), b = tr.behind(a, a.L, {});
      const yaw = Math.atan2(f.x - b.x, f.z - b.z);
      v.place(h.x, h.y, h.z, yaw, dt, a.v > 0.3);
      // brug of land voor de boeg? dan keren
      if (a.v > 0.5 && !a.player) {
        const bx = f.x + Math.sin(yaw) * 6, bz = f.z + Math.cos(yaw) * 6, wy = Math.floor(h.y) - 1;
        let blocked = false;
        for (let y = wy + 1; y <= wy + v.T.H - v.T.draft && !blocked; y++) if (g.world.solidAt(Math.floor(bx), y, Math.floor(bz))) blocked = true;
        if (blocked) { a.v = 0; a.wait = 6; a.reverseAfter = true; }
      } else if (a.player && a.v > 0.3) {
        const bx = f.x + Math.sin(yaw) * 5, bz = f.z + Math.cos(yaw) * 5, wy = Math.floor(h.y) - 1;
        for (let y = wy + 1; y <= wy + v.T.H - v.T.draft; y++) if (g.world.solidAt(Math.floor(bx), y, Math.floor(bz))) { a.v = 0; g.toast('⚠ Te lage brug of land voor de boeg — stoppen en keren (R)'); break; }
      }
    }
    for (const [a, v] of this.list) if (!seen.has(a)) { if (g.aboard === v) g.leaveVessel(); v.dispose(); this.list.delete(a); }
    // aan boord stappen: de speler loopt (of valt) op een dek
    if (!g.aboard && !g.drive) {
      for (const v of this.list.values()) {
        v.toLocal(p, this.tmp);
        if (v.inside(this.tmp, 0) && this.tmp.y < v.g.H) { g.boardVessel(v); break; }
      }
    }
  }
  nearest(p, maxD = 25) {
    let best = null, bd = maxD;
    for (const [a, v] of this.list) { const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.T.L / 2; if (d < bd) { bd = d; best = { a, v }; } }
    return best;
  }
  dispose() { for (const v of this.list.values()) v.dispose(); this.list.clear(); }
}
