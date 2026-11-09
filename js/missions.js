// Bouwopdrachten: kleine doelen met voortgang, bewaard op dit toestel.
const KEY = 'blokstad-missions';
export const MISSIONS = [
  { id: 'first', name: 'Eerste blok', desc: 'Plaats je eerste blok.', goal: 1, stat: 'placed' },
  { id: 'build200', name: 'Bouwmeester', desc: 'Plaats 200 blokken.', goal: 200, stat: 'placed' },
  { id: 'break50', name: 'Sloopwerk', desc: 'Breek 50 blokken.', goal: 50, stat: 'broken' },
  { id: 'tower', name: 'Wolkenkrabber', desc: 'Plaats een blok op minstens 50 m hoogte.', goal: 50, stat: 'maxPlaceH' },
  { id: 'bridge', name: 'Brugbouwer', desc: 'Plaats 20 blokken boven water, bijvoorbeeld een brug over de Main.', goal: 20, stat: 'overWater' },
  { id: 'park', name: 'Groene stad', desc: 'Plaats 30 blokken gras, bladeren, haag of bloemen: maak een park.', goal: 30, stat: 'green' },
  { id: 'glass', name: 'Glazen toren', desc: 'Plaats 100 glasblokken.', goal: 100, stat: 'glass' },
  { id: 'view', name: 'Uitzicht', desc: 'Vlieg tot 250 m hoogte.', goal: 250, stat: 'maxH' },
  { id: 'explore', name: 'Ontdekker', desc: 'Leg 5 km af in de stad.', goal: 5000, stat: 'dist' },
  { id: 'night', name: 'Nachtbraker', desc: 'Bekijk de stad tussen 23 en 1 uur ’s nachts.', goal: 1, stat: 'night' },
];

export class Missions {
  constructor(onDone) {
    this.onDone = onDone;
    try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); this.stats = j.stats || {}; this.done = new Set(j.done || []); }
    catch { this.stats = {}; this.done = new Set(); }
    this.lastSave = 0;
  }
  add(stat, n = 1) { this.stats[stat] = (this.stats[stat] || 0) + n; this.check(); }
  max(stat, v) { if (v > (this.stats[stat] || 0)) { this.stats[stat] = v; this.check(); } }
  check() {
    for (const m of MISSIONS) {
      if (this.done.has(m.id)) continue;
      if ((this.stats[m.stat] || 0) >= m.goal) { this.done.add(m.id); this.onDone?.(m); this.save(true); }
    }
    this.save();
  }
  save(force) {
    const now = Date.now();
    if (!force && now - this.lastSave < 3000) return;
    this.lastSave = now;
    try { localStorage.setItem(KEY, JSON.stringify({ stats: this.stats, done: [...this.done] })); } catch { /* geen opslag */ }
  }
  render(el) {
    if (!el) return;
    el.innerHTML = '';
    for (const m of MISSIONS) {
      const v = Math.min(m.goal, Math.floor(this.stats[m.stat] || 0)), ok = this.done.has(m.id);
      const row = document.createElement('div');
      row.className = 'mission' + (ok ? ' ok' : '');
      row.innerHTML = `<span class="mi">${ok ? '✓' : '○'}</span><span class="mt"><b></b><br><span class="small muted"></span></span><span class="mp small">${ok ? 'klaar' : m.goal > 1 ? `${v} / ${m.goal}` : ''}</span>`;
      row.querySelector('b').textContent = m.name;
      row.querySelector('.muted').textContent = m.desc;
      el.appendChild(row);
    }
  }
}
