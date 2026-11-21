// Alpenspoornet in het spel: dienstregeling (zonder botsingen), treinen met interieur waarin je kan rondlopen,
// meerijden (zitplaats kiezen, in- en uitstappen aan perrons), zelf rijden vanuit de cabine (tractie, rem,
// noodrem, seinen, snelheidsbeperkingen, haltes, deuren, omroepen) en een interactieve kaart met reisplanner.
import * as THREE from 'three';
import { TrainShells, LOD_DIST, CAR_BASE } from './trainshell.js';
import { RailInfra } from './railinfra.js';
import { RailSound } from './sound.js';
import { buildCrossovers } from './crossover.js';
import { depotPlan, depotState } from './depotsim.js';
import { routeServices } from './railroute.js';
import { Passengers } from './passengers.js';
import { B, IS_SOLID } from './blocks.js';
import { meshChunk } from './mesher.js';
import { Smoke } from './smoke.js';
// Het net (lijnen, stations, diensten, kaart) komt uit een adapter per wereld: js/rail-alpen.js, js/rail-green.js.
// useNet(net) kiest het net van de wereld die gespeeld wordt.
let NET = null, LINES = [], LINE = {}, STATIONS_ALL = [], TRACK = 2.5, trackOffset = () => 2.5, LIFTS = [], CROSSINGS = [], groundAt = () => 0, MW = 1, ML = 1, SERVICES = [];
export let RUNS = [];
export function netInfo() { return { LINES, STATIONS_ALL, trackOffset, JUNCTIONS }; }
// ---------- wissels tussen lijnen ----------
// Overloopwissels (js/crossover.js): verbindingssporen in een S-bocht tussen twee evenwijdige lijnen. Zelf besturen:
// A/D zet de volgende wissel om; de trein rijdt dan over het verbindingsspoor naar de andere lijn.
let JUNCTIONS = [];
export function useNet(net) {
  NET = net;
  ({ LINES, LINE, STATIONS_ALL, TRACK, trackOffset, LIFTS = [], CROSSINGS = [], groundAt, MW, ML } = net);
  if (net.liveries) Object.assign(LIVERY, net.liveries);
  SERVICES = applyOverrides(net.SERVICES, loadOverrides()); // eerst zonder de doorgaande diensten: speedLimits() gebruikt ze
  if (!net._runs) speedLimits();
  if (!net._junc) net._junc = buildCrossovers(LINES, trackOffset);
  JUNCTIONS = net._junc;
  // automatische doorgaande diensten over een overloopwissel (js/railroute.js), daarna de dienstregeling
  if (!net._runs) net._through = routeServices(JUNCTIONS, net, trackOffset, LINE);
  SERVICES = applyOverrides([...net.SERVICES, ...(net._through || [])], loadOverrides());
  if (!net._runs) net._runs = buildTimetable();
  RUNS = net._runs;
}
// ---------- OV-beheer: eigen dienstregeling (frequentie, uren, aan/uit), bewaard op dit toestel ----------
const ovKey = () => 'blokstad-ov-' + (NET && NET.id || 'net');
export function loadOverrides() { try { return JSON.parse(localStorage.getItem(ovKey()) || '{}') || {}; } catch { return {}; } }
function saveOverrides(o) { try { localStorage.setItem(ovKey(), JSON.stringify(o)); } catch { /* geen opslag */ } }
function applyOverrides(list, o) { return list.map(sv => o[sv.id] ? { ...sv, ...o[sv.id], base: sv } : sv).filter(sv => !sv.off); }
// de dienstregeling opnieuw opbouwen na een wijziging (de treinen die nu rijden worden opnieuw ingezet)
export function rebuildTimetable(overrides) {
  saveOverrides(overrides);
  SERVICES = applyOverrides([...NET.SERVICES, ...(NET._through || [])], overrides);
  NET._runs = buildTimetable(); RUNS = NET._runs;
}
// ---------- vertragingen: per rit vast (zelfde voor iedereen op dezelfde dag), meer bij slecht weer ----------
let delayFactor = 1, delayCause = null;
export function setDelayWeather(kind) { delayFactor = kind === 'storm' ? 2.6 : kind === 'snow' ? 2.2 : kind === 'rain' ? 1.3 : 1; delayCause = kind === 'storm' ? 'onweer' : kind === 'snow' ? 'sneeuw en gladheid' : kind === 'rain' ? 'regen' : null; }
const CAUSES = ['drukte bij het in- en uitstappen', 'wachten op een aansluiting', 'seinstoring', 'later vertrokken uit de remise', 'werken aan het spoor', 'een defecte deur'];
function rideHash(a, b, c) { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const svNum = (id) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };
// vertraging in seconden van rit k (enkelsporige lijnen en internationale treinen rijden altijd op tijd)
export function delayOf(r, k) {
  if (r.pr.L.single || r.sv.international) return 0;
  const day = Math.floor((Date.now() / 1000 - new Date().getTimezoneOffset() * 60) / P);
  const u = rideHash(svNum(r.sv.id), r.dir * 1000 + k, day);
  const p = Math.min(0.6, 0.18 * delayFactor);
  if (u > p) return 0;
  const cap = Math.floor(r.h * 0.45 / 60) * 60; // nooit tot bij de volgende rit op hetzelfde spoor
  return Math.min(cap, Math.round((60 + (u / p) * 360 * Math.min(1.5, delayFactor)) / 60) * 60); // 1 tot 9 minuten
}
export function delayReason(r, k) { if (delayCause) return delayCause; return CAUSES[Math.floor(rideHash(svNum(r.sv.id), k, 99) * CAUSES.length)]; }

const KMH = 3.6, P = 86400; // de dienstregeling herhaalt zich elke dag (diensten kunnen een begin- en einduur hebben)
const GAP = 0.6; // tussen twee rijtuigen

// ---------- rijtuigen (x = breedte 0..3, y = 0..5, z = lengte, voorkant = +z) ----------
const LIVERY = {
  AE: [B.PAINT_RED, B.PAINT_WHITE], RB: [B.PAINT_WHITE, B.PAINT_RED], EN: [B.PAINT_BLUE, B.PAINT_WHITE], IC: [B.PAINT_BLUE, B.PAINT_WHITE],
  S1: [B.PAINT_WHITE, B.PAINT_BLUE], ICE: [B.PAINT_WHITE, B.PAINT_RED], PE: [B.PAINT_ORANGE, B.PAINT_WHITE], ZB: [B.PAINT_RED, B.PAINT_WHITE],
  ME: [B.PAINT_GREEN, B.PAINT_WHITE], G: [B.BRICK_DARK, B.PAINT_BLACK], HIST: [B.PAINT_GREEN, B.PAINT_WHITE],
};
// massa (t), tractiekracht (kN) en vermogen (kW) per rijtuigsoort; aangedreven rijtuigen tellen mee voor de kleefkracht
const CAR_PHYS = { loco: [86, 240, 6400], emuCab: [56, 70, 1600], emuMid: [48, 55, 1200], iceHead: [72, 150, 4000], ice: [52, 30, 800],
  coach1: [46, 0, 0], coach2: [44, 0, 0], dining: [52, 0, 0], sleeper: [54, 0, 0], panorama: [42, 0, 0], rack: [32, 45, 900], rackLoco: [44, 70, 1400],
  tram: [36, 45, 500], bus: [16, 0, 0], box: [58, 0, 0], tank: [72, 0, 0], flat: [40, 0, 0],
  ddCab: [58, 70, 1500], ddMid: [50, 60, 1200], sbCab: [44, 60, 1300], sbMid: [38, 50, 1100], mCab: [32, 55, 1000], mMid: [30, 50, 900], axCab: [54, 70, 1700], axMid: [46, 55, 1200], regCab: [52, 60, 1400], regMid: [46, 50, 1100], locoD: [90, 260, 2400] };
export function trainPhysics(tr) {
  let M = 0, Md = 0, F = 0, P = 0, len = 0;
  for (const c of tr.cars) { const [m, f, p] = CAR_PHYS[c.d.type] || [45, 0, 0]; M += m; if (f) { Md += m; F += f; P += p; } len += c.d.L + GAP; }
  return { M, Md: Md || M * 0.3, F: F || 150, P: P || 1500, len: Math.round(len - GAP), aero: tr.cars.some(c => c.d.type === 'iceHead') ? 0.7 : 1 };
}
// kleefkracht wiel–rail: droog 0,30; regen 0,20; onweer 0,17; sneeuw 0,12
export function adhesion(w) { return w === 'snow' ? 0.12 : w === 'storm' ? 0.17 : w === 'rain' ? 0.2 : 0.3; }
const CAR_LEN = { ddCab: 26, ddMid: 26, sbCab: 22, sbMid: 22, mCab: 18, mMid: 18, axCab: 26, axMid: 26, regCab: 26, regMid: 26, locoD: 20, loco: 19, coach1: 26, coach2: 26, dining: 26, sleeper: 26, panorama: 24, emuCab: 26, emuMid: 26, iceHead: 26, ice: 26, rack: 16, rackLoco: 12, tram: 15, bus: 12, box: 15, tank: 14, flat: 15 };
function design(vtype, liv) {
  // materieel per categorie (js/trainshell.js CAR_BASE): eigen lengte en deuren, de indeling van het basistype
  const type = CAR_BASE[vtype] || vtype;
  if (vtype === 'ddCab' || vtype === 'ddMid') return designDD(vtype, liv);
  const L = CAR_LEN[vtype], W = 4, H = 6, size = Math.max(W, L), vox = new Uint8Array(size * size * H);
  const set = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < L) vox[(z * size + x) * H + y] = b; };
  const box = (x0, y0, z0, x1, y1, z1, b) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, b); };
  const [c1, c2] = LIVERY[liv] || LIVERY.AE;
  const seats = [], doors = [];
  let cab = null;
  const freight = type === 'box' || type === 'tank' || type === 'flat';
  // onderstel met draaistellen
  box(0, 0, 1, W - 1, 0, L - 2, B.METAL);
  for (const z of [2, 3, L - 4, L - 3]) box(0, 0, z, W - 1, 0, z, B.PAINT_BLACK);
  if (freight) {
    if (type === 'box') { box(0, 1, 0, W - 1, 4, L - 1, c1); for (let z = 2; z < L; z += 3) box(0, 1, z, W - 1, 4, z, B.PAINT_BLACK); }
    else if (type === 'tank') { box(1, 1, 1, 2, 4, L - 2, B.METAL); box(0, 2, 1, W - 1, 3, L - 2, B.METAL); box(1, 5, L >> 1, 2, 5, L >> 1, B.PAINT_BLACK); }
    else { box(0, 1, 0, W - 1, 1, L - 1, B.DARK_PLANKS); box(0, 2, 1, W - 1, 4, 6, B.PAINT_BLUE); box(0, 2, 8, W - 1, 4, 13, B.PAINT_ORANGE); }
    return { W, H, L, size, vox, seats, doors, cab, type: vtype, walk: false };
  }
  const glassRoof = type === 'panorama';
  // vloer, wanden, ramen, dak
  box(0, 1, 0, W - 1, 1, L - 1, type === 'coach1' || type === 'dining' ? B.WOOL_RED : type === 'sleeper' ? B.DARK_PLANKS : B.TILE);
  for (let z = 0; z < L; z++) for (const x of [0, W - 1]) {
    set(x, 2, z, c1);
    set(x, 3, z, (z % 4 === 0 || z < 1 || z > L - 2) ? c1 : (glassRoof ? B.GLASS_BLUE : B.GLASS));
    set(x, 4, z, glassRoof ? B.GLASS_BLUE : c2);
  }
  for (let z = 0; z < L; z++) for (let x = 0; x < W; x++) set(x, 5, z, glassRoof && x > 0 && x < W - 1 && z > 1 && z < L - 2 ? B.GLASS_BLUE : (x > 0 && x < W - 1 && z % 6 === 3 ? B.LAMP : B.PAINT_WHITE));
  // kopwanden met een doorgang naar het volgende rijtuig
  for (const z of [0, L - 1]) { for (let x = 0; x < W; x++) for (let y = 2; y <= 4; y++) set(x, y, z, c1); set(1, 2, z, 0); set(2, 2, z, 0); set(1, 3, z, 0); set(2, 3, z, 0); }
  // deuren (geel, dicht tijdens de rit; in- en uitstappen met J)
  const DOORS = { sbCab: [2, 10, L - 5], sbMid: [2, 10, L - 3], mCab: [2, 8, L - 5], mMid: [2, 8, L - 3], regCab: [6, L - 9], regMid: [6, L - 7] };
  for (const z of DOORS[vtype] || [2, L - 3]) { for (const x of [0, W - 1]) { set(x, 2, z, B.PAINT_YELLOW); set(x, 3, z, B.GLASS_GREEN); } doors.push(z); }
  const cabFront = type === 'loco' || type === 'emuCab' || type === 'iceHead' || type === 'rack' || type === 'rackLoco' || type === 'tram' || type === 'bus';
  if (cabFront) {
    // cabine vooraan: lessenaar, frontruit, stoel van de machinist
    const zf = L - 1;
    for (let x = 0; x < W; x++) { set(x, 2, zf, c1); set(x, 3, zf, B.GLASS); set(x, 4, zf, type === 'iceHead' ? B.GLASS : c2); }
    if (type === 'iceHead') { for (let x = 0; x < W; x++) { set(x, 5, zf, 0); set(x, 5, zf - 1, B.GLASS); } }
    set(1, 2, zf - 1, B.PANEL_DARK); set(2, 2, zf - 1, B.PANEL_DARK);
    set(0, 2, zf - 3, c1); set(W - 1, 2, zf - 3, c1); // wand achter de cabine
    for (let x = 0; x < W; x++) if (x !== 1 && x !== 2) set(x, 3, zf - 3, c1);
    cab = [2, 2, zf - 2];
  }
  if (type === 'loco' || type === 'rackLoco') {
    // machinekamer in het midden (niet toegankelijk), cabines aan beide kanten
    box(1, 2, 3, 2, 4, L - 5, B.METAL); for (let z = 4; z < L - 5; z += 3) set(0, 3, z, B.METAL), set(W - 1, 3, z, B.METAL);
    set(1, 2, 0, B.PANEL_DARK); set(2, 2, 0, 0);
  }
  if (type === 'coach1' || type === 'coach2' || type === 'emuCab' || type === 'emuMid' || type === 'ice' || type === 'iceHead' || type === 'panorama' || type === 'rack' || type === 'tram' || type === 'bus') {
    const z0 = 4, z1 = cabFront ? L - 5 : L - 4;
    for (let z = z0; z <= z1; z++) {
      if (doors.includes(z)) continue;
      if ((z - z0) % 2 === 0) { set(1, 2, z, type === 'coach1' ? B.WOOL_RED : type === 'panorama' ? B.PAINT_ORANGE : B.PAINT_BLUE); seats.push([1.5, 3, z + 0.5]); }
      if (type === 'coach1' && (z - z0) % 4 === 1) set(1, 2, z, B.DARK_PLANKS); // tafeltje
    }
  }
  if (type === 'dining') {
    for (let z = 4; z < L - 8; z++) { if (z % 3 === 1) set(1, 2, z, B.PLANKS); else { set(1, 2, z, B.WOOL_RED); seats.push([1.5, 3, z + 0.5]); } }
    box(1, 2, L - 7, 2, 2, L - 7, B.PLANKS); box(1, 2, L - 6, 1, 3, L - 4, B.METAL); // toog en keuken
  }
  if (type === 'sleeper') {
    // coupés met bedden aan één kant van de gang
    for (let z = 4; z < L - 4; z++) {
      if (z % 4 === 0) { set(1, 2, z, B.PLANKS); set(1, 3, z, B.PLANKS); set(1, 4, z, B.PLANKS); } // tussenwand
      else if (z % 4 === 2) { set(1, 2, z, B.WOOL_RED); set(1, 4, z, B.WOOL_RED); seats.push([1.5, 3, z + 0.5]); } // onder- en bovenbed
    }
  }
  return { W, H, L, size, vox, seats, doors, cab, type: vtype, walk: true };
}

