// Web Worker: berekent de stadskaart, voorbeelden en volledige 3D-gebieden.
import { fillColumn, generateRegion, WIDTH, LENGTH, GROUND, HEIGHT } from './city.js';
import { BLOCKS } from './blocks.js';
import { parseOSM, fetchOSM, rasterize, topView } from './osm.js';

const col = new Uint8Array(HEIGHT);

function colorAt(x, z, prevH) {
  col.fill(0);
  const top = fillColumn(x, z, col);
  let y = top;
  while (y > 0 && !col[y]) y--;
  const c = BLOCKS[col[y]].color;
  let f = 1;
  if (y > GROUND + 1) f = 0.92 + Math.min(0.3, (y - GROUND) / 350);
  if (prevH > y + 2) f *= 0.72; // schaduw van het gebouw ernaast
  return [c[0] * f, c[1] * f, c[2] * f, y];
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'map') {
    const s = m.scale, w = Math.floor(WIDTH / s), h = Math.floor(LENGTH / s);
    const heights = new Int16Array(w + 1);
    const rowsPer = 50;
    for (let r0 = 0; r0 < h; r0 += rowsPer) {
      const rows = Math.min(rowsPer, h - r0);
      const data = new Uint8ClampedArray(w * rows * 4);
      for (let r = 0; r < rows; r++) {
        const z = (r0 + r) * s + (s >> 1);
        let prevLeft = 0;
        for (let i = 0; i < w; i++) {
          const x = i * s + (s >> 1);
          const nw = Math.max(heights[i], prevLeft);
          const [cr, cg, cb, y] = colorAt(x, z, nw);
          const o = (r * w + i) * 4;
          data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
          heights[i] = y; prevLeft = y;
        }
      }
      self.postMessage({ type: 'mapRows', id: m.id, y0: r0, rows, w, data }, [data.buffer]);
    }
    self.postMessage({ type: 'mapDone', id: m.id });
  } else if (m.type === 'preview') {
    const { x0, z0, size } = m;
    const data = new Uint8ClampedArray(size * size * 4);
    const heights = new Int16Array(size + 1);
    for (let z = 0; z < size; z++) {
      let prevLeft = 0;
      for (let x = 0; x < size; x++) {
        const nw = Math.max(heights[x], prevLeft);
        const [cr, cg, cb, y] = colorAt(x0 + x, z0 + z, nw);
        const o = (z * size + x) * 4;
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
        heights[x] = y; prevLeft = y;
      }
    }
    self.postMessage({ type: 'preview', id: m.id, size, data }, [data.buffer]);
  } else if (m.type === 'osm') {
    realWorld(m).catch(err => self.postMessage({ type: 'error', id: m.id, message: err.message || String(err) }));
  } else if (m.type === 'region') {
    const { x0, z0, size } = m;
    let last = 0;
    const vox = generateRegion(x0, z0, size, p => {
      const now = performance.now();
      if (now - last > 60) { last = now; self.postMessage({ type: 'progress', id: m.id, p }); }
    });
    self.postMessage({ type: 'region', id: m.id, vox }, [vox.buffer]);
  }
};

async function realWorld(m) {
  const status = (text, p) => self.postMessage({ type: 'progress', id: m.id, text, p });
  let text = m.text, lat = m.lat, lon = m.lon, size = m.size;
  if (!text) {
    status('Kaartgegevens opvragen bij OpenStreetMap…', 0.05);
    text = await fetchOSM(lat, lon, size, t => status(t, 0.1));
  }
  status('Kaartgegevens lezen…', 0.3);
  const osm = parseOSM(text);
  if (lat == null || lon == null) {
    if (osm.bounds) {
      lat = (osm.bounds.minlat + osm.bounds.maxlat) / 2; lon = (osm.bounds.minlon + osm.bounds.maxlon) / 2;
      const h = (osm.bounds.maxlat - osm.bounds.minlat) * 110574;
      const w = (osm.bounds.maxlon - osm.bounds.minlon) * 111320 * Math.cos(lat * Math.PI / 180);
      size = Math.max(32, Math.min(size, Math.floor(Math.min(w, h) / 16) * 16));
    } else {
      let a = 0, b = 0, n = 0;
      for (const [la, lo] of osm.nodes.values()) { a += la; b += lo; n++; }
      lat = a / n; lon = b / n;
    }
  }
  status('Gebouwen en straten omzetten naar blokken…', 0.4);
  const r = rasterize(osm, lat, lon, size, p => status('Gebouwen en straten omzetten naar blokken…', 0.4 + p * 0.55));
  const preview = topView(r.vox, size, r.H);
  self.postMessage({ type: 'osmDone', id: m.id, vox: r.vox, H: r.H, ground: r.ground, buildings: r.buildings, lat, lon, size, preview },
    [r.vox.buffer, preview.buffer]);
}
