// Zet de vaste kaart van Frankfurt vooraf om naar kant-en-klare tegels in data/frankfurt/v<versie>/.
// Gebruik: node tools/bake-frankfurt.mjs [map-voor-ruwe-downloads]
// Downloadt de kaartdata bij Overpass (via curl, zodat een HTTPS-proxy werkt), zet elke tegel om
// zoals de game dat doet, en schrijft per tegel een .bin-bestand plus lod.bin (verre gebouwen + minikaart).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { gzipSync } from 'zlib';
import { parseOSM, indexOSM, subsetOSM, rasterize, bboxFor, overpassQuery, computeLod, packTile } from '../js/osm.js';
import { CITY } from '../js/frankfurt.js';
import { mapMX, tileCenter, superBox, superCount } from '../js/bigmap.js';
import { rleEncode } from '../js/storage.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rawDir = process.argv[2] || path.join(root, '.osm-cache');
const outDir = path.join(root, 'data', CITY.id, 'v' + CITY.version);
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
function download(sx, sz) {
  const file = path.join(rawDir, `${CITY.id}-${sx}-${sz}.json`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return fs.readFileSync(file, 'utf8');
  const q = overpassQuery(superBox(CITY, sx, sz));
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const url of SERVERS) {
      try {
        process.stdout.write(`  download ${sx},${sz} bij ${new URL(url).host}… `);
        execFileSync('curl', ['-sS', '-f', '-m', '300', '-o', file, '--data-urlencode', 'data=' + q, url], { stdio: ['ignore', 'ignore', 'pipe'] });
        const text = fs.readFileSync(file, 'utf8');
        if (!text.trimStart().startsWith('{')) throw new Error('geen JSON (server bezet)');
        console.log(`${(text.length / 1e6).toFixed(1)} MB`);
        return text;
      } catch (e) { console.log('mislukt: ' + String(e.message).split('\n')[0]); }
    }
    execFileSync('sleep', [String(15 + attempt * 15)]);
  }
  throw new Error(`download ${sx},${sz} lukte niet`);
}

const n = CITY.tiles, sc = superCount(CITY), MX = mapMX(CITY);
const lodParts = [];
let bytes = 0, done = 0;
const t0 = Date.now();
for (let sz = 0; sz < sc; sz++) for (let sx = 0; sx < sc; sx++) {
  console.log(`superblok ${sx},${sz}`);
  const osm = indexOSM(parseOSM(download(sx, sz)));
  for (let tz = sz * CITY.superTiles; tz < Math.min(n, (sz + 1) * CITY.superTiles); tz++)
    for (let tx = sx * CITY.superTiles; tx < Math.min(n, (sx + 1) * CITY.superTiles); tx++) {
      const c = tileCenter(CITY, tx, tz), b = bboxFor(c.lat, c.lon, CITY.tile, 30);
      const r = rasterize(subsetOSM(osm, b.s, b.w, b.n, b.e), c.lat, c.lon, CITY.tile, null, 1, { mx: MX, ox: tx * CITY.tile, oz: tz * CITY.tile });
      const rle = rleEncode(r.vox);
      const buf = gzipSync(packTile(rle, r.H, r.paths), { level: 9 });
      fs.writeFileSync(path.join(outDir, `${tx}_${tz}.bin`), buf);
      bytes += buf.length; done++;
      const l = computeLod(r.vox, CITY.tile, r.H);
      const rec = new Uint8Array(4 + l.h.byteLength + l.c.length);
      new DataView(rec.buffer).setUint16(0, tx, true); new DataView(rec.buffer).setUint16(2, tz, true);
      rec.set(new Uint8Array(l.h.buffer), 4); rec.set(l.c, 4 + l.h.byteLength);
      lodParts.push(rec);
    }
  console.log(`  ${done}/${n * n} tegels, ${(bytes / 1e6).toFixed(1)} MB, ${Math.round((Date.now() - t0) / 1000)} s`);
}
const lod = new Uint8Array(lodParts.reduce((a, p) => a + p.length, 0));
let o = 0; for (const p of lodParts) { lod.set(p, o); o += p.length; }
fs.writeFileSync(path.join(outDir, 'lod.bin'), gzipSync(lod, { level: 9 }));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ id: CITY.id, version: CITY.version, tiles: n, tile: CITY.tile, bytes, made: new Date().toISOString() }, null, 1));
console.log(`klaar: ${done} tegels, ${(bytes / 1e6).toFixed(1)} MB in ${outDir}`);
