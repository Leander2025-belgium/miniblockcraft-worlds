// Remises (TERRANOVA 14.1): opstelterreinen voor treinstellen naast de lijn, buiten de bebouwing, vlak bij een
// eindstation. Een remise heeft 4 opstelsporen (240 m) onder een hal; een S-bocht (keel) verbindt ze met het
// vertrekspoor van de lijn. De wereldgenerator legt ballast en bouwt de hal (js/greenisland.js), de dienstregeling
// (js/rail.js) parkeert er de treinstellen die niet rijden en laat ze uit- en inrukken:
//   uitrukken: van het opstelspoor over de keel, tegen de rijrichting op het aankomstspoor naar het eindstation,
//              en over de stationswissel naar het vertrekperron (vóór de eerste rit die geen keerrit is);
//   inrukken:  na een aankomst zonder vervolgrit over de stationswissel naar het vertrekspoor en zo naar de remise.
// De paden zijn gewone 'connector'-lijnen (at, len) zodat rail.js er treinen op kan plaatsen.
const STEP = 2, CROSS = 60, THROAT = 180, SIDING = 240, NTRACK = 4, SPACING = 5, FIRST = 14;
const smooth = (t) => t * t * (3 - 2 * t);

export class DepotPath {
  // L: lijn, e: richting weg van het station (+1/-1), s0: kop op het perron, segs: [[u, offset]] (offset per afstand u)
  constructor(id, L, e, s0, offs, len, extrap = false) {
    this.id = id; this.connector = true; this.single = true; this.stations = []; this.kind = 0; this.name = 'Remise';
    const pts = [], p = {};
    this.ustart = null; // het deel vóór het begin (of na het einde) van de lijn valt weg: arclengte = u - ustart
    for (let u = 0; u <= len + 1e-6; u += STEP) {
      const sl = s0 + e * u; if (!extrap && (sl < 0 || sl > L.len)) continue;
      if (this.ustart === null) this.ustart = u;
      // kopsporen: voorbij het einde van de lijn rechtdoor in het verlengde (raaklijn aan het einde)
      const sc = Math.max(0, Math.min(L.len, sl)); L.at(sc, p); if (sc !== sl) { const over = sl - sc; p.x += p.tx * over; p.z += p.tz * over; }
      const o = offs(u);
      pts.push(p.x - p.tz * o, p.y, p.z + p.tx * o);
    }
    this.pts = new Float32Array(pts); this.n = pts.length / 3; this.cum = new Float32Array(this.n);
    for (let i = 1; i < this.n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(this.pts[i * 3] - this.pts[i * 3 - 3], this.pts[i * 3 + 2] - this.pts[i * 3 - 1]);
    this.len = this.cum[this.n - 1];
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < this.n; i++) { x0 = Math.min(x0, this.pts[i * 3]); x1 = Math.max(x1, this.pts[i * 3]); z0 = Math.min(z0, this.pts[i * 3 + 2]); z1 = Math.max(z1, this.pts[i * 3 + 2]); }
    this.box = { x0: x0 - 4, x1: x1 + 4, z0: z0 - 4, z1: z1 + 4 };
  }
  limAt() { return 40 / 3.6; }
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const P = this.pts, f = (s - this.cum[lo]) / Math.max(1e-6, this.cum[hi] - this.cum[lo]);
    const ax = P[lo * 3], ay = P[lo * 3 + 1], az = P[lo * 3 + 2], bx = P[hi * 3], by = P[hi * 3 + 1], bz = P[hi * 3 + 2], l = Math.hypot(bx - ax, bz - az) || 1;
    out.x = ax + (bx - ax) * f; out.y = ay + (by - ay) * f; out.z = az + (bz - az) * f; out.tx = (bx - ax) / l; out.tz = (bz - az) / l; out.grade = (by - ay) / l; out.kind = 0; out.s = s;
    return out;
  }
  near(x, z, maxd = 4, from = 0) {
    const b = this.box; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return null;
    const P = this.pts; let best = null;
    for (let i = Math.floor(from / STEP); i + 1 < this.n; i++) {
      const ax = P[i * 3], az = P[i * 3 + 2], bx = P[i * 3 + 3], bz = P[i * 3 + 5], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)), d = Math.hypot(x - ax - vx * t, z - az - vz * t);
      if (d <= maxd && (!best || d < best.d)) best = { d, y: P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * t, s: this.cum[i] + t * Math.sqrt(L2), c: this, side: Math.sign(vx * (z - az) - vz * (x - ax)) || 1 };
    }
    return best;
  }
}

