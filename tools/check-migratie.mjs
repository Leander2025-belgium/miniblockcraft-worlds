// TERRANOVA 16.1 fase 9 — savegamemigratie Megatower City v6 → v7 (js/migrate161.js mergeTile), zonder browser:
// een stuk stad (Grand Central, tegel 40,46) wordt 'bewerkt' op de oude versie: blokken geplaatst en weggehaald.
// Na het samenvoegen moeten precies die wijzigingen er nog zijn en moet al de rest de nieuwe stad zijn.
import { mergeTile } from '../js/migrate161.js';
import { generateTile as g7 } from '../js/megacity.js';
import { generateTile as g6 } from '../js/legacy/megacity-v6.js';
import { B } from '../js/blocks.js';
const T = 128, tx = 40, tz = 46, old = g6(tx, tz), neu = g7(tx, tz);
const mine = { vox: old.vox.slice(), H: old.H, y0: old.y0 };
const at = (t, x, y, z) => { const ly = y - t.y0; return ly < 0 || ly >= t.H ? 0 : t.vox[(z * T + x) * t.H + ly]; };
const put = (t, x, y, z, b) => { t.vox[(z * T + x) * t.H + (y - t.y0)] = b; };
// eigen bouwwerk: een toren van 6 houten blokken op het plein, een weggehaald blok, een lamp
const edits = [];
for (let y = 121; y <= 126; y++) { put(mine, 10, y, 10, B.PLANKS); edits.push([10, y, 10, B.PLANKS]); }
const gy = 119; put(mine, 20, gy, 20, 0); edits.push([20, gy, 20, 0]);
put(mine, 30, 130, 5, B.LAMP); edits.push([30, 130, 5, B.LAMP]);
const m = mergeTile(mine, old, neu);
let wrongEdit = 0, wrongRest = 0, diffNew = 0;
for (const [x, y, z, b] of edits) if (at(m, x, y, z) !== b) wrongEdit++;
const ed = new Set(edits.map(([x, y, z]) => x + ',' + y + ',' + z));
for (let z = 0; z < T; z += 3) for (let x = 0; x < T; x += 3) for (let y = neu.y0; y < neu.y0 + neu.H; y += 2) { if (ed.has(x + ',' + y + ',' + z)) continue; if (at(m, x, y, z) !== at(neu, x, y, z)) wrongRest++; if (at(old, x, y, z) !== at(neu, x, y, z)) diffNew++; }
const R = { eigenBlokken: m.changed, wijzigingenFout: wrongEdit, restFout: wrongRest, stadVeranderd: diffNew };
console.log(JSON.stringify(R));
const ok = m.changed === edits.length && wrongEdit === 0 && wrongRest === 0 && diffNew > 1000;
console.log(ok ? 'alles goed' : 'FOUT'); process.exitCode = ok ? 0 : 1;
