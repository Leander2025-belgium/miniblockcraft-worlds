// Geheugendiagnose (TERRANOVA 16): wat houdt de game op dit moment vast, en wat lijkt ongebruikt?
// Pauzemenu → "🧠 Geheugen". Alles wordt geteld, niets wordt geschat of verzonnen; waar de browser iets niet geeft
// (JS-geheugen in Safari en Firefox), staat "n.v.t.".
//
// "Mogelijk ongebruikt" zijn dingen die er nog zijn maar niets meer doen: verborgen 3D-objecten in de scène, dode
// voertuigen die nog in de lijst staan, beëindigde ritten, geometrie op de grafische kaart die in geen enkele
// scène hangt (kandidaat-lek), oude tegels in het werkgeheugen boven het budget.
const MB = (b) => Math.round(b / 1048576 * 10) / 10;

function walk(root, acc) {
  if (!root) return acc;
  root.traverse?.((o) => {
    acc.objecten++;
    if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) {
      acc.meshes++;
      let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis) acc.verborgen++;
      if (o.geometry) {
        if (!acc.geo.has(o.geometry)) { acc.geo.add(o.geometry); for (const a of Object.values(o.geometry.attributes || {})) acc.bytes += a.array?.byteLength || 0; acc.bytes += o.geometry.index?.array?.byteLength || 0; }
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) acc.mat.add(m);
    }
  });
  return acc;
}

export function memReport(g) {
  const R = { tijd: new Date().toISOString() };
  const mem = performance.memory;
  R.js = mem ? { gebruikt_MB: MB(mem.usedJSHeapSize), totaal_MB: MB(mem.totalJSHeapSize), grens_MB: MB(mem.jsHeapSizeLimit) } : 'n.v.t. (deze browser geeft het niet)';
  const info = g.renderer?.info;
  // 3D: de hoofdscène plus de aparte scènes van het verre landschap en de lucht
  const acc = walk(g.scene, { objecten: 0, meshes: 0, verborgen: 0, geo: new Set(), mat: new Set(), bytes: 0 });
  for (const extra of [g.far?.scene, g.sky?.scene]) walk(extra, acc);
  R.grafisch = {
    geometrieen_op_gpu: info?.memory?.geometries ?? null, texturen_op_gpu: info?.memory?.textures ?? null,
    geometrieen_in_scene: acc.geo.size, materialen_in_scene: acc.mat.size, objecten: acc.objecten, meshes: acc.meshes,
    verborgen_meshes: acc.verborgen, vertexdata_MB: MB(acc.bytes), programmas: info?.programs?.length ?? null,
  };
  // wereld: tegels (geladen, geparkeerd), chunks, wachtrij
  const W = g.world, td = g.tiled;
  let parkedBytes = 0; if (td?.parked) for (const p of td.parked.values()) parkedBytes += g.tileBytes ? g.tileBytes(p) : 0;
  R.wereld = {
    tegels: W?.tiles?.size ?? (W ? 1 : 0), geparkeerd: td?.parked?.size ?? 0, geparkeerd_MB: MB(parkedBytes), budget_MB: g.memBudget ? g.memBudget() : null,
    chunks: g.chunks?.size ?? null, bouwwachtrij: g.queue?.length ?? 0, bekend: td?.known?.size ?? 0,
  };
  // verkeer en OV
  const T = g.traffic, agents = T?.agents || [];
  const trips = T?.trips?.trips;
  R.verkeer = {
    voertuigen: agents.length, dood_in_lijst: agents.filter(a => a.dead).length, geparkeerd: agents.filter(a => a.parked).length,
    ritten: trips?.size ?? 0, ritten_buiten_beeld: T?.trips?.ghosts?.length ?? 0, ritten_einde_dienst: trips ? [...trips.values()].filter(t => t.state === 'einde dienst').length : 0,
  };
  const tv = g.travelers;
  R.reizigers = tv ? { actief: tv.list?.length ?? null, logboek: tv.log?.length ?? null, reislogboek: tv.journeyLog?.length ?? null, paden_bewaard: (tv.list || []).filter(t => t.paths).length } : null;
  const b = g.builder;
  if (b) { let n = 0; for (const l of b.undoStack || []) n += l.length / 5; let r = 0; for (const l of b.redoStack || []) r += l.length / 5; R.bouwen = { stappen: b.undoStack?.length || 0, blokken_ongedaan: n, blokken_opnieuw: r, geschat_MB: MB((n + r) * 20) }; }
  // conclusie: dingen die er zijn maar niets doen
  const lijst = [];
  if (R.grafisch.verborgen_meshes > 200) lijst.push(`${R.grafisch.verborgen_meshes} verborgen 3D-objecten in de scène (worden niet getekend, nemen wel geheugen)`);
  if (R.grafisch.geometrieen_op_gpu != null && R.grafisch.geometrieen_op_gpu > R.grafisch.geometrieen_in_scene * 1.5 + 200) lijst.push(`${R.grafisch.geometrieen_op_gpu - R.grafisch.geometrieen_in_scene} geometrieën op de grafische kaart die in geen scène hangen (mogelijk niet vrijgegeven)`);
  if (R.verkeer.dood_in_lijst > 20) lijst.push(`${R.verkeer.dood_in_lijst} weggereden voertuigen nog in de lijst`);
  if (R.verkeer.ritten_einde_dienst > 0) lijst.push(`${R.verkeer.ritten_einde_dienst} beëindigde ritten nog bewaard`);
  if (R.reizigers && R.reizigers.paden_bewaard > 40) lijst.push(`${R.reizigers.paden_bewaard} reizigers met bewaarde paden`);
  if (R.wereld.budget_MB && R.wereld.geparkeerd_MB > R.wereld.budget_MB) lijst.push(`geparkeerde tegels (${R.wereld.geparkeerd_MB} MB) boven het budget (${R.wereld.budget_MB} MB)`);
  R.mogelijk_ongebruikt = lijst;
  return R;
}

export function memText(R) {
  const L = [`TERRANOVA geheugendiagnose · ${new Date(R.tijd).toLocaleString('nl-BE')}`, ''];
  const sec = (t, o) => { if (!o) return; L.push(t); if (typeof o === 'string') L.push('  ' + o); else for (const [k, v] of Object.entries(o)) L.push(`  ${k.replace(/_/g, ' ')}: ${v ?? 'n.v.t.'}`); L.push(''); };
  sec('JavaScript', R.js); sec('Grafisch', R.grafisch); sec('Wereld', R.wereld); sec('Verkeer en OV', R.verkeer); sec('Reizigers', R.reizigers); sec('Bouwen', R.bouwen);
  L.push('Mogelijk ongebruikt:', ...(R.mogelijk_ongebruikt.length ? R.mogelijk_ongebruikt.map(x => '  • ' + x) : ['  niets opvallends']));
  return L.join('\n');
}