// dubbeldekker (TERRANOVA 14.2): twee verdiepingen. Benedendek vloer y1 (stahoogte y2–3), bovendek vloer y4 (stahoogte
// y5–6), dak y7. Aan beide kanten een instaphal bij de deuren; daar een trap van 3 treden naar boven, met ernaast een
// vrije doorgang naar het benedendek. Zitplaatsen op beide verdiepingen.
function designDD(vtype, liv) {
  const cab = vtype === 'ddCab', L = CAR_LEN[vtype], W = 4, H = 8, size = Math.max(W, L), vox = new Uint8Array(size * size * H);
  const set = (x, y, z, b) => { if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < L) vox[(z * size + x) * H + y] = b; };
  const box = (x0, y0, z0, x1, y1, z1, b) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, b); };
  const [c1, c2] = LIVERY[liv] || LIVERY.AE, seats = [], doors = [];
  box(0, 0, 1, W - 1, 0, L - 2, B.METAL); for (const z of [2, 3, L - 4, L - 3]) box(0, 0, z, W - 1, 0, z, B.PAINT_BLACK);
  box(0, 1, 0, W - 1, 1, L - 1, B.TILE);                                                  // vloer benedendek en instaphallen
  const zA = 7, zB = cab ? L - 9 : L - 8;                                                 // bovendek tussen de trappen
  box(1, 4, zA, 2, 4, zB, B.TILE);                                                        // vloer bovendek
  for (let z = 0; z < L; z++) for (const x of [0, W - 1]) {
    set(x, 2, z, c1); set(x, 3, z, z % 4 === 0 || z < 1 || z > L - 2 ? c1 : B.GLASS);   // benedendek: ramen
    set(x, 4, z, c2);                                                                     // band tussen de verdiepingen
    set(x, 5, z, c1); set(x, 6, z, z % 4 === 0 || z < 1 || z > L - 2 ? c1 : B.GLASS);   // bovendek: ramen
  }
  for (let z = 0; z < L; z++) for (let x = 0; x < W; x++) set(x, 7, z, x > 0 && x < W - 1 && z % 6 === 3 ? B.LAMP : B.PAINT_WHITE);
  for (let z = zA; z <= zB; z++) if (z % 6 === 3) set(1, 4, z, B.LAMP);                 // lampen benedendek: in het plafond (de vloer van het bovendek)
  // kopwanden met doorgang (beide verdiepingen dicht behalve beneden in het midden)
  for (const z of [0, L - 1]) { for (let x = 0; x < W; x++) for (let y = 2; y <= 6; y++) set(x, y, z, c1); set(1, 2, z, 0); set(2, 2, z, 0); set(1, 3, z, 0); set(2, 3, z, 0); }
  // deuren in de instaphallen
  for (const z of [2, L - 3]) { for (const x of [0, W - 1]) { set(x, 2, z, B.PAINT_YELLOW); set(x, 3, z, B.GLASS_GREEN); } doors.push(z); }
  // trappen: x = 2 omhoog naar het bovendek (3 treden), x = 1 blijft vrij naar het benedendek
  for (const [z0, dz] of [[zA - 3, 1], [zB + 3, -1]]) for (let i = 0; i < 3; i++) { const z = z0 + dz * i; for (let y = 2; y <= 2 + i; y++) set(2, y, z, B.PLANKS); }
  if (cab) {
    const zf = L - 1;
    for (let x = 0; x < W; x++) { set(x, 2, zf, c1); set(x, 3, zf, B.GLASS); set(x, 4, zf, c2); set(x, 5, zf, c1); set(x, 6, zf, c1); }
    set(1, 2, zf - 1, B.PANEL_DARK); set(2, 2, zf - 1, B.PANEL_DARK);
    for (let x = 0; x < W; x++) if (x !== 1) for (let y = 2; y <= 3; y++) set(x, y, zf - 3, c1); // wand achter de cabine
  }
  // zitplaatsen: beneden langs x = 2 (gangpad x = 1, vrij vanuit de instaphal), boven langs x = 1 (gangpad x = 2, waar de trap uitkomt)
  for (let z = zA + 1; z < zB; z += 2) { set(2, 2, z, B.PAINT_BLUE); seats.push([2.5, 3, z + 0.5]); }
  for (let z = zA + 1; z < zB; z += 2) { set(1, 5, z, B.WOOL_RED); seats.push([1.5, 6, z + 0.5]); }
  return { W, H, L, size, vox, seats, doors, cab: cab ? [2, 2, L - 3] : null, type: vtype, walk: true, decks: 2 };
}

// ---------- snelheidsbeperkingen per lijn ----------
function speedLimits() { for (const L of LINES) {
  const v = new Float32Array(L.n), vmax = Math.max(...SERVICES.filter(s => s.line === L.id).map(s => s.vmax));
  for (let i = 0; i < L.n; i++) {
    const a = Math.max(0, i - 10), c = Math.min(L.n - 1, i + 10);
    const ax = L.x[a], az = L.z[a], bx = L.x[i], bz = L.z[i], cx = L.x[c], cz = L.z[c];
    const A2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)), ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz);
    const R = A2 < 1e-6 ? 1e9 : ab * bc * ca / (2 * A2);
    v[i] = Math.min(vmax, Math.sqrt(1.15 * R));
    if (L.kind[i] === 3) v[i] = Math.min(v[i], 33); // oud spoor door het dal
  }
  // over 120 m het minimum nemen (de hele trein moet door de bocht)
  const w = new Float32Array(L.n);
  for (let i = 0; i < L.n; i++) { let m = 1e9; for (let j = Math.max(0, i - 30); j <= Math.min(L.n - 1, i + 30); j++) m = Math.min(m, v[j]); w[i] = Math.max(6, m); }
  L.vlim = w;
  L.limAt = (s) => w[L.idx(s)];
} }

// ---------- rijprofiel: tijd ↔ plaats voor een dienst in één richting ----------
function runProfile(sv, dir) {
  const L = LINE[sv.line], len = sv.cars.reduce((a, c) => a + CAR_LEN[c] + GAP, 0) - GAP;
  const stops = L.stations.filter(st => !sv.stops || sv.stops.includes(st.name) || (sv.freight && (st === L.stations[0] || st === L.stations[L.stations.length - 1])));
  const all = L.stations;
  // kop van de trein staat bij het stoppen op het einde van het perron (trein midden op het perron)
  const headStop = (st) => st.s + dir * Math.min(len / 2, st.len / 2 - 2);
  const first = dir > 0 ? all[0] : all[all.length - 1], last = dir > 0 ? all[all.length - 1] : all[0];
  const s0 = headStop(first), s1 = headStop(last), D = Math.abs(s1 - s0), dx = 4, n = Math.ceil(D / dx) + 1;
  const sOf = (x) => s0 + dir * x;
  const stopX = (sv.freight ? [first, last] : stops).map(st => ({ x: Math.abs(headStop(st) - s0), st })).sort((a, b) => a.x - b.x);
  const acc = sv.acc || 0.6, dec = 0.55;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // de beperking geldt over de hele treinlengte
    const sh = sOf(i * dx), st = sOf(Math.max(0, i * dx - len));
    v[i] = Math.min(sv.vmax, L.limAt(sh), L.limAt(st), L.limAt((sh + st) / 2));
  }
  const isStop = new Uint8Array(n);
  for (const q of stopX) isStop[Math.min(n - 1, Math.round(q.x / dx))] = 1;
  isStop[0] = 1; isStop[n - 1] = 1;
  for (let i = 0; i < n; i++) if (isStop[i]) v[i] = 0;
  for (let i = 1; i < n; i++) if (!isStop[i]) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * acc * dx));
  for (let i = n - 2; i >= 0; i--) if (!isStop[i]) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * dec * dx));
  // tijd: bij elke halte een wachttijd
  const xs = [], ts = [], stopsOut = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) { const vm = Math.max(0.4, (v[i] + v[i - 1]) / 2); t += dx / vm; }
    xs.push(Math.min(D, i * dx)); ts.push(t);
    if (isStop[i] && i > 0 && i < n - 1) {
      const q = stopX.find(q => Math.abs(q.x - i * dx) < dx);
      const dwell = sv.freight ? 0 : q && q.st.hbf !== undefined ? 90 : q && q.st.name === 'Reuzendal' ? 60 : 45;
      if (dwell) { stopsOut.push({ st: q.st, arr: t, dep: t + dwell }); t += dwell; xs.push(Math.min(D, i * dx)); ts.push(t); }
    }
  }
  return { sv, dir, L, len, s0, s1, D, xs: Float32Array.from(xs), ts: Float32Array.from(ts), T: t, stops: stopsOut, first, last, v };
}
// plaats (afstand vanaf het begin) op tijd t na vertrek
function posAt(pr, t) {
  const ts = pr.ts, xs = pr.xs;
  if (t <= 0) return [0, 0];
  if (t >= pr.T) return [pr.D, 0];
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
  const dt = ts[hi] - ts[lo], f = dt > 0 ? (t - ts[lo]) / dt : 0, dx = xs[hi] - xs[lo];
  return [xs[lo] + dx * f, dt > 0 ? dx / dt : 0];
}
// tijd waarop de kop op afstand x is
function timeAt(pr, x) {
  const xs = pr.xs; let lo = 0, hi = xs.length - 1;
  if (x <= 0) return 0; if (x >= pr.D) return pr.T;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m; else hi = m; }
  const f = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
  return pr.ts[lo] + (pr.ts[hi] - pr.ts[lo]) * f;
}

