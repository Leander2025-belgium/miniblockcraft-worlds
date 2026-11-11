// ViridCoin (VC) – de munt van Greenisland (naam canon). Eenvoudige economie (voorstel), bewaard op dit toestel:
// verdienen met opdrachten en een dagbonus, betalen voor OV-kaartjes en voor een eigen Zenvo uit de showroom.
const KEY = 'blokstad-viridcoin';
export const START = 500;
// Zenvo-modellen (Zenvo canon; modellen en prijzen voorstel)
export const ZENVO_MODELS = [
  { id: 'city', name: 'Zenvo City', desc: 'kleine stadsauto', price: 420, color: 0x2f9e44 },
  { id: 'volt', name: 'Zenvo Volt', desc: 'elektrische gezinsauto', price: 950, color: 0xf4f4f0 },
  { id: 'tourer', name: 'Zenvo Tourer', desc: 'ruime stationwagen', price: 780, color: 0x1f4e9e },
  { id: 'gt', name: 'Zenvo GT', desc: 'sportwagen (testterrein Riverside)', price: 1500, color: 0xc8102e },
];
// prijs van een enkel kaartje (VC)
export function ticketPrice(sv) {
  if (sv.international) return 29;
  if (sv.bus === 'express' || sv.bus === 'regional' || sv.bus === 'mountain') return 3.4;
  if (sv.metro || sv.tram || sv.bus) return 1.9;
  return 4.2;
}
export class Wallet {
  constructor() {
    let j = {};
    try { j = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { j = {}; }
    this.balance = typeof j.balance === 'number' ? j.balance : START;
    this.history = Array.isArray(j.history) ? j.history : [{ t: Date.now(), n: START, what: 'startkapitaal' }];
    this.cars = Array.isArray(j.cars) ? j.cars : [];
    this.lastBonus = j.lastBonus || null;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ balance: this.balance, history: this.history.slice(-40), cars: this.cars, lastBonus: this.lastBonus })); } catch { /* geen opslag */ } }
  add(n, what) { this.balance = Math.round((this.balance + n) * 100) / 100; this.history.push({ t: Date.now(), n, what }); this.save(); }
  earn(n, what) { this.add(n, what); }
  pay(n, what) { if (this.balance < n) return false; this.add(-n, what); return true; }
  // dagbonus: de eerste keer per kalenderdag in Greenisland
  dailyBonus() { const d = new Date().toISOString().slice(0, 10); if (this.lastBonus === d) return 0; this.lastBonus = d; this.add(25, 'dagbonus'); return 25; }
  buy(model) { if (this.cars.includes(model.id)) return 'al'; if (!this.pay(model.price, `${model.name} gekocht`)) return 'geld'; this.cars.push(model.id); this.save(); return 'ok'; }
}
export const fmt = (n) => `${n.toLocaleString('nl-BE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} VC`;
