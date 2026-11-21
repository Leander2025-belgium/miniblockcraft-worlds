// Carrièremodus (TERRANOVA 15): diensten als trein-, bus-, metro- of trambestuurder en bouwopdrachten, met ervaring,
// levels, beoordelingen, prestaties en een geschiedenis. Vrijwillig: zonder dienst of opdracht blijft alles sandbox.
//
// Diensten gebruiken de echte bestuurderssystemen en meten wat er echt gebeurt:
//   trein (Greenisland, Alpen; js/rail.js)  stations bedienen (deuren open aan het perron), stiptheid t.o.v. de
//                                           dienstregeling, stopplaats, snelheidsbeperkingen, automatische remming
//                                           (sein op rood / te snel), noodrem, comfort (versnelling)
//   bus (verkeerswerelden; js/drive.js)     haltes bedienen, rode lichten, snelheid (50 km/h), deuren alleen aan de
//                                           halte, comfort, tijd tussen haltes
//   metro en tram (js/drive.js, spoor)      haltes bedienen (deuren aan de halte), snelheid, comfort
// Bouwopdrachten kijken naar de blokken die de speler zelf geplaatst heeft (niet naar een teller): een woning moet
// een dichte ruimte met deur, ramen en dak zijn, een bushalte een bank onder een dak met een paal naast een weg, enz.
// Opslag: localStorage 'terranova-career' (nieuwe sleutel; bestaande sleutels en savegames blijven onaangeroerd).
import { B } from './blocks.js';