// ---------- blokken (voor een dienstregeling zonder botsingen) ----------
function blockKey(L, s, dir) {
  if (L.oldS && s > L.oldS[0] - 300 && s < L.oldS[1] + 300) return 'AE:old'; // enkelspoor door het Reuzendal
  if (L.single) {
    for (let i = 0; i < L.stations.length; i++) { const st = L.stations[i]; if (s >= st.s0 - 30 && s <= st.s1 + 30) return `${L.id}:${dir}:st${i}`; }
    let k = 0; for (const st of L.stations) if (st.s1 < s) k++;
    return `${L.id}:seg${k}`; // enkelspoor tussen twee stations: beide richtingen
  }
  return `${L.id}:${dir}:${Math.floor(s / 400)}`;
}
function occupancy(pr) {
  const occ = new Map(), L = pr.L, dir = pr.dir;
  const pre = 120, post = 60; // al aan het perron voor vertrek, nog even blijven staan na aankomst
  for (let i = 0; i < pr.xs.length; i++) {
    const t = pr.ts[i], x = pr.xs[i];
    for (const xx of [x, Math.max(0, x - pr.len)]) {
      // doorgaande route over een wissel: de blokken van de echte sporen en de wissel zelf (js/railroute.js)
      const keys = L.route ? L.route.blocks(pr.s0 + dir * xx, blockKey) : [blockKey(L, pr.s0 + dir * xx, dir)];
      for (const k of keys) {
        let o = occ.get(k); if (!o) occ.set(k, o = [1e9, -1e9]);
        o[0] = Math.min(o[0], i === 0 ? -pre : t - 15); o[1] = Math.max(o[1], i === pr.xs.length - 1 ? t + post : t + 25);
      }
    }
  }
  return occ;
}
function buildTimetable() {
  const runs = []; // per dienst en richting: profiel, vertrektijden
  const table = new Map(); // blok -> lijst van [a, b] (mod P)
  const norm = (a) => ((a % P) + P) % P;
  const add = (k, a, b) => { let l = table.get(k); if (!l) table.set(k, l = []); const a2 = norm(a), b2 = a2 + (b - a); l.push([a2, b2]); };
  const clash = (k, a, b) => {
    const l = table.get(k); if (!l) return false;
    const a2 = norm(a), b2 = a2 + (b - a);
    for (const [c, d] of l) for (const sh of [0, P, -P]) if (a2 + sh < d && b2 + sh > c) return true;
    return false;
  };
  for (const sv of SERVICES) {
    for (const dir of sv.dirs || [1, -1]) {
      const pr = runProfile(sv, dir), occ = [...occupancy(pr)];
      let h = sv.h, chosen = -1;
      for (let tries = 0; tries < 3 && chosen < 0; tries++) {
        for (let o = 0; o < h && chosen < 0; o += 15) {
          let ok = true;
          for (let k = 0; k < P / h && ok; k++) for (const [key, [a, b]] of occ) if (clash(key, o + k * h + a, o + k * h + b)) { ok = false; break; }
          if (ok) chosen = o;
        }
        if (chosen < 0) h *= 2; // te druk: minder vaak rijden
      }
      if (chosen < 0) { console.warn('geen plaats in de dienstregeling voor', sv.id, dir); continue; }
      for (let k = 0; k < P / h; k++) for (const [key, [a, b]] of occ) add(key, chosen + k * h + a, chosen + k * h + b);
      runs.push({ sv, dir, pr, h, off: chosen });
    }
  }
  return runs;
}
export function railClock() { return (Date.now() / 1000 - new Date().getTimezoneOffset() * 60) % P; }
const hhmm = (sec) => { const d = new Date(Date.now() + (sec - railClock()) * 1000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// alle treinen die nu rijden (of klaarstaan): { run, k, t (sinds vertrek), x, v }
// rijdt deze dienst op dit uur? (sv.hours = [beginuur, einduur], bv. [5, 24]; over middernacht: [23, 5])
function inHours(sv, dep) {
  if (!sv.hours) return true;
  const h = (((dep % P) + P) % P) / 3600, [a, b] = sv.hours;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}
// dienstperiodes: spits (7–9 u, 16–19 u) alle ritten; daluren (9–16 u, 19–22 u) en vroeg (5–7 u) de helft bij
// lijnen die minstens om het halfuur rijden; avond (22–24 u) een derde; nacht (0–5 u) een kwart (behalve diensten
// met eigen uren, zoals nachtbussen). Treinen, vertrekborden en de reisplanner gebruiken allemaal dezelfde regel.
export function periodOf(sec) {
  const h = (((sec % P) + P) % P) / 3600;
  if ((h >= 7 && h < 9) || (h >= 16 && h < 19)) return 'spits';
  if ((h >= 9 && h < 16) || (h >= 19 && h < 22) || (h >= 5 && h < 7)) return 'dal';
  if (h >= 22) return 'avond';
  return 'nacht';
}
export const PERIOD_NAMES = { spits: 'Spits', dal: 'Daluren', avond: 'Avond', nacht: 'Nacht' };
function runs(r, k) {
  const dep = r.off + k * r.h;
  if (!inHours(r.sv, dep)) return false;
  if (r.sv.hours || r.sv.freight) return true;
  const per = periodOf(dep), n = Math.round(P / r.h);
  const every = per === 'spits' ? 1 : per === 'dal' ? (r.h <= 1800 ? 2 : 1) : per === 'avond' ? (r.h <= 1800 ? 3 : r.h <= 3600 ? 2 : 1) : (r.h <= 3600 ? 4 : 2);
  return ((k % n) + n) % n % every === 0;
}
// staat de trein aan een perron met de deuren open? (na het stoppen open, 4 s voor vertrek dicht)
function doorsOpenAt(a) {
  const pr = a.run.pr;
  if (a.v > 0.05 || !pr.stops) return 0;
  for (const st of pr.stops) if (a.t >= st.arr + 1.5 && a.t <= st.dep - 4) return 1;
  return 0;
}
// voor controles zonder browser (tools/check-wisselroutes.mjs): alle treinen op tijdstip `now`
export function activeAt(now) { return activeTrains(now); }
// voor de remises (js/depotsim.js) en controles zonder browser
// geplande aankomst (klok van de dienstregeling) van de bestuurde trein aan een station van zijn rit (js/career.js)
export function schedArrival(pt, st) {
  const a = pt.sched; if (!a || !a.run || pt.base == null || a.run.pr.L !== pt.L) return null;
  const pr = a.run.pr, x = (st.s - pr.s0) * a.run.dir; if (x < 0 || x > pr.D) return null;
  return pt.base + timeAt(pr, x);
}
export function _depotHelpers() { return { runs, delayOf, effDelay, posAt, trackOffset }; }
export function _design(type, liv) { return design(type, liv); } // voor controles zonder browser (interieur)
function activeTrains(now) {
  const out = [];
  for (const r of RUNS) {
    const n = P / r.h;
    for (let k = 0; k < n; k++) {
      if (!runs(r, k)) continue;
      const ho = r.pr.L.route ? holdOf(r, k) : null; // doorgaande route: wachten voor het inrijsein / later vertrek
      const dl = ho ? ho.dep : delayOf(r, k);
      let t = now - (r.off + k * r.h) - dl; t = ((t % P) + P) % P; if (t > P - 130 - dl - (ho ? ho.H : 0)) t -= P;
      if (t < -120 || t > r.pr.T + 60 + (ho ? ho.H : 0)) continue;
      let held = false;
      if (ho && ho.H && t > ho.tE) { if (t < ho.tE + ho.H) { held = true; t = ho.tE; } else t -= ho.H; }
      const [x, v] = posAt(r.pr, t);
      out.push({ id: `${r.sv.id}${r.dir > 0 ? 'a' : 'b'}${k}`, run: r, k, t, x, v: held || t < 0 || t > r.pr.T ? 0 : v, delay: dl + (ho ? ho.H : 0), held, hold: ho });
    }
  }
  return out;
}
// ---------- rijweginstelling voor de doorgaande routes (js/railroute.js) ----------
// Een automatische trein mag pas over de wissel als het conflictgebied vrij is: lijn A rond de wissel (beide
// richtingen, plus het stuk voor het inrijsein waar hij eventueel wacht) en lijn B rond de aansluiting. De
// gewone treinen (met hun vertraging van vandaag) en de eerder ingeplande doorgaande treinen bezetten dat gebied
// in vaste tijdvensters; de doorgaande trein wacht zo lang als nodig voor het inrijsein (H, in stappen van 15 s),
// of vertrekt later als wachten niet genoeg is (dep). Vast per dag, dus de kaart, de borden en de treinen kloppen.
const holdCache = new Map();
const dayNr = () => Math.floor((Date.now() / 1000 - new Date().getTimezoneOffset() * 60) / P);
function zoneOf(Ro, lenT) {
  const X = Ro.X, a0 = Math.min(X.sA, X.sA + X.aDir * X.len) - 30, a1 = Math.max(X.sA, X.sA + X.aDir * X.len) + 30;
  // het wachtspoor voor het inrijsein (tot 60 m voor de wissel, plus de treinlengte en een blok) hoort erbij
  const w0 = X.aDir > 0 ? Math.min(a0, X.sA - 60 - lenT - 400) : a0, w1 = X.aDir > 0 ? a1 : Math.max(a1, X.sA + 60 + lenT + 400);
  return { A: X.A, a0: w0, a1: w1, B: X.B, b0: X.sBend - 60, b1: X.sBend + 60 };
}
// tijdvensters (seconden sinds middernacht, ±20 s marge) waarin andere treinen het conflictgebied van route Ro bezetten
function zoneWindows(Ro, self, lenT) {
  const Z = zoneOf(Ro, lenT), win = [];
  for (const r of RUNS) {
    if (r === self) continue;
    const L = r.pr.L, pr = r.pr, n = P / r.h;
    const ranges = [];
    if (L.route) { if (RUNS.indexOf(r) > RUNS.indexOf(self)) continue; const S = L.route; for (const [ln, lo, hi] of [[Z.A, Z.a0, Z.a1], [Z.B, Z.b0, Z.b1]]) for (const [q0, q1, ql, qd] of [[0, S.l1, S.A, S.aDir], [S.l1 + S.l2, S.len, S.B, S.bDir]]) if (ql === ln) { const s0 = (ql === S.A ? S.aStart : S.X.sBend), off = ql === S.A ? 0 : S.l1 + S.l2; const x0 = (lo - s0) * qd + off, x1 = (hi - s0) * qd + off; ranges.push([Math.max(q0, Math.min(x0, x1)), Math.min(q1, Math.max(x0, x1))]); } if (S.X === Ro.X || (S.X.A === Ro.X.A && Math.abs(S.X.sA - Ro.X.sA) < 800)) ranges.push([S.l1, S.l1 + S.l2]); }
    else for (const [ln, lo, hi] of [[Z.A, Z.a0, Z.a1], [Z.B, Z.b0, Z.b1]]) if (L === ln) { const x0 = (lo - pr.s0) * r.dir, x1 = (hi - pr.s0) * r.dir; ranges.push([Math.max(0, Math.min(x0, x1)), Math.min(pr.D, Math.max(x0, x1))]); }
    for (const [x0, x1] of ranges) {
      if (x1 <= x0 && !(x1 === x0 && x0 > 0)) continue;
      const tIn = timeAt(pr, x0), tOut = timeAt(pr, Math.min(pr.D, x1 + pr.len));
      for (let k = 0; k < n; k++) {
        if (!runs(r, k)) continue;
        const ho = L.route ? holdOf(r, k) : null, dl = ho ? ho.dep : delayOf(r, k), H = ho ? ho.H : 0, base = r.off + k * r.h + dl;
        const a = base + tIn + (ho && tIn > ho.tE ? H : 0) - 20, b = base + tOut + (ho && tOut > ho.tE ? H : 0) + 20;
        win.push([((a % P) + P) % P, ((a % P) + P) % P + (b - a)]);
      }
    }
  }
  return win;
}
function holdOf(r, k) {
  const key = `${dayNr()}|${r.sv.id}|${r.dir}|${k}`;
  if (holdCache.has(key)) return holdCache.get(key);
  holdCache.set(key, { H: 0, dep: 0, tE: 1e9 }); // tegen terugkoppeling tijdens het berekenen
  const Ro = r.pr.L.route, pr = r.pr, lenT = pr.len;
  const zk = `${dayNr()}|Z|${r.sv.id}|${r.dir}`;
  let W = holdCache.get(zk); if (!W) { W = zoneWindows(Ro, r, lenT); holdCache.set(zk, W); }
  const Z = zoneOf(Ro, lenT), wait = Ro.aDir > 0 ? Ro.l1 - 60 : Ro.l1 - 60; // inrijsein 60 m voor de wissel (op de route)
  const tE = timeAt(pr, Math.max(0, wait)), xIn = Math.max(0, (Ro.aDir > 0 ? Z.a0 - Ro.aStart : Ro.aStart - Z.a1)), tIn = timeAt(pr, xIn);
  const xOut = Math.min(pr.D, Ro.l1 + Ro.l2 + 60 + lenT), tOut = timeAt(pr, xOut);
  const free = (a, b) => { for (const [c, d] of W) for (const sh of [0, P, -P]) if (a + sh < d && b + sh > c) return false; return true; };
  let best = null;
  for (let dep = 0; dep <= 1800 && !best; dep += 60) for (let H = 0; H <= 600 && !best; H += 15) {
    const base = r.off + k * r.h + dep;
    if (free(base + tIn, base + tOut + H)) best = { H, dep, tE };
  }
  best = best || { H: 0, dep: 0, tE, vol: true };
  holdCache.set(key, best);
  return best;
}
// vertraging van rit k op tijdstip t van zijn profiel (doorgaande routes: later vertrek en wachten voor het sein)
export function effDelay(r, k, t = 0) { const ho = r.pr.L.route ? holdOf(r, k) : null; return ho ? ho.dep + (t > ho.tE ? ho.H : 0) : delayOf(r, k); }
// vertrektijden aan een station (komende `n`)
export function departures(name, now, n = 8) {
  const out = [];
  for (const r of RUNS) for (const st of r.pr.stops.concat([{ st: r.pr.first, arr: 0, dep: 0 }])) {
    if (st.st.name !== name || st.st.name === r.pr.last.name) continue; // aankomst aan het eindstation is geen vertrek
    for (let k = 0; k < P / r.h; k++) {
      if (!runs(r, k)) continue;
      let dt = (r.off + k * r.h + st.dep) - now; dt = ((dt % P) + P) % P;
      const ho = r.pr.L.route ? holdOf(r, k) : null, dl = ho ? ho.dep + (st.dep > ho.tE ? ho.H : 0) : delayOf(r, k); // zelfde vertraging als de trein zelf
      if (dt > P - dl) dt -= P; // vertrekt nog (te laat)
      out.push({ in: dt, run: r, st, dest: r.pr.last.name, at: now + dt, k, delay: dl });
    }
  }
  return out.sort((a, b) => a.in - b.in).slice(0, n);
}
// uniek ritnummer: dienst + richting + volgnummer van de dag (bv. IC2 1-07)
export function ritNr(d) { const n = 86400 / d.run.h, k = ((Math.round((((d.at - d.st.dep - d.run.off) % 86400) + 86400) % 86400 / d.run.h) % n) + n) % n; return `${d.run.sv.id} ${d.run.dir > 0 ? 1 : 2}-${String(k + 1).padStart(2, '0')}`; }
// reisplanner: vroegste aankomst (met overstappen) van station a naar b
export function plan(a, b, now) {
  const best = new Map([[a, { t: now, legs: [] }]]), todo = [a], conn = [];
  for (const r of RUNS) {
    if (r.sv.freight) continue;
    const seq = [{ st: r.pr.first, arr: 0, dep: 0 }, ...r.pr.stops, { st: r.pr.last, arr: r.pr.T, dep: r.pr.T }];
    conn.push({ r, seq });
  }
  // te voet overstappen tussen stations/haltes binnen 700 m (1,3 m/s, 30 % omweg)
  const pos = new Map(STATIONS_ALL.map(s => [s.name, s]));
  const walkFrom = (from, cur, next) => {
    const A = pos.get(from); if (!A) return;
    for (const S of STATIONS_ALL) {
      if (S.name === from) continue;
      const d = Math.hypot(S.x - A.x, S.z - A.z); if (d > 700) continue;
      const arr = cur.t + d * 1.3 / 1.3, b0 = best.get(S.name);
      if (!b0 || arr < b0.t) { best.set(S.name, { t: arr, legs: [...cur.legs, { walk: true, from, to: S.name, dep: cur.t, arr, m: Math.round(d * 1.3) }] }); next.push(S.name); }
    }
  };
  for (let it = 0; it < 7 && todo.length; it++) {
    const next = [];
    for (const from of todo) {
      const cur = best.get(from);
      if (!cur.legs.length || !cur.legs[cur.legs.length - 1].walk) walkFrom(from, cur, next);
      for (const { r, seq } of conn) {
        const i = seq.findIndex(q => q.st.name === from); if (i < 0 || i === seq.length - 1) continue;
        // eerste vertrek na aankomst (+2 min overstaptijd)
        const ready = cur.t + (cur.legs.length ? 120 : 0);
        // echte ritten van vandaag: geplande tijd + vertraging (of wachten voor een vrije rijweg) van die rit;
        // een vertraagde vorige rit kan dus nog gehaald worden
        let wait = (r.off + seq[i].dep) - ready; wait = ((wait % r.h) + r.h) % r.h;
        const dep0 = ready + wait, k0 = Math.round((dep0 - seq[i].dep - r.off) / r.h), nK = P / r.h;
        let pick = null;
        for (let g2 = -2; g2 < nK; g2++) {
          const k = (((k0 + g2) % nK) + nK) % nK; if (!runs(r, k)) continue;
          const dep = dep0 + g2 * r.h + effDelay(r, k, seq[i].dep);
          if (dep < ready) continue;
          if (!pick || dep < pick.dep) pick = { k, dep, sched: dep0 + g2 * r.h };
          if (g2 > 2 && pick) break;
        }
        if (!pick) continue;
        for (let j = i + 1; j < seq.length; j++) {
          const arr = pick.sched + (seq[j].arr - seq[i].dep) + effDelay(r, pick.k, seq[j].arr), to = seq[j].st.name;
          const b0 = best.get(to);
          if (!b0 || arr < b0.t) { best.set(to, { t: arr, legs: [...cur.legs, { run: r, from, to, dep: pick.dep, arr, k: pick.k, delay: Math.round(pick.dep - pick.sched) }] }); next.push(to); }
        }
      }
    }
    todo.splice(0, todo.length, ...new Set(next));
  }
  return best.get(b) || null;
}

// ---------- een rijtuig als "schip": je kan erin rondlopen terwijl de trein rijdt ----------
class CarBody {
  constructor(train, i, d) { this.train = train; this.i = i; this.d = d; this.g = { W: d.W, H: d.H, L: d.L }; this.world = d.world; this.T = { name: train.name }; this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.m = new THREE.Matrix4(); this.mi = new THREE.Matrix4(); this.cx = d.W / 2; this.cz = d.L / 2; this.isTrain = true; }
  setPose(x, y, z, yaw, pitch) {
    this.pos.set(x, y, z); this.yaw = yaw; this.pitch = pitch;
    this.m.makeRotationFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')).setPosition(x, y, z);
    this.mi.copy(this.m).invert();
  }
  toLocal(v, out) { out.copy(v).applyMatrix4(this.mi); out.x += this.cx; out.z += this.cz; return out; }
  toWorld(v, out) { out.set(v.x - this.cx, v.y, v.z - this.cz).applyMatrix4(this.m); return out; }
  inside(l, margin = 0) { return l.x >= -margin && l.z >= -margin - 1.5 && l.x < this.g.W + margin && l.z < this.g.L + margin + 1.5 && l.y > -1.5 && l.y < this.g.H + 2; }
}

// ---------- in het spel ----------
export class AlpRail {
  constructor(game) {
    this.g = game;
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.shells = new TrainShells(game.scene); // gladde buitenkant (van buiten), het blokinterieur aan boord
    this.infra = new RailInfra(game.scene, LINES, trackOffset, TRACK); // bovenleiding, seinpalen, wissels
    this.infra.setJunctions(JUNCTIONS);
    this.pax = new Passengers(game.scene, trackOffset, TRACK); // reizigers op de perrons
    { const w = game.world; this.pax.free = (x, y, z) => !IS_SOLID[w.get(x, y, z)] && !IS_SOLID[w.get(x, y + 1, z)] && !!IS_SOLID[w.get(x, y - 1, z)]; }
    this.designs = new Map(); this.trains = new Map(); this.t = 0;
    this.tmpV = new THREE.Vector3(); this.tmpW = new THREE.Vector3();
    this.announced = new Set();
    // seinlampen
    const lampG = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.sigMat = new THREE.MeshBasicMaterial({ vertexColors: false }); this.sigMax = 200;
    this.sigMesh = new THREE.InstancedMesh(lampG, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.sigMax); this.sigMesh.frustumCulled = false; this.sigMesh.count = 0;
    this.sigMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.sigMax * 3), 3);
    this.group.add(this.sigMesh);
    // tunnelbekleding dichtbij (zodat je bij hoge snelheid nooit in het niets kijkt)
    this.tunnelMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.tunnel = null; this.tunnelAt = null;
    this.hud = document.getElementById('drive-hud');
    this.player = null; // trein die de speler zelf bestuurt
    // overwegen: twee rode lampen per paal, knipperen als er een trein nadert
    this.xLamps = [];
    for (const c of CROSSINGS) for (const al of [-(c.al ?? 8), c.al ?? 8]) for (const sd of [-1, 1]) {
      const x = c.x + c.ux * al - c.uz * sd * (c.hw + 1), z = c.z + c.uz * al + c.ux * sd * (c.hw + 1);
      this.xLamps.push({ c, x: Math.floor(x) + 0.5, y: (c.y !== undefined && c.al ? c.y + 1 : groundAt(x, z)) + 4.5, z: Math.floor(z) + 0.5, al, sd });
    }
    // slagbomen (alleen bij overwegen met een eigen lengte: Greenisland): rood-wit, omlaag als er een trein komt
    this.xArms = this.xLamps.filter(l => l.c.al && Math.sign(l.al) === -l.sd);
    this.armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, this.xArms.length));
    this.armMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.xArms.length) * 3), 3);
    this.armMesh.frustumCulled = false; this.armMesh.count = 0; this.group.add(this.armMesh);
    this.xMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, this.xLamps.length));
    this.xMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.xLamps.length) * 3), 3);
    this.xMesh.frustumCulled = false; this.group.add(this.xMesh);
    this.signals = [];
    for (const L of LINES) for (let s = 600; s < L.len; s += 1200) { const p = L.at(s); if (p.kind === 0 || p.kind === 2) this.signals.push({ L, s, x: p.x, z: p.z, y: p.y, tx: p.tx, tz: p.tz }); }
  }
  dispose() {
    for (const tr of this.trains.values()) this.dropTrain(tr);
    this.shells?.dispose(); this.infra?.dispose(); this.pax?.dispose(); this.smoke?.dispose();
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.group.removeFromParent();
    if (this.tunnel) this.tunnel.geometry.dispose();
  }
  design(type, liv) {
    const k = type + ':' + liv; let d = this.designs.get(k);
    if (d) return d;
    d = design(type, liv);
    d.world = this.g.makeWorld({ size: d.size, H: d.H }, d.vox);
    // meshes één keer maken, elk rijtuig gebruikt dezelfde geometrie
    d.geos = [];
    const nc = d.world.nc;
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) {
      const out = meshChunk(d.world, cx, cz);
      for (const [buf, mat] of [[out.opaque, this.g.matOpaque], [out.trans, this.g.matTrans]]) {
        if (!buf.n) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
        geo.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tile, 2)); geo.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 1));
        geo.setAttribute('face', new THREE.Float32BufferAttribute(buf.face, 1));
        geo.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
        geo.computeBoundingSphere();
        d.geos.push([geo, mat]);
      }
    }
    this.designs.set(k, d);
    return d;
  }
  makeTrain(a) {
    const sv = a.run.sv;
    const tr = { id: a.id, sv, run: a.run, name: `${sv.name} → ${a.run.pr.last.name}`, cars: [] };
    for (let i = 0; i < sv.cars.length; i++) {
      // de achterste stuurrijtuigen kijken achteruit
      const type = sv.cars[i], d = this.design(type, sv.liv);
      const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
      for (const [geo, mat] of d.geos) { const m = new THREE.Mesh(geo, mat); m.position.set(-d.W / 2, 0, -d.L / 2); m.layers.enable(1); if (mat === this.g.matTrans) m.renderOrder = 1; grp.add(m); }
      this.group.add(grp);
      const bt = CAR_BASE[type] || type, flip = i === sv.cars.length - 1 && sv.cars.length > 1 && (bt === 'emuCab' || bt === 'iceHead' || bt === 'rack' || bt === 'tram');
      const shell = this.shells.make(d, LIVERY[sv.liv] || LIVERY.AE, null, `${sv.id} ${a.run.pr.last.name}`, sv.style || '');
      tr.cars.push({ d, grp, body: new CarBody(tr, i, d), flip, shell });
    }
    return tr;
  }
  // van buiten de gladde buitenkant, aan boord het interieur; deuren schuiven open als de trein aan een perron staat
  dressTrain(tr, aboard, dt, doorWant) {
    tr.doorF = Math.max(0, Math.min(1, (tr.doorF || 0) + (doorWant ? 1 : -1) * dt / 1.6));
    // stroomafnemer: neer als de trein meer dan 20 s stilstaat zonder open deuren (opstellen, keren), anders op
    const mine = this.player && this.player.tr === tr, v = mine ? this.player.v : (tr.v || 0), busy = v > 0.05 || doorWant || (mine && this.player.throttle > 0);
    tr.idle = busy ? 0 : (tr.idle || 0) + dt;
    const pantoWant = tr.idle > 20 ? 0 : 1, pp = this.g.player.pos;
    // stoomlocomotief: rookwolkjes uit de schoorsteen in het ritme van de drijfwielen (js/smoke.js), alleen van buiten en in de buurt
    if (tr.sv && tr.sv.style === 'hist' && tr.cars[0] && tr.cars[0].shell && !aboard) {
      const sh = tr.cars[0].shell.g, near = Math.hypot(sh.position.x - pp.x, sh.position.z - pp.z) < 600;
      if (near) {
        const sm = this.smoke || (this.smoke = new Smoke(this.g.scene));
        tr.chuff = (tr.chuff || 0) + dt * (v > 0.2 ? v / 1.33 : 0.6); // 4 stoten per omwenteling (omtrek 5,3 m); stilstand: dun pluimpje
        if (tr.chuff >= 1) {
          tr.chuff = 0; const d = tr.cars[0].d, hz = (d && d.L ? d.L : 12) / 2;
          const w = sh.localToWorld(new THREE.Vector3(0, 5.2, hz - 1.4)), f = sh.localToWorld(new THREE.Vector3(0, 5.2, hz)).sub(w).normalize();
          sm.puff(w.x, w.y, w.z, f.x * v, f.z * v, v > 0.2 ? 1 : 0.6);
        }
      }
    }
    for (const c of tr.cars) if (c.shell) {
      this.shells.setPanto(c.shell, pantoWant, dt);
      this.shells.setFar(c.shell, !aboard && Math.hypot(c.shell.g.position.x - pp.x, c.shell.g.position.z - pp.z) > LOD_DIST);
    }
    for (const c of tr.cars) {
      c.grp.visible = aboard || !c.shell;
      if (c.shell) { c.shell.g.visible = !aboard; this.shells.setDoors(c.shell, tr.doorF); }
    }
  }
  dropTrain(tr) {
    if (this.g.aboard && this.g.aboard.train === tr) this.g.leaveVessel?.();
    for (const c of tr.cars) { c.grp.removeFromParent(); c.shell?.g.removeFromParent(); }
  }
  // plaats van alle rijtuigen van een trein
  // punt op afstand 'dist' achter de kop; via = de vorige lijn (net over een wissel tussen lijnen gereden):
  // wat verder achter de kop zit dan het wisselpunt, staat nog op de vorige lijn
  pathPoint(L, sHead, dir, dist, via, out) {
    let LL = L, sx = sHead - dir * dist, d = dir;
    if (via && via.trail && via.trail.length) {
      let rem = dist - (sHead - via.sIn) * dir;
      if (rem > 0) for (const seg of via.trail) {
        const avail = seg.sIn === undefined ? Infinity : (seg.sOut - seg.sIn) * seg.dir;
        LL = seg.L; d = seg.dir; sx = seg.sOut - seg.dir * Math.min(rem, avail);
        if (rem <= avail) break;
        rem -= avail;
      }
    }
    LL.at(sx, out);
    const o = LL.connector ? 0 : trackOffset(LL, sx) * d;
    out.px = out.x - out.tz * o; out.pz = out.z + out.tx * o; out.ty = Math.atan2(out.tx * d, out.tz * d);
    return out;
  }
  place(tr, L, sHead, dir, via) {
    const p = {}, q = {};
    let off = 0;
    for (const c of tr.cars) {
      const sc = sHead - dir * (off + c.d.L / 2), sf = sc + dir * c.d.L / 2, sb = sc - dir * c.d.L / 2;
      this.pathPoint(L, sHead, dir, off, via, p); this.pathPoint(L, sHead, dir, off + c.d.L, via, q);
      const fx = p.px, fz = p.pz, bx = q.px, bz = q.pz;
      const fy = p.y + 1, by = q.y + 1;
      let yaw = Math.atan2(fx - bx, fz - bz), pitch = Math.atan2(fy - by, Math.hypot(fx - bx, fz - bz));
      if (c.flip) { yaw += Math.PI; pitch = -pitch; }
      const x = (fx + bx) / 2, z = (fz + bz) / 2, y = (fy + by) / 2;
      c.body.setPose(x, y, z, yaw, pitch);
      c.grp.position.set(x, y, z); c.grp.rotation.set(-pitch, yaw, 0);
      if (c.shell) {
        c.shell.g.position.set(x, y, z); c.shell.g.rotation.set(-pitch, yaw, 0);
        // draaistellen volgen het spoor: hoek tussen de spoorrichting op het draaistel en de bak
        if (c.shell.g.visible && c.shell.bogies && Math.abs(x - this.g.player.pos.x) < 400 && Math.abs(z - this.g.player.pos.z) < 400) {
          for (const b of c.shell.bogies) {
            this.pathPoint(L, sHead, dir, off + c.d.L / 2 - (c.flip ? -b.userData.z : b.userData.z), via, q);
            let ty = q.ty + (c.flip ? Math.PI : 0), d = ty - yaw;
            d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            b.rotation.y = Math.max(-0.35, Math.min(0.35, d));
          }
        }
      }
      off += c.d.L + GAP;
    }
  }
  update(dt, day) {
    const g = this.g, p = g.player.pos;
    this.t += dt;
    const now = railClock();
    setDelayWeather(g.curWeather);
    const act = activeTrains(now);
    this.active = act;
    const seen = new Set();
    let snd = null;
    // treinen in de buurt tonen (3 km), de rest alleen op de kaart
    for (const a of act) {
      if (this.player && this.player.id === a.id) continue;
      const L = a.run.pr.L, dir = a.run.dir;
      let s = a.run.pr.s0 + dir * a.x;
      // achter de zelf bestuurde trein wachten (sein op rood)
      if (this.player && this.player.L === L && this.player.dir === dir) {
        const ds = (this.player.s - s) * dir;
        if (ds > 0 && ds < 600) { s = this.player.s - dir * 600; a.held = true; }
      }
      a.s = s; a.loc = L.route ? L.route.locate(s) : null; // doorgaande route: op welk echt spoor
      const hp = L.at(s);
      const d = Math.hypot(hp.x - p.x, hp.z - p.z);
      let tr = this.trains.get(a.id);
      const aboardThis = g.aboard && g.aboard.train && g.aboard.train === tr;
      if (d > 3000 && !aboardThis) { if (tr) { this.dropTrain(tr); this.trains.delete(a.id); } continue; }
      if (!tr) { tr = this.makeTrain(a); this.trains.set(a.id, tr); }
      tr.a = a; tr.L = L; tr.dir = dir; tr.s = s; tr.v = a.v;
      this.place(tr, L, s, dir);
      this.dressTrain(tr, aboardThis, dt, doorsOpenAt(a));
      if (aboardThis) snd = { v: a.v, th: 0.5, br: -1, kind: a.run.sv.style === 'hist' ? 'steam' : a.run.sv.metro ? 'metro' : a.run.sv.tram ? 'tram' : 'train' };
      seen.add(a.id);
    }
    // de zelf bestuurde trein (na het verlaten van de cabine: uitbollen en blijven staan)
    if (this.player) {
      const pt = this.player;
      if (!g.drive) { pt.v = Math.max(0, pt.v - 0.9 * dt); pt.s += pt.dir * pt.v * dt; pt.s = Math.max(5, Math.min(pt.L.len - 5, pt.s)); }
      const hp = pt.L.at(pt.s);
      if (!g.drive && !(g.aboard && g.aboard.train === pt.tr) && Math.hypot(hp.x - p.x, hp.z - p.z) > 1500) { this.dropTrain(pt.tr); this.trains.delete(pt.tr.id); this.player = null; }
      else { this.place(pt.tr, pt.L, pt.s, pt.dir, pt.trail ? pt : null); seen.add(pt.tr.id); this.dressTrain(pt.tr, !!(g.aboard && g.aboard.train === pt.tr) || (!!g.drive && !['chase', 'side'].includes(g.drive.cam)), dt, pt.doors ? 1 : 0); }
    }
    if (this.infra && (this.infra.switches.length || this.infra.jsw.length)) {
      const list = [];
      for (const a of act) if (a.s !== undefined) list.push(a.loc && a.loc.L ? { L: a.loc.L, s: a.loc.s, dir: a.loc.dir, len: a.run.pr.len || 200 } : { L: a.run.pr.L, s: a.s, dir: a.run.dir, len: a.run.pr.len || 200 });
      if (this.player) list.push({ L: this.player.L, s: this.player.s, dir: this.player.dir, len: 200 });
      this.updateRoutes(act);
      this.infra.animate(dt, list, this.player, this.routeState);
    }
    const pt = this.player;
    if (pt && g.drive) snd = { v: pt.v, th: pt.throttle, br: pt.brake, kind: pt.tr.sv && pt.tr.sv.style === 'hist' ? 'steam' : 'train', out: ['chase', 'side'].includes(g.drive.cam) };
    // treingeluid: in de trein (meerijden of besturen)
    if (snd) {
      if (!this.snd) this.snd = new RailSound(snd.kind);
      const dv = snd.v - (this.sndV ?? snd.v); this.sndV = snd.v;
      const th = snd.br < 0 ? (dv > 0.002 ? 0.7 : 0.05) : snd.th, br = snd.br < 0 ? (dv < -0.004 ? 0.8 : 0) : snd.br;
      this.snd.update(dt, snd.v, th, br, !snd.out);
    } else if (this.snd) { this.snd.stop(); this.snd = null; this.sndV = undefined; }
    this.updateDepots(now, p, dt, seen);
    for (const [id, tr] of this.trains) if (!seen.has(id)) { if (g.aboard && g.aboard.train === tr) { this.g.toast('🚉 Deze trein rijdt de remise in. Je stapt uit.'); this.alight(true); } this.dropTrain(tr); this.trains.delete(id); }
    this.shells.update(day); this.smoke?.update(dt, day);
    this.updateSignals(act);
    this.infra?.update(p); this.infra?.setDay(day);
    this.updateNav();
    // reizigers: treinen in de buurt met hun deuren (langs de lijn) en of de deuren open zijn
    if (this.pax) {
      const list = [], tmpv = new THREE.Vector3();
      for (const [id, tr] of this.trains) {
        if (!tr.L || Math.abs(tr.L.at(tr.s).x - p.x) > 400) continue;
        // doorgaande route over een wissel of rangeerpad: de reizigers gebruiken het echte spoor waar de trein nu staat
        const mine0 = this.player && this.player.tr === tr, loc = !mine0 && tr.L.route && tr.a && tr.a.loc && tr.a.loc.L ? tr.a.loc : null;
        const LL = mine0 ? this.player.L : loc ? loc.L : tr.L; if (typeof LL.near !== 'function') continue;
        const mine = this.player && this.player.tr === tr, open = mine ? (this.player.doors && this.player.v < 0.1) : (tr.a ? !!doorsOpenAt(tr.a) : false);
        const doors = [];
        if (open) for (const c of tr.cars) for (const dz of c.d.doors) { const w = c.body.toWorld(tmpv.set(c.d.W / 2, 1, dz + 0.5), new THREE.Vector3()); const r = LL.near(Math.floor(w.x), Math.floor(w.z), 12); if (r) doors.push(r.s); }
        list.push({ key: id, L: LL, dir: mine ? this.player.dir : loc ? loc.dir : tr.dir, s: mine ? this.player.s : loc ? loc.s : tr.s, open: open && doors.length > 0, doors, get alighted() { return tr.paxOut; }, set alighted(v) { tr.paxOut = v; } });
      }
      this.pax.update(dt, p, LINES, list, periodOf(railClock()));
      // stationsomroep: een trein staat klaar aan het perron waar de speler staat (niet aan boord)
      if (!g.aboard && !g.drive) for (const it of list) {
        const tr = this.trains.get(it.key); if (!tr || !it.open) { if (tr) tr.annAt = null; continue; }
        if (tr.annAt) continue;
        const S = [...this.pax.stations.values()].find(S => S.L === it.L && it.s > S.st.s0 - 20 && it.s < S.st.s1 + 20); if (!S) continue;
        const q = it.L.at((S.st.s0 + S.st.s1) / 2); if (Math.hypot(q.x - p.x, q.z - p.z) > S.st.len / 2 + 30 || Math.abs(q.y - p.y) > 12) continue;
        tr.annAt = S.st.name; this.annCount = (this.annCount || 0) + 1;
        this.say(`${S.st.name}. ${tr.name.replace('→', 'naar')} staat klaar. Instappen, alstublieft.`);
      }
      this.pax.setDay(day);
    }
    this.updateCrossings(act);
    this.updateTunnel(p);
    this.updateAboard(dt);
    // wachten op het perron: automatisch instappen zodra er een trein stilstaat
    if (this.waitAt && !g.aboard && !g.drive) {
      if (Math.hypot(p.x - this.waitAt.x, p.z - this.waitAt.z) > 40) this.waitAt = null;
      else if (this.nearestDoor(30)) { const d = this.nearestDoor(30); if (d.d > 14) { /* naar de deur stappen */ const w = d.c.body.toWorld(new THREE.Vector3(-1.2, 1.05, d.dz + 0.5), new THREE.Vector3()); g.player.pos.set(w.x, w.y, w.z); } this.board(); }
    }
    // knop om in te stappen (telefoon) naast een trein of op een perron
    if ((this.btnT = (this.btnT || 0) + dt) > 0.4) {
      this.btnT = 0;
      const show = !g.aboard && !g.drive && (!!this.nearestDoor() || !!this.stationHere());
      this.canBoard = show;
      if (show !== !!this.btnShown) { this.btnShown = show; document.getElementById('t-drive')?.classList.toggle('show', show || !!g.nearVehicle); if (show && !this.boardHint) { this.boardHint = true; g.toast(g.touch ? '🚆 Tik op 🚗 → Meerijden om in de trein te stappen' : '🚆 Druk J om in de trein te stappen (of om op de volgende trein te wachten)'); } }
    }
  }
  // ---------- seinen: rood als het volgende blok (1200 m) bezet is ----------
  // rijwegen over de overloopwissels voor automatische treinen (doorgaande routes, js/railroute.js):
  // 800 m voor de wissel wordt de rijweg ingesteld en vergrendeld voor die trein (wissel om, naar lijn B), op de
  // wissel is hij bezet, na de passage van de hele trein wordt hij vrijgegeven. Controle tijdens het spelen: staat
  // er een andere trein op een conflicterend stuk terwijl de rijweg vergrendeld is, dan telt dat als conflict.
  updateRoutes(act) {
    const R = this.routeState || (this.routeState = new Map()), log = this.routeLog || (this.routeLog = []);
    this.routeConflicts = this.routeConflicts || 0;
    const seenX = new Set();
    for (const a of act) {
      const Ro = a.run.pr.L.route; if (!Ro || a.s === undefined) continue;
      const X = Ro.X, s = a.s, len = a.run.pr.len || 120;
      const st = s < Ro.l1 - 800 ? null : s < Ro.l1 ? 'ingesteld' : s < Ro.l1 + Ro.l2 + len ? 'bezet' : null;
      const prev = R.get(X.id);
      if (st) {
        seenX.add(X.id);
        if (!prev || prev.train !== a.id || prev.state !== st) { log.push({ wissel: X.id, trein: a.id, toestand: st, t: Math.round(this.t) }); if (log.length > 40) log.shift(); }
        R.set(X.id, { state: st, train: a.id, X, sinds: prev && prev.train === a.id ? prev.sinds : this.t });
      } else if (prev && prev.train === a.id && s >= Ro.l1 + Ro.l2 + len) { log.push({ wissel: X.id, trein: a.id, toestand: 'vrijgegeven', t: Math.round(this.t) }); R.delete(X.id); }
    }
    for (const [id, r] of R) {
      if (!seenX.has(id)) { R.delete(id); continue; }
      // conflictcontrole: een andere trein op A of B binnen 250 m van de wissel (beide richtingen)
      for (const b of act) {
        if (b.id === r.train || b.s === undefined) continue;
        const L = b.loc ? b.loc.L : b.run.pr.L, sb = b.loc ? b.loc.s : b.s; if (!L) { if (b.loc && b.loc.X === r.X) this.routeConflicts++; continue; }
        const lenB = b.run.pr.len || 120;
        if ((L === r.X.A && sb > Math.min(r.X.sA, r.X.sA + r.X.aDir * r.X.len) - 30 - lenB && sb < Math.max(r.X.sA, r.X.sA + r.X.aDir * r.X.len) + 30 + lenB) ||
            (L === r.X.B && Math.abs(sb - r.X.sBend) < 30 + lenB) ) { if (r.state === 'bezet') this.routeConflicts++; }
      }
    }
  }
  updateSignals(act) {
    const p = this.g.player.pos, m4 = new THREE.Matrix4(), c = new THREE.Color(), posts = [];
    let n = 0;
    for (const sg of this.signals) {
      if (Math.abs(sg.x - p.x) > 1200 || Math.abs(sg.z - p.z) > 1200 || n >= this.sigMax) continue;
      let occ = 0;
      for (const a of act) {
        const eL = a.loc ? a.loc.L : a.run.pr.L, eDir = a.loc ? a.loc.dir : a.run.dir; // doorgaande route: het echte spoor
        if ((this.player && a.id === this.player.id) || eL !== sg.L || eDir !== 1) continue;
        const s = a.loc ? a.loc.s : a.s ?? (a.run.pr.s0 + a.run.dir * a.x), ds = s - sg.s;
        if (ds > -a.run.pr.len && ds < 1200) occ = Math.max(occ, 2); else if (ds >= 1200 && ds < 2400) occ = Math.max(occ, 1);
      }
      if (this.player && this.player.L === sg.L && this.player.dir === 1) { const ds = this.player.s - sg.s; if (ds > -200 && ds < 1200) occ = 2; }
      const nx = -sg.tz, nz = sg.tx, off = 5.4 - 0.6;
      // seinlamp vooraan op de seinkast (naar de aankomende trein), paal tot op de grond
      m4.makeTranslation(sg.x + nx * off - sg.tx * 0.3, sg.y + 6.5, sg.z + nz * off - sg.tz * 0.3);
      this.sigMesh.setMatrixAt(n, m4);
      posts.push({ x: sg.x + nx * off, y: sg.y + 6.5, y0: sg.y + 1, z: sg.z + nz * off, yaw: Math.atan2(sg.tx, sg.tz) });
      c.set(occ === 2 ? 0xff2a1a : occ === 1 ? 0xffc21a : 0x2aff5a);
      this.sigMesh.setColorAt(n, c);
      n++;
    }
    this.sigMesh.count = n;
    if (this.infra && (!this.postsAt || Math.hypot(p.x - this.postsAt.x, p.z - this.postsAt.z) > 100)) { this.postsAt = { x: p.x, z: p.z }; this.infra.setSignals(posts); }
    this.sigMesh.instanceMatrix.needsUpdate = true; if (this.sigMesh.instanceColor) this.sigMesh.instanceColor.needsUpdate = true;
  }
  updateCrossings(act) {
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), blink = Math.floor(this.t * 2) % 2, P0 = this.g.player.pos;
    this.xLamps.forEach((l, i) => {
      if (Math.abs(l.x - P0.x) > 1500 || Math.abs(l.z - P0.z) > 1500) { if (l.c.closed) l.c.closed = false; m4.makeTranslation(l.x, -1000, l.z); this.xMesh.setMatrixAt(i, m4); return; } // ver weg: niet bijwerken
      let near = false;
      for (const a of act) { if (a.run.pr.L.id !== l.c.line || a.t < 0) continue; const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x); if (Math.abs(s - l.c.s) < 700) near = true; }
      if (this.player && this.player.L.id === l.c.line && Math.abs(this.player.s - l.c.s) < 700) near = true;
      l.c.closed = near;
      m4.makeTranslation(l.x, l.y, l.z); this.xMesh.setMatrixAt(i, m4);
      col.set(near ? ((i + blink) % 2 ? 0xff2010 : 0x300000) : 0x300000); this.xMesh.setColorAt(i, col);
    });
    this.xMesh.instanceMatrix.needsUpdate = true; if (this.xMesh.instanceColor) this.xMesh.instanceColor.needsUpdate = true;
    // slagbomen: liggend over de rijbaan als de overweg dicht is, anders rechtop
    let n = 0; const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const l of this.xArms) {
      if (Math.abs(l.x - P0.x) > 600 || Math.abs(l.z - P0.z) > 600) continue;
      const c = l.c, len = c.hw + 0.6, down = c.closed, yaw = Math.atan2(-c.uz * -l.sd, c.ux * -l.sd); void yaw;
      // richting van de paal naar het midden van de weg: (c.uz * sd, -c.ux * sd) (loodrecht op de weg)
      const dx = c.uz * l.sd, dz = -c.ux * l.sd;
      if (down) { v.set(l.x + dx * len / 2, l.y - 3.3, l.z + dz * len / 2); e.set(0, Math.atan2(dx, dz), 0); sc.set(1, 1, len); }
      else { v.set(l.x + dx * 0.4, l.y - 3.3 + len / 2, l.z + dz * 0.4); e.set(Math.PI / 2, Math.atan2(dx, dz), 0, 'YXZ'); sc.set(1, 1, len); }
      q.setFromEuler(e); m4.compose(v, q, sc); this.armMesh.setMatrixAt(n, m4); col.set(n % 2 ? 0xd71920 : 0xf4f4f4); this.armMesh.setColorAt(n, col); n++;
      if (n >= this.xArms.length) break;
    }
    this.armMesh.count = n; this.armMesh.instanceMatrix.needsUpdate = true; if (this.armMesh.instanceColor) this.armMesh.instanceColor.needsUpdate = true;
    // het verkeer wacht voor een gesloten overweg
    if (this.g.traffic) this.g.traffic.stopZones = CROSSINGS.filter(c => c.closed).map(c => ({ x: c.x, z: c.z, r: (c.al ?? 8) + 2 }));
  }
  // ---------- tunnelbekleding rond de speler ----------
  updateTunnel(p) {
    if (this.tunnelAt && Math.hypot(this.tunnelAt[0] - p.x, this.tunnelAt[1] - p.z) < 250) return;
    this.tunnelAt = [p.x, p.z];
    if (this.tunnel) { this.group.remove(this.tunnel); this.tunnel.geometry.dispose(); this.tunnel = null; }
    const pos = [], col = [];
    const quad = (a, b, c2, d, rgb) => { pos.push(...a, ...b, ...c2, ...a, ...c2, ...d); for (let i = 0; i < 6; i++) col.push(...rgb); };
    const q = {}, r = {};
    for (const L of LINES) for (const [a, b] of L.tunnels) {
      for (let s = a; s < b; s += 8) {
        L.at(s, q); if (Math.abs(q.x - p.x) > 700 || Math.abs(q.z - p.z) > 700) continue;
        if (L.stationAt(s) || L.stationAt(s + 8)) continue; // ondergrondse perronhal: geen tunnelwanden voor de perrons
        L.at(Math.min(b, s + 8), r);
        const w = L.single ? 2.35 : 4.8, hgt = 5.8;
        const nx = -q.tz, nz = q.tx, mx = -r.tz, mz = r.tx;
        const A = (o, h) => [q.x + nx * o, q.y + 1 + h, q.z + nz * o], Bp = (o, h) => [r.x + mx * o, r.y + 1 + h, r.z + mz * o];
        const lit = Math.floor(s / 24) % 1 === 0 && Math.floor(s / 8) % 3 === 0;
        quad(A(-w, 0), Bp(-w, 0), Bp(-w, hgt), A(-w, hgt), [0.22, 0.22, 0.24]);
        quad(A(w, 0), Bp(w, 0), Bp(w, hgt), A(w, hgt), [0.22, 0.22, 0.24]);
        quad(A(-w, hgt), Bp(-w, hgt), Bp(w, hgt), A(w, hgt), [0.17, 0.17, 0.19]);
        if (lit) quad(A(-w + 0.02, 4.0), Bp(-w + 0.02, 4.0), Bp(-w + 0.02, 4.3), A(-w + 0.02, 4.3), [1.0, 0.9, 0.6]);
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.tunnel = new THREE.Mesh(geo, this.tunnelMat); this.tunnel.frustumCulled = false;
    this.group.add(this.tunnel);
  }
  // ---------- aan boord ----------
  trainOfBody(v) { return v && v.isTrain ? v.train : null; }
  updateAboard(dt) {
    const g = this.g, v = g.aboard, tr = this.trainOfBody(v);
    if (!tr) { g.extVel = null; this.hideHud(); return; }
    // snelheid van de trein (voor het vooruit laden van tegels)
    const sp = this.player && this.player.tr === tr ? this.player.v : tr.v || 0;
    g.extVel = new THREE.Vector3(Math.sin(v.yaw) * sp, 0, Math.cos(v.yaw) * sp);
    // opstaan zodra je gaat lopen
    const l = g.player.loc, k = g.keys;
    if (g.player.seated && l && (k.has('KeyW') || k.has('KeyS') || k.has('KeyA') || k.has('KeyD') || k.has('ArrowUp') || k.has('ArrowDown') || Math.hypot(g.joy?.x || 0, g.joy?.y || 0) > 0.3)) { g.player.seated = false; l.x = 2.5; l.y = 2.05; }
    if (l) {
      const i = v.i, c = tr.cars[i], fwd = c.flip ? l.z < 0.4 : l.z > v.g.L - 0.4, back = c.flip ? l.z > v.g.L - 0.4 : l.z < 0.4;
      if (fwd && i > 0 && tr.cars[i - 1].d.walk) { const n = tr.cars[i - 1]; this.moveCar(tr, i, i - 1, n.flip ? n.d.L - 0.5 : 0.5); }
      else if (back && i < tr.cars.length - 1 && tr.cars[i + 1].d.walk) { const n = tr.cars[i + 1]; this.moveCar(tr, i, i + 1, n.flip ? 0.5 : n.d.L - 0.5); }
    }
    // internationale trein: aan het einde van de Noordzeetunnel verder reizen naar de echte stad
    const a = tr.a, pr = a ? a.run.pr : null;
    if (a && a.run.sv.international && a.t > pr.T - 20 && !this.travelling && NET.international) {
      const d = NET.international[a.run.sv.international];
      if (d) { this.travelling = true; g.toast(`🚄 Aankomst: ${d.name}. Je reist verder…`); this.say(`Wij bereiken ${d.name}. Bedankt voor uw reis met de ${a.run.sv.name}.`); setTimeout(() => { this.travelling = false; g.aboard = null; g.ui.onTravel?.({ ...d, byTrain: true }); }, 2500); }
    }
    if (pr && !(this.player && this.player.tr === tr)) {
      const next = pr.stops.find(q => q.arr > a.t);
      if (next && next.arr - a.t < 50 && !this.announced.has(tr.id + next.st.name)) {
        this.announced.add(tr.id + next.st.name);
        const lines = (STATIONS_ALL.find(q => q.name === next.st.name)?.lines || []).filter(id => id !== pr.L.id).map(id => LINE[id].name);
        this.say(`Volgende halte: ${next.st.name}.${lines.length ? ' Overstappen op de ' + lines.join(' en de ') + '.' : ''}`);
      }
      this.showHud(tr, a);
    }
  }
  moveCar(tr, from, to, z, flip) {
    const g = this.g, A = tr.cars[from].body, Bb = tr.cars[to].body, l = g.player.loc;
    const w = A.toWorld(l, this.tmpW);
    const nl = Bb.toLocal(w, this.tmpV.clone());
    nl.z = z; nl.x = Math.max(2.32, Math.min(2.68, nl.x)); nl.y = Math.max(nl.y, 2.02);
    g.aboard = Bb; g.player.loc = nl; g.player.yawLoc = (g.player.yawLoc ?? 0) + (A.yaw - Bb.yaw);
    void flip;
  }
  // instappen: aan een perron naast een stilstaande trein
  // dichtste deur van een (bijna) stilstaande trein: { tr, c, dz, d }
  nearestDoor(maxD = 14) {
    const p = this.g.player.pos, tmp = new THREE.Vector3();
    let best = null;
    for (const tr of this.trains.values()) {
      const mine = this.player && this.player.tr === tr;
      if ((mine ? this.player.v : tr.v || 0) > 1.2) continue;
      for (const c of tr.cars) {
        if (!c.d.walk) continue;
        const l = c.body.toLocal(p, tmp);
        if (Math.abs(l.y - 1) > 5) continue;
        const side = Math.max(0, -l.x, l.x - c.d.W); // afstand tot de zijkant van het rijtuig
        for (const dz of c.d.doors) { const d = Math.hypot(l.z - dz - 0.5, side); if (d < maxD && (!best || d < best.d)) best = { tr, c, dz, d }; }
      }
    }
    return best;
  }
  // station waar de speler staat (perron of stationsplein)
  stationHere() {
    const p = this.g.player.pos;
    for (const L of LINES) { const q = L.near(p.x, p.z, 30); if (!q) continue; const st = L.stationAt(q.s); if (st && Math.abs(p.y - (st.y ?? q.y)) < 8) return st; }
    return null;
  }
  // instappen: aan een perron naast een (bijna) stilstaande trein; anders wachten op de volgende trein
  board() {
    const g = this.g, best = this.nearestDoor();
    if (!best) {
      const st = this.stationHere();
      if (!st) { this.waitAt = null; return false; }
      const dep = departures(st.name, railClock(), 1)[0];
      this.waitAt = { name: st.name, x: g.player.pos.x, z: g.player.pos.z };
      g.toast(dep ? `🚉 ${st.name}: de volgende trein is de ${dep.run.sv.name} naar ${dep.dest} (${hhmm(dep.at)}, over ${Math.max(1, Math.round(dep.in / 60))} min). Blijf op het perron staan: je stapt automatisch in zodra hij stilstaat.` : `🚉 ${st.name}: even wachten op de volgende trein…`);
      return true;
    }
    this.waitAt = null;
    const { tr, c, dz } = best;
    // Greenisland: een kaartje in ViridCoin (eenmaal per rit)
    if (g.wallet && g.wallet.ticket && tr.paidBy !== g) {
      const pr = g.wallet.ticket(tr.sv);
      if (!g.wallet.pay(pr, `kaartje ${tr.sv.name}`)) { g.toast(`💰 Niet genoeg ViridCoin voor een kaartje (${pr} VC). Verdien VC met opdrachten.`); return true; }
      tr.paidBy = g; g.toast(`🎫 Kaartje ${tr.sv.name}: ${pr} VC (saldo ${Math.round(g.wallet.balance * 100) / 100} VC)`);
    }
    g.aboard = c.body; g.player.loc = new THREE.Vector3(2.5, 2.02, dz + 0.5); g.player.yawLoc = c.flip ? 0 : Math.PI; g.player.fly = false; g.player.vel.set(0, 0, 0);
    g.toast(`🚆 Ingestapt: ${tr.name}. J = zitplaats kiezen · loop gerust door de trein · aan de deur J = uitstappen`);
    this.say(`Welkom aan boord van de ${tr.sv.name} naar ${tr.a ? tr.a.run.pr.last.name : ''}.`);
    return true;
  }
  // uitstappen aan de deur (alleen stilstaand) — force: de trein verdwijnt (remise)
  alight(force) {
    const g = this.g, v = g.aboard, tr = this.trainOfBody(v); if (!tr) return false;
    const sp = this.player && this.player.tr === tr ? this.player.v : tr.v || 0;
    if (sp > 0.3 && !force) { g.toast('🚪 De deuren gaan pas open als de trein stilstaat'); return true; }
    const l = g.player.loc, dz = v.d.doors.reduce((a, b) => Math.abs(b - l.z) < Math.abs(a - l.z) ? b : a, v.d.doors[0]);
    // naar de kant van het perron (of de kant met de laagste grond)
    let out = null;
    for (const side of [-1.2, v.g.W + 1.2]) {
      const w = v.toWorld(new THREE.Vector3(side, 1.0, dz + 0.5), new THREE.Vector3());
      const gy = g.world.groundY ? null : null; void gy;
      let y = Math.floor(w.y) + 3; while (y > w.y - 6 && !g.world.solidAt(Math.floor(w.x), y - 1, Math.floor(w.z))) y--;
      if (g.world.solidAt(Math.floor(w.x), y - 1, Math.floor(w.z)) && !g.world.solidAt(Math.floor(w.x), y, Math.floor(w.z))) { const sc = y - w.y; if (!out || Math.abs(sc - 0.5) < Math.abs(out.sc - 0.5)) out = { w, y, sc }; }
    }
    g.aboard = null; g.player.seated = false;
    const pos = out ? out.w : v.toWorld(new THREE.Vector3(-1.5, 2.5, dz + 0.5), new THREE.Vector3());
    g.player.pos.set(pos.x, out ? out.y + 0.02 : pos.y, pos.z); g.player.vel.set(0, 0, 0);
    g.player.yaw = (g.player.yawLoc ?? 0) + v.yaw;
    g.extVel = null; this.hideHud();
    if (!force) g.toast('🚉 Uitgestapt');
    return true;
  }
  sit() {
    const g = this.g, v = g.aboard, l = g.player.loc; if (!v || !v.d.seats.length) return false;
    const seats = v.d.seats;
    let i = seats.findIndex(s => Math.hypot(s[0] - l.x, s[2] - l.z) < 0.6);
    i = (i + 1) % seats.length;
    const s = seats[i];
    l.set(s[0], 2.02, s[2]); g.player.vel.set(0, 0, 0); g.player.seated = true;
    g.player.yawLoc = (v.train.cars[v.i].flip ? 0 : Math.PI) + (s[0] < 2 ? 0.0 : 0); // naar voren kijken
    g.toast(`🪑 Plaats ${i + 1} van ${seats.length} in dit rijtuig (J = volgende plaats)`);
    return true;
  }
  // H / J in de Alpenwereld
  handleKey(mode) {
    const g = this.g, v = g.aboard, tr = this.trainOfBody(v);
    if (tr) {
      const l = g.player.loc, c = tr.cars[v.i];
      if (mode === 'drive') {
        if (c.d.cab && Math.hypot(l.x - c.d.cab[0], l.z - c.d.cab[2]) < 2.6 && !c.flip) { this.startDriving(tr, c); return true; }
        g.toast('🚆 Ga naar de cabine helemaal vooraan om zelf te rijden'); return true;
      }
      // meerijden: bij een deur uitstappen, anders een zitplaats kiezen
      const nearDoor = c.d.doors.some(dz => Math.abs(l.z - dz - 0.5) < 1.4);
      if (nearDoor) return this.alight(false);
      return this.sit() || true;
    }
    if (mode === 'passenger' || mode === 'drive') return this.board();
    return false;
  }
  // ---------- zelf rijden ----------
  startDriving(tr, c) {
    const g = this.g, a = tr.a;
    this.player = { tr, L: tr.L, dir: tr.dir, s: tr.s, v: tr.v || 0, throttle: 0, brake: 0, emergency: false, doors: false, id: tr.id, car: c, nextStop: null, delay: 0, sched: a, base: a ? railClock() - (a.t || 0) : null }; // base: vertrek volgens de dienstregeling (voor de carrièremodus)
    tr.id = 'speler'; this.trains.delete(a.id); this.trains.set('speler', tr);
    g.leaveVessel(); // physics: camera in de cabine
    g.drive = new TrainCab(this);
    g.toast('🚆 Cabine: W/▲ tractie · S/▼ rem · spatie noodrem · Q deuren · N omroep · H cabine verlaten');
  }
  stopDriving() {
    const g = this.g, pt = this.player; if (!pt) return;
    const c = pt.car;
    g.aboard = c.body; g.player.loc = new THREE.Vector3(c.d.cab[0], 2.02, c.d.cab[2] - 0.8); g.player.yawLoc = 0;
    if (pt.v < 0.3) {
      // de trein gaat naar de remise; de dienstregeling neemt het weer over
      g.toast('🚆 Cabine verlaten. Deze trein blijft hier staan tot je uitstapt.');
    }
    this.parked = pt; // blijft getoond
  }
  // de bestuurde trein bewegen
  drivePhys(dt) {
    let pt = this.player, L = pt.L; const k = this.g.keys, g = this.g;
    const up = k.has('KeyW') || k.has('ArrowUp') || g.padUp, down = k.has('KeyS') || k.has('ArrowDown') || g.padDown;
    if (up) { pt.throttle = Math.min(1, pt.throttle + dt * 0.8); pt.brake = Math.max(0, pt.brake - dt * 2); }
    if (down) { if (pt.throttle > 0) pt.throttle = Math.max(0, pt.throttle - dt * 1.5); else pt.brake = Math.min(1, pt.brake + dt * 0.9); }
    if (!up && !down) pt.brake = Math.max(0, pt.brake - dt * 0.2);
    if (g.padStop || k.has('Space')) pt.emergency = true;
    if (pt.emergency) { pt.throttle = 0; pt.brake = 1; }
    if (pt.doors) { pt.throttle = 0; }
    // seinen en snelheidsbeperking: automatische treinbeïnvloeding remt bij rood of veel te hard
    const lim = L.limAt(pt.s), sig = this.signalAhead(pt);
    pt.lim = lim; pt.sig = sig;
    let atp = false;
    if (sig && sig.red && sig.dist < 30 && pt.v > 1) atp = true;
    if (pt.v > lim * 1.12 + 1) atp = true;
    if (atp && !pt.atpWarn) { pt.atpWarn = true; g.toast('⚠ Automatische remming: sein op rood of te snel!'); }
    if (!atp) pt.atpWarn = false;
    const grade = L.at(pt.s).grade * pt.dir;
    // treinsimulatie: massa en tractie uit de echte rijtuigen, kleefkracht volgens het weer (wielslip), remmen
    // begrensd door de kleefkracht, rij- en luchtweerstand, helling (tandradbanen: het tandrad neemt de helling op)
    const ph = pt.phys || (pt.phys = trainPhysics(pt.tr));
    if (pt.sandT > 0) pt.sandT -= dt;
    const mu = adhesion(g.curWeather) + (pt.sandT > 0 ? 0.07 : 0), gN = 9.81, v = pt.v; // zand strooien: betere kleefkracht
    const fMax = ph.F * 1000, fPow = v > 0.5 ? ph.P * 1000 / v : fMax;            // N
    const fAdh = L.rack ? Infinity : mu * ph.Md * 1000 * gN;                      // N (aangedreven assen)
    const fWant = pt.throttle * Math.min(fMax, fPow);
    pt.slip = fWant > fAdh * 1.02 && v < 40;
    const fTr = pt.slip ? fAdh * 0.8 : fWant;                                      // slippende wielen trekken minder
    const bMax = Math.min(L.rack ? 1.4 : mu * gN * 0.9, 1.15);                     // bedrijfsrem, m/s²
    const bEm = Math.min(L.rack ? 1.8 : mu * gN * 0.95, 1.5);                      // noodrem
    const res = 0.012 + 0.0003 * v + 0.00009 * v * v * (ph.aero || 1);           // rol- en luchtweerstand, m/s²
    const acc = fTr / (ph.M * 1000) - pt.brake * bMax - (pt.emergency || atp ? bEm : 0) - gN * grade * (L.rack ? 0.15 : 1) - (v > 0.05 ? res : 0);
    pt.bMax = bMax; pt.mu = mu;
    pt.v = Math.max(0, pt.v + acc * dt);
    if (pt.v === 0) pt.emergency = false;
    // einde van de lijn
    const end = pt.dir > 0 ? L.len - 5 : 5;
    pt.s += pt.dir * pt.v * dt;
    if (!L.connector && (pt.s - end) * pt.dir > 0) { pt.s = end; pt.v = 0; }
    // overloopwissels voor de trein (A/D kiest): van lijn A naar B, of terug van B naar A
    const opts = [];
    for (const c of JUNCTIONS) {
      if (L.connector) break;
      if (c.A === L && c.aDir === pt.dir) { const ds = (c.sA - pt.s) * pt.dir; if (ds > -1 && ds < 3000) opts.push({ c, from: 'A', at: c.sA, ds, name: c.B.name || c.B.id }); }
      if (c.B === L && -c.bdir === pt.dir) { const ds = (c.sBend - pt.s) * pt.dir; if (ds > -1 && ds < 3000) opts.push({ c, from: 'B', at: c.sBend, ds, name: c.A.name || c.A.id }); }
    }
    opts.sort((p1, p2) => p1.ds - p2.ds);
    const next = opts[0] || null;
    if (!next || !pt.jSel || pt.jSel.c !== next.c || pt.jSel.from !== next.from) { if (pt.jSel && (!next || pt.jSel.c !== next.c)) pt.jSel = null; }
    pt.juncs = next ? [next] : []; pt.junction = pt.jSel;
    const prev = pt.s - pt.dir * pt.v * dt;
    const cross = (at) => (prev - at) * pt.dir < 0 && (pt.s - at) * pt.dir >= 0;
    const enter = (newL, sIn, newDir, over) => {
      (pt.trail || (pt.trail = [])).unshift({ L, sIn: pt.sIn, sOut: pt.dir > 0 ? Math.min(pt.s - pt.dir * over, L.len) : Math.max(pt.s - pt.dir * over, 0), dir: pt.dir });
      pt.L = newL; pt.dir = newDir; pt.s = sIn + newDir * over; pt.sIn = sIn;
    };
    if (pt.jSel && next && cross(next.at)) {
      const c = next.c, over = (pt.s - next.at) * pt.dir;
      if (next.from === 'A') enter(c, 0, 1, over); else enter(c, c.len, -1, over);
      pt.jSel = null; g.toast(`🔀 Over de wissel naar ${next.name} (max. 40 km/h)`);
    } else if (L.connector && (pt.dir > 0 ? pt.s >= L.len : pt.s <= 0)) {
      const c = L, over = pt.dir > 0 ? pt.s - c.len : -pt.s;
      if (pt.dir > 0) enter(c.B, c.sBend, c.bdir, over); else enter(c.A, c.sA, -c.aDir, over);
      this.say(`Wij rijden verder op ${pt.L.name || pt.L.id}.`);
    }
    // oude stukken achter de trein vergeten
    if (pt.trail) {
      const len = pt.tr.cars.reduce((acc, c) => acc + c.d.L + GAP, 0);
      let cov = (pt.s - pt.sIn) * pt.dir;
      for (let i = 0; i < pt.trail.length; i++) { if (cov > len + 10) { pt.trail.length = i; break; } const sg = pt.trail[i]; cov += sg.sIn === undefined ? Infinity : (sg.sOut - sg.sIn) * sg.dir; }
      if (!pt.trail.length) pt.trail = null;
    }
    // halte?
    const st = L.stations.find(q => Math.abs(pt.s - q.s) < q.len / 2);
    pt.atStation = st && pt.v < 0.3 ? st : null;
    const ahead = L.stations.filter(q => (q.s - pt.s) * pt.dir > 0).sort((a, b) => (a.s - b.s) * pt.dir)[0];
    pt.nextStop = ahead || null;
    if (ahead && Math.abs(ahead.s - pt.s) < 700 && !this.announced.has('p' + ahead.name)) { this.announced.add('p' + ahead.name); this.say(`Volgende halte: ${ahead.name}.`); }
  }
  signalAhead(pt) {
    let best = null;
    for (const a of this.active || []) {
      if (a.id === pt.id || a.run.pr.L !== pt.L || a.run.dir !== pt.dir) continue;
      const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), tail = s - a.run.dir * a.run.pr.len, ds = (tail - pt.s) * pt.dir;
      if (ds > 0 && (!best || ds < best.ds)) best = { ds };
    }
    // tegenliggers op enkelspoor
    if (pt.L.single || (pt.L.oldS && Math.abs(pt.s - (pt.L.oldS[0] + pt.L.oldS[1]) / 2) < (pt.L.oldS[1] - pt.L.oldS[0]) / 2 + 400)) {
      for (const a of this.active || []) {
        if (a.id === pt.id || a.run.pr.L !== pt.L || a.run.dir === pt.dir) continue;
        const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), ds = (s - pt.s) * pt.dir;
        if (ds > 0 && blockKey(pt.L, s, a.run.dir) === blockKey(pt.L, pt.s + pt.dir * Math.min(ds, 300), pt.dir) && (!best || ds < best.ds)) best = { ds };
      }
    }
    if (!best) return { red: false, dist: 9999 };
    const blockLen = 1200, distToSignal = best.ds - blockLen;
    return { red: distToSignal < 0, dist: Math.max(0, best.ds - 150), ahead: best.ds };
  }
  // ---------- remises (js/depot.js, js/depotsim.js) ----------
  // plannen per dag (en opnieuw bij een andere dienstregeling of ander weer: vertragingen veranderen de omloop)
  depotPlans() {
    const key = dayNr() + '|' + delayFactor + '|' + RUNS.length;
    if (this._dpKey !== key) { this._dpKey = key; this._dp = (NET.depots || []).map(D => depotPlan(D, RUNS, { runs, delayOf, effDelay, posAt, trackOffset })); }
    return this._dp;
  }
  updateDepots(now, p, dt, seen) {
    if (!NET.depots || !NET.depots.length) return;
    for (const plan of this.depotPlans()) {
      const D = plan.D, c = D.sidings[0].at(D.sidings[0].len - 100);
      if (Math.hypot(c.x - p.x, c.z - p.z) > 3000) continue;
      const st = depotState(plan, now);
      const dirP = D.placeDir || 1; // kopsporen: kop naar het station (−1 in de padrichting)
      const train = (id, sv, path, u) => {
        let tr = this.trains.get(id);
        if (!tr) { tr = this.makeTrain({ id, run: { sv, pr: { last: { name: D.name } } } }); tr.depot = D.name; this.trains.set(id, tr); }
        tr.L = path; tr.dir = dirP; tr.s = u; tr.v = 0; this.place(tr, path, u, dirP); this.dressTrain(tr, false, dt, 0); seen.add(id);
      };
      const lenOf = (sv) => sv.cars.reduce((a, c) => a + CAR_LEN[c] + GAP, 0) - GAP;
      st.sidings.forEach((set, k) => { if (!set) return; const sv = plan.compSv[set.comp] || SERVICES[0], P = D.sidings[k]; train(`dep:${set.id}`, sv, P, dirP > 0 ? P.len - 12 : P.len - 12 - lenOf(sv)); });
      for (const m of st.moving) train(`sh:${m.s.set.id}:${m.s.kind}:${Math.round(m.s.t0)}`, m.s.sv, m.s.path, m.u);
    }
  }
  // ---------- scherm ----------
  showHud(tr, a) {
    if (!this.hud || this.g.drive) return;
    const pr = a.run.pr, next = pr.stops.find(q => q.arr > a.t), late = 0;
    const sp = Math.round((tr.v || 0) * KMH);
    this.hud.hidden = false;
    const tEnd = a.t < pr.T ? ` · aankomst ${hhmm(railClock() + pr.T - a.t)}` : '';
    this.hud.innerHTML = `<div class="dh-speed">${sp}<small> km/h</small></div><div><b>${tr.name}</b><br><span class="small">${next ? `Volgende halte: ${next.st.name} · ${hhmm(railClock() + next.arr - a.t)}` : a.t < pr.T ? `Volgende halte: ${pr.last.name} (eindstation)${tEnd}` : `Eindstation ${pr.last.name}`}${late ? ' · +' + late + ' min' : ''}</span><br><span class="small muted">J: zitplaats / uitstappen aan de deur · cabine vooraan: H</span></div>`;
  }
  hideHud() { if (this.hud && !this.g.drive && !this.hudOwned) this.hud.hidden = true; }
  say(text) { this.g.toast('📢 ' + text); try { const u = new SpeechSynthesisUtterance(text); u.lang = 'nl-BE'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* geen spraak */ } }

  // ---------- kaart met lijnen, treinen en reisplanner ----------
  openMap() {
    const g = this.g, ov = document.getElementById('ov-rail'); if (!ov) return false;
    const c = document.getElementById('railmap');
    if (!this.mapImg) {
      // het terrein als kant-en-klare afbeelding (tools/bake-alpen-map.mjs)
      this.mapImg = new Image(); this.mapImg.onload = () => { this.mapReady = true; if (!ov.hidden) this.drawMap(); };
      this.mapImg.src = NET.mapImage;
    }
    if (!c.dataset.bound) {
      c.dataset.bound = '1';
      c.addEventListener('click', (e) => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MW, z = (e.clientY - r.top) / r.height * ML;
        // dichtste station
        let best = null, bd = 1500;
        for (const st of STATIONS_ALL) { const d = Math.hypot(st.x - x, st.z - z); if (d < bd) { bd = d; best = st; } }
        if (best) { this.sel = best.name; this.renderPanel(); this.drawMap(); }
        else { this.sel = null; this.tpTo = { x, z }; this.renderPanel(); }
      });
      document.getElementById('rail-close')?.addEventListener('click', () => { g.invOpen = false; g.resume(); });
      document.getElementById('rail-plain')?.addEventListener('click', () => { g.mapPlain = true; g.openMap(); g.mapPlain = false; });
    }
    this.sel = this.sel || this.nearestStation()?.name;
    this.renderPanel();
    g.invOpen = true; g.invWhich = 'rail';
    if (document.pointerLockElement) document.exitPointerLock();
    g.paused = true;
    g.showOverlay('rail');
    this.drawMap();
    clearInterval(this.mapTimer);
    this.mapTimer = setInterval(() => { if (ov.hidden) { clearInterval(this.mapTimer); return; } this.update(0, 1); this.drawMap(); }, 1000);
    return true;
  }
  nearestStation() { const p = this.g.player.pos; let best = null, bd = 1e18; for (const st of STATIONS_ALL) { const d = (st.x - p.x) ** 2 + (st.z - p.z) ** 2; if (d < bd) { bd = d; best = st; } } return best; }
  drawMap() {
    const c = document.getElementById('railmap'); if (!c) return;
    // langwerpige werelden (Greenisland): de kaart volgt de verhouding van de wereld
    const k = 1000 / Math.max(MW, ML), W = Math.round(MW * k), Hh = Math.round(ML * k); c.width = W; c.height = Hh;
    c.style.aspectRatio = `${W} / ${Hh}`;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, W, Hh);
    if (this.mapReady) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.mapImg, 0, 0, W, Hh); }
    ctx.fillStyle = 'rgba(10,14,22,.25)'; ctx.fillRect(0, 0, W, Hh);
    // lijnen (tunnels gestippeld)
    for (const L of LINES) {
      ctx.strokeStyle = L.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
      let open = null;
      for (let i = 0; i < L.n; i += 6) {
        const tun = L.kind[i] === 1;
        if (open !== tun) { if (open !== null) ctx.stroke(); ctx.beginPath(); ctx.setLineDash(tun ? [6, 5] : []); ctx.moveTo(L.x[i] * k, L.z[i] * k); open = tun; }
        else ctx.lineTo(L.x[i] * k, L.z[i] * k);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // kabelbanen en liften
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    for (const L of LIFTS) { ctx.beginPath(); ctx.moveTo(L.ax * k, L.az * k); ctx.lineTo(L.bx * k, L.bz * k); ctx.stroke(); }
    for (const [ax, az, bx, bz] of NET.mapCables || []) { ctx.beginPath(); ctx.moveTo(ax * k, az * k); ctx.lineTo(bx * k, bz * k); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    const label = (t, x, z, col = '#fff', dy = -9) => { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(t, x * k + 1, z * k + dy + 1); ctx.fillStyle = col; ctx.fillText(t, x * k, z * k + dy); };
    // toppen, meren, hotels
    for (const [n, x, z, col] of NET.mapLabels || []) label(n, x, z, col || '#ffe9a8', 0);
    for (const L of LIFTS) label('🚡 ' + L.top, L.bx, L.bz, '#dfe', 14);
    // stations
    for (const st of STATIONS_ALL) {
      ctx.fillStyle = st.name === this.sel ? '#ffd34d' : '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.x * k, st.z * k, st.name === this.sel ? 7 : 5, 0, 7); ctx.fill(); ctx.stroke();
      label(st.name, st.x, st.z, st.name === this.sel ? '#ffd34d' : '#fff', -10);
    }
    // remises
    for (const D of NET.depots || []) { const q = D.sidings[0].at(D.sidings[0].len - 120); ctx.fillStyle = '#9aa4b2'; ctx.fillRect(q.x * k - 5, q.z * k - 4, 10, 8); label('🏭 ' + D.name, q.x, q.z, '#cfd6e0', 16); }
    // treinen live
    for (const a of this.active || []) {
      if (a.t < 0) continue;
      const s = a.s ?? (a.run.pr.s0 + a.run.dir * a.x), p = a.run.pr.L.at(s);
      ctx.fillStyle = a.run.sv.freight ? '#999' : a.run.pr.L.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.fillRect(p.x * k - 4, p.z * k - 4, 8, 8); ctx.strokeRect(p.x * k - 4, p.z * k - 4, 8, 8);
    }
    if (this.player) { const p = this.player.L.at(this.player.s); ctx.fillStyle = '#ffd34d'; ctx.fillRect(p.x * k - 5, p.z * k - 5, 10, 10); }
    // speler
    const pp = this.g.player.pos; this.g.drawArrow?.(ctx, pp.x * k, pp.z * k, 10);
  }
  bindPanel(box) {
    for (const b of box.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderPanel(); });
    for (const b of box.querySelectorAll('[data-kind]')) b.addEventListener('click', () => { this.ovKind = b.dataset.kind; this.renderPanel(); });
    const save = box.querySelector('#ov-save'), reset = box.querySelector('#ov-reset');
    if (save) save.addEventListener('click', () => {
      const o = loadOverrides();
      for (const row of box.querySelectorAll('tr[data-sv]')) {
        const id = row.dataset.sv, base = NET.SERVICES.find(q => q.id === id); if (!base) continue;
        const h = Math.round(+row.querySelector('.ov-h').value * 60), a = +row.querySelector('.ov-a').value, b = +row.querySelector('.ov-b').value, on = row.querySelector('.ov-on').checked;
        const ch = {}; if (h !== base.h) ch.h = h;
        const bh = base.hours || [0, 24]; if (a !== bh[0] || b !== bh[1]) ch.hours = a === 0 && b === 24 ? undefined : [a, b];
        if (!on) ch.off = true;
        if (Object.keys(ch).length) o[id] = ch; else delete o[id];
      }
      rebuildTimetable(o); this.resetTrains(); this.g.toast('🗓 Nieuwe dienstregeling ingevoerd'); this.renderPanel();
    });
    if (reset) reset.addEventListener('click', () => { rebuildTimetable({}); this.resetTrains(); this.g.toast('🗓 Standaard dienstregeling hersteld'); this.renderPanel(); });
  }
  // ---------- reisplanner: van, naar, vertrekuur; trein, metro, tram, bus en te voet overstappen ----------
  routePanel(now, esc) {
    const names = STATIONS_ALL.map(s => s.name).sort((a, b) => a.localeCompare(b, 'nl'));
    const here = this.nearestStation();
    const from = this.rFrom || (here && here.name) || names[0], to = this.rTo || names[Math.min(1, names.length - 1)];
    const opt = (sel) => names.map(n => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const tm = this.rTime || hhmm(now);
    let h = `<div class="row" style="gap:6px;flex-wrap:wrap"><label class="small">Van <select id="rp-from">${opt(from)}</select></label><label class="small">Naar <select id="rp-to">${opt(to)}</select></label>
      <label class="small">Vertrek <input id="rp-time" type="time" value="${tm}" style="width:90px"></label><button class="btn primary" id="rp-go">Zoeken</button></div>`;
    h += `<div class="small muted">${PERIOD_NAMES[periodOf(now)]}: ${periodOf(now) === 'spits' ? 'alle ritten' : periodOf(now) === 'dal' ? 'drukke lijnen om de helft minder' : periodOf(now) === 'avond' ? 'minder ritten' : 'nachtdienst'}.</div>`;
    if (this.rResult !== undefined) {
      const r = this.rResult;
      if (!r) h += '<p class="small">Geen verbinding gevonden.</p>';
      else {
        const rides = r.legs.filter(l => !l.walk), walkM = r.legs.filter(l => l.walk).reduce((a, l) => a + l.m, 0), dep = r.legs[0].dep;
        h += `<h4 style="margin:8px 0 2px">${esc(this.rFromUsed)} → ${esc(this.rToUsed)}</h4><div class="small">Vertrek ${hhmm(dep)} · aankomst ${hhmm(r.t)} · reisduur ${Math.round((r.t - dep) / 60)} min · ${Math.max(0, rides.length - 1)} overstap(pen) · ${walkM} m wandelen</div>`;
        for (const lg of r.legs) h += legHtml(lg, esc);
        h += `<div class="row" style="margin-top:6px"><button class="btn" id="rp-nav">🧭 Navigeer naar ${esc(this.rFromUsed)}</button></div>`;
      }
    }
    return h;
  }
  bindRoute(box) {
    const go = box.querySelector('#rp-go'); if (!go) return;
    go.addEventListener('click', () => {
      this.rFrom = box.querySelector('#rp-from').value; this.rTo = box.querySelector('#rp-to').value; this.rTime = box.querySelector('#rp-time').value;
      const [hh, mm] = this.rTime.split(':').map(Number), now = railClock(), want = (hh * 3600 + mm * 60) - (new Date().getTimezoneOffset() * 0);
      let t = want - (((now % P) + P) % P) + now; if (t < now - 600) t += P; // vandaag of morgen
      this.rFromUsed = this.rFrom; this.rToUsed = this.rTo;
      this.rResult = this.rFrom === this.rTo ? null : plan(this.rFrom, this.rTo, t);
      this.renderPanel();
    });
    box.querySelector('#rp-nav')?.addEventListener('click', () => { const st = STATIONS_ALL.find(q => q.name === this.rFromUsed); if (st) this.navTo(st); });
  }
  // vertrekbord in een station (E op een bord): de volgende vertrekken met lijn, bestemming, spoor en vertraging
  signText(t) {
    // bord in een tunnel: richting en afstand tot de nooduitgang (ladderschacht om de 600 m, alleen waar hij echt ligt)
    for (const L of LINES) {
      if (L.tram || L.bus) continue;
      const r = L.near(Math.floor(t.x), Math.floor(t.z), 9); if (!r || r.kind !== 1 || Math.abs(r.y - t.y) > 8) continue;
      const w = this.g.world, found = [];
      for (let k = -3; k <= 3; k++) {
        const s = Math.floor(r.s / 600) * 600 + 300 + k * 600; if (s < 0 || s > L.len) continue;
        const q = L.at(s), side = Math.sign(r.sd) || 1, bed = L.single ? 3.0 : 5.4;
        for (const o of [bed + 0.5, bed + 0.7, bed + 0.3]) { const x = Math.floor(q.x - q.tz * o * side), z = Math.floor(q.z + q.tx * o * side), y = Math.round(q.y) + 3; if (w.get(x, y, z) === B.LADDER || w.get(x, y + 1, z) === B.LADDER) { found.push({ s, d: s - r.s }); break; } }
      }
      found.sort((a, b2) => Math.abs(a.d) - Math.abs(b2.d));
      const ex = found[0], dir = (d) => { const q = L.at(r.s), q2 = L.at(r.s + Math.sign(d) * 5); const a = Math.atan2(q2.x - q.x, q2.z - q.z) * 180 / Math.PI; return ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'][((Math.round(((a % 360) + 360) % 360 / 45) % 8) + 8) % 8]; };
      return ex ? `🚪 Nooduitgang (ladder naar boven): ${Math.round(Math.abs(ex.d))} m richting ${dir(ex.d)}${found[1] ? `\nVolgende: ${Math.round(Math.abs(found[1].d))} m richting ${dir(found[1].d)}` : ''}\nLoop over het dienstpad langs de wand · ${L.name || L.id}, km ${(r.s / 1000).toFixed(1)}`
        : `🚪 Nooduitgang: volg de groene markeringen naar de tunnelmond\n${L.name || L.id}, km ${(r.s / 1000).toFixed(1)}`;
    }
    let best = null, bd = 160;
    for (const st of STATIONS_ALL) { const d = Math.hypot(st.x - t.x, st.z - t.z); if (d < bd) { bd = d; best = st; } }
    if (!best) return null;
    const now = railClock(), list = departures(best.name, now, 6);
    const rows = list.map(d => `${hhmm(d.at)}${d.delay > 59 ? ' +' + Math.round(d.delay / 60) : ''} ${d.run.sv.name.split(' ')[0]} → ${d.dest}${d.run.sv.platform?.[best.name] ? ' (spoor ' + d.run.sv.platform[best.name] + ')' : ''}`);
    return `🚉 ${best.name} · vertrekken (${PERIOD_NAMES[periodOf(now)].toLowerCase()})\n${rows.join('\n') || 'Geen vertrekken meer vandaag'}\nM = OV-kaart, routekaart en reisplanner`;
  }
  // navigatie: pijl en afstand naar een station in de HUD
  navTo(st) {
    this.nav = { name: st.name, x: st.x, z: st.z };
    this.g.toast(`🧭 Navigatie naar ${st.name}`); this.g.resume?.();
  }
  updateNav() {
    const el = document.getElementById('nav-hud');
    if (!this.nav) { if (el) el.hidden = true; return; }
    const p = this.g.player.pos, dx = this.nav.x - p.x, dz = this.nav.z - p.z, d = Math.hypot(dx, dz);
    if (d < 25) { this.g.toast(`🚉 Je bent bij ${this.nav.name}`); this.nav = null; if (el) el.hidden = true; return; }
    const ang = Math.atan2(dx, -dz) - (-this.g.player.yaw), arrows = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'];
    const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    if (el) { el.hidden = false; el.textContent = `🧭 ${this.nav.name}: ${arrows[k]} ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`; }
  }
  resetTrains() { for (const tr of this.trains.values()) { if (this.g.aboard && this.g.aboard.train === tr) continue; this.dropTrain(tr); } for (const [id, tr] of [...this.trains]) if (!(this.g.aboard && this.g.aboard.train === tr)) this.trains.delete(id); }
  ovPanel(tab, now, esc) {
    const CAR_NAMES = { ddCab: 'dubbeldeks-stuurrijtuig', ddMid: 'dubbeldeksrijtuig', sbCab: 'S-Bahn-stuurrijtuig', sbMid: 'S-Bahn-tussenrijtuig', mCab: 'metro-kopwagen', mMid: 'metro-tussenwagen', axCab: 'Airport Express-kop', axMid: 'Airport Express-rijtuig', regCab: 'regionale motorwagen', regMid: 'regionaal tussenrijtuig', locoD: 'diesellocomotief', iceHead: 'ICE-kopwagen', ice: 'ICE-rijtuig', dining: 'restauratierijtuig', emuCab: 'stuurrijtuig', emuMid: 'tussenrijtuig', loco: 'locomotief', coach1: 'rijtuig 1e klas', coach2: 'rijtuig 2e klas', sleeper: 'slaaprijtuig', panorama: 'panoramarijtuig', rack: 'tandradmotorwagen', rackLoco: 'tandradlocomotief', tram: 'tramdeel', bus: 'bus', box: 'gesloten wagen', tank: 'ketelwagen', flat: 'platte wagen' };
    const kindOf = (sv) => sv.bus ? 'bus' : sv.tram ? 'tram' : sv.metro ? 'metro' : 'trein';
    const kinds = [...new Set(NET.SERVICES.map(kindOf))], kind = kinds.includes(this.ovKind) ? this.ovKind : kinds[0];
    const filt = kinds.length > 1 ? `<div class="row" style="gap:4px;margin:0 0 6px">${kinds.map(k => `<button class="btn${k === kind ? ' primary' : ''}" data-kind="${k}">${{ trein: '🚆 Trein', metro: 'Ⓜ Metro', tram: '🚋 Tram', bus: '🚌 Bus' }[k]}</button>`).join('')}</div>` : '';
    const mm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    if (tab === 'plan') {
      const o = loadOverrides();
      const opts = (v, list, f) => list.map(x => `<option value="${x}"${Math.abs(x - v) < 1e-6 ? ' selected' : ''}>${f(x)}</option>`).join('');
      let h = filt + '<div class="small muted">Pas per dienst de frequentie, de uren en aan/uit aan. Canon-diensten zijn gemarkeerd; een wijziging is dan een afwijking van de canon (wordt alleen op dit toestel bewaard).</div><div style="max-height:52vh;overflow:auto"><table class="small" style="width:100%"><tr><th align="left">Dienst</th><th>Elke</th><th>Van</th><th>Tot</th><th>Aan</th></tr>';
      for (const base of NET.SERVICES.filter(sv => kindOf(sv) === kind)) {
        const cur = { ...base, ...(o[base.id] || {}) }, hr = cur.hours || [0, 24], mins = cur.h / 60;
        const freqs = [...new Set([5, 7.5, 10, 12, 15, 20, 30, 60, 120, 240, 1440, mins])].sort((a, b) => a - b);
        const hours = [...new Set([...Array.from({ length: 49 }, (_, i) => i / 2), hr[0], hr[1]])].sort((a, b) => a - b);
        h += `<tr data-sv="${esc(base.id)}"><td><span style="color:${LINE[base.line].color}">■</span> ${esc(base.name)}${base.canon ? ' <span class="muted">(canon)</span>' : ''}${o[base.id] ? ' <b style="color:#fbbf24">aangepast</b>' : ''}</td>`
          + `<td><select class="ov-h">${opts(mins, freqs, x => x >= 1440 ? '1× per dag' : x >= 60 ? `${x / 60} u` : `${x} min`)}</select></td>`
          + `<td><select class="ov-a">${opts(hr[0], hours.filter(x => x < 24), mm)}</select></td><td><select class="ov-b">${opts(hr[1], hours.filter(x => x > 0), mm)}</select></td>`
          + `<td><input type="checkbox" class="ov-on"${cur.off ? '' : ' checked'}></td></tr>`;
      }
      return h + '</table></div><div class="row" style="margin-top:6px"><button class="btn primary" id="ov-save">✔ Opslaan en invoeren</button><button class="btn" id="ov-reset">↺ Standaard herstellen</button></div><p class="help">Nieuwe ritten worden zonder botsingen ingepland; is een lijn te druk, dan rijdt een dienst minder vaak dan gevraagd.</p>';
    }
    if (tab === 'delay') {
      const act = (this.active || activeTrains(now)).filter(a => a.delay > 0 && kindOf(a.run.sv) === kind);
      let h = filt + `<div class="small">${delayCause ? `⚠ Weer: ${esc(delayCause)} – meer vertragingen dan normaal.` : 'Normale dienst.'} Nu ${act.length} ritten met vertraging.</div><div style="max-height:52vh;overflow:auto"><table class="small" style="width:100%"><tr><th align="left">Rit</th><th align="left">Richting</th><th>Vertraging</th><th align="left">Oorzaak</th></tr>`;
      for (const a of act.sort((p, q) => q.delay - p.delay).slice(0, 60)) h += `<tr><td><span style="color:${a.run.pr.L.color}">■</span> ${esc(a.run.sv.name)}</td><td>${esc(a.run.pr.last.name)}</td><td align="center"><b style="color:#f87171">+${Math.round(a.delay / 60)} min</b></td><td>${esc(delayReason(a.run, a.k))}</td></tr>`;
      return h + '</table></div>';
    }
    // depot: benodigde treinstellen per dienst (omlooptijd / interval), nu onderweg en in de remise
    const act = this.active || activeTrains(now), running = new Map();
    for (const a of act) if (a.t >= 0 && a.t <= a.run.pr.T) running.set(a.run.sv.id, (running.get(a.run.sv.id) || 0) + 1);
    let h = filt + '<div style="max-height:52vh;overflow:auto"><table class="small" style="width:100%"><tr><th align="left">Dienst</th><th align="left">Remise</th><th>Stellen</th><th>Onderweg</th><th>In de remise</th><th align="left">Materieel</th></tr>';
    let tot = 0, totRun = 0;
    for (const sv of SERVICES.filter(q => kindOf(q) === kind)) {
      const rs = RUNS.filter(r => r.sv === sv); if (!rs.length) continue;
      const cycle = rs.reduce((a, r) => a + r.pr.T + 300, 0), need = Math.max(1, Math.ceil(cycle / Math.min(...rs.map(r => r.h))));
      const on = running.get(sv.id) || 0, depot = rs[0].pr.L.stations[0].name;
      tot += need; totRun += Math.min(on, need);
      const cars = Object.entries(sv.cars.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})).map(([c, n]) => `${n}× ${CAR_NAMES[c] || c}`).join(', ');
      h += `<tr><td><span style="color:${rs[0].pr.L.color}">■</span> ${esc(sv.name)}</td><td>${esc(depot)}</td><td align="center">${need}</td><td align="center">${on}</td><td align="center">${Math.max(0, need - on)}</td><td>${esc(cars)}</td></tr>`;
    }
    h += `</table></div><div class="small" style="margin-top:6px">Totaal (${kind}): <b>${tot}</b> stellen nodig, <b>${totRun}</b> nu onderweg, <b>${Math.max(0, tot - totRun)}</b> in de remises (incl. reserve bij nacht en daluren).</div>`;
    // echte remises met opstelsporen: wat er nu staat en de volgende rangeerritten
    if (NET.depots && NET.depots.length && kind === 'trein') {
      h += '<h4 style="margin:8px 0 2px">🏭 Remises met opstelsporen</h4><table class="small" style="width:100%"><tr><th align="left">Remise</th><th>Opgesteld</th><th align="left">Volgende rangeerrit</th></tr>';
      for (const plan of this.depotPlans()) {
        const st = depotState(plan, now), nx = plan.shunts.map(q => ({ q, t: ((q.t0 - now) % P + P) % P })).sort((a, b) => a.t - b.t)[0];
        h += `<tr><td>${esc(plan.D.name)} <span class="muted">(${esc(plan.D.L.id)}, ${esc(plan.D.st.name)})</span></td><td align="center">${st.total}</td><td>${nx ? `${hhmm(now + nx.t)} ${nx.q.kind === 'uit' ? 'uitrukken' : 'inrukken'} ${esc(nx.q.sv.id)}${nx.q.shift ? ` (rijweg: ${Math.round(nx.q.shift / 60)} min ${nx.q.kind === 'uit' ? 'eerder' : 'later'})` : ''}` : '—'}</td></tr>`;
      }
      h += '</table>';
    }
    return h;
  }
  renderPanel() {
    const box = document.getElementById('rail-panel'); if (!box) return;
    const now = railClock(), here = this.nearestStation();
    const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
    const tab = this.tab || 'station';
    let html = `<div class="row ov-tabs" style="gap:4px;margin:0 0 6px">${[['station', '🚉 Station'], ['route', '🧭 Reisplanner'], ['plan', '🗓 Dienstregeling'], ['delay', '⏱ Vertragingen'], ['depot', '🏭 Depot']].map(([k, t]) => `<button class="btn${k === tab ? ' primary' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>`;
    box.parentElement?.classList.toggle('ov-wide', tab !== 'station'); // OV-beheer: tabellen over de volle breedte
    const ttl = document.getElementById('rail-title'); if (ttl) ttl.textContent = NET.title || (NET.id === 'alpen' ? '🚆 Spoorkaart Alpen' : '🚆 Spoorkaart');
    if (tab === 'route') { box.innerHTML = html + this.routePanel(now, esc); this.bindRoute(box); this.bindPanel(box); return; }
    if (tab !== 'station') { box.innerHTML = html + this.ovPanel(tab, now, esc); this.bindPanel(box); return; }
    if (this.sel) {
      const st = STATIONS_ALL.find(q => q.name === this.sel);
      html += `<h3 style="margin:4px 0">🚉 ${esc(st.name)}</h3><div class="small muted">${st.lines.map(id => `<span style="color:${LINE[id].color}">■</span> ${esc(LINE[id].name)}`).join(' · ')}</div>`;
      html += '<table class="small" style="width:100%;margin-top:6px"><tr><th align="left">Vertrek</th><th align="left">Trein</th><th align="left">Naar</th><th align="left">Spoor</th></tr>';
      for (const d of departures(st.name, now, 8)) html += `<tr><td>${hhmm(d.at)}${d.delay ? ` <b style="color:#f87171">+${Math.round(d.delay / 60)}</b>` : ''}</td><td><span style="color:${d.run.pr.L.color}">■</span> ${esc(d.run.sv.name)} <span class="muted">rit ${ritNr(d)}</span></td><td>${esc(d.dest)}</td><td>${d.run.sv.platform?.[st.name] ?? ''}</td></tr>`;
      html += '</table>';
      if (here && here.name !== st.name) {
        const r = plan(here.name, st.name, now);
        html += `<h4 style="margin:8px 0 2px">Reisplanner: ${esc(here.name)} → ${esc(st.name)}</h4>`;
        if (r) for (const lg of r.legs) html += legHtml(lg, esc);
        else html += '<div class="small">Geen verbinding gevonden.</div>';
      }
      html += `<div class="row" style="margin-top:8px"><button class="btn" id="rail-tp">🧭 Naar dit station</button></div>`;
    } else if (this.tpTo) html += `<div class="row"><button class="btn" id="rail-tp">✈ Hierheen vliegen</button></div>`;
    html += '<p class="help">Tik op een station voor vertrektijden en een reisplanner vanaf het dichtste station. Gekleurde blokjes zijn treinen die nu rijden. Gestippeld = tunnel.</p>';
    box.innerHTML = html; this.bindPanel(box);
    document.getElementById('rail-tp')?.addEventListener('click', () => {
      const g = this.g, p = g.player;
      g.aboard = null; if (g.drive) g.leaveVehicle?.();
      if (this.sel) { const st = STATIONS_ALL.find(q => q.name === this.sel), L = LINE[st.lines[0]], s = st.stops[0].s, q = L.at(s), side = (L.single ? 1.5 : TRACK) + 4; p.pos.set(q.x - q.tz * side, st.y + 2.2, q.z + q.tx * side); p.fly = false; }
      else { p.pos.set(this.tpTo.x, (g.meta.ground ?? 12) + 120, this.tpTo.z); p.fly = true; }
      p.vel.set(0, 0, 0);
      if (g.tiled) { g.tiled.aheadKey = null; g.updateTiles(true); }
      g.invOpen = false; g.resume();
    });
  }
}

