// TERRANOVA 16 fase 4 — treinbeveiliging voor zelf bestuurde metro's, treinen en trams (verkeerssimulatie, js/traffic.js):
// - blokseinen: de lijn is verdeeld in blokken (trein 400 m, metro 200 m, tram 120 m); het volgende sein staat op rood
//   als het blok erachter bezet is, op geel als het blok daarna bezet is, anders op groen; aan het einde van de lijn rood;
// - snelheidsbeperkingen: lijnsnelheid, lager bij het naderen van een halte en na een geel sein;
// - remcurve: de toegestane snelheid daalt vloeiend naar het doel (stilstand vóór een rood sein, of de
//   naderingssnelheid) met een vaste remvertraging;
// - ATB: te snel = eerst een waarschuwing (bel); remt de bestuurder niet binnen 3 s, dan remt de trein zelf tot onder
//   de toegestane snelheid; een rood sein voorbijrijden = stoptonend sein voorbij (STS): noodremming tot stilstand;
// - waakinrichting: wie 60 s niets bedient terwijl de trein rijdt, krijgt een waarschuwing; na 5 s zonder reactie
//   remt de trein tot stilstand. Elke bediening (tractie, rem, deuren, wissel, waakknop) telt.
// Alles is een zuivere toestandsmachine (step), los te testen zonder spel.
export const LINE_KMH = { train: 140, metro: 80, tram: 50 };
export const APPROACH_KMH = { train: 60, metro: 40, tram: 25 };
export const BLOCK_M = { train: 400, metro: 200, tram: 120 };
const DECEL = { train: 0.6, metro: 0.9, tram: 1.0 };  // m/s², voor de remcurve
const KMH = 3.6, WARN_S = 3, SIFA_S = 60, SIFA_GRACE = 5;

export class Safety {
  constructor(kind) {
    this.kind = BLOCK_M[kind] ? kind : 'metro';
    this.warnT = 0; this.forced = null; this.sifaT = 0; this.sifaWarn = false; this.prevSig = null;
    this.log = { waarschuwingen: 0, ingrepen: 0, sts: 0, waak: 0 };
  }
  // in: { dt, v (m/s), odo (m), gap (m tot voertuig ervoor, of Infinity), stopDist (m tot volgende halte of null),
  //       endOfLine, brake (0..1), activity (bool: bediening deze stap) }
  step(i) {
    const K = this.kind, B = BLOCK_M[K], v = i.v, out = {};
    // het volgende sein en zijn beeld
    const sigPos = (Math.floor(i.odo / B) + 1) * B, sigDist = sigPos - i.odo;
    let aspect = 'groen';
    if (i.endOfLine) aspect = 'rood';
    else if (Number.isFinite(i.gap)) { const rel = i.gap - sigDist; aspect = rel < B ? 'rood' : rel < 2 * B ? 'geel' : 'groen'; }
    // STS: het sein waar we op afreden stond op rood en we zijn erover (de sein-positie is net gepasseerd)
    if (this.prevSig && i.odo >= this.prevSig.pos && this.prevSig.aspect === 'rood' && v > 0.3) {
      this.forced = 'sts'; this.log.sts++; out.event = 'sts';
    }
    this.prevSig = { pos: sigPos, aspect };
    // toegestane snelheid (m/s): lijnsnelheid, naderen van een halte, en de remcurve naar het doel van het sein
    const line = LINE_KMH[K] / KMH, appr = APPROACH_KMH[K] / KMH, d = DECEL[K];
    let allowed = line;
    if (i.stopDist !== null && i.stopDist !== undefined && i.stopDist < 300) allowed = Math.min(allowed, Math.sqrt(appr * appr + 2 * d * Math.max(0, i.stopDist - 150)));
    if (aspect === 'geel') allowed = Math.min(allowed, Math.sqrt(appr * appr + 2 * d * Math.max(0, sigDist)));
    if (aspect === 'rood') allowed = Math.min(allowed, Math.sqrt(2 * d * Math.max(0, sigDist - 15)) + (sigDist > 15 ? 1.4 : 0));
    // ATB: waarschuwen, dan zelf remmen
    const over = v > allowed + 5 / KMH;
    if (this.forced === 'atb' && v <= Math.max(0, allowed - 2 / KMH)) this.forced = null;
    if (over && !this.forced) {
      if (this.warnT === 0) { this.log.waarschuwingen++; out.event = out.event || 'waarschuwing'; }
      this.warnT += i.dt;
      if (i.brake > 0.3) this.warnT = Math.min(this.warnT, WARN_S - 0.01); // de bestuurder reageert: geen ingreep
      if (this.warnT >= WARN_S) { this.forced = 'atb'; this.log.ingrepen++; out.event = 'ingreep'; }
    } else if (!over) this.warnT = 0;
    // waakinrichting
    if (i.activity || v < 0.5) { this.sifaT = 0; if (this.forced !== 'waak') this.sifaWarn = false; } // een waakremming blijft tot stilstand + bevestiging (B)
    else {
      this.sifaT += i.dt;
      if (this.sifaT >= SIFA_S && !this.sifaWarn) { this.sifaWarn = true; out.event = out.event || 'waak'; }
      if (this.sifaT >= SIFA_S + SIFA_GRACE && this.forced !== 'sts' && this.forced !== 'waak') { this.forced = 'waak'; this.log.waak++; out.event = 'waakremming'; }
    }
    // na een STS of waakremming pas vrij als de trein stilstaat en de bestuurder bevestigt (i.ack)
    if ((this.forced === 'sts' || this.forced === 'waak') && v < 0.1 && i.ack) { this.forced = null; this.sifaT = 0; this.sifaWarn = false; }
    Object.assign(out, { aspect, sigDist: Math.round(sigDist), allowedKmh: Math.round(allowed * KMH), lineKmh: LINE_KMH[K], warn: this.warnT > 0 && !this.forced, forced: this.forced,
      sifaLeft: Math.max(0, Math.round(SIFA_S - this.sifaT)), sifaWarn: this.sifaWarn });
    // remkracht die de beveiliging oplegt (0..1, en noodremming)
    out.brakeCmd = this.forced === 'sts' ? 'nood' : this.forced ? 1 : 0;
    this.state = out;
    return out;
  }
}
