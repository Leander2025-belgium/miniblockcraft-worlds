// Reizigers met een doel (TERRANOVA 14, verkeerswerelden): een reiziger legt een hele reis af in de echte wereld.
// Een reis is een rij stappen: lopen naar een plek of halte, wachten op het juiste voertuig (soort en lijn), instappen
// zodra de deuren open zijn, meerijden (telt mee in de bezetting van de rit, js/ovtrips.js), uitstappen aan de
// juiste halte en verder lopen (overstap) tot de bestemming.
//
// Lopen gaat over een navigatieraster dat uit de echte blokken komt (A*): een plek is beloopbaar als er vaste grond
// onder ligt en er 2 blokken lucht boven zijn; trappen = 1 blok op of af; schuin alleen als beide hoeken vrij zijn.
// Zo loopt een reiziger door stationsingangen, over trappen naar het perron en nooit door een muur.
// Zichtbaar dichtbij (instanced, zoals de wachtenden aan bushaltes); de reis zelf loopt altijd door.
import * as THREE from 'three';
import { doorNear, facadeNear, benchNear, ticketNear, stopFor, stepsFromPlan } from './journeys.js';

const WALK = 1.35, MAXN = 120000, AUTO_N = 20000; // A*-budget voor vanzelf verschenen reizigers (houdt de framekost laag)
const AUTO_WANT = { spits: 14, dal: 9, avond: 6, nacht: 2 }, AUTO_EVERY = 2.5, AUTO_NEAR = 120, AUTO_FAR = 520, AUTO_WAIT = 1500;
const AUTO_TYPES = ['pendelaar', 'pendelaar', 'student', 'toerist', 'luchthaven', 'beperkt', 'nacht', 'zakenreiziger', 'gezin'];
// hele reizen met de planner (TERRANOVA 15, js/journeys.js): hoeveel tegelijk (zichtbaar + op afstand) en hoe vaak er één bij komt
const TOWER_WANT = { lobby: 14, mall: 18, sky: 9, top: 12, hotel: 5, office: 6, apt: 2, lux: 2, pent: 2, concourse: 10 }; // bezoekers per verdieping
const JOURNEY_MAX = 60, JOURNEY_EVERY = 5, MATERIALIZE = 300;
const LIFT = 77; // B.ELEVATOR: liftblok onderaan en bovenaan een koker (zoals de speler: js/game.js)
export class NavGrid {
  // getAt (optioneel): bloksoort, voor liften — een reiziger op een liftblok kan naar het volgende liftblok in dezelfde koker
  constructor(solidAt, getAt = null) { this.solid = solidAt; this.get = getAt; }
  liftTargets(x, y, z) {
    if (!this.get || this.get(x, y - 1, z) !== LIFT) return null;
    const out = [];
    for (const dir of [1, -1]) for (let yy = y - 1 + dir * 2; Math.abs(yy - y) < 320; yy += dir) {
      if (this.get(x, yy, z) === LIFT && !this.solid(x, yy + 1, z) && !this.solid(x, yy + 2, z)) { out.push(yy + 1); break; }
    }
    return out;
  }
  walkable(x, y, z) { return this.solid(x, y - 1, z) && !this.solid(x, y, z) && !this.solid(x, y + 1, z); }
  // dichtstbijzijnde beloopbare plek rond (x, y, z): eerst dezelfde kolom (op en neer), dan in een kring
  snap(x, y, z, r = 3) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    for (let d = 0; d <= r; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
      for (const dy of [0, -1, 1, -2, 2, -3, 3]) if (this.walkable(x + dx, y + dy, z + dz)) return { x: x + dx, y: y + dy, z: z + dz };
    }
    return null;
  }
  // A* van a naar b (blokcoördinaten); geeft de punten (midden van de blokken) of null
  path(a, b, maxN = MAXN, opt) { const it = this.pathIter(a, b, maxN, 1e9, opt); let r; do r = it.next(); while (!r.done); return r.value; }
  // zelfde A*, maar in stukjes: na elke `slice` knopen geeft hij de beurt terug (yield), zodat het zoeken over frames verdeeld wordt
  // opt: { stairs: gewicht van een trede (1 = normaal), noStairs: nooit op of af }
  *pathIter(a, b, maxN = MAXN, slice = 1500, opt = {}) {
    const stairW = opt.stairs ?? 1, noStairs = !!opt.noStairs;
    const A = this.snap(a.x, a.y, a.z), Bt = this.snap(b.x, b.y, b.z);
    if (!A || !Bt) return null;
    const key = (x, y, z) => ((x + 32768) * 65536 + (z + 32768)) * 4096 + (y + 1024);
    const open = [], g = new Map(), from = new Map(), h = (x, y, z) => Math.hypot(x - Bt.x, z - Bt.z) + Math.abs(y - Bt.y) * 1.5;
    const push = (n) => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= n.f) break; open[i] = open[p]; i = p; } open[i] = n; };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l].f < (m === i ? last.f : open[m].f)) m = l; if (r < open.length && open[r].f < (m === i ? last.f : open[m].f)) m = r; if (m === i) break; open[i] = open[m]; i = m; } open[i] = last; } return top; };
    const k0 = key(A.x, A.y, A.z); g.set(k0, 0); push({ x: A.x, y: A.y, z: A.z, k: k0, f: h(A.x, A.y, A.z) });
    let n = 0, end = null, ts = performance.now(); const budget = opt.budget || 0; // budget: ms per beurt (0 = alleen per `slice` knopen)
    while (open.length && n++ < maxN) {
      if (n % slice === 0 || (budget && (n & 63) === 0 && performance.now() - ts > budget)) { yield null; ts = performance.now(); }
      const c = pop(), gc = g.get(c.k);
      if (c.x === Bt.x && c.z === Bt.z && Math.abs(c.y - Bt.y) <= 1) { end = c; break; }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        for (const dy of noStairs ? [0] : [0, 1, -1]) {
          const x = c.x + dx, y = c.y + dy, z = c.z + dz;
          if (!this.walkable(x, y, z)) continue;
          if (dy > 0 && this.solid(c.x, c.y + 2, c.z)) continue; // trap op: hoofdruimte boven het vertrekpunt
          if (dy < 0 && this.solid(x, c.y + 1, z)) continue;     // trap af: hoofdruimte boven het doel
          if (dx && dz && (!this.walkable(c.x + dx, c.y, c.z) && !this.walkable(c.x + dx, y, c.z) || !this.walkable(c.x, c.y, c.z + dz) && !this.walkable(c.x, y, c.z + dz))) continue; // geen hoek afsnijden
          const k = key(x, y, z), cost = gc + (dx && dz ? 1.414 : 1) + (dy ? 0.6 * stairW : 0);
          if (cost >= (g.get(k) ?? 1e18)) continue;
          g.set(k, cost); from.set(k, c); push({ x, y, z, k, f: cost + h(x, y, z) });
          break; // per richting één hoogte
        }
      }
      // lift: naar het andere liftblok in de koker (wachten + rijden)
      const L = this.liftTargets(c.x, c.y, c.z);
      if (L) for (const y of L) {
        const k = key(c.x, y, c.z), cost = gc + 8 + Math.abs(y - c.y) * 0.25;
        if (cost >= (g.get(k) ?? 1e18)) continue;
        g.set(k, cost); from.set(k, c); push({ x: c.x, y, z: c.z, k, f: cost + h(c.x, y, c.z) });
      }
    }
    if (!end) return null;
    const pts = []; for (let c = end; c; c = from.get(c.k)) pts.push({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
    pts.reverse();
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].y - pts[i - 1].y) > 1) pts[i].lift = true; // liftrit
    return pts;
  }
}

