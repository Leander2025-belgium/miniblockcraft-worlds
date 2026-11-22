// Voertuigen besturen of meerijden.
// - Trein en tram: bestuurderscabine op het echte spoor met tractie, rem, noodrem, wissels (links/rechtdoor/rechts),
//   deuren aan perrons, omroepen en rijrichting omkeren.
// - Auto en bus: vrij rijden met gas, rem/achteruit en sturen; het voertuig volgt de grond en botst tegen muren.
// - Meerijden: als passagier in elk voertuig dat in de buurt rijdt.
import * as THREE from 'three';
import { RailSound, bus, audioCtx } from './sound.js';
import { SEAT_SPOTS } from './vehicles.js';

const KMH = 3.6;
// TERRANOVA 16: versnelling en toerental (0..1) bij een snelheid in m/s, voor het motorgeluid
export function gearOf(speed, isBus = false) {
  const G = isBus ? [0, 4, 8, 13, 18, 30] : [0, 5, 10, 16, 23, 31, 60], s = Math.abs(speed);
  let gi = G.findIndex((v, i) => i > 0 && s < v); if (gi === -1) gi = G.length - 1;
  const lo = G[gi - 1], hi = G[gi];
  return { gear: gi, rpm: 0.25 + 0.75 * Math.min(1, (s - lo) / Math.max(1, hi - lo)) };
}
// één gedeelde AudioContext (js/sound.js): zo lopen alle geluiden via dezelfde mixer
function ctx() { return audioCtx(); }
function chime() {
  const a = ctx(); if (!a) return;
  [659, 523].forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, a.currentTime + i * 0.45); g.gain.linearRampToValueAtTime(0.18, a.currentTime + i * 0.45 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.45 + 0.9);
    o.connect(g).connect(bus('effecten')); o.start(a.currentTime + i * 0.45); o.stop(a.currentTime + i * 0.45 + 1);
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

