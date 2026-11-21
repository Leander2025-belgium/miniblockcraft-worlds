// De 3D-game: rendering, besturing, natuurkunde, bouwen en breken.
import * as THREE from 'three';
import { meshChunk, CS, SMOOTH, OVER } from './mesher.js';
import { actionFor, updateSeat } from './interact.js';
import { B, BLOCKS, IS_SOLID, PLACEABLE } from './blocks.js';
import { TONE_GLSL, installTone } from './materials.js';
import { drawAtlas, ATLAS_COLS, ATLAS_ROWS, iconStyle, CELL, PAD, RES as TS, materialTexture } from './textures.js';
import { districtAt, GROUND } from './city.js';
import { skyAt, makeClouds, SkyDome } from './environment.js';
import { TILE_INDEX } from './textures.js';
import { FarView } from './lod.js';
import { Traffic } from './traffic.js';
import { Missions } from './missions.js';
import { Avatar, DEFAULT_LOOK } from './avatar.js';
import { Drive } from './drive.js';
import { diag } from './diag.js';
import { Builder } from './build.js';
import { Underground } from './underground.js';
import { Ambient } from './ambient.js';
import { BusPax } from './buspax.js';
import { Travelers } from './travelers.js';
// reisplanner in een Web Worker voor reizigers (js/planworker.js); zonder worker: geen async (de reiziger plant dan zelf)
let PLAN_WORKER = null, PLAN_SEQ = 0; const PLAN_WAIT = new Map();
function planAsyncOf() {
  try {
    if (!PLAN_WORKER) { PLAN_WORKER = new Worker(new URL('./planworker.js', import.meta.url), { type: 'module' }); PLAN_WORKER.onmessage = (e) => { const f = PLAN_WAIT.get(e.data.id); if (f) { PLAN_WAIT.delete(e.data.id); f(e.data.r); } }; PLAN_WORKER.onerror = () => { for (const f of PLAN_WAIT.values()) f(null); PLAN_WAIT.clear(); }; }
    return (from, to, hour) => new Promise((res) => { const id = ++PLAN_SEQ; PLAN_WAIT.set(id, res); PLAN_WORKER.postMessage({ id, from, to, hour }); });
  } catch { return null; }
}
import { rleEncode, rleDecode } from './storage.js';
import { Ships } from './vessel.js';
import { Airports, FlightControl, Plane } from './aircraft.js';
import { zoneName } from './metropolis.js';
// berglandschap, kabelbanen en het spoornet: pas geladen als je de Alpenwereld opent
let MV = null;

const SKY = new THREE.Color(0.62, 0.80, 0.96);
const REAL_CLOUD_Y = 320;
const SKY_RAW = [0.62, 0.80, 0.96];
const SEC = 8; // hoogte van een verticale sectie (torens met interieur): 2 verdiepingen

const VERT = `
attribute vec2 tile;
attribute float light;
attribute float face;
varying vec2 vUv;
varying vec2 vTile;
varying float vLight;
varying float vDist;
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  vUv = uv; vTile = tile; vLight = light;
  // richting van het vlak komt uit de mesh (niet uit afgeleiden van grote coördinaten: die zijn op telefoons onnauwkeurig)
  vNrm = face < 0.5 ? vec3(1.0, 0.0, 0.0) : face < 1.5 ? vec3(-1.0, 0.0, 0.0) : face < 2.5 ? vec3(0.0, 1.0, 0.0)
       : face < 3.5 ? vec3(0.0, -1.0, 0.0) : face < 4.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vView = cameraPosition - wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map;
uniform sampler2D matTex;   // per tegel: glans, reliëf, weerspiegeling
uniform sampler2D shadowMap;
uniform mat4 shadowMatrix;
uniform float shadowOn;
uniform float isUnder;
uniform float wet;
uniform float flashOn;
uniform vec3 flashPos;
uniform vec3 flashDir;
uniform vec2 atlas;      // atlasgrootte in pixels
uniform vec3 cellInfo;   // celgrootte, rand, tegelgrootte (pixels)
uniform vec3 fogColor;
uniform vec3 sunColor;
uniform vec3 skyTop;
uniform float fogNear;
uniform float fogFar;
uniform float streetY;   // straathoogte (strooilicht 's nachts)
uniform float alphaTest;
uniform float day;
uniform vec3 sunDir;
uniform float time;
uniform float isTrans;
uniform float atlasCols;
uniform vec2 lampTile;
uniform vec2 waterTile;
uniform vec2 fillTile;
uniform vec2 tvTile;
varying vec2 vUv;
varying vec2 vTile;
varying float vLight;
varying float vDist;
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vView;
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
${TONE_GLSL}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float shadowAt(vec3 wp, vec3 n) {
  if (shadowOn < 0.5) return 1.0;
  vec4 sc = shadowMatrix * vec4(wp + n * 0.06, 1.0);
  vec3 p = sc.xyz / sc.w;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0009;
  vec2 px = vec2(1.0) / vec2(textureSize(shadowMap, 0));
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += (p.z - bias > texture(shadowMap, p.xy + vec2(float(i), float(j)) * px).r) ? 0.0 : 1.0;
  s /= 9.0;
  // aan de rand van het schaduwgebied zacht uitfaden
  vec2 e = min(p.xy, 1.0 - p.xy);
  return mix(1.0, s, smoothstep(0.0, 0.08, min(e.x, e.y)));
}
void main() {
  vec2 f = fract(vUv);
  float C = cellInfo.x, P = cellInfo.y, T = cellInfo.z;
  vec2 pix = vec2(vTile.x * C + P + f.x * T, vTile.y * C + P + (1.0 - f.y) * T);
  vec2 uv = vec2(pix.x / atlas.x, 1.0 - pix.y / atlas.y);
  // juiste verkleining (mipmap) op basis van de echte schaal (de rand is 8 pixels: tot 3 niveaus)
  vec2 gx = dFdx(vUv) * T, gy = dFdy(vUv) * T;
  float lod = clamp(0.5 * log2(max(dot(gx, gx), dot(gy, gy))), 0.0, 3.0);
  vec4 c = textureLod(map, uv, lod);
  if (c.a < alphaTest) discard;
  vec4 m = texelFetch(matTex, ivec2(int(vTile.y * atlasCols + vTile.x + 0.5), 0), 0);
  float shine = m.r, bump = m.g, refl = m.b;
  // materiaalklasse en ruwheid (js/materials.js): alfa = klasse × 16 + ruwheid
  float mcode = floor(m.a * 255.0 + 0.5), mcls = floor(mcode / 16.0), rough = mod(mcode, 16.0) / 15.0;
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 viewDir = normalize(vView);
  vec3 L = normalize(sunDir);
  // reliëf uit de textuur (voegen, stenen, schors): dichtbij duidelijk, veraf niet
  float relief = 0.0;
  if (bump > 0.01 && lod < 1.5) {
    vec2 d = vec2(1.0 / atlas.x, 1.0 / atlas.y);
    float h0 = lum(c.rgb), hx = lum(textureLod(map, uv + vec2(d.x, 0.0), lod).rgb), hy = lum(textureLod(map, uv - vec2(0.0, d.y), lod).rgb);
    relief = ((h0 - hx) + (h0 - hy)) * bump * 2.2 * (1.0 - lod / 1.5);
  }
  float daylight = mix(0.13, 1.0, day);
  float sunF = max(dot(n, L), 0.0);
  float sh = sunF > 0.0 ? shadowAt(vWorld, n) : 1.0;
  float upF = n.y * 0.5 + 0.5;
  // hemel- en grondlicht
  vec3 ambientC = mix(vec3(0.42, 0.40, 0.36), mix(fogColor, skyTop, 0.5) * 0.95 + 0.12, upF);
  // binnenruimtes (Megatower): de mesher telt 2 op bij het licht; daar warm kunstlicht, weinig zon
  // het lichtniveau van de lampen zit erbij (2 + 2 × niveau); lampen uit = donkere kamer
  float indoor = step(1.5, vLight);
  float lampLv = indoor > 0.5 ? floor((vLight - 2.0) * 0.5 + 0.001) : 0.0;
  float vl = indoor > 0.5 ? vLight - 2.0 - 2.0 * lampLv : vLight;
  float ao = clamp(vl, 0.22, 1.0);
  vec3 light = ambientC * (0.5 + 0.4 * daylight) * daylight * ao + sunColor * (0.78 * sunF * sh * day) * (0.55 + 0.45 * ao);
  // 's nachts buiten: koel maanlicht van boven en warm strooilicht van de stad laag bij de grond (straatlampen,
  // etalages), zodat straten niet pikzwart zijn; verdwijnt overdag
  float nightF = clamp(1.0 - day * 1.6, 0.0, 1.0);
  light += (vec3(0.05, 0.065, 0.1) * upF + vec3(0.09, 0.065, 0.035) * (1.0 - smoothstep(4.0, 40.0, vWorld.y - streetY)) * (0.6 + 0.4 * upF)) * nightF * ao;
  if (indoor > 0.5) { float lf = clamp(lampLv / 2.4, 0.0, 1.0); light = vec3(1.0, 0.95, 0.86) * (0.06 + 0.86 * lf) * (0.55 + 0.45 * ao) + ambientC * 0.3 * daylight * ao; }
  if (isUnder > 0.5) light = vec3(1.0, 0.82, 0.6) * vl * 1.25 + vec3(0.035, 0.038, 0.048); // ondergronds: lampen
  // zaklamp
  if (flashOn > 0.5) {
    vec3 tf = vWorld - flashPos; float fd = length(tf); vec3 fdir = tf / max(fd, 0.001);
    float spot = smoothstep(0.78, 0.93, dot(fdir, flashDir)) * clamp(1.0 - fd / 42.0, 0.0, 1.0) * (0.35 + 0.65 * max(dot(n, -fdir), 0.0));
    light += vec3(1.0, 0.95, 0.84) * spot * 1.35;
  }
  light *= 1.0 + relief;
  vec3 col = c.rgb * light * 1.12;
  float a = c.a;
  bool isLamp = distance(vTile, lampTile) < 0.1;
  bool isWater = distance(vTile, waterTile) < 0.1;
  float fr = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 4.0);
  vec3 skyRefl = mix(fogColor, skyTop, clamp(reflect(-viewDir, n).y, 0.0, 1.0)) * daylight;
  if (isLamp) col = c.rgb * mix(1.0, 1.4, 1.0 - day);
  if (distance(vTile, tvTile) < 0.1) col = c.rgb * 1.15;
  if (distance(vTile, fillTile) < 0.1) {
    // achter het glas van een toren: verlichte kamers per kamer (6 × 4 × 6 m), niet per blok; warm, neutraal of koel licht
    vec3 room = floor((vWorld - n * 0.5) / vec3(6.0, 4.0, 6.0));
    float on = step(0.42, h3(room)), tone = h3(room + 17.0);
    vec3 lc = tone < 0.55 ? vec3(1.0, 0.8, 0.55) : tone < 0.85 ? vec3(0.96, 0.93, 0.84) : vec3(0.72, 0.84, 1.0);
    col = mix(mix(c.rgb * 0.1, lc * (0.6 + 0.35 * h3(room + 3.0)), on), c.rgb * 0.5, day);
  }
  if (isWater) {
    float w1 = sin(vWorld.x * 0.55 + vWorld.z * 0.22 + time * 1.1);
    float w2 = sin(vWorld.z * 0.81 - vWorld.x * 0.17 - time * 1.3);
    vec3 wn = normalize(n + vec3(w1 * 0.06, 0.0, w2 * 0.06));
    float frw = pow(1.0 - clamp(abs(dot(wn, viewDir)), 0.0, 1.0), 3.0);
    vec3 r = reflect(-viewDir, wn);
    vec3 sky = mix(fogColor, skyTop, clamp(r.y, 0.0, 1.0)) * daylight;
    // dieper water: blauwgroen, met fijne golfjes en glinstering
    float w3 = sin(vWorld.x * 1.9 + time * 2.3) * sin(vWorld.z * 1.7 - time * 1.9);
    col = mix(col, vec3(0.04, 0.22, 0.3) * (0.35 + 0.65 * daylight), 0.35);
    col = mix(col, sky, 0.22 + 0.62 * frw + w3 * 0.04);
    col += sunColor * step(0.985, fract(sin(dot(floor(vWorld.xz * 3.0), vec2(12.9898, 78.233)) + floor(time * 4.0)) * 43758.5453)) * pow(max(dot(r, L), 0.0), 6.0) * 0.6 * day;
    col += sunColor * pow(max(dot(r, L), 0.0), 120.0) * 1.6 * day * sh;
    a = mix(a, 0.95, frw);
  } else if (isTrans > 0.5 && c.a < 0.97) {
    // glas: weerspiegelt lucht en zon, 's avonds zijn sommige ramen verlicht
    float reflection = 0.14 + 0.66 * fr;
    col = mix(col, skyRefl + vec3(0.02, 0.04, 0.06), reflection);
    col += sunColor * pow(max(dot(reflect(-viewDir, n), L), 0.0), 90.0) * 1.3 * day;
    // 's avonds verlichte kamers achter het glas: per kamer (6 × 4 × 6 m), met verschillende lichtkleuren
    vec3 room = floor((vWorld - n * 0.5) / vec3(6.0, 4.0, 6.0));
    float lit = step(0.62, h3(room)) * (1.0 - day), tone = h3(room + 17.0);
    vec3 lc = tone < 0.55 ? vec3(1.0, 0.82, 0.55) : tone < 0.85 ? vec3(0.97, 0.94, 0.85) : vec3(0.74, 0.85, 1.0);
    col = mix(col, lc * (0.75 + 0.25 * h3(room + 3.0)), lit * 0.88);
    a = mix(max(a, 0.34 + 0.48 * fr), 0.95, lit);
  } else {
    // glans (metaal, verf, tegels, natte straat) en weerspiegeling van de lucht
    bool metal = abs(mcls - 2.0) < 0.5, emissive = abs(mcls - 10.0) < 0.5;
    // metaal weerspiegelt in zijn eigen kleur; andere materialen neutraal
    vec3 tint = metal ? c.rgb * 1.5 + 0.08 : vec3(1.0);
    if (refl > 0.01) col = mix(col, skyRefl * tint, refl * (metal ? 0.22 + 0.55 * fr : 0.08 + 0.6 * fr));
    // glans: ruwheid bepaalt hoe scherp de zon weerkaatst (gepolijst: klein en fel, ruw: breed en zwak)
    if (shine > 0.01) { float pw = mix(90.0, 6.0, rough); col += sunColor * tint * pow(max(dot(reflect(-viewDir, n), L), 0.0), pw) * shine * mix(0.75, 0.3, rough) * day * sh; }
    if (emissive) col = max(col, c.rgb * 0.92); // eigen licht (lampen, schermen, automaten)
    // natte oppervlakken (regen): per materiaal
    if (wet > 0.01 && isUnder < 0.5 && indoor < 0.5) {
      bool porous = abs(mcls - 4.0) < 0.5 || abs(mcls - 5.0) < 0.5 || abs(mcls - 6.0) < 0.5 || mcls < 0.5;
      if (n.y > 0.5) {
        if (porous || abs(mcls - 3.0) < 0.5) {
          col *= 1.0 - (porous ? 0.3 : 0.12) * wet;
          // plassen alleen op asfalt, stoep, bestrating en beton (klasse 5)
          float puddle = abs(mcls - 5.0) < 0.5 ? smoothstep(0.55, 0.75, h3(floor(vWorld * vec3(0.5, 1.0, 0.5)))) : 0.0;
          col = mix(col, skyRefl * 0.9, wet * (0.1 + 0.45 * fr) * (0.35 + 0.65 * puddle));
          col += sunColor * pow(max(dot(reflect(-viewDir, n), L), 0.0), 40.0) * puddle * wet * 0.5 * day * sh;
        } else if (abs(mcls - 7.0) < 0.5) col = mix(col, skyRefl, wet * 0.06 * (0.3 + fr)); // natte bladeren: lichte glans
      } else if (porous && n.y > -0.5) {
        // natte muren: donkerder in verticale strepen (regen loopt naar beneden)
        float streak = h3(vec3(floor(vWorld.x * 2.0 + vWorld.z * 2.0), 0.0, floor(vWorld.y * 0.25)));
        col *= 1.0 - 0.2 * wet * (0.55 + 0.45 * streak);
      }
    }
  }
  // atmosfeer: verre dingen nemen de luchtkleur aan, warmer in de richting van de zon
  float fog = smoothstep(fogNear, fogFar, vDist);
  float heightHaze = 1.0 - 0.12 * clamp((vWorld.y - cameraPosition.y) / 180.0, 0.0, 1.0);
  fog = clamp(fog * heightHaze, 0.0, 1.0);
  vec3 fc = mix(fogColor, sunColor * 0.9 + fogColor * 0.3, pow(max(dot(-viewDir, L), 0.0), 6.0) * 0.35 * day);
  // gedeelde tonemapping (js/materials.js): fel licht zacht afremmen in plaats van hard wit; dezelfde curve als de voertuigen
  gl_FragColor = vec4(tnToneSrgb(mix(max(col, vec3(0.0)), fc, fog)), a);
}`;

