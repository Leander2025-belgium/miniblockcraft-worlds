// Gevels van de torens in Megatower City (TERRANOVA 14.1): elke gevelsoort komt voor, en samen kosten ze niet meer
// driehoeken dan de oude gevel (alleen vliesgevels) op dezelfde 6 tegels van het centrum, gemeten met de mesher van het spel.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(import.meta.url);
if (process.argv[2] === 'meet') {
  if (process.argv[3] !== 'mix') globalThis.__FACADE = process.argv[3];
  const M = await import('../js/megacity.js'), { meshChunk } = await import('../js/mesher.js');
  let tris = 0;
  for (const [tx, tz] of [[38, 38], [41, 38], [38, 41], [42, 42], [36, 40], [44, 39]]) {
    const t = M.generateTile(tx, tz), H = t.H, vox = t.vox, size = 128;
    const world = { size, H, vox, y0: t.y0 || 0, edge: null, chunkTop: () => H - 2 };
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) { const o = meshChunk(world, cx, cz); tris += (o.opaque.idx.length + o.trans.idx.length) / 3; }
  }
  const c = {}; for (let qx = 40; qx < 120; qx++) for (let qz = 40; qz < 120; qz++) { const L = M._lotDesc(qx, qz); if (L.type === 'tower') c[L.facade] = (c[L.facade] || 0) + 1; }
  console.log(JSON.stringify({ tris, soorten: c }));
  process.exit(0);
}
const run = (m) => JSON.parse(spawnSync(process.execPath, [here, 'meet', m], { encoding: 'utf8' }).stdout.trim().split('\n').pop());
const oud = run('curtain'), nieuw = run('mix');
const soorten = Object.keys(nieuw.soorten);
console.log(`driehoeken 6 tegels centrum: alleen vliesgevels ${Math.round(oud.tris / 1000)}k, nieuwe gevels ${Math.round(nieuw.tris / 1000)}k (${((nieuw.tris / oud.tris - 1) * 100).toFixed(1)} %); gevelsoorten: ${JSON.stringify(nieuw.soorten)}`);
const ok = nieuw.tris <= oud.tris * 1.05 && ['curtain', 'ribbon', 'bands', 'fins', 'stone'].every(s => soorten.includes(s));
console.log(ok ? 'alles goed' : 'FOUT');
process.exit(ok ? 0 : 1);
