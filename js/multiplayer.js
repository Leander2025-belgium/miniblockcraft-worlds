// Samen spelen (proef) — client voor de optionele multiplayerserver (server/mp-server.mjs), TERRANOVA 16 fase 9.
//
// Alleen actief als de speler het zelf start (pauzemenu → "👥 Samen spelen (proef)") met het adres van een server.
// Zonder server verandert er niets: de game blijft volledig offline en zonder account werken.
//
// Wat gesynchroniseerd wordt: posities (± 10 per seconde, vloeiend tussen twee berichten), het uiterlijk, bouwacties
// (via js/build.js: de server bevestigt en nummert ze; alle spelers passen ze in dezelfde volgorde toe), chat en
// "samen bekijken" (een voertuig delen). Bouwacties van anderen komen niet in je eigen ongedaan-maak-geschiedenis.
// Kamer = de wereld die je speelt: wie dezelfde wereld opent, ziet elkaar.
import * as THREE from 'three';
import { Avatar, DEFAULT_LOOK } from './avatar.js';

const SEND_EVERY = 0.1;

export class Multiplayer {
  constructor(game, { url, name, token, room }) {
    this.g = game; this.url = url; this.name = name; this.token = token || ''; this.room = room;
    this.others = new Map(); this.chat = []; this.status = 'verbinden'; this.t = 0; this.sent = null; this.applying = false;
    this.stats = { verzonden: 0, ontvangen: 0, gebouwd: 0, ontvangenBouw: 0, geweigerd: 0 };
    this.labels = new THREE.Group(); game.scene.add(this.labels);
  }
  connect() {
    return new Promise((resolve) => {
      let ws; try { ws = new WebSocket(this.url); } catch (e) { this.status = 'mislukt: ' + e.message; return resolve(false); }
      this.ws = ws;
      const tm = setTimeout(() => { if (this.status === 'verbinden') { this.status = 'geen antwoord van de server'; try { ws.close(); } catch { /* */ } resolve(false); } }, 8000);
      ws.onopen = () => {
        const p = this.g.player;
        this.send({ t: 'hello', name: this.name, room: this.room, token: this.token || undefined, look: this.g.settings.look || DEFAULT_LOOK, pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw } });
      };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.stats.ontvangen++; this.onMessage(m, () => { clearTimeout(tm); resolve(true); }); };
      ws.onclose = (e) => { clearTimeout(tm); if (this.status === 'verbinden') resolve(false); this.status = 'verbroken' + (e.reason ? ': ' + e.reason : ''); this.cleanup(); this.g.toast?.('👥 Verbinding met de server verbroken'); };
      ws.onerror = () => { if (this.status === 'verbinden') this.status = 'kan niet verbinden met ' + this.url; };
    });
  }
  send(m) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(m)); this.stats.verzonden++; } }
  onMessage(m, ok) {
    if (m.t === 'welcome') {
      this.id = m.id; this.myName = m.name; this.status = 'verbonden';
      for (const p of m.players) this.addOther(p);
      this.applyEdits(m.edits);
      this.g.toast?.(`👥 Verbonden als ${m.name} · ${m.players.length} andere speler${m.players.length === 1 ? '' : 's'}`);
      ok();
    } else if (m.t === 'join') { this.addOther(m.player); this.say(`${m.player.name} doet mee`); }
    else if (m.t === 'leave') { const o = this.others.get(m.id); if (o) { this.say(`${o.name} is weg`); o.av.dispose(); o.label?.removeFromParent(); this.others.delete(m.id); } }
    else if (m.t === 'pos') { const o = this.others.get(m.id); if (o) { o.from = { ...o.cur }; o.to = m; o.k = 0; o.fly = m.fly; } }
    else if (m.t === 'build') { this.stats.ontvangenBouw++; if (m.id !== this.id) this.applyEdits([[m.x, m.y, m.z, m.b]]); }
    else if (m.t === 'chat') this.say(`${m.name}: ${m.text}`, true);
    else if (m.t === 'look') { this.lastLook = m; this.say(`👀 ${m.name} bekijkt ${m.what}`); }
    else if (m.t === 'reject') { this.stats.geweigerd++; this.lastReject = m; if (m.what === 'build' || m.what === 'hello') this.g.toast?.(`👥 Geweigerd door de server: ${m.why}`); }
    else if (m.t === 'correct') { this.g.player.pos.set(m.x, m.y, m.z); }
  }
  say(text, chat) { this.chat.push({ text, chat: !!chat, t: Date.now() }); if (this.chat.length > 50) this.chat.shift(); this.g.toast?.('👥 ' + text); }
  addOther(p) {
    if (this.others.has(p.id)) return;
    const av = new Avatar(this.g.scene, { ...DEFAULT_LOOK, ...(p.look || {}) });
    const pos = p.pos || { x: 0, y: -999, z: 0, yaw: 0 };
    const o = { id: p.id, name: p.name, av, cur: { ...pos }, from: { ...pos }, to: { ...pos }, k: 1, fly: false };
    o.label = makeLabel(p.name); this.labels.add(o.label);
    this.others.set(p.id, o);
  }
  // bouwacties van de server toepassen (niet in de eigen geschiedenis, niet terugsturen)
  applyEdits(list) {
    if (!list || !list.length) return;
    const w = this.g.world, B = this.g.builder; this.applying = true;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    try {
      for (const [x, y, z, b] of list) { if (w.get(x, y, z) === b) continue; w.set(x, y, z, b); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (x0 <= x1) B.remesh(x0, z0, x1, z1, list.length > 4000);
    } finally { this.applying = false; }
  }
  // door js/build.js aangeroepen bij elke eigen bouwactie
  localEdit(x, y, z, b) { if (this.applying || this.status !== 'verbonden') return; this.send({ t: 'build', x, y, z, b }); this.stats.gebouwd++; }
  sendChat(text) { this.send({ t: 'chat', text }); }
  shareLook(what, x, z) { this.send({ t: 'look', what, x, z }); }
  update(dt, light = 1) {
    if (this.status !== 'verbonden') return;
    const p = this.g.player;
    this.t += dt;
    if (this.t >= SEND_EVERY) {
      this.t = 0;
      const s = this.sent, moved = !s || Math.abs(s.x - p.pos.x) > 0.02 || Math.abs(s.y - p.pos.y) > 0.02 || Math.abs(s.z - p.pos.z) > 0.02 || Math.abs(s.yaw - p.yaw) > 0.02;
      if (moved) { this.sent = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }; this.send({ t: 'pos', ...this.sent, pitch: p.pitch, fly: !!p.fly }); }
    }
    // anderen vloeiend tussen de laatste twee posities (± 100 ms achter)
    for (const o of this.others.values()) {
      o.k = Math.min(1, o.k + dt / SEND_EVERY);
      const a = o.from, b = o.to, k = o.k;
      const prev = { ...o.cur };
      o.cur = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: b.yaw, pitch: b.pitch || 0 };
      const sp = Math.hypot(o.cur.x - prev.x, o.cur.z - prev.z) / Math.max(dt, 1e-3);
      const fake = { pos: o.cur, yaw: o.cur.yaw, pitch: o.cur.pitch };
      const near = Math.hypot(o.cur.x - p.pos.x, o.cur.z - p.pos.z) < 400;
      o.av.update(dt, fake, { speed: sp, onGround: !o.fly, inWater: false, fly: o.fly, vy: 0 }, light, near);
      o.label.visible = near; o.label.position.set(o.cur.x, o.cur.y + 2.3, o.cur.z);
    }
  }
  close() { try { this.ws?.close(1000, 'speler stopt'); } catch { /* */ } this.cleanup(); this.status = 'gestopt'; }
  cleanup() { for (const o of this.others.values()) o.av.dispose(); this.others.clear(); this.labels.clear(); }
}

// naamkaartje boven het hoofd (sprite met canvas-tekst)
function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = 'rgba(6,40,30,.78)'; x.beginPath(); x.roundRect?.(4, 8, 248, 48, 14); x.fill();
  x.fillStyle = '#d1fae5'; x.font = 'bold 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, transparent: true }));
  s.scale.set(2.2, 0.55, 1); s.renderOrder = 7; return s;
}
