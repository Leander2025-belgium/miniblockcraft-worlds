# TERRANOVA 14.0 en 14.1 — rapport (versie 2026-11-22a)

Branch `terranova-14`. 14.0 (versie 2026-11-21a) staat sinds PR #2 op `main` (na een expliciete go). 14.1 (versie
2026-11-22a) staat op de branch en gaat pas naar productie na een nieuwe go/no-go. De open punten van 14.0 en wat
14.1 eraan deed: zie de sectie *TERRANOVA 14.1* onderaan.

## Fase 0 — baseline en audit

- **Benchmark** (`tests/browser/bench.cjs`): 7 vaste scènes met dezelfde camera, hetzelfde uur en weer en hetzelfde
  profiel (normal, schaduwen aan, zicht 160 m, LOD 1600 m, automatische kwaliteit uit, 960 × 540).
  - Megatower City: overdag, 's nachts, straat met bussen en trams, metrotunnel M1, Megatower Centraal.
  - Greenisland: Munkbay-Centraal.
  - Alpen: Reuzenberg Hauptbahnhof.
  - Meet:
    - laadtijd (wereld, eerste frame, omgeving);
    - FPS, mediaan, 95e percentiel en langste frametijd (1%-low vanaf 100 frames);
    - tekenopdrachten, driehoeken, JS-geheugen, geometrieën;
    - tegels, chunks, voertuigen en NPC's.
- **Savegames** (`tests/browser/savegame.cjs`):
  - Vaste oude bestanden in `tests/fixtures/`, gemaakt met de opslagcode van release 2026-11-20a (`maak-fixtures.cjs` haalt
    die code uit git).
  - Getest:
    - import in een lege browser, ook onder `.terranova`;
    - controlegetal van alle blokken;
    - spelerpositie;
    - het stuk spelen;
    - bouwwerk in de Alpen;
    - een kapot bestand wordt geweigerd;
    - een volledige back-up, alles wissen en terugzetten geeft exact hetzelfde.
- **Nieuw: volledige back-up** (`🛟 Volledige back-up maken`, bestand `.terranova-backup`).
  - Bevat: opgeslagen stukken, bouwwerken (ook ondergronds), bouwplannen, instellingen en favorieten.
  - Terugzetten via *Bestand importeren…* voegt toe en wist nooit iets.
  - Een import van een bouwbestand bewaart de vorige versie van een bouwwerk eerst onder `backup-edit-…`. Vroeger werd
    die stil overschreven.
- **Ongewijzigd** (savegames blijven werken):
  - de databank `blokstad`;
  - de bestandsformaten `BLOKSTAD1` en `BLOKBOUW1`;
  - de opslagsleutels `blokstad-*`;
  - de wereld-ID's;
  - de cache `blokstad-v3`.

## Fase 1 — graphics

- **Materiaalsysteem** (`js/materials.js`):
  - Elke blokstextuur hoort bij een klasse (glas, metaal, verf, steen, poreus, hout, plant, water, sneeuw, eigen licht,
    stof) met een ruwheid.
  - Metaal weerkaatst in zijn eigen kleur.
  - De ruwheid bepaalt hoe scherp het zonlicht weerkaatst.
  - Bij regen per materiaal:
    - poreuze steen en beton worden donkerder, ook muren, in strepen;
    - plassen alleen op asfalt, stoep en bestrating;
    - planten krijgen een lichte glans;
    - glas en metaal veranderen niet.
- **Eén tonemapping:**
  - Dezelfde curve voor de voxelwereld, de verre gebouwen (LOD) en alle Three.js-materialen (voertuigen, mensen, borden).
  - Fel licht wordt zacht afgeremd in plaats van hard wit.
  - In de wereldshaders een goedkope versie zonder `pow()`.
- **Licht:**
  - Voertuigen onder een dak (tunnel, metro, overkapping) krijgen hetzelfde lampenlicht als de wanden, niet meer het
    zonlicht.
  - De schaduwkaart staat vast op het pixelraster van de zonnecamera, en de zonrichting gaat in kleine stapjes. Dat
    verhelpt het flikkeren van schaduwranden.
- **Nacht:**
  - Verlichte ramen per kamer (6 × 4 × 6 m) in plaats van per blok, met warm, neutraal of koel licht.
  - Koel maanlicht en warm strooilicht laag bij de straat.
