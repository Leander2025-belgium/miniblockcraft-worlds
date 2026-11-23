// Test van de multiplayerserver (prototype): start de echte server op een vrije poort met een tijdelijke map,
// verbindt echte WebSocket-clients en controleert aanmelden, posities, bouwen in één volgorde, weigeringen,
// rate limiting, chatfilter, toegangswachtwoord en opslag na herstart. node server/test-protocol.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { cleanName, cleanChat, validBuild, plausibleMove, tokenBucket, take, cleanAppearance } from './protocol.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const R = {}, fails = [];
const check = (name, ok, info) => { R[name] = ok ? 'ok' : 'FOUT' + (info ? ' ' + JSON.stringify(info) : ''); if (!ok) fails.push(name); };

// --- zuivere regels ---
check('naam', cleanName('Leander') === 'Leander' && cleanName('a') === null && cleanName('<script>') === null && cleanName('x'.repeat(20)) === null);
check('chatfilter', cleanChat('hallo\u0000 fuck') === 'hallo ****' && cleanChat('   ') === null && cleanChat('a'.repeat(500)).length === 200);
check('bouwbereik', !!validBuild({ x: 1, y: 10, z: 1, b: 3 }, { pos: { x: 1, y: 9, z: 1 } }).ok && validBuild({ x: 100, y: 10, z: 1, b: 3 }, { pos: { x: 1, y: 9, z: 1 } }).why === 'te ver weg' && validBuild({ x: 1.5, y: 10, z: 1, b: 3 }, { pos: { x: 1, y: 9, z: 1 } }).why);
check('snelheid', plausibleMove({ x: 0, y: 0, z: 0, t: 0 }, { x: 10, y: 0, z: 0 }, 1) && !plausibleMove({ x: 0, y: 0, z: 0, t: 0 }, { x: 5000, y: 0, z: 0 }, 1));
{ const b = tokenBucket(1, 2); check('ratelimiet', take(b, 0) && take(b, 0) && !take(b, 0) && take(b, 1.1)); }
check('uiterlijk', JSON.stringify(cleanAppearance({ shirt: '#ff0000', hat: 'cap', evil: 'x', hair: 'javascript:' })) === '{"shirt":"#ff0000","hat":"cap","backpack":false}');

