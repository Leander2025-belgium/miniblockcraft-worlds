// De 3D-game: rendering, besturing, natuurkunde, bouwen en breken.
import * as THREE from 'three';
import { meshChunk, CS } from './mesher.js';
import { B, BLOCKS, IS_SOLID, PLACEABLE } from './blocks.js';
import { drawAtlas, ATLAS_COLS, ATLAS_ROWS, iconStyle, CELL, PAD, TILE as TS } from './textures.js';
import { districtAt, GROUND } from './city.js';
import { skyAt, makeClouds } from './environment.js';
import { TILE_INDEX } from './textures.js';
import { FarView } from './lod.js';
import { Traffic } from './traffic.js';
import { Missions } from './missions.js';

const SKY = new THREE.Color(0.62, 0.80, 0.96);
const REAL_CLOUD_Y = 320;
const SKY_RAW = [0.62, 0.80, 0.96];

const VERT = `
attribute vec2 tile;
attribute float light;
varying vec2 vUv;
varying vec2 vTile;
varying float vLight;
varying float vDist;
varying vec3 vWorld;
void main() {
  vUv = uv; vTile = tile; vLight = light;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map;
uniform vec2 atlas;      // atlasgrootte in pixels
uniform vec3 cellInfo;   // celgrootte, rand, tegelgrootte (pixels)
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float alphaTest;
uniform float day;
uniform vec3 sunDir;
uniform float time;
uniform float isTrans;
uniform vec2 lampTile;
uniform vec2 waterTile;
varying vec2 vUv;
varying vec2 vTile;
varying float vLight;
varying float vDist;
varying vec3 vWorld;
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec2 f = fract(vUv);
  float C = cellInfo.x, P = cellInfo.y, T = cellInfo.z;
  vec2 pix = vec2(vTile.x * C + P + f.x * T, vTile.y * C + P + (1.0 - f.y) * T);
  vec2 uv = vec2(pix.x / atlas.x, 1.0 - pix.y / atlas.y);
  // juiste verkleining (mipmap) op basis van de echte schaal, max. 2 niveaus (de rand is 4 pixels)
  vec2 gx = dFdx(vUv) * T, gy = dFdy(vUv) * T;
  float lod = clamp(0.5 * log2(max(dot(gx, gx), dot(gy, gy))), 0.0, 2.0);
  vec4 c = textureLod(map, uv, lod);
  if (c.a < alphaTest) discard;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float daylight = mix(0.16, 1.0, day);
  float sunF = max(dot(n, sunDir), 0.0);
  vec3 col = c.rgb * vLight * daylight * (0.86 + 0.28 * sunF * day);
  float a = c.a;
  bool isLamp = distance(vTile, lampTile) < 0.1;
  bool isWater = distance(vTile, waterTile) < 0.1;
  if (isLamp) col = c.rgb * mix(1.0, 1.35, 1.0 - day);
  if (isWater) {
    float w = sin(vWorld.x * 0.9 + time * 1.3) * sin(vWorld.z * 0.7 - time * 1.1);
    float fr = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col = mix(col, fogColor * 1.05, 0.25 + 0.45 * fr) + vec3(0.06) * w * daylight;
    a = mix(a, 0.9, fr);
  } else if (isTrans > 0.5 && c.a < 0.97) {
    // glas: weerspiegelt de lucht, 's avonds zijn sommige ramen verlicht
    float fr = pow(1.0 - abs(dot(n, viewDir)), 2.5);
    col = mix(col, fogColor * daylight * 1.1 + vec3(0.05), 0.2 + 0.55 * fr);
    vec3 cell = floor(vWorld - n * 0.5);
    float lit = step(0.65, h3(cell)) * (1.0 - day);
    col = mix(col, vec3(1.0, 0.84, 0.55), lit * 0.9);
    a = mix(max(a, 0.35 + 0.4 * fr), 0.95, lit);
  }
  float fog = smoothstep(fogNear, fogFar, vDist);
  gl_FragColor = vec4(mix(col, fogColor, fog), a);
}`;

class World {
  constructor(meta, vox) {
    this.meta = meta;
    this.size = meta.size; this.H = meta.H; this.vox = vox;
    this.nc = Math.ceil(this.size / CS);
    this.tops = new Int16Array(this.nc * this.nc);
    for (let cz = 0; cz < this.nc; cz++) for (let cx = 0; cx < this.nc; cx++) this.recomputeTop(cx, cz);
  }
  recomputeTop(cx, cz) {
    const { size, H, vox } = this;
    let top = 0;
    for (let z = cz * CS; z < Math.min(size, cz * CS + CS); z++) {
      for (let x = cx * CS; x < Math.min(size, cx * CS + CS); x++) {
        const base = (z * size + x) * H;
        for (let y = H - 1; y > top; y--) if (vox[base + y]) { top = y; break; }
      }
    }
    this.tops[cz * this.nc + cx] = top;
  }
  chunkTop(cx, cz) { return this.tops[cz * this.nc + cx]; }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }
  get(x, y, z) {
    if (y < 0 || y >= this.H || !this.inside(x, z)) return 0;
    return this.vox[(z * this.size + x) * this.H + y];
  }
  set(x, y, z, b) {
    if (y < 0 || y >= this.H || !this.inside(x, z)) return false;
    this.vox[(z * this.size + x) * this.H + y] = b;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    if (b && y > this.tops[cz * this.nc + cx]) this.tops[cz * this.nc + cx] = y;
    return true;
  }
  columnTop(x, z) {
    for (let y = this.H - 1; y >= 0; y--) if (this.get(x, y, z)) return y;
    return 0;
  }
  solidAt(x, y, z) {
    if (y < 0 || !this.inside(x, z)) return true; // onzichtbare muur aan de rand
    if (y >= this.H) return false;
    return IS_SOLID[this.vox[(z * this.size + x) * this.H + y]] === 1;
  }
  sourceAt() { return this.src; }
}

