# TERRANOVA 16.1 — Megatower City: Ultimate Metropolis Revolution (ontwikkelversie 2026-11-27a)

Branch `terranova-16.1`. Niet gepubliceerd; `main` is ongewijzigd tot er een expliciete "go" is.
Alle cijfers komen uit deze ontwikkelomgeving: headless Chromium met SwiftShader (rekent zonder grafische kaart).
FPS-waarden zijn daardoor zeer laag en alleen onderling vergelijkbaar (voor/na op dezelfde machine), niet met een
telefoon of een pc. Een mobiele test op een echt toestel was hier niet mogelijk.

## Fase 0 — audit en bouwplan

- Megatower City wordt per tegel van 128 m gegenereerd (`js/megacity.js`, toren in `js/megatower.js`), in de worker,
  deterministisch. Het verkeer (`js/traffic.js`) bouwt zijn net uit de paden die elke tegel meegeeft en koppelt alleen
  eindpunten; een wissel is een eindpunt met meerdere vervolgsporen.
- Opslag: een bewerkt stuk stad wordt **in z'n geheel** bewaard (`megatower-edit-<tx>-<tz>`) en vervangt dan de
  generator. Gegenereerde tegels zitten in een cache per generatorversie. Gevolg: spelersbouwwerken zijn automatisch
  beschermd, maar tonen na een vernieuwing de oude architectuur (zie fase 9).
- Baseline: 10 meetplekken en 5 torenaanzichten, gemeten op de code van `main`
  ([`megatower-revolution/voor.json`](megatower-revolution/voor.json), foto's in
  [`megatower-revolution/voor/`](megatower-revolution/voor/)).

## Fase 1 — The Megatower: nieuwe buitenarchitectuur

Wat bleef: exact 1.000 m (dak op 1.000 m, niets erboven), 250 verdiepingen, 25 kelders, alle liften, interieurs,
kamers en deuren (de bestaande torencontrole vindt 0 onbereikbare ruimtes en 582 liftstops in 11 liften).

Wat nieuw is (`js/megatower.js`):
- **Gelede vliesgevel** in plaats van één raamraster: traveeën van 6 m; om de vier een dichte pijler met een smalle
  raamspleet, daartussen afwisselend twee glassoorten (verticale stroken), stijlen om de 6 m. Elke torensectie heeft
  eigen glas, kader en een tweede glassoort.
- **Afgeronde hoeken** (die bestonden al) zijn nu één doorlopende **panoramische glaswand**.
- **Uitstekende ribben** één meter buiten de gevel om de 6 m; om de 12 m een **ledlijn**.
- **Overgangen tussen secties**: op de bovenste verdieping van elke sectie een lichtband, op de eerste een koperen of
  metalen gordel; de terrassen op de getrapte overgangen bleven (glazen balustrade, gras, plantenbakken).
- **Negen uitkragende sky gardens** (16 × 3 m) met gras, hagen, bomen, bank en glazen balustrade, telkens met een
  glazen deur (verdiepingen 44, 62, 96, 112, 136, 164, 184, 212, 226).
- **Hoofdingang**: portaal van 12 m hoog met de naam, en een glazen **luifel van 32 × 14 m** op kolommen over het
  plein, met lampen eronder en een lichtlijn aan de voorrand.
- **Top**: verlichte kroon (lamellen met ledlijnen), lichtring op de dakrand op 1.000 m, rails van de
  gevelonderhoudsinstallatie en luchtbehandeling op het dak, helikopterplatform.
- **Nachtverlichting** (shader in `js/game.js`): de ledgevel krijgt 's avonds een langzame lichtgolf; het aandeel
  verlichte kamers volgt het uur (meer licht begin van de avond, weinig diep in de nacht) en af en toe gaat een kamer
  aan of uit.
