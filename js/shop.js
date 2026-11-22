// TERRANOVA 16 fase 7 — winkel: kopen met ViridCoin (spelgeld, geen echt geld). Wat je koopt blijft van jou
// (opslag 'terranova-shop'); kleren die vroeger al gratis waren (pet, muts, rugzak) blijven gratis.
// Sommige artikelen vragen een rijbewijs of brevet (de OV-pet: een brevet voor bus, tram, metro of trein).
export const SHOP = [
  { id: 'helm', naam: 'Bouwhelm', prijs: 150, soort: 'hoofd', look: { hat: 'helm' }, uitleg: 'Gele veiligheidshelm voor op de bouwplaats.' },
  { id: 'ovpet', naam: 'OV-pet', prijs: 250, soort: 'hoofd', look: { hat: 'ovpet' }, uitleg: 'Donkerblauwe pet van het rijdend personeel.', vereist: 'brevet' },
  { id: 'tophoed', naam: 'Hoge hoed', prijs: 400, soort: 'hoofd', look: { hat: 'tophoed' }, uitleg: 'Voor een deftig bezoek aan de Megatower.' },
];
const KEY = 'terranova-shop';
export class Shop {
  constructor(wallet, career) {
    this.w = wallet; this.c = career;
    try { this.s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { this.s = null; }
    if (!this.s || !Array.isArray(this.s.owned)) this.s = { owned: [] };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* geen opslag */ } }
  owns(id) { return this.s.owned.includes(id); }
  hasLicense() { const L = this.c && this.c.p && this.c.p.licenses; return !!L && Object.keys(L).some(k => ['bus', 'tram', 'metro', 'trein'].includes(k)); }
  // 'ok' | 'al' | 'geld' | 'brevet' | 'onbekend'
  buy(id) {
    const it = SHOP.find(x => x.id === id); if (!it) return 'onbekend';
    if (this.owns(id)) return 'al';
    if (it.vereist === 'brevet' && !this.hasLicense()) return 'brevet';
    if (!this.w.pay(it.prijs, `winkel: ${it.naam}`)) return 'geld';
    this.s.owned.push(id); this.save(); return 'ok';
  }
  // mag dit hoofddeksel gedragen worden? (gratis of gekocht)
  allowedHat(hat) { const it = SHOP.find(x => x.look.hat === hat); return !it || this.owns(it.id); }
}
