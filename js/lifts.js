// Kabelbanen, gondelbanen en stoeltjesliften (algemeen): profiel met masten, blokken van de stations en masten,
// en de bewegende cabines. Zelfde werking als in de Alpen (js/alpen.js, js/mountainview.js), maar met de lijst
// liften en de grondfunctie als parameter. Gebruikt door Greenisland (kabelbanen in Silverpine).
// (Zonder three.js: deze module draait ook in de worker. De bewegende cabines staan in js/lift-view.js.)
import { B } from './blocks.js';

export const LIFT_SPEED = { cable: 10, gondola: 6, chair: 2.6 };
// defs: { name, kind: 'cable' | 'gondola' | 'chair', a: [x, z] (dalstation), b: [x, z] (bergstation), top }
export function buildLifts(defs, G, natural) {
  const LIFTS = [];
  for (const d of defs) {
    const [ax, az] = d.a, [bx, bz] = d.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const L = { ...d, ax, az, bx, bz, ux, uz, len };
    L.track = d.kind === 'chair' ? 2.6 : d.kind === 'gondola' ? 3.2 : 5.5;
    L.stL = d.kind === 'chair' ? 9 : d.kind === 'gondola' ? 16 : 18; L.stW = d.kind === 'chair' ? 6 : d.kind === 'gondola' ? 9 : 11;
    L.ya = Math.round(G + natural(ax, az) + 0.5); L.yb = Math.round(G + natural(bx, bz) + 0.5);
    LIFTS.push(L);
  }
  for (const L of LIFTS) {
    const gnd = (u) => { let m = -1e9; for (const o of [-L.track - 2, 0, L.track + 2]) { const x = L.ax + L.ux * u - L.uz * o, z = L.az + L.uz * u + L.ux * o; m = Math.max(m, G + natural(x, z)); } return m; };
    const attach = L.kind === 'chair' ? 6 : 6.2;
    const pts = [{ u: L.stL - 2, y: L.ya + attach }];
    const end = L.len - L.stL + 2, yEnd = L.yb + attach, maxSpan = L.kind === 'cable' ? 1400 : L.kind === 'gondola' ? 460 : 180, clearH = L.kind === 'chair' ? 6 : 12;
    const sagOf = (span) => span * (L.kind === 'cable' ? 0.03 : 0.012);
    const clears = (a, ya, b, yb) => { const span = b - a, sag = sagOf(span); for (let d = a + 6; d < b; d += 6) { const t = (d - a) / span, y = ya + (yb - ya) * t - sag * 4 * t * (1 - t); if (y - 4.6 - clearH < gnd(d)) return false; } return true; };
    let cur = pts[0];
    for (let guard = 0; guard < 120; guard++) {
      if ((clears(cur.u, cur.y, end, yEnd) && end - cur.u <= maxSpan) || end - cur.u < 60) { pts.push({ u: end, y: yEnd }); break; }
      let best = null;
      for (let nu = Math.min(end - 30, cur.u + maxSpan * 0.95); nu >= cur.u + 40 && !best; nu -= 20) {
        const g = gnd(nu);
        for (let hh = 14; hh <= 70; hh += 4) if (clears(cur.u, cur.y, nu, g + hh)) { best = { u: nu, y: g + hh, h: hh }; break; }
      }
      if (!best) { const nu = Math.min(end - 30, cur.u + 40); best = { u: nu, y: gnd(nu) + 70, h: 70 }; }
      pts.push(best); cur = best;
    }
    L.pts = pts; L.sag = sagOf;
    L.pylons = pts.filter(p => p.h).map(p => ({ u: Math.round(p.u), top: Math.round(p.y + 1) }));
    L.cableY = (u) => { if (u <= pts[0].u) return pts[0].y; for (let i = 1; i < pts.length; i++) if (u <= pts[i].u) { const a = pts[i - 1], b = pts[i], span = b.u - a.u, t = (u - a.u) / span; return a.y + (b.y - a.y) * t - sagOf(span) * 4 * t * (1 - t); } return pts[pts.length - 1].y; };
  }
  return LIFTS;
}
export const liftUV = (L, x, z) => { const dx = x - L.ax, dz = z - L.az; return [dx * L.ux + dz * L.uz, -dx * L.uz + dz * L.ux]; };
export function liftColumn(grid, x, z, col, top) {
  for (const L of grid.at(x, z)) {
    const [u, v] = liftUV(L, x, z);
    if (u < -L.stL - 4 || u > L.len + L.stL + 4 || Math.abs(v) > L.stW + 2) continue;
    // stations
    for (const [cu, y, isTop] of [[0, L.ya, false], [L.len, L.yb, true]]) {
      const du = u - cu;
      if (Math.abs(du) > L.stL || Math.abs(v) > L.stW) continue;
      for (let k = Math.max(1, top - 3); k < y; k++) col[k] = B.CONCRETE;
      for (let k = top + 1; k <= y; k++) col[k] = B.CONCRETE;
      for (let k = y + 1; k <= Math.max(top, y + 12); k++) col[k] = 0;
      col[y] = Math.abs(v) <= 1 ? B.LINE_YELLOW : B.TILE;
      const roof = y + (L.kind === 'chair' ? 6 : 10), wallV = Math.abs(Math.round(v)) === L.stW, wallU = Math.abs(Math.round(du)) === L.stL;
      const open = wallU && Math.abs(v) <= L.track + 3 && (isTop ? du < 0 : du > 0);
      const door = (wallV && Math.abs(du) <= 2) || (wallU && !open && Math.abs(v) <= 2);
      if ((wallV || wallU) && L.kind !== 'chair') for (let k = y + 1; k < roof; k++) { if (open && k <= y + 8) continue; if (door && k <= y + 3) continue; col[k] = k === y + 1 || k === roof - 1 || (wallV ? Math.round(du) : Math.round(v)) % 5 === 0 ? B.PANEL_DARK : B.GLASS_BLUE; }
      if (L.kind === 'chair' && (wallV || wallU) && Math.abs(v) > 2 && (Math.round(du) % 6 === 0)) for (let k = y + 1; k < roof; k++) col[k] = B.METAL;
      // groot wiel
      if (Math.abs(Math.abs(du) - (L.stL - 4)) <= 1 && (isTop ? du > 0 : du < 0) && Math.abs(Math.abs(v) - L.track) <= 1) for (let k = y + 1; k <= y + 6; k++) col[k] = B.METAL;
      if (Math.abs(v) === L.stW - 2 && Math.round(du) % 6 === 3) col[y + 1] = B.PLANKS;
      col[roof] = (Math.round(du) + Math.round(v)) % 7 === 0 ? B.LAMP : B.PANEL_WHITE;
      return roof;
    }
    // masten
    for (const p of L.pylons || []) {
      if (Math.abs(u - p.u) > 1.5) continue;
      const av = Math.abs(v);
      if (av > L.track + 1.5) continue;
      col[top] = B.CONCRETE;
      if (av <= 1) { for (let y = top + 1; y <= p.top; y++) col[y] = (y - top) % 6 === 0 ? B.PAINT_BLACK : B.METAL; return p.top; }
      if (Math.abs(u - p.u) < 0.6) { col[p.top] = B.METAL; return Math.max(top, p.top); }
      return top;
    }
  }
  return -1;
}

