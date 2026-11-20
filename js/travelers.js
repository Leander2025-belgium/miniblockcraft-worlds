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

const WALK = 1.35, MAXN = 120000, AUTO_N = 20000; // A*-budget voor vanzelf verschenen reizigers (houdt de framekost laag)
const AUTO_WANT = { spits: 14, dal: 9, avond: 6, nacht: 2 }, AUTO_EVERY = 2.5, AUTO_NEAR = 120, AUTO_FAR = 520, AUTO_WAIT = 1500;
const AUTO_TYPES = ['pendelaar', 'pendelaar', 'student', 'toerist', 'luchthaven', 'beperkt', 'nacht'];
export class NavGrid {
  constructor(solidAt) { this.solid = solidAt; }
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
    let n = 0, end = null;
    while (open.length && n++ < maxN) {
      if (n % slice === 0) yield null;
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
    }
    if (!end) return null;
    const pts = []; for (let c = end; c; c = from.get(c.k)) pts.push({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
    return pts.reverse();
  }
}

// deuren open: uit de halteteller van het verkeer (ook buiten het tekenbereik, waar a.doorsOpen niet bijgewerkt wordt;
// treinen hebben geen deuranimatie, maar staan ook stil aan het perron)
export function doorsOpen(a) { if (a.player) return !!a.doorsOpen; return (a.v || 0) < 0.1 && !!a.atStop && a.wait > 2.5 && a.wait < (a.dwell || 18) - 1.5; }
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
  beperkt: { speed: 0.8, maxWait: 1200, noStairs: true, pref: { bus: 3, tram: 3, metro: 0, train: 0 }, acc: 'rollator' },
  nacht: { speed: 1.3, maxWait: 600, stairs: 1, pref: { bus: 2, metro: 2, tram: 1, train: 1 }, acc: null },
};
const TYPES = Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, v.speed]));
// accessoire: [breedte, hoogte, diepte, x, y, z, kleur] in de assen van de reiziger (z = vooruit)
const ACC = { aktetas: [0.1, 0.32, 0.4, 0.32, 0.62, 0, 0x3b2a1e], rugzak: [0.36, 0.42, 0.2, 0, 1.2, -0.24, 0x2e7d32], hoed: [0.42, 0.08, 0.42, 0, 1.86, 0, 0xd8b26a],
  koffer: [0.28, 0.6, 0.42, 0.42, 0.32, -0.15, 0x6d4c9f], rollator: [0.5, 0.75, 0.12, 0, 0.42, 0.42, 0x9aa4ad] };
