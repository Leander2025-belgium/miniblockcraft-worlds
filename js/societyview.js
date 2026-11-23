// TERRANOVA 16 fase 5 — scherm 'Bewoners' (Megatower City): wat doet de stad nu, het verloop over de dag, een paar
// bewoners met hun dagplanning, en welke reizigers rond de speler bewoners zijn (met naam, beroep en doel).
const ICON = { slapen: '😴', thuis: '🏠', onderweg: '🚶', werk: '💼', school: '🎓', winkelen: '🛒', 'vrije tijd': '🌳' };
const COL = { slapen: '#3b4a6b', thuis: '#5b7fb3', onderweg: '#f0a43a', werk: '#4caf7a', school: '#8e6fd1', winkelen: '#e0607e', 'vrije tijd': '#3fb6c4' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = (h) => { h = ((h % 24) + 24) % 24; const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export async function renderSociety(g, el, dowOverride = null) {
  const S = await g.societyOn(); if (!S) { el.textContent = 'Alleen in Megatower City.'; return null; }
  const soc = S.soc, dow = dowOverride ?? S.dow(), hour = g.settings.hour ?? 12, c = soc.census(hour, dow), n = soc.people.length;
  const zone = (p) => (soc.zoneName ? soc.zoneName(p.x, p.z) : '') || '';
  let h = `<p class="small">${n.toLocaleString('nl-BE')} bewoners · <b>${soc.dayName(dow)} ${hhmm(hour)}</b></p><div class="soc-bars">`;
  for (const a of Object.keys(c)) h += `<div class="soc-bar" title="${a}"><span>${ICON[a]} ${a}</span><i style="width:${(c[a] / n * 100).toFixed(1)}%;background:${COL[a]}"></i><b>${c[a]}</b></div>`;
  h += '</div><p class="small" style="margin:8px 0 2px">Onderweg over de dag</p><canvas id="soc-curve" width="480" height="90" style="width:100%;height:90px;background:rgba(255,255,255,.04);border-radius:6px"></canvas>';
  // reizigers rond de speler die bewoners zijn
  const T = g.travelers, mine = T ? T.list.filter(t => t.who) : [];
  h += `<p class="small" style="margin:8px 0 2px">Bewoners op weg rond jou: <b>${mine.length}</b></p><ul class="soc-list">`;
  for (const t of mine.slice(0, 6)) h += `<li>${ICON.onderweg} <b>${esc(t.who.naam)}</b> (${t.who.leeftijd}), ${esc(t.who.beroep)} — ${esc(t.who.doel)} · ${esc(t.state || '')}</li>`;
  h += '</ul><p class="small" style="margin:8px 0 2px">Zo ziet hun dag eruit</p>';
  // vaste voorbeelden: één van elke soort
  const seen = new Set(), ex = soc.people.filter(p => !seen.has(p.job) && seen.add(p.job)).slice(0, 6);
  for (const p of ex) {
    const st = soc.state(p, hour, dow), pl = soc.plan(p, dow);
    h += `<div class="soc-person"><div><b>${esc(p.naam)}</b> · ${p.leeftijd} jaar · ${esc(p.beroep)}${p.shift ? ` (${hhmm(p.shift[0])}–${hhmm(p.shift[1])})` : ''} · woont in ${esc(zone(p.home))}</div>`;
    h += `<div class="soc-day" role="img" aria-label="Dagplanning van ${esc(p.naam)}">${pl.map(s => `<i title="${hhmm(s.van)}–${hhmm(s.tot)} ${s.act}" style="left:${(s.van / 24 * 100).toFixed(2)}%;width:${((s.tot - s.van) / 24 * 100).toFixed(2)}%;background:${COL[s.act]}"></i>`).join('')}<u style="left:${(hour / 24 * 100).toFixed(2)}%"></u></div>`;
    h += `<div class="small muted">Nu: ${ICON[st.act]} ${st.act}${st.doel ? ' (' + st.doel + ')' : ''} · ${pl.filter(s => s.act !== 'onderweg' && s.act !== 'slapen').map(s => `${hhmm(s.van)} ${s.act}`).join(' → ')}</div></div>`;
  }
  el.innerHTML = h;
  const cv = el.querySelector('#soc-curve'), x = cv.getContext('2d'), cur = soc.dayCurve(dow, 0.25), mx = Math.max(1, ...cur.map(q => q.onderweg));
  x.fillStyle = COL.onderweg; for (let i = 0; i < cur.length; i++) { const bh = cur[i].onderweg / mx * 80; x.fillRect(i * (cv.width / cur.length), 88 - bh, cv.width / cur.length - 1, bh); }
  x.fillStyle = '#fff'; x.fillRect(hour / 24 * cv.width, 0, 2, 90);
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '10px sans-serif'; for (const hh of [0, 6, 12, 18]) x.fillText(hhmm(hh), hh / 24 * cv.width + 2, 10);
  return { census: c, dow, onderweg: mine.length, voorbeelden: ex.length, curve: cur };
}
