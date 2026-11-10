// Diepe ondergrond tot 300 blokken onder het maaiveld.
// Niets wordt vooraf gevuld: elk blok onder de bodem van een tegel wordt berekend uit de diepte
// (aarde, steen, graniet, diepe leisteen, basalt, ertsen, grotten, ondergrondse rivieren en grondwater).
// Alleen wat de speler verandert, wordt bewaard (per stuk van 16×16×16, los in IndexedDB),
// en alleen rond de speler worden er meshes gemaakt. Oude opgeslagen werelden blijven werken.
import * as THREE from 'three';
import { B, IS_OPAQUE, IS_TRANSPARENT } from './blocks.js';
import { FACE_TILE, ATLAS_COLS } from './textures.js';
import { cacheGetPrefix, cachePut } from './storage.js';
import { CarveIndex } from './carve.js';

export const DEPTH = 300;
const S = 16, S3 = S * S * S;

// ---------- ruis ----------
function h3(x, y, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519) + Math.imul(s | 0, 3266489917)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
function n3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(ix, iy, iz, s), h3(ix + 1, iy, iz, s), fx), l(h3(ix, iy + 1, iz, s), h3(ix + 1, iy + 1, iz, s), fx), fy),
    l(l(h3(ix, iy, iz + 1, s), h3(ix + 1, iy, iz + 1, s), fx), l(h3(ix, iy + 1, iz + 1, s), h3(ix + 1, iy + 1, iz + 1, s), fx), fy), fz);
}
const n2 = (x, z, s) => n3(x, 0.5, z, s);

