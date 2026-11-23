// TERRANOVA 16 fase 5 — levende samenleving: bewoners met een eigen leven en een dagritme.
// Elke bewoner heeft een naam, leeftijd, beroep, een woning, een werk- of schoolplek, een winkel en een plek voor vrije
// tijd, allemaal echte percelen in de stad (woontorens, rijhuizen, villa's, kantoren, winkels, industrie, universiteit,
// ziekenhuis, luchthaven, parken). Per dag (werkdag of weekend) volgt een planning: slapen, ontbijt, naar het werk,
// werken, boodschappen, vrije tijd, naar huis. Ploegendiensten (vroeg, laat, nacht), studenten en gepensioneerden
// leven anders. Reistijd hangt af van de afstand.
// Wat ermee gebeurt: de reizigers die rond de speler verschijnen (js/travelers.js) zijn bewoners die op dat moment
// echt een verplaatsing hebben (van hun woning naar hun werk, enz.); hoeveel er op straat zijn volgt het uur; het
// scherm 'Bewoners' toont wie waar is en wat ze vandaag doen.
// Deterministisch: dezelfde stad en hetzelfde zaadgetal geven dezelfde bewoners.
const FIRST = ['Emma', 'Noah', 'Olivia', 'Liam', 'Louise', 'Arthur', 'Mila', 'Jules', 'Elena', 'Lucas', 'Nora', 'Finn', 'Lina', 'Adam', 'Julia', 'Mats', 'Anna', 'Vic', 'Fien', 'Wout',
  'Sofie', 'Bram', 'Lotte', 'Ruben', 'Hanne', 'Jonas', 'Ines', 'Senne', 'Amira', 'Youssef', 'Mei', 'Tariq', 'Zoë', 'Kobe', 'Ella', 'Lars', 'Yara', 'Milan', 'Saar', 'Daan'];
const LAST = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Martens', 'Hermans', 'Aerts',
  'Van Damme', 'El Amrani', 'Nguyen', 'Kowalski', 'Öztürk', 'De Vries', 'Vermeulen', 'Leclercq', 'Bakker', 'Smits', 'Verhoeven', 'Desmet', 'Cools', 'Pauwels', 'Segers'];
