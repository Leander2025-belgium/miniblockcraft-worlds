// The Megatower in de game: werkende liften (oproepknop, cabine, schuifdeuren, verdiepingskeuze, meerijden),
// deurbladen van open deuren, de naam van de kamer waar je bent, borden met uitleg.
// Wordt geladen door js/game.js als de wereld Megatower City is (spec.megatower).
import * as THREE from 'three';
import { B } from './blocks.js';
import { buildingAt, interiorBlock, metroStationAt, MEGA_HALL } from './megacity.js';
import { centraalBoard } from './megaplan.js';
import { periodOfHour, PERIOD_LABEL, DWELL, HEADWAY } from './service.js';
import { LIFTS, floorY, floorAt, floorLabel, roomAt, CX, CZ, zoneOf, ZONE_NAMES, inTowerBox, F_MIN } from './megatower.js';

const FLOOR_NAMES = { '-25': 'Techniek', '-15': 'Parking', '-5': 'Logistiek', '-4': 'Metro', '-3': 'Metrohal', '-2': 'Winkels B2', '-1': 'Winkels B1', 0: 'Lobby', 1: 'Mezzanine', 20: 'Congres',
  30: 'Hotelreceptie', 31: 'Restaurant', 32: 'Conferentie', 33: 'Zwembad', 35: 'Fitness & spa', 80: 'Woonlobby', 120: 'Sky lobby', 121: 'Sky garden', 150: 'Sky lobby', 200: 'Penthouses', 230: 'Sky lounge', 248: 'Observatie' };
const doorKey = (ci, cj) => (ci + 64) * 256 + cj + 64;

