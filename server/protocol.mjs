// TERRANOVA multiplayer — protocol en validatie (prototype, TERRANOVA 16).
// Zuivere functies zonder netwerk: dezelfde regels gelden in de server (mp-server.mjs) en worden apart getest
// (test-protocol.mjs). De server vertrouwt de client nooit: elk bericht wordt hier gecontroleerd.
//
// Berichten (JSON, één object per WebSocket-bericht):
//   client → server: hello {name, room, token?, look?} · pos {x,y,z,yaw,pitch?,fly?} · build {x,y,z,b}
//                    · chat {text} · look {what, x, z} (samen een voertuig bekijken) · ping {}
//   server → client: welcome {id, room, players[], edits[], seq} · join {player} · leave {id} · pos {id,…}
//                    · build {id, x,y,z,b, seq} · chat {id, name, text} · look {id, name, what, x, z}
//                    · reject {what, why} · correct {x,y,z} · pong {}
export const LIMITS = {
  maxMessage: 4096,           // bytes per bericht
  nameLen: [2, 16], roomLen: [1, 48], chatLen: 200,
  world: { minY: -256, maxY: 1400, maxXZ: 2_000_000 },
  maxSpeed: 140,              // m/s tussen twee posities (vliegen en treinen tot ±500 km/u)
  buildReach: 10,             // m tussen speler en blok
  maxBlock: 255,
  rate: { pos: [25, 25], build: [12, 24], chat: [0.5, 3], look: [1, 3], hello: [0.2, 2] }, // [per seconde, buffer]
};
const NAME_RE = /^[\p{L}\p{N} _.-]+$/u, ROOM_RE = /^[\w:.-]+$/;
// een kleine lijst ongewenste woorden (prototype; een echte dienst heeft meer nodig, zie docs/terranova-16.md)
const BLOCKED = ['kanker', 'klootzak', 'hoer', 'neuk', 'fuck', 'shit', 'bitch', 'nigger', 'nazi', 'kut', 'tering', 'mongool'];

export function tokenBucket(rate, burst) { return { rate, burst, tokens: burst, t: 0 }; }
// true = toegestaan (en één token gebruikt); now in seconden
export function take(b, now) {
  b.tokens = Math.min(b.burst, b.tokens + (now - b.t) * b.rate); b.t = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1; return true;
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function parse(raw) {
  if (typeof raw !== 'string' && !(raw instanceof Buffer)) return { err: 'geen tekst' };
  const s = String(raw);
  if (s.length > LIMITS.maxMessage) return { err: 'te groot' };
  let m; try { m = JSON.parse(s); } catch { return { err: 'geen JSON' }; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return { err: 'geen type' };
  return { m };
}
export function cleanName(n) {
  if (typeof n !== 'string') return null;
  n = n.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (n.length < LIMITS.nameLen[0] || n.length > LIMITS.nameLen[1] || !NAME_RE.test(n)) return null;
  if (BLOCKED.some(w => n.toLowerCase().includes(w))) return null;
  return n;
}
export function cleanRoom(r) { return typeof r === 'string' && r.length >= LIMITS.roomLen[0] && r.length <= LIMITS.roomLen[1] && ROOM_RE.test(r) ? r : null; }
export function cleanChat(t) {
  if (typeof t !== 'string') return null;
  t = t.normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2028\u2029]/g, '').trim().slice(0, LIMITS.chatLen);
  if (!t) return null;
  for (const w of BLOCKED) t = t.replace(new RegExp(w, 'gi'), '*'.repeat(w.length));
  return t;
}
export function validPos(m) {
  const W = LIMITS.world;
  if (![m.x, m.y, m.z, m.yaw].every(fin)) return null;
  if (Math.abs(m.x) > W.maxXZ || Math.abs(m.z) > W.maxXZ || m.y < W.minY || m.y > W.maxY) return null;
  return { x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), yaw: +(m.yaw % (Math.PI * 2)).toFixed(3), pitch: fin(m.pitch) ? +Math.max(-1.6, Math.min(1.6, m.pitch)).toFixed(3) : 0, fly: !!m.fly };
}
// beweging plausibel? (prev: laatste goede positie met tijd in s)
export function plausibleMove(prev, p, now) {
  if (!prev) return true;
  const dt = Math.max(0.05, now - prev.t), d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
  return d <= LIMITS.maxSpeed * dt + 2;
}
export function validBuild(m, player) {
  if (![m.x, m.y, m.z, m.b].every(Number.isInteger)) return { why: 'geen gehele getallen' };
  if (m.b < 0 || m.b > LIMITS.maxBlock) return { why: 'onbekend blok' };
  const W = LIMITS.world;
  if (Math.abs(m.x) > W.maxXZ || Math.abs(m.z) > W.maxXZ || m.y < W.minY || m.y > W.maxY) return { why: 'buiten de wereld' };
  if (!player.pos) return { why: 'positie onbekend' };
  const d = Math.hypot(m.x + 0.5 - player.pos.x, m.y + 0.5 - player.pos.y - 1.6, m.z + 0.5 - player.pos.z);
  if (d > LIMITS.buildReach) return { why: 'te ver weg' };
  return { ok: { x: m.x, y: m.y, z: m.z, b: m.b } };
}
// uiterlijk van een speler (zelfde velden als js/avatar.js DEFAULT_LOOK): alleen kleuren, een hoed en een rugzak
export function cleanAppearance(l) {
  if (!l || typeof l !== 'object') return null;
  const o = {}, HEX = /^#[0-9a-f]{6}$/i;
  for (const k of ['shirt', 'pants', 'skin', 'hair', 'shoes']) if (typeof l[k] === 'string' && HEX.test(l[k])) o[k] = l[k];
  if (['none', 'cap', 'beanie'].includes(l.hat)) o.hat = l.hat;
  o.backpack = l.backpack === true;
  return o;
}
export function validLook(m) {
  if (typeof m.what !== 'string' || m.what.length > 60 || !fin(m.x) || !fin(m.z)) return null;
  return { what: m.what.replace(/[<>]/g, ''), x: +m.x.toFixed(1), z: +m.z.toFixed(1) };
}
