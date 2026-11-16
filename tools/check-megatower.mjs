// Controle van The Megatower (node tools/check-megatower.mjs):
// - hoogte exact 1.000 m, 25 kelders tot -100 m
// - elke kamer/woning/winkel is bereikbaar vanuit de liftlobby (deuren tellen als open te maken)
// - geen deuren tegen een muur, geen meubels in de deuropening
// - liften: deuropening vrij, vrije ruimte ervoor, schacht leeg; trappen lopen door
// - snelreisplaatsen staan op een vloer, met ruimte voor de speler
// - de ingerichte kamers hebben echt meubels (bed, badkamer…)
import { buildFloor, F_MIN, F_MAX, LIFTS, floorY, G, CX, CZ, PLACES, Y0, TILE_H, TOWER_TX, TOWER_TZ, roomAt, floorAt } from '../js/megatower.js';
import { generateTile } from '../js/megacity.js';
import { B, IS_SOLID, BLOCKS } from '../js/blocks.js';

const N = 96, H = 48;
const PASS = new Set([0, B.DOOR_OPEN, B.DOOR_OPEN_TOP, B.DOOR_SHUT, B.DOOR_SHUT_TOP, B.DOOR, B.DOOR_TOP, B.DOOR_GLASS, B.LADDER, B.WATER]);
const passable = (b) => PASS.has(b) || !IS_SOLID[b];
let fails = 0;
const fail = (m) => { if (fails < (+process.env.MAXF || 25)) console.log('  ✗ ' + m); fails++; };

// 1. hoogte
const top = floorY(F_MAX + 1) - 1; // dakplaat
const bottom = floorY(F_MIN);
console.log(`dak op ${top + 1 - G} m boven de straat (verwacht 1000), onderste verdieping op ${bottom - G} m (verwacht -100)`);
if (top + 1 - G !== 1000) fail('hoogte is niet 1000 m');
if (bottom - G !== -100) fail('onderste verdieping niet op -100 m');