export class MegaView {
  constructor(g) {
    this.g = g;
    this.group = new THREE.Group(); g.scene.add(this.group);
    this.S = LIFTS.map((L) => {
      const f0 = L.stops.has(0) ? 0 : L.fmin;
      return { L, f: f0, y: floorY(f0), v: 0, target: null, door: 0, want: 0, hold: 0, ride: false };
    });
    this.doorCells = new Map(); this.shaftCells = new Map();
    this.S.forEach((S, i) => {
      const { ci0, cj0 } = S.L.cells;
      for (let k = 0; k < 3; k++) this.doorCells.set(doorKey(ci0 + k, S.L.door.cj), i);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) this.shaftCells.set(doorKey(ci0 + a, cj0 + b), i);
    });
    // materialen (licht binnen: niet afhankelijk van de zon)
    const M = (c) => new THREE.MeshBasicMaterial({ color: c });
    this.mats = { steel: M(0xb9c0c8), dark: M(0x3a3f46), light: M(0xfff3d6), mirror: M(0x9fb4c4), wood: M(0x8a6040), glass: new THREE.MeshBasicMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.35, depthWrite: false }), leaf: M(0x7a4e2c) };
    // cabines
    this.cabs = this.S.map((S) => {
      const c = new THREE.Group(), glass = !!S.L.glass;
      const add = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); c.add(o); return o; };
      const back = S.L.out[1] < 0 ? 1 : -1; // achterwand: weg van de deur
      add(2.96, 0.12, 2.96, 0, -0.06, 0, this.mats.dark);
      add(2.96, 0.08, 2.96, 0, 2.96, 0, this.mats.steel);
      add(1.6, 0.03, 1.0, 0, 2.91, 0, this.mats.light);
      add(2.96, 2.9, 0.06, 0, 1.45, back * 1.45, glass ? this.mats.glass : this.mats.mirror);
      add(0.06, 2.9, 2.96, -1.45, 1.45, 0, glass ? this.mats.glass : this.mats.wood);
      add(0.06, 2.9, 2.96, 1.45, 1.45, 0, glass ? this.mats.glass : this.mats.wood);
      add(0.5, 0.05, 0.05, 1.3, 1.0, back * 1.3, this.mats.steel); // leuning
      S.cabDoors = [add(1.48, 2.0, 0.05, -0.74, 1.0, -back * 1.42, glass ? this.mats.glass : this.mats.steel), add(1.48, 2.0, 0.05, 0.74, 1.0, -back * 1.42, glass ? this.mats.glass : this.mats.steel)];
      c.visible = false; this.group.add(c);
      return c;
    });
    // schuifdeuren op de verdiepingen rond de speler (2 panelen per deur)
    this.landN = 2 * LIFTS.length * 13;
    this.land = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 2.0, 0.1), this.mats.steel, this.landN);
    this.land.count = 0; this.land.frustumCulled = false; this.group.add(this.land);
    // deurbladen van open deuren
    this.leaves = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.98, 0.94), this.mats.leaf, 96);
    this.leaves.count = 0; this.leaves.frustumCulled = false; this.group.add(this.leaves);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    this.doorsDirty = true; this.doorT = 0; this.room = null; this.panelFor = null; this.opened = new Map();
    this.makePanel();
  }
  dispose() { this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.group.removeFromParent(); this.panel?.remove(); this.rideHud?.remove(); }

  // ---------- botsingen: gesloten liftdeuren en de vloer van de cabine ----------
  solid(x, y, z) {
    const ci = x - CX, cj = z - CZ;
    if (ci < -48 || ci >= 48 || cj < -48 || cj >= 48) return false;
    const k = doorKey(ci, cj);
    let i = this.doorCells.get(k);
    if (i != null) {
      const S = this.S[i], f = floorAt(y), dy = y - floorY(f);
      if ((dy === 0 || dy === 1) && S.L.stops.has(f)) return !(S.f === f && S.target == null && S.door > 0.8);
      return false;
    }
    i = this.shaftCells.get(k);
    if (i != null) { const S = this.S[i]; if (S.target == null && y === floorY(S.f) - 1) return true; }
    return false;
  }
  // ---------- liftknop ----------
  liftAtButton(t) {
    const ci = t.x - CX, cj = t.z - CZ, f = floorAt(t.y);
    const S = this.S.find(Q => Q.L.button[0] === ci && Q.L.button[1] === cj && Q.L.stops.has(f));
    return S ? { S, f } : null;
  }
  buttonAction(t) {
    const r = this.liftAtButton(t);
    if (!r) return { label: 'Liftknop', run: () => this.g.toast('Deze lift stopt hier niet') };
    const { S, f } = r;
    return { label: `${S.L.name} roepen`, run: () => this.call(S, f) };
  }
  call(S, f) {
    if (S.ride) { this.g.toast('🛗 De lift is bezet'); return; }
    if (S.target == null && S.f === f) { S.want = 1; S.hold = 8; this.g.toast(`🛗 ${S.L.name} · de deuren gaan open`); return; }
    S.target = f; S.want = 0;
    const secs = Math.round(Math.abs(floorY(f) - S.y) / S.L.speed + 4);
    this.g.toast(`🛗 ${S.L.name} komt eraan van verdieping ${floorLabel(S.f)} · ±${secs} s`);
  }
  // ---------- per frame ----------
  // navigatie van de reisplanner (js/megaplan.js): pijl en afstand bovenaan
  updateNav() {
    const el = document.getElementById('nav-hud'); if (!el) return;
    if (!this.navTo) { if (this.navShown) { el.hidden = true; this.navShown = false; } return; }
    const p = this.g.player.pos, dx = this.navTo.x - p.x, dz = this.navTo.z - p.z, d = Math.hypot(dx, dz);
    if (d < 25) { this.g.toast(`🚉 Je bent bij ${this.navTo.name}`); this.navTo = null; el.hidden = true; return; }
    const ang = Math.atan2(dx, -dz) - (-this.g.player.yaw), arrows = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'], k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    el.hidden = false; this.navShown = true; el.textContent = `🧭 ${this.navTo.name}: ${arrows[k]} ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`;
  }
  update(dt) {
    const g = this.g, p = g.player.pos;
    this.updateNav();
    const near = inTowerBox(p.x, p.z) || Math.hypot(p.x - CX, p.z - CZ) < 120;
    for (let i = 0; i < this.S.length; i++) {
      const S = this.S[i], L = S.L;
      // deuren
      const want = S.target != null ? 0 : S.want;
      S.door = Math.max(0, Math.min(1, S.door + (want ? 1 : -1) * dt / 1.4));
      if (S.target == null && S.door >= 1) { S.hold -= dt; if (S.hold <= 0 && !this.inCab(S)) S.want = 0; }
      // rijden (met optrekken en afremmen)
      if (S.target != null && S.door <= 0) {
        const ty = floorY(S.target), d = ty - S.y, dist = Math.abs(d);
        const acc = L.speed > 10 ? 1.6 : 1.1, vmax = Math.min(L.speed, Math.sqrt(2 * acc * dist) + 0.3);
        S.v = Math.min(vmax, S.v + acc * dt);
        const step = Math.min(dist, S.v * dt);
        S.y += Math.sign(d) * step;
        S.f = floorAt(Math.round(S.y));
        if (dist - step < 0.01) { S.y = ty; S.f = S.target; S.target = null; S.v = 0; S.want = 1; S.hold = 8; if (S.ride) this.arrive(S); }
      }
      // cabine tonen als je in de buurt bent
      const cab = this.cabs[i];
      cab.visible = near && Math.abs(S.y - p.y) < 90;
      if (cab.visible) {
        cab.position.set(CX + L.cells.ci0 + 1.5, S.y, CZ + L.cells.cj0 + 1.5);
        const o = 0.74 + S.door * 0.7;
        S.cabDoors[0].position.x = -o; S.cabDoors[1].position.x = o;
      }
    }
    // speler in een cabine? dan het keuzemenu
    const inS = this.S.find(S => this.inCab(S) && S.target == null);
    if (inS && !this.riding) { if (this.panelFor !== inS) this.showPanel(inS); if (S_open(inS)) inS.hold = Math.max(inS.hold, 2); }
    else if (!this.riding && this.panelFor) this.hidePanel();
    // meerijden: de speler en de camera op de nieuwe hoogte van de cabine (geen beeld achterstand)
    if (this.riding) { this.updateRide(); g.placeCamera(); }
    if (near) this.drawLanding(); else this.land.count = 0;
    this.doorT -= dt;
    if (near && (this.doorT <= 0 || this.doorsDirty)) { this.doorT = 0.5; this.doorsDirty = false; this.drawLeaves(); }
    if (!near) this.leaves.count = 0;
    this.updateRoom();
    this.updateBuildings();
  }
  inCab(S) {
    const p = this.g.player.pos, { ci0, cj0 } = S.L.cells;
    const x = p.x - CX - ci0, z = p.z - CZ - cj0;
    return x > 0 && x < 3 && z > 0 && z < 3 && Math.abs(p.y - S.y) < 0.7;
  }
  drawLanding() {
    const p = this.g.player.pos, fP = floorAt(Math.floor(p.y));
    let n = 0;
    for (const S of this.S) {
      const L = S.L, zc = CZ + L.door.cj + 0.5, x0 = CX + L.cells.ci0;
      for (let f = fP - 6; f <= fP + 6; f++) {
        if (!L.stops.has(f) || n + 2 > this.landN) continue;
        const open = (S.f === f && S.target == null) ? S.door : 0, y = floorY(f) + 1.0;
        for (const side of [0, 1]) {
          const x = x0 + (side ? 2.25 : 0.75) + (side ? 1 : -1) * open * 1.42;
          this.m4.compose(this.v3.set(x, y, zc), this.q.identity(), this.one);
          this.land.setMatrixAt(n++, this.m4);
        }
      }
    }
    this.land.count = n; this.land.instanceMatrix.needsUpdate = true;
  }
  drawLeaves() {
    const w = this.g.world, p = this.g.player.pos, px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    let n = 0;
    for (let y = py - 3; y <= py + 2 && n < 96; y++) for (let z = pz - 12; z <= pz + 12 && n < 96; z++) for (let x = px - 12; x <= px + 12 && n < 96; x++) {
      if (w.get(x, y, z) !== B.DOOR_OPEN) continue;
      // muur langs x of langs z? het blad draait 90° naar de vrije kant, scharnier aan de muur
      const alongX = w.solidAt(x - 1, y, z) || w.solidAt(x + 1, y, z);
      if (alongX) {
        const sz = w.solidAt(x, y, z + 1) ? -1 : 1;
        this.m4.compose(this.v3.set(x + 0.06, y + 0.99, z + 0.5 + sz * 0.5), this.q.identity(), this.one);
      } else {
        const sx = w.solidAt(x + 1, y, z) ? -1 : 1;
        this.q.setFromAxisAngle(this.v3.set(0, 1, 0), Math.PI / 2);
        this.m4.compose(this.v3.set(x + 0.5 + sx * 0.5, y + 0.99, z + 0.06), this.q, this.one);
        this.q.identity();
      }
      this.leaves.setMatrixAt(n++, this.m4);
    }
    this.leaves.count = n; this.leaves.instanceMatrix.needsUpdate = true;
  }
  // ---------- verdiepingskeuze ----------
  makePanel() {
    const el = document.createElement('div');
    el.id = 'lift-panel'; el.hidden = true;
    el.innerHTML = '<div class="lp-head"><b class="lp-name"></b><span class="lp-kind"></span></div><div class="lp-floors"></div><div class="lp-foot"><button class="btn lp-open">◀▶ Deuren open</button><button class="btn lp-close">▶◀ Deuren dicht</button></div>';
    (this.g.ui.root || document.body).appendChild(el);
    el.querySelector('.lp-open').onclick = () => { const S = this.panelFor; if (S) { S.want = 1; S.hold = 8; } };
    el.querySelector('.lp-close').onclick = () => { const S = this.panelFor; if (S) { S.want = 0; S.hold = 0; } };
    // klikken in het paneel mag het spel niet pauzeren of een blok breken
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.panel = el;
    const hud = document.createElement('div'); hud.id = 'lift-hud'; hud.hidden = true; (this.g.ui.root || document.body).appendChild(hud); this.rideHud = hud;
  }
  showPanel(S) {
    this.panelFor = S;
    const el = this.panel, L = S.L;
    el.querySelector('.lp-name').textContent = '🛗 ' + L.name;
    el.querySelector('.lp-kind').textContent = ` · ${L.kind} · ${L.speed} m/s · verdiepingen ${floorLabel(L.fmin)} t/m ${floorLabel(L.fmax)}`;
    const box = el.querySelector('.lp-floors');
    box.innerHTML = '';
    const list = [...L.floors].sort((a, b) => b - a);
    for (const f of list) {
      const b = document.createElement('button');
      b.className = 'lp-f' + (f === S.f ? ' cur' : '');
      const nm = FLOOR_NAMES[f];
      b.innerHTML = `<b>${floorLabel(f)}</b>${nm && L.floors.length < 60 ? `<small>${nm}</small>` : ''}`;
      b.title = ZONE_NAMES[zoneOf(f)];
      b.onclick = (e) => { e.stopPropagation(); this.choose(S, f); };
      box.appendChild(b);
    }
    el.hidden = false;
    this.g.toast(this.g.touch ? '🛗 Kies een verdieping' : '🛗 Kies een verdieping (muis vrijgeven met Esc als nodig)');
    if (!this.g.touch && document.pointerLockElement) document.exitPointerLock?.();
  }
  hidePanel() { this.panelFor = null; this.panel.hidden = true; }
  choose(S, f) {
    if (f === S.f) { S.want = 1; S.hold = 8; return; }
    S.target = f; S.ride = true; this.riding = S; S.want = 0;
    this.g.prefetchInterior(CX + S.L.cells.ci0 + 1.5, floorY(f) + 1, CZ + S.L.cells.cj0 + 1.5); // bestemming al opbouwen
    this.hidePanel();
    this.g.resume?.();
    this.rideHud.hidden = false;
  }
  // tijdens de rit: de speler staat in de cabine (geen natuurkunde), de camera rijdt mee
  updateRide() {
    const S = this.riding, p = this.g.player;
    if (!S) return false;
    const { ci0, cj0 } = S.L.cells;
    p.pos.x = Math.max(CX + ci0 + 0.35, Math.min(CX + ci0 + 2.65, p.pos.x));
    p.pos.z = Math.max(CZ + cj0 + 0.35, Math.min(CZ + cj0 + 2.65, p.pos.z));
    p.pos.y = S.y + 0.001; p.vel.set(0, 0, 0); p.fly = false; p.onGround = true;
    const dir = S.target == null ? '' : floorY(S.target) > S.y ? '▲' : '▼';
    this.rideHud.textContent = `🛗 ${S.L.name} ${dir} · verdieping ${floorLabel(floorAt(Math.round(S.y)))}${S.target != null ? ' → ' + floorLabel(S.target) : ''} · ${S.v.toFixed(1)} m/s · ${Math.round(S.y - floorY(0))} m`;
    return true;
  }
  arrive(S) {
    S.ride = false; this.riding = null; this.rideHud.hidden = true;
    this.g.toast(`🛗 Verdieping ${floorLabel(S.f)} · ${FLOOR_NAMES[S.f] || ZONE_NAMES[zoneOf(S.f)]}`);
  }
  // ---------- torens en bouwblokken in de stad: binnen opbouwen rond de speler ----------
  // De blokken boven het gelijkvloers zijn 'verlichte kamers' (licht om te tekenen). Ben je binnen, dan worden de
  // verdiepingen rond jou (6 m eronder tot 10 m erboven) echte ruimtes; ga je weg, dan weer licht (niet bewaard,
  // behalve wat je zelf bouwt).
  updateBuildings() {
    const g = this.g, p = g.player.pos, now = performance.now();
    if (now - (this.bT || 0) < 300) return;
    this.bT = now;
    const bd = inTowerBox(p.x, p.z) ? null : buildingAt(Math.floor(p.x), Math.floor(p.z));
    const want = bd && p.y > g.meta.ground - 1 ? { bd, lo: Math.floor(p.y) - 6, hi: Math.floor(p.y) + 10 } : null;
    const cur = this.open;
    if (cur && (!want || want.bd.key !== cur.bd.key)) { this.setRows(cur.bd, cur.lo, cur.hi, false); this.open = null; }
    if (!want) return;
    if (this.open) {
      const o = this.open;
      // kleine bewegingen: niets doen, behalve als een tegel van het gebouw pas later geladen werd (of opnieuw):
      // dan de open verdiepingen opnieuw openen (anders blijven de kamers dicht en kan de lift niet omhoog)
      if (Math.abs(want.lo - o.lo) < 3) { if (o.partial || now - (o.t || 0) > 2000) { o.t = now; o.partial = this.setRows(o.bd, o.lo, o.hi, true); } return; }
      this.setRows(o.bd, Math.max(o.lo, want.hi + 1), o.hi, false); this.setRows(o.bd, o.lo, Math.min(o.hi, want.lo - 1), false);
      this.setRows(want.bd, Math.max(want.lo, o.hi + 1), want.hi, true); this.setRows(want.bd, want.lo, Math.min(want.hi, o.lo - 1), true);
      o.lo = want.lo; o.hi = want.hi;
    } else { want.partial = this.setRows(want.bd, want.lo, want.hi, true); want.t = now; this.open = want; if (!this.toldBuilding) { this.toldBuilding = true; g.toast('🏢 Binnen: ga op het liftblok in de kern staan en spring om naar boven te gaan (Shift = omlaag)'); } }
  }
  setRows(bd, lo, hi, open) {
    if (hi < lo) return;
    const g = this.g, w = g.world, chunks = new Set();
    let missing = false;
    for (let z = bd.z0; z < bd.z1; z++) for (let x = bd.x0; x < bd.x1; x++) {
      const t = w.tileAt(x, z); if (!t || !t.w.vox) { missing = true; continue; }
      const lx = x - t.ox, lz = z - t.oz;
      let touched = false;
      for (let y = lo; y <= hi; y++) {
        const b = t.w.get(lx, y, lz);
        const key = (x * 10240 + z) * 4096 + y;
        if (open) { if (b === B.ROOM_FILL) { const nb = interiorBlock(bd, x, y, z); t.w.set(lx, y, lz, nb); this.opened.set(key, nb); touched = true; } }
        else if (this.opened.has(key)) { if (b === this.opened.get(key)) { t.w.set(lx, y, lz, B.ROOM_FILL); touched = true; } this.opened.delete(key); }
      }
      if (touched) chunks.add(t.key + '|' + Math.floor(lx / 16) + '|' + Math.floor(lz / 16));
    }
    for (const k of chunks) {
      const [key, cx, cz] = k.split('|'); const t = [...w.tiles.values()].find(q => q.key === key); if (!t) continue;
      t.w.recomputeTop(+cx, +cz);
      g.queue.push([t, +cx, +cz]);
    }
    return missing; // true: een deel van het gebouw was nog niet geladen
  }
  // ---------- waar ben ik ----------
  updateRoom() {
    const p = this.g.player.pos, now = performance.now();
    if (now - (this.roomT || 0) < 300) return;
    this.roomT = now;
    const r = inTowerBox(p.x, p.z) && p.y > floorY(F_MIN) - 2 ? roomAt(p.x, p.y + 0.5, p.z) : null;
    this.where = r;
    const name = r && r.inside ? r.room : null;
    if (name !== this.room) {
      this.room = name;
      if (name && /^(Kamer|Suite|Appartement|Woning|Duplex|Penthouse|Exclusieve|Studio)/.test(name)) this.g.toast(`🏠 ${name}${r.style ? ' · ' + r.style : ''}`);
    }
  }
  hudText() {
    const r = this.where;
    if (!r || !r.inside) return null;
    return `🏢 Verdieping ${r.label} · ${r.room}`;
  }
  roomNear(t) { const r = roomAt(t.x + 0.5, t.y + 0.5, t.z + 0.5); return r && r.room && r.room !== 'Liftlobby' ? r.room : null; }
  signText(t) {
    // stationshal en perrons van Megatower Centraal
    if (t.x >= MEGA_HALL.x0 - 300 && t.x <= MEGA_HALL.x1 + 120 && t.z >= MEGA_HALL.z0 - 2 && t.z <= MEGA_HALL.z1 + 2 && t.y > this.g.meta.ground + 4) return centraalBoard(this.g.settings.hour ?? 12);
    const ms = t.y < this.g.meta.ground - 6 ? metroStationAt(t.x, t.z) : null;
    if (ms) {
      const tr = this.g.traffic, per = periodOfHour(this.g.settings.hour ?? 12), n = tr?.have?.metro ?? 0, full = tr?.full?.metro ?? 0;
      const gap = HEADWAY[per].metro / 60;
      return `🚇 Metro M1 · station ${ms.name}\nPerron 1 → ${ms.last} · perron 2 → ${ms.first}\n${PERIOD_LABEL[per]}: om de ${gap} min een metro · haltetijd ${DWELL[per].metro} s · in de buurt ${n} van max. ${full} in dienst\nOverstap Megatower (B3) en Luchthaven (trein) · lift naar de straat aan het andere uiteinde van het perron`;
    }
    if (!inTowerBox(t.x, t.z)) return null;
    const f = floorAt(t.y), r = roomAt(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    const here = LIFTS.filter(L => L.stops.has(f)).map(L => L.name).join(', ');
    return `🪧 Verdieping ${floorLabel(f)} · ${ZONE_NAMES[zoneOf(f)]}${r && r.room ? ' · ' + r.room : ''}\nLiften hier: ${here || 'geen (neem de trap)'} · Trappen: oost- en westkant van de kern`;
  }
}
function S_open(S) { return S.door > 0.5; }