// één reisstap (rit of wandeling)
const MODE_ICON = (sv) => sv.bus ? '🚌' : /^M\d/.test(sv.line || sv.id) ? '🚇' : /^T\d|tram/i.test(sv.id + (sv.name || '')) ? '🚊' : '🚆';
function legHtml(lg, esc) {
  if (lg.walk) return `<div class="small">${hhmm(lg.dep)} 🚶 Wandelen ${esc(lg.from)} → ${esc(lg.to)} · ${lg.m} m · ${Math.max(1, Math.round((lg.arr - lg.dep) / 60))} min</div>`;
  const pl = lg.run.sv.platform?.[lg.from];
  return `<div class="small">${hhmm(lg.dep)} ${MODE_ICON(lg.run.sv)} <span style="color:${lg.run.pr.L.color}">■</span> <b>${esc(lg.run.sv.name)}</b>${lg.delay >= 60 ? ` <span style="color:#fbbf24">+${Math.round(lg.delay / 60)} min</span>` : ''} ${esc(lg.from)}${pl ? ` (spoor ${pl})` : ''} → ${esc(lg.to)} · aankomst ${hhmm(lg.arr)} · ${Math.round((lg.arr - lg.dep) / 60)} min</div>`;
}

// ---------- de cabine (zelf rijden) ----------
class TrainCab {
  constructor(rail) {
    this.r = rail; this.g = rail.g; this.t = 0; this.show(true);
    // klikbare bediening: hendels slepen (boven = vol), knoppen voor noodrem, zand en deuren
    const hud = rail.hud;
    if (hud && !hud.dataset.cabBound) {
      hud.dataset.cabBound = '1';
      const lever = (e) => {
        const el = e.target.closest && e.target.closest('.lever'); const pt = rail.player; if (!el || !pt || !(e.buttons || e.type === 'pointerdown')) return;
        const r = el.getBoundingClientRect(), f = Math.max(0, Math.min(1, (r.bottom - e.clientY) / r.height));
        if (el.dataset.k === 't') { pt.throttle = f; if (f > 0.05) pt.brake = 0; } else { pt.brake = f; if (f > 0.05) pt.throttle = 0; }
        e.preventDefault();
      };
      hud.addEventListener('pointerdown', (e) => {
        const b = e.target.closest && e.target.closest('.cab-btn');
        if (b && rail.player && this.g.drive) { const k = b.dataset.k; if (k === 'nood') rail.player.emergency = true; else this.g.drive.key(k === 'zand' ? 'KeyZ' : 'KeyQ'); e.preventDefault(); return; }
        lever(e);
      });
      hud.addEventListener('pointermove', lever);
    }
  }
  show(on) {
    const hud = this.r.hud, pad = document.getElementById('drive-pad');
    if (hud) hud.hidden = !on;
    if (pad) { pad.hidden = !on || !this.g.touch; pad.dataset.mode = 'rail'; }
    this.g.ui.root?.classList.toggle('driving', on);
  }
  camMode() { return 'first'; }
  // camera's (V): cabine → achtervolging → buiten langs het spoor → bij de passagiers → cabine
  cycleCam() {
    const order = ['cab', 'chase', 'side', 'passenger'], i = order.indexOf(this.cam || 'cab');
    this.cam = order[(i + 1) % order.length];
    this.g.toast({ cab: '🎥 Cabine', chase: '🎥 Achter de trein', side: '🎥 Buiten langs het spoor', passenger: '🎥 Bij de passagiers' }[this.cam]);
  }
  placeCamera(cam) {
    const pt = this.r.player, p = this.g.player, mode = this.cam || 'cab';
    const cars = pt.tr.cars, c = mode === 'passenger' ? (cars[Math.min(1, cars.length - 1)] || pt.car) : pt.car;
    const local = mode === 'chase' ? new THREE.Vector3(2, 9, -30) : mode === 'side' ? new THREE.Vector3(-14, 3.5, c.d.L * 0.9) : mode === 'passenger' ? new THREE.Vector3(1.5, 3.6, c.d.L * 0.5) : new THREE.Vector3(c.d.cab ? c.d.cab[0] : 2, 3.75, (c.d.cab ? c.d.cab[2] : c.d.L - 2) + 0.4);
    const w = c.body.toWorld(local, new THREE.Vector3());
    const look = mode === 'side' ? -Math.PI / 2 + 0.5 : mode === 'passenger' ? -Math.PI / 2 : 0;
    cam.position.copy(w); cam.rotation.set(p.pitch - (mode === 'chase' ? 0.18 : 0), c.body.yaw + Math.PI + p.yaw + look, 0);
    // de buitenkant van de eigen trein tonen bij camera's buiten de cabine
    for (const cc of cars) { const outside = mode === 'chase' || mode === 'side'; cc.grp.visible = !outside; if (cc.shell) cc.shell.g.visible = outside; }
    // voor het laden van de tegels: de speler staat in de cabine
    p.pos.set(w.x, w.y - 1.62, w.z);
    return true;
  }
  update(dt) {
    const r = this.r, pt = r.player; if (!pt) return;
    // touchknoppen ◀ ▶: wissel omzetten
    const gl = !!this.g.padLeft, gr = !!this.g.padRight;
    if (gl && !this.plWas) this.key('KeyA'); if (gr && !this.prWas) this.key('KeyD');
    this.plWas = gl; this.prWas = gr;
    r.drivePhys(dt);
    this.g.extVel = (() => { const c = pt.car.body; return new THREE.Vector3(Math.sin(c.yaw) * pt.v, 0, Math.cos(c.yaw) * pt.v); })();
    if (this.g.tiled) this.g.updateTiles();
    this.t += dt;
    if (this.t > 0.2 && r.hud) {
      this.t = 0;
      const sp = Math.round(pt.v * KMH), lim = Math.round(pt.lim * KMH), sg = pt.sig;
      const ns = pt.nextStop, dist = ns ? Math.abs(ns.s - pt.s) : 0;
      // stopplaats: hoe ver van het einde van het perron (stopbord) sta je?
      let stopInfo = '';
      if (ns && dist < 400) { const stopAt = ns.s + pt.dir * (ns.len / 2 - 8); const d2 = (stopAt - pt.s) * pt.dir; stopInfo = `<div class="small">Stopbord over <b>${Math.max(0, Math.round(d2))} m</b>${pt.v < 0.3 && Math.abs(d2) < ns.len / 2 ? (Math.abs(d2) < 6 ? ' · ✅ goed gestopt' : d2 > 0 ? ' · iets verder rijden' : ' · voorbij het stopbord') : ''}</div>`; }
      r.hud.innerHTML = `<div class="cab-desk">
        <svg viewBox="0 0 120 70" width="120" height="70"><path d="M10 64 A50 50 0 0 1 110 64" stroke="#3a4250" stroke-width="8" fill="none"/>
          <path d="M10 64 A50 50 0 0 1 110 64" stroke="${pt.v > pt.lim * 1.05 ? '#ff5a4a' : '#4ade80'}" stroke-width="8" fill="none" stroke-dasharray="${Math.min(1, pt.v / Math.max(1, (pt.lim || 30) * 1.3)) * 157} 157"/>
          <line x1="60" y1="64" x2="${60 + 46 * Math.cos(Math.PI * (1 - Math.min(1, pt.v / Math.max(1, (pt.lim || 30) * 1.3))))}" y2="${64 - 46 * Math.sin(Math.PI * (1 - Math.min(1, pt.v / Math.max(1, (pt.lim || 30) * 1.3))))}" stroke="#fff" stroke-width="3"/>
          <text x="60" y="52" fill="#fff" font-size="18" text-anchor="middle" font-weight="700">${sp}</text><text x="60" y="66" fill="#aab" font-size="8" text-anchor="middle">km/h · max ${lim}</text></svg>
        <div class="lever" data-k="t" title="Tractiehendel (W / ▲, of klik en sleep)"><div class="lv-fill" style="height:${Math.round(pt.throttle * 100)}%;background:${pt.slip ? '#ff8a2a' : '#4ade80'}"></div><span>T</span></div>
        <div class="lever" data-k="r" title="Remhendel (S / ▼, of klik en sleep)"><div class="lv-fill" style="height:${Math.round(pt.brake * 100)}%;background:${pt.emergency ? '#ff3a2a' : '#fbbf24'}"></div><span>R</span></div>
        <button class="cab-btn" data-k="nood" title="Noodrem">⛔</button><button class="cab-btn" data-k="zand" title="Zand strooien (Z)">⏳</button><button class="cab-btn" data-k="deur" title="Deuren (Q)">🚪</button>
        <div class="sig-lamp" style="background:${sg && sg.red ? '#ff3a2a' : '#22e06a'}" title="Volgend sein"></div>
        <div class="lim-sign">${lim}</div></div>
        <div class="dh-speed" style="display:none">${sp}</div>
        <div class="small"><b>${pt.tr.sv.name}</b> · max <b>${lim}</b> km/h<br>
        Tractie ${'▮'.repeat(Math.round(pt.throttle * 5)).padEnd(5, '▯')} · Rem ${'▮'.repeat(Math.round(pt.brake * 5)).padEnd(5, '▯')}${pt.emergency ? ' · <b style="color:#ff6a5a">NOODREM</b>' : ''}<br>
        ${pt.phys ? `${pt.phys.M} t · ${pt.phys.len} m · kleefkracht ${pt.mu.toFixed(2)}${pt.sandT > 0 ? ' (zand)' : ''} · remweg <b>${Math.round(pt.v * pt.v / (2 * Math.max(0.3, pt.bMax || 1)))} m</b>${pt.slip ? ' · <b style="color:#ff8a2a">WIELSLIP: minder tractie of Z = zand</b>' : ''}<br>` : ''}
        Sein: <b style="color:${sg && sg.red ? '#ff4a3a' : '#4aff6a'}">${sg && sg.red ? 'ROOD' : 'GROEN'}</b>${sg && sg.ahead < 3000 ? ` (trein voor je op ${Math.round(sg.ahead)} m)` : ''}<br>
        ${ns ? `Volgende halte: <b>${ns.name}</b> over ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}` : 'Einde van de lijn'}${pt.atStation ? ` · 🚉 ${pt.atStation.name}: Q = deuren` : ''}${pt.doors ? ' · 🚪 deuren open' : ''}<br>
        ${pt.L.connector ? `🔀 Op het verbindingsspoor naar <b>${pt.L.name}</b> · max 40 km/h<br>` : pt.juncs && pt.juncs.length ? `🔀 Wissel over ${Math.round(pt.juncs[0].ds)} m: <b>${pt.junction ? 'naar ' + pt.juncs[0].name : 'rechtdoor'}</b> · A/D omzetten<br>` : ''}
        <span class="muted">W/S hendels (of slepen) · spatie noodrem · Z zand · A/D wissel · Q deuren · N omroep · R rijrichting · V camera (${{ cab: 'cabine', chase: 'achter', side: 'buiten', passenger: 'passagiers' }[this.cam || 'cab']}) · H verlaten</span></div>${stopInfo}`;
    }
  }
  key(code) {
    const r = this.r, pt = r.player;
    if (code === 'KeyH') { this.exit(); return true; }
    if (code === 'KeyV') { this.cycleCam(); return true; }
    if (code === 'KeyQ') {
      if (pt.v > 0.3) { this.g.toast('Deuren openen kan alleen stilstaand'); return true; }
      pt.doors = !pt.doors; this.g.toast(pt.doors ? '🚪 Deuren open' : '🚪 Deuren dicht');
      if (pt.doors && pt.atStation) r.say(`${pt.atStation.name}. U kan hier uitstappen.`);
      return true;
    }
    if (code === 'KeyN') { const ns = pt.nextStop; r.say(ns ? `Volgende halte: ${ns.name}.` : 'Dit is het eindstation. Iedereen uitstappen, alstublieft.'); return true; }
    if (code === 'KeyZ') { pt.sandT = 8; this.g.toast('⏳ Zand gestrooid: 8 s betere kleefkracht'); return true; }
    if (code === 'KeyA' || code === 'KeyD') {
      const n = (pt.juncs || []).length;
      if (!n) { this.g.toast('Geen overloopwissel naar een andere lijn in de komende 3 km'); return true; }
      const j = pt.juncs[0];
      pt.jSel = pt.jSel ? null : j;
      this.g.toast(pt.jSel ? `🔀 Wissel over ${Math.round(j.ds)} m gezet: naar ${j.name}` : '⬆ Wissel rechtdoor (deze lijn blijven volgen)');
      return true;
    }
    if (code === 'KeyR') {
      if (pt.v > 0.3) { this.g.toast('Eerst stoppen om van rijrichting te wisselen'); return true; }
      if (pt.trail || pt.L.connector) { this.g.toast('Eerst helemaal voorbij de wissel rijden'); return true; }
      pt.dir = -pt.dir; pt.tr.cars.reverse(); for (const c of pt.tr.cars) c.flip = !c.flip;
      const cab = pt.tr.cars.find(c => c.d.cab && !c.flip) || pt.tr.cars[0]; pt.car = cab;
      // de kop zit nu aan de andere kant
      const len = pt.tr.cars.reduce((a, c) => a + c.d.L + GAP, 0) - GAP; pt.s += pt.dir * len;
      this.g.toast('↩ Rijrichting omgekeerd (andere cabine)'); return true;
    }
    return false;
  }
  exit() { this.show(false); this.g.drive = null; this.r.stopDriving(); }
}