// --- echte server ---
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-mp-'));
const PORT = 18000 + Math.floor(Math.random() * 2000);
const start = (env = {}) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [path.join(here, 'mp-server.mjs')], { env: { ...process.env, MP_PORT: String(PORT), MP_HOST: '127.0.0.1', MP_DATA: DATA, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => { if (/op 127\.0\.0\.1/.test(d)) res(p); });
  p.stderr.on('data', d => process.stderr.write(d)); p.on('exit', c => rej(new Error('server stopte ' + c)));
});
const client = (hello) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), C = { ws, msgs: [], wait: [] };
  ws.on('message', d => { const m = JSON.parse(d); C.msgs.push(m); for (const w of [...C.wait]) if (w.f(m)) { C.wait.splice(C.wait.indexOf(w), 1); w.res(m); } });
  C.next = (f, ms = 3000) => new Promise((r2, j2) => { const old = C.msgs.find(f); if (old) return r2(old); const w = { f, res: r2 }; C.wait.push(w); setTimeout(() => j2(new Error('geen antwoord')), ms); });
  C.send = (m) => ws.send(JSON.stringify(m));
  ws.on('open', async () => { if (hello) C.send({ t: 'hello', ...hello }); res(C); }); ws.on('error', rej);
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let srv = await start();
try {
  const A = await client({ name: 'Anna', room: 'proef', pos: { x: 0, y: 10, z: 0, yaw: 0 } });
  const wA = await A.next(m => m.t === 'welcome');
  const B = await client({ name: 'Anna', room: 'proef', pos: { x: 3, y: 10, z: 0, yaw: 0 }, look: { shirt: '#123456' } });
  const wB = await B.next(m => m.t === 'welcome');
  const joinA = await A.next(m => m.t === 'join');
  check('aanmelden', wA.id && wB.id && wA.id !== wB.id && wB.name !== 'Anna' && wB.players.length === 1 && joinA.player.name === wB.name && joinA.player.look.shirt === '#123456', { a: wA.name, b: wB.name });
  // positie van A komt bij B aan
  A.send({ t: 'pos', x: 1, y: 10, z: 0.5, yaw: 1 });
  const pB = await B.next(m => m.t === 'pos' && m.id === wA.id);
  check('positie', pB.x === 1 && pB.z === 0.5);
  // teleport (te snel) wordt geweigerd en gecorrigeerd
  A.send({ t: 'pos', x: 90000, y: 10, z: 0, yaw: 1 });
  const corr = await A.next(m => m.t === 'correct');
  check('te snel geweigerd', corr.x === 1, corr);
  // bouwen: allebei tegelijk op hetzelfde blok; iedereen krijgt dezelfde volgorde
  A.send({ t: 'build', x: 2, y: 11, z: 0, b: 5 }); B.send({ t: 'build', x: 2, y: 11, z: 0, b: 7 });
  await sleep(300);
  const seqA = A.msgs.filter(m => m.t === 'build').map(m => m.b + '@' + m.seq), seqB = B.msgs.filter(m => m.t === 'build').map(m => m.b + '@' + m.seq);
  check('zelfde bouwvolgorde', seqA.length === 2 && seqA.join() === seqB.join(), { seqA, seqB });
  // ongeldige bouwactie: te ver
  A.send({ t: 'build', x: 500, y: 11, z: 0, b: 5 });
  const rej = await A.next(m => m.t === 'reject' && m.what === 'build');
  check('bouwen te ver geweigerd', rej.why === 'te ver weg');
  // chat met filter, en rate limiting (buffer 3)
  for (let i = 0; i < 6; i++) A.send({ t: 'chat', text: i === 0 ? 'hallo shit' : 'spam ' + i });
  await sleep(300);
  const chats = B.msgs.filter(m => m.t === 'chat');
  check('chat gefilterd', chats[0] && chats[0].text === 'hallo ****', chats[0]);
  check('chat ratelimiet', chats.length === 3 && A.msgs.some(m => m.t === 'reject' && m.why === 'te snel'), chats.length);
  // samen een voertuig bekijken
  B.send({ t: 'look', what: 'bus B8', x: 10, z: 20 });
  const lk = await A.next(m => m.t === 'look');
  check('samen bekijken', lk.what === 'bus B8' && lk.name === wB.name);
  // rommel en onbekende berichten
  A.ws.send('geen json'); A.send({ t: 'hack' });
  await sleep(200);
  check('rommel geweigerd', A.msgs.filter(m => m.t === 'reject' && (m.why === 'geen JSON' || m.why === 'onbekend bericht')).length === 2);
  // weggaan
  B.ws.close(); const lv = await A.next(m => m.t === 'leave');
  check('weggaan', lv.id === wB.id);
  A.ws.close(); await sleep(300);
  // herstart: de bouwacties zijn bewaard (atomair geschreven)
  srv.kill('SIGTERM'); await sleep(500);
  srv = await start();
  const C = await client({ name: 'Cas', room: 'proef', pos: { x: 0, y: 10, z: 0, yaw: 0 } });
  const wC = await C.next(m => m.t === 'welcome');
  const last = seqA[1] && +seqA[1].split('@')[0];
  check('bewaard na herstart', wC.edits.length === 1 && wC.edits[0][3] === last && wC.seq === 2, wC.edits);
  C.ws.close();
  // toegangswachtwoord
  srv.kill('SIGTERM'); await sleep(500);
  srv = await start({ MP_TOKEN: 'geheim123' });
  const D = await client({ name: 'Dirk', room: 'proef', token: 'fout' });
  const rD = await D.next(m => m.t === 'reject');
  const E = await client({ name: 'Eva', room: 'proef', token: 'geheim123' });
  const wE = await E.next(m => m.t === 'welcome');
  check('toegangswachtwoord', rD.why === 'toegang geweigerd' && !!wE.id);
  E.ws.close();
} catch (e) { fails.push('uitzondering: ' + e.message); }
srv.kill('SIGTERM');
fs.rmSync(DATA, { recursive: true, force: true });
console.log('multiplayer:', JSON.stringify(R));
console.log(fails.length ? 'FOUT: ' + fails.join(', ') : 'alles goed');
process.exitCode = fails.length ? 1 : 0;
