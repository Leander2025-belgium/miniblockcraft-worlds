// Diagnose: een klein logboek dat een herstart van de pagina overleeft (localStorage), om te achterhalen waarom
// de game soms naar de startpagina springt (de browser sluit de pagina, de grafische kaart valt weg, een update …).
const KEY = 'blokstad-diag';
export function diag(event, info) {
  try {
    const l = JSON.parse(localStorage.getItem(KEY) || '[]');
    l.push({ t: Date.now(), e: event, i: info || null });
    while (l.length > 40) l.shift();
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch { /* geen opslag */ }
}
export function diagList() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function diagText() {
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  return [`Blokstad diagnose · ${new Date().toLocaleString('nl-BE')}`, ua, `scherm ${screen.width}×${screen.height} @${devicePixelRatio} · geheugen ${navigator.deviceMemory || '?'} GB · kernen ${navigator.hardwareConcurrency || '?'}`, '',
    ...diagList().map(d => `${new Date(d.t).toLocaleTimeString('nl-BE')} ${d.e}${d.i ? ' · ' + (typeof d.i === 'string' ? d.i : JSON.stringify(d.i)) : ''}`)].join('\n');
}