const KEY = 'terranova-career', PLACED_KEY = 'terranova-career-placed';
export const LEVELS = [0, 150, 400, 800, 1400, 2200, 3300, 4800, 6800, 9500];
export const levelOf = (xp) => { let l = 0; while (l + 1 < LEVELS.length && xp >= LEVELS[l + 1]) l++; return l + 1; };
const stars = (score) => score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- bouwopdrachten: controle op echt geplaatste blokken ----------
const FURN = { bed: [B.BED, B.BED_BLUE], seat: [B.CHAIR, B.CHAIR_RED, B.SOFA, B.SOFA_LEATHER], table: [B.TABLE], light: [B.LAMP], tv: [B.TV, B.TV_ON] };
const GREEN = new Set([B.GRASS, B.LEAVES, B.HEDGE, B.FLOWERS, B.BIRCH_LEAVES, B.PINE_LEAVES, B.PLANTER]);
const PAVE = new Set([B.COBBLE, B.TILE, B.MARBLE, B.SIDEWALK, B.GRANITE, B.ASHLAR]);
const BENCH = new Set([B.PLANKS, B.DARK_PLANKS, B.CHAIR, B.SOFA]);
const ROADS = new Set([B.ASPHALT, B.LINE_WHITE, B.BUS_LANE]);
const DOORS = new Set([B.DOOR, B.DOOR_GLASS, B.DOOR_OPEN, B.DOOR_SHUT]);
export const TASKS = [
  { id: 'woning', name: 'Bouw een woning', level: 1, xp: 120, desc: 'Een dichte ruimte van minstens 12 m² met een deur, minstens 2 ramen en een dak.' },
  { id: 'bushalte', name: 'Bouw een bushalte', level: 1, xp: 80, desc: 'Een bank onder een dak, een paal of bord ernaast, binnen 20 m van een weg.' },
  { id: 'park', name: 'Maak een park', level: 2, xp: 100, desc: 'Minstens 30 groene blokken (gras, haag, bloemen, bladeren), 2 bomen (stam met bladeren) en een bank.' },
  { id: 'appartement', name: 'Richt een appartement in', level: 2, xp: 120, desc: 'In een dichte ruimte: een bed, een tafel, een stoel of bank en een lamp.' },
  { id: 'plein', name: 'Werk een stadsplein af', level: 3, xp: 160, desc: 'Minstens 80 m² bestrating, een fontein (water), 2 banken, 2 lampen en 2 bomen.' },
  { id: 'station', name: 'Bouw een station', level: 4, xp: 220, desc: 'Een overdekt perron van minstens 30 m² met een ticketautomaat, een bord en 2 banken.' },
];
// zoekgebied rond de speler, alleen blokken die de speler zelf zette
function region(career, p, r = 24, h = 14) {
  const out = []; const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
  for (const k of career.placed) {
    const [x, y, z] = k.split(',').map(Number);
    if (Math.abs(x - x0) <= r && Math.abs(z - z0) <= r && Math.abs(y - y0) <= h) out.push({ x, y, z, b: career.g.world.get(x, y, z) });
  }
  return out.filter(q => q.b); // nog aanwezig
}
// dichte ruimtes: lucht op vloerhoogte (vaste grond eronder) die ingesloten is door muren (geen ontsnapping binnen 14 m)
function rooms(get, solid, blocks) {
  const seen = new Set(), res = [];
  const cand = new Set();
  for (const q of blocks) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) {
    const x = q.x + dx, y = q.y + dy, z = q.z + dz; if (!solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z)) cand.add(x + ',' + y + ',' + z);
  }
  for (const k of cand) {
    if (seen.has(k)) continue;
    const [sx, sy, sz] = k.split(',').map(Number), cells = [], st = [[sx, sz]], loc = new Set([sx + ',' + sz]); let open = false;
    while (st.length && cells.length < 400) {
      const [x, z] = st.pop(); cells.push([x, z]); seen.add(x + ',' + sy + ',' + z);
      if (Math.abs(x - sx) > 14 || Math.abs(z - sz) > 14) { open = true; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, nk = nx + ',' + nz; if (loc.has(nk)) continue;
        if (solid(nx, sy, nz) || DOORS.has(get(nx, sy, nz))) continue; // muur of deur
        if (!solid(nx, sy - 1, nz)) { open = true; break; } // geen vloer: geen dichte ruimte
        loc.add(nk); st.push([nx, nz]);
      }
      if (open) break;
    }
    if (open || cells.length >= 400) continue;
    // dak: boven elke vloerplek binnen 8 m een vast blok
    const roofed = cells.filter(([x, z]) => { for (let y = sy + 2; y <= sy + 8; y++) if (solid(x, y, z)) return true; return false; }).length;
    // deur en ramen in de rand
    let doors = 0, windows = 0; const edge = new Set();
    for (const [x, z] of cells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (loc.has(nx + ',' + nz)) continue; for (const y of [sy, sy + 1, sy + 2]) { const kk = nx + ',' + y + ',' + nz; if (edge.has(kk)) continue; edge.add(kk); const b = get(nx, y, nz); if (DOORS.has(b)) doors++; else if (b === B.GLASS || b === B.GLASS_BLUE || b === B.GLASS_GREEN || b === B.DARKGLASS) windows++; } }
    res.push({ y: sy, area: cells.length, roofed: roofed / cells.length, doors, windows, cells });
  }
  return res;
}
export function checkTask(career, id) {
  const g = career.g, w = g.world, get = (x, y, z) => w.get(x, y, z), solid = (x, y, z) => w.solidAt(x, y, z);
  const P = region(career, g.player.pos), n = (set) => P.filter(q => set.has(q.b)).length, has = (ids, min = 1) => P.filter(q => ids.includes(q.b)).length >= min;
  const trees = P.filter(q => q.b === B.LOG || q.b === B.BIRCH_LOG).filter(q => [1, 2, 3].some(dy => GREEN.has(get(q.x, q.y + dy, q.z)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => GREEN.has(get(q.x + dx, q.y + dy, q.z + dz))))).length;
  const R = { id, geplaatst: P.length, ok: false, waarom: [] };
  const need = (cond, msg) => { if (!cond) R.waarom.push(msg); return cond; };
  if (id === 'woning' || id === 'appartement') {
    const rs = rooms(get, solid, P), best = rs.sort((a, b) => b.area - a.area)[0];
    R.ruimte = best ? { m2: best.area, dak: Math.round(best.roofed * 100) + '%', deuren: best.doors, ramen: best.windows } : null;
    if (!need(best && best.area >= 12, 'geen dichte ruimte van minstens 12 m² gevonden (muren rondom, vloer)')) return R;
    need(best.roofed >= 0.8, 'het dak bedekt minder dan 80 % van de vloer');
    if (id === 'woning') { need(best.doors >= 1, 'geen deur in de muur'); need(best.windows >= 2, 'minder dan 2 ramen'); }
    else {
      // meubels zijn vaste blokken (de ruimtezoeker ziet ze als muur): in de kamer = op of naast een vloerplek van de kamer
      const inside = (q) => best.cells.some(([x, z]) => Math.abs(x - q.x) + Math.abs(z - q.z) <= 1) && q.y >= best.y && q.y <= best.y + 3;
      const inRoom = (ids) => P.some(q => ids.includes(q.b) && inside(q));
      need(inRoom(FURN.bed), 'geen bed in de ruimte'); need(inRoom(FURN.table), 'geen tafel'); need(inRoom(FURN.seat), 'geen stoel of bank'); need(P.some(q => q.b === B.LAMP && best.cells.some(([x, z]) => x === q.x && z === q.z)), 'geen lamp');
    }
  } else if (id === 'bushalte') {
    const bench = P.find(q => BENCH.has(q.b) && [2, 3, 4].some(dy => solid(q.x, q.y + dy, q.z)));
    need(bench, 'geen bank met een dak erboven');
    need(P.some(q => (q.b === B.POST || q.b === B.SIGN) && bench && Math.hypot(q.x - bench.x, q.z - bench.z) < 6), 'geen paal of bord naast de bank');
    let road = false; if (bench) for (let dz = -20; dz <= 20 && !road; dz += 2) for (let dx = -20; dx <= 20 && !road; dx += 2) for (let dy = -2; dy <= 1; dy++) if (ROADS.has(get(bench.x + dx, bench.y + dy - 1, bench.z + dz))) { road = true; break; }
    need(road, 'geen weg binnen 20 m');
  } else if (id === 'park') {
    need(n(GREEN) >= 30, `${n(GREEN)} van 30 groene blokken`); need(trees >= 2, `${trees} van 2 bomen (stam met bladeren)`); need(P.some(q => BENCH.has(q.b)), 'geen bank');
  } else if (id === 'plein') {
    need(n(PAVE) >= 80, `${n(PAVE)} van 80 m² bestrating`); need(P.some(q => q.b === B.WATER), 'geen fontein (water)'); need(n(BENCH) >= 2, 'minder dan 2 banken');
    need(n(new Set([B.LAMP])) >= 2, 'minder dan 2 lampen'); need(trees >= 2, `${trees} van 2 bomen`);
  } else if (id === 'station') {
    const floor = P.filter(q => PAVE.has(q.b) || q.b === B.CONCRETE || q.b === B.LINE_YELLOW), covered = floor.filter(q => [3, 4, 5, 6].some(dy => solid(q.x, q.y + dy, q.z)));
    need(covered.length >= 30, `${covered.length} van 30 m² overdekt perron`); need(has([B.TICKET]), 'geen ticketautomaat'); need(has([B.SIGN]), 'geen bord'); need(n(BENCH) >= 2, 'minder dan 2 banken');
  }
  R.ok = R.waarom.length === 0;
  return R;
}

