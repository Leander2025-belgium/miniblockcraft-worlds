<p align="center"><img src="assets/brand/terranova-logo.svg" alt="TERRANOVA" width="520"></p>

# TERRANOVA — formerly Blokstad

**Build Your World. Explore Without Limits.**

TERRANOVA is een uitgebreide 3D-openwereldgame in de browser. Je ontdekt gigantische steden, gebouwen en landschappen, bouwt zelf en reist met treinen, metro's, trams, bussen en andere voertuigen.

Spelen: <https://leander2025-belgium.github.io/miniblockcraft-worlds/> (desktop, tablet en smartphone). Je kunt de game ook als app op je beginscherm zetten.

## Werelden
- **Echte steden** en **Heel België**: gebouwen uit OpenStreetMap, op de echte plek.
- **Greenisland**: een eiland met intercity's, metro M1–M10, trams, bussen, een kabelbaan, een luchthaven en havens.
- **Megatower City**: een stad van 10 × 10 km rond een wolkenkrabber van 1.000 m, met metro M1, een station met stationshal en een luchthaven.
- **Nova Metropool**: een moderne metropool met wolkenkrabbers tot 800 m.
- **Reuzenberg · Alpen**: bergen tot 5.000 m, berg- en stoomtreinen, kabelbanen.

## Spelen in het kort
- **Bewegen**: WASD of het joystickveld op een aanraakscherm. Met de muis kijk je rond. Spatie springt, F vliegt.
- **Bouwen en breken**: met de muisknoppen (of ⛏ en ▣). B opent de blokken.
- **Voertuigen**:
  - H rijdt zelf, J rijdt mee als passagier en V wisselt de camera.
  - In de cabine van een trein: W/S zijn de hendels, A/D de wissel, Q de deuren en Z strooit zand.
- **Interactie**: E bedient wat je aankijkt, zoals een deur, licht, een lift of een vertrekbord.
- **Kaarten**: M opent de kaart, de OV-kaart en de reisplanner, F3 de FPS-meter.

## Opgeslagen spellen blijven werken
De naam is veranderd, maar de technische namen van Blokstad blijven bewust dezelfde, zodat niemand voortgang verliest:
- **Browseropslag** (localStorage): de sleutels `blokstad-settings`, `blokstad-last`, `blokstad-mode` en de andere `blokstad-…`-sleutels.
- **Databank** (IndexedDB): `blokstad`, met werelden, posities en bouwwerken.
- **Bestandsformaat**: `BLOKSTAD1`, met de extensies `.blokstad` en `.blokstad-bouw`. Exporteren gebeurt nog in dit formaat, zodat oudere versies de bestanden ook kunnen lezen.
- **Importeren**: werkt met `.blokstad`, `.blokstad-bouw`, `.terranova` en `.terranova-bouw`. De game herkent het formaat aan de inhoud, niet aan de extensie.
- **Service worker**: de cache heet nog `blokstad-v3`, zodat de offline kopie bewaard blijft.

## Ontwikkeling
- **Starten**: de game is één statische site (`index.html`, `js/`, `assets/`). Lokaal start je die met `python3 -m http.server 8765`.
- **Controles zonder browser**: `node tests/run-all.mjs` (wereldgeneratie, naden, tunnels met het volledige voertuigprofiel, Reuzenberg).
- **Browsertests**: in `tests/browser/` (Playwright), bijvoorbeeld `node tests/browser/branding.cjs`.
  - `savegame.cjs`: oude savegames (vaste bestanden in `tests/fixtures/`), back-up maken en terugzetten.
  - `graphics.cjs`: shaders, lichtschakelaar, renderprioriteit ondergronds, voertuig-LOD, ritten.
  - `reis.cjs`: een reiziger reist met overstap (metro en bus) door de echte wereld.
  - `bench.cjs`: benchmark met vaste scènes (`BASE=…` om een andere versie te meten, `SHOTS=map` voor beelden).
- **Volledige back-up**: in het menu *🛟 Volledige back-up maken* (`.terranova-backup`); terugzetten via *Bestand importeren…*.
- **Documentatie**:
  - [`docs/terranova-14.md`](docs/terranova-14.md): TERRANOVA 14.0 (graphics, prestaties, reizigers, wissels; met meetresultaten en wat nog niet af is).
  - [`docs/terranova-16.md`](docs/terranova-16.md): TERRANOVA 16.0 (ontwikkelversie): adaptieve kwaliteit en profielen, geheugendiagnose, weer (sneeuwdek, mist, wind, grip), gemeten vertraging, planner met voorkeuren, economie met rijbewijzen en uitdagingen, multiplayerprototype (`server/`); met wat niet gebouwd is. Zie ook [`CHANGELOG.md`](CHANGELOG.md).
  - [`docs/terranova-megatower-revolution.md`](docs/terranova-megatower-revolution.md): TERRANOVA 16.1 (ontwikkelversie): nieuwe buitenkant van The Megatower, Megatower Grand Central (22/10/6 perronsporen, hyperloop), tram T5, metro M2, Megatower Galleria, Grand Boulevard, nieuwe wijken, savegamemigratie; met metingen en wat nog niet klaar is.
  - [`docs/terranova-15.md`](docs/terranova-15.md): TERRANOVA 15.0 (ontwikkelversie): reizen van deur tot deur, wijken, depots, routebegeleiding, carrière, bouwmodus, crashherstel; met wat gedeeltelijk of niet gebouwd is.
  - [`docs/ov.md`](docs/ov.md): openbaar vervoer, tunnels, stations, voertuigen.
  - [`docs/audit-13.md`](docs/audit-13.md): technische audit.
  - [`docs/megatower.md`](docs/megatower.md).
  - [`docs/rendering-v9.md`](docs/rendering-v9.md): de vroegere README over de renderpatch (geschiedenis).

## Huisstijl
- **Logo's** in `assets/brand/`:
  - `terranova-logo.svg`: hoofdmenu, donkere achtergrond.
  - `terranova-logo-light.svg`: lichte achtergrond.
  - `terranova-mark.svg`: los embleem.
  - `terranova-icon.svg`, plus de PNG's van 192 en 512 px: app-icoon en favicon.
- **Kleuren**:

  | Kleur | Gebruik |
  |---|---|
  | `#0b1220` donkerblauw | basis |
  | `#1f2937` antraciet | basis |
  | `#10b981` smaragdgroen | accent |

De repository heet nog `miniblockcraft-worlds`. De bestaande URL blijft werken.
