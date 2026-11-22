// Alle automatische controles zonder browser (node tests/run-all.mjs):
// Reuzenberg-vorm, Alpengebouwen, Alpenspoor, echte steden op een helling, Nova Metropool, Greenisland.
// Browsertests (Playwright, met een lokale server op poort 8765): zie tests/browser/ en tests/worker-shared-tile.html.
import { spawnSync } from 'child_process';
const checks = [
  ['Reuzenberg: vorm exact behouden', 'tools/check-reuzenberg.mjs'],
  ['Alpen: gebouwen (zwevend, in de grond, ingangen)', 'tools/check-alpen-buildings.mjs'],
  ['Alpen: spoor, perrons, kabelbaanstations', 'tools/check-alpen-rail.mjs'],
  ['Echte steden: funderingen en tegelnaden op een helling', 'tools/check-osm-terrain.mjs'],
  ['Heel België: Ardennen-tegels (niets afgesneden, y0)', 'tools/check-belgie.mjs'],
  ['Nova Metropool: gebouwen, naden, startbanen', 'tools/check-metropool.mjs'],
  ['Greenisland: spoor, gebouwen, wegen, naden', 'tools/check-green.mjs'],
  ['Megatower: 1.000 m, kamers bereikbaar, deuren, liften, snelreizen', 'tools/check-megatower.mjs'],
  ['Megatower City: lanen, gaten, bruggen, sporen, determinisme', 'tools/check-megacity.mjs'],
  ['Diepe ondergrond: geen achtergebleven rots in tunnels', 'tools/check-underground.mjs'],
  ['Tunnels Megatower City: vrijprofiel van de metro', 'tools/check-tunnels.mjs', ['megatower']],
  ['Tunnels Greenisland: vrijprofiel trein (4,06 m breed, dak 5,5 m)', 'tools/check-tunnels.mjs', ['greenisland', '--snel']],
  ['Tunnels Alpen: vrijprofiel trein (4,06 m breed, dak 5,5 m)', 'tools/check-tunnels.mjs', ['alpen', '--snel']],
  ['Greenisland: automatische treinen over de wissels, rijwegen zonder conflict', 'tools/check-wisselroutes.mjs'],
  ['Greenisland: remises (vrije plek, ballast en hal, uit- en inrukken zonder conflict)', 'tools/check-depots.mjs'],
  ['Megatower City: gevels (alle soorten, niet meer driehoeken dan vroeger)', 'tools/check-gevels.mjs'],
  ['Dubbeldekker: beide verdiepingen bereikbaar via de trap, elke zitplaats bij een loopplek', 'tools/check-dubbeldekker.mjs'],
  ['Multiplayerserver (proef): aanmelden, posities, bouwvolgorde, weigeringen, ratelimiet, opslag', 'tools/check-multiplayer.mjs'],
  ['Economie: uitdagingen, examen en rijbewijs, loon, bouwopdrachten (ViridCoin)', 'tools/check-economy.mjs'],
  ['Adaptieve kwaliteit: 60 of stabiele 30 FPS op nagebootste toestellen, vaste grens Batterijbesparing', 'tools/check-adaptive.mjs'],
];
let fail = 0;
for (const [name, file, extra] of checks) {
  const t = Date.now(), r = spawnSync(process.execPath, [file, ...(extra || [])], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  const ok = r.status === 0;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name} (${((Date.now() - t) / 1000).toFixed(0)} s)\n   ${(r.stdout || '').trim().split('\n').slice(0, ok ? 2 : 12).join('\n   ')}${r.stderr && !ok ? '\n   ' + r.stderr.trim().split('\n').slice(0, 5).join('\n   ') : ''}`);
}
console.log(fail ? `${fail} controle(s) mislukt` : 'Alle controles geslaagd');
process.exitCode = fail ? 1 : 0;
