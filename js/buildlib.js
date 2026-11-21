// Bouwbibliotheek (TERRANOVA 15): alle plaatsbare blokken in categorieën, met zoeken, favorieten (★) en recent
// gebruikt. Kiezen zet het blok in het gekozen vakje van de balk (zoals vroeger). Favorieten en recent blijven op dit
// toestel bewaard (eigen sleutels; de bestaande opslag blijft ongewijzigd).
import { B, BLOCKS } from './blocks.js';

const FAV = 'terranova-build-fav', REC = 'terranova-build-recent';
const NAME = Object.fromEntries(Object.entries(B).map(([k, v]) => [v, k]));
// categorie op basis van de sleutelnaam van het blok (js/blocks.js B)
const RULES = [
  ['Ramen', /GLASS|MIRROR(?!_WALL)/],
  ['Deuren', /DOOR/],
  ['Daken', /ROOF|CLAY_ROOF/],
  ['Trappen en liften', /LADDER|ESCALATOR|ELEVATOR|LIFT/],
  ['Meubels', /BED|PILLOW|SOFA|CHAIR|TABLE|COUNTER|STOVE|FRIDGE|SINK|TOILET|BATHTUB|WARDROBE|SHELF|BOOKSHELF|GYM|CARPET|SHOWER|TV/],
  ['Verlichting', /LAMP|SWITCH/],
  ['Tuin', /GRASS|DIRT|LEAVES|HEDGE|FLOWERS|LOG|SPRUCE|SAND|WATER|GRAVEL|PLANTER|SNOW|ICE|CLAY$/],
  ['Verkeer', /ASPHALT|LINE_|SIDEWALK|BIKE_PATH|BUS_LANE|POST|BARRIER|PAY_MACHINE|COBBLE/],
  ['Stations', /TICKET|SIGN|BALLAST|TILE/],
  ['Technische installaties', /SERVER|GENERATOR|PUMP|VENT|CHARGER|SOLAR|HELIPAD|METAL|ORE/],
  ['Decoratie', /WOOL|PAINT|CHECKER|MIRROR_WALL|WALL_WOOD|CRATE|PARQUET/],
];
export const CATEGORIES = ['Bouwmaterialen', ...RULES.map(r => r[0])];
export function categoryOf(id) { const k = NAME[id] || ''; for (const [c, re] of RULES) if (re.test(k)) return c; return 'Bouwmaterialen'; }
const load = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* geen opslag */ } };

export class BuildLibrary {
  constructor(placeable) { this.all = placeable; this.fav = new Set(load(FAV)); this.rec = load(REC); this.tab = 'Alles'; this.q = ''; }
  toggleFav(id) { if (this.fav.has(id)) this.fav.delete(id); else this.fav.add(id); store(FAV, [...this.fav]); }
  used(id) { if (this.rec[0] === id) return; this.rec = [id, ...this.rec.filter(x => x !== id)].slice(0, 16); store(REC, this.rec); }
  // de blokken voor het tabblad en de zoekterm (zoekt in naam en categorie)
  list(tab = this.tab, q = this.q) {
    let ids = tab === '★ Favorieten' ? this.all.filter(id => this.fav.has(id)) : tab === '🕘 Recent' ? this.rec.filter(id => this.all.includes(id)) : tab === 'Alles' ? this.all : this.all.filter(id => categoryOf(id) === tab);
    const s = q.trim().toLowerCase();
    if (s) ids = ids.filter(id => (BLOCKS[id]?.name || '').toLowerCase().includes(s) || categoryOf(id).toLowerCase().includes(s));
    return ids;
  }
  tabs() { return ['Alles', '★ Favorieten', '🕘 Recent', ...CATEGORIES.filter(c => this.all.some(id => categoryOf(id) === c))]; }
}