- **Lichtschakelaar:** een hotelkamer wordt 's nachts echt donker op het scherm (`tests/browser/graphics.cjs`: helderheid
  151 → 15).

**Beeld vóór → na** (gemeten in de schermafdrukken van de benchmark; de rand met de interface niet meegeteld):

| Scène | Helderheid | Overbelichte pixels | Pikzwarte pixels |
|---|---|---|---|
| Megatower City overdag | 132 → 118 | **5,5 % → 0,15 %** | 0 → 0 |
| Megatower City 's nachts | 39 → 32 | 0,15 % → 0,15 % | 27 % → 26 % (vooral de lucht) |
| Metrotunnel M1 | 70 → 51 | 0,15 % → 0,15 % | 0 → 0 |

- De beelden "na" zijn gemaakt met de eerste tonemapping-versie, die zwart iets verschoof (daardoor donkerder).
- De huidige goedkope versie doet dat niet meer.
- Visueel: het plein overdag toont weer zijn textuur, 's nachts zijn de straat en de mensen zichtbaar, en de gevel van
  de Megatower toont kamers in plaats van ruis.
- Nog onrealistisch: de stadslichten 's nachts zijn een schatting zonder echte lichtbronnen; geen reflecties van
  gebouwen in glas.

## Fase 2 — prestaties

- **Renderprioriteit** (Megatower City en Nova, steden met een vlakke straat):
  - Chunks met ruimtes onder de straat worden apart gemesht (onder- en bovengronds deel).
  - Zit de camera ingesloten onder de grond, dan worden bovengrondse delen verder dan 48 m niet getekend, en ook de
    verre LOD-gebouwen niet.
  - De simulatie loopt gewoon door.
  - Niet in bergwerelden: daar kijk je door een tunnelmond naar het landschap.
- **Voertuig-LOD:**
  - Interieurs (stoelen, stangen, handgrepen, bekleding, plafonds) worden apart bijgehouden.
  - Vanaf ±70 m (met marge tegen springen) wordt een voertuig getekend zonder interieur: 60–85 % minder driehoeken per
    bus, tram, metro of trein.
  - Het voertuig waarin of waarmee je rijdt is altijd volledig.

**Benchmark vóór → na** (headless Chromium met SwiftShader = software-rendering zonder GPU; geen echte desktop of
telefoon):

| Scène | Kwaliteit | FPS | p95 frametijd | Tekenopdrachten | Driehoeken |
|---|---|---|---|---|---|
| Metrotunnel M1 | normal | 1,6 → 3,7 | **1282 → 537 ms (−58 %)** | 884 → 170 | 1,32 M → 0,27 M |
| Megatower overdag (afwisselend gemeten, 2×) | normal | 1,2 / 0,7 → 1,5 / 1,5 | 2087 / 2978 → 1320 / 976 ms | — | 1,35 M → 1,42–1,51 M |

- In dezelfde browser, op dezelfde plek en in hetzelfde frame (`graphics.cjs`) tekent de metrotunnel met
  renderprioriteit 76 % minder driehoeken en 78 % minder tekenopdrachten, met exact dezelfde helderheid van het beeld.
- **Meetonzekerheid:**
  - De machine schommelt sterk; een eerste reeks na de wijziging gaf bovengronds 10–41 % tragere tijden.
  - Daarom is overdag oud en nieuw afwisselend opnieuw gemeten (tabel). Daarin was de nieuwe versie telkens sneller.
  - Met 8–23 frames per meting zijn de cijfers ruw.
  - Echte FPS op een GPU of telefoon zijn hier niet gemeten.

## Fase 3 — voertuigen

- Bestemmingsdisplays met echte tekst (lijn en eindhalte van de rit) aan de voorkant van metro's, trams en bussen
  binnen 140 m.
- Knipperende deurwaarschuwing (oranje, de laatste 3 s voor het sluiten) boven de metrodeuren aan de perronkant.
- Interieurs als aparte delen voor de LOD (zie fase 2).
- De paarse plafondfout van metro M1 komt niet terug (`metro-interieur.cjs` en `voertuig-interieurs.cjs` in de regressie).

## Fase 4 — reizigers en bezetting

