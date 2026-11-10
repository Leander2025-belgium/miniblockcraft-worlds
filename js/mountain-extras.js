// Reuzenberg – uitbreidingen bovenop het bestaande landschap (de vorm van de berg verandert NIET):
// bergdorp met hotels, chalets, restaurants en winkels; treinstation met spoorlijn door het dal;
// bergwegen met straatverlichting; skigebied met pistes en stoeltjeslift; panoramarestaurant;
// uitkijkplatformen met glazen balustrades; wegwijzers en bankjes langs het wandelpad.
// Alles staat op funderingen of dijken die vanaf het bestaande terrein omhoog gebouwd worden.

export function makeExtras(ctx) {
  const { B, G, hash, noise, natural, surfaceAt, TRAIL, STATIONS, SUMMIT, LAKE, MW, ML } = ctx;
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const topAt = (x, z) => Math.round(G + surfaceAt(x, z));

  // ---------- lijnen (wegen, spoor, pistes) ----------
  class Line {
    constructor(kind, way, opt = {}) {
      this.kind = kind; this.opt = opt;
      // hoeken afronden (Chaikin), dan om de 2 m een punt
      let p = way.map(q => [q[0], q[1]]);
      for (let it = 0; it < (opt.sharp ? 0 : 3); it++) {
        const q = [p[0]];
        for (let i = 0; i < p.length - 1; i++) {
          const a = p[i], b = p[i + 1];
          q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        q.push(p[p.length - 1]); p = q;
      }
      const xs = [], zs = [];
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
        for (let k = 0; k < n; k++) { xs.push(ax + (bx - ax) * k / n); zs.push(az + (bz - az) * k / n); }
      }
      xs.push(p[p.length - 1][0]); zs.push(p[p.length - 1][1]);
      this.n = xs.length; this.x = Float32Array.from(xs); this.z = Float32Array.from(zs);
      this.s = new Float32Array(this.n);
      for (let i = 1; i < this.n; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
      this.len = this.s[this.n - 1];
      this.y = new Float32Array(this.n);
      for (let i = 0; i < this.n; i++) this.y[i] = opt.yAt ? opt.yAt(this.x[i], this.z[i]) : topAt(this.x[i], this.z[i]);
      this.hw = opt.hw || 3;
      this.reach = opt.reach || this.hw + 2;
      this.grid = new Map();
      const R = this.reach + 1;
      for (let i = 0; i < this.n - 1; i++) {
        const x0 = Math.min(this.x[i], this.x[i + 1]) - R, x1 = Math.max(this.x[i], this.x[i + 1]) + R;
        const z0 = Math.min(this.z[i], this.z[i + 1]) - R, z1 = Math.max(this.z[i], this.z[i + 1]) + R;
        for (let cz = Math.floor(z0 / 32); cz <= Math.floor(z1 / 32); cz++) for (let cx = Math.floor(x0 / 32); cx <= Math.floor(x1 / 32); cx++) {
          const k = cz * 1000 + cx; let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(i);
        }
      }
    }
    // [afstand met teken (links +), afstand langs de lijn, hoogte]
    near(x, z) {
      const l = this.grid.get(Math.floor(z / 32) * 1000 + Math.floor(x / 32));
      if (!l) return null;
      let bd = 1e9, bs = 0, by = 0, sg = 1;
      for (const i of l) {
        const ax = this.x[i], az = this.z[i], vx = this.x[i + 1] - ax, vz = this.z[i + 1] - az, L2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
        const dx = x - ax - vx * t, dz = z - az - vz * t, d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; bs = this.s[i] + (this.s[i + 1] - this.s[i]) * t; by = this.y[i] + (this.y[i + 1] - this.y[i]) * t; sg = vx * dz - vz * dx > 0 ? 1 : -1; }
      }
      return bd <= this.reach ? { d: bd, sd: bd * sg, s: bs, y: by } : null;
    }
    at(s) {
      let lo = 0, hi = this.n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
      const t = (s - this.s[lo]) / ((this.s[hi] - this.s[lo]) || 1);
      return { x: this.x[lo] + (this.x[hi] - this.x[lo]) * t, z: this.z[lo] + (this.z[hi] - this.z[lo]) * t, y: this.y[lo] + (this.y[hi] - this.y[lo]) * t,
        tx: this.x[hi] - this.x[lo], tz: this.z[hi] - this.z[lo] };
    }
  }

  // ---------- spoorlijn door het dal (op een dijk: het terrein wordt niet afgegraven) ----------
  const RAIL_WAY = [[2, 12520], [3000, 12450], [5500, 12250], [6800, 12060], [7350, 11905], [7500, 11880], [8000, 11880], [8600, 11905], [10000, 12050], [12000, 12200], [13998, 12250]];
  const rail = new Line('rail', RAIL_WAY, { hw: 2.4, reach: 14 });
  {
    // bedhoogte: nooit onder het terrein, hooguit 2,5 % helling
    const n = rail.n, raw = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tx = (rail.x[Math.min(n - 1, i + 1)] - rail.x[Math.max(0, i - 1)]), tz = (rail.z[Math.min(n - 1, i + 1)] - rail.z[Math.max(0, i - 1)]), l = Math.hypot(tx, tz) || 1;
      let m = -1e9;
      for (const o of [-3, -1.5, 0, 1.5, 3]) m = Math.max(m, G + natural(rail.x[i] - tz / l * o, rail.z[i] + tx / l * o));
      raw[i] = Math.max(m + 0.6, G + 1);
    }
    b.set(raw);
    const g = 0.05; // per 2 m
    for (let i = 1; i < n; i++) b[i] = Math.max(b[i], b[i - 1] - g);
    for (let i = n - 2; i >= 0; i--) b[i] = Math.max(b[i], b[i + 1] - g);
    for (let i = 0; i < n; i++) rail.y[i] = Math.round(b[i]);
  }
  // station: rechte stuk tussen x 7500 en 8000
  const STA = (() => {
    let s0 = 0, s1 = 0;
    for (let i = 0; i < rail.n; i++) { if (rail.x[i] < 7560) s0 = rail.s[i]; if (rail.x[i] < 7900) s1 = rail.s[i]; }
    const mid = rail.at((s0 + s1) / 2);
    return { s0, s1, mid, y: Math.round(mid.y), side: -1 }; // perron aan de noordkant (naar het dorp)
  })();

  // ---------- wegen ----------
  const ROADS = [];
  const road = (way, opt) => { const l = new Line('road', way, { hw: 3.6, reach: 7, ...opt }); ROADS.push(l); return l; };
  // dorpsstraat (kasseien, stoepen)
  const mainW = road([[7040, 11600], [7380, 11600]], { street: true, hw: 4, reach: 8, major: true, sharp: true });
  const mainE = road([[7380, 11600], [7720, 11600], [7760, 11640], [7760, 11800]], { street: true, hw: 4, reach: 8, major: true });
  const side = road([[7380, 11600], [7380, 11850]], { street: true, hw: 3.5, reach: 7, sharp: true });
  const side2 = road([[7380, 11850], [7380, 12330]], { hw: 3.3, reach: 6, sharp: true });
  // dalweg van west naar oost
  const valleyW = road([[2, 12780], [3000, 12720], [5500, 12520], [7000, 12360], [7380, 12330]], { hw: 3.5, reach: 7, major: true });
  const valleyE = road([[7380, 12330], [8500, 12360], [10000, 12460], [12000, 12560], [13998, 12600]], { hw: 3.5, reach: 7, major: true });
  // bergweg naar het skigebied (volgt het terrein)
  const mountainRoad = road([[7040, 11600], [6960, 11250], [6880, 11050], [6700, 10620], [6460, 10220], [6620, 9900], [6380, 9620], [6290, 9420]], { hw: 3.2, reach: 6 });

  // ---------- skigebied ----------
  const LIFT_X = 6250, LIFT_Z0 = 9360, LIFT_Z1 = 7640; // stoeltjeslift van onder naar boven
  const pisteA = new Line('piste', [[6215, 7690], [6020, 7900], [5900, 8300], [5930, 8700], [6080, 9050], [6210, 9310]], { hw: 17, reach: 19 });
  const pisteB = new Line('piste', [[6290, 7690], [6480, 7980], [6600, 8400], [6560, 8800], [6420, 9100], [6290, 9310]], { hw: 15, reach: 17 });
  const PISTES = [pisteA, pisteB];
  const LIFT = (() => {
    const gnd = (z) => Math.max(...[-4, 0, 4].map(o => topAt(LIFT_X + o, z)));
    const pts = [{ z: LIFT_Z0 - 6, y: gnd(LIFT_Z0) + 6 }];
    let z = LIFT_Z0 - 6;
    while (z - 170 > LIFT_Z1 + 10) {
      z -= 170;
      // hoogte zodat de stoeltjes overal minstens 4 m boven de grond hangen
      let h = 10;
      const prev = pts[pts.length - 1];
      for (; h < 30; h += 2) {
        let ok = true;
        for (let zz = prev.z - 4; zz > z; zz -= 4) { const t = (prev.z - zz) / (prev.z - z), y = prev.y + (gnd(z) + h - prev.y) * t; if (y - 3 < gnd(zz) + 4) { ok = false; break; } }
        if (ok) break;
      }
      pts.push({ z, y: gnd(z) + h, pylon: true, h });
    }
    pts.push({ z: LIFT_Z1 + 6, y: gnd(LIFT_Z1) + 6 });
    return { x: LIFT_X, z0: LIFT_Z0, z1: LIFT_Z1, pts, track: 2.6 };
  })();
  const liftY = (z) => {
    const P = LIFT.pts;
    if (z >= P[0].z) return P[0].y;
    for (let i = 1; i < P.length; i++) if (z >= P[i].z) { const t = (P[i - 1].z - z) / (P[i - 1].z - P[i].z); return P[i - 1].y + (P[i].y - P[i - 1].y) * t; }
    return P[P.length - 1].y;
  };

  // ---------- gebouwen en platformen ----------
  const BLD = [];
  const footprintTop = (x0, z0, x1, z1) => {
    let m = -1e9, lo = 1e9;
    for (let z = z0; z <= z1; z += 2) for (let x = x0; x <= x1; x += 2) { const t = topAt(x, z); if (t > m) m = t; if (t < lo) lo = t; }
    for (const [x, z] of [[x1, z0], [x0, z1], [x1, z1]]) { const t = topAt(x, z); if (t > m) m = t; if (t < lo) lo = t; }
    return [m, lo];
  };
  // gevel naar 'front' (+1: naar grotere z, -1: kleinere z)
  const building = (kind, x0, z0, w, d, o = {}) => {
    const x1 = x0 + w - 1, z1 = z0 + d - 1, [hi, lo] = footprintTop(x0, z0, x1, z1);
    // op een steile helling: half in de berg gebouwd (het terrein blijft, het gebouw staat erin)
    const base = o.floor ?? (o.slopeSite ? Math.round(lo + 0.4 * (hi - lo)) : hi);
    const b = { kind, x0, z0, x1, z1, floor: base + 1, front: o.front ?? 1, ov: o.ov ?? 1, ...o };
    b.top = b.floor + b.floors * 3;
    BLD.push(b); return b;
  };
  const LOOK = {
    chalet: [{ gf: B.PLASTER, uf: B.PLANKS, roof: B.ROOF_DARK }, { gf: B.ASHLAR, uf: B.DARK_PLANKS, roof: B.ROOF_DARK }, { gf: B.PLASTER_BEIGE, uf: B.PLANKS, roof: B.ROOF_RED }],
    hotel: [{ gf: B.PLASTER_BEIGE, uf: B.PLASTER, roof: B.ROOF_DARK }, { gf: B.ASHLAR, uf: B.PLASTER_PINK, roof: B.ROOF_RED }, { gf: B.PLASTER, uf: B.PLASTER_BEIGE, roof: B.ROOF_DARK }],
    shop: [{ gf: B.GLASS, uf: B.PLASTER_PINK, roof: B.ROOF_RED, awn: B.PAINT_RED }, { gf: B.GLASS, uf: B.PLASTER_BEIGE, roof: B.ROOF_DARK, awn: B.PAINT_GREEN }, { gf: B.GLASS, uf: B.PLASTER, roof: B.ROOF_RED, awn: B.PAINT_BLUE }],
    restaurant: [{ gf: B.LOG, uf: B.LOG, roof: B.ROOF_RED }, { gf: B.HALF_TIMBER, uf: B.HALF_TIMBER, roof: B.ROOF_DARK }],
  };
  // dorp langs de dorpsstraat (noordkant gevel naar het zuiden, zuidkant naar het noorden)
  {
    const plan = ['hotel', 'chalet', 'shop', 'restaurant', 'shop', 'chalet', 'hotel', 'shop', 'chalet', 'restaurant', 'chalet', 'hotel'];
    let x = 7048, i = 0;
    while (x < 7690) {
      if (Math.abs(x + 10 - 7380) < 16) { x += 26; continue; } // zijstraat vrijlaten
      for (const [zz, front] of [[11560, 1], [11610, -1]]) {
        const kind = plan[(i++) % plan.length], r = hash(x, zz, 3);
        const w = kind === 'hotel' ? 30 : kind === 'chalet' ? 15 : kind === 'restaurant' ? 19 : 13;
        const d = kind === 'hotel' ? 18 : 14;
        const look = LOOK[kind][Math.floor(r * LOOK[kind].length)];
        building(kind, x, front > 0 ? 11588 - d : 11612, w, d, { ...look, front, floors: kind === 'hotel' ? 4 + Math.floor(r * 2) : kind === 'shop' ? 2 : kind === 'restaurant' ? 1 + (r > 0.5 ? 1 : 0) : 2, balcony: kind !== 'shop', name: kind });
      }
      x += 34;
    }
    // chalets verspreid achter het dorp
    for (let k = 0; k < 22; k++) {
      const cx = 7060 + Math.floor(hash(k, 7, 1) * 640), cz = hash(k, 7, 2) < 0.5 ? 11470 + Math.floor(hash(k, 7, 3) * 40) : 11665 + Math.floor(hash(k, 7, 4) * 90);
      if (Math.abs(cx - 7380) < 22) continue;
      if (BLD.some(b => cx + 16 > b.x0 - 4 && cx < b.x1 + 4 && cz + 13 > b.z0 - 4 && cz < b.z1 + 4)) continue;
      building('chalet', cx, cz, 13 + Math.floor(hash(k, 7, 5) * 4), 11, { ...LOOK.chalet[k % 3], front: cz < 11600 ? 1 : -1, floors: 2, balcony: true });
    }
  }
  // treinstation (stationsgebouw aan de noordkant van het perron)
  const STATION_BLD = building('station', 7650, Math.round(STA.mid.z) - 26, 40, 13, { gf: B.PLASTER_BEIGE, uf: B.PLASTER_BEIGE, roof: B.ROOF_RED, front: 1, floors: 2, sign: true, clock: true, floor: STA.y });
  // dalstation-kiosk en hotel bij de kabelbaan
  building('hotel', 7040, 11430, 26, 16, { ...LOOK.hotel[2], front: 1, floors: 5, balcony: true, name: 'Grand Hotel' });
  // panoramarestaurant naast het topstation (glazen gevels, terras op het dak)
  const top = STATIONS[1];
  const PANO = building('panorama', top.x + 22, top.z - 14, 26, 20, { slopeSite: true, flat: true, gf: B.GLASS_BLUE, uf: B.GLASS_BLUE, roof: B.PANEL_WHITE, floors: 2, front: -1, ov: 0, terrace: true });
  // liftstations
  const LIFT_BASE = building('lift', LIFT_X - 8, LIFT_Z0 - 4, 17, 14, { flat: true, gf: B.PANEL_DARK, uf: B.PANEL_DARK, roof: B.METAL, floors: 2, ov: 0, open: true });
  const LIFT_TOP = building('lift', LIFT_X - 8, LIFT_Z1 - 9, 17, 14, { flat: true, gf: B.PANEL_DARK, uf: B.PANEL_DARK, roof: B.METAL, floors: 2, ov: 0, open: true });
  // skihut bij het onderstation
  building('restaurant', LIFT_X + 18, LIFT_Z0 - 10, 18, 14, { ...LOOK.restaurant[0], front: -1, floors: 2, balcony: true });

  // uitkijkplatformen met glazen balustrade (op palen)
  const DECKS = [];
  const deck = (cx, cz, w = 10, d = 10, name = 'Uitkijkplatform') => {
    const x0 = Math.round(cx - w / 2), z0 = Math.round(cz - d / 2), x1 = x0 + w - 1, z1 = z0 + d - 1;
    const [hi] = footprintTop(x0, z0, x1, z1);
    DECKS.push({ x0, z0, x1, z1, floor: hi + 1, name });
  };
  const tpt = (f, off) => { const i = Math.floor((TRAIL.length / 3 - 1) * f) * 3, j = Math.min(TRAIL.length - 3, i + 6); const tx = TRAIL[j] - TRAIL[i], tz = TRAIL[j + 1] - TRAIL[i + 1], l = Math.hypot(tx, tz) || 1; return [TRAIL[i] + tz / l * off, TRAIL[i + 1] - tx / l * off]; };
  deck(SUMMIT[0] + 16, SUMMIT[1] + 4, 9, 9, 'Uitkijkplatform Top');
  deck(top.x - 24, top.z - 4, 10, 12, 'Uitkijkplatform Topstation');
  deck(...tpt(0.35, 9), 9, 9, 'Uitkijkplatform Bos');
  deck(...tpt(0.62, 9), 9, 9, 'Uitkijkplatform Alm');
  deck(LAKE.x - LAKE.r - 30, LAKE.z, 12, 8, 'Uitkijkplatform Bergmeer');

  // ---------- puntjes: lantaarns, wegwijzers, bankjes ----------
  const POINTS = new Map();
  const pt = (x, z, v) => POINTS.set(Math.round(x) + ',' + Math.round(z), v);
  for (const r of ROADS) {
    const off = r.hw + (r.opt.street ? 2.2 : 1.4);
    for (let s = 10, k = 0; s < r.len - 5; s += r.opt.street ? 18 : 32, k++) {
      const p = r.at(s), l = Math.hypot(p.tx, p.tz) || 1, sd = k % 2 ? 1 : -1;
      pt(p.x - p.tz / l * off * sd, p.z + p.tx / l * off * sd, { kind: 'lamp' });
    }
  }
  for (let k = 1; k < 24; k++) { const [x, z] = tpt(k / 24, 3.2); pt(x, z, { kind: 'sign', n: k }); }
  for (let k = 1; k < 36; k++) { const [x, z] = tpt(k / 36 + 0.012, -3.4); pt(x, z, { kind: 'bench' }); }
  for (const P of PISTES) for (let s = 12; s < P.len; s += 36) {
    const p = P.at(s), l = Math.hypot(p.tx, p.tz) || 1;
    pt(p.x - p.tz / l * (P.hw + 0.5), p.z + p.tx / l * (P.hw + 0.5), { kind: 'marker', c: P === pisteA ? B.PAINT_RED : B.PAINT_BLUE });
    pt(p.x + p.tz / l * (P.hw + 0.5), p.z - p.tx / l * (P.hw + 0.5), { kind: 'marker', c: P === pisteA ? B.PAINT_RED : B.PAINT_BLUE });
  }
  // perronlantaarns en bankjes
  for (let s = STA.s0 + 6; s < STA.s1; s += 12) {
    const p = rail.at(s), l = Math.hypot(p.tx, p.tz) || 1;
    pt(p.x + p.tz / l * 8.5, p.z - p.tx / l * 8.5, { kind: 'lamp' });
  }

  // ruimtelijke index van alle gebouwen
  const IDX = new Map();
  const index = (o, pad = 0) => {
    for (let cz = Math.floor((o.z0 - pad) / 32); cz <= Math.floor((o.z1 + pad) / 32); cz++) for (let cx = Math.floor((o.x0 - pad) / 32); cx <= Math.floor((o.x1 + pad) / 32); cx++) {
      const k = cz * 1000 + cx; let l = IDX.get(k); if (!l) IDX.set(k, l = []); l.push(o);
    }
  };
  for (const b of BLD) index(b);
  for (const d of DECKS) { d.deck = true; index(d); }
  const objAt = (x, z, pad = 0) => {
    const l = IDX.get(Math.floor(z / 32) * 1000 + Math.floor(x / 32));
    if (l) for (const o of l) if (x >= o.x0 - pad && x <= o.x1 + pad && z >= o.z0 - pad && z <= o.z1 + pad) return o;
    return null;
  };

  // ---------- kolommen ----------
  const under = (col, top, y, mat = B.ASHLAR) => { for (let k = Math.max(1, top - 3); k < y; k++) col[k] = mat; }; // fundering
  const ground = (col, top) => { for (let k = Math.max(1, top - 3); k < top; k++) col[k] = B.DIRT; };

  function buildingColumn(b, x, z, col, top) {
    const ov = b.ov, cx0 = b.x0 + ov, cx1 = b.x1 - ov, cz0 = b.z0 + ov, cz1 = b.z1 - ov;
    const inCore = x >= cx0 && x <= cx1 && z >= cz0 && z <= cz1;
    const F = b.floor, wallTop = F + b.floors * 3;
    const frontZ = b.front > 0 ? cz1 : cz0;
    // dakvorm
    let roofY = wallTop;
    const depth = b.z1 - b.z0, dEdge = Math.min(z - b.z0, b.z1 - z);
    if (!b.flat) roofY = wallTop + Math.floor(dEdge * (b.kind === 'chalet' ? 0.62 : 0.55));
    if (!inCore) {
      // overstek van het dak, balkons, luifels
      ground(col, top);
      let t = top;
      if (b.balcony && (z === frontZ + b.front) && x > cx0 && x < cx1) {
        for (let f = 1; f < b.floors; f++) { col[F + f * 3] = B.PLANKS; col[F + f * 3 + 1] = (x + z) % 2 ? B.LOG : 0; t = Math.max(t, F + f * 3 + 1); }
      }
      if (b.awn && z === frontZ + b.front && x >= cx0 && x <= cx1) { col[F + 3] = (x % 2) ? b.awn : B.PAINT_WHITE; t = Math.max(t, F + 3); }
      if (!b.flat) { col[roofY] = b.roof; t = Math.max(t, roofY); }
      if (t > top && col[top] === 0) col[top] = B.GRASS;
      if (!col[top]) col[top] = B.GRASS;
      return Math.max(t, top);
    }
    const buried = top >= F; // dit stuk van het gebouw zit in de helling
    if (buried) { for (let k = Math.max(1, top - 3); k <= top; k++) col[k] = B.STONE; }
    else under(col, top, F, B.ASHLAR);
    const base = buried ? top : F;
    const edgeX = x === cx0 || x === cx1, edgeZ = z === cz0 || z === cz1, wall = edgeX || edgeZ;
    if (!buried) col[F] = b.kind === 'station' || b.kind === 'panorama' ? B.TILE : B.PLANKS;
    const along = edgeZ ? x - cx0 : z - cz0;
    const doorX = Math.round((cx0 + cx1) / 2);
    for (let y = Math.max(F, base) + 1; y < wallTop; y++) {
      const lvl = y - F - 1, fl = Math.floor(lvl / 3), inLvl = lvl % 3;
      if (!wall) { if (inLvl === 2 && y + 1 < wallTop) col[y + 1] = B.PLANKS; continue; } // tussenvloeren
      const corner = edgeX && edgeZ;
      const mat = fl === 0 ? b.gf : b.uf;
      if (b.open && fl === 0 && !corner) continue; // open liftstation
      if (corner) { col[y] = b.kind === 'panorama' ? B.PANEL_DARK : fl === 0 ? (b.gf === B.GLASS ? B.PLASTER : b.gf) : b.uf; continue; }
      // deur
      if (z === frontZ && Math.abs(x - doorX) <= (b.kind === 'hotel' || b.kind === 'station' ? 1 : 0) && fl === 0 && inLvl < 2) continue;
      if (b.kind === 'panorama') { col[y] = (along % 6 === 0) ? B.PANEL_DARK : B.GLASS_BLUE; continue; }
      if (mat === B.GLASS) { col[y] = inLvl === 2 ? B.PANEL_DARK : (along % 5 === 0 ? B.PANEL_DARK : B.GLASS); continue; }
      const win = along % 3 === 1 && inLvl >= 0 && inLvl <= 1;
      col[y] = win ? B.GLASS : mat;
      if (!win && inLvl === 2 && fl > 0 && (b.uf === B.PLANKS || b.uf === B.DARK_PLANKS)) col[y] = B.LOG; // balk tussen de verdiepingen
    }
    // borden en klok
    if ((b.sign || b.kind === 'hotel') && z === frontZ && Math.abs(x - doorX) <= 4 && Math.abs(x - doorX) >= 2) col[F + 4] = b.kind === 'station' ? B.PAINT_BLUE : B.PAINT_RED;
    if (b.clock && z === frontZ && x === doorX) { col[F + 5] = B.PAINT_WHITE; }
    // dak
    let t = wallTop;
    if (b.flat) {
      col[wallTop] = b.roof;
      if (b.terrace && wall) { col[wallTop + 1] = B.GLASS; t = wallTop + 1; }
      if (b.kind === 'panorama' && !wall && (x + z) % 7 === 0) { col[wallTop + 1] = B.PLANKS; t = wallTop + 1; } // terrastafels
      if (b.kind === 'lift' && x === b.x0 + 8 && z === b.z0 + 6) for (let y = F + 1; y < wallTop; y++) col[y] = B.METAL; // wiel-as
    } else {
      // gevels tot onder het dak
      if (edgeX) for (let y = wallTop; y < roofY; y++) col[y] = (y - wallTop) % 3 === 1 && Math.abs(z - (b.z0 + b.z1) / 2) < 1 ? B.GLASS : b.uf;
      col[roofY] = b.roof; t = roofY;
      if (b.kind === 'hotel' && x % 9 === 4 && dEdge === Math.floor(depth / 2) - 1) { col[roofY + 1] = B.BRICK; col[roofY + 2] = B.BRICK; t = roofY + 2; } // schoorsteen
    }
    // binnen: tafels in restaurants
    if (!wall && (b.kind === 'restaurant' || b.kind === 'panorama') && (x % 4 === 1) && (z % 4 === 1)) col[F + 1] = B.PLANKS;
    return t;
  }
  function deckColumn(o, x, z, col, top) {
    const F = o.floor, edge = x === o.x0 || x === o.x1 || z === o.z0 || z === o.z1;
    const pillar = (x === o.x0 || x === o.x1 || x === Math.round((o.x0 + o.x1) / 2)) && (z === o.z0 || z === o.z1 || z === Math.round((o.z0 + o.z1) / 2));
    if (pillar) for (let y = top + 1; y < F; y++) col[y] = B.METAL;
    col[F] = B.DARK_PLANKS;
    if (edge) { col[F + 1] = B.GLASS; return F + 1; }
    if (x === o.x0 + 2 && z === o.z0 + 2) { col[F + 1] = B.METAL; col[F + 2] = B.PAINT_BLACK; return F + 2; } // verrekijker
    if (z === o.z1 - 1 && x > o.x0 + 2 && x < o.x1 - 2) { col[F + 1] = B.PLANKS; return F + 1; } // bank
    return F;
  }

  function column(x, z, col, top, hReal, slope) {
    // gebouwen en platformen
    const o = objAt(x, z);
    if (o) return o.deck ? deckColumn(o, x, z, col, top) : buildingColumn(o, x, z, col, top);
    // spoor
    const r = rail.near(x, z);
    if (r) {
      const by = Math.round(r.y);
      const onSta = r.s > STA.s0 && r.s < STA.s1;
      const pd = -r.sd; // positief = noordkant (perron, naar het dorp)
      if (onSta && pd > -2.5 && pd >= 2.6 && pd <= 7.2) {
        // perron
        under(col, top, by + 1, B.CONCRETE);
        col[by + 1] = pd < 3.4 ? B.CONCRETE : pd < 4.2 ? B.LINE_WHITE : B.TILE;
        if (pd > 4.4) {
          const roofY = by + 6;
          col[roofY] = Math.round(r.s) % 6 === 0 ? B.METAL : B.GLASS;
          if (Math.abs(pd - 5.8) < 0.5 && Math.round(r.s) % 10 === 0) { for (let y = by + 2; y < roofY; y++) col[y] = B.POST; col[by + 4] = B.PAINT_BLUE; }
          else if (Math.abs(pd - 5.8) < 0.5 && Math.round(r.s) % 10 === 4) col[by + 2] = B.PLANKS;
          return roofY;
        }
        return by + 1;
      }
      if (onSta && pd > 7.2 && pd < 14) { under(col, top, by + 1, B.STONE); col[by + 1] = B.TILE; return by + 1; } // stationsplein
      if (r.d <= r.y - top + 2.6 || r.d <= 2.6) {
        const high = by - top;
        if (r.d <= 2.6) {
          if (high > 9) {
            // brug: pijlers om de 20 m
            if (Math.round(r.s) % 20 < 2) for (let y = top; y < by; y++) col[y] = B.CONCRETE;
            else ground(col, top), col[top] = col[top] || B.GRASS;
            col[by - 1] = B.CONCRETE; col[by] = B.BALLAST;
            if (r.d > 2.1) col[by + 1] = B.METAL;
            return Math.max(top, by + (r.d > 2.1 ? 1 : 0));
          }
          under(col, top, by, B.STONE);
          for (let y = by + 1; y <= top; y++) col[y] = 0;
          col[by] = B.BALLAST;
          return by;
        }
        // talud van de dijk
        const yy = Math.round(by - (r.d - 2.6));
        if (yy > top && high <= 9) { under(col, top, yy, B.DIRT); col[yy] = B.GRASS; return yy; }
      }
    }
    // wegen
    for (const rd of ROADS) {
      const q = rd.near(x, z);
      if (!q) continue;
      if (q.d <= rd.hw) {
        ground(col, top);
        if (rd.opt.street) col[top] = B.COBBLE;
        else col[top] = Math.abs(q.sd) < 0.5 && Math.floor(q.s / 4) % 2 === 0 ? B.LINE_WHITE : B.ASPHALT;
        return top;
      }
      if (rd.opt.street && q.d <= rd.hw + 3) { ground(col, top); col[top] = B.TILE; return deco(x, z, col, top); }
      if (!rd.opt.street && q.d <= rd.hw + 0.8) { ground(col, top); col[top] = B.GRAVEL; return top; }
    }
    // pistes
    for (const P of PISTES) {
      const q = P.near(x, z);
      if (q && q.d <= P.hw) { ground(col, top); col[top] = B.SNOW; if (slope < 0.7 && hash(x, z, 77) < 0.5) { col[top + 1] = B.SNOW; return top + 1; } return top; }
    }
    // liftmasten
    if (Math.abs(x - LIFT_X) <= 4 && z < LIFT_Z0 && z > LIFT_Z1) {
      for (const p of LIFT.pts) {
        if (!p.pylon || Math.abs(z - p.z) > 0) continue;
        const ax = Math.abs(x - LIFT_X), pt = Math.round(p.y + 1);
        if (ax === 0) { ground(col, top); col[top] = B.CONCRETE; for (let y = top + 1; y <= pt; y++) col[y] = B.METAL; return pt; }
        col[pt] = B.METAL; return Math.max(top, pt);
      }
    }
    return -1;
  }
  // kleine dingen bovenop het terrein
  function deco(x, z, col, top) {
    const p = POINTS.get(x + ',' + z);
    if (!p) return top;
    if (p.kind === 'lamp') { for (let y = top + 1; y <= top + 4; y++) col[y] = B.POST; col[top + 5] = B.LAMP; return top + 5; }
    if (p.kind === 'bench') { col[top + 1] = B.DARK_PLANKS; return top + 1; }
    if (p.kind === 'sign') { for (let y = top + 1; y <= top + 3; y++) col[y] = B.POST; col[top + 3] = B.PAINT_YELLOW; col[top + 2] = B.PAINT_YELLOW; return top + 3; }
    if (p.kind === 'marker') { col[top + 1] = B.POST; col[top + 2] = p.c; return top + 2; }
    return top;
  }
  // geen bomen dicht bij gebouwen, wegen, spoor en pistes
  function noTrees(x, z) {
    if (objAt(x, z, 5)) return true;
    const r = rail.near(x, z); if (r && r.d < 10) return true;
    for (const rd of ROADS) { const q = rd.near(x, z); if (q && q.d < rd.hw + 4) return true; }
    for (const P of PISTES) { const q = P.near(x, z); if (q && q.d < P.hw + 2) return true; }
    if (Math.abs(x - LIFT_X) < 8 && z < LIFT_Z0 + 8 && z > LIFT_Z1 - 8) return true;
    return false;
  }

  // ---------- verkeer: paden per tegel ----------
  function paths(X0, Z0, T) {
    const out = [];
    const clip = (pts, type) => {
      let run = [];
      const flush = () => { if (run.length >= 6) out.push({ type, pts: new Float32Array(run) }); run = []; };
      for (const [x, z, y] of pts) {
        const lx = x - X0, lz = z - Z0;
        if (lx < -4 || lz < -4 || lx > T + 4 || lz > T + 4) { flush(); continue; }
        run.push(lx, lz, y);
      }
      flush();
    };
    const sample = (L, off, rev, every = 6) => {
      const p = [];
      for (let s = 0; s <= L.len; s += every) {
        const q = L.at(Math.min(s, L.len)), l = Math.hypot(q.tx, q.tz) || 1;
        p.push([q.x - q.tz / l * off, q.z + q.tx / l * off, Math.round(q.y)]);
      }
      if (p.length && L.len % every) { const q = L.at(L.len), l = Math.hypot(q.tx, q.tz) || 1; p.push([q.x - q.tz / l * off, q.z + q.tx / l * off, Math.round(q.y)]); }
      return rev ? p.reverse() : p;
    };
    // grove test of de lijn in de buurt van deze tegel komt
    const touches = (L) => { for (let i = 0; i < L.n; i += 8) if (L.x[i] > X0 - 40 && L.x[i] < X0 + T + 40 && L.z[i] > Z0 - 40 && L.z[i] < Z0 + T + 40) return true; return false; };
    if (touches(rail)) {
      clip(sample(rail, 0, false, 4), 'train');
      const m = STA.mid; if (m.x >= X0 && m.x < X0 + T && m.z >= Z0 && m.z < Z0 + T) out.push({ type: 'railstop', name: 'Reuzendal', pts: new Float32Array([m.x - X0, m.z - Z0, STA.y + 1]) });
    }
    for (const rd of ROADS) {
      if (!touches(rd)) continue;
      const t = rd.opt.major ? 'carM' : 'car';
      clip(sample(rd, -1.8, false), t); clip(sample(rd, 1.8, true), t); // rechts rijden
      if (rd.opt.street) { clip(sample(rd, rd.hw + 1.5, false), 'walk'); clip(sample(rd, -rd.hw - 1.5, false), 'walk'); }
    }
    // bushaltes in het dorp en aan het station
    for (const [x, z] of [[7240, 11594], [7560, 11594], [7756, 11760]]) if (x >= X0 && x < X0 + T && z >= Z0 && z < Z0 + T) out.push({ type: 'busstop', pts: new Float32Array([x - X0, z - Z0, topAt(x, z)]) });
    return out;
  }

  function zone(x, z) {
    const o = objAt(x, z, 3);
    if (o) return o.deck ? o.name : o.kind === 'station' ? 'Station Reuzendal' : o.kind === 'panorama' ? 'Panoramarestaurant' : o.kind === 'lift' ? 'Stoeltjeslift' :
      o.kind === 'hotel' ? `${o.name === 'Grand Hotel' ? 'Grand Hotel' : 'Hotel'} · Bergdorp Reuzendal` : o.kind === 'shop' ? 'Winkel · Bergdorp Reuzendal' : o.kind === 'restaurant' ? 'Restaurant · Bergdorp Reuzendal' : 'Chalet · Bergdorp Reuzendal';
    const r = rail.near(x, z); if (r && r.d < 8) return r.s > STA.s0 - 20 && r.s < STA.s1 + 20 ? 'Station Reuzendal' : 'Spoorlijn door het dal';
    for (const P of PISTES) { const q = P.near(x, z); if (q && q.d < P.hw + 2) return P === pisteA ? 'Skigebied · rode piste' : 'Skigebied · blauwe piste'; }
    if (x > 7030 && x < 7800 && z > 11440 && z < 11860) return 'Bergdorp Reuzendal';
    for (const rd of ROADS) { const q = rd.near(x, z); if (q && q.d < rd.hw + 1) return rd === mountainRoad ? 'Bergweg' : rd.opt.street ? 'Dorpsstraat' : 'Dalweg'; }
    return null;
  }

  const PLACES = [
    ['Bergdorp Reuzendal', 7380, 11600], ['Station Reuzendal', STA.mid.x, STA.mid.z - 12], ['Skigebied', LIFT_X + 12, LIFT_Z0 + 20],
    ['Panoramarestaurant', PANO.x0 + 15, PANO.z0 - 8], ['Uitkijkplatform Top', SUMMIT[0] + 16, SUMMIT[1] + 14],
  ];
  // lijnen voor de overzichtskaart
  const MAP = [
    { color: '#c8c8c8', w: 2, pts: rail }, ...ROADS.map(r => ({ color: '#f2e6c8', w: 1.5, pts: r })),
    ...PISTES.map(p => ({ color: '#ffffff', w: 3, pts: p })),
  ];
  return { column, deco, noTrees, paths, zone, PLACES, LIFT, liftY, MAP, BLD, DECKS, rail, STA, MW, ML, sstep, noise };
}
