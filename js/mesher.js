// Greedy mesher: zet een chunk van 16×16 kolommen om in zo weinig mogelijk vlakken.
import { B, IS_OPAQUE } from './blocks.js';
import { FACE_TILE, ATLAS_COLS } from './textures.js';

export const CS = 16;
const AO_LEVEL = [0.45, 0.65, 0.82, 1.0];
// schaduw per richting: index a*2 + (s>0?0:1)
const SHADE = [0.82, 0.82, 1.0, 0.55, 0.68, 0.68];

function newBuf() { return { pos: [], uv: [], tile: [], light: [], idx: [], n: 0 }; }

export function meshChunk(world, cx, cz) {
  const { size, H, vox } = world;
  const X0 = cx * CS, Z0 = cz * CS;
  const sx = Math.min(CS, size - X0), sz = Math.min(CS, size - Z0);
  const hy = Math.min(H, world.chunkTop(cx, cz) + 2);
  const dims = [sx, hy, sz];

  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= H || x < 0 || z < 0 || x >= size || z >= size) return 0;
    return vox[(z * size + x) * H + y];
  };
  const opaque = (x, y, z) => {
    if (y < 0) return 1;
    if (y >= H || x < 0 || z < 0 || x >= size || z >= size) return 0;
    return IS_OPAQUE[vox[(z * size + x) * H + y]];
  };

  const out = { opaque: newBuf(), trans: newBuf() };
  const p = [0, 0, 0], c = [0, 0, 0];

  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const du = dims[u], dv = dims[v];
    const ux = u === 0 ? 1 : 0, uy = u === 1 ? 1 : 0, uz = u === 2 ? 1 : 0;
    const vx = v === 0 ? 1 : 0, vy = v === 1 ? 1 : 0, vz = v === 2 ? 1 : 0;
    const mask = new Int32Array(du * dv);
    for (let s = 1; s >= -1; s -= 2) {
      const faceTile = a === 1 ? (s > 0 ? 0 : 2) : 1;
      const shade = SHADE[a * 2 + (s > 0 ? 0 : 1)];
      for (let i = 0; i < dims[a]; i++) {
        let n = 0;
        p[a] = i;
        for (let k = 0; k < dv; k++) {
          p[v] = k;
          for (let j = 0; j < du; j++, n++) {
            p[u] = j;
            const gx = X0 + p[0], gy = p[1], gz = Z0 + p[2];
            const b = vox[(gz * size + gx) * H + gy];
            if (!b) { mask[n] = 0; continue; }
            c[0] = gx; c[1] = gy; c[2] = gz; c[a] += s;
            const nb = get(c[0], c[1], c[2]);
            if (nb && (IS_OPAQUE[nb] || nb === b)) { mask[n] = 0; continue; }
            // ambient occlusion op de 4 hoeken
            let ao = 0;
            if (IS_OPAQUE[b]) {
              const X = c[0], Y = c[1], Z = c[2];
              for (let q = 0; q < 4; q++) {
                const cu = (q === 1 || q === 2) ? 1 : -1, cv = (q >= 2) ? 1 : -1;
                const s1 = opaque(X + cu * ux, Y + cu * uy, Z + cu * uz);
                const s2 = opaque(X + cv * vx, Y + cv * vy, Z + cv * vz);
                const cr = opaque(X + cu * ux + cv * vx, Y + cu * uy + cv * vy, Z + cu * uz + cv * vz);
                const lvl = (s1 && s2) ? 0 : 3 - (s1 + s2 + cr);
                ao |= lvl << (q * 2);
              }
            } else ao = 0xff;
            mask[n] = b | (ao << 8);
          }
        }
        // greedy samenvoegen
        n = 0;
        for (let k = 0; k < dv; k++) {
          for (let j = 0; j < du;) {
            const m = mask[n];
            if (!m) { j++; n++; continue; }
            let w = 1;
            while (j + w < du && mask[n + w] === m) w++;
            let h = 1, done = false;
            while (k + h < dv) {
              for (let q = 0; q < w; q++) if (mask[n + q + h * du] !== m) { done = true; break; }
              if (done) break;
              h++;
            }
            const b = m & 0xff, ao = (m >> 8) & 0xff;
            p[a] = i + (s > 0 ? 1 : 0); p[u] = j; p[v] = k;
            emit(out, b, a, u, v, s, X0 + p[0], p[1], Z0 + p[2], w, h, ao, faceTile, shade);
            for (let hh = 0; hh < h; hh++) for (let q = 0; q < w; q++) mask[n + q + hh * du] = 0;
            j += w; n += w;
          }
        }
      }
    }
  }
  return out;
}

const V = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
function emit(out, b, a, u, v, s, ox, oy, oz, w, h, ao, faceTile, shade) {
  const buf = (b === B.GLASS || b === B.DARKGLASS || b === B.WATER) ? out.trans : out.opaque;
  const o = [ox, oy, oz];
  for (let q = 0; q < 4; q++) {
    const vt = V[q];
    vt[0] = o[0]; vt[1] = o[1]; vt[2] = o[2];
    if (q === 1 || q === 2) vt[u] += w;
    if (q >= 2) vt[v] += h;
  }
  const yOff = (b === B.WATER && a === 1 && s > 0) ? -0.12 : 0;
  const tile = FACE_TILE[b * 3 + faceTile];
  const tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS);
  const base = buf.n;
  for (let q = 0; q < 4; q++) {
    const vt = V[q];
    buf.pos.push(vt[0], vt[1] + yOff, vt[2]);
    // lokale textuurcoördinaten: horizontaal = u, verticaal = y
    if (a === 0) buf.uv.push(vt[2], vt[1]);
    else if (a === 2) buf.uv.push(vt[0], vt[1]);
    else buf.uv.push(vt[0], vt[2]);
    buf.tile.push(tx, ty);
    const lvl = ao === 0xff ? 3 : (ao >> (q * 2)) & 3;
    buf.light.push(shade * AO_LEVEL[lvl]);
  }
  const a0 = ao === 0xff ? 3 : ao & 3, a1 = ao === 0xff ? 3 : (ao >> 2) & 3;
  const a2 = ao === 0xff ? 3 : (ao >> 4) & 3, a3 = ao === 0xff ? 3 : (ao >> 6) & 3;
  const flip = a0 + a2 < a1 + a3;
  if (s > 0) {
    if (!flip) buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  } else {
    if (!flip) buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else buf.idx.push(base + 1, base + 3, base + 2, base + 1, base, base + 3);
  }
  buf.n += 4;
}
