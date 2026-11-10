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
function ashlarPainter(base, line) {
  return (px, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = y >> 2, off = row % 2 ? 4 : 0;
      const m = y % 4 === 0 || (x + off) % 8 === 0;
      const n = (r() - 0.5) * 12, tone = ((row * 7 + ((x + off) >> 3) * 3) % 5) * 3;
      if (m) px(x, y, line[0] + n * 0.4, line[1] + n * 0.4, line[2] + n * 0.4);
      else px(x, y, base[0] + n + tone, base[1] + n + tone, base[2] + n + tone);
    }
  };
}
painters.ashlar = ashlarPainter([150, 150, 146], [112, 112, 110]);
painters.limestone = ashlarPainter([200, 186, 156], [160, 148, 124]);
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
function glassPainter(frame, inner, alpha, shineA) {
  return (px, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const fr = x === 0 || y === 0;
      const shine = (x + y === 12 || x + y === 13 || x + y === 20) && !fr;
      const g = (y / TILE) * 18;
      if (fr) px(x, y, frame[0], frame[1], frame[2], 255);
      else if (shine) px(x, y, 235, 245, 250, shineA);
      else px(x, y, inner[0] + g, inner[1] + g, inner[2] + g, alpha);
    }
  };
}
painters.glass_green = glassPainter([226, 230, 232], [120, 178, 168], 175, 210);
painters.mirror = glassPainter([226, 230, 234], [126, 164, 192], 230, 255);
painters.glass_blue = glassPainter([170, 176, 184], [62, 112, 170], 195, 230);
function panelPainter(base, seam) {
  return (px, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = (r() - 0.5) * 6;
      const sm = x === 0 || y === 0 || y === 8;
      const c = sm ? seam : base;
      px(x, y, c[0] + n, c[1] + n, c[2] + n);
    }
  };
}
painters.panel_white = panelPainter([232, 234, 236], [196, 200, 204]);
painters.panel_dark = panelPainter([58, 62, 68], [38, 40, 44]);
painters.brick_dark = brickPainter([100, 56, 44], [150, 140, 130]);
painters.terracotta = brickPainter([190, 105, 70], [214, 190, 160]);
painters.plaster_beige = solid([222, 204, 170], 10);
painters.plaster_grey = solid([170, 170, 168], 10);
painters.plaster_pink = solid([226, 180, 170], 10);
painters.copper = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 26, seam = x % 5 === 0;
    const v = seam ? 0.8 : 1;
    px(x, y, (96 + n) * v, (160 + n) * v, (140 + n * 0.6) * v);
  }
};
painters.red_sandstone = ashlarPainter([166, 86, 72], [130, 66, 56]);
painters.red_granite = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = r(), v = n < 0.15 ? 0.65 : n > 0.9 ? 1.25 : 1;
    const seam = y === 0 || x === 0;
    px(x, y, 128 * v * (seam ? 0.8 : 1), 66 * v * (seam ? 0.8 : 1), 58 * v * (seam ? 0.8 : 1));
  }
};
painters.half_timber = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 8;
    const beam = x < 2 || y < 2 || Math.abs(x - y) < 1.5 && x > 3 && x < 13;
    if (beam) px(x, y, 70 + n, 44 + n, 30 + n);
    else px(x, y, 222 + n, 214 + n, 196 + n);
  }
};
painters.snow = solid([238, 242, 248], 10);
painters.snow_side = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = 4 + ((x * 5 + 1) % 3);
    const n = (r() - 0.5) * 16;
    if (y < edge) px(x, y, 238 + n, 242 + n, 248 + n);
    else px(x, y, 125 + n * 2, 125 + n * 2, 125 + n * 2);
  }
};
painters.ballast = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = r(), v = n < 0.3 ? 0.72 : n > 0.85 ? 1.18 : 1;
    px(x, y, 122 * v, 114 * v, 104 * v);
  }
};
painters.spruce = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = r(); const v = n < 0.3 ? 0.62 : 1;
    px(x, y, 28 * v + n * 12, 72 * v + n * 26, 44 * v + n * 12);
  }
};
painters.birch = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (r() - 0.5) * 10, mark = (y % 5 === 2 && (x * 3 + y) % 7 < 3) || (r() < 0.04);
    if (mark) px(x, y, 40 + n, 38 + n, 36 + n); else px(x, y, 222 + n, 218 + n, 208 + n);
  }
};
painters.birch_top = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const d = Math.hypot(x - 7.5, y - 7.5), n = (r() - 0.5) * 10; if (d > 6.5) px(x, y, 218 + n, 214 + n, 204 + n); else px(x, y, 196 + n, 170 + n, 120 + n); } };
painters.birch_leaves = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = r(); const v = n < 0.25 ? 0.7 : 1; px(x, y, (118 + n * 30) * v, (168 + n * 30) * v, (70 + n * 10) * v); }
};
painters.pine_leaves = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = r(); const v = n < 0.3 ? 0.62 : 1; px(x, y, (40 + n * 14) * v, (90 + n * 24) * v, (50 + n * 10) * v); }
};
painters.mossy_stone = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = r(), moss = n < 0.45; const k = (r() - 0.5) * 20; if (moss) px(x, y, 82 + k, 110 + k, 62 + k); else px(x, y, 118 + k, 118 + k, 114 + k); }
};
painters.dark_planks = (px, r) => {
  for (let y = 0; y < TILE; y++) { const rs = (r() - 0.5) * 16; for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 10 + rs; const seam = y % 4 === 0 || x === ((y >> 2) * 5 + 3) % 16; const v = seam ? 0.65 : 1; px(x, y, (86 + n) * v, (60 + n) * v, (40 + n) * v); } }
};
painters.marble = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const v = Math.sin((x * 0.9 + y * 0.45) + Math.sin(y * 0.7) * 2.2); const vein = v > 0.92 ? 0.78 : 1; const n = (r() - 0.5) * 6; px(x, y, (234 + n) * vein, (232 + n) * vein, (228 + n) * vein); }
};
painters.granite = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = r(); const v = n < 0.15 ? 0.6 : n > 0.88 ? 1.25 : 1; px(x, y, 146 * v, 138 * v, 134 * v); }
};
painters.ice = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const crack = (x + y * 2) % 11 === 0 && r() < 0.7; const n = (r() - 0.5) * 10; px(x, y, (crack ? 230 : 176) + n, (crack ? 240 : 210) + n, (crack ? 250 : 236) + n, 220); }
};
painters.paint_yellow = solid([236, 196, 40], 12);
painters.wool_red = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 14 + ((x + y) % 2 ? 4 : -4); px(x, y, 168 + n, 36 + n * 0.5, 40 + n * 0.5); } };
painters.bookshelf = (px, r) => {
  const cols = [[140, 40, 40], [40, 70, 130], [50, 110, 60], [170, 140, 60], [90, 50, 110]];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const shelf = y === 0 || y === 8 || y === 15 || x === 0 || x === 15;
    if (shelf) { const n = (r() - 0.5) * 10; px(x, y, 120 + n, 84 + n, 50 + n); continue; }
    const c = cols[(x * 7 + (y > 8 ? 3 : 0)) % cols.length], top = (y === 7 || y === 14) && (x % 3 === 0);
    const v = top ? 0.4 : 0.85 + ((x % 2) ? 0.1 : 0); px(x, y, c[0] * v, c[1] * v, c[2] * v);
  }
};
painters.crate = (px, r) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 12; const frame = x < 2 || y < 2 || x > 13 || y > 13 || Math.abs(x - y) < 1.2; const v = frame ? 0.72 : 1; px(x, y, (150 + n) * v, (110 + n) * v, (64 + n) * v); }
};
painters.checker = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const w = ((x >> 3) + (y >> 3)) % 2 === 0; const n = (r() - 0.5) * 6; const v = w ? 228 : 34; px(x, y, v + n, v + n, v + n); } };
painters.roof_green = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 8; const rib = x % 4 === 0 ? 0.75 : 1; px(x, y, (64 + n) * rib, (118 + n) * rib, (88 + n) * rib); } };
painters.solar = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const grid = x % 4 === 0 || y % 4 === 0; const n = (r() - 0.5) * 6; if (grid) px(x, y, 180, 186, 196); else px(x, y, 30 + n, 46 + n + y, 86 + n + y * 2); } };
painters.clay_roof = roofPainter([176, 88, 56]);
painters.deepslate = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 16, band = (y % 4 === 0) ? 0.82 : 1; px(x, y, (74 + n) * band, (74 + n) * band, (82 + n) * band); } };
function orePainter(c) {
  return (px, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = (r() - 0.5) * 26, spot = ((x * 7 + y * 13) % 11 < 2 && (x + y) % 3 !== 0) || r() < 0.06;
      if (spot) px(x, y, c[0] + n * 0.4, c[1] + n * 0.4, c[2] + n * 0.4); else px(x, y, 122 + n, 122 + n, 122 + n);
    }
  };
}
painters.coal_ore = orePainter([30, 30, 32]);
painters.iron_ore = orePainter([214, 170, 140]);
painters.gold_ore = orePainter([246, 214, 70]);
painters.diamond_ore = orePainter([90, 230, 226]);
painters.ladder = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const rail = x < 3 || x > 12, rung = y % 4 === 1 && x >= 3 && x <= 12; const n = (r() - 0.5) * 12; if (rail || rung) px(x, y, 150 + n, 110 + n, 64 + n); else px(x, y, 0, 0, 0, 0); } };
painters.elevator = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 6, seam = x === 7 || x === 8, frame = x === 0 || x === 15 || y === 0 || y === 15; const v = frame ? 120 : seam ? 90 : 176; px(x, y, v + n, v + 4 + n, v + 10 + n); } };
painters.elevator_top = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 6, arrow = Math.abs(x - 7.5) < 4 - Math.abs(y - 8) * 0.5 && y > 3 && y < 13; px(x, y, arrow ? 240 : 150 + n, arrow ? 200 : 156 + n, arrow ? 40 : 164 + n); } };
painters.basalt = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 14, col = x % 5 === 0 ? 0.75 : 1; px(x, y, (54 + n) * col, (54 + n) * col, (60 + n) * col); } };
painters.clay = solid([150, 140, 128], 14);
painters.escalator = (px, r) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const n = (r() - 0.5) * 6, groove = x % 2 === 0, edge = y < 2; px(x, y, edge ? 230 : (groove ? 70 : 104) + n, edge ? 190 : (groove ? 72 : 106) + n, edge ? 40 : (groove ? 78 : 112) + n); } };
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

