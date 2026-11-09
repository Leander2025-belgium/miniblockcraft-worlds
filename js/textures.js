// Tekent alle bloktexturen (16×16 pixels) procedureel op één atlas-canvas.
import { BLOCKS } from './blocks.js';

export const TILE = 16;
export const ATLAS_COLS = 8;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

const clamp = v => Math.max(0, Math.min(255, v | 0));

const painters = {};
function noiseFill(px, r, base, amp, alpha = 255) {
  for (let i = 0; i < TILE * TILE; i++) {
    const n = (r() - 0.5) * amp;
    px(i % TILE, (i / TILE) | 0, base[0] + n, base[1] + n, base[2] + n, alpha);
  }
}
function solid(base, amp = 14) { return (px, r) => noiseFill(px, r, base, amp); }

painters.stone = solid([125, 125, 125], 30);
painters.dirt = solid([134, 96, 67], 28);
painters.sand = solid([220, 205, 150], 20);
painters.bedrock = solid([50, 50, 50], 50);
painters.asphalt = solid([58, 60, 64], 16);
painters.line_white = solid([225, 225, 222], 12);
painters.line_yellow = solid([228, 188, 40], 14);
painters.paint_red = solid([190, 40, 40], 12);
painters.paint_blue = solid([40, 80, 180], 12);
painters.paint_green = solid([40, 140, 70], 12);
painters.paint_orange = solid([230, 130, 30], 12);
painters.paint_black = solid([30, 30, 34], 10);
painters.paint_white = solid([235, 235, 235], 10);
painters.plaster = solid([228, 224, 214], 10);
painters.post = solid([50, 54, 58], 12);
painters.grass_top = solid([96, 160, 64], 30);
painters.hedge = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = r(); const v = n < 0.2 ? 0.7 : 1;
    px(x, y, 44 * v + n * 20, 100 * v + n * 30, 36 * v + n * 10);
  }
};
painters.leaves = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = r(); const v = n < 0.25 ? 0.65 : 1;
    px(x, y, 56 * v + n * 20, 120 * v + n * 40, 40 * v + n * 12);
  }
};
painters.grass_side = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = 3 + ((x * 7 + 3) % 3);
    const n = (r() - 0.5) * 28;
    if (y >= TILE - edge) px(x, y, 96 + n, 160 + n, 64 + n);
    else px(x, y, 134 + n, 96 + n, 67 + n);
  }
};
painters.flowers = (px, r) => {
  painters.grass_top(px, r);
  const cols = [[230, 60, 60], [250, 220, 60], [240, 240, 255], [180, 90, 220]];
  for (let i = 0; i < 6; i++) {
    const x = (r() * 14) | 0, y = (r() * 14) | 0, c = cols[(r() * cols.length) | 0];
    px(x, y, ...c); px(x + 1, y, ...c); px(x, y + 1, ...c); px(x + 1, y + 1, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
  }
};
painters.sidewalk = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 14;
    const line = x % 8 === 0 || y % 8 === 0;
    const v = line ? 140 : 172;
    px(x, y, v + n, v - 2 + n, v - 8 + n);
  }
};
painters.tile = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 8;
    const chk = ((x >> 3) + (y >> 3)) % 2 === 0;
    const line = x % 8 === 0 || y % 8 === 0;
    const v = line ? 160 : chk ? 206 : 190;
    px(x, y, v + n, v - 4 + n, v - 12 + n);
  }
};
function brickPainter(base, mortar) {
  return (px, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = y >> 2;
      const off = row % 2 === 0 ? 0 : 4;
      const m = y % 4 === 0 || (x + off) % 8 === 0;
      const n = (r() - 0.5) * 22;
      if (m) px(x, y, mortar[0] + n * 0.3, mortar[1] + n * 0.3, mortar[2] + n * 0.3);
      else px(x, y, base[0] + n, base[1] + n * 0.6, base[2] + n * 0.5);
    }
  };
}
painters.brick = brickPainter([160, 72, 54], [190, 180, 170]);
painters.yellowbrick = brickPainter([204, 170, 110], [150, 140, 125]);
painters.cobble = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const cx = ((x + (((y >> 2) % 2) * 2)) % 5), cy = y % 4;
    const m = cx === 0 || cy === 0;
    const n = (r() - 0.5) * 26;
    const v = m ? 80 : 118;
    px(x, y, v + n, v - 2 + n, v - 6 + n);
  }
};
painters.gravel = (px, r) => {
  for (let i = 0; i < TILE * TILE; i++) {
    const n = r();
    const v = n < 0.3 ? 110 : n < 0.7 ? 150 : 175;
    px(i % TILE, (i / TILE) | 0, v, v - 8, v - 18);
  }
};
painters.concrete = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 10;
    const seam = y === 0 || x === 0;
    const v = seam ? 160 : 182;
    px(x, y, v + n, v + n, v - 4 + n);
  }
};
painters.metal = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 8;
    const v = x % 4 === 0 ? 138 : x % 4 === 1 ? 162 : 152;
    px(x, y, v + n, v + 6 + n, v + 14 + n);
  }
};
painters.planks = (px, r) => {
  for (let y = 0; y < TILE; y++) {
    const rowShade = (r() - 0.5) * 20;
    for (let x = 0; x < TILE; x++) {
      const n = (r() - 0.5) * 12 + rowShade;
      const seam = y % 4 === 0 || (x === ((y >> 2) * 5 + 3) % 16);
      const v = seam ? 0.7 : 1;
      px(x, y, (168 + n) * v, (128 + n) * v, (78 + n) * v);
    }
  }
};
painters.log = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 18;
    const v = x % 4 === 0 ? 0.7 : 1;
    px(x, y, (100 + n) * v, (76 + n) * v, (48 + n) * v);
  }
};
painters.log_top = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const n = (r() - 0.5) * 12;
    if (d > 7) px(x, y, 100 + n, 76 + n, 48 + n);
    else { const ring = Math.floor(d) % 2 === 0; const v = ring ? 176 : 150; px(x, y, v + n, v * 0.75 + n, v * 0.45 + n); }
  }
};
function roofPainter(base) {
  return (px, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = (r() - 0.5) * 18;
      const v = y % 4 === 3 ? 0.65 : (x + ((y >> 2) % 2) * 2) % 4 === 0 ? 0.85 : 1;
      px(x, y, (base[0] + n) * v, (base[1] + n) * v, (base[2] + n) * v);
    }
  };
}
painters.roof_red = roofPainter([168, 60, 44]);
painters.roof_dark = roofPainter([70, 72, 80]);
painters.glass = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    const shine = (x + y === 10 || x + y === 11 || x + y === 18) && !frame;
    if (frame) px(x, y, 220, 228, 232, 255);
    else if (shine) px(x, y, 240, 250, 255, 150);
    else px(x, y, 170, 210, 235, 80);
  }
};
painters.darkglass = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const frame = x === 0 || y === 0;
    const shine = (x + y === 12 || x + y === 13) && !frame;
    if (frame) px(x, y, 70, 74, 80, 255);
    else if (shine) px(x, y, 150, 190, 220, 220);
    else px(x, y, 40 + y * 2, 70 + y * 2, 105 + y * 2, 205);
  }
};
painters.water = (px, r) => {
  for (let i = 0; i < TILE * TILE; i++) {
    const n = (r() - 0.5) * 20;
    px(i % TILE, (i / TILE) | 0, 45 + n, 100 + n, 195 + n, 175);
  }
};
painters.lamp = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const frame = x < 2 || y < 2 || x > 13 || y > 13;
    const n = (r() - 0.5) * 10;
    if (frame) px(x, y, 60, 62, 66);
    else px(x, y, 255, 236 + n, 160 + n);
  }
};

