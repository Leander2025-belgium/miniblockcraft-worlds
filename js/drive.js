// Voertuigen besturen of meerijden.
// - Trein en tram: bestuurderscabine op het echte spoor met tractie, rem, noodrem, wissels (links/rechtdoor/rechts),
//   deuren aan perrons, omroepen en rijrichting omkeren.
// - Auto en bus: vrij rijden met gas, rem/achteruit en sturen; het voertuig volgt de grond en botst tegen muren.
// - Meerijden: als passagier in elk voertuig dat in de buurt rijdt.
import * as THREE from 'three';

const KMH = 3.6;
let audio = null;
function ctx() {
  if (audio) return audio;
  try { const A = window.AudioContext || window.webkitAudioContext; audio = new A(); } catch { audio = null; }
  return audio;
}
function chime() {
  const a = ctx(); if (!a) return;
  [659, 523].forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, a.currentTime + i * 0.45); g.gain.linearRampToValueAtTime(0.18, a.currentTime + i * 0.45 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.45 + 0.9);
    o.connect(g).connect(a.destination); o.start(a.currentTime + i * 0.45); o.stop(a.currentTime + i * 0.45 + 1);
  });
}
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'nl-BE'; u.rate = 0.95;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('nl')); if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* geen spraak */ }
}

// vmax in m/s
const ROAD = { sedan: { L: 4.6, vmax: 38, acc: 4.2, wb: 2.75 }, hatch: { L: 4.0, vmax: 34, acc: 4, wb: 2.5 }, suv: { L: 4.7, vmax: 36, acc: 4.2, wb: 2.85 },
  van: { L: 5.1, vmax: 30, acc: 3.2, wb: 3.25 }, taxi: { L: 4.7, vmax: 38, acc: 4.2, wb: 2.8 }, bus: { L: 12, vmax: 22, acc: 1.8, wb: 5.8 } };

