// Eén interactiesysteem voor alle werelden: kijk naar iets en druk op E (computer) of op ✋ (telefoon).
// Deuren openen en sluiten, lichtschakelaars, tv's, zitten op stoelen en zetels, liggen in bed, slagbomen,
// betaal- en ticketautomaten, laadpalen, borden, liftknoppen (Megatower, js/megaview.js).
// De toestand van deuren, lampen en tv's zit in de blokken zelf: die wordt bewaard zoals elk bouwwerk.
import { B, BLOCKS, IS_SOLID } from './blocks.js';

const SEAT = new Map(BLOCKS.filter(b => b.seat).map(b => [b.id, b.seat]));
const isDoorShut = (b) => b === B.DOOR_SHUT || b === B.DOOR_SHUT_TOP;
const isDoorOpen = (b) => b === B.DOOR_OPEN || b === B.DOOR_OPEN_TOP;

// wat kan je met dit blok? → { label, run } of null
export function actionFor(g, t) {
  if (!t) return null;
  const b = t.b, w = g.world;
  if (b === B.LIFT_BUTTON && g.mega) return g.mega.buttonAction(t);
  if (isDoorShut(b)) return { label: 'Deur openen', run: () => toggleDoor(g, t, true) };
  if (isDoorOpen(b)) return { label: 'Deur sluiten', run: () => toggleDoor(g, t, false) };
  if (b === B.SWITCH) return { label: 'Licht aan/uit', run: () => lightSwitch(g, t) };
  if (b === B.LAMP || b === B.LAMP_OFF) return { label: b === B.LAMP ? 'Lamp uit' : 'Lamp aan', run: () => { setBlock(g, t.x, t.y, t.z, b === B.LAMP ? B.LAMP_OFF : B.LAMP); } };
  if (b === B.TV || b === B.TV_ON) return { label: b === B.TV ? 'Televisie aanzetten' : 'Televisie uitzetten', run: () => { setBlock(g, t.x, t.y, t.z, b === B.TV ? B.TV_ON : B.TV); g.toast(b === B.TV ? '📺 Tv aan' : '📺 Tv uit'); } };
  if (SEAT.has(b)) {
    if (w.get(t.x, t.y + 1, t.z) && !SEAT.has(w.get(t.x, t.y + 1, t.z))) return null;
    const kind = SEAT.get(b);
    return { label: kind === 'bed' ? 'Gaan liggen' : 'Gaan zitten', run: () => sit(g, t, kind) };
  }
  if (b === B.PAY_MACHINE || b === B.BARRIER) return { label: 'Betalen en slagboom openen', run: () => barrier(g, t) };
  if (b === B.TICKET) return { label: 'Ticket kopen', run: () => g.toast('🎫 Ticket gekocht · geldig 90 minuten op metro, tram en bus' + (g.alpRail ? ' · M = routekaart en reisplanner' : '')) };
  if (b === B.CHARGER) return { label: 'Laadpaal bekijken', run: () => g.toast('⚡ Laadpaal · 22 kW · beschikbaar · tik je kaart om te laden') };
  if (b === B.SIGN) return { label: 'Bord lezen', run: () => g.toast(signText(g, t), 5000) };
  if (b === B.FRIDGE) return { label: 'Koelkast openen', run: () => g.toast('🧊 De koelkast is goed gevuld') };
  if (b === B.STOVE) return { label: 'Kookplaat', run: () => g.toast('🍳 Kookplaat en oven werken (inductie)') };
  if (b === B.SERVER) return { label: 'Serverkast', run: () => g.toast('🖥 Serverkast: alle lampjes groen') };
  if (b === B.GENERATOR) return { label: 'Noodgenerator', run: () => g.toast('⚙ Noodgenerator: stand-by, tank vol') };
  if (b === B.PUMP) return { label: 'Waterpomp', run: () => g.toast('💧 Waterpomp: 4 bar, werkt normaal') };
  if (b === B.WARDROBE) return { label: 'Kast openen', run: () => g.toast('👔 Kleerkast: kleren en extra dekens') };
  return null;
}