// opstelterrein zoeken bij het eindstation van lijn L aan kant `end` ('start' of 'end'); free(x, z) zegt of een plek
// vrij is (geen stad, weg, gebouw of ander spoor), groundAt geeft de grondhoogte
export function findDepot(L, end, trackOffset, free, groundAt, name, maxU = 4200) {
  const st = end === 'start' ? L.stations[0] : L.stations[L.stations.length - 1], e = end === 'start' ? 1 : -1;
  const sEdge = end === 'start' ? st.s1 : st.s0, p = {}, q = {};
  // het vertrekspoor ligt aan de kant van trackOffset * e; de remise aan die kant
  const side = Math.sign(trackOffset(L, sEdge + e * 50) * e) || 1;
  const yardW = FIRST + SPACING * (NTRACK - 1) + 6;
  for (let u = 300; u < maxU; u += 20) {
    const a = sEdge + e * u, b = a + e * (THROAT + SIDING + 20);
    if (b < 50 || b > L.len - 50) break;
    let ok = true;
    L.at(a, q); const y0 = q.y;
    for (let s = a; ok && (s - b) * e <= 0; s += e * 10) {
      L.at(s, p);
      if (p.kind !== 0 || Math.abs(p.y - y0) > 1.5 || p.tx * q.tx + p.tz * q.tz < 0.985) { ok = false; break; }
      for (let o = 6; o <= yardW && ok; o += 4) {
        const x = p.x - p.tz * o * side, z = p.z + p.tx * o * side;
        if (Math.abs(groundAt(x, z) - p.y) > 3 || !free(x, z, L)) ok = false;
      }
    }
    if (!ok) continue;
    return depotAt(L, end, u, trackOffset, name); // gevonden: keel begint op u, opstelsporen na de S-bocht
  }
  return null;
}
// remise op een vaste plek (de wereld en de dienstregeling gebruiken dezelfde vaste lijst, zie js/greenisland.js)
export function depotAt(L, end, u, trackOffset, name) {
  const st = end === 'start' ? L.stations[0] : L.stations[L.stations.length - 1], e = end === 'start' ? 1 : -1;
  const sEdge = end === 'start' ? st.s1 : st.s0, side = Math.sign(trackOffset(L, sEdge + e * 50) * e) || 1;
  return makeDepot(L, e, side, sEdge, u, st, trackOffset, name || `Remise ${st.name}`);
}
// voor de wereldgenerator: ligt (x, z) in een remise? { D, u, sd, d (afstand tot het dichtste opstelspoor), y }
export function depotNear(DEPOTS, x, z) {
  for (const D of DEPOTS) {
    const b = D.box; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (D.kind === 'tail') {
      // kopsporen: plaats t.o.v. het einde van de lijn (u voorbij het einde, sd zijwaarts)
      const u = (x - D.px) * D.ox + (z - D.pz) * D.oz, sd = -(x - D.px) * D.oz + (z - D.pz) * D.ox;
      if (u < -2 || u > D.uEnd + 6 || Math.abs(sd) > D.half + 4) continue;
      let best = null;
      for (const P of [...D.sidings, ...D.fans]) { const r = P.near(x, z, 6); if (r && (!best || r.d < best.d)) best = r; }
      const inHall = u >= D.hall.u0 && u <= D.hall.u1 && Math.abs(sd) <= D.half;
      if (!best && !inHall) continue;
      return { D, u, sd, d: best ? best.d : 99, y: best ? best.y : D.py, inHall };
    }
    const q = D.L.near(Math.floor(x), Math.floor(z), 50); if (!q) continue;
    const u = (q.s - D.sEdge) * D.e; if (u < D.uThroat - 4 || u > D.uEnd + 8) continue;
    let best = null, ti = -1;
    D.sidings.forEach((P, k) => { const r = P.near(x, z, 6, Math.max(0, D.uThroat - 8)); if (r && (!best || r.d < best.d)) { best = r; ti = k; } });
    const hall = D.hall, inHall = u >= hall.u0 && u <= hall.u1 && q.sd * D.side >= Math.abs(hall.o0) && q.sd * D.side <= Math.abs(hall.o1);
    if (!best && !inHall) continue;
    return { D, u, sd: q.sd, d: best ? best.d : 99, y: best ? best.y : q.y, inHall, ti, side: best ? best.side : 0, sU: best ? best.s : 0 };
  }
  return null;
}
function makeDepot(L, e, side, sEdge, uThroat, st, trackOffset, name) {
  const oDep = trackOffset(L, sEdge + e * 10) * e, oArr = -oDep;
  const D = { id: `D:${L.id}:${e > 0 ? 'A' : 'B'}`, name, L, e, side, st, sEdge, uThroat, sidings: [], out: [], in: [] };
  // ballast/hal: opstelsporen vanaf het begin van de keel (in lijncoördinaten s vanaf de rand van het station)
  const uEnd = uThroat + THROAT + SIDING;
  for (let k = 0; k < NTRACK; k++) {
    const ok = side * (FIRST + SPACING * k);
    // pad voor de wereld: vertrekspoor → keel → opstelspoor
    D.sidings.push(new DepotPath(`${D.id}:${k}`, L, e, sEdge, (u) => u < uThroat ? oDep : u < uThroat + THROAT ? oDep + (ok - oDep) * smooth((u - uThroat) / THROAT) : ok, uEnd));
  }
  D.uEnd = uEnd; D.hall = { u0: uThroat + THROAT + 20, u1: uEnd - 2, o0: side * (FIRST - 4), o1: side * (FIRST + SPACING * (NTRACK - 1) + 4) };
  D.paths = { oDep, oArr };
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const P of D.sidings) { x0 = Math.min(x0, P.box.x0); x1 = Math.max(x1, P.box.x1); z0 = Math.min(z0, P.box.z0); z1 = Math.max(z1, P.box.z1); }
  // alleen het deel vanaf de keel telt voor de wereld (daarvoor ligt het gewone spoor)
  const p = {}, ends = [D.uThroat - 6, D.uEnd + 8].map(u => L.at(sEdge + e * u, p) && { x: p.x, z: p.z });
  D.box = { x0: Math.max(x0, Math.min(ends[0].x, ends[1].x) - 60), x1: Math.min(x1, Math.max(ends[0].x, ends[1].x) + 60), z0: Math.max(z0, Math.min(ends[0].z, ends[1].z) - 60), z1: Math.min(z1, Math.max(ends[0].z, ends[1].z) + 60) };
  return D;
}
// uitruk- en inrukpad voor opstelspoor k. Het pad begint 220 m achter de kop van de trein aan het perron (sStop), zodat
// de hele trein erop staat; v = afstand vanaf de kop aan het perron in de richting van de remise.
//   uitrukken (fromArrival = false): opstelspoor → keel (kruist het vertrekspoor) → aankomstspoor → stationswissel → vertrekperron
//   inrukken  (fromArrival = true):  aankomstperron → stationswissel → vertrekspoor → keel → opstelspoor
// path.u0: plaats van de kop aan het perron; path.main(u): op welk hoofdspoor (s, rijrichting, of beide sporen) of null
export function shuntPath(D, k, sStop, fromArrival, trainLen = 200) {
  if (D.kind === 'tail') return tailShuntPath(D, k, sStop, fromArrival, trainLen);
  const BACK = 220, ok = D.side * (FIRST + SPACING * k), { oDep, oArr } = D.paths, e = D.e;
  const vT = D.uThroat + (D.sEdge - sStop) * e, len = BACK + vT + THROAT + SIDING;
  const vC = fromArrival ? trainLen + 10 : 10; // stationswissel: net voorbij de trein aan het perron
  const a = fromArrival ? oArr : oDep, b = fromArrival ? oDep : oArr; // eerst op a, na de stationswissel op b
  const offs = (u) => { const v = u - BACK; return v < vC ? a : v < vC + CROSS ? a + (b - a) * smooth((v - vC) / CROSS) : v < vT ? b : v < vT + THROAT ? b + (ok - b) * smooth((v - vT) / THROAT) : ok; };
  const P = new DepotPath(`${D.id}:${k}:${fromArrival ? 'in' : 'uit'}`, D.L, e, sStop - e * BACK, offs, len);
  P.u0 = BACK + (fromArrival ? trainLen : 0) - P.ustart; P.parkU = P.len - 12; P.placeDir = 1;
  const dirOf = (o) => (o === oDep ? e : -e);
  P.main = (u) => { const v = u + P.ustart - BACK, s = sStop + e * v; if (v >= vT + THROAT * 0.6) return null; if ((v >= vC && v < vC + CROSS) || v >= vT) return { s, dir: dirOf(v >= vT ? b : a), both: true }; return { s, dir: dirOf(v < vC ? a : b) }; };
  return P;
}
// ---------- kopsporen (TERRANOVA 14.2): opstelsporen in het verlengde van een eindstation ----------
// Voor lijnen die volledig in de stad liggen (S1) of in een tunnel (metro): 4 sporen voorbij de stootblokken, met een
// waaier van 60 m vanaf beide perronsporen. Ondergronds (metro) een tunnelhal met betonnen plafond en lampen, bovengronds
// een hal zoals bij de andere remises. Treinen staan met de kop naar het station (placeDir = −1 in de padrichting).
const FAN = 60, TAIL = 250, TOFF = [-7.5, -2.5, 2.5, 7.5];
export function tailDepotAt(L, end, trackOffset, name, under) {
  const st = end === 'start' ? L.stations[0] : L.stations[L.stations.length - 1], out = end === 'start' ? -1 : 1, e = -out;
  const sEnd = end === 'start' ? 0 : L.len, p = L.at(sEnd);
  const oDep = trackOffset(L, sEnd + e * 5) * e, oArr = -oDep;
  const D = { kind: 'tail', under: !!under, id: `T:${L.id}:${end === 'start' ? 'A' : 'B'}`, name: name || `Remise ${st.name}`, L, e, side: 1, st, sEdge: sEnd, sEnd, out, uThroat: 0,
    px: p.x, pz: p.z, py: p.y, ox: p.tx * out, oz: p.tz * out, half: 10.5, uEnd: FAN + TAIL, paths: { oDep, oArr }, sidings: [], fans: [], placeDir: -1 };
  const offs = (o0, ok) => (u) => u < FAN ? o0 + (ok - o0) * smooth(u / FAN) : ok;
  for (let k = 0; k < NTRACK; k++) {
    D.sidings.push(new DepotPath(`${D.id}:${k}`, L, out, sEnd, offs(oDep, TOFF[k]), FAN + TAIL, true));
    D.fans.push(new DepotPath(`${D.id}:${k}:a`, L, out, sEnd, offs(oArr, TOFF[k]), FAN + TAIL, true));
  }
  D.hall = { u0: FAN - 4, u1: FAN + TAIL };
  const ends = [p, { x: p.x + D.ox * (FAN + TAIL), z: p.z + D.oz * (FAN + TAIL) }];
  D.box = { x0: Math.min(ends[0].x, ends[1].x) - 16, x1: Math.max(ends[0].x, ends[1].x) + 16, z0: Math.min(ends[0].z, ends[1].z) - 16, z1: Math.max(ends[0].z, ends[1].z) + 16 };
  return D;
}
// rangeerpad voor kopsporen: begint 5 m voor de kop van de trein aan het perron (in de lijn) en loopt door het station
// en de waaier naar het kopspoor k. De trein staat met de kop naar het station (placeDir −1: wagens naar hogere u).
function tailShuntPath(D, k, sStop, fromArrival, trainLen) {
  const out = D.out, o0 = fromArrival ? D.paths.oArr : D.paths.oDep, ok = TOFF[k];
  // vertrek (uit): kop aan het perron op sStop; aankomst (in): de aangekomen trein staat met zijn kop op sStop richting het
  // einde, dus zijn achterkant (= de 'kop' naar het station toe) ligt een treinlengte terug
  const sHeadToward = fromArrival ? sStop - out * trainLen : sStop, s0 = sHeadToward - out * 5;
  const dEnd = (D.sEnd - s0) * out; // afstand van het begin van het pad tot het einde van de lijn
  const offs = (u) => { const v = u - dEnd; return v < 0 ? o0 : v < FAN ? o0 + (ok - o0) * smooth(v / FAN) : ok; };
  const P = new DepotPath(`${D.id}:${k}:${fromArrival ? 'in' : 'uit'}`, D.L, out, s0, offs, dEnd + FAN + TAIL, true);
  P.u0 = 5; P.parkU = P.len - 12 - trainLen; P.placeDir = -1;
  const trackDir = fromArrival ? -D.e : D.e;
  P.main = (u) => { const v = u - dEnd; if (v >= FAN * 0.6) return null; const s = s0 + out * u; return v < 0 ? { s, dir: trackDir } : { s: D.sEnd, dir: trackDir, both: true }; };
  return P;
}
export const DEPOT_DIM = { STEP, CROSS, THROAT, SIDING, NTRACK, SPACING, FIRST };