export class Travelers {
  constructor(scene, world, traffic) {
    this.w = world; this.tr = traffic; this.nav = new NavGrid((x, y, z) => world.solidAt(x, y, z));
    this.list = []; this.log = []; this.seq = 0; this.rnd = 4242; this.stats = { verschenen: 0, aangekomen: 0, weg: 0, mislukt: 0 };
    const mk = (geo, color) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), 64); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
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
    this.list = this.list.filter(t => {
      if (!t.auto) return true;
      const far = Math.hypot(t.x - player.x, t.z - player.z) > AUTO_FAR;
      if (t.done || t.state === 'geen pad' || t.state === 'gestrand' || t.state === 'uit beeld') { this.stats.weg++; if (t.done) this.stats.aangekomen++; return false; }
      if (t.state === 'aan boord') return true; // telt in de rit; verdwijnt met het voertuig
      if (far || (t.waitT || 0) > AUTO_WAIT) { this.stats.weg++; return false; }
      return true;
    });
    if (this.spT < AUTO_EVERY) return;
    this.spT = 0;
    const want = AUTO_WANT[period] ?? 6, have = this.list.filter(t => t.auto).length;
    if (have >= want) return;
    // alleen haltes waar het verkeer de laatste 10 minuten echt gestopt is (soort voertuig en plek bekend)
    const clock = this.tr.clock || 0, served = [...(this.tr.served?.values() || [])].filter(q => clock - q.t < 600 && q.name && Math.hypot(q.x - player.x, q.z - player.z) < AUTO_NEAR);
    if (!served.length) return;
    // eerst het type, dan een halte volgens zijn voorkeur (gewogen loting; soorten met gewicht 0 nooit)
    const type = AUTO_TYPES[Math.floor(this.rr() * AUTO_TYPES.length)], prof = PROFILES[type];
    const wts = served.map(q => prof.pref[q.kind] ?? 1), tot = wts.reduce((a, b) => a + b, 0);
    if (!tot) return;
    let pick = this.rr() * tot, si = 0; while (si < served.length - 1 && (pick -= wts[si]) > 0) si++;
    const sv = served[si], kind = sv.kind;
    if (!wts[si]) return;
    // wachtplek: de halte zelf (bord, perron) als die er vlakbij ligt, anders naast het voertuig
    const st = (this.tr.stops || []).filter(q => q.name === sv.name).sort((a, b) => Math.hypot(a.x - sv.x, a.z - sv.z) - Math.hypot(b.x - sv.x, b.z - sv.z))[0];
    const wait = st && Math.hypot(st.x - sv.x, st.z - sv.z) < 30 ? { x: st.x, y: st.y + 1, z: st.z } : { x: sv.x, y: sv.y + 1, z: sv.z };
    // vertrekplek: op straat, 20–60 m van de halte
    const from = this.streetNear({ x: wait.x, y: wait.y - 1, z: wait.z }, kind);
    if (!from) { this.stats.mislukt++; return; }
    const t = this.add({ from, type, steps: [{ ride: { kind, board: sv.name, alight: '*', wait } }, { wander: 30 }] });
    if (t) { t.auto = true; this.stats.verschenen++; this.typeStats(type).verschenen++; }
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
  dispose() { for (const m of [this.body, this.legs, this.head, this.acc]) { m.geometry.dispose(); m.removeFromParent(); } }
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
    const opt = { stairs: t.prof.stairs, noStairs: t.prof.noStairs };
    if (t.auto) { t.search = this.nav.pathIter({ x: t.x, y: t.y, z: t.z }, goal, maxN, 1500, opt); t.goal = goal; t.state = 'zoekt pad'; return true; }
    return this.usePath(t, goal, this.nav.path({ x: t.x, y: t.y, z: t.z }, goal, maxN, opt));
  }
  usePath(t, goal, pts) {
    if (!pts) { t.state = 'geen pad'; this.note(t, 'geen pad', { naar: [Math.round(goal.x), Math.round(goal.y), Math.round(goal.z)] }); return false; }
    // controle op het moment zelf (de blokken zijn dan zeker geladen): elk punt beloopbaar, stappen ≤ 1,5 m en ≤ 1 blok
    let bad = 0, step = 0, stepH = 0;
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (!this.nav.walkable(Math.floor(q.x), q.y, Math.floor(q.z))) bad++; if (i) { step = Math.max(step, Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z)); stepH = Math.max(stepH, Math.abs(q.y - pts[i - 1].y)); } }
    t.check = { punten: (t.check?.punten || 0) + pts.length, nietBeloopbaar: (t.check?.nietBeloopbaar || 0) + bad, grootsteStap: Math.max(t.check?.grootsteStap || 0, step), grootsteHoogtestap: Math.max(t.check?.grootsteHoogtestap || 0, stepH) };
    { const ty = this.typeStats(t.type); ty.paden++; for (let i = 1; i < pts.length; i++) if (pts[i].y !== pts[i - 1].y) ty.treden++; ty.grootsteHoogtestap = Math.max(ty.grootsteHoogtestap, stepH); }
    this.stats.paden = (this.stats.paden || 0) + 1; this.stats.punten = (this.stats.punten || 0) + pts.length; this.stats.nietBeloopbaar = (this.stats.nietBeloopbaar || 0) + bad; this.stats.grootsteStap = Math.max(this.stats.grootsteStap || 0, step); this.stats.grootsteHoogtestap = Math.max(this.stats.grootsteHoogtestap || 0, stepH);
    t.path = pts; t.pi = 0; t.state = 'lopen'; t.pathLen = pts.length; (t.paths || (t.paths = [])).push(pts); return true;
  }
  update(dt, player) {
    const tr = this.tr; let paths = 0;
    for (const t of this.list) {
      if (t.done) continue;
      const st = t.steps[t.i];
      if (t.state === 'zoekt pad') {
        if (paths++ >= 1) continue; // één zoekstukje per frame voor alle vanzelf verschenen reizigers samen
        const r = t.search.next(); if (!r.done) continue;
        t.search = null;
        if (!this.usePath(t, t.goal, r.value) && t.wanderStep) { t.done = true; t.state = 'aangekomen'; }
        continue;
      }
      if (t.state === 'start' || t.state === 'volgende') {
        if (!st) { t.done = true; t.state = 'aangekomen'; this.note(t, 'aangekomen', null); continue; }
        if (st.wander) { const a = (this.rr() * 6.283), r = st.wander * (0.5 + this.rr() * 0.5), q = this.nav.snap(t.x + Math.cos(a) * r, t.y, t.z + Math.sin(a) * r, 4); t.wanderStep = true; if (!q || !this.walkTo(t, q, t.auto ? AUTO_N : MAXN)) { t.done = true; t.state = 'aangekomen'; } continue; }
        if (st.walk) this.walkTo(t, st.walk, t.auto ? AUTO_N : MAXN);
        else if (st.ride) { const sp = st.ride.wait; if (sp) this.walkTo(t, sp, t.auto ? AUTO_N : MAXN); else t.state = 'wachten'; t.afterWalk = 'wachten'; }
        continue;
      }
      if (t.state === 'pauze') { if ((t.pauseT -= dt) <= 0) t.state = 'lopen'; continue; }
      if (t.state === 'lopen') {
        let rem = t.speed * dt;
        // toerist: om de zoveel meter even stilstaan en rondkijken
        if (t.prof.pause && (t.walked += rem) > t.prof.pause[0]) { t.walked = 0; t.state = 'pauze'; t.pauseT = t.prof.pause[1]; t.yaw += 1.2; this.typeStats(t.type).pauzes++; continue; }
        while (rem > 0 && t.pi < t.path.length) {
          const q = t.path[t.pi], dx = q.x - t.x, dz = q.z - t.z, d = Math.hypot(dx, dz);
          if (d <= rem) { t.x = q.x; t.z = q.z; t.y = q.y; rem -= d; t.pi++; } else { t.x += dx / d * rem; t.z += dz / d * rem; t.y = q.y; t.yaw = Math.atan2(dx, dz); rem = 0; }
        }
        if (t.pi >= t.path.length) {
          if (t.afterWalk === 'wachten') { t.afterWalk = null; t.state = 'wachten'; t.waitT = 0; this.note(t, 'wacht', { op: st.ride.board }); }
          else { t.i++; t.state = 'volgende'; }
        }
        continue;
      }
      if (t.state === 'wachten') {
        // het juiste voertuig: soort en lijn, deuren open, aan de halte van de reis en vlakbij
        const R = st.ride; t.waitT = (t.waitT || 0) + dt;
        // te lang gewacht: opgeven en weglopen (pendelaars sneller dan toeristen)
        if (t.auto && t.waitT > t.prof.maxWait) { this.typeStats(t.type).opgegeven++; this.note(t, 'opgegeven', { gewacht: Math.round(t.waitT) }); t.steps = [{ wander: 25 }]; t.i = 0; t.waitT = 0; t.state = 'volgende'; continue; }
        // richting: met `toward` alleen een voertuig dat die kant op rijdt (kop vóór de staart, gezien naar het doel)
        const ok = (a) => { if (!R.toward) return true; const h = tr.behind(a, 0, {}), e = tr.behind(a, a.L, {}); return (h.x - e.x) * (R.toward.x - h.x) + (h.z - e.z) * (R.toward.z - h.z) > 0; };
        const v = tr.agents.find(a => !a.dead && a.kind === R.kind && (!R.line || a.line === R.line) && doorsOpen(a) && a.atStop === R.board && (!R.dest || (a.trip && a.trip.dest === R.dest)) && Math.hypot(tr.behind(a, a.L / 2, {}).x - t.x, tr.behind(a, a.L / 2, {}).z - t.z) < a.L / 2 + 14 && ok(a));
        if (v && !tr.trips.full(v)) {
          // naar de dichtste deur: het dichtste punt op het voertuig, dan instappen
          const near = this.nearestOn(v, t); t.vehicle = v; t.state = 'instappen'; t.board = near; this.note(t, 'naar de deur', { voertuig: v.kind, lijn: v.line || null, rit: v.trip && v.trip.id });
        }
        continue;
      }
      if (t.state === 'instappen') {
        const v = t.vehicle, q = t.board, dx = q.x - t.x, dz = q.z - t.z, d = Math.hypot(dx, dz);
        if (!doorsOpen(v) || v.dead) { t.state = 'wachten'; t.vehicle = null; continue; } // deuren dicht: volgende
        if (d > 0.9) { const s = Math.min(d, t.speed * dt); t.x += dx / d * s; t.z += dz / d * s; t.yaw = Math.atan2(dx, dz); continue; }
        const voor = v.trip ? v.trip.occ : null; tr.trips.board(v, 1); if (!t.auto) v.riders = (v.riders || 0) + 1; else v.npc = (v.npc || 0) + 1; /* een geplande reis houdt het voertuig vast; met reizigers aan boord wordt het niet aan de halte uit dienst genomen */ t.state = 'aan boord'; t.boardStop = v.atStop; t.boardKey = v.lastStop; t.boardSeq = v.stopSeq || 0;
        { const ty = this.typeStats(t.type); ty.ingestapt++; ty.soorten[v.kind] = (ty.soorten[v.kind] || 0) + 1; }
        this.stats.ingestapt = (this.stats.ingestapt || 0) + 1; (this.stats.soorten || (this.stats.soorten = {}))[v.kind] = (this.stats.soorten[v.kind] || 0) + 1;
        this.note(t, 'ingestapt', { rit: v.trip && v.trip.id, bezettingVoor: voor, bezetting: v.trip && v.trip.occ, halte: v.atStop, lijn: v.line || null, afstandTotDeur: +d.toFixed(1) });
        continue;
      }
      if (t.state === 'aan boord') {
        const v = t.vehicle, R = st.ride;
        const h = tr.behind(v, Math.min(v.L - 1, Math.max(1, t.boardOff ?? v.L / 2)), {}); t.x = h.x; t.z = h.z; t.y = h.y + 1.1; // rijdt mee
        if (v.dead && t.auto) { t.state = 'uit beeld'; this.stats.uitBeeld = (this.stats.uitBeeld || 0) + 1; const w = (this.stats.uitBeeldWaarom || (this.stats.uitBeeldWaarom = {})); w[v.why || '?'] = (w[v.why || '?'] || 0) + 1; continue; } // rijdt buiten beeld verder mee (telt in de rit)
        if (v.dead) { t.state = 'gestrand'; this.note(t, 'voertuig weg', null); continue; }
        // uitstappen aan de halte van de reis ('*' = de eerstvolgende halte na het instappen)
        if (doorsOpen(v) && (R.alight === '*' ? (v.stopSeq || 0) > t.boardSeq : v.atStop === R.alight)) {
          const voor = v.trip ? v.trip.occ : null; tr.trips.alight(v, 1); if (!t.auto) v.riders = Math.max(0, (v.riders || 1) - 1); else v.npc = Math.max(0, (v.npc || 1) - 1);
          // aan de perronkant naast de deur uitstappen, op een beloopbare plek
          const pn = v.platN || [0, 0], out = this.nav.snap(h.x + pn[0] * 2.4, h.y + 1, h.z + pn[1] * 2.4, 4) || this.nav.snap(h.x, h.y + 1, h.z, 5);
          if (out) { t.x = out.x + 0.5; t.y = out.y; t.z = out.z + 0.5; }
          this.stats.uitgestapt = (this.stats.uitgestapt || 0) + 1; this.typeStats(t.type).uitgestapt++;
          this.note(t, 'uitgestapt', { rit: v.trip && v.trip.id, bezettingVoor: voor, bezetting: v.trip && v.trip.occ, halte: v.atStop, afstandTotDeur: +Math.hypot(t.x - h.x, t.z - h.z).toFixed(1) });
          t.vehicle = null; t.i++; t.state = 'volgende';
        }
      }
    }
    // tekenen: alleen wie loopt of wacht en dichtbij is
    let n = 0, na = 0;
    for (const t of this.list) {
      if (t.done || t.state === 'aan boord' || n >= 64 || Math.hypot(t.x - player.x, t.z - player.z) > 220) continue;
      this.q.setFromAxisAngle(this.up, t.yaw); this.v.set(t.x, t.y, t.z); this.m4.compose(this.v, this.q, this.one);
      for (const [m, col] of [[this.body, t.shirt], [this.legs, 0x22313f], [this.head, 0xe0ac69]]) { m.setMatrixAt(n, this.m4); m.setColorAt(n, this.c.setHex(col)); }
      const a = ACC[t.prof.acc];
      if (a && na < 64) { this.v2.set(a[3], a[4], a[5]).applyQuaternion(this.q).add(this.v); this.sc.set(a[0], a[1], a[2]); this.m4.compose(this.v2, this.q, this.sc); this.acc.setMatrixAt(na, this.m4); this.acc.setColorAt(na, this.c.setHex(a[6])); na++; }
      n++;
    }
    for (const m of [this.body, this.legs, this.head]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.acc.count = na; this.acc.instanceMatrix.needsUpdate = true; this.acc.instanceColor.needsUpdate = true;
  }
  // dichtste punt op de as van het voertuig (deur), en waar op het voertuig (afstand vanaf de kop)
  nearestOn(v, t) {
    let best = null;
    for (let s = 1; s < v.L; s += 1.5) { const h = this.tr.behind(v, s, {}), d = Math.hypot(h.x - t.x, h.z - t.z); if (!best || d < best.d) best = { x: h.x, z: h.z, d, s }; }
    t.boardOff = best.s; return best;
  }
}
