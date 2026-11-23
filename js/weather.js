// Weer 16 (TERRANOVA 16, fase 3): één tabel met wat elk weertype doet, gebruikt door js/game.js (lucht, mist,
// neerslag, natte wegen, sneeuwdek), js/drive.js (grip van auto's en bussen), js/traffic.js (verkeer rijdt
// voorzichtiger) en js/rail.js (kleefkracht van treinen, bestond al).
//
// Nieuw t.o.v. 15: mist (zicht ± 120 m), harde wind (wolken en neerslag schuin), sneeuw die blijft liggen en weer
// smelt, en de invloed op het rijden: remweg en bochtgrip van auto's en bussen, voorzichtiger verkeer.
//   grip: 1 = droog; remmen en optrekken worden ermee vermenigvuldigd, sturen deels
//   speed: factor op de doelsnelheid van het verkeer
//   vis: zicht in m (mist), wind: m/s
export const WEATHER = {
  clear: { grey: 0, cover: 0.38, wet: 0, precip: null, wind: 3, grip: 1, speed: 1, vis: null },
  cloudy: { grey: 0.35, cover: 0.7, wet: 0, precip: null, wind: 5, grip: 1, speed: 1, vis: null },
  rain: { grey: 0.55, cover: 0.85, wet: 0.8, precip: 'rain', wind: 6, grip: 0.75, speed: 0.9, vis: 260 },
  storm: { grey: 0.75, cover: 0.95, wet: 1, precip: 'rain', wind: 17, grip: 0.65, speed: 0.8, vis: 180 },
  snow: { grey: 0.45, cover: 0.8, wet: 0, precip: 'snow', wind: 4, grip: 0.45, speed: 0.7, vis: 220 },
  mist: { grey: 0.5, cover: 0.9, wet: 0.15, precip: null, wind: 1, grip: 0.95, speed: 0.8, vis: 120 },
  wind: { grey: 0.2, cover: 0.6, wet: 0, precip: null, wind: 14, grip: 1, speed: 0.95, vis: null },
};
export const weatherOf = (w) => WEATHER[w] || WEATHER.clear;

// sneeuwdek: groeit tijdens sneeuw (± 4 min tot volledig wit), smelt daarna langzaam (± 15 min)
export function snowStep(cover, w, dt) {
  if (w === 'snow') return Math.min(1, cover + dt / 240);
  return Math.max(0, cover - dt / (w === 'rain' || w === 'storm' ? 300 : 900));
}
// grip van de weg: weertype, plus natheid en sneeuwdek die nog liggen als het weer al omsloeg
export function roadGrip(w, wet, snow) {
  return Math.max(0.35, Math.min(weatherOf(w).grip, 1 - 0.25 * wet, 1 - 0.55 * snow));
}
// windrichting draait langzaam (deterministisch in de tijd), sterkte uit het weertype met vlagen
export function windAt(w, t) {
  const W = weatherOf(w), dir = 0.6 + Math.sin(t / 300) * 0.8, gust = 1 + 0.25 * Math.sin(t * 0.7) * Math.sin(t * 0.23);
  const s = W.wind * gust;
  return { x: Math.cos(dir) * s, z: Math.sin(dir) * s, s };
}
