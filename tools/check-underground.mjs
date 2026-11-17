// Diepe ondergrond (node tools/check-underground.mjs): een stuk ondergrond dat gemaakt wordt terwijl een buurtegel
// nog niet geladen is, mag daar geen rots achterlaten. Laadt die tegel later met een diepere tunnel (bodem lager),
// dan moet de tunnel er open zijn (vroeger bleef de oude rots er als muur staan).
import { Underground } from '../js/underground.js';
const loaded = new Set(['0']);           // tegel 0 (x 0..127) geladen, tegel 1 (x 128..255) nog niet
const y0 = { 0: 60, 1: 20 };              // tegel 1 heeft een diepe metrotunnel: begint op 20
const tileOf = (x) => Math.floor(x / 128);
const scene = { add() {}, remove() {} };
const U = new Underground(scene, { id: 'test', loaded: (x) => loaded.has(String(tileOf(x))), top: (x, z) => loaded.has(String(tileOf(x))) ? y0[tileOf(x)] : 76, ref: () => 100 }, { under: null, underTrans: null });
await new Promise(r => setTimeout(r, 50));
let fails = 0;
// stuk dat over de grens van tegel 0 en 1 ligt (x 120..135), hoogte 32..47: wordt nu gemaakt en bewaard
const cell = (x, y, z) => { const c = U.chunk(Math.floor(x / 16), Math.floor(y / 16), Math.floor(z / 16)); return c[((y & 15) * 16 + (z & 15)) * 16 + (x & 15)]; };
let before = 0; for (let x = 128; x < 136; x++) for (let y = 32; y < 48; y++) if (cell(x, y, 5)) before++;
console.log('voor het laden van tegel 1: vaste blokken in het stuk over de grens (deel van tegel 1) =', before, '(0 = niets gegokt)');
if (before !== 0) { console.log('✗ ondergrond gokt rots onder een niet-geladen tegel'); fails++; }
// tegel 1 laadt (bodem op 20): de tunnel op y 40 ligt in de tegel zelf, de ondergrond mag daar niets hebben
loaded.add("1"); U.tileLoaded ? U.tileLoaded(128, 0, 128) : 0;
let after = 0, deep = 0; for (let x = 128; x < 136; x++) { for (let y = 32; y < 48; y++) if (cell(x, y, 5)) after++; for (let y = 2; y < 18; y++) if (cell(x, y, 5)) deep++; }
console.log('na het laden: vaste blokken in de tunnelzone (boven de tegelbodem) =', after, '· gesteente eronder =', deep);
if (after !== 0) { console.log('✗ oude rots blijft in de tunnel staan'); fails++; }
if (!deep) { console.log('✗ onder de tegelbodem hoort gesteente'); fails++; }
console.log(fails ? `${fails} fout(en)` : 'Ondergrond in orde: geen achtergebleven rots in tunnels');
process.exitCode = fails ? 1 : 0;