// binnenruimte per voertuigsoort (lokale maten in m, vanaf de spoorstaaf of de weg): vloer, plafond, halve binnenbreedte,
// zitplaats (afstand van de as, ooghoogte zittend). Komt overeen met de modellen in js/vehicles.js.
export const INTERIOR = {
  metro: { floor: 0.9, ceil: 3.05, half: 1.25, seatLat: 0.95, sitEye: 1.2 },
  tram: { floor: 0.38, ceil: 2.6, half: 1.05, seatLat: 0.72, sitEye: 1.15 },
  bus: { floor: 0.62, ceil: 2.75, half: 1.1, seatLat: 0.8, sitEye: 1.15 },
  train: { floor: 1.25, ceil: 3.45, half: 1.3, seatLat: 0.95, sitEye: 1.2 },
  car: { floor: 0.35, ceil: 1.45, half: 0.6, seatLat: 0.38, sitEye: 0.85 },
};
const CAM_NAMES = { seat: 'zittend', stand: 'staand', walk: 'rondlopen', window: 'raam', chase: 'buiten', cab: 'cabine', side: 'zijkant' };
export class Drive {
  constructor(game, vehicle, mode) {
    this.g = game; this.mode = mode; this.cam = mode === 'passenger' ? 'seat' : 'cab';
    this.hud = document.getElementById('drive-hud');
    this.pad = document.getElementById('drive-pad');
    const tr = game.traffic;
    if (mode === 'passenger') {
      this.a = vehicle; vehicle.passenger = true;
      this.seat = vehicle.L ? Math.min(vehicle.L - 2, Math.max(2, vehicle.L * (vehicle.kind === 'car' ? 0.55 : 0.4))) : 2;
      this.seatLat = null;
      // echte zitplaats uit het model (een rijtuig in het midden): boven de zitting, voor de rugleuning
      if (vehicle.secs) {
        const order = vehicle.secs.map((sc, i) => i).sort((i, j) => Math.abs(i - (vehicle.secs.length - 1) / 2) - Math.abs(j - (vehicle.secs.length - 1) / 2));
        for (const i of order) { const sc = vehicle.secs[i], sp = SEAT_SPOTS[sc.m]; if (!sp) continue; const z = sp[0].z * (sc.flip ? -1 : 1); this.seat = sc.off - z; this.seatLat = sp[0].lat * (sc.flip ? -1 : 1); this.seatFlip = !!sc.flip; this.spot = sp[0]; break; }
      }
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
        const sec = vehicle.secs[0], h = tr.behind(vehicle, sec.off ?? vehicle.L / 2, {});
        const l = Math.hypot(h.tx, h.tz) || 1, dir = vehicle.route[0].dir;
        c = { free: true, m: sec.m, doors: sec.doors, color: vehicle.color, x: h.x, y: h.y, z: h.z, yaw: Math.atan2(h.tx / l * dir, h.tz / l * dir), pitch: 0, speed: vehicle.v || 0, kind: vehicle.kind, L: vehicle.L };
        // gelede bus: de achterwagen hangt aan een scharnier achter de voorwagen
        const s2 = vehicle.secs[1];
        if (s2) {
          const h2 = tr.behind(vehicle, s2.off, {}), a = sec.len / 2 + 0.3, b = s2.off - sec.off - a;
          c.rear = { m: s2.m, doors: s2.doors, x: h2.x, y: h2.y, z: h2.z, yaw: Math.atan2(h.x - h2.x, h.z - h2.z), pitch: 0, a, b };
        }
        vehicle.dead = true;
        tr.parked.push(c);
      }
      this.bus = c.kind === 'bus' || /^bus/.test(c.m);
      c.driving = true; this.car = c; this.steer = 0;
      this.spec = this.bus ? { ...ROAD.bus, L: c.rear ? 11 : (c.L || 12), vmax: c.m === 'busCoach' ? 28 : 22, acc: c.m === 'busElec' ? 2.1 : 1.7 } : (ROAD[c.m] || ROAD.sedan);
      if (this.bus) { c.doorsOpen = false; this.ind = 0; }
    }
    const p = game.player; p.yaw = 0; p.pitch = -0.05;
    p.fly = false; p.vel.set(0, 0, 0);
    this.show(true);
    this.t = 0;
    game.toast(mode === 'passenger' ? '🪑 Je rijdt mee. H = uitstappen · V = camera' : this.rail
      ? '🚆 Bestuurderscabine: W/▲ tractie · S/▼ rem · spatie noodrem · A/D wissel · Q deuren · N omroep · R richting · H uitstappen'
      : this.bus ? '🚌 Bus besturen: W gas · S rem · A/D sturen · Q deuren · Z/C richtingaanwijzer · X alarmlichten · N omroep · spatie handrem · V camera · H uitstappen'
      : '🚗 Rijden: W gas · S rem/achteruit · A/D sturen · spatie handrem · H uitstappen · V camera');
    this.engine();
  }
  show(on) {
    if (this.hud) this.hud.hidden = !on;
    if (this.pad) { this.pad.hidden = !on || !this.g.touch; this.pad.dataset.mode = this.mode === 'passenger' ? 'pass' : this.rail ? 'rail' : this.bus ? 'bus' : 'road'; }
    this.g.ui.root.classList.toggle('driving', on);
  }
  engine() {
    const k = this.a && this.a.kind;
    if (k === 'train' || k === 'tram' || k === 'metro') { this.rs = new RailSound(k); return; }
    const a = ctx(); if (!a || this.mode === 'passenger') return;
    try {
      this.osc = a.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 40;
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      this.gain = a.createGain(); this.gain.gain.value = 0;
      this.osc.connect(f).connect(this.gain).connect(bus('voertuigen')); this.osc.start();
      if (a.state === 'suspended') a.resume();
    } catch { this.osc = null; }
  }
  camMode() { return 'first'; }
  cycleCam() {
    const order = this.mode === 'passenger' ? (this.a && this.a.kind === 'car' ? ['seat', 'chase'] : ['seat', 'stand', 'walk', 'window', 'chase']) : ['cab', 'chase', 'side'];
    this.cam = order[(order.indexOf(this.cam) + 1) % order.length];
    if (this.cam === 'walk') this.walk = { s: this.seat, lat: 0 };
    this.g.toast({ cab: '🎥 Cabine', seat: '🎥 Zittend bij het raam', stand: '🎥 Staand in het middenpad', walk: '🎥 Rondlopen: W/S vooruit en achteruit, A/D opzij', window: '🎥 Raam: langs het voertuig', chase: '🎥 Buiten het voertuig', side: '🎥 Zijkant' }[this.cam]);
  }
  // informatieschermen in het rijtuig waar je in zit (metro): lijn, bestemming en volgende halte, als echte tekst
  updateScreens(dt, a, ns) {
    if (a.kind !== 'metro' || this.mode !== 'passenger') return;
    const g = this.g;
    if (!this.scr) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 140;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex }), geo = new THREE.PlaneGeometry(0.62, 0.17);
      const meshes = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(geo, mat); g.scene.add(m); meshes.push(m); }
      this.scr = { c, tex, meshes, t: 99, text: '' };
    }
    const S = this.scr;
    S.t += dt;
    if (S.t > 1) {
      S.t = 0;
      const nd = ns ? Math.max(0, Math.round(ns.dist)) : null, txt = `${a.line || 'Metro'}${this.dest ? ' → ' + this.dest.replace(/^Metro /, '') : ''}|${ns ? 'Volgende: ' + ns.name.replace(/^Metro /, '') : 'Eindpunt'}${nd !== null ? ' · ' + (nd > 999 ? (nd / 1000).toFixed(1) + ' km' : nd + ' m') : ''}`;
      if (txt !== S.text) {
        S.text = txt; const x = S.c.getContext('2d'), [l1, l2] = txt.split('|');
        x.fillStyle = '#0d1b3d'; x.fillRect(0, 0, 512, 140); x.fillStyle = '#ffffff'; x.font = 'bold 44px system-ui, sans-serif'; x.fillText(l1, 14, 54);
        x.fillStyle = '#ffd24a'; x.font = '36px system-ui, sans-serif'; x.fillText(l2, 14, 112); S.tex.needsUpdate = true;
      }
    }
    // op de plaats van de schermen boven de 3 deuren van het rijtuig waar je zit (beide kanten van het scherm)
    const sec = a.secs.find(sc => this.seat >= sc.off - sc.len / 2 && this.seat <= sc.off + sc.len / 2) || a.secs[0];
    const doorZ = sec.m === 'metroCab' || sec.m === 'metro2Cab' ? [-5.7, -0.3, 5.1] : [-6, 0, 6], lift = 0.2;
    let k = 0;
    for (const dz of doorZ) {
      const z = dz * (sec.flip ? -1 : 1), q = this.railPose(sec.off - z);
      for (const face of [1, -1]) { const m = S.meshes[k++]; m.position.set(q.x + Math.sin(q.yaw) * 0.045 * face, q.y + lift + 2.82, q.z + Math.cos(q.yaw) * 0.045 * face); m.rotation.set(0, q.yaw + (face > 0 ? 0 : Math.PI), 0); }
    }
  }
  // camera nooit door de wereld: van een vast punt in het voertuig naar het doel, stoppen vóór het eerste vaste blok
  safeCam(ax, ay, az, bx, by, bz) {
    const w = this.g.world, d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(1, Math.ceil(d / 0.2));
    let k = 0;
    for (; k <= n; k++) { const f = k / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f; if (w.solidAt(Math.floor(x), Math.floor(y), Math.floor(z))) break; }
    const f = Math.max(0, (k - 2) / n); // 0,4 m voor het obstakel
    return [ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f];
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
    if (this.car) { const c = this.car; pose = { x: c.x, y: c.y, z: c.z, yaw: c.yaw }; up = this.bus ? 2.4 : 1.25; back = this.bus ? this.spec.L * 0.4 : -this.spec.L * 0.05; }
    else if (this.mode === 'passenger') {
      // passagier: zittend bij het raam, staand in het middenpad, rondlopen, raam (buiten langs het voertuig) of buiten
      const I0 = INTERIOR[this.a.kind] || INTERIOR.bus, L = this.a.L || 12, sp = this.spot, I = sp && sp.floor !== undefined ? { ...I0, floor: sp.floor, ceil: sp.ceil } : I0;
      if (this.cam === 'walk') {
        const k = this.g.keys, wk = this.walk || (this.walk = { s: this.seat, lat: 0 }), dt = Math.min(0.05, this.lastDt || 0.016);
        const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0), side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        const ly = p.yaw; // kijkrichting t.o.v. het voertuig
        wk.s = Math.max(0.9, Math.min(L - 0.9, wk.s - (Math.cos(ly) * fwd - Math.sin(ly) * side) * 1.4 * dt));
        wk.lat = Math.max(-I.half + 0.35, Math.min(I.half - 0.35, wk.lat + (Math.sin(ly) * fwd + Math.cos(ly) * side) * 1.4 * dt));
      }
      const s = this.cam === 'walk' ? this.walk.s : this.cam === 'window' ? L * 0.45 : this.seat;
      pose = this.railPose(s);
      const lat = this.cam === 'seat' ? (this.seatLat ?? I.seatLat) : this.cam === 'walk' ? this.walk.lat : 0;
      const cx = Math.cos(pose.yaw), cz = -Math.sin(pose.yaw);
      pose = { ...pose, x: pose.x + cx * lat, z: pose.z + cz * lat };
      const lift = this.a.kind === 'metro' || this.a.kind === 'train' ? 0.2 : this.a.kind === 'tram' ? 0.05 : 0; // zoals js/traffic.js het model tekent
      up = lift + Math.min(I.ceil - 0.15, I.floor + (this.cam === 'seat' ? I.sitEye : 1.62)); back = 0;
      this.seatLook = this.cam === 'seat' && !(sp && sp.look === 'fwd') ? ((this.seatLat ?? I.seatLat) >= 0 ? -Math.PI / 2 : Math.PI / 2) : (this.cam === 'seat' && this.seatFlip ? Math.PI : 0); // zittend: naar het middenpad en de ramen aan de overkant
      if (this.cam === 'window') {
        const out = I.half + 1.3, tx = pose.x + cx * out, ty = pose.y + I.floor + 1.3, tz = pose.z + cz * out;
        const [x, y, z] = this.safeCam(pose.x, pose.y + I.floor + 1.3, pose.z, tx, ty, tz);
        const yawW = pose.yaw + Math.PI + p.yaw + 0.25;
        cam.position.set(x, y, z); cam.rotation.set(p.pitch, yawW, 0);
        p.pos.set(x, y - 1.62, z); return true;
      }
    }
    else if (this.a.kind === 'ship' && this.vessel) {
      const v = this.vessel, br = v.g.bridge, w = v.toWorld(new THREE.Vector3(br[0] + 0.5, br[1] + 1.65, br[2] + 1.5), new THREE.Vector3());
      pose = { x: w.x, y: w.y - 1.62, z: w.z, yaw: v.yaw }; up = 1.62; back = 0;
    } else { pose = this.railPose(1.6); up = this.a.kind === 'train' ? 2.55 : 2.25; back = 0; }
    const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
    let x = pose.x + fx * back, y = pose.y + up, z = pose.z + fz * back;
    if (this.car && this.cam === 'cab') { const lat = this.bus ? 0.52 : 0.38; x += fz * lat; z -= fx * lat; } // links zitten (bus: op de chauffeursstoel achter het stuur, js/vehicles.js busCab)
    let yaw = pose.yaw + Math.PI + p.yaw + (this.seatLook || 0), pitch = p.pitch;
    if (this.cam === 'chase') {
      const L = this.car ? this.spec.L : this.a.L * (this.a.kind === 'ship' ? 0.6 : 1);
      const q = this.car ? { x: pose.x - fx * (L * 0.5 + 7), y: pose.y, z: pose.z - fz * (L * 0.5 + 7) } : this.railPose(Math.min(L + 10, 70));
      // nooit in een tunnelwand of -plafond: van het dak van het voertuig naar het doel, stoppen voor een blok
      const roof = pose.y + (this.car ? 2 : 3.2);
      [x, y, z] = this.safeCam(pose.x, roof, pose.z, q.x, q.y + (this.car ? 3.2 : 7), q.z);
      yaw = pose.yaw + Math.PI + p.yaw; pitch = -0.2 + p.pitch;
    } else if (this.cam === 'side') {
      [x, y, z] = this.safeCam(pose.x, pose.y + 3, pose.z, pose.x + fz * 9, pose.y + 3, pose.z - fx * 9); yaw = pose.yaw + Math.PI / 2 + Math.PI + p.yaw; pitch = -0.1 + p.pitch;
    }
    cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0);
    p.pos.set(x, y - 1.62, z); // de speler zit in het voertuig
    return true;
  }
  update(dt) {
    const g = this.g, k = g.keys;
    this.t += dt; this.lastDt = dt;
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
      const hand = k.has('Space') || g.padStop || (this.bus && c.doorsOpen);
      // grip van de weg (TERRANOVA 16, js/weather.js): nat, sneeuw of ijzel = trager optrekken en langer remmen
      const grip = g.grip ?? 1; this.grip = grip;
      if (up && !(this.bus && c.doorsOpen)) c.speed += (c.speed < 0 ? 9 : S.acc * Math.max(0.1, 1 - c.speed / S.vmax)) * (0.45 + 0.55 * grip) * dt;
      else if (down) c.speed -= (c.speed > 0.5 ? 9 * grip : 2.5) * dt;
      else c.speed *= Math.pow(0.6, dt);
      this.braking = !!(down && c.speed > 0.5) || !!(hand && Math.abs(c.speed) > 0.5);
      if (hand) c.speed *= Math.pow(0.05, dt);
      c.speed = Math.max(-6, Math.min(S.vmax, c.speed));
      const target = (left ? 1 : 0) - (right ? 1 : 0);
      this.steer += (target - this.steer) * Math.min(1, dt * 5);
      const maxSteer = 0.55 / (1 + Math.abs(c.speed) / 10);
      // weinig grip: de auto stuurt minder in bij snelheid (onderstuur)
      c.yaw += c.speed * Math.tan(this.steer * maxSteer) / S.wb * dt * (Math.abs(c.speed) > 8 ? 0.55 + 0.45 * grip : 1);
      this.moveCar(c, dt);
      speed = c.speed;
      if (this.bus) { this.busHud(dt, up, down, hand); speed = c.speed; info = null; }
      else info = `<div class="dh-row"><b>🚗 Auto</b> · ${c.speed < -0.2 ? 'achteruit' : 'vooruit'}${hand ? ' · handrem' : ''}</div>`;
    } else {
      const a = this.a;
      if (a.dead) { this.exit(); return; }
      speed = a.v || 0;
      const ns = a.kind !== 'car' ? (g.traffic.nextStopFar ? g.traffic.nextStopFar(a) : g.traffic.nextStop(a)) : null;
      this.updateScreens(dt, a, ns);
      // omroepen in trein, tram en metro
      if (a.wait > 0 && a.atStop && this.lastAnn !== a.lastStop) { this.lastAnn = a.lastStop; chime(); setTimeout(() => speak(a.atStop), 700); this.saidNext = false; }
      if (a.wait > 0 && a.wait < 4 && !this.saidNext && ns) { this.saidNext = true; speak(`Volgende halte: ${ns.name}`); }
      if (!this.dest || this.t - (this.destT || 0) > 5) { this.destT = this.t; const h0 = this.railPose(0), h1 = this.railPose(6); this.dest = (g.mega && g.mega.lineDest && g.mega.lineDest(a, h0.x - h1.x, h0.z - h1.z)) || g.traffic.terminus(a); }
      const kindName = { car: '🚗 Auto', bus: '🚌 Bus', tram: '🚋 Tram', train: '🚆 Trein', metro: '🚇 Metro', ship: '🚢 Schip' }[a.kind] || '🪑 Voertuig';
      const nd = ns ? Math.max(0, Math.round(ns.dist)) : null;
      info = `<div class="dh-row"><b>${kindName}</b>${a.line ? ` · lijn <b>${a.line}</b>` : ''}${this.dest ? ` → <b>${this.dest.replace(/^Metro /, '')}</b>` : ''}</div>
        <div class="dh-row">${ns ? `Volgende halte: <b>${ns.name.replace(/^Metro /, '')}</b> · ${nd > 1000 ? (nd / 1000).toFixed(1) + ' km' : nd + ' m'}` : 'Geen halte meer op deze rit'}</div>
        <div class="dh-row">🚪 Deuren <b>${a.doorsOpen ? 'open' : 'dicht'}</b> · 🎥 ${CAM_NAMES[this.cam] || this.cam}</div>
        ${a.trip ? `<div class="dh-row">🎫 Rit <b>${a.trip.id}</b> · 👥 <b>${a.trip.occ}</b>/${a.trip.cap} reizigers</div>` : ''}
        <div class="dh-row muted">V camera · H uitstappen${this.cam === 'walk' ? ' · WASD lopen' : ''}</div>`;
    }
    if (this.rs) { const c = this.a.player; const dv = speed - (this.rsV ?? speed); this.rsV = speed; this.rs.update(dt, speed, c ? c.throttle : dv > 0.002 ? 0.7 : 0.05, c ? (c.emergency ? 1 : c.brake) : dv < -0.004 ? 0.8 : 0, !['chase', 'side'].includes(this.cam)); }
    if (this.gain) {
      // TERRANOVA 16: toerental met versnellingen (auto en bus): het toerental stijgt per versnelling en zakt bij het schakelen
      const s = Math.abs(speed), up = !!(this.g.keys && (this.g.keys.has('KeyW') || this.g.keys.has('ArrowUp'))) || !!this.g.padUp;
      if (this.rail) { this.gain.gain.value = Math.min(0.05, 0.012 + s * 0.0016); this.osc.frequency.value = 38 + s * 4; }
      else {
        const { gear, rpm } = gearOf(s, this.bus); this.gear = gear; this.rpm = +(800 + rpm * (this.bus ? 1600 : 4200)).toFixed(0);
        this.osc.frequency.value = (this.bus ? 22 : 30) + rpm * (this.bus ? 38 : 75);
        this.gain.gain.value = Math.min(0.06, 0.014 + rpm * 0.02 + (up ? 0.012 : 0));
      }
    }
    if (this.hud && info !== null && this.t - (this.hudT || 0) > 0.15) {
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
    if (c.rear) {
      const r = c.rear, hx = c.x - fx * r.a, hz = c.z - fz * r.a;
      let dx = hx - r.x, dz = hz - r.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      r.x = hx - dx * r.b; r.z = hz - dz * r.b; r.yaw = Math.atan2(dx, dz);
      r.y += (this.ground(r.x, r.z, c.y) - r.y) * Math.min(1, dt * 12);
      // knikhoek begrenzen (scharnier max. ±50°)
      let k = ((c.yaw - r.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(k) > 0.87) { r.yaw = c.yaw - Math.sign(k) * 0.87; r.x = hx - Math.sin(r.yaw) * r.b; r.z = hz - Math.cos(r.yaw) * r.b; k = Math.sign(k) * 0.87; }
      this.knik = k;
    }
  }
  // ---------- bus: dashboard en bediening ----------
  busKey(code) {
    const c = this.car;
    if (code === 'KeyQ') {
      if (Math.abs(c.speed) > 0.4) { this.g.toast('Deuren openen kan alleen stilstaand'); return true; }
      c.doorsOpen = !c.doorsOpen; chime();
      if (c.doorsOpen && this.stop && this.stop.d < 25) { this.served = this.stop.key; this.g.toast(`🚏 Halte ${this.stop.name} bediend`); }
      else this.g.toast(c.doorsOpen ? '🚪 Deuren open' : '🚪 Deuren dicht');
      return true;
    }
    if (code === 'KeyZ') { this.ind = this.ind === -1 ? 0 : -1; return true; }
    if (code === 'KeyC') { this.ind = this.ind === 1 ? 0 : 1; return true; }
    if (code === 'KeyX') { this.ind = this.ind === 2 ? 0 : 2; return true; }
    if (code === 'KeyN') { speak(this.stop ? `Volgende halte: ${this.stop.name}` : 'Welkom aan boord.'); return true; }
    return false;
  }
  // volgende bushalte vóór de bus en het verkeerslicht dat erbij hoort
  busLook() {
    const c = this.car, tr = this.g.traffic, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let stop = null;
    for (const s of tr.stops || []) {
      if (s.kind !== 'busstop') continue;
      const dx = s.x - c.x, dz = s.z - c.z, d = Math.hypot(dx, dz), ahead = dx * fx + dz * fz;
      if (d > 700 || (ahead < -8 && d > 14) || (d > 30 && ahead < d * 0.6)) continue;
      const key = Math.round(s.x) + ',' + Math.round(s.z);
      if (key === this.served && d < 40) continue;
      if (!stop || d < stop.d) stop = { name: s.name || 'Halte', d, key };
    }
    let light = null;
    for (const sg of tr.signals || []) {
      const dx = sg.x - c.x, dz = sg.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (ahead < 2 || ahead > 90 || side > 14) continue;
      if (light && ahead > light.d) continue;
      const off = ((sg.x * 7 + sg.z * 13) % 40 + 40) % 40, ph = (tr.clock + off) % 44, axis = Math.abs(fx) > Math.abs(fz) ? 0 : 1;
      const green = axis === 0 ? ph < 19 : (ph >= 22 && ph < 41), amber = axis === 0 ? (ph >= 19 && ph < 22) : ph >= 41;
      light = { d: ahead, state: green ? 'groen' : amber ? 'oranje' : 'rood', sg };
    }
    return { stop, light };
  }
  busHud(dt, up, down, hand) {
    const c = this.car;
    this.blink = (this.blink || 0) + dt;
    this.lookT = (this.lookT || 0) - dt;
    if (this.lookT <= 0) { this.lookT = 0.3; const r = this.busLook(); this.stop = r.stop; this.light = r.light; }
    // door rood rijden?
    const L = this.light;
    if (L && L.state === 'rood' && L.d < 4 && Math.abs(c.speed) > 3 && this.redSg !== L.sg) { this.redSg = L.sg; this.reds = (this.reds || 0) + 1; this.g.toast('🚦 Door het rode licht gereden!'); }
    if (this.stop && this.stop.d < 400 && this.stop.d > 60 && this.annStop !== this.stop.key) { this.annStop = this.stop.key; speak(`Volgende halte: ${this.stop.name}`); }
    if (!this.hud || this.t - (this.hudT || 0) < 0.15) return;
    this.hudT = this.t;
    const kmh = Math.round(Math.abs(c.speed) * KMH), vmaxK = Math.round(this.spec.vmax * KMH), f = Math.min(1, Math.abs(c.speed) / this.spec.vmax);
    const on = Math.floor(this.blink * 2.5) % 2 === 0, il = (this.ind === -1 || this.ind === 2) && on, ir = (this.ind === 1 || this.ind === 2) && on;
    const wheel = Math.round(this.steer * 140), lc = L ? { groen: '#22e06a', oranje: '#ffb000', rood: '#ff3a2a' }[L.state] : '#556';
    const ang = Math.PI * (1 - f);
    this.hud.innerHTML = `<div class="cab-desk bus-desk">
      <svg viewBox="0 0 120 70" width="120" height="70"><path d="M10 64 A50 50 0 0 1 110 64" stroke="#3a4250" stroke-width="8" fill="none"/>
        <path d="M10 64 A50 50 0 0 1 110 64" stroke="${kmh > 50 ? '#ffb000' : '#4ade80'}" stroke-width="8" fill="none" stroke-dasharray="${f * 157} 157"/>
        <line x1="60" y1="64" x2="${(60 + 46 * Math.cos(ang)).toFixed(1)}" y2="${(64 - 46 * Math.sin(ang)).toFixed(1)}" stroke="#fff" stroke-width="3"/>
        <text x="60" y="52" fill="#fff" font-size="18" text-anchor="middle" font-weight="700">${kmh}</text><text x="60" y="66" fill="#aab" font-size="8" text-anchor="middle">km/h · max ${vmaxK}</text></svg>
      <svg class="bus-wheel" viewBox="-34 -34 68 68" width="68" height="68" title="Stuur"><g transform="rotate(${-wheel})"><circle r="29" stroke="#c9ced6" stroke-width="6" fill="none"/><circle r="7" fill="#c9ced6"/><path d="M-27 4 L-7 2 M27 4 L7 2 M0 7 L0 27" stroke="#c9ced6" stroke-width="6"/></g></svg>
      <div class="lever" title="Gas (W / ▲)"><div class="lv-fill" style="height:${up ? 100 : 0}%;background:#4ade80"></div><span>G</span></div>
      <div class="lever" title="Rem (S / ▼)"><div class="lv-fill" style="height:${down || hand ? 100 : 0}%;background:${hand ? '#ff3a2a' : '#fbbf24'}"></div><span>R</span></div>
      <div class="bus-ind"><span style="opacity:${il ? 1 : 0.2}">⬅</span><span style="opacity:${ir ? 1 : 0.2}">➡</span></div>
      <div class="sig-lamp" style="background:${lc}" title="Verkeerslicht"></div></div>
      <div class="dh-speed" style="display:none">${kmh}</div>
      <div class="small"><b>🚌 ${{ busCity: 'Stadsbus', busElec: 'Elektrische bus', busNew: 'Nieuwe e-bus', busArtF: 'Gelede bus', busCoach: 'Touringcar', busMini: 'Buurtbus', busDD: 'Dubbeldekker', busRegio: 'Streekbus' }[c.m] || 'Bus'}</b>${c.rear && this.knik ? ` · knik ${Math.round(Math.abs(this.knik) * 57.3)}°` : ''} · deuren <b>${c.doorsOpen ? 'open' : 'dicht'}</b>${this.ind === 2 ? ' · alarmlichten' : ''}<br>
      ${this.stop ? `🚏 Volgende halte: <b>${this.stop.name}</b> over ${Math.round(this.stop.d)} m${this.stop.d < 25 && Math.abs(c.speed) < 0.4 ? ' · <b class="ok">aan de halte — Q deuren</b>' : ''}` : '🚏 Geen bushalte in zicht'}<br>
      ${L ? `🚦 Verkeerslicht <b style="color:${lc}">${L.state}</b> over ${Math.round(L.d)} m` : '🚦 Geen verkeerslicht vóór je'}${this.reds ? ` · ${this.reds}× door rood` : ''}<br>
      <span class="muted">W/S gas/rem · A/D sturen · Q deuren · Z/C richtingaanwijzer · X alarmlichten · N omroep · V camera · H uitstappen</span></div>`;
  }
  // knoppen tijdens het rijden
  key(code) {
    if (code === 'KeyH') { this.exit(); return true; }
    if (code === 'KeyV') { this.cycleCam(); return true; }
    if (this.bus) return this.busKey(code);
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
      try { this.osc?.stop(); } catch { /* al gestopt */ } this.rs?.stop();
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
    if (this.scr) { for (const m of this.scr.meshes) m.removeFromParent(); this.scr.tex.dispose(); this.scr = null; }
    p.pos.set(x, this.ground(x, z, y + 2) + 0.05, z); p.vel.set(0, 0, 0); p.yaw = yaw + Math.PI / 2; p.pitch = 0; p.fly = false;
    try { this.osc?.stop(); } catch { /* al gestopt */ } this.rs?.stop();
    this.show(false);
    g.drive = null;
    g.toast('Uitgestapt');
  }
}