// Elke tegel krijgt een rand van PAD pixels met de herhaalde inhoud, zodat verkleinde versies (mipmaps)
// geen kleuren van de buurtegel lenen. Zo kan de game op afstand gladde, niet-flikkerende textures tonen.
// De tekenfuncties werken op 16×16; de atlas zelf is 32×32 per blok (scherper), met fijne materiaalkorrel.
export const RES = 32;
export const PAD = 8;
export const CELL = RES + PAD * 2;
// materiaal per tegel: glans, reliëf, weerspiegeling (0..255)
const MATERIAL = {
  glass: [255, 0, 200], darkglass: [255, 0, 220], glass_green: [255, 0, 210], glass_blue: [255, 0, 220], mirror: [255, 0, 255], water: [255, 0, 230], ice: [220, 20, 150],
  metal: [170, 40, 110], copper: [120, 60, 60], solar: [230, 10, 160], paint_red: [110, 0, 30], paint_blue: [110, 0, 30], paint_green: [110, 0, 30], paint_black: [140, 0, 40],
  paint_white: [110, 0, 30], paint_orange: [110, 0, 30], paint_yellow: [110, 0, 30], panel_white: [120, 20, 40], panel_dark: [140, 20, 50], marble: [150, 30, 50], tile: [90, 40, 30],
  checker: [120, 20, 40], snow: [90, 30, 0], asphalt: [60, 90, 45], line_white: [60, 60, 40], line_yellow: [60, 60, 40], cobble: [50, 220, 40], roof_green: [100, 70, 20], lamp: [0, 0, 0],
  brick: [10, 230, 0], brick_dark: [10, 230, 0], yellowbrick: [10, 230, 0], terracotta: [20, 220, 0], ashlar: [10, 240, 0], limestone: [10, 220, 0], red_sandstone: [10, 220, 0],
  stone: [10, 200, 0], granite: [30, 180, 0], mossy_stone: [5, 220, 0], gravel: [5, 230, 0], ballast: [5, 230, 0], dirt: [0, 180, 0], sand: [10, 120, 0], grass_top: [5, 170, 0],
  planks: [20, 200, 0], dark_planks: [20, 200, 0], log: [5, 230, 0], birch: [5, 160, 0], crate: [15, 210, 0], roof_red: [25, 230, 0], roof_dark: [35, 230, 0], clay_roof: [25, 230, 0],
  leaves: [10, 160, 0], birch_leaves: [10, 160, 0], spruce: [5, 160, 0], pine_leaves: [5, 160, 0], hedge: [5, 160, 0], concrete: [15, 110, 0], sidewalk: [20, 140, 0],
  half_timber: [10, 160, 0], bookshelf: [10, 200, 0], wool_red: [0, 150, 0], cobble_dummy: [0, 0, 0],
};
// fijne korrel per materiaal (hoe sterk de 32×32-details variëren)
const GRAIN = { grass_top: 16, dirt: 14, sand: 12, stone: 14, gravel: 10, ballast: 10, granite: 12, mossy_stone: 14, snow: 5, concrete: 7, asphalt: 9, sidewalk: 7,
  leaves: 14, birch_leaves: 14, spruce: 12, pine_leaves: 12, hedge: 12, log: 9, birch: 6, planks: 6, dark_planks: 6, brick: 7, brick_dark: 7, ashlar: 6, cobble: 8, roof_red: 6, roof_dark: 6, clay_roof: 6 };
