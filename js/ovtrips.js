// Gedeelde ritlaag voor het OV van de verkeerswerelden (Megatower City, Nova Metropool, echte steden):
// elk OV-voertuig (bus, tram, metro, trein uit js/traffic.js) hoort bij een rit met een vaste identiteit
// (lijn, ritnummer, eindhalte, capaciteit, bezetting, vertraging, volgende halte, toestand).
//
// Het verkeer rijdt alleen rond de speler (±430 m). Rijdt een voertuig uit dat gebied, dan verdwijnt het 3D-voertuig,
// maar de rit blijft bestaan als lichte simulatie ('buiten beeld': lijn, richting, bezetting en het moment). Komt er
// later op dezelfde lijn en in dezelfde richting een voertuig in beeld, dan neemt het die rit weer over (zelfde
// ritnummer, zelfde reizigers): een bus met 60 reizigers wordt dus niet leeg doordat hij even buiten beeld rijdt.
//
// Reizigers: zichtbare wachtenden aan bushaltes (js/buspax.js) stappen in en uit via board()/alight(); buiten het
// zichtbare gebied rekent stopLight() het in- en uitstappen per halte uit (volgens de periode van de dienstregeling).
export const CAPACITY = { busCity: 70, busElec: 70, busArtF: 110, busCoach: 50, busMini: 25, busDD: 90, busRegio: 60, bus: 60, tramCab: 0, tram: 180, metro: 600, train: 700 };
const LOAD = { spits: 0.55, dal: 0.28, avond: 0.18, nacht: 0.06 }; // gemiddelde bezetting per periode
const GHOST_MAX_AGE = 900; // s: zo lang blijft een rit buiten beeld bewaard

export function capacityOf(a) {
  if (a.kind === 'bus') return CAPACITY[a.secs?.[0]?.m] ?? CAPACITY.bus;
  if (a.kind === 'tram') return 30 * (a.secs?.length || 3) + 30;
  if (a.kind === 'metro') return 110 * (a.secs?.length || 4);
  if (a.kind === 'train') return 120 * (a.secs?.length || 5);
  return 0;
}
const isOV = (a) => a.kind === 'bus' || a.kind === 'tram' || a.kind === 'metro' || a.kind === 'train';

export class Trips {
  constructor() { this.seq = 0; this.trips = new Map(); this.ghosts = []; this.stats = { ritten: 0, hervat: 0, ingestapt: 0, uitgestapt: 0, bijgewerkt: 0 }; this.rnd = 99991; }
  r() { this.rnd = (this.rnd * 16807) % 2147483647; return this.rnd / 2147483647; }
  // nieuw OV-voertuig in beeld: een bewaarde rit van dezelfde lijn en richting overnemen, of een nieuwe rit
  assign(a, { clock, period, line, dir, dest }) {
    if (!isOV(a) || a.trip) return a.trip;
    const key = a.kind + '|' + (line || '?') + '|' + (dir ?? 0);
    // alleen ritten met een bekende lijn of eindhalte kunnen hervat worden (anders is niet zeker dat het dezelfde is);
    // de laatst uit beeld gereden rit eerst (die is het dichtst bij)
    let gi = -1; if (line) for (let i = this.ghosts.length - 1; i >= 0; i--) if (this.ghosts[i].key === key && clock - this.ghosts[i].t < GHOST_MAX_AGE) { gi = i; break; }
    let T;
    if (gi >= 0) { T = this.ghosts.splice(gi, 1)[0].trip; this.stats.hervat++; T.resumed = (T.resumed || 0) + 1; }
    else {
      const cap = capacityOf(a);
      T = { id: `${line || a.kind}-${String(++this.seq).padStart(3, '0')}`, kind: a.kind, line: line || null, dir: dir ?? 0, cap, occ: Math.round(cap * (LOAD[period] ?? 0.25) * (0.6 + 0.8 * this.r())), dest: dest || null, delay: 0, born: clock, served: 0 };
      this.stats.ritten++;
    }
    T.key = key; T.state = 'in dienst'; T.seen = clock; if (dest) T.dest = dest;
    this.trips.set(T.id, T); a.trip = T;
    return T;
  }
  // voertuig verdwijnt uit beeld: de rit blijft als lichte simulatie bestaan
  release(a, clock) {
    const T = a.trip; if (!T) return;
    T.state = 'buiten beeld'; T.seen = clock; T.x = a.hx; T.z = a.hz;
    this.ghosts.push({ key: T.key, trip: T, t: clock });
    a.trip = null;
  }
  // oude ritten buiten beeld opruimen (dienst afgelopen)
  prune(clock) {
    const old = this.ghosts.filter(g => clock - g.t >= GHOST_MAX_AGE);
    if (!old.length) return;
    this.ghosts = this.ghosts.filter(g => clock - g.t < GHOST_MAX_AGE);
    for (const g of old) { g.trip.state = 'einde dienst'; this.trips.delete(g.trip.id); }
  }
  board(a, n = 1) { const T = a.trip; if (!T) return 0; const k = Math.max(0, Math.min(n, T.cap - T.occ)); T.occ += k; this.stats.ingestapt += k; return k; }
  alight(a, n = 1) { const T = a.trip; if (!T) return 0; const k = Math.max(0, Math.min(n, T.occ)); T.occ -= k; this.stats.uitgestapt += k; return k; }
  full(a) { return !!a.trip && a.trip.occ >= a.trip.cap; }
  // halte buiten het zichtbare gebied: uitstappen (deel van de bezetting) en instappen (volgens de periode)
  stopLight(a, period, terminus) {
    const T = a.trip; if (!T) return;
    // zichtbare reizigers aan boord (js/travelers.js) stappen zelf uit: die blijven buiten deze telling
    const keep = (a.npc || 0) + (a.riders || 0), free = Math.max(0, T.occ - keep);
    const out = terminus ? free : Math.min(free, Math.round(T.occ * (0.12 + 0.18 * this.r())));
    this.alight(a, out);
    if (!terminus) this.board(a, Math.round(T.cap * (LOAD[period] ?? 0.25) * 0.18 * (0.5 + this.r())));
    T.served++; this.stats.bijgewerkt++;
  }
  list() { return [...this.trips.values()]; }
}