- **Van ver** (`js/lod.js`): de toren heeft een eigen gevelschaduw in de verre weergave (stroken, pijlers, ribben met
  lichtgolf, lichtbanden op de sectiehoogtes, verlichte kroon). Eén mesh en één shader: geen extra tekenopdrachten.
- Grenzen: geen echte instancing van gevelelementen (de gevel blijft blokken in de tegel; de bestaande schil-mesh
  maakt er grote vlakken van). Geen spits boven 1.000 m (de opdracht vroeg exact 1.000 m).
- Controle: `tools/check-megagevel.mjs` (hoogte, verdiepingen, liftstops, per zijde ≥ 4 gevelmaterialen, ribben,
  lichtbanden, sky gardens, luifel, aantal verschillende gevelpatronen over de hoogte).

## Fase 2 — stadsbeeld

- **Hoogtemix**: in centrum en zakendistrict is niet meer elk perceel een wolkenkrabber; ± 26–38 % middelhoogbouw
  (24–48 m, bestaande bouwblokken met binnentuin en winkels) en ± 10 % **pocketparken** (pad, bomen, banken,
  speeltuin of waterpartij).
- **Nieuwe wijken**: een **culturele wijk** rond metro Museumkwartier (museum met zuilengang, theater met lichtreclame,
  bibliotheek, concertzaal, galerie, plein met beelden) en een **uitgaanswijk** naast Grand Central (smalle panden met
  cafés, clubs, lichtreclames, terrassen en een bioscoop).
- Bestonden al en blijven: historisch centrum, villawijk, havenpakhuizen, woonwijken, buitenwijken, parken, stoepen
  met banken, bloembakken, bushokjes, verkeersborden, fietspaden, zebrapaden en lantaarns.
- Controle: de stadscontrole (`tools/check-megacity.mjs`) vindt 0 gaten en 0 zwevende blokken, nu ook in de nieuwe
  wijken, de boulevard, de Galleria en Grand Central.
- Grenzen: de wijkindeling is een laag over de bestaande ringen; ik heb niet elk gebouwtype van de stad vernieuwd.

## Fase 3 — Megatower Galleria

Tegels 41..42 × 43..44, 228 × 228 m (`js/shopping.js`):
- **Logistieke kelder** (-1) met kolommen, rekken met kratten en vrachtwagens aan de laadplaatsen.
- **Vijf winkelverdiepingen** van 6 m rond een **atrium** onder een **glazen dak**: galerijen met glazen balustrades,
  twee **bruggen** over het atrium, **roltrappen** (van elk niveau één omhoog), vier **liften** (kelder tot niveau 4),
  **foodcourt** op niveau 3 (dek met tafels in het atrium), **panoramagalerij** langs de buitengevel op niveau 4,
  dakterras met beplanting. Vier ingangen; de **metro M2** (station Galleria) komt rechtstreeks in het atrium uit.
- **360 ingerichte winkels en horecazaken** (niveau 0–4: 73/80/74/65/68), waarvan 99 horeca en 22 toiletten.
- Elke winkel (`js/shops.js`) heeft een glazen pui met open ingang en etalage, een inrichting die bij de soort past
  (rekken met producten en prijskaartjes in de textuur, toonbank met kassa, paskamers, vitrines, tafels en stoelen,
  keuken met uitgiftebalie en menukaart), lampen en — als de winkel diep genoeg is — een personeelsruimte met deur.
- **Voetgangers**: looproutes op elk niveau, zijpaadjes naar de winkeldeuren (binnenlopen en weer naar buiten),
  roltrappen als hellende routes, ingangen naar de stoep. Ze gebruiken de bestaande voetgangers van het verkeer
  (die op afstand niet gesimuleerd worden).
- Grenzen: winkelnamen herhalen (met een nummer, bv. "Nova Mode 3"); de voetgangers in de Galleria zijn de gewone
  voetgangers op looproutes, niet de bewoners met een dagritme (`js/society.js`).

## Fase 4 — Grand Boulevard

