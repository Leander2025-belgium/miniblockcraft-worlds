// TERRANOVA multiplayerserver — prototype (TERRANOVA 16, fase 9). OPTIONEEL: de game werkt zonder deze server
// volledig offline en zonder account. Deze server is alleen nodig voor "👥 Samen spelen (proef)".
//
// Wat hij doet:
//   - kamers per wereld (room), max MP_MAX spelers per kamer;
//   - posities doorgeven (± 10 per seconde per speler), met controle op plausibele snelheid;
//   - bouwacties: de server valideert (bereik, blok, grenzen), geeft elke wijziging een volgnummer en stuurt ze
//     in die ene volgorde naar iedereen: twee spelers die tegelijk hetzelfde blok wijzigen zien hetzelfde resultaat
//     (de laatste in de volgorde van de server wint) en niemand schrijft rechtstreeks in de wereld van een ander;
//   - chat met lengtegrens, filter en rate limiting; "samen bekijken" van een voertuig;
//   - opslag van de bouwacties per kamer (atomair: tijdelijk bestand + rename) met roterende back-ups;
//   - optioneel een gedeeld toegangswachtwoord (MP_TOKEN) en een lijst toegestane origins (MP_ORIGINS).
// Wat hij (nog) niet doet: echte spelersaccounts, privéwerelden met rechten, voertuigsynchronisatie. Zie docs/terranova-16.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { LIMITS, parse, cleanName, cleanRoom, cleanChat, validPos, plausibleMove, validBuild, validLook, cleanAppearance, tokenBucket, take } from './protocol.mjs';

const PORT = +(process.env.MP_PORT || 8787), HOST = process.env.MP_HOST || '0.0.0.0';
const DATA = path.resolve(process.env.MP_DATA || './data'), TOKEN = process.env.MP_TOKEN || '';
const MAX_PLAYERS = +(process.env.MP_MAX || 16), ORIGINS = (process.env.MP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_EDITS = +(process.env.MP_MAX_EDITS || 200000), BACKUPS = 5;
fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true });
const now = () => performance.now() / 1000;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- kamers en opslag ----------
const rooms = new Map();
const fileOf = (id) => path.join(DATA, 'room-' + id.replace(/[^\w.-]/g, '_') + '.json');
function loadRoom(id) {
  let R = rooms.get(id); if (R) return R;
  R = { id, players: new Map(), edits: new Map(), seq: 0, dirty: false };
  try {
    const j = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
    R.seq = j.seq || 0; for (const [x, y, z, b] of j.edits || []) R.edits.set(x + ',' + y + ',' + z, b);
    log('kamer geladen', id, R.edits.size, 'wijzigingen');
  } catch { /* nieuwe kamer */ }
  rooms.set(id, R); return R;
}
function saveRoom(R) {
  if (!R.dirty) return;
  const f = fileOf(R.id), tmp = f + '.tmp';
  const edits = [...R.edits].map(([k, b]) => [...k.split(',').map(Number), b]);
  fs.writeFileSync(tmp, JSON.stringify({ room: R.id, seq: R.seq, saved: new Date().toISOString(), edits }));
  fs.renameSync(tmp, f); // atomair: een crash midden in het schrijven laat het vorige bestand heel
  R.dirty = false;
}
function backupRoom(R) {
  const f = fileOf(R.id); if (!fs.existsSync(f)) return;
  const dir = path.join(DATA, 'backups'), base = path.basename(f, '.json');
  fs.copyFileSync(f, path.join(dir, `${base}-${Date.now()}.json`));
  const old = fs.readdirSync(dir).filter(n => n.startsWith(base + '-')).sort();
  while (old.length > BACKUPS) fs.unlinkSync(path.join(dir, old.shift()));
}
setInterval(() => { for (const R of rooms.values()) try { saveRoom(R); } catch (e) { log('opslaan mislukt', R.id, e.message); } }, 5000).unref();
setInterval(() => { for (const R of rooms.values()) try { backupRoom(R); } catch (e) { log('back-up mislukt', R.id, e.message); } }, 3600_000).unref();