// deuren open: uit de halteteller van het verkeer (ook buiten het tekenbereik, waar a.doorsOpen niet bijgewerkt wordt;
// treinen hebben geen deuranimatie, maar staan ook stil aan het perron)
export function doorsOpen(a) { if (a.player) return !!a.doorsOpen; return (a.v || 0) < 0.1 && !!a.atStop && a.wait > 2.5 && a.wait < (a.dwell || 18) - 1.5; }
const DRAW_MAX = 128; // zichtbare figuren (instanced; een gezin telt per persoon)
const SHIRT = [0x2f6db5, 0xc0392b, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x16a085];
// reizigerstypes (TERRANOVA 14.2): elk type kiest, loopt en wacht anders
//   speed     wandeltempo (m/s)            maxWait  zo lang wacht hij op een voertuig, daarna geeft hij het op en loopt weg
//   stairs    hoe zwaar een trede weegt in de padkeuze (1 = normaal); noStairs: nooit een trap (beperkte mobiliteit)
//   pref      voorkeur per vervoerssoort bij het kiezen van een halte (0 = nooit)
//   pause     om de zoveel meter even stilstaan (toeristen kijken rond), acc: wat hij bij zich heeft (zichtbaar)
export const PROFILES = {
  pendelaar: { speed: 1.45, maxWait: 360, stairs: 0.8, pref: { metro: 3, train: 3, bus: 1, tram: 1 }, acc: 'aktetas' },
  student: { speed: 1.5, maxWait: 600, stairs: 1, pref: { tram: 2, bus: 2, metro: 2, train: 1 }, acc: 'rugzak' },
  toerist: { speed: 1.1, maxWait: 900, stairs: 1.4, pref: { tram: 3, metro: 1, bus: 1, train: 1 }, pause: [22, 4], acc: 'hoed' },
  luchthaven: { speed: 1.2, maxWait: 900, stairs: 3, pref: { train: 3, metro: 3, bus: 1, tram: 0.5 }, acc: 'koffer' },
  beperkt: { speed: 0.8, maxWait: 1200, noStairs: true, pref: { bus: 3, tram: 3, metro: 1, train: 1 }, acc: 'rollator' }, // metro en trein alleen via de lift (trapvrij pad)
  nacht: { speed: 1.3, maxWait: 600, stairs: 1, pref: { bus: 2, metro: 2, tram: 1, train: 1 }, acc: null },
  // TERRANOVA 15: zakenreizigers (snel, korte geduldsdraad, donker pak) en gezinnen (samen, trager, met kinderen)
  zakenreiziger: { speed: 1.55, maxWait: 300, stairs: 0.9, pref: { train: 3, metro: 3, tram: 1, bus: 0.5 }, acc: 'aktetas', shirt: 0x1f2a38, sits: 0.2 },
  gezin: { speed: 1.0, maxWait: 900, stairs: 1.3, pref: { tram: 2, bus: 2, metro: 2, train: 2 }, acc: 'rugzak', group: 3, sits: 0.8 },
};
const TYPES = Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, v.speed]));
// accessoire: [breedte, hoogte, diepte, x, y, z, kleur] in de assen van de reiziger (z = vooruit)
const ACC = { aktetas: [0.1, 0.32, 0.4, 0.32, 0.62, 0, 0x3b2a1e], rugzak: [0.36, 0.42, 0.2, 0, 1.2, -0.24, 0x2e7d32], hoed: [0.42, 0.08, 0.42, 0, 1.86, 0, 0xd8b26a],
  koffer: [0.28, 0.6, 0.42, 0.42, 0.32, -0.15, 0x6d4c9f], rollator: [0.5, 0.75, 0.12, 0, 0.42, 0.42, 0x9aa4ad] };