export function materialTexture(THREE) {
  const n = TILE_NAMES.length, data = new Uint8Array(n * 4);
  TILE_NAMES.forEach((name, i) => { const m = MATERIAL[name] || [20, 100, 0]; data[i * 4] = m[0]; data[i * 4 + 1] = m[1]; data[i * 4 + 2] = m[2]; data[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}
export function drawAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const tile = new Uint8ClampedArray(TILE * TILE * 4), hi = new Uint8ClampedArray(RES * RES * 4);
  TILE_NAMES.forEach((name, idx) => {
    const ox = (idx % ATLAS_COLS) * CELL, oy = Math.floor(idx / ATLAS_COLS) * CELL;
    const r = rng(idx * 9973 + 17);
    tile.fill(0);
    // y=0 is de ONDERKANT van de tegel (zodat de textuur rechtop staat)
    const px = (x, y, rr, g, b, a = 255) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = ((TILE - 1 - y) * TILE + x) * 4;
      tile[i] = clamp(rr); tile[i + 1] = clamp(g); tile[i + 2] = clamp(b); tile[i + 3] = clamp(a);
    };
    painters[name](px, r);
    // naar 32×32: scherpe vormen behouden, natuurlijke materialen iets zachter, met fijne korrel
    const grain = GRAIN[name] ?? 4, soft = grain >= 10 ? 0.35 : 0;
    const at = (x, y, c) => tile[((((y % TILE) + TILE) % TILE) * TILE + (((x % TILE) + TILE) % TILE)) * 4 + c];
    for (let Y = 0; Y < RES; Y++) for (let X = 0; X < RES; X++) {
      const sx = X >> 1, sy = Y >> 1, fx = (X & 1) ? 1 : -1, fy = (Y & 1) ? 1 : -1;
      let k = Math.sin((X + idx * 31) * 12.9898 + (Y + idx * 7) * 78.233) * 43758.5453; k -= Math.floor(k);
      const g = (k - 0.5) * grain;
      const di = (Y * RES + X) * 4;
      for (let c = 0; c < 3; c++) {
        const near = at(sx, sy, c);
        const blur = (near * 2 + at(sx + fx, sy, c) + at(sx, sy + fy, c)) / 4;
        hi[di + c] = clamp(near * (1 - soft) + blur * soft + g);
      }
      hi[di + 3] = at(sx, sy, 3);
    }
    for (let cy = 0; cy < CELL; cy++) for (let cx = 0; cx < CELL; cx++) {
      const sx = ((cx - PAD) % RES + RES) % RES, sy = ((cy - PAD) % RES + RES) % RES;
      const si = (sy * RES + sx) * 4, di = ((oy + cy) * canvas.width + ox + cx) * 4;
      img.data[di] = hi[si]; img.data[di + 1] = hi[si + 1]; img.data[di + 2] = hi[si + 2]; img.data[di + 3] = hi[si + 3];
    }
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
  const scale = size / RES;
  const x = ((t % ATLAS_COLS) * CELL + PAD) * scale, y = (Math.floor(t / ATLAS_COLS) * CELL + PAD) * scale;
  return `background-image:url(${atlasUrl});background-size:${ATLAS_COLS * CELL * scale}px ${ATLAS_ROWS * CELL * scale}px;background-position:-${x}px -${y}px;image-rendering:pixelated;`;
}
