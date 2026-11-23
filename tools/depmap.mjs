// Afhankelijkheidskaart van de modules in js/ (TERRANOVA 16, fase 0).
// Leest elke import/export en schrijft een Markdown-overzicht: wie gebruikt wie, hoeveel regels, welke modules
// door veel andere gebruikt worden (kern) en welke door niemand (kandidaat om op te ruimen of alleen dynamisch geladen).
// Gebruik: node tools/depmap.mjs [uitvoer.md]
import fs from 'fs';
import path from 'path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const JS = path.join(ROOT, 'js');
const files = fs.readdirSync(JS).filter(f => f.endsWith('.js')).sort();
const mods = new Map();
for (const f of files) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  const deps = new Set();
  for (const m of src.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]\.\/([\w.-]+)['"]/g)) deps.add(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]\.\/([\w.-]+)['"]\s*\)/g)) deps.add(m[1] + ' (dynamisch)');
  for (const m of src.matchAll(/new\s+(?:Shared)?Worker\(\s*new URL\(\s*['"]\.\/([\w.-]+)['"]/g)) deps.add(m[1] + ' (worker)');
  // paden in een variabele (bv. spec.viewModule = './greenview.js', later import(view))
  for (const m of src.matchAll(/['"]\.\/([\w-]+\.js)['"]/g)) if (![...deps].some(d => d.startsWith(m[1]))) deps.add(m[1] + ' (pad)');
  const exports = [...src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let)\s+(\w+)/g)].map(m => m[1]);
  mods.set(f, { lines: src.split('\n').length, deps: [...deps].sort(), exports });
}
const usedBy = new Map(files.map(f => [f, []]));
for (const [f, m] of mods) for (const d of m.deps) { const n = d.replace(/ \(.*\)$/, ''); if (usedBy.has(n)) usedBy.get(n).push(f + (d.includes('(') ? ' ' + d.slice(d.indexOf('(')) : '')); }
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const entry = [...html.matchAll(/src="\.\/js\/([\w.-]+)/g)].map(m => m[1]);

const out = [];
out.push('# TERRANOVA — afhankelijkheidskaart van `js/`', '', `Automatisch gemaakt door \`tools/depmap.mjs\`. ${files.length} modules, ${[...mods.values()].reduce((a, m) => a + m.lines, 0)} regels. Instap vanuit index.html: ${entry.map(e => '`' + e + '`').join(', ')}.`, '');
out.push('## Kern (gebruikt door ≥ 5 modules)', '', '| Module | regels | gebruikt door |', '|---|---|---|');
for (const [f, u] of [...usedBy].filter(([, u]) => u.length >= 5).sort((a, b) => b[1].length - a[1].length)) out.push(`| \`${f}\` | ${mods.get(f).lines} | ${u.length}: ${u.map(x => x.replace('.js', '')).join(', ')} |`);
out.push('', '## Niet geïmporteerd door een andere module', '', ...[...usedBy].filter(([f, u]) => !u.length).map(([f]) => `- \`${f}\` (${mods.get(f).lines} regels)${entry.includes(f) ? ' — instap index.html' : ''}`));
out.push('', '## Alle modules', '', '| Module | regels | gebruikt | exports |', '|---|---|---|---|');
for (const [f, m] of mods) out.push(`| \`${f}\` | ${m.lines} | ${m.deps.map(d => d.replace('.js', '')).join(', ') || '—'} | ${m.exports.slice(0, 8).join(', ')}${m.exports.length > 8 ? ' …' : ''} |`);
const dest = process.argv[2];
if (dest) { fs.writeFileSync(dest, out.join('\n') + '\n'); console.log('geschreven:', dest); } else console.log(out.join('\n'));
