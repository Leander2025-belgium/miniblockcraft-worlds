// OV-diagnose (pauzemenu → 🛠 OV-diagnose): controleert rond de speler (1,5 km) de echte, geladen wereld:
// - geblokkeerde tunnels: het vrijprofiel van een trein (3 m breed, 4 m hoog) langs elk tunnelspoor en elke metrolijn
// - onmogelijke hellingen: steiler dan de lijn toelaat
// - losgekoppelde sporen: spoor-, metro- en tramstukken in het verkeersnet waar niets op aansluit
// - voertuigen buiten hun route, mogelijke botsingen (twee treinen op minder dan 30 m op hetzelfde spoor)
// Geblokkeerde plekken worden rood getoond in de wereld, met coördinaten.
import * as THREE from 'three';
import { IS_SOLID, BLOCKS, B } from './blocks.js';

const BED = new Set([B.BALLAST, B.CONCRETE, B.TILE, B.LINE_WHITE, B.LINE_YELLOW, B.METAL, B.GRAVEL, B.STONE]);
export async function runOvDiag(g) {
  const out = { tunnels: { punten: 0, geblokkeerd: [] }, hellingen: [], los: [], buitenRoute: [], botsingen: [], lijnen: 0 };
  const p = g.player.pos, R = 1500;
  let lines = [], trackOffset = () => 0;
  if (g.alpRail) { const rail = await import('./rail.js'); const ni = rail.netInfo(); lines = ni.LINES; trackOffset = ni.trackOffset; }
  const w = g.world, loaded = (x, z) => !!(w.tileAt && w.tileAt(x, z));
  const q = {};
  for (const L of lines) {
    if (L.tram || L.bus) continue; // buslijnen volgen de weg (geen spoor, geen tunnelprofiel)
    let used = false;
    for (let s = 0; s <= L.len; s += 6) {
      L.at(s, q);
      if (Math.hypot(q.x - p.x, q.z - p.z) > R) continue;
      used = true;
      // helling
      if (L.maxGrade && Math.abs(q.grade || 0) > L.maxGrade + 0.02 && out.hellingen.length < 50) out.hellingen.push({ lijn: L.id, x: Math.round(q.x), z: Math.round(q.z), helling: +(q.grade * 100).toFixed(1) });
      const under = L.metro || (L.inTunnel && L.inTunnel(s));
      if (!under) continue;
      const off = trackOffset(L, s);
      for (const side of off ? [1, -1] : [0]) {
        const cx = q.x - q.tz * off * side, cz = q.z + q.tx * off * side;
        if (!loaded(cx, cz)) continue;
        const nq = L.near(Math.floor(cx), Math.floor(cz), 40), y = Math.round(nq ? nq.y : q.y);
        out.tunnels.punten++;
        let hit = null;
        for (let o = -1.45; o <= 1.46 && !hit; o += 0.725) {
          const x = Math.floor(cx - q.tz * o), z = Math.floor(cz + q.tx * o);
          if (Math.abs((x + 0.5 - cx) * -q.tz + (z + 0.5 - cz) * q.tx) > 1.95) continue;
          for (let h = 1; h <= 4; h++) {
            const b = w.get(x, y + h, z);
            if (!IS_SOLID[b]) continue;
            if (h === 1 && BED.has(b) && [2, 3, 4, 5].every(k => !IS_SOLID[w.get(x, y + k, z)])) break;
            hit = { lijn: L.id, x, y: y + h, z, blok: BLOCKS[b] ? BLOCKS[b].name : b, generator: y + h < (w.tileAt(x, z).w.y0 || 0) ? 'diepe ondergrond' : 'tegel' }; break;
          }
        }
        if (hit && out.tunnels.geblokkeerd.length < 200) out.tunnels.geblokkeerd.push(hit);
      }
    }
    if (used) out.lijnen++;
  }
  // verkeersnet (alle werelden): losse uiteinden van sporen, voertuigen die van hun route af staan
  const tr = g.traffic;
  if (tr && tr.net && tr.net.edges) {
    for (const e of tr.net.edges.values()) {
      if (!['rail', 'metro', 'tram'].includes(e.net) || e.conn) continue;
      for (const k of [0, 1]) {
        if (e.next[k].length) continue;
        const i = k ? e.pts.length - 3 : 0, x = e.pts[i], z = e.pts[i + 2];
        if (Math.hypot(x - p.x, z - p.z) > R) continue;
        // aan de rand van wat geladen is, is een open einde normaal
        if (!loaded(x + 12, z) || !loaded(x - 12, z) || !loaded(x, z + 12) || !loaded(x, z - 12)) continue;
        if (out.los.length < 60) out.los.push({ net: e.net, x: Math.round(x), y: Math.round(e.pts[i + 1]), z: Math.round(z) });
      }
    }
    const tmp = {};
    for (const a of tr.agents || []) {
      if (!['train', 'metro', 'tram', 'bus'].includes(a.kind) || !a.route || !a.route[0]) continue;
      const h = tr.behind ? tr.behind(a, 0, tmp) : null;
      if (h && !isFinite(h.x)) out.buitenRoute.push({ soort: a.kind });
    }
  }
  if (g.alpRail && g.alpRail.active) {
    const act = g.alpRail.active.filter(a => a.s != null);
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const A = act[i], Bq = act[j];
      if (A.run.pr.L !== Bq.run.pr.L || A.run.dir !== Bq.run.dir) continue;
      if (Math.abs(A.s - Bq.s) < 30 && out.botsingen.length < 20) out.botsingen.push({ lijn: A.run.pr.L.id, a: A.id, b: Bq.id, afstand: Math.round(Math.abs(A.s - Bq.s)) });
    }
  }
  showMarkers(g, out.tunnels.geblokkeerd.concat(out.los.map(l => ({ ...l, los: true }))));
  return out;
}
function showMarkers(g, list) {
  if (!g.ovMarkers) {
    g.ovMarkers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.7, depthTest: false }), 400);
    g.ovMarkers.frustumCulled = false; g.ovMarkers.renderOrder = 10; g.scene.add(g.ovMarkers);
  }
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (const b of list) { if (n >= 400) break; m4.makeTranslation(b.x + 0.5, (b.y ?? 0) + 0.5, b.z + 0.5); g.ovMarkers.setMatrixAt(n++, m4); }
  g.ovMarkers.count = n; g.ovMarkers.instanceMatrix.needsUpdate = true;
}
export function ovDiagText(r) {
  const L = [];
  L.push(`OV-diagnose rond je positie (1,5 km), ${r.lijnen} spoor- en metrolijnen in de buurt`);
  L.push(`Tunnels: ${r.tunnels.punten} meetpunten · geblokkeerd: ${r.tunnels.geblokkeerd.length}${r.tunnels.geblokkeerd.length ? ' (rood in de wereld)' : ' ✓'}`);
  for (const b of r.tunnels.geblokkeerd.slice(0, 12)) L.push(`  ✗ ${b.lijn} op x ${b.x}, y ${b.y}, z ${b.z}: ${b.blok} (${b.generator})`);
  L.push(`Losgekoppelde sporen (spoor, metro, tram): ${r.los.length}${r.los.length ? '' : ' ✓'}`);
  for (const b of r.los.slice(0, 8)) L.push(`  • ${b.net} eindigt op x ${b.x}, z ${b.z} (kan ook een eindpunt of stootblok zijn)`);
  L.push(`Onmogelijke hellingen: ${r.hellingen.length}${r.hellingen.length ? '' : ' ✓'}`);
  for (const b of r.hellingen.slice(0, 5)) L.push(`  ✗ ${b.lijn} op x ${b.x}, z ${b.z}: ${b.helling} %`);
  L.push(`Voertuigen buiten hun route: ${r.buitenRoute.length}${r.buitenRoute.length ? '' : ' ✓'}`);
  L.push(`Mogelijke botsingen (twee treinen < 30 m op hetzelfde spoor): ${r.botsingen.length}${r.botsingen.length ? '' : ' ✓'}`);
  for (const b of r.botsingen.slice(0, 5)) L.push(`  ✗ ${b.lijn}: ${b.a} en ${b.b} op ${b.afstand} m`);
  return L.join('\n');
}