export class Travelers {
  constructor(scene, world, traffic) {
    this.w = world; this.tr = traffic; this.nav = new NavGrid((x, y, z) => world.solidAt(x, y, z), (x, y, z) => world.get(x, y, z));
    this.list = []; this.log = []; this.seq = 0; this.rnd = 4242; this.stats = { verschenen: 0, aangekomen: 0, weg: 0, mislukt: 0 };
    this.get = (x, y, z) => world.get(x, y, z); this.solid = (x, y, z) => world.solidAt(x, y, z); this.benches = new Set();
    this.journey = null; // { plan(from, to, hour), hour(), places } — gezet door de wereld (Megatower City: js/megaplan.js)
    this.jstats = { gestart: 0, aangekomen: 0, opAfstand: 0, zichtbaarWeer: 0, overstappen: 0, ritten: 0, vanuitDeur: 0, vanuitGevel: 0, naarDeur: 0, tickets: 0, gezeten: 0, opgegeven: 0, geenPlan: 0 };
    const mk = (geo, color) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), DRAW_MAX); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DRAW_MAX * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(new THREE.BoxGeometry(0.46, 0.66, 0.26).translate(0, 1.2, 0), 0xffffff); this.legs = mk(new THREE.BoxGeometry(0.4, 0.86, 0.22).translate(0, 0.43, 0), 0x22313f); this.head = mk(new THREE.BoxGeometry(0.26, 0.28, 0.26).translate(0, 1.69, 0), 0xe0ac69);
    this.acc = mk(new THREE.BoxGeometry(1, 1, 1), 0xffffff); this.v2 = new THREE.Vector3(); this.sc = new THREE.Vector3();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0); this.c = new THREE.Color();
  }
  typeStats(type) { const T = this.stats.types || (this.stats.types = {}); return T[type] || (T[type] = { verschenen: 0, ingestapt: 0, uitgestapt: 0, opgegeven: 0, paden: 0, treden: 0, grootsteHoogtestap: 0, pauzes: 0, soorten: {} }); }
  rr() { this.rnd = (this.rnd * 16807) % 2147483647; return this.rnd / 2147483647; }
  // ── vanzelf verschijnende reizigers (TERRANOVA 14.1) ──
  // Rond de speler verschijnen reizigers op straat, op 20–60 m van een halte of station. Ze lopen er zelf naartoe
  // (A* over de echte blokken, ook trappen af naar het metroperron), wachten op een voertuig van de juiste soort
  // (bus, tram, metro, trein), stappen in (de bezetting van de rit gaat +1), rijden mee tot de volgende halte, stappen
  // uit en lopen nog een stuk weg. Hoeveel er tegelijk zijn hangt af van het uur (spits meer, nacht weinig).
  // Wie aankomt, geen pad vindt, te lang wacht of ver buiten beeld raakt, verdwijnt weer.
  spawnTick(dt, player, period) {
    this.spT = (this.spT || 0) + dt;
    // opruimen
    this.towerTick(player);
    this.list = this.list.filter(t => {
      if (t.towerF !== undefined) return t.towerF === this.towerFloor; // bezoeker in de Megatower: alleen op de verdieping van de speler
      if (!t.auto) return true;
      const far = Math.hypot(t.x - player.x, t.z - player.z) > AUTO_FAR;
      if (t.journey) { // hele reis: buiten beeld gaat de reis op afstand verder (js/journeys.js)
        if (t.done || t.state === 'geen pad' || t.state === 'gestrand') { this.stats.weg++; if (t.done) { this.stats.aangekomen++; this.jstats.aangekomen++; } return false; }
        if (far && t.state !== 'aan boord' && t.state !== 'op afstand') this.goRemote(t);
        return true;
      }
      if (t.done || t.state === 'geen pad' || t.state === 'gestrand' || t.state === 'uit beeld') { this.stats.weg++; if (t.done) this.stats.aangekomen++; return false; }
      if (t.state === 'aan boord') return true; // telt in de rit; verdwijnt met het voertuig
      if (far || (t.waitT || 0) > AUTO_WAIT) { this.stats.weg++; return false; }
      return true;
    });
    if (this.spT < AUTO_EVERY) return;
    this.spT = 0;
    // drukte: spits meer dan nacht, en meer rond grote stations (trein of metro in de buurt)
    const near = [...(this.tr.served?.values() || [])].filter(q => Math.hypot(q.x - player.x, q.z - player.z) < 160);
    const busy = near.some(q => q.kind === 'train' || q.kind === 'metro') ? 1.6 : 1;
    const want = Math.round((AUTO_WANT[period] ?? 6) * busy), have = this.list.filter(t => t.auto && t.state !== 'op afstand' && t.towerF === undefined).length;
    if (have >= want) return;
    // hele reizen met de planner (van deur tot deur, met overstappen)
    if (this.journey && (this.jT = (this.jT || 0) + AUTO_EVERY) >= JOURNEY_EVERY && this.list.filter(t => t.journey).length < JOURNEY_MAX) { this.jT = 0; const t0 = performance.now(), ok = this.spawnJourney(player); this.msMax('spawn', performance.now() - t0); if (ok) return; }
    // alleen haltes waar het verkeer de laatste 10 minuten echt gestopt is (soort voertuig en plek bekend)
    const clock = this.tr.clock || 0, served = [...(this.tr.served?.values() || [])].filter(q => clock - q.t < 600 && q.name && Math.hypot(q.x - player.x, q.z - player.z) < AUTO_NEAR);
    if (!served.length) return;
    // eerst het type, dan een halte volgens zijn voorkeur (gewogen loting; soorten met gewicht 0 nooit)
    const type = this.pickType(near), prof = PROFILES[type];
    const wts = served.map(q => prof.pref[q.kind] ?? 1), tot = wts.reduce((a, b) => a + b, 0);
    if (!tot) return;
    let pick = this.rr() * tot, si = 0; while (si < served.length - 1 && (pick -= wts[si]) > 0) si++;
    const sv = served[si], kind = sv.kind;
    if (!wts[si]) return;
    // wachtplek: de halte zelf (bord, perron) als die er vlakbij ligt, anders naast het voertuig
    const st = (this.tr.stops || []).filter(q => q.name === sv.name).sort((a, b) => Math.hypot(a.x - sv.x, a.z - sv.z) - Math.hypot(b.x - sv.x, b.z - sv.z))[0];
    const wait = st && Math.hypot(st.x - sv.x, st.z - sv.z) < 30 ? { x: st.x, y: st.y + 1, z: st.z } : { x: sv.x, y: sv.y + 1, z: sv.z };
    // vertrekplek: op straat, 20–60 m van de halte
    // vertrekplek: aan de deur van een gebouw in de buurt van de halte, anders op straat 20–60 m verder
    const street = this.streetNear({ x: wait.x, y: wait.y - 1, z: wait.z }, kind);
    const door = street && doorNear(this.nav, this.get, street.x, street.z, street.y, 24, () => this.rr());
    const from = door || street;
    if (!from) { this.stats.mislukt++; return; }
    const t = this.add({ from, type, steps: [{ ride: { kind, board: sv.name, alight: '*', wait } }, { wander: 30 }] });
    if (t) { t.auto = true; t.fromDoor = !!door; t.group = prof.group || 1; this.stats.verschenen++; this.typeStats(type).verschenen++; }
  }
  // ── hele reis (TERRANOVA 15) ── vertrek aan een deur rond de speler, bestemming 1–4,5 km verder of een bekende plek;
  // de planner (zelfde als de speler gebruikt) kiest de ritten en overstappen
  // ── bezoekers in de Megatower (TERRANOVA 15) ── op openbare verdiepingen (lobby, winkels, sky gardens, observatie…)
  // lopen mensen rond over de echte vloer (A*), alleen op de verdieping waar de speler is. this.tower wordt gezet door
  // de wereld: { at(pos) → { f, zone, y } | null } (js/game.js met js/megatower.js)
  towerTick(player) {
    const info = this.tower && this.tower.at(player);
    this.towerFloor = info ? info.f : null;
    if (!info) return;
    const want = TOWER_WANT[info.zone] ?? 0, have = this.list.filter(t => t.towerF === info.f).length;
    // wie klaar is met rondlopen, loopt verder naar een volgende plek
    for (const t of this.list) if (t.towerF === info.f && t.done) { t.done = false; t.steps = [{ wander: 14 + this.rr() * 16 }]; t.i = 0; t.state = 'volgende'; }
    if (have >= want || (this.towerT = (this.towerT || 0) + 1) % 20) return; // één nieuwe bezoeker per 20 tikken
    for (let k = 0; k < 6; k++) {
      const a = this.rr() * 6.283, r = 4 + this.rr() * 30, q = this.nav.snap(player.x + Math.cos(a) * r, info.y, player.z + Math.sin(a) * r, 3);
      if (!q || Math.abs(q.y - info.y) > 1) continue;
      const type = ['pendelaar', 'toerist', 'zakenreiziger', 'gezin', 'student'][Math.floor(this.rr() * 5)];
      const t = this.add({ from: q, type, steps: [{ wander: 14 + this.rr() * 16 }] });
      if (t) { t.towerF = info.f; t.group = PROFILES[type].group || 1; this.stats.torenbezoekers = (this.stats.torenbezoekers || 0) + 1; }
      return;
    }
  }
  // type: willekeurig, maar bij de luchthaven vooral luchthavenreizigers met koffers en 's nachts nachtreizigers
  pickType(near) {
    const h = this.journey ? this.journey.hour() : (this.tr.hour ?? 12);
    if ((near || []).some(q => /Luchthaven|Airport/i.test(q.name)) && this.rr() < 0.5) return 'luchthaven';
    if ((h >= 23 || h < 5) && this.rr() < 0.5) return 'nacht';
    return AUTO_TYPES[Math.floor(this.rr() * AUTO_TYPES.length)];
  }
  spawnJourney(player) {
    const near = [...(this.tr.served?.values() || [])].filter(q => Math.hypot(q.x - player.x, q.z - player.z) < 300);
    const type = this.pickType(near), prof = PROFILES[type];
    const a = this.rr() * 6.283, r = 60 + this.rr() * 160;
    const q = this.nav.snap(player.x + Math.cos(a) * r, (this.ground ?? player.y) + 1, player.z + Math.sin(a) * r, 4);
    if (!q) return null;
    const td = performance.now(); let o = doorNear(this.nav, this.get, q.x, q.z, q.y, 30, () => this.rr()), src = 'deur'; this.msMax('deur', performance.now() - td);
    if (!o) { o = facadeNear(this.nav, this.solid, q.x, q.z, q.y, () => this.rr()); src = 'gevel'; }
    if (!o) return null;
    // 40 %: iemand die van ver komt en hier aankomt (vertrekt buiten beeld, wordt zichtbaar bij de uitstaphalte en
    // loopt naar de deur hier); 60 %: iemand die hier vertrekt naar een plek 1–4,5 km verder (of een bekende plek)
    const inbound = this.rr() < 0.4, P = this.journey.places || [];
    const far = () => { const b = this.rr() * 6.283, d = 1200 + this.rr() * 3300; return { x: Math.max(300, Math.min(9900, o.x + Math.cos(b) * d)), z: Math.max(300, Math.min(9900, o.z + Math.sin(b) * d)), name: null }; };
    let from = { x: o.x, z: o.z, name: 'Vertrek' }, dest;
    if (inbound) { from = far(); dest = { x: o.x, z: o.z, name: 'Bestemming' }; }
    else if (P.length && this.rr() < 0.35) dest = P[Math.floor(this.rr() * P.length)];
    else dest = far();
    // plannen: in de worker (js/planworker.js) als die er is — de reiziger verschijnt dan zodra het plan klaar is
    if (this.journey.planAsync) {
      if (this.planBusy) return null;
      this.planBusy = true;
      this.journey.planAsync(from, dest, this.journey.hour()).then((r2) => { this.planBusy = false; if (this.gone) return; if (r2 && !r2.error) this.finishJourney(r2, { type, prof, o, src, inbound, from, dest }); else this.jstats.geenPlan++; }).catch(() => { this.planBusy = false; });
      return 'bezig';
    }
    const tp = performance.now(), r2 = this.journey.plan(from, dest, this.journey.hour()); this.msMax('plan', performance.now() - tp);
    return this.finishJourney(r2, { type, prof, o, src, inbound, from, dest });
  }
  finishJourney(r2, { type, prof, o, src, inbound, from, dest }) {
    const steps = r2 && stepsFromPlan(r2, dest);
    if (!steps) { this.jstats.geenPlan++; return null; }
    // beperkte mobiliteit: geen metro of trein (trappen); soorten met voorkeur 0 nooit
    if (steps.some(s => s.ride && (prof.pref[s.ride.kind] ?? 1) === 0)) return null;
    const t = this.add({ from: o, type, steps });
    if (!t) return null;
    const rides = steps.filter(s => s.ride).length;
    t.auto = true; t.group = prof.group || 1; t.fromDoor = !inbound && src === 'deur';
    if (inbound) { // onderweg van ver: begint op afstand, al op weg naar de eerste halte
      t.x = from.x; t.z = from.z; t.state = 'op afstand'; t.remoteRide = true; t.rtrip = null; t.inbound = true;
      t.remoteEnd = (this.tr.clock || 0) + this.rr() * 240 + Math.max(20, (steps[0].ride.arr || 0) - (steps[0].ride.dep || 0));
      this.jstats.inkomend = (this.jstats.inkomend || 0) + 1;
    }
    t.journey = { dep: r2.dep, arr: r2.arr, ritten: rides, van: inbound ? 'van ver' : src, naar: dest.name || null, lijnen: steps.filter(s => s.ride).map(s => s.ride.line) };
    t.journey0 = t.journey; (this.journeyLog || (this.journeyLog = [])).push(t); if (this.journeyLog.length > 200) this.journeyLog.shift(); // voor diagnose en tests
    this.stats.verschenen++; this.typeStats(type).verschenen++;
    this.jstats.gestart++; this.jstats.ritten += rides; this.jstats.overstappen += Math.max(0, rides - 1); if (!inbound) this.jstats[src === 'deur' ? 'vanuitDeur' : 'vanuitGevel']++;
    return t;
  }
  msMax(k, ms) { const M = this.ms || (this.ms = {}); M[k] = Math.max(M[k] || 0, +ms.toFixed(1)); }
  // ── simulatie op afstand ── buiten beeld (of het voertuig is uit beeld): de reis loopt verder met de tijden van de planner.
  // Wie aan boord was, blijft in de bezetting van de rit (js/ovtrips.js remoteOn) tot hij op afstand uitstapt.
  goRemote(t) {
    const clock = this.tr.clock || 0, st = t.steps[t.i];
    if (t.sitKey) { this.benches.delete(t.sitKey); t.sitKey = null; t.sit = null; }
    t.search = null; t.path = null;
    if (st && st.ride) {
      const R = st.ride, runT = Math.max(20, (R.arr || 0) - (R.dep || 0));
      if (t.state === 'aan boord') {
        t.rtrip = t.trip0 || (t.vehicle && t.vehicle.trip) || null; for (let k = 0; k < (t.group || 1); k++) this.tr.trips.remoteOn(t.rtrip);
        t.remoteEnd = clock + Math.max(15, runT - (clock - (t.boardClock ?? clock)));
      } else t.remoteEnd = clock + 60 + this.rr() * 300 + runT; // wachten op het eerstvolgende vertrek + de rit
      t.remoteRide = true;
    } else if (st && st.goal) { t.remoteEnd = clock + Math.hypot(st.goal.x - t.x, st.goal.z - t.z) * 1.25 / t.speed; t.remoteRide = false; }
    else { t.done = true; t.state = 'aangekomen'; return; }
    t.vehicle = null; t.state = 'op afstand'; this.jstats.opAfstand++; this.note(t, 'op afstand', { stap: t.i });
  }
  // een stap op afstand is klaar: uitstappen (bezetting −1), en de volgende stap hier of weer zichtbaar bij de speler
  remoteStep(t, player) {
    const st = t.steps[t.i], clock = this.tr.clock || 0;
    if (st && st.ride && t.remoteRide) {
      for (let k = 0; k < (t.group || 1); k++) this.tr.trips.remoteOff(t.rtrip);
      t.rtrip = null; this.stats.uitgestapt = (this.stats.uitgestapt || 0) + 1; this.typeStats(t.type).uitgestapt++;
      this.note(t, 'uitgestapt', { halte: st.ride.alight, opAfstand: true });
      t.at = st.ride.at; t.i++;
    } else if (st && st.goal) { t.i++; }
    const nx = t.steps[t.i];
    if (!nx) { t.done = true; t.state = 'aangekomen'; this.note(t, 'aangekomen', { opAfstand: true }); return; }
    // waar de reiziger nu is: de uitstaphalte van de vorige rit
    const here = t.at || { x: t.x, z: t.z };
    if (Math.hypot(here.x - player.x, here.z - player.z) < MATERIALIZE) {
      const prev = t.steps[t.i - 1], s = prev && prev.ride ? stopFor(this.tr.stops || [], prev.ride.alight, prev.ride.kind, here, 150) : null;
      const q = s ? this.nav.snap(s.x, s.y + 1, s.z, 4) : this.nav.snap(here.x, (this.ground ?? player.y) + 1, here.z, 6);
      if (q) { t.x = q.x + 0.5; t.y = q.y; t.z = q.z + 0.5; t.state = 'volgende'; this.jstats.zichtbaarWeer++; this.note(t, 'weer in beeld', null); return; }
    }
    t.x = here.x; t.z = here.z;
    if (nx.ride) { t.remoteRide = true; t.rtrip = null; t.remoteEnd = clock + 60 + this.rr() * 300 + Math.max(20, (nx.ride.arr || 0) - (nx.ride.dep || 0)); }
    else { t.remoteRide = false; t.remoteEnd = clock + Math.hypot(nx.goal.x - here.x, nx.goal.z - here.z) * 1.25 / t.speed; }
  }
  streetNear(st, kind) {
    const under = kind === 'metro'; // metroperron: de vertrekplek ligt bovengronds
    for (let k = 0; k < 6; k++) {
      const a = this.rr() * 6.283, r = 20 + this.rr() * 40, x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r;
      if (!under) { const q = this.nav.snap(x, st.y + 1, z, 3); if (q) return q; continue; }
      const top = (this.ground ?? st.y + 20) + 3;
      for (let y = top; y > top - 8; y--) if (this.nav.walkable(Math.floor(x), y, Math.floor(z))) return { x: Math.floor(x), y, z: Math.floor(z) };
    }
    return null;
  }
  dispose() { this.gone = true; for (const m of [this.body, this.legs, this.head, this.acc]) { m.geometry.dispose(); m.removeFromParent(); } }
  // reis: { from: {x,y,z}, steps: [{ walk: {x,y,z} } | { ride: { kind, line?, board: stopName, alight: stopName } }], type }
  add(trip) {
    const p = this.nav.snap(trip.from.x, trip.from.y, trip.from.z); if (!p) return null;
    const t = { id: 'R' + (++this.seq), type: trip.type || 'pendelaar', speed: TYPES[trip.type] || WALK, prof: PROFILES[trip.type] || PROFILES.pendelaar, walked: 0, steps: trip.steps, i: 0, x: p.x + 0.5, y: p.y, z: p.z + 0.5, yaw: 0, state: 'start', path: null, pi: 0, hist: [], shirt: SHIRT[this.seq % SHIRT.length], done: false };
    this.list.push(t); this.note(t, 'vertrek', null); return t;
  }
  note(t, what, extra) { const e = { reiziger: t.id, wat: what, t: Math.round((this.tr.clock || 0) * 10) / 10, pos: [Math.round(t.x), Math.round(t.y), Math.round(t.z)], ...extra }; this.log.push(e); if (this.log.length > 400) this.log.shift(); t.hist.push(e); }
  // dichtstbijzijnde plek bij de halte `name` (perron of stoep), volgens de haltes van het verkeersnet
  stopPos(name, kind) { const st = (this.tr.stops || []).filter(s => s.name === name && (!kind || s.kind === kind || s.kind === kind + 'stop')); return st[0] || null; }
  walkTo(t, goal, maxN = MAXN) {
    // vanzelf verschenen reizigers: het pad wordt over frames gezocht (toestand 'zoekt pad'), anders meteen
    const opt = { stairs: t.prof.stairs, noStairs: t.prof.noStairs, budget: 2.5 }; // vanzelf verschenen reizigers: hooguit ±2,5 ms zoeken per frame
    if (t.auto) { t.search = this.nav.pathIter({ x: t.x, y: t.y, z: t.z }, goal, maxN, 1500, opt); t.goal = goal; t.state = 'zoekt pad'; return true; }
    return this.usePath(t, goal, this.nav.path({ x: t.x, y: t.y, z: t.z }, goal, maxN, opt));
  }
  usePath(t, goal, pts) {
    if (!pts) { t.state = 'geen pad'; this.note(t, 'geen pad', { naar: [Math.round(goal.x), Math.round(goal.y), Math.round(goal.z)] }); return false; }
    // controle op het moment zelf (de blokken zijn dan zeker geladen): elk punt beloopbaar, stappen ≤ 1,5 m en ≤ 1 blok
    let bad = 0, step = 0, stepH = 0;
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (!this.nav.walkable(Math.floor(q.x), q.y, Math.floor(q.z))) bad++; if (i) { step = Math.max(step, Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z)); if (q.lift) { this.stats.liftritten = (this.stats.liftritten || 0) + 1; if (Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z) > 0.01) bad++; } else stepH = Math.max(stepH, Math.abs(q.y - pts[i - 1].y)); } }
    t.check = { punten: (t.check?.punten || 0) + pts.length, nietBeloopbaar: (t.check?.nietBeloopbaar || 0) + bad, grootsteStap: Math.max(t.check?.grootsteStap || 0, step), grootsteHoogtestap: Math.max(t.check?.grootsteHoogtestap || 0, stepH) };
    { const ty = this.typeStats(t.type); ty.paden++; for (let i = 1; i < pts.length; i++) if (pts[i].y !== pts[i - 1].y && !pts[i].lift) ty.treden++; else if (pts[i].lift) ty.lift = (ty.lift || 0) + 1; ty.grootsteHoogtestap = Math.max(ty.grootsteHoogtestap, stepH); }
    this.stats.paden = (this.stats.paden || 0) + 1; this.stats.punten = (this.stats.punten || 0) + pts.length; this.stats.nietBeloopbaar = (this.stats.nietBeloopbaar || 0) + bad; this.stats.grootsteStap = Math.max(this.stats.grootsteStap || 0, step); this.stats.grootsteHoogtestap = Math.max(this.stats.grootsteHoogtestap || 0, stepH);
    t.path = pts; t.pi = 0; t.state = 'lopen'; t.pathLen = pts.length; (t.paths || (t.paths = [])).push(pts); return true;
  }
  update(dt, player) { const t0 = performance.now(); this.update0(dt, player); this.msMax('update', performance.now() - t0); }
  update0(dt, player) {
    const tr = this.tr; let paths = 0;
    for (const t of this.list) {
      if (t.done) continue;
      const ts0 = performance.now(), s0 = t.state;
      try {
      const st = t.steps[t.i];
      if (t.state === 'zoekt pad') {
        if (paths++ >= 1) continue; // één zoekstukje per frame voor alle vanzelf verschenen reizigers samen
        const r = t.search.next(); if (!r.done) continue;
        t.search = null;
        if (!this.usePath(t, t.goal, r.value) && t.wanderStep) { t.done = true; t.state = 'aangekomen'; }
        continue;
      }
      if (t.state === 'op afstand') { if ((tr.clock || 0) >= t.remoteEnd) this.remoteStep(t, player); continue; }
      if (t.state === 'bezig') { if ((t.actT -= dt) <= 0) { t.i++; t.state = 'volgende'; } continue; }
      if (t.state === 'start' || t.state === 'volgende') {
        if (!st) { t.done = true; t.state = 'aangekomen'; this.note(t, 'aangekomen', null); continue; }
        // even iets doen op deze plek (ticket kopen): kijkrichting en tijd
        if (st.act) { t.state = 'bezig'; t.actT = st.act.secs; if (st.act.yaw !== undefined) t.yaw = st.act.yaw; this.note(t, st.act.label, null); continue; }
        // bestemming van een hele reis: de deur van een gebouw daar (of de plek zelf); ver weg: op afstand
        if (st.goal) {
          if (Math.hypot(st.goal.x - player.x, st.goal.z - player.z) > AUTO_FAR) { this.goRemote(t); continue; }
          const g0 = this.nav.snap(st.goal.x, (this.ground ?? t.y) + 1, st.goal.z, 6) || { x: Math.floor(st.goal.x), y: t.y, z: Math.floor(st.goal.z) };
          const d = doorNear(this.nav, this.get, g0.x, g0.z, g0.y, 30, () => this.rr());
          t.toDoor = !!d; this.walkTo(t, d || g0, t.auto ? AUTO_N : MAXN); continue;
        }
        // rit van een hele reis: wachtplek = de halte in de wereld met die naam, het dichtst bij de plek van de planner;
        // vóór de eerste metro- of treinrit eerst een ticket aan de automaat in het station
        if (st.ride && st.ride.from && !st.ride.wait) {
          const R = st.ride, s0 = stopFor(this.tr.stops || [], R.board, R.kind, R.from, 160);
          if (!s0) { if (Math.hypot(R.from.x - player.x, R.from.z - player.z) > MATERIALIZE) { this.goRemote(t); continue; } t.state = 'geen pad'; this.note(t, 'halte niet gevonden', { halte: R.board }); continue; }
          R.wait = { x: s0.x, y: s0.y + 1, z: s0.z };
          if ((R.kind === 'metro' || R.kind === 'train') && !t.ticket) {
            t.ticket = true; const tt = performance.now(), tk = ticketNear(this.nav, this.get, R.wait); this.msMax('ticket', performance.now() - tt);
            if (tk && Math.hypot(tk.x - t.x, tk.z - t.z) < 160) { t.steps.splice(t.i, 0, { walk: { x: tk.x, y: tk.y, z: tk.z } }, { act: { secs: 4 + this.rr() * 4, label: 'ticket kopen', yaw: tk.yaw } }); this.jstats.tickets++; continue; }
          }
        }
        if (st.wander) { const a = (this.rr() * 6.283), r = st.wander * (0.5 + this.rr() * 0.5), q = this.nav.snap(t.x + Math.cos(a) * r, t.y, t.z + Math.sin(a) * r, 4); t.wanderStep = true; if (!q || !this.walkTo(t, q, t.auto ? AUTO_N : MAXN)) { t.done = true; t.state = 'aangekomen'; } continue; }
        if (st.walk) this.walkTo(t, st.walk, t.auto ? AUTO_N : MAXN);
        else if (st.ride) { const sp = st.ride.wait; if (sp) this.walkTo(t, sp, t.auto ? AUTO_N : MAXN); else t.state = 'wachten'; t.afterWalk = 'wachten'; }
        continue;
      }
      if (t.state === 'lift') { if ((t.liftT -= dt) <= 0) { t.y = t.liftTo; t.state = 'lopen'; } continue; } // in de liftkoker
      if (t.state === 'pauze') { if ((t.pauseT -= dt) <= 0) t.state = 'lopen'; continue; }
      if (t.state === 'lopen') {
        let rem = t.speed * dt;
        // toerist: om de zoveel meter even stilstaan en rondkijken
        if (t.prof.pause && (t.walked += rem) > t.prof.pause[0]) { t.walked = 0; t.state = 'pauze'; t.pauseT = t.prof.pause[1]; t.yaw += 1.2; this.typeStats(t.type).pauzes++; continue; }
        while (rem > 0 && t.pi < t.path.length) {
          const q = t.path[t.pi], dx = q.x - t.x, dz = q.z - t.z, d = Math.hypot(dx, dz);
          if (q.lift) { t.pi++; t.state = 'lift'; t.liftT = 6 + Math.abs(q.y - t.y) * 0.25; t.liftTo = q.y; this.note(t, 'lift', { van: t.y, naar: q.y }); rem = 0; break; }
          if (d <= rem) { t.x = q.x; t.z = q.z; t.y = q.y; rem -= d; t.pi++; } else { t.x += dx / d * rem; t.z += dz / d * rem; t.y = q.y; t.yaw = Math.atan2(dx, dz); rem = 0; }
        }
        if (t.pi >= t.path.length) {
          if (t.afterWalk === 'wachten') { t.afterWalk = null; t.state = 'wachten'; t.waitT = 0; this.note(t, 'wacht', { op: st.ride.board }); this.trySit(t); }
          else if (t.afterWalk === 'zitten') { t.afterWalk = null; t.state = 'wachten'; t.sit = t.sitGoal; t.yaw = t.sit.yaw; this.jstats.gezeten++; this.note(t, 'zit op een bank', null); }
          else { if (st && st.goal) { if (t.toDoor) this.jstats.naarDeur++; this.note(t, t.toDoor ? 'gebouw binnen' : 'bestemming', { naar: st.goal.name }); } t.i++; t.state = 'volgende'; }
        }
        continue;
      }
      if (t.state === 'wachten') {
        // het juiste voertuig: soort en lijn, deuren open, aan de halte van de reis en vlakbij
        const R = st.ride; t.waitT = (t.waitT || 0) + dt;
        // te lang gewacht: opgeven en weglopen (pendelaars sneller dan toeristen)
        if (t.auto && t.waitT > t.prof.maxWait) { if (t.sitKey) { this.benches.delete(t.sitKey); t.sitKey = null; t.sit = null; } if (t.journey) { this.jstats.opgegeven++; t.journey = null; } this.typeStats(t.type).opgegeven++; this.note(t, 'opgegeven', { gewacht: Math.round(t.waitT) }); t.steps = [{ wander: 25 }]; t.i = 0; t.waitT = 0; t.state = 'volgende'; continue; }
        // richting: met `toward` alleen een voertuig dat die kant op rijdt (kop vóór de staart, gezien naar het doel)
        const ok = (a) => { if (!R.toward) return true; const h = tr.behind(a, 0, {}), e = tr.behind(a, a.L, {}); return (h.x - e.x) * (R.toward.x - h.x) + (h.z - e.z) * (R.toward.z - h.z) > 0; };
        const v = tr.agents.find(a => !a.dead && !a.oos && a.kind === R.kind && (!R.line || a.line === R.line) && doorsOpen(a) && a.atStop === R.board && (!R.dest || (a.trip && a.trip.dest === R.dest)) && Math.hypot(tr.behind(a, a.L / 2, {}).x - t.x, tr.behind(a, a.L / 2, {}).z - t.z) < a.L / 2 + 14 && ok(a));
        if (v && (!v.trip || v.trip.cap - v.trip.occ >= (t.group || 1))) {
          if (t.sitKey) { this.benches.delete(t.sitKey); t.sitKey = null; t.sit = null; } // opstaan
          // naar de dichtste deur: het dichtste punt op het voertuig, dan instappen
          const near = this.nearestOn(v, t); t.vehicle = v; t.state = 'instappen'; t.board = near; this.note(t, 'naar de deur', { voertuig: v.kind, lijn: v.line || null, rit: v.trip && v.trip.id });
        }
        continue;
      }
      if (t.state === 'instappen') {
        const v = t.vehicle, q = t.board, dx = q.x - t.x, dz = q.z - t.z, d = Math.hypot(dx, dz);
        if (!doorsOpen(v) || v.dead) { t.state = 'wachten'; t.vehicle = null; continue; } // deuren dicht: volgende
        if (d > 0.9) { const s = Math.min(d, t.speed * dt); t.x += dx / d * s; t.z += dz / d * s; t.yaw = Math.atan2(dx, dz); continue; }
        const g = t.group || 1, voor = v.trip ? v.trip.occ : null; tr.trips.board(v, g); if (!t.auto) v.riders = (v.riders || 0) + g; else v.npc = (v.npc || 0) + g; t.boardClock = tr.clock || 0; t.trip0 = v.trip || null; /* een geplande reis houdt het voertuig vast; met reizigers aan boord wordt het niet aan de halte uit dienst genomen */ t.state = 'aan boord'; t.boardStop = v.atStop; t.boardKey = v.lastStop; t.boardSeq = v.stopSeq || 0;
        { const ty = this.typeStats(t.type); ty.ingestapt++; ty.soorten[v.kind] = (ty.soorten[v.kind] || 0) + 1; }
        this.stats.ingestapt = (this.stats.ingestapt || 0) + 1; (this.stats.soorten || (this.stats.soorten = {}))[v.kind] = (this.stats.soorten[v.kind] || 0) + 1;
        this.note(t, 'ingestapt', { rit: v.trip && v.trip.id, bezettingVoor: voor, bezetting: v.trip && v.trip.occ, halte: v.atStop, lijn: v.line || null, afstandTotDeur: +d.toFixed(1) });
        continue;
      }
      if (t.state === 'aan boord') {
        const v = t.vehicle, R = st.ride;
        const h = tr.behind(v, Math.min(v.L - 1, Math.max(1, t.boardOff ?? v.L / 2)), {}); t.x = h.x; t.z = h.z; t.y = h.y + 1.1; // rijdt mee
        if ((v.dead || v.oos) && t.journey) { t.vehicle = v; this.goRemote(t); continue; } // hele reis: rijdt op afstand verder
        if ((v.dead || v.oos) && t.auto) { t.state = 'uit beeld'; this.stats.uitBeeld = (this.stats.uitBeeld || 0) + 1; const w = (this.stats.uitBeeldWaarom || (this.stats.uitBeeldWaarom = {})); w[v.why || '?'] = (w[v.why || '?'] || 0) + 1; continue; } // rijdt buiten beeld verder mee (telt in de rit)
        if (v.dead) { t.state = 'gestrand'; this.note(t, 'voertuig weg', null); continue; }
        // uitstappen aan de halte van de reis ('*' = de eerstvolgende halte na het instappen)
        if (doorsOpen(v) && (R.alight === '*' ? (v.stopSeq || 0) > t.boardSeq : v.atStop === R.alight && (!R.at || Math.hypot(h.x - R.at.x, h.z - R.at.z) < 90))) {
          const g = t.group || 1, voor = v.trip ? v.trip.occ : null; tr.trips.alight(v, g); if (!t.auto) v.riders = Math.max(0, (v.riders || g) - g); else v.npc = Math.max(0, (v.npc || g) - g);
          // aan de perronkant naast de deur uitstappen, op een beloopbare plek
          const pn = v.platN || [0, 0], out = this.nav.snap(h.x + pn[0] * 2.4, h.y + 1, h.z + pn[1] * 2.4, 4) || this.nav.snap(h.x, h.y + 1, h.z, 5);
          if (out) { t.x = out.x + 0.5; t.y = out.y; t.z = out.z + 0.5; }
          this.stats.uitgestapt = (this.stats.uitgestapt || 0) + 1; this.typeStats(t.type).uitgestapt++;
          this.note(t, 'uitgestapt', { rit: v.trip && v.trip.id, bezettingVoor: voor, bezetting: v.trip && v.trip.occ, halte: v.atStop, afstandTotDeur: +Math.hypot(t.x - h.x, t.z - h.z).toFixed(1) });
          t.vehicle = null; t.i++; t.state = 'volgende';
        }
      }
      } finally { const d = performance.now() - ts0; if (d > 2) this.msMax('st:' + s0 + (t.steps[t.i] && t.steps[t.i].goal ? '/doel' : ''), d); }
    }
    // tekenen: alleen wie loopt of wacht en dichtbij is
    let n = 0, na = 0;
    for (const t of this.list) {
      if (t.done || t.state === 'aan boord' || t.state === 'op afstand' || n >= DRAW_MAX - 3 || Math.hypot(t.x - player.x, t.z - player.z) > 220) continue;
      // zittend op een bank: op de zitting, iets lager
      if (t.sit) { this.q.setFromAxisAngle(this.up, t.sit.yaw); this.v.set(t.sit.x, t.sit.y - 0.5, t.sit.z); }
      else { this.q.setFromAxisAngle(this.up, t.yaw); this.v.set(t.x, t.y, t.z); }
      // een gezin: ouder vooraan, twee kinderen (kleiner) er vlak achter
      const G = t.group || 1;
      for (let k = 0; k < G; k++) {
        const kid = k > 0, sc = kid ? 0.68 : 1;
        if (k) { this.v2.set(k === 1 ? -0.55 : 0.55, 0, -0.75).applyQuaternion(this.q).add(this.v); } else this.v2.copy(this.v);
        if (t.sit && k) this.v2.y += 0; // kinderen naast de ouder op de bank
        this.sc.set(sc, sc, sc); this.m4.compose(this.v2, this.q, this.sc);
        const shirt = kid ? SHIRT[(+t.id.slice(1) + k * 3) % SHIRT.length] : (t.prof.shirt ?? t.shirt);
        for (const [m, col] of [[this.body, shirt], [this.legs, 0x22313f], [this.head, 0xe0ac69]]) { m.setMatrixAt(n, this.m4); m.setColorAt(n, this.c.setHex(col)); }
        n++;
      }
      const a = ACC[t.prof.acc];
      if (a && na < DRAW_MAX) { this.v2.set(a[3], a[4] - (t.sit ? 0.1 : 0), a[5]).applyQuaternion(this.q).add(this.v); this.sc.set(a[0], a[1], a[2]); this.m4.compose(this.v2, this.q, this.sc); this.acc.setMatrixAt(na, this.m4); this.acc.setColorAt(na, this.c.setHex(a[6])); na++; }
    }
    for (const m of [this.body, this.legs, this.head]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.acc.count = na; this.acc.instanceMatrix.needsUpdate = true; this.acc.instanceColor.needsUpdate = true;
  }
  // wachten op een bank (stations, perrons, haltes): een vrije bank binnen 6 m, anders blijven staan
  trySit(t) {
    if (this.rr() > (t.prof.sits ?? 0.5)) return;
    const b = benchNear(this.nav, this.get, this.solid, t, 10, this.benches); if (!b) { this.jstats.geenBank = (this.jstats.geenBank || 0) + 1; return; }
    this.benches.add(b.key); t.sitKey = b.key; t.sitGoal = b;
    t.afterWalk = 'zitten'; this.walkTo(t, { x: b.x, y: b.y, z: b.z }, 4000);
  }
  // dichtste punt op de as van het voertuig (deur), en waar op het voertuig (afstand vanaf de kop)
  nearestOn(v, t) {
    let best = null;
    for (let s = 1; s < v.L; s += 1.5) { const h = this.tr.behind(v, s, {}), d = Math.hypot(h.x - t.x, h.z - t.z); if (!best || d < best.d) best = { x: h.x, z: h.z, d, s }; }
    t.boardOff = best.s; return best;
  }
}
