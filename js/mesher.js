// Greedy mesher: zet een chunk van 16×16 kolommen om in zo weinig mogelijk vlakken.
import { B, IS_OPAQUE, IS_TRANSPARENT } from './blocks.js';
import { FACE_TILE, ATLAS_COLS } from './textures.js';

export const CS = 16;
// vloeiend terrein: bovenkanten van deze blokken worden schuine vlakken (stapjes van 1 blok verdwijnen)
export const SMOOTH = new Uint8Array(256);
for (const b of [B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.SNOW, B.STONE, B.ASPHALT, B.LINE_WHITE, B.LINE_YELLOW, B.SIDEWALK, B.COBBLE,
  B.BALLAST, B.FLOWERS, B.MOSSY_STONE, B.GRANITE, B.CLAY, B.TILE]) if (b != null) SMOOTH[b] = 1;
// wat boven een vloeiend oppervlak mag staan (bomen)
export const OVER = new Uint8Array(256);
for (const b of [B.AIR, B.LOG, B.LEAVES, B.SPRUCE, B.PINE_LEAVES, B.BIRCH_LOG, B.BIRCH_LEAVES, B.WATER]) if (b != null) OVER[b] = 1;
const AO_LEVEL = [0.45, 0.65, 0.82, 1.0];
// schaduw per richting: index a*2 + (s>0?0:1)
const SHADE = [0.82, 0.82, 1.0, 0.55, 0.68, 0.68];

function newBuf() { return { pos: [], uv: [], tile: [], light: [], face: [], idx: [], n: 0 }; }

export function meshChunk(world, cx, cz) {
  const { size, H, vox } = world;
  const X0 = cx * CS, Z0 = cz * CS;
  const sx = Math.min(CS, size - X0), sz = Math.min(CS, size - Z0);
  const hy = Math.min(H, world.chunkTop(cx, cz) + 2);
  const dims = [sx, hy, sz];

  // tegels met randinformatie: naast de tegel is er grond tot de hoogte van de buur (geen muur aan de rand)
  const edge = world.edge, y0 = world.y0 || 0;
  const edgeSolid = (x, y, z) => {
    if (!edge || y >= H) return false;
    let e;
    if (x < 0) { if (z < 0 || z >= size) return false; e = edge[z]; }
    else if (x >= size) { if (z < 0 || z >= size) return false; e = edge[size + z]; }
    else if (z < 0) e = edge[2 * size + x];
    else e = edge[3 * size + x];
    return y + y0 <= e;
  };
  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (x < 0 || z < 0 || x >= size || z >= size) return edgeSolid(x, y, z) ? B.STONE : 0;
    if (y >= H) return 0;
    return vox[(z * size + x) * H + y];
  };
  const opaque = (x, y, z) => {
    if (y < 0) return 1;
    if (x < 0 || z < 0 || x >= size || z >= size) return edgeSolid(x, y, z) ? 1 : 0;
    if (y >= H) return 0;
    return IS_OPAQUE[vox[(z * size + x) * H + y]];
  };

  const out = { opaque: newBuf(), trans: newBuf() };
  const p = [0, 0, 0], c = [0, 0, 0];

  // ---------- vloeiend oppervlak: per kolom (ook één kolom rondom) het bovenste grondblok ----------
  const W2 = sx + 2, surf = new Int16Array(W2 * (sz + 2)).fill(-1);
  const sAt = (lx, lz) => surf[(lz + 1) * W2 + lx + 1];
  for (let lz = -1; lz <= sz; lz++) for (let lx = -1; lx <= sx; lx++) {
    const gx = X0 + lx, gz = Z0 + lz;
    let s0 = -1;
    if (gx < 0 || gz < 0 || gx >= size || gz >= size) {
      if (edge && !((gx < 0 || gx >= size) && (gz < 0 || gz >= size))) {
        const e = (gx < 0 ? edge[gz] : gx >= size ? edge[size + gz] : gz < 0 ? edge[2 * size + gx] : edge[3 * size + gx]) - y0;
        if (e >= 0 && e < H) s0 = e;
      }
    } else {
      const ncx = Math.floor(gx / CS), ncz = Math.floor(gz / CS);
      let y = Math.min(H - 1, world.chunkTop(ncx, ncz) + 1);
      const base = (gz * size + gx) * H;
      for (; y >= 0; y--) {
        const b = vox[base + y];
        if (!b || b === B.LEAVES || b === B.SPRUCE || b === B.PINE_LEAVES || b === B.BIRCH_LEAVES || b === B.LOG || b === B.BIRCH_LOG) continue;
        if (SMOOTH[b] && (y + 1 >= H || OVER[vox[base + y + 1]])) s0 = y;
        break;
      }
    }
    surf[(lz + 1) * W2 + lx + 1] = s0;
  }
  // hoogte van een hoekpunt (lx, lz = hoek tussen 4 kolommen) voor een kolom met oppervlak sSelf
  const corner = (lx, lz, sSelf) => {
    let m = -1;
    const S4 = [sAt(lx - 1, lz - 1), sAt(lx, lz - 1), sAt(lx - 1, lz), sAt(lx, lz)];
    for (const v of S4) if (v > m) m = v;
    if (sSelf < m - 1) return sSelf + 1;
    let sum = 0, n = 0;
    for (const v of S4) if (v >= 0 && v >= m - 1) { sum += v + 1; n++; }
    return sum / n;
  };
  const isSmoothTop = (lx, y, lz) => lx >= -1 && lz >= -1 && lx <= sx && lz <= sz && sAt(lx, lz) === y;

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
            const lxx = p[0], lzz = p[2], own = sAt(lxx, lzz);
            if (own === gy) {
              if (a === 1 && s > 0) { mask[n] = 0; continue; } // wordt een schuin vlak
            }
            if (a !== 1 && own >= 0 && gy <= own) {
              // zijkant naar een lagere vloeiende buurkolom: wordt een naadloos rokje
              const nx = lxx + (a === 0 ? s : 0), nz = lzz + (a === 2 ? s : 0), ns = sAt(nx, nz);
              if (ns >= 0 && ns < gy) { mask[n] = 0; continue; }
            }
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
  // ---------- schuine bovenvlakken en rokjes ----------
  for (let lz = 0; lz < sz; lz++) for (let lx = 0; lx < sx; lx++) {
    const sTop = sAt(lx, lz); if (sTop < 0) continue;
    const gx = X0 + lx, gz = Z0 + lz, b = vox[(gz * size + gx) * H + sTop];
    const h00 = corner(lx, lz, sTop), h10 = corner(lx + 1, lz, sTop), h11 = corner(lx + 1, lz + 1, sTop), h01 = corner(lx, lz + 1, sTop);
    const slope = Math.max(Math.abs(h00 - h11), Math.abs(h10 - h01));
    topQuad(out, b, gx, gz, h00, h10, h11, h01, 1 - Math.min(0.25, slope * 0.12));
    // rokjes naar lagere buren
    for (const [dx, dz, f] of [[1, 0, 0], [-1, 0, 1], [0, 1, 4], [0, -1, 5]]) {
      const ns = sAt(lx + dx, lz + dz);
      if (ns < 0 || ns >= sTop) continue;
      // randhoogtes van mij en van de buur op de gedeelde rand
      let a1, a2, b1, b2, e1, e2;
      if (dx === 1) { a1 = h10; a2 = h11; e1 = [gx + 1, gz]; e2 = [gx + 1, gz + 1]; b1 = corner(lx + 1, lz, ns); b2 = corner(lx + 1, lz + 1, ns); }
      else if (dx === -1) { a1 = h01; a2 = h00; e1 = [gx, gz + 1]; e2 = [gx, gz]; b1 = corner(lx, lz + 1, ns); b2 = corner(lx, lz, ns); }
      else if (dz === 1) { a1 = h11; a2 = h01; e1 = [gx + 1, gz + 1]; e2 = [gx, gz + 1]; b1 = corner(lx + 1, lz + 1, ns); b2 = corner(lx, lz + 1, ns); }
      else { a1 = h00; a2 = h10; e1 = [gx, gz]; e2 = [gx + 1, gz]; b1 = corner(lx, lz, ns); b2 = corner(lx + 1, lz, ns); }
      if (a1 - b1 < 0.01 && a2 - b2 < 0.01) continue;
      skirt(out, b, e1, e2, Math.min(a1, b1), Math.min(a2, b2), a1, a2, f);
    }
  }
  return out;
}