function setBlock(g, x, y, z, b) {
  if (!g.world.set(x, y, z, b)) return false;
  g.remeshAround(x, z, y);
  g.dirty = true; g.lastEditAt = performance.now();
  return true;
}
function toggleDoor(g, t, open) {
  const w = g.world;
  // onderste en bovenste helft samen
  let y0 = t.y;
  const lower = open ? B.DOOR_SHUT : B.DOOR_OPEN, upper = open ? B.DOOR_SHUT_TOP : B.DOOR_OPEN_TOP;
  if (w.get(t.x, t.y, t.z) === upper) y0 = t.y - 1;
  if (!open) { const p = g.player.pos; if (Math.floor(p.x) === t.x && Math.floor(p.z) === t.z && p.y < y0 + 2.5 && p.y > y0 - 1.9) { g.toast('Je staat in de deuropening'); return; } }
  if (w.get(t.x, y0, t.z) === lower) setBlock(g, t.x, y0, t.z, open ? B.DOOR_OPEN : B.DOOR_SHUT);
  if (w.get(t.x, y0 + 1, t.z) === upper) setBlock(g, t.x, y0 + 1, t.z, open ? B.DOOR_OPEN_TOP : B.DOOR_SHUT_TOP);
  if (g.mega) g.mega.doorsDirty = true;
  if (open && g.mega) { const r = g.mega.roomNear(t); if (r) g.toast('🚪 ' + r); }
}
function lightSwitch(g, t) {
  // de lampen van de kamer achter de schakelaar (de kleinste ruimte aan een van beide kanten: kamer, niet de gang)
  const w = g.world, IS = (b) => b && b !== B.DOOR_OPEN && b !== B.DOOR_OPEN_TOP && (IS_SOLID[b] || b === B.DOOR_OPEN);
  const yF = t.y - 1; // vloerhoogte van de kamer (de schakelaar zit op ooghoogte)
  const free = (x, z) => !IS(w.get(x, yF, z)) && !IS(w.get(x, yF + 1, z)) && !isDoorish(w.get(x, yF, z));
  const area = (sx, sz) => {
    if (!free(sx, sz)) return null;
    const seen = new Set([sx + ',' + sz]), q = [[sx, sz]];
    while (q.length) {
      const [x, z] = q.pop();
      if (seen.size > 900) return null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (z + dz); if (!seen.has(k) && free(x + dx, z + dz)) { seen.add(k); q.push([x + dx, z + dz]); } }
    }
    return seen;
  };
  let best = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = area(t.x + dx, t.z + dz); if (a && (!best || a.size < best.size)) best = a; }
  const list = [];
  let on = 0;
  if (best) for (const k of best) { const [x, z] = k.split(',').map(Number); for (let y = yF + 1; y <= yF + 4; y++) { const b = w.get(x, y, z); if (b === B.LAMP || b === B.LAMP_OFF) { list.push([x, y, z]); if (b === B.LAMP) on++; break; } if (IS_SOLID[b] && b !== B.LAMP && b !== B.LAMP_OFF) break; } }
  if (!list.length) { g.toast('Geen lampen in deze ruimte'); return; }
  const to = on > 0 ? B.LAMP_OFF : B.LAMP;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, y, z] of list) { w.set(x, y, z, to); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  // het licht reikt tot 9 blokken: de chunks errond ook opnieuw (binnenlicht)
  g.editY = [yF - 1, yF + 5];
  const done = new Set();
  for (let x = x0 - 10; x <= x1 + 10; x += 8) for (let z = z0 - 10; z <= z1 + 10; z += 8) { const k = Math.floor(x / 16) + ',' + Math.floor(z / 16); if (done.has(k)) continue; done.add(k); const src = w.sourceAt ? w.sourceAt(x, z) : null; if (src) g.buildChunk(src, Math.floor((x - src.ox) / 16), Math.floor((z - src.oz) / 16)); }
  g.editY = null; g.dirty = true; g.lastEditAt = performance.now();
  g.toast(to === B.LAMP ? `💡 Licht aan (${list.length} lampen)` : `💡 Licht uit (${list.length} lampen) · de kamer wordt donker`);
}
const isDoorish = (b) => b === B.DOOR_SHUT || b === B.DOOR_SHUT_TOP || b === B.DOOR_OPEN || b === B.DOOR_OPEN_TOP || b === B.DOOR || b === B.DOOR_TOP || b === B.DOOR_GLASS;

function sit(g, t, kind) {
  const p = g.player;
  g.seat = { x: t.x + 0.5, y: t.y + (kind === 'bed' ? 1.0 : 0.55), z: t.z + 0.5, kind, from: p.pos.clone(), yaw: p.yaw };
  p.pos.set(g.seat.x, g.seat.y, g.seat.z); p.vel.set(0, 0, 0); p.fly = false;
  if (kind === 'bed') p.pitch = 1.2;
  g.toast(kind === 'bed' ? '🛏 Je ligt in bed · beweeg om op te staan' : '🪑 Je zit · beweeg om op te staan');
}
// zitten/liggen: blijft staan tot je beweegt of springt
export function updateSeat(g) {
  const s = g.seat, p = g.player, k = g.keys;
  const move = k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD') || k.has('Space') || Math.hypot(g.joy.x, g.joy.y) > 0.3 || g.touchUp;
  if (move) {
    g.seat = null;
    // naast het meubel gaan staan (vrije plek zoeken)
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = s.from.x + dx, z = s.from.z + dz;
      if (!g.collides(x, s.from.y, z)) { p.pos.set(x, s.from.y, z); break; }
    }
    p.vel.set(0, 0, 0); if (s.kind === 'bed') p.pitch = 0;
    return false;
  }
  p.pos.set(s.x, s.y, s.z); p.vel.set(0, 0, 0);
  return true;
}
function barrier(g, t) {
  // slagbomen in een lijn van 6 m rond de automaat: 10 s open (niet bewaard: de slagboom gaat vanzelf dicht)
  const w = g.world, cells = [];
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) for (const dy of [0, -1, 1]) if (w.get(t.x + dx, t.y + dy, t.z + dz) === B.BARRIER) cells.push([t.x + dx, t.y + dy, t.z + dz]);
  if (!cells.length) { g.toast('🅿 Parkeerticket betaald: € 4,50'); return; }
  const raw = (x, y, z, b) => { const src = w.sourceAt ? w.sourceAt(x, z) : null; if (src && src.w) src.w.set(x - src.ox, y, z - src.oz, b); else w.set(x, y, z, b); };
  for (const c of cells) raw(...c, 0);
  g.remeshAround(t.x, t.z, t.y);
  g.toast('🅿 Betaald · slagboom open');
  setTimeout(() => { for (const c of cells) if (!g.world.get(...c)) raw(...c, B.BARRIER); g.remeshAround(t.x, t.z, t.y); }, 10000);
}
function signText(g, t) {
  if (g.mega) { const s = g.mega.signText(t); if (s) return s; }
  if (g.alpRail && g.alpRail.signText) { const s = g.alpRail.signText(t); if (s) return s; }
  const zn = g.tiled && g.tiled.spec.zoneName;
  return '🪧 ' + (zn ? zn(t.x, t.z) : 'Informatiebord');
}