// Een grote wereld die uit tegels bestaat en tegels laadt rond de speler.
class TileWorld {
  constructor(spec) {
    this.T = spec.tile; this.n = spec.tiles; this.size = this.T * this.n;
    this.G = spec.ground; this.H = 1024;
    this.tiles = new Map();
  }
  key(tx, tz) { return tz * 1000 + tx; }
  tileAt(x, z) { return this.tiles.get(this.key(Math.floor(x / this.T), Math.floor(z / this.T))); }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }
  get(x, y, z) {
    if (!this.inside(x, z) || y < 0) return 0;
    const t = this.tileAt(x, z);
    if (!t) return 0;
    return t.w.get(x - t.ox, y, z - t.oz);
  }
  set(x, y, z, b) {
    const t = this.inside(x, z) && this.tileAt(x, z);
    if (!t) return false;
    const ok = t.w.set(x - t.ox, y, z - t.oz, b);
    if (ok) t.dirty = true;
    return ok;
  }
  solidAt(x, y, z) {
    if (y < 0 || !this.inside(x, z)) return true;
    const t = this.tileAt(x, z);
    if (!t) return y <= this.G; // nog niet geladen: vaste grond
    return t.w.solidAt(x - t.ox, y, z - t.oz);
  }
  columnTop(x, z) {
    const t = this.tileAt(x, z);
    return t ? t.w.columnTop(x - t.ox, z - t.oz) : this.G;
  }
  sourceAt(x, z) { return this.tileAt(x, z); }
}