// ---------- diensten ----------
class Shift {
  constructor(career, kind, title) { this.c = career; this.g = career.g; this.kind = kind; this.title = title; this.t = 0; this.pen = []; this.served = []; this.harsh = 0; this.overT = 0; this.lastV = null; this.harshT = 0; }
  penalty(what, pts) { this.pen.push({ wat: what, punten: pts, t: Math.round(this.t) }); }
  comfort(v, dt, lim = 1.3) { if (this.lastV !== null && dt > 0) { const acc = (v - this.lastV) / dt; this.harshT -= dt; if (Math.abs(acc) > lim && this.harshT <= 0) { this.harsh++; this.harshT = 3; } } this.lastV = v; }
  score() {
    let s = 100 - this.pen.reduce((a, p) => a + p.punten, 0) - Math.min(30, this.harsh * 3) - Math.min(30, Math.round(this.overT * 2));
    return clamp(Math.round(s), 0, 100);
  }
  summary() { return { soort: this.kind, titel: this.title, duur: Math.round(this.t), bediend: this.served.length, haltes: this.served, comfort: this.harsh, teSnel_s: Math.round(this.overT), straf: this.pen }; }
}
class TrainShift extends Shift {
  constructor(career, rail, n = 3) {
    super(career, 'trein', 'Treinbestuurder'); this.rail = rail; const pt = rail.player;
    this.targets = pt.L.stations.filter(q => (q.s - pt.s) * pt.dir > 30).sort((a, b) => (a.s - b.s) * pt.dir).slice(0, n);
    this.title = `Treindienst ${pt.tr.name || pt.id}: ${this.targets.map(t => t.name).join(' → ')}`;
    this.L = pt.L; this.wasAtp = false; this.wasEm = false;
  }
  update(dt) {
    const pt = this.rail.player; if (!pt) return 'afgebroken';
    this.t += dt; this.comfort(pt.v, dt, 1.25);
    if (pt.lim && pt.v > pt.lim * 1.05 + 0.5) this.overT += dt;
    if (pt.atpWarn && !this.wasAtp) this.penalty('automatische remming (sein op rood of te snel)', 10); this.wasAtp = !!pt.atpWarn;
    if (pt.emergency && !this.wasEm && pt.v > 1) this.penalty('noodrem', 15); this.wasEm = !!pt.emergency;
    const T = this.targets[this.served.length];
    if (!T) return 'klaar';
    if (pt.L !== this.L) { this.L = pt.L; } // over een wissel: de doelstations blijven, zoek ze op naam
    if (pt.atStation && pt.atStation.name === T.name && pt.doors && !this.doorsAt) {
      this.doorsAt = T.name;
      const err = Math.abs(pt.s - pt.atStation.s), sa = this.c.schedArrival ? this.c.schedArrival(pt, pt.atStation) : null, now = this.c.clock();
      const late = sa != null ? Math.round((now - sa) / 60) : null;
      if (late != null && Math.abs(late) > 1) this.penalty(`${late > 0 ? '+' : ''}${late} min t.o.v. de dienstregeling in ${T.name}`, Math.min(20, (Math.abs(late) - 1) * 4));
      if (err > pt.atStation.len / 2 - 10) this.penalty(`slecht gestopt in ${T.name} (${Math.round(err)} m van het midden)`, 8);
      this.served.push({ halte: T.name, minutenTeLaat: late, stopfout_m: Math.round(err) });
    }
    if (this.doorsAt && !pt.doors) this.doorsAt = null;
    return this.served.length >= this.targets.length ? 'klaar' : null;
  }
}
class RoadShift extends Shift {
  // bus, metro of tram (js/drive.js): bediende haltes, snelheid, rode lichten (bus), deuren alleen aan een halte
  constructor(career, drive, kind, n = 4) {
    super(career, kind, kind === 'bus' ? 'Buschauffeur' : kind === 'metro' ? 'Metrobestuurder' : 'Trambestuurder');
    this.d = drive; this.n = n; this.reds0 = drive.reds || 0; this.lastServed = drive.served || null; this.lastAt = null; this.limit = { bus: 50, metro: 80, tram: 50 }[kind] / 3.6;
    this.title += ` · bedien ${n} haltes`; this.prevStopPos = null; this.legT = 0; this.wasDoors = false;
  }
  update(dt) {
    const d = this.g.drive; if (!d || d !== this.d) return 'afgebroken';
    this.t += dt; this.legT += dt;
    const bus = this.kind === 'bus', v = bus ? Math.abs(d.car.speed) : (d.a.v || 0);
    this.comfort(v, dt, bus ? 2.0 : 1.4);
    if (v > this.limit * 1.08) this.overT += dt;
    if (bus && (d.reds || 0) > this.reds0) { this.reds0 = d.reds; this.penalty('door het rode licht', 15); }
    const doors = bus ? !!d.car.doorsOpen : !!(d.a.player && d.a.player.doors);
    const stop = bus ? (d.stop && d.stop.d < 25 ? d.stop : null) : d.atStop;
    if (doors && !this.wasDoors) {
      if (!stop) this.penalty('deuren open buiten een halte', 5);
      else if (stop.key !== this.lastAt) {
        this.lastAt = stop.key;
        // tijd sinds de vorige halte t.o.v. een vlotte rit (25 km/h gemiddeld + 20 s haltetijd), alleen ter info/straf bij veel te laat
        const pos = this.g.player.pos, dist = this.prevStopPos ? Math.hypot(pos.x - this.prevStopPos.x, pos.z - this.prevStopPos.z) : null;
        const expect = dist != null ? dist / 6.9 + 20 : null, extra = expect != null ? Math.round(this.legT - expect) : null;
        if (extra != null && extra > 90) this.penalty(`${Math.round(extra / 60)} min trager dan de rijtijd naar ${stop.name}`, Math.min(12, Math.round(extra / 30)));
        this.served.push({ halte: stop.name, rijtijd_s: Math.round(this.legT), verwacht_s: expect != null ? Math.round(expect) : null });
        this.prevStopPos = { x: pos.x, z: pos.z }; this.legT = 0;
      }
    }
    this.wasDoors = doors;
    return this.served.length >= this.n ? 'klaar' : null;
  }
}