class World {
  constructor(meta, vox) {
    this.meta = meta;
    this.size = meta.size; this.H = meta.H; this.vox = vox;
    this.y0 = meta.y0 || 0; // tegels in de bergen beginnen hoger: alles eronder is vaste rots
    this.edge = meta.edge || null; // grondhoogte net naast de tegel
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
    const yl = y - this.y0;
    if (yl < 0 && this.inside(x, z)) {
      if (this.under) return this.under.get(x + this.ox, y, z + this.oz); // diepe ondergrond
      if (this.y0) return B.STONE;
    }
    if (yl < 0 || yl >= this.H || !this.inside(x, z)) return 0;
    return this.vox[(z * this.size + x) * this.H + yl];
  }
  set(x, y, z, b) {
    if (y - this.y0 < 0 && this.under && this.inside(x, z)) return this.under.set(x + this.ox, y, z + this.oz, b);
    if (y - this.y0 === 0 && this.under && this.inside(x, z)) this.under.markDirty(x + this.ox, y - 1, z + this.oz);
    y -= this.y0;
    if (y < 0 || y >= this.H || !this.inside(x, z)) return false;
    this.vox[(z * this.size + x) * this.H + y] = b;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    if (b && y > this.tops[cz * this.nc + cx]) this.tops[cz * this.nc + cx] = y;
    return true;
  }
  columnTop(x, z) {
    for (let y = this.y0 + this.H - 1; y >= this.y0; y--) if (this.get(x, y, z)) return y;
    return Math.max(0, this.y0 - 1);
  }
  solidAt(x, y, z) {
    if (y - this.y0 < 0 && this.under && this.inside(x, z)) return IS_SOLID[this.under.get(x + this.ox, y, z + this.oz)] === 1;
    y -= this.y0;
    if (y < 0 || !this.inside(x, z)) return true; // onzichtbare muur aan de rand
    if (y >= this.H) return false;
    return IS_SOLID[this.vox[(z * this.size + x) * this.H + y]] === 1;
  }
  sourceAt() { return this.src; }
}

