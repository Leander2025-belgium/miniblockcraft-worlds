// Dienstregeling voor het verkeer op het wegen- en sporennet (Megatower City, Nova Metropool, steden):
// dezelfde periodes als de treinen (js/rail.js): spits 7–9 u en 16–19 u, daluren 5–7 u, 9–16 u en 19–22 u,
// avond 22–24 u, nacht 0–5 u. Per periode rijden er minder metro's, trams en bussen (ook minder auto's), en
// zijn de haltetijden anders. Het uur is het speluur (instelling "tijd", 1 uur per 30 s als de klok loopt).
export function periodOfHour(h) {
  h = ((h % 24) + 24) % 24;
  if ((h >= 7 && h < 9) || (h >= 16 && h < 19)) return 'spits';
  if ((h >= 9 && h < 16) || (h >= 19 && h < 22) || (h >= 5 && h < 7)) return 'dal';
  if (h >= 22) return 'avond';
  return 'nacht';
}
// deel van de voertuigen dat rijdt, per soort en periode
export const SERVICE = {
  spits: { metro: 1, tram: 1, bus: 1, car: 1, train: 1 },
  dal: { metro: 0.6, tram: 0.6, bus: 0.6, car: 0.75, train: 0.75 },
  avond: { metro: 0.45, tram: 0.4, bus: 0.4, car: 0.5, train: 0.5 },
  nacht: { metro: 0.25, tram: 0.25, bus: 0.25, car: 0.2, train: 0.34 },
};
// haltetijd in seconden: in de spits langer (meer reizigers)
export const DWELL = { spits: { metro: 24, tram: 18, bus: 14, train: 30 }, dal: { metro: 18, tram: 14, bus: 10, train: 25 }, avond: { metro: 16, tram: 12, bus: 9, train: 22 }, nacht: { metro: 14, tram: 10, bus: 8, train: 20 } };
export const PERIOD_LABEL = { spits: 'spits', dal: 'daluren', avond: 'avond', nacht: 'nacht' };
// hoeveel van een soort er rijdt (minstens 1 als er al één zou rijden)
export function scaled(n, kind, period) { const f = SERVICE[period][kind] ?? 1; return n > 0 ? Math.max(1, Math.round(n * f)) : 0; }
// interval (seconden speltijd) tussen twee voertuigen van dezelfde soort die in dienst komen
export const HEADWAY = { spits: { metro: 120, tram: 150, bus: 100 }, dal: { metro: 240, tram: 300, bus: 200 }, avond: { metro: 360, tram: 420, bus: 300 }, nacht: { metro: 600, tram: 900, bus: 600 } };