Tegelkolom 40: van z 3840 tot het torenplein en van het torenplein tot Grand Central — **1,66 km** autovrije
winkelstraat van 40 m breed: **227 ingerichte winkels en horecazaken** aan beide kanten (49 horeca, 212
verschillende namen), elk pand met eigen gevel, materiaal en hoogte (2–6 lagen), luifels, terrassen voor cafés en
restaurants, twee rijen bomen, een fontein op elk pleintje, banken, bloembakken, lantaarns, wegwijzers, een fietspad in
twee richtingen. Waar een laan de boulevard kruist: zebrapad en verkeerslicht (het verkeer stopt).
Aansluitingen: tram T5 (trap naar het tramstation aan het zuideinde), metro M1 (Megatower) en M2 (Galleria),
buslijnen op de lanen, Grand Central via de noordingang.
- Grenzen: geen aparte parkeergarages toegevoegd (de toren heeft er één; de straten hebben er niet).

## Fasen 5 en 6 — Megatower Grand Central

`js/grandcentral.js`. Het station ligt op het bestaande spoorviaduct; de lanen lopen er gewoon onder door.

| niveau | hoogte | wat |
|---|---|---|
| +1 | G+17 | **stationshal** boven de sporen (160 × 192 m, glazen dak tot ± 55 m, spanten, kolommen): groot vertrekbord, infobalie, ticketautomaten, **38 winkels en horecazaken** (supermarkt, bakker, cafés, restaurants, kleding, elektronica, boekhandel, telefoon, chocolatier, parfumerie, apotheek, toiletten, bagagekluizen, ticketloketten), wachtruimte, wegwijzers |
| 0 | G+10 | **22 perronsporen aan 11 eilandperrons** van 408 m, overkapping met spanten, banken, vertrekborden, perronnummers, lampen, ticketautomaten; **hyperloopterminal** aan de zuidkant (afgesloten, perronschermen) |
| straat | G | **onderdoorgang** onder het spoordek (de lanen lopen door), **noordingang** met monumentale glasgevel, roltrappen en trap naar de hal |
| -1 | G-9 | **tramstation**: 10 sporen aan 5 eilandperrons |
| -2 | G-26 | **metrostation**: 6 sporen aan 3 eilandperrons (metro M2) |

Afwijking van de opdracht: de publieke hoofdinkom ligt op straatniveau (noordingang) en de grote hal op +1 boven de
sporen; de hyperloopterminal ligt op het perronniveau (0) maar naast de treinhal, niet in dezelfde hal, omdat de buis
anders de sporen zou kruisen. Elk perron heeft een **lift** (straat – perron – hal), een **roltrap** naar de hal en een
**trap** naar de onderdoorgang.

## Fase 7 — het OV-net

- **Trein**: aan beide kanten een **wisselstraat** (cosinusbogen van 288 en 280 m) van het hoofdspoor naar elk
  perronspoor; sporen 1–11 hangen aan het noordelijke hoofdspoor (oostwaarts), 12–22 aan het zuidelijke (westwaarts).
  Elk perronspoor heeft een eigen halte met perronnummer.
- **Treindienstleiding** (`js/traffic.js`): een trein krijgt vóór de wisselstraat het vrije perronspoor dat het langst
  ongebruikt bleef; een wisselstraat is maar voor één voertuig tegelijk vrij; zonder vrij spoor wacht de trein.
- **Tram T5** (nieuw): over de laan z = 5888 door de hele stad; bij Grand Central via **hellingen** in de middenberm
  naar een **tunnel** en het tramstation (-1) met een waaier naar 10 sporen.
- **Metro M2** (nieuw): noord–zuid onder de laan x = 5376 (onder M1 door), 8 stations (Noordkwartier, Parkstad,
  Museumkwartier, Galleria, Grand Central, Zuidkade, Zuidpark, Zuidpoort); in Grand Central een waaier naar 6 sporen.
