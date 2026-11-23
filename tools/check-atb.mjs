// Controle van de treinbeveiliging (js/atb.js) zonder browser: een nagebootste metro rijdt over een lijn met een
// voertuig ervoor. Seinbeelden, remcurve, ATB-waarschuwing en -ingreep, STS bij een rood sein, waakinrichting.
import { Safety, BLOCK_M, LINE_KMH } from '../js/atb.js';

const R = {};
// simulatie: eenvoudige rijdynamica (zoals js/traffic.js voor de speler)
function drive(kind, { gapAt, secs, ctl, start = 0, v0 = 0 }) {
  const S = new Safety(kind); let v = v0, odo = start, t = 0; const hist = [];
  while (t < secs) {
    const dt = 0.1, c = ctl(t, v, S.state || {}), gap = gapAt(t, odo);
    const st = S.step({ dt, v, odo, gap, stopDist: null, endOfLine: false, brake: c.brake || 0, activity: !!c.activity, ack: !!c.ack });
    const forced = st.brakeCmd, thr = forced ? 0 : (c.throttle || 0), brk = forced ? 1 : (c.brake || 0);
    v = Math.max(0, v + (1.3 * thr - 1.6 * brk - (forced === 'nood' ? 2.5 : 0)) * dt); odo += v * dt; t += dt;
    hist.push({ t, v, odo, ...st });
  }
  return { S, hist };
}
const B = BLOCK_M.metro;
// 1. vrije lijn: groen, mag tot de lijnsnelheid
{ const { hist } = drive('metro', { gapAt: () => Infinity, secs: 40, ctl: () => ({ throttle: 1, activity: true }) });
  const end = hist[hist.length - 1]; R.vrij = { beeld: end.aspect, toegestaan: end.allowedKmh, kmh: Math.round(end.v * 3.6) }; }
// 2. voertuig staat stil 700 m verder: het sein vóór het bezette blok wordt rood, de bestuurder remt op tijd → geen STS
{ const leader = 700; const { S, hist } = drive('metro', { gapAt: (t, odo) => leader - odo, secs: 120, v0: 15,
    ctl: (t, v, st) => ({ throttle: st.allowedKmh && v * 3.6 < st.allowedKmh - 8 ? 0.6 : 0, brake: st.allowedKmh !== undefined && v * 3.6 > st.allowedKmh - 3 ? 0.8 : 0, activity: true }) });
  const aspects = [...new Set(hist.map(h => h.aspect))]; const stop = hist[hist.length - 1];
  R.bezet = { beelden: aspects, sts: S.log.sts, ingrepen: S.log.ingrepen, stilVoorVoertuig: Math.round(leader - stop.odo), kmh: Math.round(stop.v * 3.6) }; }
// 3. bestuurder negeert alles (volle tractie): ATB waarschuwt, grijpt in; door rood = STS en noodremming
{ const leader = 900; const { S, hist } = drive('metro', { gapAt: (t, odo) => leader - odo, secs: 120, v0: 20, ctl: () => ({ throttle: 1, activity: true }) });
  const first = hist.findIndex(h => h.warn), forced = hist.findIndex(h => h.forced === 'atb');
  R.negeren = { waarschuwingen: S.log.waarschuwingen, ingrepen: S.log.ingrepen, sts: S.log.sts, eersteWaarschuwing: first >= 0 ? +hist[first].t.toFixed(1) : null, ingreepNa: forced >= 0 && first >= 0 ? +(hist[forced].t - hist[first].t).toFixed(1) : null, eindKmh: Math.round(hist[hist.length - 1].v * 3.6), nietBotst: leader - hist[hist.length - 1].odo > 0 }; }
// 4. remt binnen 3 s na de waarschuwing: geen ingreep
{ const { S } = drive('metro', { gapAt: () => Infinity, secs: 30, v0: 30, ctl: (t, v, st) => ({ brake: st.warn ? 1 : 0, activity: true }) });
  R.opTijd = { waarschuwingen: S.log.waarschuwingen, ingrepen: S.log.ingrepen }; }
// 5. waakinrichting: 60 s niets doen terwijl de trein rijdt → waarschuwing, na 5 s remming tot stilstand; B bevestigt
{ const { S, hist } = drive('metro', { gapAt: () => Infinity, secs: 110, v0: 12, ctl: (t, v) => ({ throttle: t < 2 ? 0.3 : 0, activity: t < 2, ack: t > 100 && v < 0.1 }) });
  const w = hist.findIndex(h => h.sifaWarn), f = hist.findIndex(h => h.forced === 'waak');
  R.waak = { waarschuwingNa: w >= 0 ? Math.round(hist[w].t) : null, remmingNa: f >= 0 ? Math.round(hist[f].t) : null, stil: hist[hist.length - 1].v < 0.1, vrijNaB: hist[hist.length - 1].forced === null, waakRemmingen: S.log.waak }; }
console.log(JSON.stringify(R));
const ok = R.vrij.beeld === 'groen' && R.vrij.toegestaan === LINE_KMH.metro
  && R.bezet.beelden.includes('geel') && R.bezet.beelden.includes('rood') && R.bezet.sts === 0 && R.bezet.stilVoorVoertuig > 0 && R.bezet.kmh === 0
  && R.negeren.waarschuwingen >= 1 && R.negeren.ingrepen >= 1 && R.negeren.ingreepNa >= 2.9 && R.negeren.ingreepNa <= 3.3 && R.negeren.eindKmh === 0 && R.negeren.nietBotst
  && R.opTijd.ingrepen === 0
  && R.waak.waarschuwingNa >= 60 && R.waak.waarschuwingNa <= 63 && R.waak.remmingNa >= 65 && R.waak.remmingNa <= 68 && R.waak.stil && R.waak.vrijNaB && R.waak.waakRemmingen === 1;
console.log(ok ? 'alles goed' : 'FOUT');
process.exitCode = ok ? 0 : 1;