export const TILE_NAMES = Object.keys(painters);
export const TILE_INDEX = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i]));
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length / ATLAS_COLS);

export function drawAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  TILE_NAMES.forEach((name, idx) => {
    const ox = (idx % ATLAS_COLS) * TILE, oy = Math.floor(idx / ATLAS_COLS) * TILE;
    const r = rng(idx * 9973 + 17);
    // y=0 is de ONDERKANT van de tegel (zodat de textuur rechtop staat)
    const px = (x, y, rr, g, b, a = 255) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = ((oy + (TILE - 1 - y)) * canvas.width + ox + x) * 4;
      img.data[i] = clamp(rr); img.data[i + 1] = clamp(g); img.data[i + 2] = clamp(b); img.data[i + 3] = clamp(a);
    };
    painters[name](px, r);
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Per blok en per vlak (0 boven, 1 zijkant, 2 onder) het tegelnummer
export const FACE_TILE = new Uint16Array(256 * 3);
for (const b of BLOCKS) {
  if (!b.tex) continue;
  const top = b.tex[0], side = b.tex[1] || top, bottom = b.tex[2] || top;
  FACE_TILE[b.id * 3] = TILE_INDEX[top];
  FACE_TILE[b.id * 3 + 1] = TILE_INDEX[side];
  FACE_TILE[b.id * 3 + 2] = TILE_INDEX[bottom];
}

// CSS-stijl om een blok-icoon te tonen vanuit de atlas (data-URL)
export function iconStyle(atlasUrl, blockId, size = 32) {
  const t = FACE_TILE[blockId * 3 + 1];
  const scale = size / TILE;
  const x = (t % ATLAS_COLS) * TILE * scale, y = Math.floor(t / ATLAS_COLS) * TILE * scale;
  return `background-image:url(${atlasUrl});background-size:${ATLAS_COLS * TILE * scale}px ${ATLAS_ROWS * TILE * scale}px;background-position:-${x}px -${y}px;image-rendering:pixelated;`;
}
