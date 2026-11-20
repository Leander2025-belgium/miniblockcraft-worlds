// Doorgaande routes over een overloopwissel (TERRANOVA 14): een automatische dienst rijdt een stuk van lijn A, gaat
// over het verbindingsspoor van een overloopwissel (js/crossover.js) naar lijn B en rijdt daar verder. De route
// gedraagt zich voor js/rail.js als een gewone lijn (at, limAt, len, stations), met connector = true: at() geeft
// al het midden van het juiste spoor (met de spoorafstand), zodat er geen extra verschuiving bij komt.
//
// Rijwegen en blokbeveiliging: locate(s) zegt bij elke plek op welk echt spoor de trein rijdt. De dienstregeling
// (buildTimetable in rail.js) reserveert daarmee dezelfde blokken als de gewone treinen van A en B, plus de wissel
// zelf (sleutel X:<id>) en, omdat het verbindingsspoor de sporen kruist, beide richtingen van A en B rond de wissel.
// Twee treinen kunnen zo nooit tegelijk een conflicterend stuk reserveren.
export class Route {
  // X: overloopwissel; begint op het eerste station van A in rijrichting X.aDir en eindigt op het laatste station van B
  constructor(X, trackOffset) {
    const A = X.A, B = X.B, a = X.aDir, b = X.bdir;
    this.X = X; this.A = A; this.B = B; this.aDir = a; this.bDir = b; this.trackOffset = trackOffset;
    this.connector = true; this.route = this; this.single = false;
    this.id = `${A.id}+${B.id}`; this.name = `${A.name || A.id} → ${B.name || B.id}`; this.color = A.color || '#10b981';
    this.aStart = a > 0 ? 0 : A.len; this.l1 = Math.abs(X.sA - this.aStart);
    this.l2 = X.len; this.bEnd = b > 0 ? B.len : 0; this.l3 = Math.abs(this.bEnd - X.sBend);
    this.len = this.l1 + this.l2 + this.l3;
    // stations: die van A vóór de wissel, die van B erna (met de plaats op de route)
    const st = [];
    for (const s of A.stations) { const r = (s.s - this.aStart) * a; if (r >= 0 && r < this.l1 - 30) st.push(this.copy(s, r, a)); }
    for (const s of B.stations) { const r = (s.s - X.sBend) * b; if (r > 30 && r <= this.l3) st.push(this.copy(s, this.l1 + this.l2 + r, b)); }
    st.sort((p, q) => p.s - q.s);
    this.stations = st;
  }
  copy(s, r, d) { const h = (s.s1 - s.s0) / 2; return { ...s, s: r, s0: r - h, s1: r + h, orig: s, line: this.id, dirOn: d }; }
  // op welk echt spoor ligt plaats s van de route? { L, s, dir } of { X, s }
  locate(s) {
    if (s < this.l1) return { L: this.A, s: this.aStart + this.aDir * s, dir: this.aDir };
    if (s < this.l1 + this.l2) return { X: this.X, s: s - this.l1 };
    return { L: this.B, s: this.X.sBend + this.bDir * (s - this.l1 - this.l2), dir: this.bDir };
  }
  at(s, out = {}) {
    s = Math.max(0, Math.min(this.len, s));
    const m = this.locate(s);
    if (m.X) return m.X.at(m.s, out);
    m.L.at(m.s, out);
    const o = m.L.connector ? 0 : this.trackOffset(m.L, m.s); // rijrichting omgedraaid: raaklijn mee omdraaien
    out.tx *= m.dir; out.tz *= m.dir; if (out.grade !== undefined) out.grade *= m.dir;
    out.x -= out.tz * o; out.z += out.tx * o; out.s = s;
    return out;
  }
  limAt(s) { const m = this.locate(s); return m.X ? m.X.limAt(m.s) : m.L.limAt(m.s); }
  // blokken voor de dienstregeling (zelfde sleutels als de treinen van A en B; zie rail.js blockKey)
  blocks(s, blockKey) {
    const m = this.locate(s);
    if (!m.X) return [blockKey(m.L, m.s, m.dir)];
    const X = this.X, sa = X.sA + X.aDir * Math.min(m.s, X.len), sb = X.sBend;
    return [`X:${X.id}`, blockKey(X.A, sa, 1), blockKey(X.A, sa, -1), blockKey(X.B, sb, 1), blockKey(X.B, sb, -1)];
  }
}
// automatische diensten over de wissels van een net: per overloopwissel één doorgaande dienst (als het net dat wil)
export function routeServices(JUNCTIONS, NET, trackOffset, LINE) {
  const out = [];
  for (const def of NET.throughServices || []) {
    const X = JUNCTIONS.find(x => x.A.id === def.from && x.B.id === def.to && x.aDir === def.aDir);
    if (!X) continue;
    const R = new Route(X, trackOffset);
    if (R.stations.length < 2) continue;
    LINE[R.id + ':' + X.id] = R; R.id = R.id + ':' + X.id;
    out.push({ ...def, line: R.id, through: X.id, dirs: [1] });
  }
  return out;
}