// schuin bovenvlak van één kolom
function topQuad(out, b, x, z, h00, h10, h11, h01, light) {
  const buf = out.opaque, tile = FACE_TILE[b * 3], tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS), base = buf.n;
  const P = [[x, h00, z], [x + 1, h10, z], [x + 1, h11, z + 1], [x, h01, z + 1]];
  for (const q of P) { buf.pos.push(q[0], q[1], q[2]); buf.uv.push(q[0], q[2]); buf.tile.push(tx, ty); buf.light.push(light); buf.face.push(2); }
  // diagonaal kiezen die de vorm het best volgt
  if (Math.abs(h00 - h11) <= Math.abs(h10 - h01)) buf.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  else buf.idx.push(base + 1, base, base + 3, base + 1, base + 3, base + 2);
  buf.n += 4;
}
// opstaand stukje tussen twee kolommen (geen gaten tussen schuine vlakken)
function skirt(out, b, e1, e2, lo1, lo2, hi1, hi2, f) {
  const buf = out.opaque, tile = FACE_TILE[b * 3 + 1], tx = tile % ATLAS_COLS, ty = Math.floor(tile / ATLAS_COLS), base = buf.n;
  const P = [[e1[0], lo1, e1[1]], [e2[0], lo2, e2[1]], [e2[0], hi2, e2[1]], [e1[0], hi1, e1[1]]];
  for (const q of P) { buf.pos.push(q[0], q[1], q[2]); buf.uv.push(q[0] + q[2], q[1]); buf.tile.push(tx, ty); buf.light.push(0.8); buf.face.push(f); }
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2); // beide kanten
  buf.n += 4;
}

const V = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
function emit(out, b, a, u, v, s, ox, oy, oz, w, h, ao, faceTile, shade) {
  const buf = IS_TRANSPARENT[b] ? out.trans : out.opaque;
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
    buf.face.push(a * 2 + (s > 0 ? 0 : 1)); // richting van het vlak (voor licht en weerspiegeling)
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
