// TERRANOVA 16.1 — savegameveiligheid bij de vernieuwing van Megatower City (generatorversie 6 → 7).
// Een bewerkt stuk stad wordt in z'n geheel bewaard ('<wereld>-edit-<tx>-<tz>'); de game toont dan altijd jouw versie.
// Na de vernieuwing blijft zo'n stuk dus zoals het was (met de oude architectuur): er wordt niets automatisch
// overschreven. Wie wil, kan een bewerkt stuk vernieuwen:
//   1. eerst een herstelbare back-up van het stuk ('…@v6'), behalve als die er al is
//   2. jouw wijzigingen zijn de blokken die verschillen van de oude stad (bevroren generator js/legacy/megacity-v6.js)
//   3. die wijzigingen (ook weggehaalde blokken) worden op de nieuwe stad gezet; de rest komt uit de nieuwe stad
//   4. het stuk krijgt basisversie 7; 'terugzetten' haalt de back-up terug
// Alles per stuk en alleen op vraag van de speler (pauzemenu → Wereld).
import { generateTile as gen7, META } from './megacity.js';
import { generateTile as gen6 } from './legacy/megacity-v6.js';
import * as store from './storage.js';

const T = 128;
export const BACKUP = '@v6';
// samenvoegen (zonder opslag; ook voor tests): mine = { vox, H, y0 } van het bewerkte stuk
export function mergeTile(mine, old, neu) {
  const y0 = Math.min(mine.y0, neu.y0), top = Math.max(mine.y0 + mine.H, neu.y0 + neu.H), H = Math.ceil((top - y0) / 8) * 8;
  const vox = new Uint8Array(T * T * H); let changed = 0, kept = 0;
  const at = (t, i, y) => { const ly = y - t.y0; return ly < 0 || ly >= t.H ? 0 : t.vox[i * t.H + ly]; };
  for (let i = 0; i < T * T; i++) for (let y = y0; y < y0 + H; y++) {
    const inMine = y >= mine.y0 && y < mine.y0 + mine.H, m = inMine ? at(mine, i, y) : 0, o = at(old, i, y), n = at(neu, i, y);
    if (inMine && m !== o) { vox[i * H + (y - y0)] = m; changed++; } else { vox[i * H + (y - y0)] = n; if (n) kept++; }
  }
  return { vox, H, y0, edge: neu.edge || mine.edge || null, changed };
}
const key = (mapId, tx, tz) => `${mapId}-edit-${tx}-${tz}`;
// lijst van bewerkte stukken die op de oude versie steunen en waar de stad echt veranderd is
export async function scan(mapId = 'megatower', onProgress) {
  const rows = (await store.cacheGetPrefix(mapId + '-edit-')).filter(r => /-edit-\d+-\d+$/.test(r.key) && r.value && r.value.rle);
  const out = [];
  for (const r of rows) {
    const [tx, tz] = r.key.match(/-edit-(\d+)-(\d+)$/).slice(1).map(Number), v = r.value.v ?? 6;
    const hasBackup = await store.cacheHas(r.key + BACKUP).catch(() => false);
    if (v >= META.version) { out.push({ key: r.key, tx, tz, v, veranderd: false, backup: hasBackup }); continue; }
    const a = gen6(tx, tz), b = gen7(tx, tz);
    let diff = a.H !== b.H || a.y0 !== b.y0;
    if (!diff) for (let i = 0; i < a.vox.length; i += 7) if (a.vox[i] !== b.vox[i]) { diff = true; break; }
    out.push({ key: r.key, tx, tz, v, veranderd: diff, backup: hasBackup });
    onProgress && onProgress(out.length, rows.length);
    await new Promise(res => setTimeout(res, 0));
  }
  return out;
}
export async function migrate(mapId, tx, tz) {
  const k = key(mapId, tx, tz), ed = await store.cacheGet(k);
  if (!ed || !ed.rle) return { ok: false, waarom: 'geen bewerkt stuk' };
  if ((ed.v ?? 6) >= META.version) return { ok: false, waarom: 'al vernieuwd' };
  const mine = { vox: store.rleDecode(ed.rle, T * T * ed.H), H: ed.H, y0: ed.y0 || 0 };
  if (!(await store.cacheHas(k + BACKUP).catch(() => false))) await store.cachePut(k + BACKUP, ed);   // back-up eerst
  const m = mergeTile(mine, gen6(tx, tz), gen7(tx, tz)), rle = store.rleEncode(m.vox);
  await store.cachePut(k, { rle, H: m.H, y0: m.y0, edge: m.edge, crc: store.fnv(rle), saved: Date.now(), v: META.version, gemigreerd: { van: ed.v ?? 6, eigenBlokken: m.changed } });
  return { ok: true, eigenBlokken: m.changed };
}
export async function restore(mapId, tx, tz) {
  const k = key(mapId, tx, tz), bk = await store.cacheGet(k + BACKUP);
  if (!bk) return { ok: false, waarom: 'geen back-up' };
  await store.cachePut(k, bk);
  return { ok: true };
}
