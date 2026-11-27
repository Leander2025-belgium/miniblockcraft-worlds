// TERRANOVA 16.1 — herbruikbare winkelmodules voor Megatower Galleria, Grand Boulevard en de stationshal van
// Megatower Grand Central. Eén winkel is een rechthoek van w × d cellen en H lagen hoog (vloer, 3 lagen ruimte,
// plafond). De voorkant (v = 0) is een glazen pui met een open ingang van 2 m en een etalage; de zijmuren en de
// achtermuur zijn dicht. Binnen staat een inrichting die bij de soort past: rekken met producten, toonbanken,
// kassa's, paskamers, vitrines, tafels en een keuken (horeca), lampen aan het plafond en waar de winkel diep genoeg is
// een personeelsruimte met een deur achteraan. Alles is deterministisch (dezelfde winkel geeft altijd dezelfde blokken)
// en zonder three.js, zodat de worker (js/worker.js) het kan gebruiken. Fictieve namen, eigen ontwerpen.
import { B } from './blocks.js';

const h = (a, b, c) => { let x = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// soort → naam van de soort, mogelijke (fictieve) namen, gevelkleur, vloer
export const SHOP_KINDS = {
  kleding: { soort: 'Kledingwinkel', namen: ['Nova Mode', 'Linnen & Lint', 'Urban Vire', 'Maison Terra', 'Stofwisseling', 'Kleurrijk'], kleur: B.PAINT_BLACK, vloer: B.PARQUET },
  schoenen: { soort: 'Schoenenwinkel', namen: ['Stapwijs', 'Sole Atelier', 'Hak & Zool'], kleur: B.PAINT_RED, vloer: B.CARPET_GREY },
  elektronica: { soort: 'Elektronicawinkel', namen: ['Voltix', 'Pixelhuis', 'Stroomlijn'], kleur: B.PAINT_BLUE, vloer: B.TILE },
  telefoon: { soort: 'Telefoonwinkel', namen: ['Belzone', 'Mobilux', 'Signaal'], kleur: B.PAINT_ORANGE, vloer: B.TILE },
  supermarkt: { soort: 'Supermarkt', namen: ['Versmarkt', 'Dagvers', 'Buurtwinkel Plus'], kleur: B.PAINT_GREEN, vloer: B.TILE },
  boek: { soort: 'Boekhandel', namen: ['De Leeshoek', 'Papierwerk', 'Bladzijde'], kleur: B.PAINT_GREEN, vloer: B.PARQUET },
  speelgoed: { soort: 'Speelgoedwinkel', namen: ['Speelparadijs', 'Blokkendoos', 'Toverhoed'], kleur: B.PAINT_YELLOW, vloer: B.CARPET_BLUE },
  sport: { soort: 'Sportwinkel', namen: ['Sprintsport', 'Topfit', 'Doelpunt'], kleur: B.PAINT_BLUE, vloer: B.CARPET_GREY },
  meubel: { soort: 'Meubelwinkel', namen: ['Woonwerf', 'Zitkamer & Co', 'Hout & Huis'], kleur: B.PAINT_WHITE, vloer: B.PARQUET },
  parfum: { soort: 'Parfumerie', namen: ['Odeur', 'Bloesem Parfumerie', 'Essentie'], kleur: B.PAINT_WHITE, vloer: B.MARBLE },
  bakker: { soort: 'Bakkerij', namen: ['Bakkerij Korenaar', 'Het Broodhuis', 'Ovenvers'], kleur: B.PAINT_ORANGE, vloer: B.TILE },
  chocolade: { soort: 'Chocolatier', namen: ['Cacaohuis', 'Praline Atelier', 'Bonbonnière'], kleur: B.DARK_PLANKS, vloer: B.PARQUET },
  juwelier: { soort: 'Juwelier', namen: ['Goudsmid Aurel', 'Diamantzaal', 'Edelsteen'], kleur: B.PAINT_BLACK, vloer: B.MARBLE },
  warenhuis: { soort: 'Warenhuis', namen: ['Grand Magasin Terra', 'Warenhuis Novaplein'], kleur: B.COPPER, vloer: B.MARBLE },
  cadeau: { soort: 'Cadeauwinkel', namen: ['Cadeaukamer', 'Souvenir Megatower', 'Klein Geluk'], kleur: B.PAINT_RED, vloer: B.PARQUET },
  apotheek: { soort: 'Apotheek', namen: ['Apotheek Centraal', 'Kruidenhuis'], kleur: B.PAINT_GREEN, vloer: B.TILE },
  restaurant: { soort: 'Restaurant', namen: ['Trattoria Vista', 'Wok & Co', 'Brasserie Perron', 'Sushi Kaze', 'Grill 1000', 'Le Petit Nord'], kleur: B.DARK_PLANKS, vloer: B.PARQUET, horeca: true },
  cafe: { soort: 'Café', namen: ['Koffiebar Boon', 'Café Perron', 'Theehuis Lente', 'Espresso Express'], kleur: B.COPPER, vloer: B.PARQUET, horeca: true },
  fastfood: { soort: 'Snelbuffet', namen: ['Burgerstation', 'Frituur De Gouden Friet', 'Pizza Rapido', 'Wrap & Roll'], kleur: B.PAINT_RED, vloer: B.TILE, horeca: true },
  toiletten: { soort: 'Toiletten', namen: ['Toiletten'], kleur: B.PANEL_WHITE, vloer: B.TILE, dienst: true },
  kluizen: { soort: 'Bagagekluizen', namen: ['Bagagekluizen'], kleur: B.METAL, vloer: B.TILE, dienst: true },
  loket: { soort: 'Ticketloketten', namen: ['Ticketloketten'], kleur: B.PAINT_BLUE, vloer: B.TILE, dienst: true },
};
// een rij winkels voor een strook van `len` cellen: breedtes 8..16 (groot voor supermarkt/warenhuis/restaurant)
const WIDTH = { supermarkt: 20, warenhuis: 24, restaurant: 14, meubel: 16, speelgoed: 12, sport: 12, kleding: 10, elektronica: 12, fastfood: 10, cafe: 10 };
export function planRow(len, kinds, seed, used) {
  const out = []; let u = 0, i = 0;
  while (u < len - 6) {
    const kind = kinds[i % kinds.length], w = Math.min(len - u, WIDTH[kind] || 8);
    if (w < 6) break;
    const K = SHOP_KINDS[kind], names = K.namen;
    let n = Math.floor(h(seed, i, 7) * names.length), name = names[n];
    for (let t = 0; used && used.has(name) && t < names.length; t++) name = names[(n + t + 1) % names.length];
    if (used && used.has(name) && !K.dienst) name = name + ' ' + (2 + Math.floor(h(seed, i, 9) * 7)); // tweede vestiging
    used && used.add(name);
    out.push({ kind, name, soort: K.soort, u0: u, w, seed: seed * 31 + i });
    u += w; i++;
  }
  return out;
}

// blok op plek (u, v, l) in een winkel van w × d × H (H = 5: vloer, 3 lagen, plafond). u = 0 en u = w - 1 zijn de
// zijmuren, v = 0 de pui, v = d - 1 de achtermuur. front = true: de pui is glas met een ingang en een etalage.
export function shopBlock(S, u, v, l, d, H = 5, front = true) {
  const { kind, w, seed } = S, K = SHOP_KINDS[kind] || SHOP_KINDS.kleding;
  const mid = Math.floor(w / 2), door = u === mid - 1 || u === mid;
  if (l === 0) return K.vloer;
  if (l === H - 1) return (u > 1 && u < w - 2 && v > 1 && v < d - 2 && (u + v * 3) % 5 === 0) ? B.LAMP : B.PANEL_WHITE;
  if (u === 0 || u === w - 1) return B.PANEL_WHITE;                                   // zijmuren
  if (v === d - 1) return B.PANEL_WHITE;                                              // achtermuur
  if (v === 0) {                                                                      // pui
    if (!front) return B.PANEL_WHITE;
    if (door) return l <= 2 ? 0 : B.GLASS;                                            // open ingang
    if (l === H - 2) return K.kleur;                                                  // band met de naam
    return (u === 1 || u === w - 2) ? B.METAL : B.GLASS;
  }
  const r = l - 1, staff = d >= 12 && v >= d - 4;                                     // personeelsruimte achteraan
  if (staff) {
    if (v === d - 4) return (u === 2 && r < 2) ? (r === 0 ? B.DOOR : B.DOOR_TOP) : B.PANEL_WHITE;
    if (r === 0 && u === w - 2 && v === d - 2) return B.TABLE;
    if (r === 0 && u === w - 3 && v === d - 2) return B.CHAIR;
    if (r <= 1 && u === 1 && v === d - 2) return B.SHELF;
    if (r === 0 && u === w - 2 && v === d - 3) return B.FRIDGE;
    return 0;
  }
  if (r === 2) return (u + v) % 7 === 3 && v > 1 ? B.LAMP : 0;                        // hangende lampen
  // etalage achter het glas (v = 1), niet voor de deur
  if (v === 1) {
    if (door || u === mid - 2 || u === mid + 1) return 0;
    if (K.horeca || K.dienst) return r === 0 && u % 3 === 1 ? B.PLANTER : 0;
    if (r === 0) return kind === 'kleding' || kind === 'warenhuis' ? (u % 2 ? B.MANNEQUIN : 0) : u % 2 ? displayOf(kind) : 0;
    return r === 1 && kind === 'kleding' && u % 2 ? B.MANNEQUIN : 0;
  }
  if (v === 2 && door) return 0;
  const inner = (k) => fill(kind, u, v, r, w, staff ? d : d, k, seed, mid);
  return inner();
}
function displayOf(kind) {
  return { schoenen: B.SHOE_SHELF, elektronica: B.TECH_SHELF, telefoon: B.TECH_SHELF, supermarkt: B.FRUIT_CRATE, boek: B.BOOKSHELF, speelgoed: B.TOY_SHELF,
    sport: B.SPORT_RACK, meubel: B.SOFA, parfum: B.PERFUME_SHELF, bakker: B.FOOD_SHELF, chocolade: B.FOOD_SHELF, juwelier: B.SHOWCASE, cadeau: B.TOY_SHELF, apotheek: B.SHELF }[kind] || B.SHELF;
}
// inrichting per soort; r = 0 (grond), 1 (bovenste rij van rekken); d = diepte van de verkoopruimte
function fill(kind, u, v, r, w, d, _k, seed, mid) {
  const dd = d >= 12 ? d - 4 : d - 1;                                                 // achterwand van de verkoopruimte
  const back = v === dd - 1, side = u === 1 || u === w - 2, aisle = u === mid - 1 || u === mid;
  const counter = v === 3 && u >= w - 5 && u <= w - 2;                                // toonbank met kassa rechts vooraan
  const tall = (b) => r <= 1 ? b : 0;
  switch (kind) {
    case 'kleding': case 'warenhuis': {
      if (counter) return r === 0 ? (u === w - 4 ? B.CASH_REGISTER : B.COUNTER) : 0;
      if (back && u >= 2 && u <= 4) return r === 0 ? 0 : B.WOOL_RED;                  // paskamers met gordijn
      if (side || back) return tall(r === 0 ? B.CLOTHES_RACK : B.SHELF);
      if (!aisle && v >= 5 && v < dd - 2 && v % 3 === 2 && u > 2 && u < w - 3) return r === 0 ? B.CLOTHES_RACK : 0;
      if (!aisle && v >= 5 && v % 3 === 0 && u % 4 === 2) return r === 0 ? B.TABLE : 0;
      return 0;
    }
    case 'schoenen': case 'sport': case 'speelgoed': case 'boek': case 'parfum': case 'cadeau': case 'apotheek': case 'elektronica': case 'telefoon': {
      const rack = kind === 'boek' ? B.BOOKSHELF : displayOf(kind);
      if (counter) return r === 0 ? (u === w - 4 ? B.CASH_REGISTER : (kind === 'telefoon' || kind === 'elektronica' ? B.SHOWCASE : B.COUNTER)) : 0;
      if (side || back) return tall(rack);
      if (!aisle && v >= 5 && v < dd - 1 && v % 3 === 2 && u > 2 && u < w - 3) return tall(kind === 'schoenen' ? (r === 0 ? B.SOFA : 0) : rack);
      return 0;
    }
    case 'meubel': {
      if (counter) return r === 0 ? (u === w - 4 ? B.CASH_REGISTER : B.COUNTER) : 0;
      if (back) return r === 0 ? B.WARDROBE : r === 1 ? B.WARDROBE : 0;
      const cell = ((u - 2) % 5 + 5) % 5, row = (v - 5) % 5;
      if (aisle || v < 5 || v >= dd - 1) return 0;
      if (r === 0 && row === 0 && cell < 3) return B.SOFA;
      if (r === 0 && row === 2 && cell === 1) return B.TABLE;
      if (r === 0 && row === 3 && cell === 4) return B.BED;
      if (row === 2 && cell === 3) return r === 0 ? B.CHAIR : 0;
      return 0;
    }
    case 'juwelier': case 'chocolade': case 'bakker': {
      const vit = kind === 'juwelier' ? B.SHOWCASE : B.FOOD_SHELF;
      if (v === 4 && u >= 2 && u <= w - 3 && !aisle) return r === 0 ? (u === w - 3 ? B.CASH_REGISTER : vit) : 0; // toonbank over de breedte
      if (v === 4 && aisle) return r === 0 ? B.COUNTER : 0;
      if (side && v < 4) return tall(kind === 'juwelier' ? B.SHOWCASE : B.FOOD_SHELF);
      if (v > 4 && (side || back)) return tall(kind === 'juwelier' ? B.SHELF : kind === 'bakker' ? B.STOVE : B.FOOD_SHELF);
      if (v === 6 && u > 2 && u < w - 3 && kind !== 'juwelier') return r === 0 ? B.COUNTER : 0;
      return 0;
    }
    case 'supermarkt': {
      if (v === 3 && u >= w - 9 && u <= w - 2 && (u - (w - 9)) % 3 !== 2) return r === 0 ? ((u - (w - 9)) % 3 === 0 ? B.CASH_REGISTER : B.COUNTER) : 0; // kassa's
      if (back) return tall(r === 0 ? B.FRIDGE : B.FRIDGE);
      if (side) return tall(B.SHELF);
      if (v >= 6 && v < dd - 2 && u > 2 && u < w - 3 && u % 4 === 2) return tall(v % 5 === 0 ? 0 : B.SHELF);   // gangpaden
      if (v >= 6 && v < dd - 2 && u % 4 === 0 && v % 5 === 3 && r === 0) return B.FRUIT_CRATE;
      return 0;
    }
    case 'restaurant': case 'cafe': case 'fastfood': {
      const kitchen = v >= dd - 4;                                                    // keuken achteraan, uitgifte ervoor
      if (v === dd - 4) return u === mid ? (r === 0 ? 0 : 0) : r === 0 ? B.COUNTER : r === 1 && u % 3 === 0 ? B.MENU_BOARD : 0;
      if (kitchen) { if (back || side) return r === 0 ? [B.STOVE, B.FRIDGE, B.SINK, B.COUNTER][u % 4] : r === 1 && u % 2 ? B.VENT : 0; return 0; }
      if (side && v === 3) return r === 0 ? B.MENU_BOARD : 0;
      if (aisle) return 0;
      const tx = (u - 2) % 4, tz = (v - 4) % 3;
      if (u < 2 || u > w - 3 || v < 4 || v >= dd - 5) return 0;
      if (tx === 1 && tz === 1) return r === 0 ? B.TABLE : 0;
      if ((tx === 0 || tx === 2) && tz === 1) return r === 0 ? (kind === 'fastfood' ? B.CHAIR_RED : B.CHAIR) : 0;
      return 0;
    }
    case 'toiletten': {
      if (v === 4) return u === mid ? 0 : B.PANEL_WHITE;
      if (v > 4 && u % 2 === 1 && v === dd - 1) return r === 0 ? B.TOILET : 0;
      if (v > 4 && u % 2 === 0 && v >= dd - 2) return B.PANEL_WHITE;
      if (v === 2 && side) return r === 0 ? B.SINK : r === 1 ? B.MIRROR_WALL : 0;
      return 0;
    }
    case 'kluizen': return (side || back || (v % 4 === 0 && v > 2 && !aisle)) ? tall(B.LOCKER) : 0;
    case 'loket': {
      if (v === 4 && !aisle) return r === 0 ? B.COUNTER : r === 1 ? B.GLASS : 0;
      if (v === 5 && !aisle && u % 3 === 1) return r === 0 ? B.CHAIR : 0;
      if (v === 2 && side) return r === 0 ? B.TICKET : 0;
      return 0;
    }
  }
  return 0;
}
// is dit een inrichtingsblok (voor tests: winkels mogen niet leeg zijn)
export const FURNISHING = new Set([B.CLOTHES_RACK, B.CASH_REGISTER, B.SHOWCASE, B.TECH_SHELF, B.FOOD_SHELF, B.TOY_SHELF, B.SPORT_RACK, B.PERFUME_SHELF, B.SHOE_SHELF,
  B.MANNEQUIN, B.MENU_BOARD, B.SHELF, B.BOOKSHELF, B.COUNTER, B.TABLE, B.CHAIR, B.CHAIR_RED, B.SOFA, B.FRIDGE, B.STOVE, B.SINK, B.TOILET, B.LOCKER, B.TICKET, B.FRUIT_CRATE, B.WARDROBE, B.BED]);