// ---------- verbindingen ----------
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const toRoom = (R, m, except) => { const s = JSON.stringify(m); for (const P of R.players.values()) if (P !== except && P.ws.readyState === 1) P.ws.send(s); };
const pub = (P) => ({ id: P.id, name: P.name, look: P.look, pos: P.pos });
const safeEq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, R) => a + R.players.size, 0) })); return; }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({
  server: httpServer, maxPayload: LIMITS.maxMessage,
  verifyClient: ({ origin }, cb) => cb(!ORIGINS.length || ORIGINS.includes(origin), 403, 'origin niet toegestaan'),
});
const perIp = new Map();
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || '?';
  const n = (perIp.get(ip) || 0) + 1; if (n > 8) { ws.close(1008, 'te veel verbindingen'); return; } perIp.set(ip, n);
  const P = { ws, id: crypto.randomBytes(6).toString('hex'), name: null, room: null, pos: null, last: null, strikes: 0, look: null,
    rl: Object.fromEntries(Object.entries(LIMITS.rate).map(([k, [r, b]]) => [k, tokenBucket(r, b)])) };
  const strike = (what, why) => { send(ws, { t: 'reject', what, why }); if (++P.strikes > 50) ws.close(1008, 'te veel ongeldige berichten'); };
  ws.on('message', (raw) => {
    const { m, err } = parse(raw.toString());
    if (err) return strike('bericht', err);
    const t = now(), kind = m.t;
    if (LIMITS.rate[kind] && !take(P.rl[kind], t)) return kind === 'pos' ? undefined : strike(kind, 'te snel');
    if (kind === 'ping') return send(ws, { t: 'pong' });
    if (kind === 'hello') {
      if (P.room) return strike('hello', 'al aangemeld');
      if (TOKEN && !safeEq(m.token || '', TOKEN)) { send(ws, { t: 'reject', what: 'hello', why: 'toegang geweigerd' }); return ws.close(1008, 'toegang geweigerd'); }
      const name = cleanName(m.name), room = cleanRoom(m.room);
      if (!name) return strike('hello', 'ongeldige naam (2–16 letters, cijfers, spatie, _ . -)');
      if (!room) return strike('hello', 'ongeldige wereld');
      const R = loadRoom(room);
      if (R.players.size >= MAX_PLAYERS) { send(ws, { t: 'reject', what: 'hello', why: 'wereld vol' }); return ws.close(1008, 'vol'); }
      let nm = name, k = 2; while ([...R.players.values()].some(o => o.name === nm)) nm = name.slice(0, 13) + ' ' + k++;
      P.name = nm; P.room = R; P.look = cleanAppearance(m.look);
      const p0 = m.pos && validPos(m.pos); if (p0) { P.pos = p0; P.last = { ...p0, t }; }
      R.players.set(P.id, P);
      send(ws, { t: 'welcome', id: P.id, name: P.name, room: R.id, seq: R.seq, players: [...R.players.values()].filter(o => o !== P).map(pub), edits: [...R.edits].map(([k2, b]) => [...k2.split(',').map(Number), b]) });
      toRoom(R, { t: 'join', player: pub(P) }, P);
      log('aangemeld', R.id, P.name, P.id, ip);
      return;
    }
    const R = P.room; if (!R) return strike(kind, 'eerst aanmelden');
    if (kind === 'pos') {
      const p = validPos(m); if (!p) return strike('pos', 'ongeldige positie');
      if (!plausibleMove(P.last, p, t)) { send(ws, { t: 'correct', ...P.pos }); return strike('pos', 'te snel verplaatst'); }
      P.pos = p; P.last = { ...p, t };
      return toRoom(R, { t: 'pos', id: P.id, ...p }, P);
    }
    if (kind === 'build') {
      const v = validBuild(m, P); if (!v.ok) return strike('build', v.why);
      const { x, y, z, b } = v.ok, key = x + ',' + y + ',' + z;
      if (!R.edits.has(key) && R.edits.size >= MAX_EDITS) return strike('build', 'wereld vol (te veel wijzigingen)');
      R.edits.set(key, b); R.seq++; R.dirty = true;
      return toRoom(R, { t: 'build', id: P.id, x, y, z, b, seq: R.seq }); // ook naar de bouwer zelf: zelfde volgorde voor iedereen
    }
    if (kind === 'chat') {
      const text = cleanChat(m.text); if (!text) return strike('chat', 'lege of ongeldige tekst');
      return toRoom(R, { t: 'chat', id: P.id, name: P.name, text });
    }
    if (kind === 'look') {
      const l = validLook(m); if (!l) return strike('look', 'ongeldig');
      return toRoom(R, { t: 'look', id: P.id, name: P.name, ...l });
    }
    strike(kind, 'onbekend bericht');
  });
  ws.on('close', () => {
    perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
    const R = P.room; if (!R) return;
    R.players.delete(P.id); toRoom(R, { t: 'leave', id: P.id });
    log('weg', R.id, P.name);
    if (!R.players.size) { try { saveRoom(R); } catch { /* volgende keer */ } }
  });
  ws.on('error', () => {});
});
const stop = () => { for (const R of rooms.values()) try { saveRoom(R); } catch { /* */ } process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
httpServer.listen(PORT, HOST, () => log(`TERRANOVA multiplayer (prototype) op ${HOST}:${PORT}, gegevens in ${DATA}${TOKEN ? ', met toegangswachtwoord' : ''}${ORIGINS.length ? ', origins ' + ORIGINS.join(' ') : ''}`));