export class Underground {
  // spec: { id, ground, top(x, z) -> eerste y die NIET meer ondergronds is, ref(x, z) -> maaiveld-referentie }
  constructor(scene, spec, mats) {
    this.scene = scene; this.spec = spec; this.mats = mats;
    this.edits = new Map();     // sleutel -> Uint8Array(4096), waarde = blok + 1 (0 = niet veranderd)
    this.dirtySave = new Set();
    this.cache = new Map();     // gegenereerde stukken (LRU)
    this.meshes = new Map();    // sleutel -> { o, t }
    this.dirty = new Set();
    this.ready = false;
    this.carves = new CarveIndex(); // metrotunnels, perronhallen, trappen, liften
    cacheGetPrefix(spec.id + '-ug-').then((list) => {
      for (const { key, value } of list || []) if (value && value.d) this.edits.set(key.slice(spec.id.length + 4), new Uint8Array(value.d));
      this.ready = true; this.cache.clear();
      for (const k of this.meshes.keys()) this.dirty.add(k);
    }).catch(() => { this.ready = true; });
  }
  key(sx, sy, sz) { return sx + '_' + sy + '_' + sz; }
  addCarves(list) {
    let added = false;
    for (const sg of list) if (this.carves.add(sg)) added = true;
    if (added) { this.cache.clear(); for (const k of this.meshes.keys()) this.dirty.add(k); }
  }
  floorAt(x, z) { return Math.floor(this.spec.ref(x, z)) - DEPTH; }
  // ---------- het gesteente op een plek ----------
  natural(x, y, z, ref = this.spec.ref(x, z)) {
    const floor = Math.floor(ref) - DEPTH;
    if (y <= floor) return B.BEDROCK;
    if (y === floor + 1 && h3(x, y, z, 7) < 0.6) return B.BEDROCK;
    if (y === floor + 2 && h3(x, y, z, 8) < 0.25) return B.BEDROCK;
    const cv = this.carves.at(x, y, z);
    if (cv >= 0) return cv;
    const d = ref - y;
    // grotten (niet te dicht bij het maaiveld)
    if (d > 28 && y > floor + 4) {
      const riverY = ref - 92;
      const rv = Math.abs(n2(x / 190, z / 190, 31) - 0.5);
      if (rv < 0.014 && y >= riverY - 3 && y <= riverY + 3) return y <= riverY ? B.WATER : 0; // ondergrondse rivier
      const cheese = n3(x / 34, y / 20, z / 34, 11);
      const big = d > 150 ? 0.68 : 0.73;
      let air = cheese > big;
      if (!air) {
        const a = n3(x / 26, y / 15, z / 26, 12) - 0.5, b = n3(x / 26, y / 15, z / 26, 13) - 0.5;
        air = Math.abs(a) < 0.03 && Math.abs(b) < 0.055;
      }
      if (air) return d > 175 && y < ref - 175 ? B.WATER : 0; // diep grondwater vult de grotten
    }
    // ertsen in klompjes
    const ox = Math.floor(x / 3), oy = Math.floor(y / 3), oz = Math.floor(z / 3), oh = h3(ox, oy, oz, 21);
    if (oh < 0.05 && h3(x, y, z, 22) < 0.55) {
      if (d > 230 && oh < 0.004) return B.DIAMOND_ORE;
      if (d > 140 && oh < 0.011) return B.GOLD_ORE;
      if (d > 30 && oh < 0.026) return B.IRON_ORE;
      if (d > 8 && d < 160) return B.COAL_ORE;
    }
    // gesteentelagen
    const band = d + (n2(x / 60, z / 60, 3) - 0.5) * 16;
    if (band < 5) return B.DIRT;
    if (band < 9 && n3(x / 12, y / 6, z / 12, 4) > 0.6) return B.CLAY;
    if (band < 70) return n3(x / 24, y / 10, z / 24, 5) > 0.72 ? B.GRANITE : B.STONE;
    if (band < 150) return n3(x / 20, y / 12, z / 20, 6) > 0.55 ? B.GRANITE : B.STONE;
    if (band < 240) return B.DEEPSLATE;
    return n3(x / 18, y / 9, z / 18, 9) > 0.5 ? B.BASALT : B.DEEPSLATE;
  }
  // een volledig stuk (met wijzigingen) uit de cache
  chunk(sx, sy, sz) {
    const k = this.key(sx, sy, sz);
    let c = this.cache.get(k);
    if (c) { this.cache.delete(k); this.cache.set(k, c); return c; }
    c = new Uint8Array(S3);
    const ed = this.edits.get(k), X0 = sx * S, Y0 = sy * S, Z0 = sz * S;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const top = this.spec.top(X0 + x, Z0 + z), ref = this.spec.ref(X0 + x, Z0 + z);
      for (let y = 0; y < S; y++) {
        const i = (y * S + z) * S + x;
        if (Y0 + y >= top) { c[i] = 0; continue; }
        c[i] = ed && ed[i] ? ed[i] - 1 : this.natural(X0 + x, Y0 + y, Z0 + z, ref);
      }
    }
    this.cache.set(k, c);
    if (this.cache.size > 360) this.cache.delete(this.cache.keys().next().value);
    return c;
  }
  get(x, y, z) {
    const sx = Math.floor(x / S), sy = Math.floor(y / S), sz = Math.floor(z / S), k = this.key(sx, sy, sz);
    const i = ((y - sy * S) * S + (z - sz * S)) * S + (x - sx * S);
    const c = this.cache.get(k);
    if (c) return c[i];
    const ed = this.edits.get(k);
    if (ed && ed[i]) return ed[i] - 1;
    return this.natural(x, y, z);
  }
  set(x, y, z, b) {
    if (this.natural(x, y, z) === B.BEDROCK && y <= this.floorAt(x, z) + 2 && this.get(x, y, z) === B.BEDROCK) return false; // bodem
    const sx = Math.floor(x / S), sy = Math.floor(y / S), sz = Math.floor(z / S), k = this.key(sx, sy, sz);
    const i = ((y - sy * S) * S + (z - sz * S)) * S + (x - sx * S);
    let ed = this.edits.get(k);
    if (!ed) this.edits.set(k, ed = new Uint8Array(S3));
    ed[i] = b + 1;
    const c = this.cache.get(k); if (c) c[i] = b;
    this.dirtySave.add(k);
    this.markDirty(x, y, z);
    clearTimeout(this.saveT); this.saveT = setTimeout(() => this.flush(), 2500);
    return true;
  }
  markDirty(x, y, z) {
    const sx = Math.floor(x / S), sy = Math.floor(y / S), sz = Math.floor(z / S);
    const lx = x - sx * S, ly = y - sy * S, lz = z - sz * S;
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx === -1 && lx > 0) || (dx === 1 && lx < S - 1) || (dy === -1 && ly > 0) || (dy === 1 && ly < S - 1) || (dz === -1 && lz > 0) || (dz === 1 && lz < S - 1)) continue;
      this.dirty.add(this.key(sx + dx, sy + dy, sz + dz));
    }
  }
  async flush() {
    const list = [...this.dirtySave]; this.dirtySave.clear();
    for (const k of list) { const e = this.edits.get(k); if (e) await cachePut(this.spec.id + '-ug-' + k, { d: e }); }
  }
  hasEditsNear(x, y, z, r) {
    for (const k of this.edits.keys()) {
      const [sx, sy, sz] = k.split('_').map(Number);
      if (Math.abs(sx * S + 8 - x) < r && Math.abs(sy * S + 8 - y) < r && Math.abs(sz * S + 8 - z) < r) return true;
    }
    return false;
  }
  // ---------- meshes rond de speler ----------
  update(p, worldGet, budgetMs = 6) {
    const top = this.spec.top(Math.floor(p.x), Math.floor(p.z));
    this.active = p.y < top + 6 || this.hasEditsNear(p.x, p.y, p.z, 40) || (this.carves.list.length > 0 && p.y < top + 14 && this.carves.at(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)) >= 0);
    const want = new Set();
    if (this.active) {
      const px = Math.floor(p.x / S), py = Math.floor(p.y / S), pz = Math.floor(p.z / S), R = 3;
      for (let sy = py - 2; sy <= py + 1; sy++) for (let sz = pz - R; sz <= pz + R; sz++) for (let sx = px - R; sx <= px + R; sx++) {
        if ((sx - px) ** 2 + (sz - pz) ** 2 > (R + 0.5) ** 2) continue;
        // alleen stukken die (deels) onder de tegelbodem liggen
        if (!this.spec.loaded(sx * S + 8, sz * S + 8)) continue;
        if (sy * S >= this.spec.top(sx * S + 8, sz * S + 8) + 1) continue;
        if ((sy + 1) * S < this.floorAt(sx * S + 8, sz * S + 8) - 2) continue;
        want.add(this.key(sx, sy, sz));
      }
    }
    for (const [k, m] of this.meshes) if (!want.has(k)) { this.drop(m); this.meshes.delete(k); }
    if (!this.ready) return;
    const t0 = performance.now();
    // eerst wat dichtbij is
    const todo = [...want].filter(k => !this.meshes.has(k) || this.dirty.has(k));
    const P = [p.x / S, p.y / S, p.z / S];
    todo.sort((a, b) => { const A = a.split('_'), Bk = b.split('_'); return ((A[0] - P[0]) ** 2 + (A[1] - P[1]) ** 2 + (A[2] - P[2]) ** 2) - ((Bk[0] - P[0]) ** 2 + (Bk[1] - P[1]) ** 2 + (Bk[2] - P[2]) ** 2); });
    for (const k of todo) {
      if (performance.now() - t0 > budgetMs) break;
      const [sx, sy, sz] = k.split('_').map(Number);
      const old = this.meshes.get(k); if (old) this.drop(old);
      this.meshes.set(k, this.build(sx, sy, sz, worldGet));
      this.dirty.delete(k);
    }
  }
  drop(m) { for (const o of [m.o, m.t]) if (o) { this.scene.remove(o); o.geometry.dispose(); } }
  dispose() { for (const m of this.meshes.values()) this.drop(m); this.meshes.clear(); this.flush(); }
  // eenvoudige mesh: elk zichtbaar vlak, met licht van lampen in de buurt (verder is het donker)
  build(sx, sy, sz, worldGet) {
    const c = this.chunk(sx, sy, sz), X0 = sx * S, Y0 = sy * S, Z0 = sz * S;
    const get = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < S && y < S && z < S) ? c[(y * S + z) * S + x] : worldGet(X0 + x, Y0 + y, Z0 + z);
    // lampen in de buurt (alleen in veranderde stukken kunnen lampen staan)
    const lamps = [];
    // lampen in de gegraven tunnels en hallen (in dit stuk en de buren)
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cc = dx || dy || dz ? this.cache.get(this.key(sx + dx, sy + dy, sz + dz)) : c; if (!cc) continue;
      for (let i = 0; i < S3; i++) if (cc[i] === B.LAMP) lamps.push([(sx + dx) * S + (i % S), (sy + dy) * S + Math.floor(i / (S * S)), (sz + dz) * S + Math.floor(i / S) % S]);
    }
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const e = this.edits.get(this.key(sx + dx, sy + dy, sz + dz)); if (!e) continue;
      for (let i = 0; i < S3; i++) if (e[i] === B.LAMP + 1) lamps.push([(sx + dx) * S + (i % S), (sy + dy) * S + Math.floor(i / (S * S)), (sz + dz) * S + Math.floor(i / S) % S]);
    }
    const lightAt = (x, y, z) => {
      let l = 0.05;
      for (const [lx, ly, lz] of lamps) { const d = Math.hypot(lx - x, ly - y, lz - z); if (d < 10) l = Math.max(l, (1 - d / 10) ** 1.3); }
      return l;
    };
    const bufs = { o: { pos: [], uv: [], tile: [], light: [], face: [], idx: [], n: 0 }, t: { pos: [], uv: [], tile: [], light: [], face: [], idx: [], n: 0 } };
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const quad = (buf, b, x, y, z, f) => {
      const [nx, ny, nz] = DIRS[f], ft = f === 2 ? 0 : f === 3 ? 2 : 1, tile = FACE_TILE[b * 3 + ft];
      const tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS);
      // hoekpunten van het vlak
      let v;
      if (nx) { const X = nx > 0 ? x + 1 : x; v = nx > 0 ? [[X, y, z + 1], [X, y, z], [X, y + 1, z], [X, y + 1, z + 1]] : [[X, y, z], [X, y, z + 1], [X, y + 1, z + 1], [X, y + 1, z]]; }
      else if (ny) { const Y = ny > 0 ? y + 1 : y; v = ny > 0 ? [[x, Y, z + 1], [x + 1, Y, z + 1], [x + 1, Y, z], [x, Y, z]] : [[x, Y, z], [x + 1, Y, z], [x + 1, Y, z + 1], [x, Y, z + 1]]; }
      else { const Z = nz > 0 ? z + 1 : z; v = nz > 0 ? [[x, y, Z], [x + 1, y, Z], [x + 1, y + 1, Z], [x, y + 1, Z]] : [[x + 1, y, Z], [x, y, Z], [x, y + 1, Z], [x + 1, y + 1, Z]]; }
      const L = lightAt(X0 + x + 0.5 + nx * 0.6, Y0 + y + 0.5 + ny * 0.6, Z0 + z + 0.5 + nz * 0.6);
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let k = 0; k < 4; k++) {
        buf.pos.push(X0 + v[k][0], Y0 + v[k][1], Z0 + v[k][2]);
        buf.uv.push(uvs[k][0], uvs[k][1]); buf.tile.push(tx, ty); buf.light.push(L); buf.face.push(f);
      }
      const o = buf.n; buf.idx.push(o, o + 1, o + 2, o, o + 2, o + 3); buf.n += 4;
    };
    for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const b = c[(y * S + z) * S + x];
      if (!b) {
        // lucht net onder de tegelbodem: onderkant van het blok erboven tonen
        if (y === S - 1) { const above = get(x, y + 1, z); if (above && IS_OPAQUE[above] && Y0 + y + 1 >= this.spec.top(X0 + x, Z0 + z)) quad(bufs.o, above, x, y + 1, z, 3); }
        continue;
      }
      const trans = IS_TRANSPARENT[b];
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = DIRS[f], nb = get(x + dx, y + dy, z + dz);
        if (IS_OPAQUE[nb]) continue;
        if (trans && nb === b) continue;
        quad(trans ? bufs.t : bufs.o, b, x, y, z, f);
      }
    }
    const mk = (buf, mat) => {
      if (!buf.n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      g.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tile, 2));
      g.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 1));
      g.setAttribute('face', new THREE.Float32BufferAttribute(buf.face, 1));
      g.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.layers.enable(1);
      this.scene.add(m); return m;
    };
    return { o: mk(bufs.o, this.mats.under), t: mk(bufs.t, this.mats.underTrans) };
  }
}