// Een grote wereld die uit tegels bestaat en tegels laadt rond de speler.
class TileWorld {
  constructor(spec) {
    this.T = spec.tile; this.nx = spec.tilesX || spec.tiles; this.nz = spec.tilesZ || spec.tiles;
    this.n = Math.max(this.nx, this.nz);
    this.sizeX = this.T * this.nx; this.sizeZ = this.T * this.nz; this.size = Math.max(this.sizeX, this.sizeZ);
    this.G = spec.ground; this.H = spec.maxH || 1024; this.groundAt = spec.groundAt;
    this.tiles = new Map();
  }
  key(tx, tz) { return tz * 4096 + tx; }
  tileAt(x, z) { return this.tiles.get(this.key(Math.floor(x / this.T), Math.floor(z / this.T))); }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.sizeX && z < this.sizeZ; }
  get(x, y, z) {
    if (!this.inside(x, z)) return 0;
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
    if (!this.inside(x, z)) return true;
    const t = this.tileAt(x, z);
    if (!t) return y <= (this.groundAt ? this.groundAt(x, z) : this.G); // nog niet geladen: vaste grond
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
    installTone(THREE, this.renderer); // één tonemapping voor wereld en voertuigen
    this.settings = loadSettings();
    this.applyQuality();
    this.renderer.setClearColor(SKY);
    // grafische kaart even weg (bv. iPhone op de achtergrond): de pagina herladen en verder spelen
    // grafische context kwijt (bv. de gsm had geheugen nodig): bewaren en wachten tot de browser hem teruggeeft;
    // three.js laadt alles dan opnieuw in. Alleen als hij na 8 s niet terug is, de pagina herladen.
    // nooit vanzelf herladen: wachten tot de browser de context teruggeeft; komt hij niet terug, dan een knop
    ui.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); this.ui.onSave?.(true); this.toast?.('Grafische kaart herstarten…');
      diag('grafische context verloren', { tegels: this.world && this.world.tiles ? this.world.tiles.size : 0 });
      clearTimeout(this.ctxTimer); this.ctxTimer = setTimeout(() => { const el = document.getElementById('ctx-lost'); if (el) el.hidden = false; diag('grafische context na 10 s niet terug'); }, 10000);
    });
    ui.canvas.addEventListener('webglcontextrestored', () => { clearTimeout(this.ctxTimer); this.ctxTimer = null; const el = document.getElementById('ctx-lost'); if (el) el.hidden = true; diag('grafische context hersteld'); this.rebuildAfterContextLoss(); this.toast?.('Grafische kaart hersteld'); });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1000);
    this.camera.rotation.order = 'YXZ';
    const atlasCanvas = drawAtlas();
    this.atlasUrl = atlasCanvas.toDataURL();
    const tex = new THREE.CanvasTexture(atlasCanvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = 4;
    const matTex = materialTexture(THREE);
    // zachte schaduwen van de zon rond de speler
    this.shadow = { size: 0, rt: null, cam: new THREE.OrthographicCamera(-110, 110, 110, -110, 1, 1600), matrix: new THREE.Matrix4(), mat: new THREE.MeshBasicMaterial({ colorWrite: false }) };
    this.shadow.cam.layers.set(1);
    this.dummyDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.dummyDepth.needsUpdate = true;
    this.sky = new SkyDome();
    const uniforms = () => ({
      map: { value: tex }, atlas: { value: new THREE.Vector2(ATLAS_COLS * CELL, ATLAS_ROWS * CELL) }, cellInfo: { value: new THREE.Vector3(CELL, PAD, TS) },
      fogColor: { value: new THREE.Vector3(...SKY_RAW) }, fogNear: { value: 60 }, fogFar: { value: 150 }, alphaTest: { value: 0.5 },
      day: { value: 1 }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() }, time: { value: 0 }, isTrans: { value: 0 },
      matTex: { value: matTex }, atlasCols: { value: ATLAS_COLS }, sunColor: { value: new THREE.Vector3(1, 0.97, 0.9) }, skyTop: { value: new THREE.Vector3(0.3, 0.5, 0.85) },
      shadowMap: { value: this.dummyDepth }, shadowMatrix: { value: this.shadow.matrix }, shadowOn: { value: 0 },
      wet: { value: 0 }, isUnder: { value: 0 }, streetY: { value: 0 }, flashOn: { value: 0 }, flashPos: { value: new THREE.Vector3() }, flashDir: { value: new THREE.Vector3(0, 0, -1) },
      lampTile: { value: new THREE.Vector2(TILE_INDEX.lamp % ATLAS_COLS, Math.floor(TILE_INDEX.lamp / ATLAS_COLS)) },
      waterTile: { value: new THREE.Vector2(TILE_INDEX.water % ATLAS_COLS, Math.floor(TILE_INDEX.water / ATLAS_COLS)) },
      fillTile: { value: new THREE.Vector2(TILE_INDEX.room_fill % ATLAS_COLS, Math.floor(TILE_INDEX.room_fill / ATLAS_COLS)) },
      tvTile: { value: new THREE.Vector2(TILE_INDEX.tv_on % ATLAS_COLS, Math.floor(TILE_INDEX.tv_on / ATLAS_COLS)) },
    });
    this.matOpaque = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms() });
    this.matTrans = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.matTrans.uniforms.alphaTest.value = 0.02;
    // ondergrond: geen zon of hemel, alleen lampen en de zaklamp
    this.matUnder = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms() });
    this.matUnder.uniforms.isUnder.value = 1;
    this.matUnderTrans = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.matUnderTrans.uniforms.isUnder.value = 1; this.matUnderTrans.uniforms.isTrans.value = 1; this.matUnderTrans.uniforms.alphaTest.value = 0.02;
    this.mats = [this.matOpaque, this.matTrans, this.matUnder, this.matUnderTrans];
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
    this.avatar = new Avatar(this.scene, this.settings.look);
    this.builder = new Builder(this);
    this.eye = new THREE.Vector3();
    this.missions = new Missions((m) => { this.toast(`🏆 Opdracht voltooid: ${m.name}${this.wallet ? ' · +40 VC' : ''}`); if (this.wallet) this.wallet.earn(40, `opdracht ${m.name}`); });
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
    if (this.traffic) { this.traffic.dispose(); this.traffic = null; } if (this.busPax) { this.busPax.dispose(); this.busPax = null; } if (this.travelers) { this.travelers.dispose(); this.travelers = null; }
    this.dropMountain(); this.leaveVehicle();
    this.mega?.dispose(); this.mega = null; this.seat = null;
    this.under?.dispose(); this.under = null;
    this.ships?.dispose(); this.ships = null; this.aboard = null;
    this.airports?.dispose(); this.airports = null;
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
    this.traffic = new Traffic(this.scene, spec.ground); { const w = this.world; this.traffic.solidAt = (x, y, z) => w.solidAt(x, y, z); } if (spec.megatower) { this.traffic.busLinesOnly = true; const tr = this.traffic; import('./megacity.js').then((m) => { tr.busDepot = m.BUS_DEPOT; }).catch((e) => console.error(e)); } // Megatower City: bussen rijden op vaste lijnen (js/megacity.js BUS_NS/BUS_EW) // perronkant voor de deuren
    this.ships?.dispose(); this.ships = new Ships(this); this.aboard = null;
    this.airports?.dispose(); this.airports = new Airports(this);
    this.dropMountain(); this.leaveVehicle();
    // Megatower: liften, deurbladen, kamernamen
    this.mega?.dispose(); this.mega = null; this.seat = null;
    if (spec.megatower) { const tok = this.megaToken = {}; import('./megaview.js').then((m) => { if (this.megaToken === tok) this.mega = new m.MegaView(this); }).catch((e) => console.error(e)); }
    this.under?.dispose();
    const W = this.world;
    this.under = new Underground(this.scene, {
      id: spec.id || meta.id,
      loaded: (x, z) => !!W.tileAt(x, z),
      top: (x, z) => { const t = W.tileAt(x, z); return t ? t.w.y0 : (spec.groundAt ? spec.groundAt(x, z) - 24 : 0); },
      ref: spec.groundAt ? (x, z) => spec.groundAt(x, z) : () => spec.ground,
    }, { under: this.matUnder, underTrans: this.matUnderTrans });
    if (spec.longView) {
      // Reuzenberg · Alpen: ver landschap tot aan de horizon, kabelbanen en liften, het spoornet
      const token = this.mvToken = {};
      if (this.lod.groundMesh) this.lod.groundMesh.visible = false;
      if (spec.alps || spec.railNet) this.traffic.noTrains = true;
      // verre landschap + treinnet van deze wereld (Alpen: mountainview + rail-alpen, Greenisland: greenview + rail-green)
      const view = spec.viewModule || './mountainview.js', net = spec.railNet || (spec.alps ? './rail-alpen.js' : null);
      Promise.all([import(view), net ? import('./rail.js') : null, net ? import(net) : null]).then(([mv, rail, netMod]) => {
        if (this.mvToken !== token) return; // intussen een andere wereld geopend
        MV = mv;
        this.far = new mv.MountainView();
        this.scene.add(this.far.gondolas.group, this.far.gondolas.cabRoot, this.far.lifts.group);
        if (rail) { rail.useNet(netMod.NET); this.alpRail = new rail.AlpRail(this); }
      }).catch((e) => console.error(e));
    }
    this.mini = { canvas: this.lod.canvas, scale: this.lod.cell * (spec.miniStep || 1), sizeX: this.world.sizeX, sizeZ: this.world.sizeZ };
    const T = spec.tile;
    spec.requestLods?.(Math.floor(this.player.pos.x / T), Math.floor(this.player.pos.z / T), Math.ceil(this.settings.lod / T) + 1);
    this.updateTiles(true);
    this.updateHud(true);
  }

  leaveVehicle() { if (this.drive) { this.drive.show(false); this.drive = null; } }
  dropMountain() {
    this.mvToken = null;
    if (this.far) { this.far.dispose(); this.far = null; }
    if (this.alpRail) { this.alpRail.dispose(); this.alpRail = null; }
    this.extVel = null;
    this.ride = null;
    document.getElementById('t-ride')?.classList.remove('show');
  }

  // ---------- kabelbaan ----------
  toggleRide() {
    if (!this.far) return;
    const p = this.player;
    if (this.ride) { // onderweg uitstappen: je blijft zweven
      this.ride = null; this.far.gondolas.cab.visible = false; this.far.lifts.cab.visible = false;
      p.fly = true; p.vel.set(0, 0, 0);
      this.toast('Uitgestapt. Vliegen staat aan (F om te landen).');
      this.updateHud(true);
      return;
    }
    const st = MV.stationNear(p.pos);
    if (st < 0) {
      const ls = this.far.lifts.stationNear(p.pos);
      if (!ls) { this.toast('🚡 Ga naar een dal- of bergstation van een kabelbaan of lift om in te stappen.'); return; }
      const L = ls.L, len = L.pts[L.pts.length - 1].u - L.pts[0].u;
      this.ride = { lift: L, s: ls.top ? len : 0, end: ls.top ? 2 * len - 0.01 : len, top: ls.top, g: {} };
      this.far.lifts.cab.visible = L.kind !== 'chair';
      p.vel.set(0, 0, 0);
      this.toast(`🚡 ${L.name}: op weg naar ${ls.top ? 'het dal' : L.top}! (Shift/⚡ = sneller, G = uitstappen)`);
      return;
    }
    this.ride = { s: st === 0 ? 0 : (MV.CABLE_D1 - MV.CABLE_D0), dir: st === 0 ? 1 : -1, to: st === 0 ? 1 : 0, g: {} };
    if (st === 1) this.ride.s = (MV.CABLE_D1 - MV.CABLE_D0); // omlaag langs het westspoor
    this.far.gondolas.cab.visible = true;
    p.vel.set(0, 0, 0);
    this.toast(st === 0 ? '🚡 Op weg naar de top! (Shift/⚡ = sneller, G = uitstappen)' : '🚡 Op weg naar het dal! (Shift/⚡ = sneller, G = uitstappen)');
  }
  updateRide(dt) {
    if (this.ride.lift) { this.updateLiftRide(dt); return; }
    const r = this.ride, p = this.player, L = MV.CABLE_D1 - MV.CABLE_D0;
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ControlLeft') || this.touchSprint || this.boost;
    r.s += MV.RIDE_SPEED * (fast ? 4 : 1) * dt;
    const done = r.dir > 0 ? r.s >= L : r.s >= 2 * L;
    if (r.dir < 0 && r.s < L) r.s = L;
    const g = MV.gondolaAt(Math.min(r.s, r.dir > 0 ? L : 2 * L - 0.01), r.g);
    if (done) {
      const s = MV.STATIONS[r.to];
      this.ride = null; this.far.gondolas.cab.visible = false;
      p.pos.set(s.x + 0.5, s.y + 1.05, s.z + (r.to === 1 ? -6 : 6)); p.vel.set(0, 0, 0); p.fly = false;
      this.toast(r.to === 1 ? `⛰ Topstation (${s.y - (this.meta.ground ?? GROUND)} m). Het pad naar de top begint hier!` : '🌲 Terug in het dal.');
      if (this.tiled) { this.tiled.aheadKey = null; this.updateTiles(true); }
      return;
    }
    p.pos.set(g.x, g.y - 1.1, g.z);
    p.vel.set(0, 0, 0); p.fly = false; p.onGround = true;
    this.far.gondolas.cab.position.set(g.x, g.y, g.z);
    const left = Math.max(0, r.dir > 0 ? L - r.s : 2 * L - r.s) / (MV.RIDE_SPEED * (fast ? 4 : 1));
    this.rideInfo = `🚡 Kabelbaan · nog ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · G = uitstappen`;
  }

  // nieuwe kabelbanen, gondelbanen en stoeltjesliften van de Alpenwereld
  updateLiftRide(dt) {
    const r = this.ride, p = this.player, L = r.lift, lifts = this.far.lifts;
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ControlLeft') || this.touchSprint || this.boost;
    const sp = MV.LIFT_SPEED[L.kind] * (fast ? 4 : 1);
    r.s = Math.min(r.end, r.s + sp * dt);
    const g = lifts.at(L, r.s, r.g);
    if (r.s >= r.end) {
      this.ride = null; lifts.cab.visible = false;
      const toTop = !r.top, u = toTop ? L.len - L.stL + 6 : L.stL - 6, y = toTop ? L.yb : L.ya;
      p.pos.set(L.ax + L.ux * u + 0.5, y + 1.05, L.az + L.uz * u + 0.5); p.vel.set(0, 0, 0); p.fly = false;
      this.toast(toTop ? `⛰ ${L.top} (${y - (this.meta.ground ?? GROUND)} m)` : `🚡 Terug in het dalstation van de ${L.name}.`);
      if (this.tiled) { this.tiled.aheadKey = null; this.updateTiles(true); }
      return;
    }
    const seat = L.kind === 'chair' ? -2.4 : L.kind === 'cable' ? -2.9 : -1.1;
    p.pos.set(g.x, g.y + seat, g.z); p.vel.set(0, 0, 0); p.fly = false; p.onGround = true;
    this.extVel = new THREE.Vector3(L.ux * sp * (g.up ? 1 : -1), 0, L.uz * sp * (g.up ? 1 : -1));
    if (L.kind !== 'chair') lifts.cab.position.set(g.x, g.y + (L.kind === 'cable' ? -1.6 : 0), g.z);
    const left = (r.end - r.s) / sp;
    this.rideInfo = `🚡 ${L.name} · nog ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · G = uitstappen`;
  }

  // na een verloren grafische context: de geometrie in het geheugen is na het doorsturen vrijgegeven (zuinig op
  // telefoons), dus alles wat zo'n lege kopie heeft verbergen en opnieuw opbouwen (blokken, verre laag, ver landschap)
  rebuildAfterContextLoss() {
    const stale = (o) => { const g = o.geometry; if (!g || !g.attributes) return false; for (const a of Object.values(g.attributes)) if (!a.array) return true; return !!(g.index && !g.index.array); };
    const hide = (root) => root && root.traverse((o) => { if (stale(o)) o.visible = false; });
    hide(this.scene); if (this.far && this.far.scene) hide(this.far.scene);
    // blokken: alle chunks opnieuw maken
    this.clearChunks(); this.queue = [];
    if (this.world && this.world.tiles) for (const src of this.world.tiles.values()) this.addSource(src);
    else if (this.world && this.world.src) this.addSource(this.world.src);
    // verre laag en ver landschap opnieuw opbouwen
    if (this.lod && this.lod.rebuild) this.lod.rebuild();
    if (this.far && this.far.rebuild) this.far.rebuild();
  }
  addSource(src) {
    const nc = src.w.nc, I = src.interior;
    let n = 0;
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) { if (I && this.inInterior(src, cx, cz)) continue; this.queue.push([src, cx, cz]); n++; }
    if (I) {
      // torens met interieur: buiten de schil per sectie van SEC m (alleen de gevel), binnen pas volledig als je er bent
      I.nsec = Math.ceil(src.w.H / SEC); I.full = I.full || new Map(); I.lo = -1; I.hi = -2;
      const y0i = src.w.y0 || 0;
      I.fillL = (x, y, z, b) => I.fill(x, y + y0i, z, b); I.indoorL = (x, y, z) => I.inside(x, y + y0i, z);
      I.chunks = []; for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) if (this.inInterior(src, cx, cz)) I.chunks.push([cx, cz]);
      for (let sct = 0; sct < I.nsec; sct++) { this.queue.push([src, 3, 3, 'shell', sct]); n++; }
    }
    src.pendingChunks = n; src.ready = false;
    this.totalChunks += n;
    if (this.player) this.sortQueue();
  }
  // is alles rond de speler klaar? (tegel geladen, en in een toren de verdiepingen rond je opgebouwd)
  readyHere() {
    const p = this.player.pos, t = this.world && this.world.tileAt ? this.world.tileAt(p.x, p.z) : null;
    if (!t) return false;
    const I = t.interior;
    if (I && I.nsec) { if (I.lo > I.hi) return !!t.ready; for (let s = I.lo; s <= I.hi; s++) { const F = I.full.get(s); if (!F || F.built < F.total) return false; } return true; }
    return !!t.ready;
  }
  inInterior(src, cx, cz) { const I = src.interior; return !!I && cx * CS >= I.x0 && cx * CS + CS <= I.x1 && cz * CS >= I.z0 && cz * CS + CS <= I.z1; }
  // verticale streaming: rond de speler de volledige verdiepingen (secties van SEC m), elders alleen de gevel
  updateInteriors() {
    const W = this.world;
    if (!W || !W.tiles) return;
    const p = this.player.pos, now = performance.now();
    for (const t of W.tiles.values()) {
      const I = t.interior;
      if (!I || !I.nsec || !t.w.vox) continue;
      const lx = p.x - t.ox, lz = p.z - t.oz, ly = p.y - (t.w.y0 || 0);
      const dx = Math.max(I.x0 - lx, 0, lx - I.x1), dz = Math.max(I.z0 - lz, 0, lz - I.z1);
      let lo = -1, hi = -2;
      if (Math.hypot(dx, dz) < 36) { lo = Math.max(0, Math.floor((ly - 5) / SEC)); hi = Math.min(I.nsec - 1, Math.floor((ly + 9) / SEC)); }
      if (I.pre && I.pre.until > now) for (let sct = I.pre.lo; sct <= I.pre.hi; sct++) { const F = I.full.get(sct); if (F) F.used = now; }
      I.lo = lo; I.hi = hi;
      for (let sct = lo; sct <= hi; sct++) {
        let F = I.full.get(sct);
        if (!F) { F = { built: 0, total: I.chunks.length, used: now }; I.full.set(sct, F); for (const [cx, cz] of I.chunks) this.queue.push([t, cx, cz, 'full', sct]); this.sortQueue(); }
        F.used = now;
      }
      // verdiepingen ver van de speler: meshes weg (de blokken blijven, terugkomen = opnieuw opbouwen uit het geheugen)
      for (const [sct, F] of I.full) {
        if (sct >= lo - 2 && sct <= hi + 2) continue;
        if (now - F.used < 4000) continue;
        I.full.delete(sct);
        this.queue = this.queue.filter(q => !(q[0] === t && q[3] === 'full' && q[4] === sct));
        for (const [k, c] of this.chunks) if (c.src === t && c.kind === 'full' && c.sec === sct) { for (const m of [c.o, c.t, c.uo, c.ut]) if (m) { this.scene.remove(m); m.geometry.dispose(); } this.chunks.delete(k); }
      }
    }
  }
  // verdiepingen vooraf opbouwen (bv. de bestemming van een lift), zodat je er niet in een lege ruimte aankomt
  prefetchInterior(wx, wy, wz) {
    const t = this.world && this.world.tileAt ? this.world.tileAt(wx, wz) : null, I = t && t.interior;
    if (!I || !I.nsec) return;
    const ly = wy - (t.w.y0 || 0), lo = Math.max(0, Math.floor((ly - 5) / SEC)), hi = Math.min(I.nsec - 1, Math.floor((ly + 9) / SEC)), now = performance.now();
    I.pre = { lo, hi, until: now + 120000 };
    for (let sct = lo; sct <= hi; sct++) if (!I.full.has(sct)) { I.full.set(sct, { built: 0, total: I.chunks.length, used: now }); for (const [cx, cz] of I.chunks) this.queue.push([t, cx, cz, 'full', sct]); }
    this.sortQueue();
  }
  // in een toren en de verdieping rond je is nog niet opgebouwd? (dan even niet vallen of lopen)
  interiorPending() {
    const p = this.player.pos, t = this.world.tileAt(p.x, p.z), I = t && t.interior;
    if (!I || !I.nsec) return false;
    const lx = p.x - t.ox, lz = p.z - t.oz;
    if (lx < I.x0 || lz < I.z0 || lx >= I.x1 || lz >= I.z1) return false;
    return !this.readyHere();
  }
  sectionVisible(c) {
    const I = c.src.interior;
    if (!I || !c.kind) return true;
    const F = I.full.get(c.sec), inWin = c.sec >= I.lo && c.sec <= I.hi, ready = !!F && F.built >= F.total;
    return c.kind === 'full' ? inWin && ready : !(inWin && ready);
  }

  removeSource(src) {
    src.dead = true;
    for (const [k, c] of this.chunks) {
      if (c.src !== src) continue;
      for (const m of [c.o, c.t, c.uo, c.ut]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
      this.chunks.delete(k);
    }
  }

  // ---------- werkgeheugen: recent bezochte tegels (met hun meshes) blijven klaar staan ----------
  memBudget() {
    if (this._mem) return this._mem;
    const dm = navigator.deviceMemory || (this.touch ? 3 : 8), ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (this.touch && /Mac/.test(navigator.userAgent));
    // in MB: telefoons zuinig (Safari sluit tabbladen die te veel geheugen gebruiken), computers ruim
    this._mem = ios ? 100 : this.touch ? Math.min(260, dm * 45) : Math.min(1400, Math.max(350, dm * 110));
    return this._mem;
  }
  tileBytes(src) {
    if (src.bytes) return src.bytes;
    let b = src.w.vox ? src.w.vox.length : (src.rle ? src.rle.length : 0);
    for (const c of this.chunks.values()) if (c.src === src) for (const m of [c.o, c.t, c.uo, c.ut]) if (m) b += m.geometry.index ? m.geometry.index.count * 4 + m.geometry.attributes.position.count * 36 : 0;
    if (src.ready) src.bytes = b;
    return b;
  }
  parkTile(k, t) {
    const td = this.tiled, W = this.world;
    W.tiles.delete(k);
    t.parked = true; t.parkedAt = performance.now();
    td.parked.set(k, t);
    this.trafficDirty = true;
    // zuinig bewaren: wijzigingen eerst opslaan, dan de blokken samengeperst (de meshes blijven klaarstaan)
    if (t.dirty) { td.saveTile(t.tx, t.tz, t.w.vox, t.w.H, t.w.y0, t.w.edge); t.dirty = false; }
    const pend = this.queue.filter(q => q[0] === t && q[3] !== 'full');
    if (t.interior && t.interior.full) { t.interior.lo = -1; t.interior.hi = -2; }
    if (pend.length) { t.pendingQ = pend.map(q => q.slice(1)); }
    this.queue = this.queue.filter(q => q[0] !== t);
    if (t.w.vox && t.ready) { t.rle = rleEncode(t.w.vox); t.w.vox = null; t.bytes = 0; }
    // te veel in het geheugen? de langst niet bezochte tegels opruimen (wijzigingen eerst bewaren)
    let total = 0;
    for (const p of td.parked.values()) total += this.tileBytes(p);
    const budget = this.memBudget() * 1e6;
    if (total > budget) {
      const list = [...td.parked.entries()].sort((a, b) => a[1].parkedAt - b[1].parkedAt);
      for (const [pk, p] of list) {
        if (total <= budget * 0.85) break;
        total -= this.tileBytes(p);
        if (p.dirty) td.saveTile(p.tx, p.tz, p.w.vox, p.w.H, p.w.y0, p.w.edge);
        this.removeSource(p); td.parked.delete(pk);
      }
    }
  }
  unparkTile(k) {
    const td = this.tiled, t = td.parked.get(k);
    if (!t) return false;
    td.parked.delete(k); t.parked = false;
    if (!t.w.vox && t.rle) { t.w.vox = rleDecode(t.rle, t.w.size * t.w.size * t.w.H); t.rle = null; t.bytes = 0; }
    if (t.pendingQ) { for (const q of t.pendingQ) this.queue.push([t, ...q]); t.pendingQ = null; }
    if (t.interior && t.interior.full) { for (const F of t.interior.full.values()) F.built = Math.min(F.built, F.total); }
    this.world.tiles.set(k, t);
    this.trafficDirty = true; td.stats.memory++;
    return true;
  }
  updateTiles(force) {
    const td = this.tiled;
    if (!td) return;
    td.parked = td.parked || new Map(); td.known = td.known || new Set();
    td.stats = td.stats || { memory: 0, cache: 0, net: 0, gen: 0 };
    const now = performance.now();
    if (!force && now - td.lastCheck < 400) return;
    td.lastCheck = now;
    if (this.queue.length > 1) this.sortQueue(); // bij snel vliegen: eerst wat dichtbij is
    const W = this.world, T = W.T, p = this.player.pos;
    const ptx = Math.floor(p.x / T), ptz = Math.floor(p.z / T);
    const R = Math.max(1, Math.ceil((this.settings.view + 48) / T));
    // vliegrichting en snelheid: waar ben je over een paar seconden?
    const v = this.extVel || this.player.vel, sp = Math.hypot(v.x, v.z);
    const lookT = sp > 60 ? 5 : sp > 25 ? 4 : 2.5;
    const fx = p.x + v.x * lookT, fz = p.z + v.z * lookT;
    const ftx = Math.floor(fx / T), ftz = Math.floor(fz / T);
    td.speed = sp;
    // de worker werkt alvast verder vooruit (ook als het tabblad verborgen is), rond je toekomstige positie
    const ahead = Math.max(R + (document.hidden || !this.active() ? 4 : 2), Math.ceil(this.settings.lod / T)) + (sp > 60 ? 3 : sp > 25 ? 1 : 0);
    const ax = Math.floor((p.x + v.x * lookT * 2) / T), az = Math.floor((p.z + v.z * lookT * 2) / T);
    if (td.prefetchArea && (td.aheadKey !== ax + ',' + az + ',' + ahead)) {
      td.aheadKey = ax + ',' + az + ',' + ahead;
      td.prefetchArea(ax, az, ahead);
    }
    // tegels die ver weg zijn: niet weggooien maar in het werkgeheugen parkeren (snel terug)
    const keepR = R + 1 + (sp > 25 ? 1 : 0);
    for (const [k, t] of W.tiles) {
      const dNow = Math.max(Math.abs(t.tx - ptx), Math.abs(t.tz - ptz)), dFut = Math.max(Math.abs(t.tx - ftx), Math.abs(t.tz - ftz));
      if (dNow > keepR && dFut > keepR) this.parkTile(k, t);
    }
    // ontbrekende tegels: rond je positie én rond waar je naartoe vliegt; bezochte tegels uit het geheugen terughalen
    const want = [];
    const consider = (cx, cz, bonus) => {
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const tx = cx + dx, tz = cz + dz;
        if (tx < 0 || tz < 0 || tx >= W.nx || tz >= W.nz) continue;
        if ((dx * dx + dz * dz) > (R + 0.5) ** 2) continue;
        const k = W.key(tx, tz);
        if (W.tiles.has(k)) continue;
        if (this.unparkTile(k)) continue; // meteen terug, niets opnieuw te doen
        if (td.pending.has(k) || (td.failed.get(k) || 0) > now) continue;
        // in de lokale opslag (verre blok bekend) = snel; voorrang
        const known = td.known.has(k) || (this.lod && this.lod.data.has(k));
        want.push([dx * dx + dz * dz + bonus - (known ? 3 : 0), tx, tz, k, known]);
      }
    };
    consider(ptx, ptz, 0);
    if (ftx !== ptx || ftz !== ptz) consider(ftx, ftz, 2);
    want.sort((a, b) => a[0] - b[0]);
    const seen = new Set();
    for (const [, tx, tz, k, known] of want) {
      if (seen.has(k)) continue; seen.add(k);
      if (td.inFlight >= (known ? 8 : sp > 60 ? 6 : 4)) break; // op 120 m/s meer nieuwe tegels tegelijk
      td.inFlight++; td.pending.add(k);
      td.provider(tx, tz).then(({ vox, H, paths, y0, edge, tunnels, from }) => {
        if (this.world !== W) return;
        td.known.add(k); td.stats[from === 'net' ? 'net' : from === 'gen' ? 'gen' : 'cache']++;
        // vlakke tegels: de bodemlaag (grondgesteente) wordt gewone steen, daaronder begint de diepe ondergrond
        if (!y0) for (let i = 0, n = T * T; i < n; i++) if (vox[i * H] === B.BEDROCK) vox[i * H] = B.STONE;
        const w = new World({ size: T, H, y0, edge }, vox);
        w.ox = tx * T; w.oz = tz * T; w.under = this.under;
        if (tunnels && this.under) this.under.addCarves(tunnels);
        this.under?.tileLoaded(tx * T, tz * T, T); // ondergrond onder deze tegel opnieuw (geen oude rots in tunnels)
        const src = { w, ox: tx * T, oz: tz * T, key: 't' + k, tx, tz, dirty: false, paths };
        const intr = td.spec.interiorFor && td.spec.interiorFor(tx, tz);
        if (intr) src.interior = { ...intr };
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
    this.under?.flush();
    if (!this.tiled) return;
    for (const t of [...this.world.tiles.values(), ...(this.tiled.parked ? this.tiled.parked.values() : [])]) if (t.dirty) { this.tiled.saveTile(t.tx, t.tz, t.w.vox, t.w.H, t.w.y0, t.w.edge); t.dirty = false; }
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
    const px = this.player.pos.x, pz = this.player.pos.z, py = this.player.pos.y;
    // secties van een toren: de verdiepingen waar je bent eerst, de gevelschil als gewone chunk
    const d = (q) => (q[0].ox + q[1] * CS + 8 - px) ** 2 + (q[0].oz + q[2] * CS + 8 - pz) ** 2 + (q[3] === 'full' ? ((q[0].w.y0 || 0) + q[4] * SEC + SEC / 2 - py) ** 2 * 0.25 - 4000 : q[3] === 'shell' ? 2000 : 0);
    this.queue.sort((a, b) => d(b) - d(a));
  }

  clearChunks() {
    if (!this.chunks) return;
    for (const c of this.chunks.values()) {
      for (const m of [c.o, c.t, c.uo, c.ut]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    }
    this.chunks.clear();
  }

  buildChunk(src, cx, cz, kind, sct) {
    if (src.dead) return;
    const I = src.interior;
    if (!kind && I && this.inInterior(src, cx, cz)) {
      // een blok in de toren veranderd: de volledige secties van deze chunk opnieuw, en de gevelschil op die hoogte
      const ey = this.editY, y0 = src.w.y0 || 0;
      for (const sc of I.full.keys()) if (this.chunks.has(src.key + ':' + (cz * src.w.nc + cx) + ':f' + sc)) this.buildChunk(src, cx, cz, 'full', sc);
      if (ey) for (let sc = Math.max(0, Math.floor((ey[0] - y0 - 1) / SEC)); sc <= Math.min(I.nsec - 1, Math.floor((ey[1] - y0 + 1) / SEC)); sc++) this.buildChunk(src, 3, 3, 'shell', sc);
      return;
    }
    const key = src.key + ':' + (cz * src.w.nc + cx) + (kind === 'shell' ? ':s' + sct : kind === 'full' ? ':f' + sct : '');
    const old = this.chunks.get(key);
    if (old) for (const m of [old.o, old.t, old.uo, old.ut]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    let out, lo = null;
    const ug = kind ? null : this.underSplit(src, cx, cz);
    if (kind === 'shell') out = meshChunk(src.w, 0, 0, { x0: I.x0, z0: I.z0, sx: I.x1 - I.x0, sz: I.z1 - I.z0, ylo: sct * SEC, yhi: (sct + 1) * SEC, fill: I.fillL });
    else if (kind === 'full') out = meshChunk(src.w, cx, cz, { ylo: sct * SEC, yhi: (sct + 1) * SEC, indoor: I.indoorL });
    else if (ug && ug.split) { lo = meshChunk(src.w, cx, cz, { yhi: ug.gl + 1 }); out = meshChunk(src.w, cx, cz, { ylo: ug.gl + 1 }); } // ondergronds deel apart
    else out = meshChunk(src.w, cx, cz);
    const entry = { o: this.toMesh(out.opaque, this.matOpaque, src), t: this.toMesh(out.trans, this.matTrans, src), src,
      wx: src.ox + (kind === 'shell' ? (I.x0 + I.x1) / 2 : cx * CS + 8), wz: src.oz + (kind === 'shell' ? (I.z0 + I.z1) / 2 : cz * CS + 8), kind, sec: sct,
      ug: !!ug, y0: (src.w.y0 || 0) + (kind ? sct * SEC : 0) };
    if (lo) { entry.uo = this.toMesh(lo.opaque, this.matOpaque, src); entry.ut = this.toMesh(lo.trans, this.matTrans, src); if (entry.ut) entry.ut.renderOrder = 1; }
    if (entry.t) entry.t.renderOrder = 1;
    if (kind === 'full') { const F = I.full.get(sct); if (!F) { for (const m of [entry.o, entry.t, entry.uo, entry.ut]) if (m) { this.scene.remove(m); m.geometry.dispose(); } return; } if (!old) F.built++; }
    else if (!old && src.pendingChunks > 0 && --src.pendingChunks === 0) src.ready = true; // alle chunks klaar: de verre blokken mogen weg
    this.chunks.set(key, entry);
  }

  // Renderprioriteit (TERRANOVA 14): heeft deze chunk ruimtes onder de straat (metrotunnel, station, kelder)?
  // Dan krijgt hij de vlag ug, en bij hoge bebouwing erboven worden onder- en bovengronds deel apart gemesht
  // (split), zodat de bovenbouw verborgen kan worden zolang de speler ondergronds is. Kijkt in de echte blokken
  // (elke 3 m een kolom), dus ook voor zelfgebouwde kelders.
  underSplit(src, cx, cz) {
    if (!this.tiled || !this.world || !this.flatGround() || (src.interior && this.inInterior(src, cx, cz))) return null;
    const w = src.w, y0 = w.y0 || 0, W = this.world;
    const gAbs = W.groundAt ? W.groundAt(src.ox + cx * CS + 8, src.oz + cz * CS + 8) : W.G;
    if (!(gAbs > y0 + 6)) return null;
    const gl = Math.floor(gAbs) - y0;
    for (let z = cz * CS + 1; z < cz * CS + CS; z += 3) for (let x = cx * CS + 1; x < cx * CS + CS; x += 3)
      for (let y = 1; y < gl - 2; y++) if (!w.get(x, y + y0, z) && w.get(x, y + y0 - 1, z)) return { gl, split: w.chunkTop(cx, cz) > gl + 6 };
    return null;
  }
  flatGround() { return !!this.tiled && (!this.world.groundAt || !!this.tiled.spec.megatower || !!this.tiled.spec.flat); }
  // zit de camera ingesloten onder de grond (tunnel, metrostation, kelder)? Dan is de bovenwereld verder dan
  // ±48 m niet te zien (hooguit door een trapgat vlakbij).
  enclosedBelow() {
    const W = this.world, e = this.camera.position;
    // alleen in steden met een vlakke straat (Megatower City, Nova): in bergtunnels kijk je door de tunnelmond naar
    // buiten, daar mag het landschap niet verdwijnen
    if (!this.tiled || !W || !W.solidAt || !this.flatGround()) return false;
    const g = W.groundAt ? W.groundAt(e.x, e.z) : W.G;
    if (!(e.y < g - 3)) return false;
    for (let y = Math.floor(e.y) + 1; y < g + 2; y++) if (W.solidAt(Math.floor(e.x), y, Math.floor(e.z))) return true;
    return false;
  }

  toMesh(buf, mat, src) {
    if (!buf.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tile, 2));
    g.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 1));
    g.setAttribute('face', new THREE.Float32BufferAttribute(buf.face, 1));
    g.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
    g.computeBoundingSphere();
    // na het doorsturen naar de grafische kaart de kopie in het geheugen vrijgeven (scheelt veel op telefoons)
    for (const a of Object.values(g.attributes)) a.onUpload(freeArray);
    g.index.onUpload(freeArray);
    const m = new THREE.Mesh(g, mat);
    m.position.set(src.ox, src.w.y0 || 0, src.oz);
    if (mat === this.matOpaque) m.layers.enable(1); // werpt schaduw
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    return m;
  }

  remeshAround(gx, gz, gy) {
    const src = this.world.sourceAt(gx, gz);
    if (!src) return;
    this.editY = gy != null ? [gy, gy] : null;
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
    this.editY = null;
  }

  // ---------- lus ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.suspended = false;
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
  // naar het menu zonder iets weg te gooien: terugkomen in dezelfde wereld gaat meteen
  suspend() {
    if (!this.running) return;
    this.running = false;
    this.suspended = true;
    cancelAnimationFrame(this.raf);
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.root.hidden = true;
  }
  stop() {
    this.suspended = false;
    this.running = false;
    if (this.lod) { this.lod.dispose(); this.lod = null; }
    if (this.traffic) { this.traffic.dispose(); this.traffic = null; } if (this.busPax) { this.busPax.dispose(); this.busPax = null; } if (this.travelers) { this.travelers.dispose(); this.travelers = null; }
    this.dropMountain();
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
    const budget = this.tiled && this.interiorPending() ? 45 : this.tiled && this.tiled.speed > 25 && !this.touch ? 16 : 12;
    while (this.queue.length && (performance.now() - t0 < budget || n === 0)) {
      const [src, cx, cz, kind, sct] = this.queue.pop();
      if (src.dead || !src.w.vox) continue;
      if (kind === 'full' && !(src.interior && src.interior.full.has(sct))) continue;
      this.buildChunk(src, cx, cz, kind, sct);
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
    // wat er gebeurt: downloaden, uit de opslag halen, 3D voorbereiden, of klaar
    const net = this.netStatus;
    const phase = this.interiorPending() ? '🏗 Verdieping wordt opgebouwd…' : net ? `🌐 Nieuwe kaartgegevens downloaden: ${net}` : td.inFlight > 0 ? `💾 ${td.inFlight} stukken uit de lokale opslag halen of omzetten` : this.queue.length ? `🧱 3D-geometrie voorbereiden: ${this.queue.length} stukjes` : '✓ Alles klaar om te spelen';
    if (!here) this.ui.loading.textContent = this.tileError ? `Laden lukt niet: ${this.tileError}. Opnieuw proberen…` : phase;
    else this.ui.loading.textContent = phase;
    this.brandLoader(here, phase, td);
    this.loadPhase = phase;
    const ap = this.aheadProgress;
    const bg = ap && ap.done < ap.total ? `Omgeving klaarzetten: ${ap.done} van ${ap.total} stukken (gaat door op de achtergrond)` : ap ? 'Omgeving rond je is klaar ✓' : '';
    if (here && !busy && ap && ap.done < ap.total) { this.ui.loading.hidden = false; this.ui.loading.textContent = bg; }
    const pl = document.getElementById('pause-load');
    if (pl) pl.textContent = bg;
  }

  render() {
    const p = this.player;
    this.placeCamera();
    const far = this.settings.view;
    // dag en nacht
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
    this.lastRender = now;
    this.clock += dt;
    if (this.settings.cycle) { this.settings.hour = (this.settings.hour + dt / 30) % 24; this.syncTimeUi?.(); } // 1 uur per 30 s
    const env = skyAt(this.settings.hour);
    this.applyWeather(env, dt);
    this.renderer.setClearColor(new THREE.Color(...env.sky));
    // onder de grond: donker, korte zichtafstand, geen lucht
    const ug = this.under && this.under.active && this.player.pos.y < (this.under.spec.top(Math.floor(p.pos.x), Math.floor(p.pos.z))) - 1;
    this.isUnderground = ug;
    const W = this.world, streetY = W && W.groundAt ? W.groundAt(p.pos.x, p.pos.z) : W && W.G !== undefined ? W.G : (this.meta && this.meta.ground) || 0;
    for (const m of this.mats) {
      const u = m.uniforms;
      u.streetY.value = streetY;
      u.flashOn.value = this.flash ? 1 : 0; u.flashPos.value.copy(this.camera.position); this.camera.getWorldDirection(u.flashDir.value);
      if (this.far) { u.fogNear.value = 3000; u.fogFar.value = 26000; }
      else if (this.tiled) { u.fogNear.value = this.settings.lod * 0.35; u.fogFar.value = this.settings.lod; }
      else { u.fogNear.value = far * 0.45; u.fogFar.value = far; }
      u.fogColor.value.set(...env.sky); u.day.value = env.day; u.sunDir.value.copy(env.sun); u.time.value = this.clock;
      u.sunColor.value.set(...env.sunColor); u.skyTop.value.set(...env.top);
      if (ug) { u.fogColor.value.set(0.01, 0.01, 0.015); u.fogNear.value = 8; u.fogFar.value = 64; }
      else if (this.curWeather === 'rain' || this.curWeather === 'storm' || this.curWeather === 'snow') { u.fogNear.value = Math.min(u.fogNear.value, 60); u.fogFar.value = Math.min(u.fogFar.value, this.curWeather === 'storm' ? 380 : 650); }
    }
    this.clouds.position.x = p.pos.x; this.clouds.position.z = p.pos.z;
    this.clouds.material.map.offset.set((p.pos.x / 9000) * 6 + this.clock * 0.002, (p.pos.z / 9000) * 6);
    this.clouds.material.color.setRGB(...env.sky.map((v, i) => Math.min(1, 0.55 + v * 0.5 + env.dusk * [0.3, 0.1, 0][i])));
    this.clouds.material.opacity = 0.35 + env.day * 0.55;
    if (this.lod) this.lod.update(env, this.settings.lod, this.world.tiles, p.pos.x, p.pos.z, this.lodNear ? this.settings.lod : 0);
    if (this.traffic && this.settings.traffic !== false) {
      if (this.trafficDirty) { this.trafficDirty = false; this.traffic.rebuild(this.world.tiles, p.pos); }
      this.traffic.update(dt, p.pos, env.day, this.settings.hour);
      this.updateBusPax(dt, env.day);
      // reizigers met een doel (js/travelers.js): verschijnen vanzelf rond de speler (instelling 'reizigers', standaard aan)
      if (this.settings.travelers !== false) { const T = this.travelersOn(); if (T) T.spawnTick(dt, this.player.pos, this.traffic.period || 'dal'); }
      if (this.travelers && this.travelers.list.length) this.travelers.update(dt, this.player.pos);
    }
    // omgevingsgeluid (stad, wind, regen, galm ondergronds); start na de eerste toets of tik
    if (this.settings.ambient !== false) {
      if (!this.ambient) { this.ambient = new Ambient(); const go = () => { this.ambient?.start(); }; addEventListener('keydown', go, { once: true }); addEventListener('pointerdown', go, { once: true }); }
      if ((this.ambT = (this.ambT || 0) + dt) > 0.5) {
        this.ambT = 0;
        let n = 0; if (this.traffic && this.traffic.agents) for (const a of this.traffic.agents) if (!a.dead && a.kind !== 'walk' && a.kind !== 'ship') n++;
        this.ambient.update(0.5, { vehicles: Math.min(n, 60), height: p.pos.y - (this.meta && this.meta.ground || 0), weather: this.curWeather, under: ug, muted: this.paused || document.hidden });
      }
    } else if (this.ambient) { this.ambient.stop(); this.ambient = null; }
    if (this.ships) this.ships.update(dt);
    if (this.airports) this.airports.update(dt, env.day);
    if (this.alpRail) this.alpRail.update(dt, env.day);
    // aan boord: meebewegen met het schip, het vliegtuig of de trein (na het verplaatsen ervan)
    if (this.aboard && this.player.loc && !this.drive) { this.aboard.toWorld(this.player.loc, this.player.pos); this.player.yaw = (this.player.yawLoc ?? 0) + this.aboard.yaw; this.placeCamera(); }
    {
      const pl = this.player, mode = this.ride || this.drive ? 'first' : this.settings.cam || 'first';
      this.avatar.update(dt, pl, { speed: Math.hypot(pl.vel.x, pl.vel.z), onGround: pl.onGround, inWater: pl.inWater, fly: pl.fly, vy: pl.vel.y, visOff: this.visOff || 0 },
        0.2 + 0.8 * env.day, (mode !== 'first' || this.photo === true && this.settings.cam !== 'first') && !this.drive && !this.ride);
    }
    if (this.far) {
      this.far.gondolas.update(dt, env.day);
      this.far.lifts.update(dt, env.day);
      this.far.budget = this.touch ? 3 : 5;
      const lu = this.lod && this.lod.mat.uniforms;
      if (lu) { lu.fogNear.value = 5000; lu.fogFar.value = 60000; }
    }
    this.camera.far = (this.tiled ? Math.max(far, this.settings.lod * 1.6) : far) + 60; this.camera.updateProjectionMatrix();
    this.updateInteriors();
    const pcx = p.pos.x, pcz = p.pos.z, lim = (far + CS * 1.5) ** 2;
    // renderprioriteit: ondergronds alleen wat zichtbaar kan zijn (ondergrondse delen overal, de rest dichtbij)
    // (noPrio: alleen voor vergelijkende tests)
    const enc = this.enclosed = !this.noPrio && this.enclosedBelow(), NEAR2 = 48 * 48, gEnc = enc ? (this.world.groundAt ? this.world.groundAt(pcx, pcz) : this.world.G) : 0;
    for (const c of this.chunks.values()) {
      const dx = c.wx - pcx, dz = c.wz - pcz;
      let vis = !c.src.parked && (!!this.tiled || dx * dx + dz * dz < lim) && (!c.kind || this.sectionVisible(c)); // grote kaarten: alle geladen tegels tonen; geparkeerde verbergen
      let visLo = vis;
      if (enc && vis && dx * dx + dz * dz > NEAR2) { visLo = c.ug; vis = c.kind ? c.y0 < gEnc : !c.uo && c.ug; }
      if (c.o) c.o.visible = vis;
      if (c.t) c.t.visible = vis;
      if (c.uo) c.uo.visible = visLo;
      if (c.ut) c.ut.visible = visLo;
    }
    if (this.lod && enc) for (const m of this.lod.meshes.values()) m.visible = false;
    if (this.under) this.under.update(p.pos, (x, y, z) => this.world.get(x, y, z));
    if (this.mega) this.mega.update(dt);
    if (this.lod) for (const m of this.lod.meshes.values()) if (ug) m.visible = false;
    if (this.lod?.groundMesh) this.lod.groundMesh.visible = !ug && !this.far;
    this.clouds.visible = !ug && !(this.tiled && this.tiled.spec.megatower);
    if (this.traffic) this.traffic.group.visible = !ug;
    if (this.far) { this.far.gondolas.group.visible = !ug; this.far.lifts.group.visible = !ug; }
    this.avatar.group.visible = this.avatar.group.visible && true;
    this.updateShadows(env);
    // lucht, dan (Reuzenberg) het verre berglandschap, dan de blokken eroverheen
    this.renderer.autoClear = false;
    this.renderer.setClearColor(ug ? 0x020203 : SKY);
    this.renderer.clear();
    if (!ug) this.sky.render(this.renderer, this.camera, env);
    if (this.far && !ug) { this.renderer.clearDepth(); this.far.render(this.renderer, this.camera, env, 48); }
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;
    this.perfHud(dt);
    this.autoTune(dt);
    this.drawMinimap();
  }

  // ---------- camera: eerste persoon, derde persoon of van voren ----------
  // hoogte van het vloeiende oppervlak onder de speler (zelfde regels als de mesher)
  smoothGround(x, z, feet) {
    const w = this.world, X = Math.floor(x), Z = Math.floor(z), Y = Math.floor(feet + 0.01) - 1;
    const surfAt = (cx, cz, near) => {
      for (let y = near + 2; y >= near - 2; y--) { const b = w.get(cx, y, cz); if (b && SMOOTH[b] && OVER[w.get(cx, y + 1, cz)]) return y; if (b && !OVER[b] && !SMOOTH[b]) return -1e9; }
      return -1e9;
    };
    const b = w.get(X, Y, Z);
    if (!SMOOTH[b] || !OVER[w.get(X, Y + 1, Z)]) return null;
    const S = (dx, dz) => (dx || dz) ? surfAt(X + dx, Z + dz, Y) : Y;
    const corner = (cx, cz) => { // hoek tussen kolommen (cx-1..cx, cz-1..cz)
      const v = [S(cx - 1, cz - 1), S(cx, cz - 1), S(cx - 1, cz), S(cx, cz)];
      const m = Math.max(...v);
      if (Y < m - 1) return Y + 1;
      let sum = 0, n = 0; for (const q of v) if (q > -1e8 && q >= m - 1) { sum += q + 1; n++; }
      return sum / n;
    };
    const fx = x - X, fz = z - Z;
    const h00 = corner(0, 0), h10 = corner(1, 0), h01 = corner(0, 1), h11 = corner(1, 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }
  placeCamera() {
    const p = this.player, cam = this.camera;
    // camera en personage volgen het vloeiende terrein (de botsingen blijven op blokken)
    let off = 0;
    if (p.onGround && !p.fly && !this.drive && !this.ride) { const g = this.smoothGround(p.pos.x, p.pos.z, p.pos.y); if (g != null) off = Math.max(-0.6, Math.min(0.6, g - p.pos.y)); }
    this.visOff = (this.visOff || 0) + (off - (this.visOff || 0)) * 0.35;
    this.eye.set(p.pos.x, p.pos.y + 1.62 + this.visOff - (p.seated && this.aboard ? 0.6 : 0), p.pos.z);
    const mode = this.drive ? this.drive.camMode() : (this.ride ? 'first' : this.settings.cam || 'first');
    if (this.drive && this.drive.placeCamera(cam, mode)) return;
    if (mode === 'first') { cam.position.copy(this.eye); cam.rotation.set(p.pitch, p.yaw, 0); return; }
    const front = mode === 'front';
    const yaw = p.yaw + (front ? Math.PI : 0), pitch = front ? -p.pitch * 0.5 - 0.12 : p.pitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const D = front ? 3.2 : 4.6, ox = this.eye.x, oy = this.eye.y + 0.35, oz = this.eye.z;
    // niet door muren: terug langs de lijn tot het eerste blok
    let d = 0.3;
    for (; d < D; d += 0.2) {
      const x = ox - fx * d, y = oy - fy * d, z = oz - fz * d;
      if (this.world.solidAt(Math.floor(x), Math.floor(y), Math.floor(z))) { d = Math.max(0.3, d - 0.35); break; }
    }
    cam.position.set(ox - fx * d, oy - fy * d, oz - fz * d);
    cam.rotation.set(pitch, yaw, 0);
  }
  // in een voertuig stappen: zelf besturen of meerijden
  enterVehicle(mode) {
    if (this.drive || !this.traffic) return;
    if (this.alpRail && this.alpRail.handleKey(mode)) return;
    let v = this.traffic.nearestVehicle(this.player.pos, 8);
    // vliegtuig: aan de gate instappen, in de cockpit zelf vliegen
    if (!v && this.airports) {
      if (this.aboard && this.aboard.cab) {
        const pl = this.aboard, c = pl.cab.cockpit, l = this.player.loc;
        if (mode === 'drive' && Math.hypot(l.x - c[0], l.z - c[2]) < 3.5) { this.leaveVessel(); this.drive = new FlightControl(this, pl); return; }
        if (mode === 'drive') { this.toast('Ga naar de cockpit (vooraan) om zelf te vliegen'); return; }
      } else if (!this.aboard) {
        const pl = this.airports.nearest(this.player.pos, 45);
        if (pl) { if (pl.state !== 'parked' && pl.speed > 1) { this.toast('Dit vliegtuig rijdt of vliegt al'); return; } this.boardVessel(pl, true); if (pl.airline) this.toast(`✈ Welkom aan boord van ${pl.airline}!`); return; }
      }
    }
    // schip: in de stuurhut = sturen, anders aan boord gaan
    if (!v && this.ships) {
      if (this.aboard) {
        const a = [...this.ships.list].find(([, vv]) => vv === this.aboard)?.[0];
        const br = this.aboard.g.bridge, l = this.player.loc;
        if (a && mode === 'drive' && Math.hypot(l.x - br[0], l.z - br[2]) < 8 && Math.abs(l.y - br[1]) < 4) { const ves = this.aboard; this.leaveVessel(); this.drive = new Drive(this, a, 'drive'); this.drive.vessel = ves; return; }
        if (mode === 'drive') { this.toast('Ga naar de stuurhut (brug) om te sturen'); return; }
      } else {
        const n = this.ships.nearest(this.player.pos, 30);
        if (n) { this.boardVessel(n.v, true); return; }
      }
    }
    if (!v) { this.toast('Geen voertuig in de buurt (ga tot naast een auto, bus, tram, trein of schip)'); return; }
    if (mode === 'passenger' && v.free) mode = 'drive';
    if (v.player || v.passenger) return;
    this.drive = new Drive(this, v, mode);
    document.getElementById('drive-choice')?.setAttribute('hidden', '');
  }
  useAction() { const a = this.action; if (!a) return; try { a.run(); } catch (err) { console.error(err); } this.action = null; this.updateTarget(); }
  toggleFlash() { this.flash = !this.flash; this.toast(this.flash ? '🔦 Zaklamp aan' : 'Zaklamp uit'); }
  cycleCamera() {
    const order = ['first', 'third', 'front'];
    if (this.drive) { this.drive.cycleCam(); return; }
    this.settings.cam = order[(order.indexOf(this.settings.cam || 'first') + 1) % 3];
    saveSettings(this.settings);
    const sel = document.getElementById('set-cam'); if (sel) sel.value = this.settings.cam;
    this.toast({ first: '👁 Eerste persoon', third: '🎥 Derde persoon', front: '🙂 Van voren' }[this.settings.cam]);
  }

  // ---------- GNMI: echt weer per regio in Greenisland, met waarschuwingen ----------
  isGreen() { return !!(this.meta && (this.meta.greenisland || this.meta.id === 'greenisland')); }
  gnmiWeather() {
    if (!this.isGreen()) return null;
    if (!this.wallet && !this.vcLoading) { this.vcLoading = true; import('./viridcoin.js').then(m => { this.vc = m; this.wallet = new m.Wallet(); this.wallet.ticket = m.ticketPrice; const b = this.wallet.dailyBonus(); if (b) this.toast(`💰 Dagbonus: +${b} ViridCoin (saldo ${Math.round(this.wallet.balance)} VC)`); }).catch(e => console.error(e)); }
    if (!this.gnmi) { if (!this.gnmiLoading) { this.gnmiLoading = true; import('./gnmi.js').then(m => { this.gnmi = m; }).catch(e => console.error(e)); } return null; }
    const now = performance.now(), p = this.player.pos;
    if (!this.gnmiNow || now - this.gnmiT > 8000) {
      this.gnmiT = now; this.gnmiNow = this.gnmi.weatherAt(p.x, p.z);
      const warn = this.gnmi.warningsFor(this.gnmiNow), top = warn.sort((a, b) => this.gnmi.LEVEL_RANK[b.level] - this.gnmi.LEVEL_RANK[a.level])[0];
      const key = this.gnmiNow.region + ':' + warn.map(x => x.level + x.what.split(' (')[0]).join(',');
      if (top && key !== this.gnmiWarnKey) this.toast(`⚠ GNMI code ${top.level} voor ${this.gnmiNow.name}: ${warn.map(x => x.what).join(', ')}`);
      this.gnmiWarnKey = key;
    }
    return { storm: 'storm', snow: 'snow', rain: 'rain', fog: 'cloudy', cloudy: 'cloudy', clear: 'clear' }[this.gnmiNow.kind];
  }
  showWallet() {
    const draw = () => {
      const m = this.vc, w = this.wallet, body = document.getElementById('vc-body'); if (!m || !w || !body) return;
      const zn = (this.tiled && this.tiled.spec.zoneName ? this.tiled.spec.zoneName : () => '')(this.player.pos.x, this.player.pos.z);
      const inShow = /^Zenvo Showroom/.test(zn);
      let h = `<p style="font-size:18px;margin:0 0 6px">Saldo: <b>${m.fmt(w.balance)}</b></p>`;
      h += `<h3 style="margin:8px 0 4px">🚗 Zenvo</h3><div class="small muted">${inShow ? 'Je bent in de Zenvo Showroom: kies een model.' : 'Kopen kan in de Zenvo Showroom in Munkbay (naast het Zenvo-hoofdkantoor). Proefrijden kan gratis op het Zenvo-testterrein bij Riverside.'}</div><table class="small" style="width:100%">`;
      for (const md of m.ZENVO_MODELS) {
        const own = w.cars.includes(md.id);
        h += `<tr><td><span style="color:#${md.color.toString(16).padStart(6, '0')}">■</span> <b>${md.name}</b> – ${md.desc}</td><td>${m.fmt(md.price)}</td><td>${own ? `<button class="btn" data-call="${md.id}">🔑 Oproepen</button>` : inShow ? `<button class="btn" data-buy="${md.id}"${w.balance < md.price ? ' disabled' : ''}>Kopen</button>` : ''}</td></tr>`;
      }
      h += '</table><h3 style="margin:10px 0 4px">📒 Laatste verrichtingen</h3><table class="small" style="width:100%">';
      for (const e of w.history.slice(-12).reverse()) h += `<tr><td>${new Date(e.t).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${e.what}</td><td align="right" style="color:${e.n < 0 ? '#f87171' : '#4ade80'}">${e.n > 0 ? '+' : ''}${m.fmt(e.n)}</td></tr>`;
      h += '</table><p class="help">Verdienen: +40 VC per voltooide opdracht, +25 VC dagbonus. Betalen: een kaartje bij het instappen (metro, tram en stadsbus 1,90 · streekbus 3,40 · trein 4,20 · internationaal 29 VC).</p>';
      body.innerHTML = h;
      for (const b of body.querySelectorAll('[data-buy]')) b.onclick = () => { const md = m.ZENVO_MODELS.find(q => q.id === b.dataset.buy), r = w.buy(md); this.toast(r === 'ok' ? `🚗 Gefeliciteerd met je ${md.name}! Roep hem op waar je maar wil.` : r === 'geld' ? '💰 Niet genoeg ViridCoin' : 'Die heb je al'); draw(); };
      for (const b of body.querySelectorAll('[data-call]')) b.onclick = () => this.callZenvo(m.ZENVO_MODELS.find(q => q.id === b.dataset.call));
    };
    if (this.vc) draw(); else import('./viridcoin.js').then(m => { this.vc = m; if (!this.wallet) { this.wallet = new m.Wallet(); this.wallet.ticket = m.ticketPrice; } draw(); });
    this.showOverlay('vc');
  }
  // eigen Zenvo: een auto op een weg in de buurt, en meteen zelf rijden
  callZenvo(md) {
    if (!this.traffic) return;
    const a = this.traffic.spawnNear('car', this.player.pos);
    if (!a) { this.toast('🚗 Geen weg in de buurt om je Zenvo neer te zetten'); return; }
    a.color = md.color; a.zenvo = md.name; a.v = 0;
    this.showOverlay(null);
    this.drive = new Drive(this, a, 'drive');
    this.toast(`🚗 Je ${md.name} staat klaar. Goede rit!`);
  }
  showGnmi() {
    const ov = document.getElementById('ov-gnmi'), body = document.getElementById('gnmi-body');
    const draw = (m) => {
      const hh = (h) => { const d = new Date(Date.now() + h * 3600000); return `${String(d.getHours()).padStart(2, '0')}:00`; };
      const rows = m.overview().map(o => `<tr><th>${o.R.name}</th><td>${o.now.icon} ${o.now.text}<br><b>${o.now.temp.toFixed(1)} °C</b> · wind ${o.now.wind} km/u${o.now.rain ? ` · ${o.now.rain} mm/u` : ''}</td>`
        + `<td>${o.next.map(n => `<span style="white-space:nowrap">${hh(n.h)} ${n.w.icon} ${Math.round(n.w.temp)}°</span>`).join(' · ')}</td>`
        + `<td>${o.warn.length ? o.warn.map(w => `<span class="gnmi-warn ${w.level}">code ${w.level}: ${w.what}</span>`).join('') : '<span class="muted">geen</span>'}</td></tr>`).join('');
      const here = m.weatherAt(this.player.pos.x, this.player.pos.z);
      body.innerHTML = `<p>Hier (${here.name}): ${here.icon} ${here.text}, ${here.temp.toFixed(1)} °C, wind ${here.wind} km/u</p><table><tr><th>Regio</th><th>Nu</th><th>Straks</th><th>Waarschuwingen</th></tr>${rows}</table>`;
    };
    if (this.gnmi) draw(this.gnmi); else import('./gnmi.js').then(m => { this.gnmi = m; draw(m); });
    void ov; this.showOverlay('gnmi');
  }

  // ---------- weer: regen, onweer, sneeuw en natte wegen ----------
  applyWeather(env, dt) {
    // in Greenisland standaard het echte GNMI-weer, tot je zelf een weer kiest
    let w = this.isGreen() && !this.settings.weatherSet ? 'gnmi' : this.settings.weather || 'clear';
    if (w === 'gnmi') w = this.gnmiWeather() || 'clear';
    if (w === 'auto') { const t = Math.floor(this.clock / 240) % 5; w = ['clear', 'cloudy', 'rain', 'clear', 'storm'][t]; }
    this.curWeather = w;
    const grey = { clear: 0, cloudy: 0.35, rain: 0.55, storm: 0.75, snow: 0.45 }[w] || 0;
    if (this.sky) this.sky.cover = { clear: 0.38, cloudy: 0.7, rain: 0.85, storm: 0.95, snow: 0.8 }[w] ?? 0.45; // wolken aan de hemel
    if (grey) {
      const g = 0.62 * env.day + 0.05;
      env.sky = env.sky.map(v => v * (1 - grey) + g * grey);
      env.top = env.top.map(v => v * (1 - grey) + g * 0.85 * grey);
      env.sunColor = env.sunColor.map(v => v * (1 - grey * 0.75));
    }
    // natheid neemt langzaam toe en droogt weer op
    const wantWet = w === 'rain' ? 0.8 : w === 'storm' ? 1 : 0;
    this.wet = (this.wet || 0) + (wantWet - (this.wet || 0)) * Math.min(1, dt * (wantWet > (this.wet || 0) ? 0.08 : 0.03));
    for (const m of this.mats) m.uniforms.wet.value = this.wet;
    // bliksem
    if (w === 'storm' && Math.random() < dt * 0.06) this.flashT = 0.25;
    if (this.flashT > 0) { this.flashT -= dt; env.sky = env.sky.map(v => Math.min(1, v + 0.5)); }
    // neerslag rond de camera
    const want = (w === 'rain' || w === 'storm') ? 'rain' : w === 'snow' ? 'snow' : null;
    if (!this.precip || this.precip.kind !== want) {
      if (this.precip) { this.scene.remove(this.precip.obj); this.precip.obj.geometry.dispose(); }
      this.precip = null;
      if (want) {
        const N = want === 'rain' ? 2600 : 2200, pos = new Float32Array(N * (want === 'rain' ? 6 : 3));
        for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 40, z = (Math.random() - 0.5) * 60; if (want === 'rain') pos.set([x, y, z, x, y - 0.7, z], i * 6); else pos.set([x, y, z], i * 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const obj = want === 'rain' ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.8 })) : new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9 }));
        obj.frustumCulled = false; this.scene.add(obj);
        this.precip = { kind: want, obj, pos, N };
      }
    }
    if (this.precip) {
      const P = this.precip, c = this.camera.position, rain = P.kind === 'rain', vy = rain ? (w === 'storm' ? 34 : 24) : 1.6, stride = rain ? 6 : 3;
      P.obj.visible = !this.isUnderground;
      for (let i = 0; i < P.N; i++) {
        const o = i * stride;
        let y = P.pos[o + 1] - vy * dt;
        if (!rain) { P.pos[o] += Math.sin(this.clock + i) * dt * 0.4; }
        if (y < 0) { y += 40; }
        P.pos[o + 1] = y; if (rain) P.pos[o + 4] = y - 0.7;
      }
      P.obj.position.set(Math.floor(c.x / 60) * 0 + c.x, c.y - 20, c.z);
      P.obj.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---------- schaduwen van de zon (rond de speler) ----------
  updateShadows(env) {
    const S = this.shadow, q = this.settings.quality || 'normal';
    const want = this.autoLow || this.settings.shadows === false ? 0 : q === 'ultra' ? 4096 : q === 'sharp' ? 2048 : q === 'normal' ? (this.touch ? 1024 : 2048) : 0;
    const set = (k, v) => { for (const m of this.mats) m.uniforms[k].value = v; };
    if (!want || env.day < 0.08 || !this.world) { set('shadowOn', 0); return; }
    if (S.size !== want) {
      S.rt?.dispose();
      S.rt = new THREE.WebGLRenderTarget(want, want, { depthBuffer: true });
      S.rt.depthTexture = new THREE.DepthTexture(want, want); S.rt.depthTexture.type = THREE.UnsignedIntType;
      S.size = want;
    }
    S.frame = (S.frame || 0) + 1;
    if (this.touch && S.frame % 2 && S.ready) return; // telefoon: om de twee beelden
    const p = this.player.pos, cam = S.cam, texel = 220 / want;
    // tegen flikkerende schaduwranden: het midden vastzetten op het pixelraster van de schaduwkaart, gemeten langs
    // de assen van de zonnecamera zelf (niet langs x/y/z van de wereld, dat verschuift de kaart met halve pixels)
    const sun = S.sun || (S.sun = new THREE.Vector3()), R = S.right || (S.right = new THREE.Vector3()), U = S.up || (S.up = new THREE.Vector3());
    sun.set(env.sun.x, env.sun.y, env.sun.z).normalize();
    // de zonrichting zelf in kleine stapjes (bij een lopende dag-nachtcyclus anders elk beeld een nieuwe kaart)
    sun.set(Math.round(sun.x * 400) / 400, Math.round(sun.y * 400) / 400, Math.round(sun.z * 400) / 400).normalize();
    R.set(0, 1, 0).cross(sun); if (R.lengthSq() < 1e-6) R.set(1, 0, 0); R.normalize(); U.copy(sun).cross(R).normalize();
    const u = p.x * R.x + p.y * R.y + p.z * R.z, v = p.x * U.x + p.y * U.y + p.z * U.z;
    const du = Math.round(u / texel) * texel - u, dv = Math.round(v / texel) * texel - v;
    const cx = p.x + R.x * du + U.x * dv, cy = p.y + R.y * du + U.y * dv, cz = p.z + R.z * du + U.z * dv;
    cam.up.copy(U);
    cam.position.set(cx + sun.x * 700, cy + sun.y * 700, cz + sun.z * 700);
    cam.lookAt(cx, cy, cz); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const r = this.renderer, prevOverride = this.scene.overrideMaterial;
    this.scene.overrideMaterial = S.mat;
    r.setRenderTarget(S.rt); r.clear(); r.render(this.scene, cam); r.setRenderTarget(null);
    this.scene.overrideMaterial = prevOverride;
    S.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    set('shadowMap', S.rt.depthTexture); set('shadowOn', 1);
    S.ready = true;
  }
  // reizigers met een doel aanmaken (gebruikt door de reistest en later door de wereld zelf)
  travelersOn() {
    if (!this.travelers && this.traffic) {
      this.travelers = new Travelers(this.scene, this.world, this.traffic); this.travelers.ground = this.traffic.G ?? this.meta?.ground;
      // Megatower City: hele reizen van deur tot deur met de reisplanner (TERRANOVA 15, js/journeys.js)
      if (this.tiled && this.tiled.spec.megatower) import('./megatower.js').then((M) => { const T = this.travelers; if (!T) return; T.tower = { at: (p) => { if (!M.inTowerBox(p.x, p.z)) return null; const f = M.floorAt(Math.floor(p.y)); return { f, zone: M.zoneOf(f), y: M.floorY(f) }; } }; }).catch((e) => console.error(e));
      if (this.tiled && this.tiled.spec.megatower) { const T = this.travelers; import('./megaplan.js').then((m) => { if (this.travelers === T) T.journey = { plan: m.plan, planAsync: planAsyncOf(), places: m.PLACES, hour: () => this.settings.hour ?? 12 }; }).catch((e) => console.error(e)); }
    }
    return this.travelers;
  }
  // wachtenden aan de bushaltes: instappen bij een bus met open deuren, uitstappen (js/buspax.js)
  updateBusPax(dt, day) {
    if (!this.busPax) this.busPax = new BusPax(this.scene, this.world);
    const tr = this.traffic, buses = [];
    for (const a of tr.agents || []) if (a.kind === 'bus' && !a.dead) { const h = tr.behind(a, a.L / 2, this.tmpBus || (this.tmpBus = {})); buses.push({ id: a, x: h.x, z: h.z, open: a.atStop !== false && a.wait > 2.5 && a.wait < (a.dwell || 18) - 1.5, get served() { return a.paxServed; }, set served(v) { a.paxServed = v; } }); }
    this.busPax.trips = tr.trips;
    this.busPax.update(dt, this.player.pos, tr.stops || [], buses, tr.period || 'dal');
    this.busPax.setDay(day);
  }
  // TERRANOVA-laadscherm: alleen bij het eerste laden van een gekozen wereld, met de echte status (geen verzonnen
  // percentages): downloaden, stukken uit de opslag, 3D-stukjes in de wachtrij en het aantal geladen stukken
  brandLoader(here, phase, td) {
    const L = document.getElementById('tn-loader'); if (!L) return;
    if (this.loaderTiled !== this.tiled) { this.loaderTiled = this.tiled; this.loaderDone = false; this.loaderT0 = performance.now(); }
    if (this.loaderDone || here) { if (!L.hidden) L.hidden = true; if (here) this.loaderDone = true; return; }
    L.hidden = false;
    const w = document.getElementById('tn-loader-world'), ph = document.getElementById('tn-loader-phase'), tip = document.getElementById('tn-loader-tip');
    const name = (document.getElementById('game-title')?.textContent || '').trim();
    if (w) w.textContent = name || 'Wereld wordt geladen';
    const n = this.world && this.world.tiles ? this.world.tiles.size : 0;
    if (ph) ph.textContent = `${this.tileError ? 'Laden lukt niet: ' + this.tileError + '. Opnieuw proberen…' : phase} · ${n} stuk${n === 1 ? '' : 'ken'} geladen`;
    const TIPS = ['Druk op M voor de kaart, de OV-kaart en de reisplanner.', 'Spring op een liftblok om naar boven te gaan, Shift om omlaag te gaan.', 'H stapt in of uit een voertuig, J om mee te rijden als passagier.', 'V wisselt het camerastandpunt in een voertuig.', 'E bedient wat je aankijkt: deuren, licht, borden en vertrekborden.', 'F3 toont de FPS-meter; grafische profielen staan in de instellingen.', 'Je bouwwerken worden op dit toestel bewaard, ook als je de pagina sluit.'];
    const k = Math.floor((performance.now() - (this.loaderT0 || 0)) / 6000) % TIPS.length;
    if (tip && tip.dataset.k !== String(k)) { tip.dataset.k = String(k); tip.textContent = '💡 ' + TIPS[k]; }
  }
  // FPS-meter (instellingen of F3): beelden per seconde, traagste frame, tekenopdrachten, driehoeken, geheugen, laadtijd
  perfHud(dt) {
    const P = this.perf || (this.perf = { t: 0, n: 0, worst: 0, born: performance.now() });
    P.t += dt; P.n++; P.worst = Math.max(P.worst, dt);
    if (!P.loaded && this.player && this.world && this.world.tileAt?.(this.player.pos.x, this.player.pos.z) && !(this.queue && this.queue.length > 30)) P.loaded = performance.now() - P.born;
    if (P.t < 0.5) return;
    const fps = P.n / P.t, worst = P.worst; P.t = 0; P.n = 0; P.worst = 0;
    this.fpsNow = fps;
    let el = document.getElementById('fps-hud');
    if (!this.settings.fps) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'fps-hud'; el.className = 'fps-hud'; (this.ui.root || document.body).appendChild(el); }
    el.hidden = false;
    const inf = this.renderer.info.render, mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n.v.t.';
    const col = fps >= 50 ? '#4ade80' : fps >= 28 ? '#fbbf24' : '#ff5a4a';
    el.innerHTML = `<b style="color:${col}">${fps.toFixed(0)} FPS</b> · traagste ${(worst * 1000).toFixed(0)} ms<br>${inf.calls} tekenopdr. · ${(inf.triangles / 1000).toFixed(0)}k driehoeken<br>geheugen ${mem} · resolutie ${Math.round((this.tune?.scale ?? 1) * 100)}%${this.autoLow ? ' (laag)' : ''}<br>laadtijd ${P.loaded ? (P.loaded / 1000).toFixed(1) + ' s' : '…'} · wachtrij ${this.queue ? this.queue.length : 0}`;
  }
  // automatische kwaliteit: bij te weinig beelden per seconde de resolutie en schaduwen terugschroeven
  autoTune(dt) {
    if (this.settings.auto === false || this.photo) return;
    const a = this.tune || (this.tune = { t: 0, n: 0, scale: 1, good: 0 });
    a.t += dt; a.n++;
    if (a.t < 2.5) return;
    const fps = a.n / a.t; a.t = 0; a.n = 0;
    this.fps = fps;
    let changed = false;
    if (fps < 27 && a.scale > 0.55) { a.scale = Math.max(0.55, a.scale - 0.15); a.good = 0; changed = true; }
    else if (fps < 24 && !this.autoLow) { this.autoLow = true; changed = true; }
    else if (fps > 52) { if (++a.good >= 3) { a.good = 0; if (this.autoLow) { this.autoLow = false; changed = true; } else if (a.scale < 1) { a.scale = Math.min(1, a.scale + 0.1); changed = true; } } }
    else a.good = 0;
    if (a.scale < 0.75 && !this.autoLow) { this.autoLow = true; changed = true; }
    if (changed) this.applyQuality();
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
    this.mini = { canvas: c, scale: 1, sizeX: S, sizeZ: S };
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
    if (!this.player) return;
    const a = -this.player.yaw;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, r); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r * 0.7, r); ctx.closePath();
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // grote kaart (M): klik om erheen te vliegen
  openMap() {
    if (this.alpRail && !this.mapPlain && this.alpRail.openMap()) return;
    this.ensureMini();
    if (!this.mini) return;
    const c = this.ui.bigmap, mc = this.mini.canvas;
    const k = Math.min(1024, Math.max(512, Math.max(mc.width, mc.height))) / Math.max(this.mini.sizeX, this.mini.sizeZ);
    c.width = Math.round(this.mini.sizeX * k); c.height = Math.round(this.mini.sizeZ * k);
    c.style.aspectRatio = `${c.width} / ${c.height}`;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(mc, 0, 0, c.width, c.height);
    // bezienswaardigheden: stations, metro, bushaltes, luchthavens, schepen
    const mark = (x, z, emoji, label) => {
      ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(emoji, x * k, z * k + 6);
      if (label) { ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(label, x * k + 1, z * k + 20); ctx.fillStyle = '#fff'; ctx.fillText(label, x * k, z * k + 19); }
    };
    const seen = new Set();
    for (const st of this.traffic?.net.stops || []) {
      const lbl = st.name && !seen.has(st.name) ? st.name : ''; if (lbl) seen.add(lbl);
      mark(st.x, st.z, st.kind === 'metrostop' ? '🚇' : st.kind === 'railstop' ? '🚉' : '🚏', st.kind === 'busstop' ? '' : lbl);
    }
    for (const r of this.airports?.runways || []) mark((r.a[0] + r.b[0]) / 2, (r.a[2] + r.b[2]) / 2, '✈', 'Luchthaven');
    for (const v of this.ships?.list.values() || []) mark(v.pos.x, v.pos.z, '🚢', '');
    this.drawArrow(ctx, this.player.pos.x * k, this.player.pos.z * k, 9);
    if (!c.dataset.bound) {
      c.dataset.bound = '1';
      c.addEventListener('click', (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * this.mini.sizeX, z = (e.clientY - r.top) / r.height * this.mini.sizeZ;
        const p = this.player;
        p.pos.set(x, (this.meta.ground ?? GROUND) + 60, z); p.vel.set(0, 0, 0); p.fly = true; p.pitch = -0.3;
        if (this.tiled) { this.tiled.aheadKey = null; this.updateTiles(true); }
        this.invOpen = false;
        this.resume();
      });
    }
    { const ob = document.getElementById('btn-map-ov'); if (ob) ob.hidden = !this.mega; }
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
  solid(x, y, z) { return this.world.solidAt(x, y, z) || (!!this.mega && this.mega.solid(x, y, z)); }
  teleportTo(x, y, z) { const p = this.player; this.seat = null; p.pos.set(x, y + 0.02, z); p.vel.set(0, 0, 0); p.fly = false; return true; }
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

  makeWorld(meta, vox) { return new World(meta, vox); }
  announce(text) { try { const u = new SpeechSynthesisUtterance(text); u.lang = 'nl-BE'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* geen spraak */ } }
  // passagier van het ene vliegtuig naar het andere (bv. na een rondvlucht weer naderen)
  transferAboard(from, to) {
    if (this.aboard !== from) return;
    const l = this.player.loc.clone();
    this.aboard = to; this.player.loc = l; this.player.yawLoc = this.player.yaw - from.yaw;
  }
  // reizen: tijdens het klimmen een bestemming kiezen
  offerTravel(pl) {
    const box = document.getElementById('travel'), list = document.getElementById('travel-list');
    const dests = this.ui.travelList?.() || [];
    if (!box || !dests.length) return;
    this.announce('Dames en heren, wij hebben onze kruishoogte bijna bereikt. U kan nu uw bestemming kiezen.');
    list.innerHTML = '';
    for (const d of dests) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = `${d.icon || '✈'} ${d.name}`; b.onclick = () => { box.hidden = true; this.ui.onTravel?.(d, pl); }; list.appendChild(b); }
    box.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  // ---------- aan boord van een schip ----------
  boardVessel(v, toDeck) {
    const p = this.player;
    this.aboard = v;
    if (toDeck && v.cab) {
      // vliegtuig: door de deur naar binnen
      p.loc = new THREE.Vector3(v.cab.door[0] + 1.5, v.cab.door[1], v.cab.door[2]);
      p.fly = false; p.vel.set(0, 0, 0);
    } else if (toDeck) {
      // naar het hoogste vrije plekje midden op het schip
      const x = Math.floor(v.g.W / 2), z = Math.floor(v.g.L * 0.5);
      let y = v.g.H - 1; while (y > 0 && !v.world.solidAt(x, y - 1, z)) y--;
      p.loc = new THREE.Vector3(x + 0.5, y + 0.05, z + 0.5);
      p.fly = false; p.vel.set(0, 0, 0);
    } else p.loc = v.toLocal(p.pos, new THREE.Vector3());
    p.yawLoc = p.yaw - v.yaw;
    this.toast(v.cab ? `✈ Aan boord van een ${v.T.name}. Zoek een plaatsje! H in de cockpit = zelf vliegen.` : `⚓ Aan boord: ${v.T.name}. Rondlopen kan gewoon; H in de stuurhut = sturen.`);
  }
  leaveVessel() {
    const v = this.aboard; if (!v) return;
    const p = this.player;
    if (p.loc) v.toWorld(p.loc, p.pos);
    p.yaw = (p.yawLoc ?? 0) + v.yaw;
    this.aboard = null;
  }
  update(dt) {
    const v = this.aboard;
    if (!v || this.drive) { this.updateMain(dt); return; }
    // natuurkunde in het assenstelsel van het schip
    const p = this.player, W = this.world, T = this.tiled;
    p.yawLoc = p.yaw - v.yaw;
    p.pos.copy(p.loc); p.yaw = p.yawLoc;
    this.world = v.world; this.tiled = null; this.aboardStep = true;
    try { this.updateMain(dt); } finally { this.world = W; this.tiled = T; this.aboardStep = false; }
    p.loc.copy(p.pos); p.yawLoc = p.yaw;
    p.yaw = p.yawLoc + v.yaw;
    v.toWorld(p.loc, p.pos);
    this.updateHud();
    if (this.ui.place && performance.now() - (this.shipHudT || 0) > 1000) { this.shipHudT = performance.now(); this.ui.place.textContent = `⚓ Aan boord: ${v.T.name} · ${this.ui.place.textContent}`; }
    // van het schip gestapt of gevallen
    if (!v.inside(p.loc, 1.2) || p.loc.y < -1.2) { this.aboard = null; this.toast('Van boord'); }
  }
  updateMain(dt) {
    const p = this.player, k = this.keys;
    if (this.drive) { this.drive.update(dt); this.updateHud(); return; }
    // in een lift van de Megatower: meerijden; op een stoel of in bed: blijven tot je beweegt
    if (this.mega && this.mega.updateRide()) { if (this.tiled) this.updateTiles(); this.updateHud(); return; }
    if (this.seat && updateSeat(this)) { this.updateTarget(); this.updateHud(); return; }
    // voertuig in de buurt? (instappen)
    if (this.traffic && !this.aboardStep && (this.nearT = (this.nearT || 0) + dt) > 0.4) {
      this.nearT = 0;
      const v = this.traffic.nearestVehicle(p.pos, 7);
      if (!!v !== !!this.nearVehicle) {
        document.getElementById('t-drive')?.classList.toggle('show', !!v || !!this.alpRail?.canBoard);
        if (v && !this.drivingHintShown) { this.drivingHintShown = true; this.toast(this.touch ? '🚗 Tik op 🚗 om in te stappen' : '🚗 H = zelf besturen · J = meerijden'); }
      }
      this.nearVehicle = v;
    }
    if (this.ride) { this.updateRide(dt); if (this.tiled) this.updateTiles(); this.updateHud(); return; }
    if (this.far) {
      const near = MV.stationNear(p.pos) >= 0 || !!this.far.lifts.stationNear(p.pos);
      if (near !== !!this.nearStation) { this.nearStation = near; document.getElementById('t-ride')?.classList.toggle('show', near); if (near) this.toast(this.touch ? '🚡 Tik op 🚡 om met de kabelbaan te gaan' : '🚡 Druk op G om met de kabelbaan te gaan'); }
    }
    if (this.tiled && !this.world.tileAt(p.pos.x, p.pos.z)) { this.updateTarget(); this.updateHud(); return; }
    if (this.tiled && !p.fly && this.interiorPending()) { p.vel.set(0, 0, 0); this.updateHud(); return; } // verdieping wordt nog opgebouwd
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
    const body = this.world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.2), Math.floor(p.pos.z));
    p.onLadder = !p.fly && (feet === B.LADDER || body === B.LADDER);
    // roltrap: voert je mee naar de volgende trede omhoog
    p.escalator = null;
    if (!p.fly) {
      const X = Math.floor(p.pos.x), Y = Math.floor(p.pos.y - 0.5), Z = Math.floor(p.pos.z);
      if (this.world.get(X, Y, Z) === B.ESCALATOR) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.world.get(X + dx, Y + 1, Z + dz) === B.ESCALATOR) { p.escalator = [dx, dz]; break; }
    }
    let speed = p.fly ? FLY_SPEEDS[this.flyLevel || 0] * (this.boost || this.touchSprint ? 2.5 : 1) : (sprint ? 6.6 : 4.4);
    if (p.inWater && !p.fly) speed *= 0.55;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    // vliegend: vooruit gaat in de kijkrichting (ook omhoog/omlaag)
    const fzH = p.fly ? fz * Math.cos(p.pitch) : fz;
    const wx = (fx * cos + fzH * sin) * speed, wz = (-fx * sin + fzH * cos) * speed;
    const acc = p.onGround || p.fly ? 14 : 4;
    p.vel.x += (wx + (p.escalator ? p.escalator[0] * 1.6 : 0) - p.vel.x) * Math.min(1, acc * dt);
    p.vel.z += (wz + (p.escalator ? p.escalator[1] * 1.6 : 0) - p.vel.z) * Math.min(1, acc * dt);

    const up = k.has('Space') || this.touchUp;
    const groundedBefore = p.onGround; // voor de lift: stond je op de grond vóór je sprong?
    const down = (k.has('ShiftLeft') || k.has('KeyC')) && p.fly || this.touchDown;
    if (p.fly) {
      p.vel.y = (up ? speed * 0.8 : down ? -speed * 0.8 : 0) - fz * Math.sin(p.pitch) * speed;
    } else if (p.onLadder) {
      // ladder: omhoog met spring/vooruit, omlaag met Shift, anders langzaam zakken
      p.vel.y = up || len > 0.3 ? 3.2 : (k.has('ShiftLeft') || this.touchDown) ? -3.5 : -1.2;
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
    if (blockedH && p.onGround && !p.onLadder && (len > 0.3 || p.escalator)) {
      // automatisch één blok opstappen (trappen van blokken lopen vanzelf)
      const ahead = this.world.solidAt(Math.floor(p.pos.x + Math.sin(p.yaw) * -0.6), Math.floor(p.pos.y + 1.5), Math.floor(p.pos.z + Math.cos(p.yaw) * -0.6));
      if (!ahead) p.vel.y = 7.2;
    }
    // lift: op een liftblok met spring omhoog, met Shift omlaag naar het volgende liftblok in dezelfde kolom
    {
      const goUp = up && !this.upWas, goDown = (k.has('ShiftLeft') || this.touchDown) && !this.downWas;
      this.upWas = up; this.downWas = k.has('ShiftLeft') || this.touchDown;
      if ((goUp || goDown) && (p.onGround || groundedBefore) && !p.fly) {
        const X = Math.floor(p.pos.x), Z = Math.floor(p.pos.z);
        let Y = Math.floor(p.pos.y - 0.5);
        if (this.world.get(X, Y, Z) !== B.ELEVATOR && this.world.get(X, Y - 1, Z) === B.ELEVATOR) Y--; // al even opgesprongen
        if (this.world.get(X, Y, Z) === B.ELEVATOR) {
          const dir = goUp ? 1 : -1;
          for (let yy = Y + dir * 2; Math.abs(yy - Y) < 320; yy += dir) {
            if (this.world.get(X, yy, Z) === B.ELEVATOR && !this.world.solidAt(X, yy + 1, Z) && !this.world.solidAt(X, yy + 2, Z)) {
              p.pos.y = yy + 1.01; p.vel.y = 0;
              this.toast(`🛗 Lift ${goUp ? 'omhoog' : 'omlaag'} · ${Math.abs(yy - Y)} m`);
              break;
            }
          }
        }
      }
    }
    if (p.pos.y < -10 && !this.tiled) this.spawn();
    // grote echte kaart (heel België): na een sprong of teleport kan de pas geladen tegel hoger liggen dan de speler
    // (heuvels, Ardennen): dan boven op de grond zetten in plaats van vast in de grond
    if (this.tiled && this.meta && this.meta.map && this.meta.map.bigWorld && !this.drive && !this.aboard) {
      const fx = Math.floor(p.pos.x), fz = Math.floor(p.pos.z);
      if (this.world.tileAt(fx, fz) && this.collides(p.pos.x, p.pos.y, p.pos.z)) { p.pos.y = this.world.columnTop(fx, fz) + 1.05; p.vel.set(0, 0, 0); }
    }

    // muis ingedrukt houden = herhalen
    this.actionTimer = (this.actionTimer || 0) - dt;
    if (this.holding && this.actionTimer <= 0) { this.act(this.holding); this.actionTimer = 0.22; }

    this.updateTarget();
    this.builder.update();
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
    if (this.dirty && now - this.lastAuto > 30000) { this.lastAuto = now; this.ui.onSave?.(true); }
    // bouwwerken op grote kaarten: enkele seconden na de laatste wijziging al bewaren (niet wachten op afsluiten)
    if (this.tiled && this.lastEditAt && now - this.lastEditAt > 4000) { this.lastEditAt = 0; this.saveDirtyTiles(); }
    // grote kaarten: elke 20 s stil bewaren waar je bent (valt de pagina weg, dan kan je verder)
    if (this.tiled && now - (this.lastPosSave || now) > 20000) { this.lastPosSave = now; this.ui.onSave?.(true); }
    if (this.tiled && !this.lastPosSave) this.lastPosSave = now;
  }

  // ---------- blokken aanwijzen ----------
  raycast(maxD = 7) {
    const o = this.eye.lengthSq() ? this.eye : this.camera.position, d = new THREE.Vector3();
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
    if (this.aboardStep || this.aboard) { this.target = null; this.highlight.visible = false; return; }
    this.target = this.raycast();
    // interactie: kijk je naar iets wat je kan bedienen? (E of ✋)
    const t = this.target, ex = this.eye;
    const act = t && (t.x + 0.5 - ex.x) ** 2 + (t.y + 0.5 - ex.y) ** 2 + (t.z + 0.5 - ex.z) ** 2 < 25 ? actionFor(this, t) : null;
    if ((act && act.label) !== (this.action && this.action.label)) {
      const hint = document.getElementById('use-hint'); if (hint) { hint.hidden = !act; if (act) hint.textContent = (this.touch ? '✋ ' : 'E · ') + act.label; }
      document.getElementById('t-use')?.classList.toggle('show', !!act);
    }
    this.action = act;
    if (this.target) {
      this.highlight.visible = true;
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else this.highlight.visible = false;
  }
  act(kind) {
    const t = this.target || this.raycast();
    if (!t) return;
    this.builder.begin();
    try { this.act2(kind, t); } finally { this.builder.commit(); }
  }
  act2(kind, t) {
    if (kind === 'break') {
      if (t.b === B.BEDROCK) return;
      this.builder.set(t.x, t.y, t.z, 0);
      this.remeshAround(t.x, t.z, t.y);
      this.missions.add('broken');
    } else if (kind === 'place') {
      const x = t.x + t.n[0], y = t.y + t.n[1], z = t.z + t.n[2];
      if (!this.world.inside(x, z) || y < 0) return;
      const cur = this.world.get(x, y, z);
      if (cur && cur !== B.WATER) return;
      const b = this.hotbar[this.slot];
      if (!this.builder.set(x, y, z, b)) return;
      if (IS_SOLID[b]) {
        const p = this.player.pos;
        if (this.collides(p.x, p.y, p.z)) { this.builder.set(x, y, z, cur); return; }
      }
      this.remeshAround(x, z, y);
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
    this.dirty = true; this.lastEditAt = performance.now();
    this.updateTarget();
  }

  // ---------- HUD ----------
  updateHud(force) {
    if (this.aboardStep) return; // aan boord: na de stap (in wereldcoördinaten)
    const now = performance.now();
    if (!force && now - (this.hudT || 0) < 200) return;
    this.hudT = now;
    const p = this.player, m = this.meta, fly = p.fly ? ` · ✈ ${FLY_NAMES[this.flyLevel || 0]}${this.boost ? ' + boost' : ''}` : '';
    const sc = (m.real && m.real.scale) || 1;
    const h = Math.floor((p.pos.y - (m.ground ?? GROUND)) / sc);
    if (m.proc) {
      const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const dir = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'][Math.round(deg / 45) % 8];
      this.ui.coords.textContent = `x ${Math.floor(p.pos.x)} · z ${Math.floor(p.pos.z)} · hoogte ${h} m${this.gnmiNow && this.isGreen() ? ` · ${this.gnmiNow.icon} ${Math.round(this.gnmiNow.temp)} °C` : ''}${this.wallet && this.isGreen() ? ` · 💰 ${Math.round(this.wallet.balance)} VC` : ''}`;
      const zn = this.tiled && this.tiled.spec.zoneName ? this.tiled.spec.zoneName : zoneName;
      const mt = this.mega && this.mega.hudText();
      const zt = mt || zn(p.pos.x, p.pos.z);
      this.ui.place.textContent = hudSafe(this.ride ? this.rideInfo || '🚡 Kabelbaan' : `${zt && typeof zt === 'string' ? zt + ' · ' : ''}kijkrichting ${dir}${fly}`);
      return;
    }
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
    if (p) { this.missions.render(document.getElementById('missions')); const gb = document.getElementById('btn-gnmi'); if (gb) gb.hidden = !this.isGreen(); const vb = document.getElementById('btn-vc'); if (vb) vb.hidden = !this.isGreen(); const mpb = document.getElementById('btn-megaplan'); if (mpb) mpb.hidden = !this.mega; const omb = document.getElementById('btn-ovmap'); if (omb) omb.hidden = !this.mega; this.showOverlay('pause'); this.ui.onSave?.(false); }
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
    const r = q === 'fast' ? 1 : q === 'sharp' || q === 'ultra' ? Math.min(dpr, 2) : Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(Math.max(0.6, r * (this.tune ? this.tune.scale : 1)));
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
    // grafische profielen: kijkafstand, verre gebouwen, scherpte en schaduwen in één keer
    const prof = document.getElementById('set-profile');
    if (prof) {
      prof.value = this.settings.profile || '';
      if (!prof.dataset.bound) { prof.dataset.bound = '1'; prof.addEventListener('change', () => {
        const P = { laag: { quality: 'fast', shadows: false, view: 96, lod: 800 }, gemiddeld: { quality: 'normal', shadows: false, view: 160, lod: 1600 },
          hoog: { quality: 'normal', shadows: true, view: 224, lod: 2600 }, ultra: { quality: 'ultra', shadows: true, view: 320, lod: 4000 } }[prof.value];
        this.settings.profile = prof.value;
        if (P) Object.assign(this.settings, P);
        saveSettings(this.settings); this.applySettings(); this.applyQuality(); this.updateTiles?.(true);
      }); }
    }
    const ql = document.getElementById('set-quality');
    if (ql) {
      ql.value = this.settings.quality || 'normal';
      if (!ql.dataset.bound) { ql.dataset.bound = '1'; ql.addEventListener('change', () => { this.settings.quality = ql.value; saveSettings(this.settings); this.applyQuality(); }); }
    }
    const wSel = document.getElementById('set-weather');
    if (wSel) { wSel.value = this.isGreen() && !this.settings.weatherSet ? 'gnmi' : this.settings.weather || 'clear'; if (!wSel.dataset.bound) { wSel.dataset.bound = '1'; wSel.addEventListener('change', () => { this.settings.weather = wSel.value; this.settings.weatherSet = true; saveSettings(this.settings); }); } }
    const fov = document.getElementById('set-fov');
    if (fov) {
      fov.value = this.settings.fov || 75; document.getElementById('set-fov-label').textContent = `${fov.value}°`; this.camera.fov = +fov.value; this.camera.updateProjectionMatrix();
      if (!fov.dataset.bound) { fov.dataset.bound = '1'; fov.addEventListener('input', () => { this.settings.fov = +fov.value; document.getElementById('set-fov-label').textContent = `${fov.value}°`; this.camera.fov = +fov.value; this.camera.updateProjectionMatrix(); saveSettings(this.settings); }); }
    }
    const camSel = document.getElementById('set-cam');
    if (camSel) { camSel.value = this.settings.cam || 'first'; if (!camSel.dataset.bound) { camSel.dataset.bound = '1'; camSel.addEventListener('change', () => { this.settings.cam = camSel.value; saveSettings(this.settings); }); } }
    const look = { ...DEFAULT_LOOK, ...(this.settings.look || {}) };
    for (const k of ['shirt', 'pants', 'skin', 'hair', 'shoes', 'hat', 'backpack']) {
      const el = document.getElementById('look-' + k); if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!look[k]; else el.value = look[k];
      if (!el.dataset.bound) {
        el.dataset.bound = '1';
        el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
          this.settings.look = { ...DEFAULT_LOOK, ...(this.settings.look || {}), [k]: el.type === 'checkbox' ? el.checked : el.value };
          this.avatar.setLook(this.settings.look); saveSettings(this.settings);
        });
      }
    }
    const ambEl = document.getElementById('set-ambient');
    if (ambEl) { ambEl.checked = this.settings.ambient !== false; if (!ambEl.dataset.bound) { ambEl.dataset.bound = '1'; ambEl.addEventListener('change', () => { this.settings.ambient = ambEl.checked; saveSettings(this.settings); if (ambEl.checked) this.ambient?.start(); }); } }
    const fpsEl = document.getElementById('set-fps');
    if (fpsEl) { fpsEl.checked = !!this.settings.fps; if (!fpsEl.dataset.bound) { fpsEl.dataset.bound = '1'; fpsEl.addEventListener('change', () => { this.settings.fps = fpsEl.checked; saveSettings(this.settings); }); } }
    for (const [id, key] of [['set-shadows', 'shadows'], ['set-auto', 'auto']]) {
      const el = document.getElementById(id); if (!el) continue;
      el.checked = this.settings[key] !== false;
      if (!el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('change', () => { this.settings[key] = el.checked; if (key === 'auto' && !el.checked) { this.tune = null; this.autoLow = false; this.applyQuality(); } saveSettings(this.settings); }); }
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
        // E: bedienen waar je naar kijkt (deur, lift, licht, tv, stoel…); anders de inventaris
        if (!this.invOpen && this.active() && this.action && !e.repeat) { this.useAction(); return; }
        if (this.invOpen) this.closeInventory(); else if (this.active()) this.openInventory();
        return;
      }
      // kaart (M) ook vanuit het pauzemenu of 'Klik om te spelen' (muis vrij op een laptop)
      if (e.code === 'KeyM' && !e.repeat && !this.active() && !this.invOpen) { e.preventDefault(); this.openMap(); return; }
      if (!this.active()) return;
      this.keys.add(e.code);
      if (this.drive && !e.repeat && this.drive.key(e.code)) { e.preventDefault(); return; }
      if (!this.drive && !e.repeat && this.builder.key(e)) { e.preventDefault(); return; }
      if (this.drive) { if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); return; }
      if (e.code === 'KeyH' && !e.repeat) { this.enterVehicle('drive'); return; }
      if (e.code === 'KeyJ' && !e.repeat) { this.enterVehicle('passenger'); return; }
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
      if (e.code === 'KeyG' && !e.repeat) this.toggleRide();
      if (e.code === 'KeyL' && !e.repeat) this.toggleFlash();
      if (e.code === 'KeyV' && !e.repeat && !this.buildKeys?.(e)) this.cycleCamera();
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.photo) this.savePhoto();
      if (e.code === 'F3' && !e.repeat) { e.preventDefault(); this.settings.fps = !this.settings.fps; saveSettings(this.settings); const f = document.getElementById('set-fps'); if (f) f.checked = this.settings.fps; return; }
      if (e.code === 'KeyT' && !e.repeat) { this.settings.hour = (Math.floor(this.settings.hour) + 3) % 24; this.syncTimeUi(); saveSettings(this.settings); this.toast(`🕒 ${String(Math.floor(this.settings.hour)).padStart(2, '0')}:00`); }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyW') this.boost = false; });
    window.addEventListener('blur', () => this.keys.clear());
    ui.canvas.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      const s = 0.0022 * this.settings.sens;
      if (!this.player) return;
      this.player.yaw -= e.movementX * s;
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - e.movementY * s));
    });
    ui.canvas.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return;
      if (this.drive) return;
      if (this.builder.click(e.button)) return;
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
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { ui.touch.look.setPointerCapture(e.pointerId); } catch { /* geen actieve aanraking */ }
    });
    ui.touch.look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId || !this.player) return; // (nog) geen wereld geladen
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
    document.getElementById('btn-gnmi')?.addEventListener('click', () => this.showGnmi());
    document.getElementById('btn-vc')?.addEventListener('click', () => this.showWallet());
    document.getElementById('vc-close')?.addEventListener('click', () => this.resume());
    document.getElementById('gnmi-close')?.addEventListener('click', () => this.resume());
    document.getElementById('t-shot')?.addEventListener('click', () => this.savePhoto());
    document.getElementById('t-ride')?.addEventListener('click', () => this.toggleRide());
    document.getElementById('t-use')?.addEventListener('click', (e) => { e.stopPropagation(); this.useAction(); });
    document.getElementById('t-cam')?.addEventListener('click', () => this.cycleCamera());
    document.getElementById('t-build')?.addEventListener('click', () => this.builder.toggle());
    document.getElementById('t-flash')?.addEventListener('click', () => this.toggleFlash());
    // voertuigen op de telefoon
    const choice = document.getElementById('drive-choice');
    document.getElementById('t-drive')?.addEventListener('click', () => { if (choice) choice.hidden = !choice.hidden; });
    document.getElementById('dc-drive')?.addEventListener('click', () => this.enterVehicle('drive'));
    document.getElementById('dc-ride')?.addEventListener('click', () => this.enterVehicle('passenger'));
    document.getElementById('dc-cancel')?.addEventListener('click', () => { choice.hidden = true; });
    for (const [id, flag] of [['dp-up', 'padUp'], ['dp-down', 'padDown'], ['dp-left', 'padLeft'], ['dp-right', 'padRight'], ['dp-stop', 'padStop']]) {
      const el = document.getElementById(id); if (!el) continue;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this[flag] = true; });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { this[flag] = false; });
    }
    for (const [id, flag] of [['dp-plus', 'padPlus'], ['dp-minus', 'padMinus']]) {
      const el = document.getElementById(id); if (!el) continue;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this[flag] = true; });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { this[flag] = false; });
    }
    for (const [id, code] of [['dp-flaps', 'KeyF'], ['dp-gear', 'KeyG'], ['dp-doors', 'KeyQ'], ['dp-ann', 'KeyN'], ['dp-indl', 'KeyZ'], ['dp-indr', 'KeyC'], ['dp-rev', 'KeyR'], ['dp-exit', 'KeyH'], ['dp-cam', 'KeyV']]) {
      document.getElementById(id)?.addEventListener('click', () => this.drive?.key(code));
    }
    document.getElementById('t-photo-exit')?.addEventListener('click', () => this.togglePhoto(false));
    ui.minimap?.addEventListener('click', () => this.openMap());
    document.getElementById('btn-map')?.addEventListener('click', () => this.openMap());
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
    a.href = url; a.download = `terranova-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    this.toast('📷 Foto opgeslagen');
  }
  toast(t, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = t; el.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { el.hidden = true; }, ms || (t.includes('\n') ? 7000 : 1600));
  }

  playerState() {
    const p = this.player;
    return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly };
  }
}

function freeArray() { this.array = null; }
const FLY_SPEEDS = [12, 40, 120];
const FLY_NAMES = ['normaal vliegen (12 m/s)', 'snel vliegen (40 m/s)', 'turbo (120 m/s)'];

// nooit 'undefined', 'null', 'NaN' of '[object Object]' in de interface: zulke stukjes weglaten
export function hudSafe(t) { return String(t ?? '').replace(/(^|\s·\s)(undefined|null|NaN|\[object Object\])(?=\s·\s|$)/g, '$1').replace(/\b(undefined|null|\[object Object\])\b/g, '').replace(/(\s·\s){2,}/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim(); }
function loadSettings() {
  const phone = matchMedia('(pointer: coarse)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const def = { view: ios ? 80 : phone ? 96 : 140, sens: 1, hour: 13, cycle: false, lod: ios ? 800 : phone ? 1000 : 2000, quality: phone ? 'normal' : 'sharp' };
  let st = def;
  try { st = { ...def, ...JSON.parse(localStorage.getItem('blokstad-settings') || '{}') }; } catch { /* standaard */ }
  if (phone) st.lod = Math.min(st.lod, 1200); // telefoons: verre gebouwen beperken (geheugen)
  return st;
}
function saveSettings(s) { try { localStorage.setItem('blokstad-settings', JSON.stringify(s)); } catch { /* geen opslag */ } }
