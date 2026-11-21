// Routebegeleiding voor de speler (TERRANOVA 15): stap voor stap door een plan van de reisplanner (js/megaplan.js).
//
//   🚶 Loop naar Metro Oude Markt (240 m ↗)
//   ⏱ Wacht op M1 richting Luchthaven · perron 1 · vertrek 08:14
//   🚇 Rij mee met M1 tot Metro Megatower (3 haltes) — volgende halte: Metro Oostkade
//   🔁 Stap over: loop naar Tramhalte Stadswijk
//   🏁 Wandel naar de bestemming (120 m)
//
// De aanwijzing verandert zodra de speler de juiste actie gedaan heeft: bij de halte aankomen, instappen in een
// voertuig van de juiste lijn (js/drive.js, passagier), uitstappen aan de juiste halte, aankomen. Stapt de speler in
// de verkeerde lijn of stapt hij elders uit, dan zegt de begeleiding dat en plant opnieuw vanaf de plek waar hij is.
// Geen verzonnen realtime: vertrektijden komen uit de dienstregeling van de planner.
const ICON = { metro: '🚇', trein: '🚆', tram: '🚊', bus: '🚌' };
const KIND = { metro: 'metro', trein: 'train', tram: 'tram', bus: 'bus' };
const hm = (t) => `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}`;
const ARROWS = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'];

export class RouteGuide {
  // plan: resultaat van plan(); dest: { x, z, name }; replan(from) → nieuw plan (zelfde bestemming)
  constructor(game, plan, dest, replan) {
    this.g = game; this.dest = dest; this.replan = replan; this.log = []; this.set(plan);
  }
  set(plan) {
    this.plan = plan; this.rides = plan.legs.filter(l => l.mode !== 'wandelen'); this.i = 0; this.state = this.rides.length ? 'naarHalte' : 'naarDoel';
    this.note('plan', { ritten: this.rides.map(r => r.line), aankomst: hm(plan.arr) });
  }
  note(wat, extra) { this.log.push({ wat, t: Math.round((this.g.traffic?.clock || 0) * 10) / 10, ...extra }); if (this.log.length > 60) this.log.shift(); }
  // het voertuig waarin de speler als passagier zit (of null)
  ridingIn() { const d = this.g.drive; return d && d.mode === 'passenger' && d.a ? d.a : null; }
  arrow(x, z) {
    const p = this.g.player.pos, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, -dz) - (-this.g.player.yaw), k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    return { d, txt: `${ARROWS[k]} ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}` };
  }
  // per frame: toestand bijwerken en de tekst geven (null = klaar)
  update() {
    const R = this.rides[this.i], v = this.ridingIn(), p = this.g.player.pos;
    if (this.state === 'naarHalte') {
      if (v) { this.state = 'wachten'; return this.update(); } // al ingestapt
      const a = this.arrow(R.from.x, R.from.z);
      if (a.d < 30) { this.state = 'wachten'; this.note('bij de halte', { halte: R.from.name }); }
      return `${this.i ? '🔁 Stap over: loop' : '🚶 Loop'} naar ${R.from.name} (${a.txt}) · daar ${R.line} richting ${R.dir}`;
    }
    if (this.state === 'wachten') {
      if (v) {
        if (v.kind === KIND[R.mode] && v.line === R.line) { this.state = 'rijden'; this.boardedAt = { x: p.x, z: p.z }; this.note('ingestapt', { lijn: v.line }); return this.update(); }
        if (!this.wrongWarn) { this.wrongWarn = true; this.note('verkeerde lijn', { lijn: v.line || v.kind, verwacht: R.line }); }
        return `⚠️ Dit is ${v.line ? 'lijn ' + v.line : 'een ' + v.kind}, niet ${R.line}. Stap uit (H) en neem ${R.line} richting ${R.dir}.`;
      }
      this.wrongWarn = false;
      const a = this.arrow(R.from.x, R.from.z);
      if (a.d > 80) { this.state = 'naarHalte'; return this.update(); }
      return `⏱ Wacht op ${ICON[R.mode] || ''} ${R.line} richting ${R.dir}${R.perron ? ` · perron ${R.perron}` : ''} · vertrek ${hm(R.dep)} (dienstregeling)`;
    }
    if (this.state === 'rijden') {
      if (v) {
        const ns = v.nextStop || (this.g.traffic && this.g.traffic.nextStop ? this.g.traffic.nextStop(v) : null);
        const toHere = this.arrow(R.to.x, R.to.z);
        return `${ICON[R.mode] || ''} Rij mee met ${R.line} tot ${R.to.name} (${toHere.txt})${ns && ns.name ? ` · volgende halte: ${ns.name}` : ''}${toHere.d < 150 ? ' · stap hier uit (H)' : ''}`;
      }
      // uitgestapt: aan de juiste halte → volgende rit of de bestemming; elders → opnieuw plannen vanaf hier
      if (Math.hypot(R.to.x - p.x, R.to.z - p.z) < 90) {
        this.note('uitgestapt', { halte: R.to.name }); this.i++;
        this.state = this.i < this.rides.length ? 'naarHalte' : 'naarDoel'; return this.update();
      }
      this.note('elders uitgestapt', { verwacht: R.to.name });
      const np = this.replan && this.replan({ x: p.x, z: p.z, name: 'je positie' });
      if (np) { this.set(np); this.g.toast?.('🔁 Je bent ergens anders uitgestapt: nieuwe route vanaf hier'); }
      return this.update();
    }
    if (this.state === 'naarDoel') {
      const a = this.arrow(this.dest.x, this.dest.z);
      if (a.d < 30) { this.state = 'klaar'; this.note('aangekomen', { naar: this.dest.name }); this.g.toast?.(`🏁 Je bent bij ${this.dest.name}`); return null; }
      return `🏁 Wandel naar ${this.dest.name} (${a.txt})`;
    }
    return null;
  }
}
