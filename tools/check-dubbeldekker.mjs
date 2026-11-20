// Dubbeldekker (TERRANOVA 14.2): loopbaarheid van het interieur: van de deur naar elke zitplaats (BFS, stappen ≤ 1 blok, 2 blokken lucht)
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { NET } = await import('../js/rail-green.js');
const R = await import('../js/rail.js');
R.useNet(NET);
let fail = 0;
for (const t of ['ddCab', 'ddMid']) {
  const d = R._design(t, 'GR'), { W, H, L, size, vox } = d, get = (x, y, z) => x < 0 || z < 0 || x >= W || z >= L || y < 0 ? 1 : y >= H ? 1 : vox[(z * size + x) * H + y];
  const walk = (x, y, z) => get(x, y - 1, z) && !get(x, y, z) && !get(x, y + 1, z);
  const start = [1, 2, d.doors[0]], seen = new Set([start.join()]), q = [start];
  while (q.length) { const [x, y, z] = q.shift(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [x + dx, y + dy, z + dz]; if (!seen.has(n.join()) && walk(...n)) { seen.add(n.join()); q.push(n); } } }
  const boven = [...seen].filter(k => +k.split(',')[1] >= 5).length, beneden = [...seen].filter(k => +k.split(',')[1] <= 3).length;
  const zitBereik = d.seats.filter(([sx, sy, sz]) => [[0, 0], [1, 0], [-1, 0]].some(([ox]) => seen.has([Math.floor(sx) + ox, sy - 1, Math.floor(sz)].join()) || seen.has([Math.floor(sx) + ox, sy, Math.floor(sz)].join()))).length;
  if (!(boven > 10 && beneden > 10 && zitBereik === d.seats.length && H === 8)) fail++;
  console.log(t, 'H', H, 'bereikbaar beneden', beneden, 'boven', boven, 'zitplaatsen', d.seats.length, 'naast een loopplek', zitBereik);
}
console.log(fail ? 'FOUT' : 'alles goed');
process.exit(fail ? 1 : 0);
