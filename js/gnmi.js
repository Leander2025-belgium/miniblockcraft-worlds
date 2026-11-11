// GNMI – Greenislands Nationaal Meteorologisch Instituut (naam canon). Weer per regio met waarschuwingen.
// Het weer is een deterministisch model (voorstel): het hangt af van de tijd (echte klok), de regio, de hoogte en
// de nabijheid van de zee, zodat iedereen op hetzelfde moment hetzelfde weer ziet. Klimaat: iets warmer dan België (canon).
// Geen three.js: ook bruikbaar in tests.
import { PROVINCES, provinceAt } from './greenisland-data.js';
import { rawHeight, coastDist } from './greenisland-terrain.js';
import { noise } from './city.js';

// regio's: de vijf provincies (canon) en het Viridonia Gebergte (eigen bergweer)
export const REGIONS = [
  ...PROVINCES.map((p, i) => ({ id: p.id, name: p.name, seed: 11 + i * 7, coast: p.id !== 'C' })),
  { id: 'M', name: 'Viridonia Gebergte', seed: 61, mountain: true },
];
const MOUNTAIN = { x: 76000, z: 22000, rx: 16000, rz: 9000 };
export function regionAt(x, z) {
  if (Math.hypot((x - MOUNTAIN.x) / MOUNTAIN.rx, (z - MOUNTAIN.z) / MOUNTAIN.rz) < 1) return REGIONS.find(r => r.id === 'M');
  return REGIONS.find(r => r.id === provinceAt(x, z));
}
// maand (0–11) en dag van het jaar uit een tijdstip (ms)
const seasonOf = (ms) => { const d = new Date(ms), start = new Date(d.getFullYear(), 0, 1); return (d - start) / 86400000 / 365; };
const smooth = (t, s) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return noise(i, s, 3) * (1 - u) + noise(i + 1, s, 3) * u; };

// weer in een regio op een tijdstip: { temp, wind, rain (mm/u), cloud (0..1), fog, kind, icon, text }
export function weatherIn(R, ms = Date.now(), alt = null) {
  const hours = ms / 3600000, yr = seasonOf(ms), hod = new Date(ms).getHours() + new Date(ms).getMinutes() / 60;
  // gemeenschappelijk weersysteem (fronten trekken van west naar oost) + lokale verschillen per regio
  const lag = R.id === 'W' ? 0 : R.id === 'E' ? 3 : R.id === 'M' ? 1.5 : 1.5;
  const front = smooth((hours - lag) / 9, 5), local = smooth(hours / 4, R.seed), gust = smooth(hours / 2, R.seed + 3);
  const season = Math.cos((yr - 0.55) * Math.PI * 2); // +1 midden zomer, -1 midden winter
  // temperatuur: iets warmer dan België (jaargemiddelde ± 11,5 °C), dagelijkse gang, bergen kouder
  const height = alt ?? (R.mountain ? 1400 : R.id === 'C' ? 120 : 40);
  let temp = 11.5 + 8.5 * season + 4.5 * Math.cos((hod - 15) / 24 * Math.PI * 2) + (local - 0.5) * 5 - height * 0.0065;
  if (R.coast) temp = temp * 0.85 + 11.5 * 0.15; // zee dempt
  const cloud = Math.max(0, Math.min(1, front * 1.25 - 0.15 + (local - 0.5) * 0.5 + (R.mountain ? 0.15 : 0)));
  let rain = cloud > 0.66 ? (cloud - 0.66) * 16 * (0.5 + local) * (R.mountain ? 1.4 : 1) : 0;
  let wind = 6 + front * 26 + gust * 16 + (R.coast ? 7 : 0) + (R.mountain ? 14 : 0) + Math.max(0, front - 0.82) * 160;
  const storm = rain > 6 && wind > 45 && temp > 12;
  const fog = !rain && cloud < 0.45 && (hod < 9 || hod > 22) && local > 0.74;
  const snow = rain > 0.2 && temp < 1.2;
  const kind = storm ? 'storm' : snow ? 'snow' : rain > 0.2 ? 'rain' : fog ? 'fog' : cloud > 0.55 ? 'cloudy' : 'clear';
  const icon = { storm: '⛈', snow: '🌨', rain: '🌧', fog: '🌫', cloudy: '☁', clear: hod > 6.5 && hod < 21 ? '☀' : '🌙' }[kind];
  const text = { storm: 'onweer en stortregen', snow: 'sneeuw', rain: rain > 4 ? 'zware regen' : 'regen', fog: 'mist', cloudy: 'bewolkt', clear: 'helder' }[kind];
  return { region: R.id, name: R.name, temp: Math.round(temp * 10) / 10, wind: Math.round(wind), rain: Math.round(rain * 10) / 10, cloud, fog, kind, icon, text };
}
// waarschuwingen (code geel, oranje, rood) volgens de drempels van het GNMI (voorstel)
export function warningsFor(w) {
  const out = [], add = (level, what) => out.push({ level, what });
  if (w.wind >= 100) add('rood', `zeer zware windstoten (${w.wind} km/u)`); else if (w.wind >= 80) add('oranje', `zware windstoten (${w.wind} km/u)`); else if (w.wind >= 62) add('geel', `windstoten (${w.wind} km/u)`);
  if (w.rain >= 15) add('oranje', `zeer veel neerslag (${w.rain} mm/u)`); else if (w.rain >= 7) add('geel', `veel neerslag (${w.rain} mm/u)`);
  if (w.kind === 'storm') add(w.wind >= 80 ? 'oranje' : 'geel', 'onweer');
  if (w.kind === 'snow') add(w.rain >= 3 ? 'oranje' : 'geel', 'sneeuw en gladheid');
  if (w.temp >= 35) add('oranje', `hitte (${w.temp} °C)`); else if (w.temp >= 30) add('geel', `hitte (${w.temp} °C)`);
  if (w.temp <= -10) add('oranje', `strenge vorst (${w.temp} °C)`); else if (w.temp <= -4) add('geel', `vorst en gladheid (${w.temp} °C)`);
  if (w.fog) add('geel', 'dichte mist');
  return out;
}
export const LEVEL_RANK = { geel: 1, oranje: 2, rood: 3 };
// het weer op een plek (met de echte hoogte en kust)
export function weatherAt(x, z, ms = Date.now()) {
  const R = regionAt(x, z), h = Math.max(0, rawHeight(x, z)), w = weatherIn(R, ms, h);
  if (coastDist(x, z) < 1500 && w.wind) w.wind = Math.round(w.wind * 1.15);
  return w;
}
// overzicht voor het weerpaneel: alle regio's, nu en de komende uren
export function overview(ms = Date.now()) {
  return REGIONS.map(R => {
    const now = weatherIn(R, ms), next = [3, 6, 12].map(h => ({ h, w: weatherIn(R, ms + h * 3600000) }));
    return { R, now, warn: warningsFor(now), next };
  });
}