export class Game {
  constructor(ui) {
    this.ui = ui; // { root, canvas, hud, ... } DOM-elementen
    this.renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance' });
    this.settings = loadSettings();
    this.applyQuality();
    this.renderer.setClearColor(SKY);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1000);
    this.camera.rotation.order = 'YXZ';
    const atlasCanvas = drawAtlas();
    this.atlasUrl = atlasCanvas.toDataURL();
    const tex = new THREE.CanvasTexture(atlasCanvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = 4;
    const uniforms = () => ({
      map: { value: tex }, atlas: { value: new THREE.Vector2(ATLAS_COLS * CELL, ATLAS_ROWS * CELL) }, cellInfo: { value: new THREE.Vector3(CELL, PAD, TS) },
      fogColor: { value: new THREE.Vector3(...SKY_RAW) }, fogNear: { value: 60 }, fogFar: { value: 150 }, alphaTest: { value: 0.5 },
      day: { value: 1 }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() }, time: { value: 0 }, isTrans: { value: 0 },
      lampTile: { value: new THREE.Vector2(TILE_INDEX.lamp % ATLAS_COLS, Math.floor(TILE_INDEX.lamp / ATLAS_COLS)) },
      waterTile: { value: new THREE.Vector2(TILE_INDEX.water % ATLAS_COLS, Math.floor(TILE_INDEX.water / ATLAS_COLS)) },
    });
    this.matOpaque = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms() });
    this.matTrans = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.matTrans.uniforms.alphaTest.value = 0.02;
    this.matTrans.uniforms.isTrans.value = 1;
    this.clouds = makeClouds(REAL_CLOUD_Y);
    this.scene.add(this.clouds);
    this.clock = 0;

    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.highlight = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.keys = new Set();
    this.running = false;
    this.hotbar = [B.GRASS, B.BRICK, B.PLANKS, B.GLASS, B.CONCRETE, B.STONE, B.LOG, B.LEAVES, B.LAMP];
    this.slot = 0;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.joy = { x: 0, y: 0 };
    this.bindInput();
    this.buildHotbar();
    this.buildInventory();
    this.applySettings();
    this.missions = new Missions((m) => this.toast(`🏆 Opdracht voltooid: ${m.name}`));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (!this.running || !this.tiled) return;
      this.tiled.aheadKey = null;
      this.updateTiles(true);
    });
  }

  // ---------- laden ----------
  load(meta, vox) {
    this.clearChunks();
    this.meta = meta;
    this.tiled = null;
    if (this.lod) { this.lod.dispose(); this.lod = null; }
    if (this.traffic) { this.traffic.dispose(); this.traffic = null; }
    this.mini = null;
    this.world = new World(meta, vox);
    this.chunks = new Map();
    this.dirty = false;
    this.queue = [];
    this.totalChunks = 0;
    this.builtChunks = 0;
    this.world.src = { w: this.world, ox: 0, oz: 0, key: 'main' };
    this.addSource(this.world.src);
    this.player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, fly: false, inWater: false };
    if (meta.player) {
      Object.assign(this.player, { yaw: meta.player.yaw, pitch: meta.player.pitch, fly: !!meta.player.fly });
      this.player.pos.set(meta.player.x, meta.player.y, meta.player.z);
    } else this.spawn();
    this.sortQueue();
    this.lastAuto = performance.now();
    this.updateHud(true);
  }

  // Grote wereld uit tegels. provider(tx, tz) geeft een Promise<{ vox, H }>.
  loadTiled(meta, spec, provider, saveTile) {
    this.clearChunks();
    this.meta = meta;
    this.world = new TileWorld(spec);
    this.tiled = { spec, provider, saveTile, prefetchArea: spec.prefetchArea, inFlight: 0, pending: new Set(), failed: new Map(), lastCheck: 0 };
    this.chunks = new Map();
    this.dirty = false;
    this.queue = [];
    this.totalChunks = 0;
    this.builtChunks = 0;
    this.player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, fly: true, inWater: false };
    const pl = meta.player || spec.spawn;
    Object.assign(this.player, { yaw: pl.yaw || 0, pitch: pl.pitch || 0, fly: pl.fly ?? true });
    this.player.pos.set(pl.x, pl.y, pl.z);
    this.lastAuto = performance.now();
    if (this.lod) this.lod.dispose();
    this.lod = new FarView(this.scene, spec);
    if (this.traffic) this.traffic.dispose();
    this.traffic = new Traffic(this.scene, spec.ground);
    this.mini = { canvas: this.lod.canvas, scale: this.lod.cell, size: this.world.size };
    const T = spec.tile;
    spec.requestLods?.(Math.floor(this.player.pos.x / T), Math.floor(this.player.pos.z / T), Math.ceil(this.settings.lod / T) + 1);
    this.updateTiles(true);
    this.updateHud(true);
  }

  addSource(src) {
    const nc = src.w.nc;
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) this.queue.push([src, cx, cz]);
    this.totalChunks += nc * nc;
    if (this.player) this.sortQueue();
  }

  removeSource(src) {
    src.dead = true;
    for (const [k, c] of this.chunks) {
      if (c.src !== src) continue;
      for (const m of [c.o, c.t]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
      this.chunks.delete(k);
    }
  }

  updateTiles(force) {
    const td = this.tiled;
    if (!td) return;
    const now = performance.now();
    if (!force && now - td.lastCheck < 400) return;
    td.lastCheck = now;
    if (this.queue.length > 1) this.sortQueue(); // bij snel vliegen: eerst wat dichtbij is
    const W = this.world, T = W.T, p = this.player.pos;
    const ptx = Math.floor(p.x / T), ptz = Math.floor(p.z / T);
    const R = Math.max(1, Math.ceil((this.settings.view + 48) / T));
    // de worker werkt alvast verder vooruit (ook als het tabblad verborgen is)
    const ahead = Math.max(R + (document.hidden || !this.active() ? 4 : 2), Math.ceil(this.settings.lod / T));
    if (td.prefetchArea && (td.aheadKey !== ptx + ',' + ptz + ',' + ahead)) {
      td.aheadKey = ptx + ',' + ptz + ',' + ahead;
      td.prefetchArea(ptx, ptz, ahead);
    }
    // tegels die te ver weg zijn opruimen (eerst bewaren als je er iets veranderde)
    for (const [k, t] of W.tiles) {
      if (Math.max(Math.abs(t.tx - ptx), Math.abs(t.tz - ptz)) > R + 1) {
        if (t.dirty) td.saveTile(t.tx, t.tz, t.w.vox, t.w.H);
        this.removeSource(t);
        W.tiles.delete(k);
        this.trafficDirty = true;
      }
    }
    // ontbrekende tegels aanvragen, dichtstbij eerst
    const want = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const tx = ptx + dx, tz = ptz + dz;
      if (tx < 0 || tz < 0 || tx >= W.n || tz >= W.n) continue;
      if ((dx * dx + dz * dz) > (R + 0.5) ** 2) continue;
      const k = W.key(tx, tz);
      if (W.tiles.has(k) || td.pending.has(k)) continue;
      if ((td.failed.get(k) || 0) > now) continue;
      want.push([dx * dx + dz * dz, tx, tz, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, tx, tz, k] of want) {
      if (td.inFlight >= 3) break;
      td.inFlight++; td.pending.add(k);
      td.provider(tx, tz).then(({ vox, H, paths }) => {
        if (this.world !== W) return;
        const w = new World({ size: T, H }, vox);
        const src = { w, ox: tx * T, oz: tz * T, key: 't' + k, tx, tz, dirty: false, paths };
        this.trafficDirty = true;
        w.src = src;
        W.tiles.set(k, src);
        this.addSource(src);
      }).catch((err) => {
        td.failed.set(k, performance.now() + 15000);
        this.tileError = err && err.message;
      }).finally(() => { td.inFlight--; td.pending.delete(k); });
    }
  }

  saveDirtyTiles() {
    if (!this.tiled) return;
    for (const t of this.world.tiles.values()) if (t.dirty) { this.tiled.saveTile(t.tx, t.tz, t.w.vox, t.w.H); t.dirty = false; }
  }

  spawn() {
    const w = this.world, c = w.size >> 1, G = this.meta.ground ?? GROUND;
    const good = new Set([B.ASPHALT, B.SIDEWALK, B.TILE, B.LINE_WHITE, B.GRAVEL, B.COBBLE, B.GRASS, B.CONCRETE]);
    for (let r = 0; r < c; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = c + dx, z = c + dz;
        if (!w.inside(x, z)) continue;
        const top = w.columnTop(x, z);
        if (top <= G && good.has(w.get(x, top, z))) {
          this.player.pos.set(x + 0.5, top + 1, z + 0.5);
          return;
        }
      }
    }
    this.player.pos.set(c + 0.5, w.columnTop(c, c) + 1, c + 0.5);
  }

  sortQueue() {
    const px = this.player.pos.x, pz = this.player.pos.z;
    const d = (q) => (q[0].ox + q[1] * CS + 8 - px) ** 2 + (q[0].oz + q[2] * CS + 8 - pz) ** 2;
    this.queue.sort((a, b) => d(b) - d(a));
  }

  clearChunks() {
    if (!this.chunks) return;
    for (const c of this.chunks.values()) {
      for (const m of [c.o, c.t]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    }
    this.chunks.clear();
  }

  buildChunk(src, cx, cz) {
    if (src.dead) return;
    const key = src.key + ':' + (cz * src.w.nc + cx);
    const old = this.chunks.get(key);
    if (old) for (const m of [old.o, old.t]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const out = meshChunk(src.w, cx, cz);
    const entry = { o: this.toMesh(out.opaque, this.matOpaque, src), t: this.toMesh(out.trans, this.matTrans, src), src,
      wx: src.ox + cx * CS + 8, wz: src.oz + cz * CS + 8 };
    if (entry.t) entry.t.renderOrder = 1;
    this.chunks.set(key, entry);
  }

  toMesh(buf, mat, src) {
    if (!buf.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tile, 2));
    g.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 1));
    g.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.position.set(src.ox, 0, src.oz);
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    return m;
  }

  remeshAround(gx, gz) {
    const src = this.world.sourceAt(gx, gz);
    if (!src) return;
    const x = gx - src.ox, z = gz - src.oz;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const set = new Set([`${cx},${cz}`]);
    const lx = x - cx * CS, lz = z - cz * CS;
    if (lx === 0) set.add(`${cx - 1},${cz}`);
    if (lx === CS - 1) set.add(`${cx + 1},${cz}`);
    if (lz === 0) set.add(`${cx},${cz - 1}`);
    if (lz === CS - 1) set.add(`${cx},${cz + 1}`);
    if (lx === 0 && lz === 0) set.add(`${cx - 1},${cz - 1}`);
    if (lx === CS - 1 && lz === 0) set.add(`${cx + 1},${cz - 1}`);
    if (lx === 0 && lz === CS - 1) set.add(`${cx - 1},${cz + 1}`);
    if (lx === CS - 1 && lz === CS - 1) set.add(`${cx + 1},${cz + 1}`);
    for (const k of set) {
      const [a, b] = k.split(',').map(Number);
      if (a >= 0 && b >= 0 && a < src.w.nc && b < src.w.nc) this.buildChunk(src, a, b);
    }
  }

  // ---------- lus ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.ui.root.hidden = false;
    this.resize();
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (this.tiled) this.updateTiles();
      this.buildSome();
      this.tileStatus();
      if (this.active()) this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    if (this.touch) this.setPaused(false);
    else this.showOverlay('start');
  }
  stop() {
    this.running = false;
    if (this.lod) { this.lod.dispose(); this.lod = null; }
    if (this.traffic) { this.traffic.dispose(); this.traffic = null; }
    cancelAnimationFrame(this.raf);
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.root.hidden = true;
    this.clearChunks();
  }
  active() { return this.touch ? !this.paused : !!document.pointerLockElement; }

  buildSome() {
    if (!this.queue.length) return;
    const t0 = performance.now();
    let n = 0;
    while (this.queue.length && (performance.now() - t0 < 12 || n === 0)) {
      const [src, cx, cz] = this.queue.pop();
      this.buildChunk(src, cx, cz);
      this.builtChunks++; n++;
    }
    if (this.tiled) return;
    const pct = Math.round(this.builtChunks / this.totalChunks * 100);
    this.ui.loading.hidden = pct >= 100;
    this.ui.loading.textContent = `Wereld opbouwen… ${pct}%`;
  }

  tileStatus() {
    const td = this.tiled;
    if (!td) return;
    const p = this.player.pos, here = this.world.tileAt(p.x, p.z);
    const busy = td.inFlight > 0 || this.queue.length > 0;
    this.ui.loading.hidden = !!here && !busy;
    this.ui.loading.classList.toggle('minor', !!here);
    if (!here) this.ui.loading.textContent = this.tileError ? `Laden lukt niet: ${this.tileError}. Opnieuw proberen…` : 'Stad laden… (de eerste keer duurt dit even)';
    else this.ui.loading.textContent = `Stad laden… ${td.inFlight} stukken onderweg`;
    const ap = this.aheadProgress;
    const bg = ap && ap.done < ap.total ? `Omgeving klaarzetten: ${ap.done} van ${ap.total} stukken (gaat door op de achtergrond)` : ap ? 'Omgeving rond je is klaar ✓' : '';
    if (here && !busy && ap && ap.done < ap.total) { this.ui.loading.hidden = false; this.ui.loading.textContent = bg; }
    const pl = document.getElementById('pause-load');
    if (pl) pl.textContent = bg;
  }

  render() {
    const p = this.player;
    this.camera.position.set(p.pos.x, p.pos.y + 1.62, p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    const far = this.settings.view;
    // dag en nacht
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
    this.lastRender = now;
    this.clock += dt;
    if (this.settings.cycle) { this.settings.hour = (this.settings.hour + dt / 30) % 24; this.syncTimeUi?.(); } // 1 uur per 30 s
    const env = skyAt(this.settings.hour);
    this.renderer.setClearColor(new THREE.Color(...env.sky));
    for (const m of [this.matOpaque, this.matTrans]) {
      const u = m.uniforms;
      if (this.tiled) { u.fogNear.value = this.settings.lod * 0.35; u.fogFar.value = this.settings.lod; }
      else { u.fogNear.value = far * 0.45; u.fogFar.value = far; }
      u.fogColor.value.set(...env.sky); u.day.value = env.day; u.sunDir.value.copy(env.sun); u.time.value = this.clock;
    }
    this.clouds.position.x = p.pos.x; this.clouds.position.z = p.pos.z;
    this.clouds.material.map.offset.set((p.pos.x / 9000) * 6 + this.clock * 0.002, (p.pos.z / 9000) * 6);
    this.clouds.material.color.setRGB(...env.sky.map((v, i) => Math.min(1, 0.55 + v * 0.5 + env.dusk * [0.3, 0.1, 0][i])));
    this.clouds.material.opacity = 0.35 + env.day * 0.55;
    if (this.lod) this.lod.update(env, this.settings.lod, this.world.tiles, p.pos.x, p.pos.z);
    if (this.traffic && this.settings.traffic !== false) {
      if (this.trafficDirty) { this.trafficDirty = false; this.traffic.rebuild(this.world.tiles, p.pos); }
      this.traffic.update(dt, p.pos, env.day);
    }
    this.camera.far = (this.tiled ? Math.max(far, this.settings.lod * 1.6) : far) + 60; this.camera.updateProjectionMatrix();
    const pcx = p.pos.x, pcz = p.pos.z, lim = (far + CS * 1.5) ** 2;
    for (const c of this.chunks.values()) {
      const dx = c.wx - pcx, dz = c.wz - pcz;
      const vis = !!this.tiled || dx * dx + dz * dz < lim; // in grote kaarten: alle geladen tegels tonen (geen gat met de verre blokken)
      if (c.o) c.o.visible = vis;
      if (c.t) c.t.visible = vis;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawMinimap();
  }

  // ---------- minikaart ----------
  ensureMini() {
    if (this.mini || !this.world || this.tiled) return;
    // los stuk: kleuren van de bovenste blokken
    const w = this.world, S = w.size, c = document.createElement('canvas');
    c.width = c.height = S;
    const img = new ImageData(S, S);
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const y = w.columnTop(x, z), col = BLOCKS[w.get(x, y, z)].color, i = (z * S + x) * 4;
      const f = 0.82 + Math.min(0.45, (y - (this.meta.ground ?? GROUND)) / 250);
      img.data[i] = col[0] * f; img.data[i + 1] = col[1] * f; img.data[i + 2] = col[2] * f; img.data[i + 3] = 255;
    }
    c.getContext('2d').putImageData(img, 0, 0);
    this.mini = { canvas: c, scale: 1, size: S };
  }
  drawMinimap() {
    const el = this.ui.minimap;
    if (!el || el.hidden) return;
    const now = performance.now();
    if (now - (this.miniT || 0) < 200) return;
    this.miniT = now;
    this.ensureMini();
    if (!this.mini) return;
    const ctx = el.getContext('2d'), W = el.width, p = this.player.pos;
    const metersPerPx = 4, span = W * metersPerPx, sc = this.mini.scale;
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mini.canvas, (p.x - span / 2) / sc, (p.z - span / 2) / sc, span / sc, span / sc, 0, 0, W, W);
    this.drawArrow(ctx, W / 2, W / 2, 7);
  }
  drawArrow(ctx, x, y, r) {
    const a = -this.player.yaw;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, r); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r * 0.7, r); ctx.closePath();
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // grote kaart (M): klik om erheen te vliegen
  openMap() {
    this.ensureMini();
    if (!this.mini) return;
    const c = this.ui.bigmap, S = this.mini.canvas.width;
    c.width = c.height = Math.min(1024, Math.max(512, S));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.mini.canvas, 0, 0, c.width, c.height);
    const k = c.width / this.mini.size;
    this.drawArrow(ctx, this.player.pos.x * k, this.player.pos.z * k, 9);
    if (!c.dataset.bound) {
      c.dataset.bound = '1';
      c.addEventListener('click', (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * this.mini.size, z = (e.clientY - r.top) / r.height * this.mini.size;
        const p = this.player;
        p.pos.set(x, (this.meta.ground ?? GROUND) + 60, z); p.vel.set(0, 0, 0); p.fly = true; p.pitch = -0.3;
        if (this.tiled) { this.tiled.aheadKey = null; this.updateTiles(true); }
        this.invOpen = false;
        this.resume();
      });
    }
    this.invOpen = true; this.invWhich = 'map'; // zelfde gedrag als de inventaris: muis vrij, spel pauzeert
    if (document.pointerLockElement) document.exitPointerLock();
    this.paused = true;
    this.showOverlay('map');
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- natuurkunde ----------
  solid(x, y, z) { return this.world.solidAt(x, y, z); }
  collides(px, py, pz) {
    const r = 0.3, h = 1.8;
    const x0 = Math.floor(px - r), x1 = Math.floor(px + r - 1e-6);
    const y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-6);
    const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r - 1e-6);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.solid(x, y, z)) return true;
    return false;
  }
  moveAxis(axis, d) {
    if (!d) return false;
    const p = this.player.pos;
    p[axis] += d;
    if (!this.collides(p.x, p.y, p.z)) return false;
    p[axis] -= d;
    let lo = 0, hi = d;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      p[axis] += mid;
      const hit = this.collides(p.x, p.y, p.z);
      p[axis] -= mid;
      if (hit) hi = mid; else lo = mid;
    }
    p[axis] += lo;
    return true;
  }

  update(dt) {
    const p = this.player, k = this.keys;
    if (this.tiled && !this.world.tileAt(p.pos.x, p.pos.z)) { this.updateTarget(); this.updateHud(); return; }
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    fx += this.joy.x; fz += this.joy.y;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const sprint = k.has('ShiftLeft') && !p.fly || k.has('ControlLeft') || this.touchSprint || this.boost;
    const feet = this.world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.4), Math.floor(p.pos.z));
    p.inWater = feet === B.WATER;
    let speed = p.fly ? FLY_SPEEDS[this.flyLevel || 0] * (this.boost || this.touchSprint ? 2.5 : 1) : (sprint ? 6.6 : 4.4);
    if (p.inWater && !p.fly) speed *= 0.55;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    // vliegend: vooruit gaat in de kijkrichting (ook omhoog/omlaag)
    const fzH = p.fly ? fz * Math.cos(p.pitch) : fz;
    const wx = (fx * cos + fzH * sin) * speed, wz = (-fx * sin + fzH * cos) * speed;
    const acc = p.onGround || p.fly ? 14 : 4;
    p.vel.x += (wx - p.vel.x) * Math.min(1, acc * dt);
    p.vel.z += (wz - p.vel.z) * Math.min(1, acc * dt);

    const up = k.has('Space') || this.touchUp;
    const down = (k.has('ShiftLeft') || k.has('KeyC')) && p.fly || this.touchDown;
    if (p.fly) {
      p.vel.y = (up ? speed * 0.8 : down ? -speed * 0.8 : 0) - fz * Math.sin(p.pitch) * speed;
    } else if (p.inWater) {
      p.vel.y -= 9 * dt;
      if (up) p.vel.y = 3.5;
      p.vel.y = Math.max(p.vel.y, -3);
    } else {
      p.vel.y -= 28 * dt;
      if (up && p.onGround) p.vel.y = 9.2;
      p.vel.y = Math.max(p.vel.y, -55);
    }

    // stappen opdelen voor snelle bewegingen
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vel.x), Math.abs(p.vel.y), Math.abs(p.vel.z)) * dt / 0.4));
    const sdt = dt / steps;
    let blockedH = false;
    p.onGround = false;
    for (let i = 0; i < steps; i++) {
      if (this.moveAxis('x', p.vel.x * sdt)) { blockedH = true; p.vel.x = 0; }
      if (this.moveAxis('z', p.vel.z * sdt)) { blockedH = true; p.vel.z = 0; }
      if (this.moveAxis('y', p.vel.y * sdt)) {
        if (p.vel.y < 0) { p.onGround = true; if (p.fly) p.fly = false, this.updateHud(true); }
        p.vel.y = 0;
      }
    }
    // automatisch opspringen (aanraakschermen)
    if (blockedH && p.onGround && this.touch && len > 0.3) p.vel.y = 9.2;
    if (p.pos.y < -10 && !this.tiled) this.spawn();

    // muis ingedrukt houden = herhalen
    this.actionTimer = (this.actionTimer || 0) - dt;
    if (this.holding && this.actionTimer <= 0) { this.act(this.holding); this.actionTimer = 0.22; }

    this.updateTarget();
    this.updateHud();
    // opdrachten: hoogte, afstand, nacht
    {
      const G = this.meta.ground ?? GROUND, sc = (this.meta.real && this.meta.real.scale) || 1;
      this.missions.max('maxH', (p.pos.y - G) / sc);
      if (this.lastPos) {
        const d = Math.hypot(p.pos.x - this.lastPos.x, p.pos.z - this.lastPos.z) / sc;
        if (d < 50) { this.distAcc = (this.distAcc || 0) + d; if (this.distAcc > 10) { this.missions.add('dist', this.distAcc); this.distAcc = 0; } }
      }
      this.lastPos = { x: p.pos.x, z: p.pos.z };
      const hr = this.settings.hour;
      if ((hr >= 23 || hr < 1) && !this.missions.stats.night) this.missions.max('night', 1);
    }
    const now = performance.now();
    if (this.dirty && now - this.lastAuto > 30000) { this.lastAuto = now; this.ui.onSave?.(false); }
  }

  // ---------- blokken aanwijzen ----------
  raycast(maxD = 7) {
    const o = this.camera.position, d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
    let ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
    let tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
    let n = [0, 0, 0], t = 0;
    while (t <= maxD) {
      const b = this.world.get(x, y, z);
      if (b && b !== B.WATER) return { x, y, z, b, n };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
    }
    return null;
  }
  updateTarget() {
    this.target = this.raycast();
    if (this.target) {
      this.highlight.visible = true;
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else this.highlight.visible = false;
  }
  act(kind) {
    const t = this.target || this.raycast();
    if (!t) return;
    if (kind === 'break') {
      if (t.b === B.BEDROCK) return;
      this.world.set(t.x, t.y, t.z, 0);
      this.remeshAround(t.x, t.z);
      this.missions.add('broken');
    } else if (kind === 'place') {
      const x = t.x + t.n[0], y = t.y + t.n[1], z = t.z + t.n[2];
      if (!this.world.inside(x, z) || y < 0) return;
      const cur = this.world.get(x, y, z);
      if (cur && cur !== B.WATER) return;
      const b = this.hotbar[this.slot];
      if (!this.world.set(x, y, z, b)) return;
      if (IS_SOLID[b]) {
        const p = this.player.pos;
        if (this.collides(p.x, p.y, p.z)) { this.world.set(x, y, z, cur); return; }
      }
      this.remeshAround(x, z);
      // opdrachten bijhouden
      const G = this.meta.ground ?? GROUND, sc = (this.meta.real && this.meta.real.scale) || 1;
      this.missions.add('placed');
      this.missions.max('maxPlaceH', (y - G) / sc);
      if (b === B.GRASS || b === B.LEAVES || b === B.HEDGE || b === B.FLOWERS) this.missions.add('green');
      if (b === B.GLASS || b === B.DARKGLASS || b === B.GLASS_BLUE || b === B.GLASS_GREEN || b === B.MIRROR) this.missions.add('glass');
      for (let yy = y - 1; yy >= Math.max(0, G - 4); yy--) {
        const below = this.world.get(x, yy, z);
        if (!below) continue;
        if (below === B.WATER) this.missions.add('overWater');
        break;
      }
    } else if (kind === 'pick') {
      if (PLACEABLE.includes(t.b)) { this.hotbar[this.slot] = t.b; this.buildHotbar(); }
      return;
    }
    this.dirty = true;
    this.updateTarget();
  }

  // ---------- HUD ----------
  updateHud(force) {
    const now = performance.now();
    if (!force && now - (this.hudT || 0) < 200) return;
    this.hudT = now;
    const p = this.player, m = this.meta, fly = p.fly ? ` · ✈ ${FLY_NAMES[this.flyLevel || 0]}${this.boost ? ' + boost' : ''}` : '';
    const sc = (m.real && m.real.scale) || 1;
    const h = Math.floor((p.pos.y - (m.ground ?? GROUND)) / sc);
    if (m.real) {
      const lat = m.real.lat - (p.pos.z - m.size / 2) / sc / 110574;
      const lon = m.real.lon + (p.pos.x - m.size / 2) / sc / (111320 * Math.cos(m.real.lat * Math.PI / 180));
      this.ui.coords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} · hoogte ${h} m`;
      const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const dir = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'][Math.round(deg / 45) % 8];
      this.ui.place.textContent = `${m.name} · kijkrichting ${dir}${fly}`;
      return;
    }
    const ax = Math.floor(m.x0 + p.pos.x), az = Math.floor(m.z0 + p.pos.z);
    const d = districtAt(ax, az);
    this.ui.coords.textContent = `x ${ax} · z ${az} · hoogte ${h} m`;
    this.ui.place.textContent = `${d.wijk} · ${d.typeName}${fly}`;
  }

  buildHotbar() {
    const el = this.ui.hotbar;
    el.innerHTML = '';
    this.hotbar.forEach((b, i) => {
      const s = document.createElement('button');
      s.className = 'slot' + (i === this.slot ? ' sel' : '');
      s.title = BLOCKS[b].name;
      s.innerHTML = `<span class="ic" style="${iconStyle(this.atlasUrl, b, 36)}"></span><span class="num">${i + 1}</span>`;
      s.addEventListener('click', (e) => { e.stopPropagation(); this.selectSlot(i); });
      el.appendChild(s);
    });
    this.ui.blockName.textContent = BLOCKS[this.hotbar[this.slot]].name;
  }
  selectSlot(i) {
    this.slot = (i + 9) % 9;
    [...this.ui.hotbar.children].forEach((c, j) => c.classList.toggle('sel', j === this.slot));
    this.ui.blockName.textContent = BLOCKS[this.hotbar[this.slot]].name;
  }
  buildInventory() {
    const grid = this.ui.invGrid;
    grid.innerHTML = '';
    for (const b of PLACEABLE) {
      const s = document.createElement('button');
      s.className = 'slot';
      s.title = BLOCKS[b].name;
      s.innerHTML = `<span class="ic" style="${iconStyle(this.atlasUrl, b, 40)}"></span><span class="lbl">${BLOCKS[b].name}</span>`;
      s.addEventListener('click', () => { this.hotbar[this.slot] = b; this.buildHotbar(); });
      grid.appendChild(s);
    }
  }

  // ---------- overlays ----------
  showOverlay(which) {
    for (const [k, el] of Object.entries(this.ui.overlays)) el.hidden = k !== which;
  }
  setPaused(p) {
    this.paused = p;
    if (p) { this.missions.render(document.getElementById('missions')); this.showOverlay('pause'); this.ui.onSave?.(false); }
    else this.showOverlay(null);
  }
  resume() {
    if (this.touch) { this.setPaused(false); return; }
    this.showOverlay(null);
    const r = this.ui.canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(() => this.showOverlay('start'));
  }
  openInventory() {
    this.invOpen = true; this.invWhich = 'inv';
    if (document.pointerLockElement) document.exitPointerLock();
    this.paused = true;
    this.showOverlay('inv');
  }
  closeInventory() {
    this.invOpen = false;
    this.resume();
  }

  // beeldkwaliteit: hoe scherp (resolutie) er getekend wordt
  applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const q = this.settings.quality || 'normal';
    const r = q === 'fast' ? 1 : q === 'sharp' ? Math.min(dpr, 2) : Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(r);
    if (this.camera) this.resize();
  }
  applySettings() {
    this.ui.viewRange.value = this.settings.view;
    this.ui.viewLabel.textContent = `${this.settings.view} m`;
    this.ui.sens.value = this.settings.sens;
    const hour = document.getElementById('set-hour'), cyc = document.getElementById('set-cycle');
    this.syncTimeUi = () => {
      if (!hour) return;
      if (document.activeElement !== hour) hour.value = this.settings.hour;
      const hh = Math.floor(this.settings.hour), mm = Math.floor((this.settings.hour % 1) * 60);
      document.getElementById('set-hour-label').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    if (hour && !hour.dataset.bound) {
      hour.dataset.bound = '1';
      hour.addEventListener('input', () => { this.settings.hour = +hour.value; this.syncTimeUi(); saveSettings(this.settings); });
      cyc.addEventListener('change', () => { this.settings.cycle = cyc.checked; saveSettings(this.settings); });
    }
    if (cyc) cyc.checked = !!this.settings.cycle;
    const ql = document.getElementById('set-quality');
    if (ql) {
      ql.value = this.settings.quality || 'normal';
      if (!ql.dataset.bound) { ql.dataset.bound = '1'; ql.addEventListener('change', () => { this.settings.quality = ql.value; saveSettings(this.settings); this.applyQuality(); }); }
    }
    const lodR = document.getElementById('set-lod');
    if (lodR) {
      lodR.value = this.settings.lod;
      document.getElementById('set-lod-label').textContent = `${(this.settings.lod / 1000).toLocaleString('nl-BE')} km`;
      if (!lodR.dataset.bound) {
        lodR.dataset.bound = '1';
        lodR.addEventListener('input', () => {
          this.settings.lod = +lodR.value; saveSettings(this.settings);
          document.getElementById('set-lod-label').textContent = `${(this.settings.lod / 1000).toLocaleString('nl-BE')} km`;
          if (this.tiled) { this.tiled.aheadKey = null; const T = this.world.T; this.tiled.spec.requestLods?.(Math.floor(this.player.pos.x / T), Math.floor(this.player.pos.z / T), Math.ceil(this.settings.lod / T) + 1); }
        });
      }
    }
    this.syncTimeUi();
  }

  // ---------- invoer ----------
  bindInput() {
    const ui = this.ui;
    document.addEventListener('pointerlockchange', () => {
      if (!this.running) return;
      if (document.pointerLockElement) { this.showOverlay(null); this.paused = false; }
      else {
        this.keys.clear(); this.holding = null;
        if (this.invOpen) this.showOverlay(this.invWhich || 'inv');
        else { this.missions.render(document.getElementById('missions')); this.showOverlay('pause'); this.ui.onSave?.(false); }
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.invOpen) this.closeInventory(); else if (this.active()) this.openInventory();
        return;
      }
      if (!this.active()) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1) this.selectSlot(n - 1); }
      if (e.code === 'KeyF') this.toggleFly();
      const now = performance.now();
      if (e.code === 'Space' && !e.repeat) {
        if (now - (this.lastSpace || 0) < 300) { this.toggleFly(); this.lastSpace = 0; } else this.lastSpace = now;
      }
      if (e.code === 'KeyW' && !e.repeat) {
        if (now - (this.lastW || 0) < 300) this.boost = true;
        this.lastW = now;
      }
      if (e.code === 'KeyR' && !e.repeat) this.cycleFlySpeed();
      if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); this.openMap(); }
      if (e.code === 'KeyP' && !e.repeat) this.togglePhoto();
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.photo) this.savePhoto();
      if (e.code === 'KeyT' && !e.repeat) { this.settings.hour = (Math.floor(this.settings.hour) + 3) % 24; this.syncTimeUi(); saveSettings(this.settings); this.toast(`🕒 ${String(Math.floor(this.settings.hour)).padStart(2, '0')}:00`); }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyW') this.boost = false; });
    window.addEventListener('blur', () => this.keys.clear());
    ui.canvas.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      const s = 0.0022 * this.settings.sens;
      this.player.yaw -= e.movementX * s;
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - e.movementY * s));
    });
    ui.canvas.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return;
      const kind = e.button === 0 ? 'break' : e.button === 2 ? 'place' : 'pick';
      this.act(kind);
      if (kind !== 'pick') { this.holding = kind; this.actionTimer = 0.3; }
    });
    window.addEventListener('mouseup', () => { this.holding = null; });
    ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.canvas.addEventListener('wheel', (e) => {
      if (!this.active()) return;
      this.selectSlot(this.slot + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });
    ui.overlays.start.addEventListener('click', () => this.resume());
    ui.btnResume.addEventListener('click', () => this.resume());
    ui.btnInvClose.addEventListener('click', () => this.closeInventory());
    ui.viewRange.addEventListener('input', () => {
      this.settings.view = +ui.viewRange.value; ui.viewLabel.textContent = `${this.settings.view} m`; saveSettings(this.settings);
    });
    ui.sens.addEventListener('input', () => { this.settings.sens = +ui.sens.value; saveSettings(this.settings); });

    // --- aanraakbediening ---
    const stick = ui.touch.stick, knob = ui.touch.knob;
    let moveId = null, ox = 0, oy = 0;
    ui.touch.move.addEventListener('pointerdown', (e) => {
      moveId = e.pointerId; ox = e.clientX; oy = e.clientY;
      stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.hidden = false;
      ui.touch.move.setPointerCapture(e.pointerId);
    });
    ui.touch.move.addEventListener('pointermove', (e) => {
      if (e.pointerId !== moveId) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const l = Math.hypot(dx, dy), max = 50;
      if (l > max) { dx *= max / l; dy *= max / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / max; this.joy.y = dy / max;
      this.touchSprint = l > max * 1.6;
    });
    const endMove = (e) => {
      if (e.pointerId !== moveId) return;
      moveId = null; this.joy.x = this.joy.y = 0; this.touchSprint = false; stick.hidden = true; knob.style.transform = '';
    };
    ui.touch.move.addEventListener('pointerup', endMove);
    ui.touch.move.addEventListener('pointercancel', endMove);
    let lookId = null, lx = 0, ly = 0;
    ui.touch.look.addEventListener('pointerdown', (e) => {
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY; ui.touch.look.setPointerCapture(e.pointerId);
    });
    ui.touch.look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      const s = 0.005 * this.settings.sens;
      this.player.yaw -= (e.clientX - lx) * s;
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - (e.clientY - ly) * s));
      lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    ui.touch.look.addEventListener('pointerup', endLook);
    ui.touch.look.addEventListener('pointercancel', endLook);
    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    hold(ui.touch.jump, () => { this.touchUp = true; }, () => { this.touchUp = false; });
    hold(ui.touch.down, () => { this.touchDown = true; }, () => { this.touchDown = false; });
    hold(ui.touch.brk, () => { this.act('break'); this.holding = 'break'; this.actionTimer = 0.35; }, () => { this.holding = null; });
    hold(ui.touch.put, () => { this.act('place'); this.holding = 'place'; this.actionTimer = 0.35; }, () => { this.holding = null; });
    ui.touch.fly.addEventListener('click', () => this.toggleFly());
    ui.touch.speed?.addEventListener('click', () => this.cycleFlySpeed());
    ui.touch.inv.addEventListener('click', () => this.openInventory());
    ui.touch.menu.addEventListener('click', () => { if (this.photo) { this.togglePhoto(false); return; } this.setPaused(true); });
    document.getElementById('btn-photo')?.addEventListener('click', () => { this.togglePhoto(true); this.resume(); });
    document.getElementById('t-shot')?.addEventListener('click', () => this.savePhoto());
    document.getElementById('t-photo-exit')?.addEventListener('click', () => this.togglePhoto(false));
    ui.minimap?.addEventListener('click', () => this.openMap());
    ui.btnMapClose?.addEventListener('click', () => { this.invOpen = false; this.resume(); });
    ui.root.classList.toggle('is-touch', this.touch);
  }

  toggleFly() {
    this.player.fly = !this.player.fly; this.player.vel.y = 0;
    this.toast(this.player.fly ? `✈ Vliegen aan · ${FLY_NAMES[this.flyLevel || 0]}` : 'Vliegen uit');
    this.updateHud(true);
  }
  cycleFlySpeed() {
    this.flyLevel = ((this.flyLevel || 0) + 1) % FLY_SPEEDS.length;
    if (!this.player.fly) { this.player.fly = true; this.player.vel.y = 0; }
    this.toast(`✈ ${FLY_NAMES[this.flyLevel]}`);
    this.updateHud(true);
  }
  togglePhoto(on) {
    this.photo = on ?? !this.photo;
    this.ui.root.classList.toggle('photo', this.photo);
    this.toast(this.photo ? '📷 Fotomodus · Enter = foto opslaan · P = terug' : 'Fotomodus uit');
  }
  savePhoto() {
    const t = document.getElementById('toast');
    if (t) t.hidden = true;
    this.render();
    const url = this.ui.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const d = new Date();
    a.href = url; a.download = `blokstad-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    this.toast('📷 Foto opgeslagen');
  }
  toast(t) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = t; el.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { el.hidden = true; }, 1600);
  }

  playerState() {
    const p = this.player;
    return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly };
  }
}

const FLY_SPEEDS = [12, 40, 120];
const FLY_NAMES = ['normaal vliegen (12 m/s)', 'snel vliegen (40 m/s)', 'turbo (120 m/s)'];

function loadSettings() {
  const phone = matchMedia('(pointer: coarse)').matches;
  const def = { view: phone ? 96 : 140, sens: 1, hour: 13, cycle: false, lod: phone ? 1400 : 2000, quality: phone ? 'normal' : 'sharp' };
  try { return { ...def, ...JSON.parse(localStorage.getItem('blokstad-settings') || '{}') }; }
  catch { return def; }
}
function saveSettings(s) { try { localStorage.setItem('blokstad-settings', JSON.stringify(s)); } catch { /* geen opslag */ } }
