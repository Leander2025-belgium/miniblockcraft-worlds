// TERRANOVA 16.1 — hyperloop Grand Central ↔ Luchthaven. Fictief toekomstconcept, geen bestaande of bewezen techniek.
// Eén capsule pendelt in een eigen buis (js/grandcentral.js: buis en terminals). Fysisch eenvoudig maar consistent:
// snelheidsprofiel uit de route berekend met optrekken en remmen van 2,5 m/s², een zijdelingse versnelling van hoogstens
// 2 m/s² in de bochten en een topsnelheid van 70 m/s (252 km/u). Dienstregeling zoals de reisplanner
// (js/megaplan.js: om de 5 minuten, 45 s aan de terminal): vertrek A op :xx:14 + k·5 min, vertrek B 2,5 min later.
// Deuren: openen 2 s na aankomst, sluiten 4 s voor vertrek; een speler in de capsule rijdt mee (geen natuurkunde),
// een speler in de buis houdt de capsule tegen (veiligheid).
import * as THREE from 'three';
import { hyperPath, HYPER, RAIL_Z } from './grandcentral.js';
import { HYPER_HEADWAY, HYPER_DWELL } from './megaplan.js';

const A_MAX = 2.5, LAT = 2.0, V_MAX = 70, LEN = 14, W = 2.6, H = 2.7;
export class Hyperloop {
  constructor(g) {
    this.g = g;
    // route met snelheidsprofiel
    const P = hyperPath(); this.P = P; const n = P.length; this.cum = new Float64Array(n); this.vlim = new Float64Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 2)], b = P[i], c = P[Math.min(n - 1, i + 2)];
      const h1 = Math.atan2(b[2] - a[2], b[0] - a[0]), h2 = Math.atan2(c[2] - b[2], c[0] - b[0]);
      let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh;
      const ds = Math.hypot(c[0] - a[0], c[2] - a[2]) / 2 || 1, R = dh > 1e-4 ? ds / dh : 1e9;
      this.vlim[i] = Math.min(V_MAX, Math.sqrt(LAT * R));
    }
    this.vlim[0] = 0; this.vlim[n - 1] = 0;
    for (let i = 1; i < n; i++) this.vlim[i] = Math.min(this.vlim[i], Math.sqrt(this.vlim[i - 1] ** 2 + 2 * A_MAX * (this.cum[i] - this.cum[i - 1])));
    for (let i = n - 2; i >= 0; i--) this.vlim[i] = Math.min(this.vlim[i], Math.sqrt(this.vlim[i + 1] ** 2 + 2 * A_MAX * (this.cum[i + 1] - this.cum[i])));
    // rijtijd per stuk → tabel s(t)
    this.tAt = new Float64Array(n);
    for (let i = 1; i < n; i++) { const v = Math.max(0.5, (this.vlim[i] + this.vlim[i - 1]) / 2); this.tAt[i] = this.tAt[i - 1] + (this.cum[i] - this.cum[i - 1]) / v; }
    this.rideT = this.tAt[n - 1]; this.len = this.cum[n - 1]; this.vtop = Math.max(...this.vlim);
    // capsule
    const M = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(LEN, H, W), M(0xeef3f8)); body.position.y = H / 2; grp.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), M(0xeef3f8)); nose.scale.set(1.6, 1, 1); nose.position.set(LEN / 2, H / 2, 0); grp.add(nose);
    const tail = nose.clone(); tail.position.x = -LEN / 2; grp.add(tail);
    const band = new THREE.Mesh(new THREE.BoxGeometry(LEN - 1, 0.7, W + 0.04), M(0x1a2a3a)); band.position.y = H * 0.62; grp.add(band);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(LEN + 2.6, 0.12, W + 0.06), M(0x00bcd4)); stripe.position.y = 0.55; grp.add(stripe);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.4, 0.08, W - 0.3), M(0x6a7280)); floor.position.y = 0.04; grp.add(floor);
    // vier schuifdeuren (twee per zijde, ter hoogte van de openingen in de perronschermen: dock ± 3..4 m)
    this.doors = [];
    for (const side of [-1, 1]) for (const dx of [-3.5, 3.5]) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.1, 0.08), M(0xcfd8e0, { transparent: true, opacity: 0.85 })); d.position.set(dx, 1.05, side * (W / 2 + 0.02)); d.userData = { dx, side }; grp.add(d); this.doors.push(d); }
    // lichtjes binnen (zichtbaar door de ramen)
    const light = new THREE.Mesh(new THREE.BoxGeometry(LEN - 2, 0.05, 0.4), M(0xfff2d0)); light.position.y = H - 0.08; grp.add(light);
    this.mesh = grp; g.scene.add(grp);
    this.door = 0; this.state = 'A'; this.s = 0; this.v = 0; this.hold = 0; this.events = { vertrek: 0, aankomst: 0, gestopt: 0, meegereden: 0 };
    this.t0 = (g.settings.hour ?? 12) * 3600 - (g.clock || 0);
    this.place();
  }
  // klok in seconden sinds middernacht (zoals de planner)
  now() { return this.t0 + (this.g.clock || 0); }
  // waar is de capsule op tijd t? (fase in de cyclus van 5 minuten)
  phaseAt(t) {
    const h = HYPER_HEADWAY, offA = 74, offB = offA + h / 2; // planner: (id.length · 37) mod h, terug een halve cyclus later
    const c = ((t - offA) % h + h) % h;                       // seconden sinds het vertrek uit A
    if (c < this.rideT) return { state: 'AB', tt: c, dwellLeft: 0 };
    const cb = ((t - offB) % h + h) % h;
    if (cb < this.rideT && c >= h / 2) return { state: 'BA', tt: cb, dwellLeft: 0 };
    return c < h / 2 ? { state: 'B', tt: 0, dwellLeft: h / 2 - c } : { state: 'A', tt: 0, dwellLeft: h - c };
  }
  sAtT(tt) { let lo = 0, hi = this.tAt.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.tAt[m] <= tt) lo = m; else hi = m; } const f = (tt - this.tAt[lo]) / ((this.tAt[hi] - this.tAt[lo]) || 1); return this.cum[lo] + (this.cum[hi] - this.cum[lo]) * Math.max(0, Math.min(1, f)); }
  posAt(s, out = {}) {
    const c = this.cum, P = this.P; let lo = 0, hi = c.length - 1; s = Math.max(0, Math.min(this.len, s));
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const f = (s - c[lo]) / ((c[hi] - c[lo]) || 1), a = P[lo], b = P[hi];
    out.x = a[0] + (b[0] - a[0]) * f; out.y = a[1] + (b[1] - a[1]) * f; out.z = a[2] + (b[2] - a[2]) * f; out.yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    return out;
  }
  // iemand in de buis (niet in de capsule) vóór de capsule? dan niet vertrekken
  blocked() {
    const p = this.g.player.pos; if (this.riding()) return false;
    if (Math.abs(p.y - (HYPER.y + 1)) > 3) return false;
    for (let s = 0; s < this.len; s += 6) { const q = this.posAt(s); if (Math.hypot(q.x - p.x, q.z - p.z) < 1.8 && !this.inTerminal(p)) return true; }
    return false;
  }
  inTerminal(p) { const o = p.z - RAIL_Z; return (p.x >= HYPER.A.x0 && p.x <= HYPER.A.x1 && Math.abs(o - HYPER.A.o) <= 8) || (p.x >= HYPER.B.x0 && p.x <= HYPER.B.x1 && Math.abs(o - HYPER.B.o) <= 8); }
  riding() { return !!this.ride; }
  update(dt) {
    const t = this.now(), ph = this.phaseAt(t), g = this.g, p = g.player.pos;
    // veiligheid: vertrek uitstellen zolang er iemand in de buis staat
    if ((ph.state === 'AB' || ph.state === 'BA') && this.state !== ph.state && this.blocked()) { this.t0 -= dt; this.hold += dt; if (this.hold > 2 && !this.warned) { this.warned = true; this.events.gestopt++; g.toast?.('🚄 De hyperloop vertrekt niet: er staat iemand in de buis'); } this.place(); return; }
    this.warned = false; this.hold = 0;
    if (ph.state !== this.state) {
      if (ph.state === 'AB' || ph.state === 'BA') { this.events.vertrek++; if (this.inside(p)) { this.ride = { off: this.localOf(p) }; this.events.meegereden++; } }
      else { this.events.aankomst++; if (this.ride) { this.ride = null; g.toast?.('🚄 Aangekomen: ' + (ph.state === 'B' ? 'Hyperloop Luchthaven' : 'Hyperloop Grand Central')); } }
      this.state = ph.state;
    }
    const ride = ph.state === 'AB' || ph.state === 'BA';
    this.s = ride ? (ph.state === 'AB' ? this.sAtT(ph.tt) : this.len - this.sAtT(ph.tt)) : (ph.state === 'A' ? 0 : this.len);
    const vi = ride ? this.vAt(ph.state === 'AB' ? this.s : this.len - this.s) : 0; this.v = vi;
    // deuren: open tijdens het halteren (niet de eerste 2 s, niet de laatste 4 s)
    const dwellT = HYPER_DWELL, want = !ride && ph.dwellLeft > 4 && ph.dwellLeft < (HYPER_HEADWAY / 2) - 2 ? 1 : 0;
    this.door += Math.sign(want - this.door) * Math.min(Math.abs(want - this.door), dt * 0.8);
    this.place();
    if (this.ride) {
      const q = this.posAt(this.s), c = Math.cos(q.yaw), s = Math.sin(q.yaw), o = this.ride.off;
      p.x = q.x + o.x * c + o.z * s; p.z = q.z - o.x * s + o.z * c; p.y = q.y + 0.02; g.player.vel.set(0, 0, 0); g.player.onGround = true;
    }
    void dwellT;
  }
  vAt(s) { const c = this.cum; let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; } return this.vlim[lo]; }
  inside(p) { const l = this.localOf(p); return Math.abs(l.x) < LEN / 2 - 0.3 && Math.abs(l.z) < W / 2 - 0.2 && Math.abs(p.y - (this.posAt(this.s).y)) < 1.5; }
  localOf(p) { const q = this.posAt(this.s), dx = p.x - q.x, dz = p.z - q.z, c = Math.cos(q.yaw), s = Math.sin(q.yaw); return { x: dx * c - dz * s, z: dx * s + dz * c }; }
  place() {
    const q = this.posAt(this.s); this.mesh.position.set(q.x, q.y, q.z); this.mesh.rotation.y = q.yaw;
    for (const d of this.doors) d.position.x = d.userData.dx + Math.sign(d.userData.dx) * this.door * 1.8;
  }
  // tekst voor de HUD of een vertrekscherm
  info() {
    const t = this.now(), ph = this.phaseAt(t), fmt = (s) => { s = ((s % 86400) + 86400) % 86400; return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; };
    const h = HYPER_HEADWAY, nextA = Math.ceil((t - 74) / h) * h + 74, nextB = Math.ceil((t - 74 - h / 2) / h) * h + 74 + h / 2;
    const st = { A: 'staat in Grand Central (deuren ' + (this.door > 0.5 ? 'open' : 'dicht') + ')', B: 'staat aan de luchthaven', AB: `onderweg naar de luchthaven · ${Math.round(this.v * 3.6)} km/u`, BA: `onderweg naar Grand Central · ${Math.round(this.v * 3.6)} km/u` }[ph.state];
    return `🚄 Hyperloop (fictief toekomstconcept) · capsule ${st}\nVertrek Grand Central ${fmt(nextA)} · vertrek Luchthaven ${fmt(nextB)} · rit ${Math.round(this.rideT)} s over ${(this.len / 1000).toFixed(1)} km, top ${Math.round(this.vtop * 3.6)} km/u`;
  }
  dispose() { this.mesh.traverse(o => { o.geometry?.dispose(); }); this.mesh.removeFromParent(); }
}
