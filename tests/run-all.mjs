// Alle automatische controles zonder browser (node tests/run-all.mjs):
// Reuzenberg-vorm, Alpengebouwen, Alpenspoor, echte steden op een helling, Nova Metropool, Greenisland.
// Browsertests (Playwright, met een lokale server op poort 8765): zie tests/browser/ en tests/worker-shared-tile.html.
import { spawnSync } from 'child_process';
const checks = [
  ['Reuzenberg: vorm exact behouden', 'tools/check-reuzenberg.mjs'],
  ['Alpen: gebouwen (zwevend, in de grond, ingangen)', 'tools/check-alpen-buildings.mjs'],
  ['Alpen: spoor, perrons, kabelbaanstations', 'tools/check-alpen-rail.mjs'],
  ['Echte steden: funderingen en tegelnaden op een helling', 'tools/check-osm-terrain.mjs'],
  ['Nova Metropool: gebouwen, naden, startbanen', 'tools/check-metropool.mjs'],
  ['Greenisland: spoor, gebouwen, wegen, naden', 'tools/check-green.mjs'],
];
let fail = 0;
for (const [name, file] of checks) {
  const t = Date.now(), r = spawnSync(process.execPath, [file], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  const ok = r.status === 0;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name} (${((Date.now() - t) / 1000).toFixed(0)} s)\n   ${(r.stdout || '').trim().split('\n').slice(0, ok ? 2 : 12).join('\n   ')}${r.stderr && !ok ? '\n   ' + r.stderr.trim().split('\n').slice(0, 5).join('\n   ') : ''}`);
}
console.log(fail ? `${fail} controle(s) mislukt` : 'Alle controles geslaagd');
process.exitCode = fail ? 1 : 0;
