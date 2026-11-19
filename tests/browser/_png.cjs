// Kleine PNG-lezer (alleen Node, zonder extra pakketten) voor de beeldtests: helderheid, overbelichting.
// readPng(buffer) → { w, h, px: Uint8Array RGBA }. stats(img, box) → gemiddelde luminantie (0..255),
// fractie overbelichte pixels (alle kanalen ≥ 250) en fractie zwarte pixels (alle kanalen ≤ 6).
const zlib = require('zlib');
function readPng(buf) {
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8) throw new Error('alleen 8 bit'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('kleurtype ' + ct); })();
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0, x = line[i];
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const s = x * bpp, d = (y * w + x) * 4; out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = bpp === 4 ? cur[s + 3] : 255; }
    prev.set(cur);
  }
  return { w, h, px: out };
}
function stats(img, box) {
  const { w, h, px } = img, [x0, y0, x1, y1] = box || [0, 0, w, h];
  let L = 0, clip = 0, black = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
    L += 0.299 * r + 0.587 * g + 0.114 * b; n++;
    if (r >= 250 && g >= 250 && b >= 250) clip++;
    if (r <= 6 && g <= 6 && b <= 6) black++;
  }
  return { lum: +(L / n).toFixed(1), overbelicht: +(clip / n).toFixed(4), zwart: +(black / n).toFixed(4) };
}
module.exports = { readPng, stats };
