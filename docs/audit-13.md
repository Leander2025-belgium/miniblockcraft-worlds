# (TERRANOVA, vroeger Blokstad) Technische audit Blokstad 13 (2026-11-18)

Gebaseerd op de broncode (±22.000 regels in `js/`), `docs/ov.md`, `docs/megatower.md`, de controles in
`tests/run-all.mjs` (13 controles zonder browser) en 27 browsertests in `tests/browser/`.

## Werkt goed (getest)
- **Werelden.** Echte steden (OpenStreetMap), Heel België, Reuzenberg/Alpen, Greenisland, Nova Metropool,
  Megatower City. Elk heeft een eigen generator met tegels van 128 m, IndexedDB-cache per kaartversie en opslag van
  eigen bouwwerk per tegel (`opslaan-herladen`).
- **Streaming.** Web Worker voor tegels, verticale secties van 8 m voor torens, schil-meshes, LOD voor verre
  gebouwen, automatische kwaliteit (resolutie en schaduwen omlaag bij weinig FPS).
- **Treinen (Greenisland, Alpen).**
  - Dienstregeling met spits, daluren, avond en nacht, vertragingen per rit en weer.
  - Seinblokken van 1.200 m en treinbeïnvloeding (ATP): remmen bij rood of te snel.
  - Zelf rijden met hendels en 4 camera's, overloopwissels (Greenisland).
  - Instappen, rondlopen en zitten in de rijtuigen.
  - Gladde buitenkant met draaistellen, schuifdeuren, verlichte ramen en bestemmingsborden.
- **Verkeer (steden, Megatower City).**
  - Auto's, bussen (6 types), trams, metro's en voetgangers op het netwerk.
  - Verkeerslichten, voorrang, afstand houden en haltes.
  - Dienstregeling per periode.
- **Tunnels.** Eén profiel voor tegels en diepe ondergrond, met gewelf, dienstpad, kabelgoot, lampen en ventilatieschachten
  (Greenisland). Gecontroleerd met het volledige voertuigprofiel.
- **Interactie.** Deuren, licht, tv, zitten, liggen, liften (Megatower, stadstorens), vertrekborden.
- **Interface.**
  - Pauzemenu, kaart (M), minikaart, OV-kaart en reisplanner (rail-werelden), reisplanner Megatower City.
  - Grafische profielen (laag–ultra), FPS-meter (F3).
  - Bediening op telefoon en tablet (emulatietest), lichtere standaardinstellingen op telefoons.

## Onvolledig
- **Wissels.** De treinen van de dienstregeling volgen elk één lijn en gebruiken de overloopwissels niet. Er zijn
  geen wissels in de Alpen.
- **Treinmodellen.** Er is één gedeelde buitenkant per rijtuigsoort (loc, emu, ICE, rack, tram, goederen). Er zijn
  geen aparte historische treinen en geen LOD voor de buitenkant.
- **Treinsimulatie.** Massa, treinlengte, remweg en wielslip ontbreken. Tractie en remmen waren dezelfde voor elke
  trein.
- **Metro.**
  - Greenisland: de metro rijdt via de dienstregeling van rail.js.
  - Megatower City: de metro komt uit het verkeer, zonder eigen seinen.
  - Er zijn geen depots en geen metrostations met meerdere verdiepingen of tourniquets.
- **Stations.** De Alpen hebben een ingerichte hal per station, Greenisland voorzieningen op de perrons. Er zijn geen
  hallen met meerdere verdiepingen. Het centraal station van Megatower City is een perron op een viaduct.
- **Voetgangers.** Ze wandelen over voetpaden, maar wachten niet op perrons en stappen niet in of uit.
- **Geluid.** Treinen, de motor van auto's en bussen, en omroepen en een gong. Er is geen omgevingsgeluid.

## Gevonden en opgelost in deze ronde
- **Lage plafonds bij spoor- en metrokruisingen** (30 meetpunten waar de stroomafnemer het plafond raakte, 6 punten waar het
  dak raakte).
  - Oorzaak 1: de hoogte van 10,5 m werd alleen op het kruispunt zelf vastgelegd. Kruisen twee lijnen onder een
    scherpe hoek, dan lagen ze 36 m verder nog maar 8,5 m uit elkaar.
  - Oorzaak 2: het talud onder IC1 (3 blokken steen) kwam in het plafond van de ICEF-tunnel eronder.
  - Beide zijn hersteld. De tunnelcontrole faalt nu ook als alleen de stroomafnemer zou raken.

## Technische beperkingen
- **Rendering.** Alles is `MeshBasicMaterial` met eigen shaders voor de wereld: geen PBR en geen echte reflecties.
  Schaduwen komen uit één schaduwkaart (zon).
- **Testen.** De testbrowser rekent zonder grafische kaart (SwiftShader, 11–20 FPS). Echte FPS op desktop of telefoon
  kunnen hier niet gemeten worden.
- **Bronbestanden.** `game.js` (2.100 regels), `greenisland.js` (1.800) en `osm.js` (1.400) zijn groot.
  Wereldgeneratoren delen een deel van hun code (`carve.js`, `rline.js`, `stationhall.js`, `crossover.js`), maar elke
  wereld heeft nog een eigen kolomlogica.

## Mogelijkheden voor gedeelde systemen
- **Treinsimulatie.** Massa, lengte, remweg en wielslip kunnen voor alle treinen in `rail.js` komen. De metro en tram
  van het verkeer (`drive.js`) kunnen dezelfde formules gebruiken.
- **Reizigers op perrons.** Hetzelfde systeem kan voor alle rail-werelden dienen.
- **Omgevingsgeluid.** Het kan één module worden, bepaald door de plek (stad, station, berg, tunnel).
