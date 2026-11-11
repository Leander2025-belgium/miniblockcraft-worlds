# Greenisland – canon en voorstellen

Dit bestand houdt bij wat **eerder door de ontwerper is vastgelegd (canon)** en wat **in Blokstad als voorlopig voorstel** is ingevuld.
Alle gegevens staan in één aanpasbaar bestand: `js/greenisland-data.js` (velden `canon: true/false`).
Na een wijziging van ligging of lijnen: `node tools/plan-green.mjs` (tracés), daarna `node tools/bake-green-map.mjs` (kaarten) en `node tests/run-all.mjs` (controles).

## Canon (eerder vastgelegd)

| Onderwerp | Gegeven |
|---|---|
| Naam | Greenisland |
| Hoofdstad | Munkbay (ongeveer 1,5 × Brussel) |
| Ligging | Noordzee, in de omgeving van België, Nederland, Duitsland en het Verenigd Koninkrijk |
| Afmetingen | 145 km lang, 50 km breed, ± 7.250 km² |
| Bevolking | 15.034.500 |
| Plaatsen | ongeveer 220 steden en dorpen |
| Klimaat | iets warmer dan België |
| Provincies | East, West, North, South en Central Greenisland |
| Provincie van Munkbay en Riverside | East Greenisland |
| Plaatsnamen | Munkbay, Riverside, Westport, Rainforest City, Silverpine, Black Point, Northcliff, Rodenberg, Viridonia, Greenport, Easthaven, Southbay, Northfield |
| Stadsdelen Munkbay | Munkbay Central, Munkbay-Noord, -Zuid, -West, -Oost, Munkbay-Haven, Munkbay Old Town, Munkbay University, Munkbay Central Park, Eastside, Eastport Central, West Munkbay |
| Westport | grote havenstad (containers, industrie, ferry's, cruiseterminal) |
| Rainforest City | moderne stad bij het regenwoud |
| Silverpine | bergstad in het Viridonia Gebergte |
| Northcliff | noordelijke kustplaats met kliffen |
| Black Point | ruige kust, rotsen, vuurtoren, wrak van de SS Viridonia (scheepsramp 1923) |
| Gebergte | Viridonia Gebergte |
| Munkbay Central | spoor 1: ICE naar Frankfurt · spoor 2: AX1 Airport Express · spoor 3: ICE naar Amsterdam |
| Lijnen | IC1 – Oostkustlijn · IC2 – Viridonia Express · S1 – Munkbay S-Bahn |
| S1 | West Munkbay → Harbour → University → Central Park → Munkbay Central → Old Town → Eastside → Eastport Central; elke 15 min overdag, ± 05:00–00:00, daarna beperkte nachtdienst; perron 5 in Munkbay Central (voorlopig gegeven) |
| Metro | 10 lijnen: M1 Noord-Zuid, M2 West-Oost, M3 Ringlijn, M4 Havenlijn, M5 Binnenstad, M6 Express, M7 Zuidwest, M8 Universiteit, M9 Buitenring, M10 Haven–Expo; M1–M3 elke 15 min van 06:30 tot 23:00 |
| Metrostations | Munkbay-Centraal, -Noord, -Zuid, -West, -Oost, -Haven, Forum, Universiteitsplein, Munkbay-Airport, Cargo-Terminal, Expo Munkbay |
| Tram | 15 lijnen (T1–T15); T1 en T1s elke 15 min van 06:30 tot 23:00 |
| Namen | GreenAir (luchtvaartmaatschappij), GNMI (Greenislands Nationaal Meteorologisch Instituut), Zenvo (automerk), ViridCoin (munt), Greenline en RailControl (vervoersbeheer) |
| Postcodes | formaat G-XXXX |
| Belgisch Greenline-net | apart netwerk (Oostende, Brussel, Gent, Zottegem…): **niet** als binnenlandse lijnen op het eiland gebruikt |

## Voorstellen (voorlopig, aanpasbaar)

- **Oriëntatie en kust**: het eiland loopt oost-west (145 km) en noord-zuid (± 35–46 km breed). Kustlijn, baaien (Munkbaai, Zuidbaai, Westhaven, Groene Baai, Noordinham) en kapen (Black Point, Kaap Northcliff, Easthaven-schiereiland).
- **Provinciegrenzen**: West ten westen van x = 34 km, East ten oosten van x = 106 km; North / South / Central in het midden (grenzen op z = 15,5 en 35 km).
- **Ligging van alle plaatsen** (ook van de canonnamen), hun status (stad, stad, dorp) en hun straal.
- **207 extra plaatsen**: deterministisch gegenereerd; namen samengesteld uit Nederlandse en Engelse delen; stijl volgens de omgeving (kust, land, berg, tropisch).
- **Postcodes**: eerste cijfer = provincie (1 West, 2 North, 3 Central, 4 South, 5 East), Munkbay G-5000.
- **Viridonia Gebergte**: ligging (Central, ten noorden van Viridonia), hoogste top Viridonia Piek 2480 m; Silverpine Horn 2190 m, Groene Wachter 1960 m.
- **Rivieren en meren**: Munk (door Munkbay naar de Munkbaai), Viri, Westbeek; Silvermeer, Groenmeer, Noordermeer.
- **Spoortracés** (automatisch door het landschap gezocht) en de stations onderweg; IC1 loopt Easthaven – Munkbay – Southbay; IC2 Munkbay – Riverside – Viridonia – Rodenberg – Westport.
- **Extra lijnen**: IC3 Noordlijn (Westport – Northfield – Northcliff – Black Point – Easthaven), IR4 Zuidlijn (Westport – Greenport – Rainforest City – Southbay), Silverpine Bergbahn (tandrad, Viridonia – Silverpine).
- **Spoornummers** in Munkbay Central buiten de canon: 4 = IC1, 6 = IC2.
- **Frequenties** (behalve S1): ICE elk uur, AX1 elke 15 min, IC1/IC2 elk halfuur, IC3/IR4/Bergbahn elk uur, nachttrein Westport–Munkbay, goederentreinen.
- **Internationaal**: ICE door een Noordzeetunnel aan de oostkust; aan het einde reis je verder naar de Frankfurt-wereld of naar Amsterdam Centraal (echte stad, OpenStreetMap).
- **Luchthaven Munkbay**: ten zuiden van de stad, twee banen, terminal; ondergronds AX1-station.
- **Ligging van landmarks**: parlement, presidentieel paleis, GNMI, Zenvo (hoofdkantoor Munkbay, fabriek Riverside), nationale bank, ziekenhuis, universiteit, GreenAir-hoofdkantoor, vuurtoren Black Point, wrak SS Viridonia voor de kust.
- **Metro M1–M10**: ligging van alle lijnen en stations, extra stations (bv. Noordplein, Zuidpoort, Beurs), twee diepteniveaus (12 en 24 m), frequentie M4–M10 elke 10 min (05:30–00:30). Canon: lijnnamen, stationsnamen, M1–M3 elke 15 min 06:30–23:00.
- **Tram T1–T15**: ligging over de lanen van Munkbay en de haltenamen (tools/plan-tram.mjs); T1s stopt om de andere halte; T2–T15 elke 10 min. Canon: 15 lijnen, T1 en T1s elke 15 min 06:30–23:00.
- **Straatprofielen**: laan 22 m (fietspad, rijstroken, dubbel tramspoor), straat 12 m (dorp 9 m); fietspaden langs alle wegen (N-wegen aan beide kanten).
- **Snelweg A1 Munkbay-doorsteek**: verhoogd door de stad van Munkbay West naar Munkbay Oost.
- **Bussen**: X10/X20 (snelbus), R31–R44 (streekbus), B60 (bergbus Viridonia–Silverpine), B1–B8 (stadsbus met busbanen), N3/N6 (nachtbus); routes, haltes en frequenties.
- **Kabelbanen in Silverpine**: Silverpine Horn-Kabelbaan, Zilvergrat-Gondelbaan, Silverpine-Stoeltjeslift.
- **Havens**: in Munkbay-Haven, Westport en Greenport (containerterminal, ferry- en cruiseterminal, scheepswerf, jachthaven). Canon: Westport is een havenstad.
- **City Rebuild 2.0**: wijkindeling van Munkbay in bouwtypes (zakencentrum met wolkenkrabbers, oude stad met herenhuizen en gevelhuizen, woonwijken, haven, campus), de 26 gebouwfamilies, straatmeubilair, het ontwerp van elke kruising weg/straat × spoor, de reizigerstunnel van Munkbay Central. Zie `docs/greenisland-analyse.md`.
- **GreenAir-kleuren**: witte romp, groene staart. **GNMI-weermodel** en de drempels van de waarschuwingen. **ViridCoin-economie**: prijzen, startkapitaal, beloningen. **Zenvo**: showroom, testterrein bij Riverside en de modellen City, Volt, Tourer, GT.

## Stand van de bouw

| Fase | Stand |
|---|---|
| 1 Fundament (eiland, provincies, terrein, streaming) | klaar |
| 2 Geografie (steden, Munkbay, gebergte, rivieren, natuur, hoofdwegen, fietspaden, snelweg door Munkbay) | klaar |
| 3 Nationaal spoor (Munkbay Central, IC1, IC2, S1, AX1, ICE) | klaar (eerste versie) |
| 4 Metro (M1–M10) en tram (T1–T15, T1s) | klaar (eerste versie): ondergrondse stations met trappen, trams op straatniveau |
| 5 Regionaal vervoer (buslijnen, busstations, busbanen) | klaar (eerste versie); geen luchthavenshuttle per bus (AX1 en M1 rijden naar de luchthaven) |
| 6 Luchthavens, havens, ferry's | havens klaar (eerste versie), GreenAir-kleuren; de schepen in de havens staan stil (de veerboten op zee varen) |
| 7 Nationale gebouwen | buitenkant en inrichting van de begane grond (GNMI, bank, paleis, universiteit, ziekenhuis, GreenAir, parlement); deuren en kamers in alle gebouwen |
| 8–10 Interactiviteit, OV-beheer, weer | OV-beheer (dienstregelingseditor, vertragingen, depot), GNMI-weer per regio met waarschuwingen, routeplanner en hoogtekaart, ViridCoin en Zenvo |