// beroepen: werkplek-soort, dienst (begin, einde in uren), kans
export const JOBS = {
  kantoor: { naam: 'kantoorbediende', plek: 'kantoor', dienst: [9, 17] },
  winkel: { naam: 'winkelmedewerker', plek: 'winkel', dienst: [10, 18] },
  zorg: { naam: 'verpleegkundige', plek: 'ziekenhuis', dienst: [7, 15], ploegen: true },
  industrie: { naam: 'operator', plek: 'industrie', dienst: [6, 14], ploegen: true },
  luchthaven: { naam: 'luchthavenmedewerker', plek: 'luchthaven', dienst: [5, 13], ploegen: true },
  horeca: { naam: 'kok', plek: 'hotel', dienst: [15, 23] },
  docent: { naam: 'docent', plek: 'universiteit', dienst: [8, 16] },
  student: { naam: 'student', plek: 'universiteit', dienst: [9, 16], student: true },
  gepensioneerd: { naam: 'gepensioneerd', plek: null, dienst: null },
};
const JOB_MIX = [['kantoor', 30], ['winkel', 12], ['zorg', 7], ['industrie', 8], ['luchthaven', 5], ['horeca', 6], ['docent', 3], ['student', 13], ['gepensioneerd', 16]];
export const ACTS = ['slapen', 'thuis', 'onderweg', 'werk', 'school', 'winkelen', 'vrije tijd'];
const DAY = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }
const pickW = (r, list) => { const tot = list.reduce((a, b) => a + b[1], 0); let x = r() * tot; for (const [k, w] of list) if ((x -= w) <= 0) return k; return list[0][0]; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// reistijd in uren: lopen tot 900 m, anders openbaar vervoer (± 18 km/u met wachten en overstappen) + 8 min
export function travelHours(a, b) { const d = dist(a, b); return d < 900 ? d / 1.35 / 3600 : d / 5 / 3600 + 8 / 60; }

export class Society {
  // places: { home:[{x,z,cap,name}], kantoor:[], winkel:[], ziekenhuis:[], industrie:[], luchthaven:[], hotel:[], universiteit:[], vrij:[] }
  constructor(places, { n = 4000, seed = 1616, zoneName = null } = {}) {
    this.places = places; this.zoneName = zoneName; this.seed = seed;
    const r = rng(seed * 7 + 11), P = places, near = (list, from, k = 8) => { // dichtbij een beetje waarschijnlijker
      let best = null, bd = 1e9; for (let i = 0; i < k; i++) { const c = list[Math.floor(r() * list.length)], d = dist(c, from) * (0.6 + r() * 0.8); if (d < bd) { bd = d; best = c; } } return best;
    };
    // woningen gewogen naar capaciteit
    const homes = P.home, cum = []; let tot = 0; for (const h of homes) cum.push(tot += h.cap || 1);
    const pickHome = () => { const x = r() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } return homes[lo]; };
    this.people = [];
    for (let i = 0; i < n && homes.length; i++) {
      let job = pickW(r, JOB_MIX), J = JOBS[job];
      if (J.plek && !(P[J.plek] && P[J.plek].length)) { job = 'kantoor'; J = JOBS.kantoor; }
      const home = pickHome(), age = job === 'student' ? 18 + Math.floor(r() * 7) : job === 'gepensioneerd' ? 66 + Math.floor(r() * 24) : 22 + Math.floor(r() * 44);
      const work = J.plek ? (J.plek === 'kantoor' || J.plek === 'winkel' ? near(P[J.plek], home, 6) : P[J.plek][Math.floor(r() * P[J.plek].length)]) : null;
      let shift = J.dienst ? [...J.dienst] : null;
      if (J.ploegen) { const s = r(); if (s < 0.3) shift = [shift[0] + 8, shift[1] + 8]; else if (s < 0.45) shift = [22, 30]; } // laat of nacht (30 = 6 u de volgende ochtend)
      if (shift && !J.ploegen) { const o = (r() - 0.5) * 2; shift = [shift[0] + o, shift[1] + o]; } // ± 1 uur, geleidelijk (geen golven op het halfuur)
      this.people.push({ id: i + 1, naam: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`, leeftijd: age, job, beroep: J.naam,
        home, work, shop: near(P.winkel.length ? P.winkel : homes, home, 5), vrij: P.vrij.length ? P.vrij[Math.floor(r() * P.vrij.length)] : home,
        shift, weekendWerk: !!J.ploegen && r() < 0.5, sport: r() < 0.35, uitgaan: age < 40 && r() < 0.4, r: r() });
    }
    this.planCache = new Map();
  }
  // dagplanning: [{ van, tot, act, at, naar }] in uren (0–24); 'onderweg' heeft van → naar
  plan(p, dow) {
    const key = p.id * 8 + dow; let pl = this.planCache.get(key); if (pl) return pl;
    const weekend = dow === 0 || dow === 6, out = [], push = (van, tot, act, at, naar) => { if (tot > van) out.push({ van, tot, act, at, naar }); };
    const trip = (t0, a, b) => { const h = travelHours(a, b); push(t0, t0 + h, 'onderweg', a, b); return t0 + h; };
    let t = 0, wake = 7 + p.r;
    const works = p.shift && p.work && (!weekend || p.weekendWerk);
    if (works && p.shift[0] >= 22) { // nachtdienst: van werk terug in de ochtend, overdag slapen, 's avonds weer weg
      const back = trip(p.shift[1] - 24, p.work, p.home); push(0, p.shift[1] - 24, 'werk', p.work); push(back, 15, 'slapen', p.home); push(15, 17, 'thuis', p.home);
      t = trip(17, p.home, p.shop); push(t, t + 0.75, 'winkelen', p.shop); t = trip(t + 0.75, p.shop, p.home);
      const go = p.shift[0] - travelHours(p.home, p.work); push(t, go, 'thuis', p.home); t = trip(go, p.home, p.work); push(t, 24, 'werk', p.work);
    } else if (works) {
      const go = p.shift[0] - travelHours(p.home, p.work);
      wake = Math.min(wake, go - 0.75);
      push(0, wake, 'slapen', p.home); push(wake, go, 'thuis', p.home);
      t = trip(go, p.home, p.work); push(t, p.shift[1], JOBS[p.job].student ? 'school' : 'werk', p.work);
      t = p.shift[1];
      if (p.shift[1] <= 19 && p.r < 0.55) { t = trip(t, p.work, p.shop); push(t, t + 0.6, 'winkelen', p.shop); t = trip(t + 0.6, p.shop, p.home); }
      else t = trip(t, p.work, p.home);
      if (t < 20 && (p.sport || p.uitgaan) && p.r > 0.3) { push(t, 19.5, 'thuis', p.home); t = trip(19.5, p.home, p.vrij); push(t, t + 1.5, 'vrije tijd', p.vrij); t = trip(t + 1.5, p.vrij, p.home); }
      const bed = Math.max(t + 0.5, 22.5 + p.r);
      push(t, Math.min(bed, 24), 'thuis', p.home); if (bed < 24) push(bed, 24, 'slapen', p.home);
    } else { // weekend, gepensioneerd of vrij
      wake = weekend ? 8.5 + p.r * 1.5 : 7.5 + p.r;
      const shopAt = 9.5 + p.r * 3, outAt = Math.max(13 + p.r * 3, shopAt + 2.5); // ieder op een eigen moment
      push(0, wake, 'slapen', p.home); push(wake, shopAt, 'thuis', p.home);
      t = trip(shopAt, p.home, p.shop); push(t, t + 1.2, 'winkelen', p.shop); t = trip(t + 1.2, p.shop, p.home);
      push(t, outAt, 'thuis', p.home); t = trip(outAt, p.home, p.vrij); push(t, t + 2.5, 'vrije tijd', p.vrij); t = trip(t + 2.5, p.vrij, p.home);
      if (p.uitgaan && weekend) { push(t, 20, 'thuis', p.home); t = trip(20, p.home, p.vrij); push(t, 23, 'vrije tijd', p.vrij); t = trip(23, p.vrij, p.home); }
      push(t, 23 + p.r * 0.5, 'thuis', p.home); push(23 + p.r * 0.5, 24, 'slapen', p.home);
    }
    pl = out.filter(s => s.tot > s.van).sort((a, b) => a.van - b.van);
    this.planCache.set(key, pl); if (this.planCache.size > 7 * this.people.length + 10) this.planCache.clear();
    return pl;
  }
  // waar is iemand nu en wat doet die
  state(p, hour, dow) {
    const pl = this.plan(p, dow), h = ((hour % 24) + 24) % 24;
    const s = pl.find(x => h >= x.van && h < x.tot) || pl[pl.length - 1];
    if (s.act !== 'onderweg') return { act: s.act, x: s.at.x, z: s.at.z, at: s.at, tot: s.tot };
    const k = (h - s.van) / Math.max(1e-6, s.tot - s.van);
    return { act: 'onderweg', x: s.at.x + (s.naar.x - s.at.x) * k, z: s.at.z + (s.naar.z - s.at.z) * k, van: s.at, naar: s.naar, doel: this.purpose(pl, s), tot: s.tot };
  }
  purpose(pl, s) { let i = pl.indexOf(s); if (i < 0) i = pl.findIndex(x => x.act === s.act && Math.abs(x.van - s.van) < 1e-6); const nxt = i < 0 ? null : pl[i + 1]; return nxt ? ({ werk: 'naar het werk', school: 'naar school', winkelen: 'boodschappen doen', 'vrije tijd': 'vrije tijd', thuis: 'naar huis', slapen: 'naar huis' }[nxt.act] || 'onderweg') : 'naar huis'; }
  // telling per activiteit op een uur
  census(hour, dow) { const c = Object.fromEntries(ACTS.map(a => [a, 0])); for (const p of this.people) c[this.state(p, hour, dow).act]++; return c; }
  // verloop over een dag (per half uur): hoeveel mensen onderweg
  dayCurve(dow, step = 0.25) { const q = this.quarterCurve(dow), out = []; for (let h = 0; h < 24; h += step) out.push({ h, onderweg: q[Math.floor(h * 4) % 96] }); return out; }
  // een verplaatsing die rond dit moment begint of eindigt in de buurt van de speler (voor js/travelers.js)
  // exclude: bewoners die al als reiziger op pad zijn (iemand kan maar op één plek tegelijk zijn)
  pickTrip(pos, hour, dow, rnd = Math.random, { min = 60, max = 400, window = 0.35, exclude = null, outOdds = 0.6 } = {}) {
    const cand = [], idx = this.tripIndex(dow);
    for (let q = Math.floor((hour - window) * 4); q <= Math.floor((hour + window) * 4); q++) {
      for (const { p, s } of idx.get(((q % 96) + 96) % 96) || []) {
        if (exclude && exclude.has(p.id)) continue;
        const dt = ((hour - s.van) % 24 + 24) % 24;
        if (dt > window && dt < 24 - window) continue; // begint niet binnen ± window uur
        const dOut = dist(s.at, pos), dIn = dist(s.naar, pos);
        if (dOut >= min && dOut <= max) cand.push({ p, s, inbound: false });
        else if (dIn >= min && dIn <= max && travelHours(s.at, s.naar) > 0.2) cand.push({ p, s, inbound: true });
      }
    }
    if (!cand.length) return null;
    // zoals vroeger (js/travelers.js): 60 % vertrekt hier, 40 % komt hier aan (als er van beide zijn)
    const outs = cand.filter(c => !c.inbound), ins = cand.filter(c => c.inbound), from = outs.length && (!ins.length || rnd() < outOdds) ? outs : ins;
    const c = from[Math.floor(rnd() * from.length)], pl = this.plan(c.p, dow);
    return { who: c.p, from: { x: c.s.at.x, z: c.s.at.z, name: c.s.at.name || 'Vertrek' }, dest: { x: c.s.naar.x, z: c.s.naar.z, name: c.s.naar.name || 'Bestemming' }, inbound: c.inbound, doel: this.purpose(pl, c.s), kandidaten: cand.length };
  }
  // alle verplaatsingen van een dag, per kwartier van vertrek (snel zoeken)
  tripIndex(dow) {
    this.tidx = this.tidx || new Map(); let m = this.tidx.get(dow); if (m) return m;
    m = new Map();
    for (const p of this.people) for (const s of this.plan(p, dow)) if (s.act === 'onderweg') { const q = ((Math.floor(s.van * 4) % 96) + 96) % 96; let l = m.get(q); if (!l) m.set(q, l = []); l.push({ p, s }); }
    this.tidx.set(dow, m); return m;
  }
  // drukte op straat t.o.v. het daggemiddelde (spits > 1, nacht < 1)
  busyFactor(hour, dow) {
    const q = this.quarterCurve(dow), avg = q.reduce((a, b) => a + b, 0) / 96;
    return Math.max(0.15, Math.min(3, q[((Math.floor(hour * 4) % 96) + 96) % 96] / Math.max(1, avg)));
  }
  // aantal mensen onderweg per kwartier (uit de index: elke verplaatsing telt in de kwartieren die ze overspant)
  quarterCurve(dow) {
    this.qc = this.qc || new Map(); let c = this.qc.get(dow); if (c) return c;
    c = new Array(96).fill(0);
    for (const l of this.tripIndex(dow).values()) for (const { s } of l) for (let k = Math.floor(s.van * 4); k < Math.ceil(s.tot * 4); k++) c[((k % 96) + 96) % 96]++;
    this.qc.set(dow, c); return c;
  }
  dayName(dow) { return DAY[dow]; }
}
// plekken in Megatower City: uit de echte percelen (js/megacity.js lotDesc) en de bekende gebieden
export function megaPlaces(M) {
  const P = { home: [], kantoor: [], winkel: [], ziekenhuis: [], industrie: [], luchthaven: [], hotel: [], universiteit: [], vrij: [] };
  const N = M.TILES * 2;
  for (let qz = 0; qz < N; qz++) for (let qx = 0; qx < N; qx++) {
    const tx = qx >> 1, tz = qz >> 1, lm = M.landmark(tx, tz);
    const x = tx * 128 + (qx & 1 ? 92 : 36), z = tz * 128 + (qz & 1 ? 92 : 36);
    if (lm) {
      if (lm.id === 'industry') P.industrie.push({ x, z, name: lm.name });
      else if (lm.id === 'uni') P.universiteit.push({ x, z, name: lm.name });
      else if (lm.id === 'airport') { if ((qx + qz) % 3 === 0) P.luchthaven.push({ x, z, name: lm.name }); }
      else if (lm.id === 'park' || lm.id === 'stadium' || lm.id === 'towerplaza') P.vrij.push({ x, z, name: lm.name });
      continue;
    }
    const L = M.lotDesc(qx, qz); if (!L || !L.type) continue;
    const t = L.type;
    if (t === 'tower') {
      const fl = Math.max(4, Math.round((L.h || 60) / 4));
      if (L.use === 'wonen') P.home.push({ x, z, cap: fl * 6 }); else if (L.use === 'hotel') P.hotel.push({ x, z }); else P.kantoor.push({ x, z });
    } else if (t === 'block') { P.home.push({ x, z, cap: Math.round((L.h || 18) / 3) * 4 }); if (L.r2 < 0.3) P.winkel.push({ x, z }); }
    else if (t === 'rows' || t === 'houses' || t === 'villa') P.home.push({ x, z, cap: t === 'rows' ? 8 : 2 });
    else if (t === 'super' || t === 'shops') P.winkel.push({ x, z });
    else if (t === 'hall' || t === 'tanks' || t === 'warehouse') P.industrie.push({ x, z });
    else if (t === 'plaza' || t === 'green') P.vrij.push({ x, z });
  }
  for (const [n, x, z] of M.PLACES || []) { if (/Ziekenhuis/.test(n)) P.ziekenhuis.push({ x, z, name: n }); if (/Winkelcentrum/.test(n)) P.winkel.push({ x, z, name: n }); if (/Park|Stadion/.test(n)) P.vrij.push({ x, z, name: n }); }
  return P;
}