- **Ritlaag** (`js/ovtrips.js`):
  - Elk OV-voertuig van het verkeer heeft een rit met een vaste identiteit: ritnummer, lijn of eindhalte, capaciteit,
    bezetting, toestand.
  - Rijdt het voertuig uit beeld, dan blijft de rit bewaard en neemt een voertuig op dezelfde lijn en in dezelfde richting
    hem later over, met dezelfde reizigers.
  - Wachtenden aan bushaltes tellen mee bij in- en uitstappen; een volle bus laat mensen staan.
  - Elders wordt het in- en uitstappen per halte berekend volgens de periode.
  - De bezetting staat in het dashboard bij het meerijden.
- **Reizigers met een doel** (`js/travelers.js`):
  - Lopen gaat over een navigatieraster uit de echte blokken (A*): vaste grond, 2 blokken lucht, trappen van 1 blok, geen
    hoeken afsnijden.
  - Een reiziger wacht op het juiste voertuig (soort, lijn, richting) en stapt in bij open deuren.
  - Hij rijdt mee, telt mee in de bezetting, stapt uit aan de juiste halte aan de perronkant en loopt verder.
- **Reistest** (`tests/browser/reis.cjs`), geslaagd:
  - straat bij Oude Markt → trap → perron (−16 m) → M1 richting Megatower → uitstappen;
  - → trappen naar de straat → Halte Megatower Plaza → bus → uitstappen aan de volgende halte;
  - 481 looppunten, alle beloopbaar, geen sprongen;
  - bezetting +1 en −1 klopt;
  - in- en uitstappen ≤ 0,9 m van de deur.
- **Verkeersfouten gevonden en hersteld:**
  - Metro's, trams en treinen kregen een willekeurige rijrichting op een spoor van een dubbelspoor. Tegenliggers op
    hetzelfde spoor blokkeerden elkaar dan voorgoed. Nu heeft elk spoor een vaste rijrichting.
  - Aan de rand van het geladen net reden ze op hetzelfde spoor terug. Nu gaan ze daar uit beeld en blijft hun rit bewaard.

## Fase 5 — OV-netwerk

- **Automatische treinen over wissels** (`js/railroute.js`):
  - Doorgaande diensten S11 (Easthaven → Eastport Central) en S12 (Southbay → West Munkbay) rijden over de
    overloopwissels X1 en X2 van IC1 naar S1.
  - De dienstregeling reserveert de blokken van de echte sporen en de wissel zelf (beide richtingen rond de wissel).
  - **Rijweginstelling:**
    - 800 m voor de wissel wordt de rijweg ingesteld en vergrendeld; de wissel gaat om in 3D.
    - Op de wissel is hij bezet; na passage van de hele trein wordt hij vrijgegeven.
    - Is het conflictgebied bezet (bv. door een vertraagde S1), dan wacht de trein voor het inrijsein of vertrekt hij later.
  - **Controle** (`tools/check-wisselroutes.mjs`, in `tests/run-all.mjs`):
    - 16 ritten per dag over X1 en 16 over X2;
    - 0 conflicten over een hele dag (elke 5 s);
    - vandaag 5 ritten later vertrokken voor een vrije rijweg.
  - De vertrekborden tonen dezelfde vertraging als de trein (20 van 20 gecontroleerd).
  - De 114 bestaande ritten blijven allemaal in de dienstregeling.
- **Reisplanner (spoorwerelden):** rekent met de echte ritten van vandaag, met vertraging. Een vertraagde vorige trein kan
  nog gehaald worden; de vertraging staat erbij.

## Fase 6–7 — regressie (releasekandidaat 2026-11-21a)

- `node tests/run-all.mjs`: alle controles geslaagd, waaronder Reuzenberg (vorm exact behouden), de vrijprofielen van de tunnels (M1, ICEF, AX1, AE, NZ: 0 punten geblokkeerd) en de nieuwe controle op de wisselroutes (0 conflicten).
- Browserregressie: 29 tests, alle zonder fouten. Dat zijn de bestaande tests (treinen, kaart, mobiel, opslaan en herladen, OV-diagnose, Megatower, Greenisland, metro-interieur, voertuig-interieurs …) plus de nieuwe tests branding, savegame, graphics en reis.
- Er was geen enkele shaderfout, en er waren geen paginafouten.

