// Berekent het wandelpad van de Reuzenberg (A* met een maximale helling) en schrijft js/mountain-trail.js.
// Opnieuw draaien na wijzigingen aan het landschap in js/mountain.js:  node tools/make-trail.mjs
import { writeFileSync } from 'fs';
const M = await import('../js/mountain.js');
const { naturalHeight: nat, TRAILHEAD, SUMMIT_XZ } = M;
const S = 12, X0 = 3200, Z0 = 2600, NX = Math.ceil((11000 - X0) / S), NZ = Math.ceil((12000 - Z0) / S);
const h = new Float32Array(NX * NZ);
for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) h[z * NX + x] = nat(X0 + x * S, Z0 + z * S);
const DIRS = [];
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
  if (!dx && !dz) continue;
  const g = Math.abs(dx) === 2 || Math.abs(dz) === 2 ? (Math.abs(dx) % 2 === 1 || Math.abs(dz) % 2 === 1) : true;
  if (g) DIRS.push([dx, dz, Math.hypot(dx, dz) * S]);
}
const idx = (x, z) => z * NX + x;
const sx = Math.round((TRAILHEAD[0] - X0) / S), sz = Math.round((TRAILHEAD[1] - Z0) / S);
const gx = Math.round((SUMMIT_XZ[0] - X0) / S), gz = Math.round((SUMMIT_XZ[1] - Z0) / S);
const dist = new Float64Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1);
// binaire heap
const heap = []; const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
const hgoal = (x, z) => Math.hypot(x - gx, z - gz) * S;
const s0 = idx(sx, sz); dist[s0] = 0; push(hgoal(sx, sz), s0);
const goal = idx(gx, gz);
let n = 0;
while (heap.length) {
  const [, i] = pop();
  if (i === goal) break;
  n++;
  const x = i % NX, z = (i / NX) | 0, hi = h[i];
  const nearTop = hgoal(x, z) < 380;
  for (const [dx, dz, L] of DIRS) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
    const j = idx(nx, nz);
    // helling ook in het midden van de stap controleren
    const mid = nat(X0 + (x + dx / 2) * S, Z0 + (z + dz / 2) * S);
    const g = Math.max(Math.abs(h[j] - hi), Math.abs(mid - hi) * 2, Math.abs(h[j] - mid) * 2) / L;
    const lim = nearTop ? 0.75 : 0.3;
    if (g > lim) continue;
    const c = L * (1 + (g > 0.15 ? 120 * (g - 0.15) ** 2 : 0) + (h[j] < 1 ? 50 : 0));
    const nd = dist[i] + c;
    if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd + hgoal(nx, nz), j); }
  }
}
if (prev[goal] < 0) throw new Error('geen pad gevonden');
const path = [];
for (let i = goal; i >= 0; i = prev[i]) path.push([X0 + (i % NX) * S, Z0 + ((i / NX) | 0) * S]);
path.reverse();
path[0] = [TRAILHEAD[0], TRAILHEAD[1]];
const flat = path.flat().map(v => Math.round(v));
writeFileSync(new URL('../js/mountain-trail.js', import.meta.url),
  `// Gemaakt door tools/make-trail.mjs — wandelpad van de Reuzenberg (x, z per punt, elke ~${S} m).\nexport const TRAIL_WAYPOINTS = [${flat.join(',')}];\n`);
console.log('nodes', n, 'waypoints', path.length);
