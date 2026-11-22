// TERRANOVA 16 fase 11 — interface en toegankelijkheid:
// - tabbladen in het pauzemenu (Spel, Personage, Beeld, Tijd & weer, Geluid, Besturing, Toegankelijkheid), met
//   pijltjestoetsen te bedienen en het laatst gekozen tabblad onthouden;
// - tekstgrootte (85–150 %), grote knoppen, hoog contrast, minder beweging;
// - kleurfilters voor rood-, groen- en blauwzwak zien (daltonisering: het kleurverschil dat iemand niet ziet wordt
//   verschoven naar kleuren die wel te onderscheiden zijn) en grijstinten, op het spelbeeld;
// - geluiden als tekst (gong, donder, omroep) voor wie niet of slecht hoort.
// Alles staat in de gewone instellingen (blokstad-settings) en wordt meteen toegepast.
export const A11Y_DEFAULT = { uiScale: 100, bigButtons: false, contrast: false, reduceMotion: false, captions: false, colorFilter: '' };
// kleurmatrices (feColorMatrix, 4×5): daltonisering op basis van de simulatie van Viénot/Brettel
export const COLOR_MATRIX = {
  protan: '1 0 0 0 0  0.479 0.477 0.044 0 0  0.597 -0.689 1.091 0 0  0 0 0 1 0',
  deutan: '1 0 0 0 0  0.163 0.725 0.112 0 0  0.455 -0.645 1.191 0 0  0 0 0 1 0',
  tritan: '0.741 -0.407 0.666 0 0  0.075 0.585 0.340 0 0  0 0 1 0 0  0 0 0 1 0',
  grey: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0',
};
function ensureFilters() {
  if (document.getElementById('tn-color-filters')) return;
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.id = 'tn-color-filters'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  for (const [k, m] of Object.entries(COLOR_MATRIX)) {
    const f = document.createElementNS(NS, 'filter'); f.id = 'cf-' + k; f.setAttribute('color-interpolation-filters', 'sRGB');
    const c = document.createElementNS(NS, 'feColorMatrix'); c.setAttribute('type', 'matrix'); c.setAttribute('values', m);
    f.appendChild(c); svg.appendChild(f);
  }
  document.body.appendChild(svg);
}
// instellingen toepassen op de pagina
export function applyA11y(settings) {
  const s = { ...A11Y_DEFAULT, ...(settings || {}) }, root = document.documentElement, body = document.body;
  const scale = Math.max(85, Math.min(150, +s.uiScale || 100));
  root.style.setProperty('--ui-scale', String(scale / 100));
  root.style.fontSize = scale === 100 ? '' : scale + '%';
  body.classList.toggle('a11y-big', !!s.bigButtons);
  body.classList.toggle('a11y-contrast', !!s.contrast);
  // zonder eigen keuze volgt 'minder beweging' de instelling van het toestel
  const calm = settings && settings.reduceMotion !== undefined ? !!settings.reduceMotion : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  body.classList.toggle('a11y-calm', calm);
  const cv = document.getElementById('game-canvas');
  if (s.colorFilter && COLOR_MATRIX[s.colorFilter]) { ensureFilters(); if (cv) cv.style.filter = `url(#cf-${s.colorFilter})`; }
  else if (cv) cv.style.filter = '';
  return { scale, filter: cv ? cv.style.filter : null };
}
// ondertitels voor geluiden: korte tekst onderaan het scherm, een paar seconden
let capEl = null, capT = 0;
export function caption(settings, text, icon = '🔊') {
  if (!settings || !settings.captions) return false;
  if (!capEl) {
    capEl = document.createElement('div'); capEl.id = 'captions'; capEl.setAttribute('role', 'status'); capEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(capEl);
  }
  const line = document.createElement('div'); line.className = 'cap'; line.textContent = `${icon} ${text}`;
  capEl.appendChild(line); while (capEl.children.length > 3) capEl.firstChild.remove();
  clearTimeout(capT); capT = setTimeout(() => { if (capEl) capEl.textContent = ''; }, 4500);
  return true;
}
// tabbladen in het pauzemenu
export function bindTabs(rootId = 'pause-tabs', store = null) {
  const bar = document.getElementById(rootId); if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = '1';
  const card = bar.parentElement, tabs = [...bar.querySelectorAll('[data-tab]')];
  const show = (name, focus = false) => {
    for (const t of tabs) { const on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); }
    for (const p of card.querySelectorAll('.tabpane')) p.hidden = p.dataset.pane !== name;
    try { sessionStorage.setItem('tn-pause-tab', name); } catch { /* geen opslag */ }
    store?.(name);
  };
  for (const t of tabs) t.addEventListener('click', () => show(t.dataset.tab));
  bar.addEventListener('keydown', (e) => {
    const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); show(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.tab, true); }
  });
  let last = null; try { last = sessionStorage.getItem('tn-pause-tab'); } catch { /* geen opslag */ }
  show(tabs.some(t => t.dataset.tab === last) ? last : tabs[0].dataset.tab);
  return show;
}
// de bedieningselementen van het tabblad Toegankelijkheid koppelen
export function bindA11yControls(settings, save) {
  const s = settings, set = (k, v) => { s[k] = v; applyA11y(s); save(); };
  const sc = document.getElementById('set-uiscale'), lab = document.getElementById('set-uiscale-label');
  if (sc) { sc.value = s.uiScale || 100; if (lab) lab.textContent = (s.uiScale || 100) + ' %'; if (!sc.dataset.bound) { sc.dataset.bound = '1'; sc.addEventListener('input', () => { if (lab) lab.textContent = sc.value + ' %'; set('uiScale', +sc.value); }); } }
  for (const [id, k] of [['set-bigbtn', 'bigButtons'], ['set-contrast', 'contrast'], ['set-motion', 'reduceMotion'], ['set-captions', 'captions']]) {
    const el = document.getElementById(id); if (!el) continue;
    el.checked = !!s[k];
    if (!el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('change', () => set(k, el.checked)); }
  }
  const cf = document.getElementById('set-colorfilter');
  if (cf) { cf.value = s.colorFilter || ''; if (!cf.dataset.bound) { cf.dataset.bound = '1'; cf.addEventListener('change', () => set('colorFilter', cf.value)); } }
}
