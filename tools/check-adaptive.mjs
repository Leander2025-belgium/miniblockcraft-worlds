// Controle van de adaptieve kwaliteit (js/adaptive.js) met nagebootste frametijden, zonder browser.
// Een nagebootst toestel: de frametijd hangt af van de trede (resolutie, schaduwen, kijkafstand) en valt op
// vsync-stappen van 16,7 ms, zoals op een echt scherm van 60 Hz.
import { Adaptive, PROFILES, ladder } from '../js/adaptive.js';

const VS = 1000 / 60;
// kost in ms van het tekenen op trede st voor een toestel met basiskost base (op volle kwaliteit)
const cost = (base, st) => base * (0.35 + 0.65 * st.scale * st.scale) * (st.low ? 0.8 : 1) * (1 - st.cut / 400);
const vsync = (ms) => Math.max(1, Math.ceil(ms / VS - 0.02)) * VS;
function run(base, o, secs = 120, jitter = 0.04) {
  const A = new Adaptive(o); let st = A.state, t = 0, n = 0; const hist = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (t < secs * 1000) {
    const raw = cost(base, st) * (1 + (rnd() - 0.5) * 2 * jitter);
    const ft = o.cap ? Math.max(vsync(raw), 1000 / o.cap) : vsync(raw);
    const s = A.frame(ft); if (s) st = s;
    t += ft; n++; if (t > (secs - 20) * 1000) hist.push(ft);
  }
  const fps = hist.length / (hist.reduce((a, b) => a + b, 0) / 1000);
  return { fps: +fps.toFixed(1), eind: A.state, wijzigingen: A.log.length, log: A.log };
}
const R = {
  snel: run(10, {}),          // krachtig toestel: blijft op volle kwaliteit, 60 FPS
  middel: run(21, {}),        // net te traag voor 60 op vol: trapje omlaag tot 60 lukt
  traag: run(60, {}),         // haalt geen 60, ook niet op de laagste trede: stabiel 30
  traagAdaptief: run(40, { adaptView: true }),
  batterij: run(10, { cap: 30 }), // vaste grens 30: geen kwaliteit inleveren als 30 haalbaar is
};
const out = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, { fps: v.fps, eind: v.eind, wijzigingen: v.wijzigingen }]));
console.log('adaptief:', JSON.stringify(out));
const ok = R.snel.eind.level === 0 && R.snel.fps > 58
  && R.middel.fps > 57 && R.middel.eind.level > 0
  && R.traag.eind.target === 30 && R.traag.fps > 28 && R.traag.fps < 32
  && R.traagAdaptief.fps > 28
  && R.batterij.eind.level === 0 && R.batterij.fps > 28 && R.batterij.fps < 31
  && ladder(true).length > ladder(false).length - 1 && PROFILES.batterij.fpsCap === 30 && PROFILES.adaptief.adaptView
  // niet blijven schommelen: hoogstens een paar wijzigingen per minuut na het inregelen
  && R.middel.wijzigingen < 25 && R.traag.wijzigingen < 30;
console.log(ok ? 'alles goed' : 'FOUT');
process.exitCode = ok ? 0 : 1;