export class Career {
  constructor(game) {
    this.g = game; this.shift = null; this.placed = new Set(); this.hudEl = null;
    try { this.p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { this.p = null; }
    if (!this.p || typeof this.p !== 'object') this.p = { xp: 0, history: [], tasks: {}, achievements: [], v: 1 };
    try { for (const k of JSON.parse(localStorage.getItem(PLACED_KEY) || '[]')) this.placed.add(k); } catch { /* leeg */ }
  }
  get level() { return levelOf(this.p.xp); }
  clock() { return (Date.now() / 1000 - new Date().getTimezoneOffset() * 60) % 86400; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.p)); localStorage.setItem(PLACED_KEY, JSON.stringify([...this.placed].slice(-6000))); } catch { /* geen opslag */ } }
  // geplaatste en gebroken blokken (js/game.js)
  onPlace(x, y, z) { this.placed.add(x + ',' + y + ',' + z); if (this.placed.size > 6500) { const it = this.placed.values(); for (let i = 0; i < 500; i++) this.placed.delete(it.next().value); } this.dirty = true; }
  onBreak(x, y, z) { this.placed.delete(x + ',' + y + ',' + z); this.dirty = true; }
  award(xp, why) {
    const before = this.level; this.p.xp += xp;
    if (this.level > before) { this.g.toast?.(`⭐ Level ${this.level}! Nieuwe opdrachten vrijgespeeld.`); this.achieve('level' + this.level, `Level ${this.level}`); }
    this.save(); return xp;
  }
  achieve(id, name) { if (this.p.achievements.some(a => a.id === id)) return; this.p.achievements.push({ id, name, date: new Date().toISOString().slice(0, 10) }); this.g.toast?.(`🏅 Prestatie: ${name}`); }
  // welke dienst kan er nu? (bestuurder van een trein, bus, metro of tram)
  available() {
    const g = this.g, rail = g.alpRail, d = g.drive;
    if (rail && rail.player) return { kind: 'trein', label: '🚆 Start treindienst (volgende 3 stations)' };
    if (d && d.mode === 'drive' && d.bus) return { kind: 'bus', label: '🚌 Start busdienst (4 haltes)' };
    if (d && d.mode === 'drive' && d.rail && d.a) return { kind: d.a.kind === 'metro' ? 'metro' : 'tram', label: d.a.kind === 'metro' ? '🚇 Start metrodienst (4 haltes)' : '🚊 Start tramdienst (4 haltes)' };
    return null;
  }
  startShift() {
    const a = this.available(); if (!a || this.shift) return null;
    if (a.kind === 'trein') { const s = new TrainShift(this, this.g.alpRail); if (!s.targets.length) { this.g.toast?.('Geen stations meer voor je op deze lijn'); return null; } this.shift = s; }
    else this.shift = new RoadShift(this, this.g.drive, a.kind);
    this.g.toast?.(`📋 Dienst gestart: ${this.shift.title}`); return this.shift;
  }
  endShift(state) {
    const s = this.shift; if (!s) return null; this.shift = null;
    const score = state === 'klaar' ? s.score() : Math.min(s.score(), 30), st = stars(score);
    const xp = state === 'klaar' ? Math.round(score * (1 + s.served.length) / 2) : Math.round(s.served.length * 10);
    const rec = { ...s.summary(), resultaat: state, score, sterren: st, xp, datum: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    this.p.history.unshift(rec); this.p.history.length = Math.min(this.p.history.length, 40);
    this.award(xp, 'dienst');
    if (state === 'klaar') { this.achieve('eerste-' + s.kind, `Eerste ${s.kind}dienst`); if (st === 5) this.achieve('vijfsterren', 'Vijf sterren'); if (!s.pen.some(p => /noodrem/.test(p.wat))) this.achieve('zachtjes-' + s.kind, `Dienst zonder noodrem (${s.kind})`); }
    this.save();
    this.g.toast?.(state === 'klaar' ? `✅ Dienst klaar: ${score}/100 · ${'★'.repeat(st)}${'☆'.repeat(5 - st)} · +${xp} XP` : `⏹ Dienst afgebroken · +${xp} XP`);
    return rec;
  }
  // bouwopdracht controleren en, als hij klopt, belonen (één keer)
  check(id) {
    const T = TASKS.find(t => t.id === id); if (!T) return null;
    if (this.level < T.level) return { id, ok: false, waarom: [`vrij vanaf level ${T.level}`] };
    const r = checkTask(this, id);
    if (r.ok && !this.p.tasks[id]) { this.p.tasks[id] = { date: new Date().toISOString().slice(0, 10), xp: T.xp }; this.award(T.xp, id); this.achieve('bouw-' + id, T.name); if (TASKS.every(t => this.p.tasks[t.id])) this.achieve('bouwmeester', 'Bouwmeester: alle bouwopdrachten'); this.save(); }
    return r;
  }
  update(dt) {
    if (this.dirty && (this.saveT = (this.saveT || 0) + dt) > 5) { this.saveT = 0; this.dirty = false; this.save(); }
    if (this.shift) { const st = this.shift.update(dt); if (st) this.endShift(st); }
    this.renderHud();
  }
  renderHud() {
    const el = this.hudEl || (this.hudEl = document.getElementById('career-hud')); if (!el) return;
    const s = this.shift;
    if (!s) { if (!el.hidden) el.hidden = true; return; }
    const n = s.targets ? s.targets.length : s.n, next = s.targets ? s.targets[s.served.length]?.name : null;
    const txt = `📋 ${s.title} · ${s.served.length}/${n} bediend${next ? ` · volgende: ${next}` : ''} · score nu ${s.score()}`;
    if (el.textContent !== txt) el.textContent = txt; el.hidden = false;
  }
  html() {
    const p = this.p, L = this.level, next = LEVELS[L] ?? null, prev = LEVELS[L - 1] ?? 0, a = this.available();
    const bar = next ? Math.round(100 * (p.xp - prev) / (next - prev)) : 100, esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return `<div><b>Level ${L}</b> · ${p.xp} XP${next ? ` · nog ${next - p.xp} XP tot level ${L + 1}` : ' · hoogste level'}<div class="cr-bar"><i style="width:${bar}%"></i></div></div>
      <h4>Diensten</h4><div class="small">${this.shift ? `Bezig: ${esc(this.shift.title)}` : a ? 'Je zit aan het stuur: je kunt een dienst starten.' : 'Ga in de cabine van een trein (Greenisland, Alpen) of bestuur een bus, metro of tram om een dienst te starten.'}</div>
      <div class="row">${a && !this.shift ? `<button class="btn primary" data-cr="start">${a.label}</button>` : ''}${this.shift ? '<button class="btn" data-cr="stop">⏹ Dienst stoppen</button>' : ''}</div>
      <h4>Bouwopdrachten <span class="small muted">(gecontroleerd op wat je zelf bouwt, binnen 24 m van je)</span></h4>
      ${TASKS.map(t => `<div class="cr-task"><b>${p.tasks[t.id] ? '✅' : L < t.level ? '🔒' : '🔨'} ${esc(t.name)}</b> <span class="muted small">level ${t.level} · ${t.xp} XP</span><br><span class="small">${esc(t.desc)}</span>${L >= t.level && !p.tasks[t.id] ? ` <button class="btn small" data-cr="check:${t.id}">Controleer</button>` : ''}<div class="small cr-res" id="cr-res-${t.id}"></div></div>`).join('')}
      <h4>Prestaties</h4><div class="small">${p.achievements.length ? p.achievements.map(x => `🏅 ${esc(x.name)}`).join(' · ') : 'Nog geen.'}</div>
      <h4>Geschiedenis</h4><div class="small">${p.history.length ? p.history.slice(0, 8).map(h => `${esc(h.datum)} · ${esc(h.titel)} · ${h.resultaat === 'klaar' ? `${h.score}/100 ${'★'.repeat(h.sterren)}` : 'afgebroken'} · +${h.xp} XP`).join('<br>') : 'Nog geen diensten.'}</div>`;
  }
}