## TERRANOVA 14.1 (versie 2026-11-22a) — de open punten van 14.0

| Onderdeel | Wat er nu is | Bestanden | Controle |
|---|---|---|---|
| Reizigers verschijnen vanzelf | Rond de speler verschijnen reizigers op straat bij haltes die het verkeer echt bedient. Ze lopen er met A* naartoe (ook trappen af naar het metroperron), stappen in de juiste soort voertuig (bezetting van de rit +1), rijden mee tot de volgende halte, stappen uit en lopen verder. Het aantal hangt af van het uur: spits 14, dal 9, avond 6, nacht 2. Het A*-zoeken is over frames verdeeld: de piek daalt van 22 naar 8,8 ms per tik (SwiftShader). | `js/travelers.js`, `js/traffic.js`, `js/ovtrips.js`, `js/buspax.js`, `js/game.js` | `tests/browser/reizigers-auto.cjs`: 45 verschenen, 33 ingestapt, 7–12 uitgestapt en aangekomen, 0 niet-beloopbare punten, bezetting klopt |
| Live OV-kaart | Kaart van Megatower City (pauzemenu en grote kaart) met M1, IC en T1–T4. Echte voertuigen rond de speler komen met rit en bezetting uit de ritlaag; daarbuiten tonen we voertuigen volgens de dienstregeling. Klik op een voertuig voor lijn, richting, rit, bezetting en volgende halte; klik op een halte voor de vertrekken en navigatie. Ververst elke seconde. | `js/ovmap.js`, `index.html`, `js/app.js` | `tests/browser/ovkaart.cjs`: 13 echte en 90 geplande voertuigen; de rit en bezetting op de kaart zijn gelijk aan de ritlaag; de kaart beweegt live |
| Multimodale reisplanner | Tijdsafhankelijke Dijkstra over wandelen, metro M1, trein IC en trams T1–T4 (haltes zoals in de wereld). Blijft zitten op hetzelfde voertuig, overstappen te voet met 1 min overstaptijd. ± 3 ms per plan. | `js/megaplan.js` | `ovkaart.cjs`: tram + overstap gevonden; `mobiel.cjs` |
| Remises | 4 remises (IC1 Easthaven en Southbay, IC3 Easthaven, IR4 Southbay) op vrije, vlakke plekken buiten de bebouwing. Elk heeft 4 opstelsporen van 240 m onder een hal en een keel naar het vertrekspoor. Omloop per materieelsoort: een keerrit binnen 7–45 min blijft aan het station; anders rukt een stel uit of in. Rangeerritten rijden alleen als het hoofdspoor vrij is. Niet-rijdende stellen staan zichtbaar op de opstelsporen. Het depot-tabblad toont per remise de stand en de volgende rangeerrit. | `js/depot.js`, `js/depotsim.js`, `js/greenisland.js`, `js/rail.js` | `tools/check-depots.mjs`: plek vrij en vlak, ballast 60/60, dak 52/52, sprong ≤ 2 m, aansluiting aan het perron ≤ 0,13 m, **0 conflicten** over een hele dag; `tests/browser/remise.cjs`: overdracht zonder sprong (0 m) |
| Nieuw materieel per categorie | S-Bahn (22 m, 3 deuren), metro (18 m, noodfrontdeur, derde rail, geen stroomafnemer), Airport Express, regionale motorwagen, diesellocomotief. Ingezet in Greenisland en de Alpen. | `js/trainshell.js`, `js/rail.js`, dienstdata | `tests/browser/materieel.cjs`: elk model een andere geometrie, juiste lengtes en deuren |
| Nieuwe gevels | 5 gevelsoorten voor de torens van Megatower City: vliesgevel, bandramen, tweekleurige banden, lamellen, natuursteen. Ze zijn gekozen op het aantal vlakken: samen 3 % minder driehoeken dan vroeger (1003k tegen 1034k op 6 tegels); een fijn raster kostte +50 % en is niet gebruikt. | `js/megacity.js` | `tools/check-gevels.mjs`; voor/na: `docs/terranova-14-gevels-voor.png` en `-na.png` |
| Meten op echte toestellen | Knop **📊 Prestatietest op dit toestel** in het menu: 5 vaste scènes in Megatower City. Gemeten: FPS, mediaan, p95 en max van de frametijd, tekenopdrachten, driehoeken, laadtijd en heap. Daarbij komen de echte GPU-naam en schermgegevens. De eigen instellingen worden teruggezet; het resultaat is kopieerbaar. | `js/perftest.js`, `js/app.js`, `index.html` | `tests/browser/prestatietest.cjs` |