export class Drive {
  constructor(game, vehicle, mode) {
    this.g = game; this.mode = mode; this.cam = mode === 'passenger' ? 'seat' : 'cab';
    this.hud = document.getElementById('drive-hud');
    this.pad = document.getElementById('drive-pad');
    const tr = game.traffic;
    if (mode === 'passenger') {
      this.a = vehicle; vehicle.passenger = true;
      this.seat = vehicle.L ? Math.min(vehicle.L - 2, Math.max(2, vehicle.L * (vehicle.kind === 'car' ? 0.55 : 0.4))) : 2;
    } else if (vehicle.kind === 'train' || vehicle.kind === 'tram' || vehicle.kind === 'ship' || vehicle.kind === 'metro') {
      this.a = vehicle; this.rail = true;
      vehicle.player = { throttle: 0, brake: 0, emergency: false, doors: false };
      vehicle.v = vehicle.v || 0; vehicle.wait = 0; vehicle.reverseAfter = false;
      this.sw = 'straight'; vehicle.switchPref = 'straight';
      this.lastStopKey = null;
    } else {
      // auto of bus: van het netwerk halen en vrij besturen
      let c = vehicle;
      if (!vehicle.free) {
        const h = tr.behind(vehicle, vehicle.L / 2, {}), sec = vehicle.secs[0];
        const l = Math.hypot(h.tx, h.tz) || 1, dir = vehicle.route[0].dir;
        c = { free: true, m: sec.m, color: vehicle.color, x: h.x, y: h.y, z: h.z, yaw: Math.atan2(h.tx / l * dir, h.tz / l * dir), pitch: 0, speed: vehicle.v || 0, kind: vehicle.kind };
        vehicle.dead = true;
        tr.parked.push(c);
      }
      c.driving = true; this.car = c; this.spec = ROAD[c.m] || ROAD.sedan; this.steer = 0;
    }
    const p = game.player; p.yaw = 0; p.pitch = -0.05;
    p.fly = false; p.vel.set(0, 0, 0);
    this.show(true);
    this.t = 0;
    game.toast(mode === 'passenger' ? '🪑 Je rijdt mee. H = uitstappen · V = camera' : this.rail
      ? '🚆 Bestuurderscabine: W/▲ tractie · S/▼ rem · spatie noodrem · A/D wissel · Q deuren · N omroep · R richting · H uitstappen'
      : '🚗 Rijden: W gas · S rem/achteruit · A/D sturen · spatie handrem · H uitstappen · V camera');
    this.engine();
  }
  show(on) {
    if (this.hud) this.hud.hidden = !on;
    if (this.pad) { this.pad.hidden = !on || !this.g.touch; this.pad.dataset.mode = this.mode === 'passenger' ? 'pass' : this.rail ? 'rail' : 'road'; }
    this.g.ui.root.classList.toggle('driving', on);
  }
  engine() {
    const a = ctx(); if (!a || this.mode === 'passenger') return;
    try {
      this.osc = a.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 40;
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      this.gain = a.createGain(); this.gain.gain.value = 0;
      this.osc.connect(f).connect(this.gain).connect(a.destination); this.osc.start();
      if (a.state === 'suspended') a.resume();
    } catch { this.osc = null; }
  }
  camMode() { return 'first'; }
  cycleCam() {
    const order = this.mode === 'passenger' ? ['seat', 'chase'] : ['cab', 'chase', 'side'];
    this.cam = order[(order.indexOf(this.cam) + 1) % order.length];
    this.g.toast({ cab: '🎥 Cabine', seat: '🎥 Zitplaats', chase: '🎥 Achter het voertuig', side: '🎥 Zijkant' }[this.cam]);
  }
  // positie en richting van het voertuig op afstand s achter de neus
  railPose(s) {
    const tr = this.g.traffic, a = this.a, h = tr.behind(a, s, {});
    const b = tr.behind(a, s + 3, {});
    return { x: h.x, y: h.y, z: h.z, yaw: Math.atan2(h.x - b.x, h.z - b.z) };
  }
  placeCamera(cam) {
    const p = this.g.player;
    let pose, up, back;
    if (this.car) { const c = this.car; pose = { x: c.x, y: c.y, z: c.z, yaw: c.yaw }; up = this.spec === ROAD.bus ? 2.4 : 1.25; back = -this.spec.L * (this.spec === ROAD.bus ? 0.42 : 0.05); }
    else if (this.mode === 'passenger') { pose = this.railPose(this.seat); up = this.a.kind === 'car' ? 1.2 : this.a.kind === 'train' ? 2.3 : this.a.kind === 'metro' ? 2.1 : 1.9; back = 0; }
    else if (this.a.kind === 'ship' && this.vessel) {
      const v = this.vessel, br = v.g.bridge, w = v.toWorld(new THREE.Vector3(br[0] + 0.5, br[1] + 1.65, br[2] + 1.5), new THREE.Vector3());
      pose = { x: w.x, y: w.y - 1.62, z: w.z, yaw: v.yaw }; up = 1.62; back = 0;
    } else { pose = this.railPose(1.6); up = this.a.kind === 'train' ? 2.55 : 2.25; back = 0; }
    const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
    let x = pose.x + fx * back, y = pose.y + up, z = pose.z + fz * back;
    if (this.car && this.cam === 'cab') { x += fz * 0.38; z -= fx * 0.38; } // links zitten
    let yaw = pose.yaw + Math.PI + p.yaw, pitch = p.pitch;
    if (this.cam === 'chase') {
      const L = this.car ? this.spec.L : this.a.L * (this.a.kind === 'ship' ? 0.6 : 1);
      const q = this.car ? { x: pose.x - fx * (L * 0.5 + 7), y: pose.y, z: pose.z - fz * (L * 0.5 + 7) } : this.railPose(Math.min(L + 10, 70));
      x = q.x; y = q.y + (this.car ? 3.2 : 7); z = q.z; yaw = pose.yaw + Math.PI + p.yaw; pitch = -0.2 + p.pitch;
    } else if (this.cam === 'side') {
      x = pose.x + fz * 9; z = pose.z - fx * 9; y = pose.y + 3; yaw = pose.yaw + Math.PI / 2 + Math.PI + p.yaw; pitch = -0.1 + p.pitch;
    }
    cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0);
    p.pos.set(x, y - 1.62, z); // de speler zit in het voertuig
    return true;
  }
  update(dt) {
    const g = this.g, k = g.keys;
    this.t += dt;
    const up = k.has('KeyW') || k.has('ArrowUp') || g.joy.y < -0.4 || g.padUp;
    const down = k.has('KeyS') || k.has('ArrowDown') || g.joy.y > 0.4 || g.padDown;
    const left = k.has('KeyA') || k.has('ArrowLeft') || g.joy.x < -0.4 || g.padLeft;
    const right = k.has('KeyD') || k.has('ArrowRight') || g.joy.x > 0.4 || g.padRight;
    let speed = 0, info = '';
    if (this.rail) {
      const a = this.a, c = a.player;
      if (a.dead) { this.exit(); return; }
      c.throttle = up && !c.doors ? Math.min(1, c.throttle + dt * 0.8) : Math.max(0, c.throttle - dt * 1.5);
      c.brake = down ? Math.min(1, c.brake + dt * 1.2) : Math.max(0, c.brake - dt * 2);
      c.emergency = k.has('Space') || g.padStop;
      if (left !== this.leftWas && left) this.setSwitch(this.sw === 'right' ? 'straight' : 'left');
      if (right !== this.rightWas && right) this.setSwitch(this.sw === 'left' ? 'straight' : 'right');
      this.leftWas = left; this.rightWas = right;
      speed = a.v;
      const ns = a.nextStop;
      // omroep bij het naderen en bij aankomst
      if (ns && ns.dist < 400 && ns.dist > 40 && this.announced !== ns.key) { this.announced = ns.key; speak(`Volgende halte: ${ns.name}`); }
      if (ns && Math.abs(ns.dist - a.L / 2) < 25 && a.v < 0.3 && this.arrived !== ns.key) { this.arrived = ns.key; this.atStop = ns; chime(); setTimeout(() => speak(`${ns.name}. Uitstappen aan de rechterkant.`), 900); }
      if (this.atStop && a.v > 2) this.atStop = null;
      const bar = (v) => '▮'.repeat(Math.round(v * 8)).padEnd(8, '▯');
      info = `<div class="dh-row"><b>${{ train: '🚆 Trein', tram: '🚋 Tram', ship: '🚢 Schip', metro: '🚇 Metro' }[a.kind]}</b> · tractie ${bar(c.throttle)} · rem ${bar(c.brake)}${c.emergency ? ' · <b class="warn">NOODREM</b>' : ''}</div>
        <div class="dh-row">Wissel: <b>${{ left: '⬅ links', straight: '⬆ rechtdoor', right: 'rechts ➡' }[this.sw]}</b> · deuren: <b>${c.doors ? 'open' : 'dicht'}</b>${a.endOfLine ? ' · <b class="warn">einde spoor — R om te keren</b>' : ''}</div>
        <div class="dh-row">${ns ? `Volgende halte: <b>${ns.name}</b> · ${Math.max(0, Math.round(ns.dist - a.L / 2))} m` : 'Geen halte in zicht'}${this.atStop ? ' · <b class="ok">aan het perron — Q deuren</b>' : ''}</div>`;
    } else if (this.car) {
      const c = this.car, S = this.spec;
      const hand = k.has('Space') || g.padStop;
      if (up) c.speed += (c.speed < 0 ? 9 : S.acc * Math.max(0.1, 1 - c.speed / S.vmax)) * dt;
      else if (down) c.speed -= (c.speed > 0.5 ? 9 : 2.5) * dt;
      else c.speed *= Math.pow(0.6, dt);
      if (hand) c.speed *= Math.pow(0.05, dt);
      c.speed = Math.max(-6, Math.min(S.vmax, c.speed));
      const target = (left ? 1 : 0) - (right ? 1 : 0);
      this.steer += (target - this.steer) * Math.min(1, dt * 5);
      const maxSteer = 0.55 / (1 + Math.abs(c.speed) / 10);
      c.yaw += c.speed * Math.tan(this.steer * maxSteer) / S.wb * dt;
      this.moveCar(c, dt);
      speed = c.speed;
      info = `<div class="dh-row"><b>${c.m === 'bus' ? '🚌 Bus' : '🚗 Auto'}</b> · ${c.speed < -0.2 ? 'achteruit' : 'vooruit'}${hand ? ' · handrem' : ''}</div>`;
    } else {
      const a = this.a;
      if (a.dead) { this.exit(); return; }
      speed = a.v || 0;
      const ns = a.kind !== 'car' ? g.traffic.nextStop(a) : null;
      // omroepen in trein, tram en metro
      if (a.wait > 0 && a.atStop && this.lastAnn !== a.lastStop) { this.lastAnn = a.lastStop; chime(); setTimeout(() => speak(a.atStop), 700); this.saidNext = false; }
      if (a.wait > 0 && a.wait < 4 && !this.saidNext && ns) { this.saidNext = true; speak(`Volgende halte: ${ns.name}`); }
      if (!this.dest || this.t - (this.destT || 0) > 5) { this.destT = this.t; this.dest = g.traffic.terminus(a); }
      info = `<div class="dh-row"><b>🪑 Passagier</b> in ${{ car: 'een auto', bus: 'de bus', tram: 'de tram', train: 'de trein', metro: 'de metro', ship: 'het schip' }[a.kind]}${a.line ? ` · lijn <b>${a.line}</b>` : ''}${this.dest ? ` → <b>${this.dest}</b>` : ''}${a.doorsOpen ? ' · deuren open' : ''}${ns ? ` · volgende halte: <b>${ns.name}</b>` : ''}</div><div class="dh-row">H = uitstappen · V = camera</div>`;
    }
    if (this.gain) { const s = Math.abs(speed); this.gain.gain.value = Math.min(0.05, 0.012 + s * 0.0016); this.osc.frequency.value = 38 + s * (this.rail ? 4 : 7); }
    if (this.hud && this.t - (this.hudT || 0) > 0.15) {
      this.hudT = this.t;
      this.hud.innerHTML = `<div class="dh-speed">${Math.round(Math.abs(speed) * KMH)}<small> km/h</small></div><div class="dh-info">${info}</div>`;
    }
  }
  setSwitch(s) { this.sw = s; this.a.switchPref = s; this.g.toast({ left: '⬅ Wissel naar links', straight: '⬆ Wissel rechtdoor', right: 'Wissel naar rechts ➡' }[s]); }
  // grond onder een punt (eerste vaste blok van boven naar onder)
  ground(x, z, y) {
    const w = this.g.world, X = Math.floor(x), Z = Math.floor(z);
    for (let yy = Math.floor(y) + 2; yy > y - 8; yy--) if (w.solidAt(X, yy, Z)) return yy + 1;
    return y - 0.5;
  }
  moveCar(c, dt) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), S = this.spec;
    const nx = c.x + fx * c.speed * dt, nz = c.z + fz * c.speed * dt;
    // voor- en achteras
    const half = S.L * 0.4;
    const gf = this.ground(nx + fx * half, nz + fz * half, c.y), gb = this.ground(nx - fx * half, nz - fz * half, c.y);
    const ahead = c.speed >= 0 ? gf : gb;
    const w = this.g.world, bodyY = Math.floor(Math.max(gf, gb) + 0.6);
    const tip = c.speed >= 0 ? half + 0.8 : -half - 0.8;
    const blocked = ahead > c.y + 1.15 || w.solidAt(Math.floor(nx + fx * tip), bodyY, Math.floor(nz + fz * tip)) || w.solidAt(Math.floor(nx + fx * tip), bodyY + 1, Math.floor(nz + fz * tip));
    if (blocked) {
      if (Math.abs(c.speed) > 6) this.g.toast('💥 Botsing!');
      c.speed = -c.speed * 0.25;
      return;
    }
    c.x = nx; c.z = nz;
    const gy = (gf + gb) / 2;
    c.y += (gy - c.y) * Math.min(1, dt * 12);
    c.pitch = Math.atan2(gf - gb, half * 2);
  }
  // knoppen tijdens het rijden
  key(code) {
    if (code === 'KeyH') { this.exit(); return true; }
    if (code === 'KeyV') { this.cycleCam(); return true; }
    if (!this.rail) return false;
    const a = this.a, c = a.player;
    if (code === 'KeyQ') {
      if (a.v > 0.3) { this.g.toast('Deuren openen kan alleen stilstaand'); return true; }
      c.doors = !c.doors; chime();
      this.g.toast(c.doors ? '🚪 Deuren open' : '🚪 Deuren dicht');
      if (!c.doors && this.atStop) { a.lastStop = this.atStop.key; }
      return true;
    }
    if (code === 'KeyN') { const ns = a.nextStop; speak(ns ? `Volgende halte: ${ns.name}` : 'Welkom aan boord.'); return true; }
    if (code === 'KeyR') {
      if (a.v > 0.3) { this.g.toast('Eerst stoppen om van rijrichting te wisselen'); return true; }
      this.g.traffic.reverse(a); a.endOfLine = false; this.g.toast('↩ Rijrichting omgekeerd (andere cabine)');
      return true;
    }
    return false;
  }
  exit() {
    const g = this.g, p = g.player;
    if (this.vessel) { // terug naar de stuurhut, aan boord blijven
      if (this.a) this.a.player = null;
      try { this.osc?.stop(); } catch { /* al gestopt */ }
      this.show(false); g.drive = null;
      g.boardVessel(this.vessel);
      const br = this.vessel.g.bridge; p.loc.set(br[0] + 0.5, br[1] + 1.05, br[2] - 0.5);
      g.toast('Stuur losgelaten — je bent nog aan boord');
      return;
    }
    let x = p.pos.x, z = p.pos.z, y = p.pos.y, yaw = 0;
    if (this.car) { const c = this.car; c.driving = false; c.speed = 0; yaw = c.yaw; x = c.x + Math.cos(c.yaw) * 2.6; z = c.z - Math.sin(c.yaw) * 2.6; y = c.y; }
    else {
      const q = this.railPose(this.mode === 'passenger' ? this.seat : 4);
      yaw = q.yaw;
      // naast het voertuig, aan de kant waar plaats is (perron)
      const side = [3.4, -3.4, 4.6, -4.6].find(o => { const xx = q.x + Math.cos(q.yaw) * o, zz = q.z - Math.sin(q.yaw) * o; const gy = this.ground(xx, zz, q.y + 1.5); return Math.abs(gy - q.y) < 2.6; }) ?? 3.6;
      x = q.x + Math.cos(q.yaw) * side; z = q.z - Math.sin(q.yaw) * side; y = q.y;
      if (this.a) { this.a.player = null; this.a.passenger = false; if (this.a.v === 0 && this.rail) this.a.wait = 4; }
    }
    p.pos.set(x, this.ground(x, z, y + 2) + 0.05, z); p.vel.set(0, 0, 0); p.yaw = yaw + Math.PI / 2; p.pitch = 0; p.fly = false;
    try { this.osc?.stop(); } catch { /* al gestopt */ }
    this.show(false);
    g.drive = null;
    g.toast('Uitgestapt');
  }
}
