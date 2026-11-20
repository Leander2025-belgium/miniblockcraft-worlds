// Live OV-kaart van Megatower City (TERRANOVA 14.1): alle lijnen (metro M1, trein IC, trams T1–T4), haltes en de
// voertuigen die nu rijden. Rond de speler (±430 m) zijn dat de echte voertuigen van het verkeer (js/traffic.js), met
// hun rit uit de ritlaag (js/ovtrips.js): ritnummer, bezetting, volgende halte. Daarbuiten rekent de kaart de
// voertuigen uit de dienstregeling van de planner (js/megaplan.js) en toont ze als 'volgens dienstregeling'.
// Klik op een voertuig: lijn, richting, volgende halte, rit en bezetting. Klik op een halte: de volgende vertrekken
// en een knop om er met de reisplanner naartoe te gaan. Wordt elke seconde ververst zolang de kaart open is.
import { LINES, scheduled, departures, fmtTime, STOPS } from './megaplan.js';
import { MW, ML } from './megacity.js';

const NEAR = 430, KIND_ICON = { metro: '🚇', tram: '🚊', train: '🚆', trein: '🚆', bus: '🚌' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openOvMap(game) {
  const ov = document.getElementById('ov-ovmap'), c = document.getElementById('ovmap'), info = document.getElementById('ovmap-info');
  if (!ov || !c) return false;
  const S = { sel: null, items: [] };
  const hourNow = () => game.settings.hour ?? 12;
  const draw = () => {
    const W = 900, H = Math.round(W * ML / MW), k = W / MW; c.width = W; c.height = H; c.style.aspectRatio = `${W} / ${H}`;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, W, H);
    if (game.mini) { ctx.globalAlpha = 0.55; ctx.imageSmoothingEnabled = true; ctx.drawImage(game.mini.canvas, 0, 0, game.mini.sizeX / game.mini.scale, game.mini.sizeZ / game.mini.scale, 0, 0, game.mini.sizeX * k, game.mini.sizeZ * k); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(10,14,22,.35)'; ctx.fillRect(0, 0, W, H);
    // lijnen
    for (const L of LINES) {
      ctx.strokeStyle = L.color; ctx.lineWidth = L.mode === 'tram' ? 3 : 5; ctx.lineCap = 'round'; ctx.setLineDash(L.mode === 'metro' ? [8, 5] : []);
      ctx.beginPath(); L.stops.forEach((s, i) => (i ? ctx.lineTo(s.x * k, s.z * k) : ctx.moveTo(s.x * k, s.z * k))); ctx.stroke(); ctx.setLineDash([]);
    }
    S.items = [];
    // haltes
    for (const L of LINES) for (const s of L.stops) {
      const big = L.mode !== 'tram';
      ctx.fillStyle = S.sel?.stop === s.name ? '#ffd34d' : '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x * k, s.z * k, big ? 5 : 3, 0, 7); ctx.fill(); ctx.stroke();
      if (big) { ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(s.name.replace('Metro ', '').replace('Station ', ''), s.x * k + 1, s.z * k - 8); ctx.fillStyle = '#fff'; ctx.fillText(s.name.replace('Metro ', '').replace('Station ', ''), s.x * k, s.z * k - 9); }
      S.items.push({ type: 'stop', x: s.x, z: s.z, name: s.name, line: L.line, mode: L.mode });
    }
    // gebied van het echte verkeer
    const p = game.player.pos;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(p.x * k, p.z * k, NEAR * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // voertuigen: echt (rond de speler) en volgens de dienstregeling (daarbuiten)
    const real = (game.traffic?.agents || []).filter(a => !a.dead && ['metro', 'tram', 'train', 'bus'].includes(a.kind));
    for (const a of real) {
      const h = game.traffic.behind(a, 0, {});
      const T = a.trip, nx = game.traffic.nextStop?.(a);
      S.items.push({ type: 'veh', real: true, x: h.x, z: h.z, kind: a.kind, line: a.line || (a.kind === 'bus' ? 'bus' : a.kind), color: a.kind === 'metro' ? '#2f6db5' : a.kind === 'tram' ? '#e67e22' : a.kind === 'bus' ? '#27ae60' : '#f1c40f', trip: T ? { id: T.id, occ: T.occ, cap: T.cap, dest: T.dest, delay: T.delay } : null, next: nx?.name || null, at: a.wait > 0 ? a.atStop : null });
    }
    for (const v of scheduled(hourNow())) {
      if (Math.hypot(v.x - p.x, v.z - p.z) < NEAR) continue; // daar rijden de echte voertuigen
      S.items.push({ type: 'veh', real: false, ...v });
    }
    for (const it of S.items) {
      if (it.type !== 'veh') continue;
      const sel = S.sel && S.sel.veh && S.sel.veh.x === it.x && S.sel.veh.z === it.z;
      ctx.fillStyle = it.color; ctx.strokeStyle = sel ? '#ffd34d' : it.real ? '#fff' : 'rgba(255,255,255,.55)'; ctx.lineWidth = sel ? 3 : 1.5;
      const r = it.real ? 5 : 4; ctx.fillRect(it.x * k - r, it.z * k - r, 2 * r, 2 * r); ctx.strokeRect(it.x * k - r, it.z * k - r, 2 * r, 2 * r);
    }
    game.drawArrow?.(ctx, p.x * k, p.z * k, 10);
    const nReal = S.items.filter(i => i.type === 'veh' && i.real).length, nSch = S.items.filter(i => i.type === 'veh' && !i.real).length;
    document.getElementById('ovmap-count').textContent = `${fmtTime(hourNow() * 3600)} · ${nReal} voertuigen in beeld (echt, met rit en bezetting) · ${nSch} volgens dienstregeling`;
  };
  const showInfo = () => {
    const s = S.sel;
    if (!s) { info.innerHTML = '<span class="muted">Klik op een voertuig of een halte.</span>'; return; }
    if (s.veh) {
      const v = s.veh;
      info.innerHTML = `<b>${KIND_ICON[v.kind || v.mode] || ''} ${esc(v.line)}</b>${v.dir ? ' richting ' + esc(v.dir) : v.trip?.dest ? ' → ' + esc(v.trip.dest) : ''}<br>` +
        (v.real ? `<span class="small">In beeld (echt voertuig)${v.trip ? ` · rit ${esc(v.trip.id)} · bezetting ${v.trip.occ}/${v.trip.cap}${v.trip.delay ? ` · +${Math.round(v.trip.delay / 60)} min` : ''}` : ''}${v.at ? ` · staat aan ${esc(v.at)}` : v.next ? ` · volgende halte ${esc(v.next)}` : ''}</span>`
          : `<span class="small">Volgens dienstregeling · rit ${esc(v.id)} · volgende halte ${esc(v.next)} om ${fmtTime(v.nextT)}</span>`);
      return;
    }
    const deps = departures(s.stop, hourNow(), 6);
    info.innerHTML = `<b>${esc(s.stop)}</b><br>` + (deps.length ? `<table class="small">${deps.map(d => `<tr><td>${d.hhmm}</td><td><b style="color:${d.color}">${esc(d.line)}</b></td><td>→ ${esc(d.dir)}</td><td>${d.perron ? 'perron ' + d.perron : ''}</td></tr>`).join('')}</table>` : '<span class="small muted">Geen vertrekken meer vandaag.</span>') +
      `<div class="row" style="margin-top:4px"><button class="btn" id="ovmap-go">🧭 Reisplanner naar hier</button></div>`;
    document.getElementById('ovmap-go')?.addEventListener('click', () => {
      const st = STOPS.find(q => q.name === s.stop) || LINES.flatMap(L => L.stops).find(q => q.name === s.stop && Math.hypot(q.x - s.x, q.z - s.z) < 1);
      if (st && game.mega) { game.mega.navTo = { name: st.name, x: st.x, z: st.z }; game.toast?.(`🧭 Navigatie naar ${st.name}`); game.resume(); }
    });
  };
  if (!c.dataset.bound) {
    c.dataset.bound = '1';
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MW, z = (e.clientY - r.top) / r.height * ML, tol = 14 / r.width * MW;
      let best = null, bd = tol;
      for (const it of c._S.items) { const d = Math.hypot(it.x - x, it.z - z) - (it.type === 'veh' ? 0.3 * tol : 0); if (d < bd) { bd = d; best = it; } }
      c._S.sel = best ? (best.type === 'veh' ? { veh: best } : { stop: best.name, x: best.x, z: best.z }) : null;
      c._draw(); c._info();
    });
    document.getElementById('ovmap-close')?.addEventListener('click', () => game.resume());
  }
  c._S = S; c._draw = draw; c._info = showInfo;
  game.invOpen = true; game.invWhich = 'ovmap';
  if (document.pointerLockElement) document.exitPointerLock();
  game.paused = true;
  game.showOverlay('ovmap');
  draw(); showInfo();
  clearInterval(game.ovMapTimer);
  // live: het verkeer en de klok lopen door terwijl de kaart open is (paused houdt alleen de besturing tegen): elke seconde opnieuw tekenen
  game.ovMapTimer = setInterval(() => { if (ov.hidden) { clearInterval(game.ovMapTimer); return; } draw(); if (S.sel?.veh) { const v = S.items.find(i => i.type === 'veh' && (i.trip?.id ? i.trip.id === S.sel.veh.trip?.id : i.id === S.sel.veh.id)); if (v) S.sel.veh = v; } showInfo(); }, 1000);
  return true;
}