**Regressie 14.1:**
- `node tests/run-all.mjs`: alle controles geslaagd, ook de nieuwe remise- en gevelcontroles. Reuzenberg exact behouden.
- Browserregressie: 33 tests (de 28 bestaande plus 5 nieuwe), allemaal exit 0.
- Twee tests (`nooduitgang`, `greenisland-geen-herlaad`) meldden een paginafout. Een doorgaande trein over een wissel stond met open deuren aan een perron, en het reizigerssysteem verwachtte een gewone lijn. Hersteld (reizigers gebruiken het echte spoor van de trein); beide tests opnieuw gedraaid: geen fouten.

Beelden: `docs/terranova-14-remise.png`, `docs/terranova-14-materieel.png`, `docs/terranova-14-ovkaart.png`.

## Nog niet gedaan of maar deels (eerlijk, na 14.1)

- **Echte GPU-metingen:** de prestatietest zit in het spel, maar ik heb zelf geen GPU of telefoon. Echte cijfers
  komen er pas als iemand de test op een toestel draait en het resultaat doorstuurt.
- **Bussen in de planner van Megatower City:** de bussen rijden er zonder vaste lijn (elke bus kiest zijn route). Een
  planner die bussen belooft zou dus niet kloppen, daarom staan ze er niet in.
- **Live OV-kaart buiten Megatower City:** Greenisland en de Alpen hebben hun eigen OV-kaart met live treinen. Nova en de
  echte steden hebben nog geen klikbare kaart.
- **Remises:** alleen in Greenisland (IC1, IC3, IR4). De S1 en de metro's liggen volledig in de stad: daar is geen
  vrije plek gevonden. Bij meer dan 4 stellen in één remise staan de extra stellen in de telling, niet zichtbaar.
- **Gevels:** verre torens (buiten het zichtbereik, als eenvoudige LOD-blokken) tonen de nieuwe gevel nog niet. De
  middelhoge bouwblokken zijn niet veranderd.
- **Materieel:** geen dubbeldekstreinen (het interieur is 1 verdieping hoog). De bussen, trams en metro's van de
  verkeerswerelden (`js/vehicles.js`) zijn niet vernieuwd.
- **Reizigers:** de types verschillen alleen in wandeltempo; nog geen eigen routevoorkeuren.
- **Stations:** geen nieuwe stationsmodules (roltrappen, cafés). OV-diagnose niet uitgebreid. Geen test van 30 minuten
  spelen.

## Wat in 14.0 nog open stond (ter vergelijking)

- **Depot:** niet gebouwd. Daarvoor zijn nieuwe sporen in de wereldgenerator nodig (opstelsporen, onderhoudshal,
  aansluiting), en dat verandert de tegels van Greenisland.
- **Gevels:** verzonken ramen, balkons, regenpijpen en architectuur per wijk niet gedaan.
- **Voertuigmodellen:** geen nieuwe treinmodellen per categorie; bussen, trams en metro alleen displays, deurwaarschuwing
  en LOD.
- **Stations:** geen nieuwe stationsmodules (roltrappen, cafés, hallen).
- **Reizigers-AI:** wordt nog niet automatisch in de wereld ingezet, alleen via `game.travelersOn()` (test). Er zijn nog
  geen reizigerstypes met eigen routevoorkeuren: alleen het wandeltempo verschilt.
- **Reisplanner verkeerswerelden:** de reisplanner van Megatower City (`js/megaplan.js`) is niet aangepast; geen
  multimodale planner over metro, tram, bus en trein samen in de verkeerswerelden.
- **Live OV-kaart:** geen aanklikbare voertuigen met ritinfo.
- **OV-diagnose:** niet uitgebreid.
- **Stabiliteit:** geen test van 30 minuten rijden, geheugenlekken of wisselen tussen werelden. Geen echte telefoon,
  iPad of GPU gemeten.
