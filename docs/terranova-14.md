# TERRANOVA 14.0 — releasekandidaat (versie 2026-11-21a)

Branch `terranova-14`, gebaseerd op `main` 68765ba (versie 2026-11-20a). Niet naar productie gezet: dat gebeurt pas
na een expliciete go/no-go.

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

## Niet gedaan of maar deels (eerlijk)

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