// 2. bereikbaarheid per verdieping
let prevSeen = null, prevB = null, prevStack = null;
let rooms = 0, unreach = 0, doorsBad = 0, doors = 0, furnished = 0, emptyLiving = 0;
const kindsSeen = {};
for (let f = F_MIN; f <= F_MAX; f++) {
  const F = buildFloor(f), b = F.b;
  const at = (i, j, l) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : b[(j * N + i) * 4 + l];
  // staanhoogte per cel: 0 = op de plaat, 1 = op een verhoogd vlak (zwembadterras), -1 = niet
  const stand = new Int8Array(N * N).fill(-1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const l0 = at(i, j, 0), l1 = at(i, j, 1), l2 = at(i, j, 2), l3 = at(i, j, 3);
    if (IS_SOLID[l0] && passable(l1) && passable(l2)) stand[j * N + i] = 0;
    else if (IS_SOLID[l1] && !PASS.has(l1) && passable(l2) && passable(l3) && l1 !== B.WATER) stand[j * N + i] = 1;
    else if (l1 === B.WATER) stand[j * N + i] = 0; // zwemmen
  }
  const seen = new Uint8Array(N * N), q = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const ci = i - 48, cj = j - 48, k = Math.max(ci >= 0 ? ci : -ci - 1, cj >= 0 ? cj : -cj - 1); if (k >= 12 && k <= 14 && stand[j * N + i] >= 0) { seen[j * N + i] = 1; q.push(j * N + i); } }
  while (q.length) {
    const c = q.pop(), i = c % N, j = (c - i) / N, h = stand[c];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni; if (seen[n] || stand[n] < 0 || Math.abs(stand[n] - h) > 1) continue;
      seen[n] = 1; q.push(n);
    }
  }
  // binnentrappen (duplex): treden van planken, elke trede 1 hoger dan de vorige
  const stack = new Int8Array(N * N).fill(-1);
  for (let c = 0; c < N * N; c++) { let h = -1; while (h < 3 && b[c * 4 + h + 1] === B.PLANKS) h++; if (h >= 1 && b[c * 4] === B.PLANKS && (h === 3 || !b[c * 4 + h + 1])) stack[c] = h; }
  for (let it = 0; it < 4; it++) for (let c = 0; c < N * N; c++) {
    if (stack[c] < 1 || seen[c]) continue;
    const i = c % N;
    for (const n of [c - 1, c + 1, c - N, c + N]) { if (n < 0 || n >= N * N || Math.abs((n % N) - i) > 1) continue; const hn = stack[n] >= 1 ? stack[n] : (stand[n] === 0 ? 0 : -9); if (seen[n] && hn === stack[c] - 1) { seen[c] = 1; break; } }
  }
  // de bovenverdieping is bereikbaar via het trapgat boven de hoogste trede
  const viaStair = new Uint8Array(N * N);
  if (prevSeen) for (let c = 0; c < N * N; c++) if (!b[c * 4] && prevStack[c] === 3 && prevSeen[c]) {
    viaStair[c] = 1;
    // en verder over de bovenverdieping
    const q2 = [c]; while (q2.length) { const x = q2.pop(), xi = x % N; for (const n of [x - 1, x + 1, x - N, x + N]) { if (n < 0 || n >= N * N || Math.abs((n % N) - xi) > 1 || seen[n] || stand[n] !== 0) continue; seen[n] = 1; q2.push(n); } }
  }
  // kamers
  const byRoom = new Map();
  for (let c = 0; c < N * N; c++) { const id = F.room[c]; if (!id) continue; let r = byRoom.get(id); if (!r) byRoom.set(id, r = { any: 0, reach: 0, items: new Set() }); if (stand[c] >= 0) r.any++; if (seen[c] || viaStair[c]) r.reach++; for (let l = 1; l < 4; l++) r.items.add(b[c * 4 + l]); }
  for (const [id, r] of byRoom) {
    const R = F.rooms[id]; if (!R) continue;
    if (/^Trappenhuis|^Terras|vide|boomkruinen/.test(R.name)) continue;
    rooms++;
    kindsSeen[R.name.split(' ')[0]] = (kindsSeen[R.name.split(' ')[0]] || 0) + 1;
    if (!r.reach) { unreach++; fail(`verdieping ${f}: '${R.name}' niet bereikbaar (${r.any} vrije cellen)`); }
    if (R.kind === 'kamer' || R.kind === 'suite' || R.kind === 'woning') {
      const need = R.name.includes('bovenverdieping') ? [B.WARDROBE] : [B.TOILET, B.SINK];
      const bedOk = [...r.items].some(x => BLOCKS[x] && BLOCKS[x].seat === 'bed');
      if (need.every(x => r.items.has(x)) && (bedOk || /Studio|bovenverdieping/.test(R.name) || r.items.has(B.SOFA) || r.items.has(B.SOFA_LEATHER))) furnished++;
      else { emptyLiving++; fail(`verdieping ${f}: '${R.name}' mist meubels`); }
    }
  }
  // deuren: aan beide kanten van de deur moet je kunnen staan, niet tegen een muur of meubel
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    if (at(i, j, 1) !== B.DOOR_SHUT) continue;
    doors++;
    const ok = (a, c) => stand[c * N + a] >= 0;
    const ns = ok(i, j - 1) && ok(i, j + 1), ew = ok(i - 1, j) && ok(i + 1, j);
    if (!ns && !ew) { doorsBad++; if (doorsBad <= 6) fail(`verdieping ${f}: deur op (${i - 48}, ${j - 48}) komt uit op een muur of meubel`); }
  }
  prevSeen = seen; prevB = b; prevStack = stack;
}
console.log(`ruimtes ${rooms} · onbereikbaar ${unreach} · deuren ${doors} · deuren tegen muur/meubel ${doorsBad} · ingerichte kamers/woningen ${furnished} · zonder meubels ${emptyLiving}`);
console.log('soorten:', Object.entries(kindsSeen).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v}`).join(', '));

// 3. liften en trappen in de echte torentegel
const tile = generateTile(TOWER_TX, TOWER_TZ), vox = tile.vox, TH = tile.H, y0 = tile.y0;
const get = (x, y, z) => { const lx = x - TOWER_TX * 128, lz = z - TOWER_TZ * 128, ly = y - y0; if (lx < 0 || lz < 0 || lx >= 128 || lz >= 128 || ly < 0 || ly >= TH) return 0; return vox[(lz * 128 + lx) * TH + ly]; };
let liftStops = 0;
for (const L of LIFTS) {
  const { ci0, cj0 } = L.cells;
  for (let f = L.fmin; f <= L.fmax; f++) {
    const y = floorY(f);
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) for (let l = 0; l < 3; l++) if (get(CX + ci0 + a, y + l, CZ + cj0 + c)) fail(`${L.name}: schacht niet leeg op verdieping ${f}`);
    if (!L.stops.has(f)) continue;
    liftStops++;
    for (let a = 0; a < 3; a++) {
      const x = CX + ci0 + a, dz = CZ + L.door.cj;
      if (get(x, y, dz) || get(x, y + 1, dz)) fail(`${L.name}: deuropening dicht op ${f}`);
      for (let k = 1; k <= 2; k++) { const z = dz + L.out[1] * k; if (!IS_SOLID[get(x, y - 1, z)] || IS_SOLID[get(x, y, z)] || IS_SOLID[get(x, y + 1, z)]) fail(`${L.name}: geen vrije ruimte voor de deur op ${f} (${a},${k})`); }
    }
    if (get(CX + L.button[0], y + 1, CZ + L.button[1]) !== B.LIFT_BUTTON) fail(`${L.name}: geen liftknop op ${f}`);
  }
}
console.log(`liftstops ${liftStops} (in ${LIFTS.length} liften)`);
// alle verdiepingen bereikbaar met een lift?
for (let f = F_MIN; f <= F_MAX; f++) if (!LIFTS.some(L => L.stops.has(f))) fail(`verdieping ${f}: geen lift`);

// 4. snelreisplaatsen
for (const [name, x, z, y] of PLACES) {
  const X = Math.floor(x), Z = Math.floor(z);
  let ok = IS_SOLID[get(X, y - 1, Z)];
  for (const ex of [x - 0.3, x + 0.29]) for (const ez of [z - 0.3, z + 0.29]) for (const ey of [y, y + 1]) if (IS_SOLID[get(Math.floor(ex), ey, Math.floor(ez))]) ok = false;
  const r = roomAt(x, y + 0.5, z);
  console.log(`  ${ok ? '✓' : '✗'} ${name} → ${r ? 'verdieping ' + r.label + ' · ' + r.room : 'buiten de toren'}`);
  if (!ok) fail(`snelreisplaats '${name}' staat niet op een vrije vloer`);
}
// 5. gevel: elke bovengrondse verdieping heeft ramen
for (let f = 0; f <= F_MAX; f++) { const F = buildFloor(f); let glass = 0; for (let c = 0; c < N * N; c++) if (F.mask[c] === 1) { const v = F.b[c * 4 + 2]; if (v === B.GLASS || v === B.GLASS_BLUE || v === B.DARKGLASS || v === B.MIRROR || v === B.GLASS_GREEN || v === B.DOOR_GLASS) glass++; } if (glass < 40) fail(`verdieping ${f}: te weinig ramen (${glass})`); }
console.log(fails ? `${fails} fout(en)` : 'Megatower in orde');
process.exitCode = fails ? 1 : 0;