- **Hyperloop** (fictief toekomstconcept, `js/hyperloop.js`): eigen glazen buis van terminal A (Grand Central) naar
  terminal B (luchthaven), 3,7 km. Eén capsule met automatische deuren, snelheidsprofiel met optrekken en remmen
  (2,5 m/s²), maximaal 2 m/s² zijwaarts in de bochten, top 252 km/u; rit ± 92 s, om de 5 minuten. Wie in de capsule
  staat, rijdt mee; staat er iemand in de buis, dan vertrekt de capsule niet.
- **Reisplanner en vertrekborden** (`js/megaplan.js`): T5, M2, de hyperloop en "Megatower Grand Central" zitten in
  de planner en de dienstregeling; het vertrekbord in de hal toont trein, hyperloop, T5 en M2.

**Wat echt operationeel is** (getest, zie fase 10):
- alle **22 treinperronsporen** zijn in het verkeersnet bereikbaar vanaf het hoofdspoor en hebben een halte;
- alle **10 tramsporen** en alle **6 metrosporen** idem;
- de hyperloop rijdt tussen A en B.

Niet gedaan / grenzen:
- er rijdt maar **één treinlijn** (IC naar de luchthaven) over het viaduct; de 22 sporen worden door die treinen
  gedeeld (er zijn geen extra treinlijnen naar nieuwe bestemmingen);
- het juiste perronspoor wordt pas **bij het binnenrijden** toegewezen; het vertrekbord toont daarom de groep
  (sporen 1–11 of 12–22), geen vast spoornummer;
- seinen: de bestaande treinbeveiliging (ATB) geldt voor zelf bestuurde treinen; in de wisselstraten beveiligt de
  vergrendeling, er staan geen aparte seinen per perronspoor;
- de OV-kaart toont de nieuwe lijnen via de planner; ik heb de kaart niet apart nagekeken in een schermafdruk;
- reizigers in Grand Central lopen op looproutes (binnenkomen, vertrekbord, automaat, winkels, roltrap, perron, trap);
  instappen en uitstappen gebeurt door het bestaande reizigerssysteem aan de haltes.

## Fase 8 — prestaties

Wat gebruikt is: alle nieuwe gebouwen zijn gewone blokken in de tegels (de bestaande chunk-meshing voegt vlakken samen,
de verre weergave tekent ze als blokken van 8 × 8 m); de toren van ver is één mesh met één shader; het verkeer en de
voetgangers worden op afstand niet gesimuleerd (bestaand). Niet gebouwd: aparte instancing van gevelelementen,
interieur-LOD per verdieping voor de winkels, streaming per stationsdeel.

METINGEN_HIER

## Fase 9 — savegames

- Alle werelden, opslagsleutels, wereld-ID's en het bestandsformaat zijn ongewijzigd.
- Bewerkte stukken van Megatower City blijven zoals ze waren (ze worden nooit automatisch overschreven).
- Elk bewaard stuk krijgt voortaan een **basisversie** (de generatorversie waarop het steunt); oude stukken tellen als
  versie 6.
- **Migratie op vraag** (pauzemenu → Wereld → "Megatower City 16.1 — jouw bouwwerken"): per stuk eerst een
  **herstelbare back-up** (`…@v6`), dan worden jouw wijzigingen (ook weggehaalde blokken) berekend tegenover de
  oude stad (bevroren generator `js/legacy/megacity-v6.js`) en op de nieuwe stad gezet; terugzetten kan.
- Controle: `tools/check-migratie.mjs`.

## Fase 10 — tests

RESULTATEN_HIER

## Wat nog niet klaar is

- extra treinlijnen naar nieuwe bestemmingen (nu één IC-lijn over de 22 sporen);
- seinen per perronspoor, vaste spoortoewijzing in de dienstregeling;
- de bewoners met een dagritme gebruiken de nieuwe winkels nog niet als bestemming (de voetgangers wel);
- een echte mobiele test en metingen op een GPU;
- instancing en interieur-LOD voor de winkels.
