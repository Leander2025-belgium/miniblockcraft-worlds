# miniblockcraft-worlds — Blokstad

Een blokkenbouwspel in de browser (1 blok = 1 meter) met twee soorten werelden:

- **Echte wereld**: kies een echte plek (bv. de skyline van Frankfurt) en de game haalt de echte gebouwen, straten, water, parken en bomen op bij [OpenStreetMap](https://www.openstreetmap.org). Gebouwhoogtes, kleuren en materialen komen uit de kaartdata (`height`, `building:levels`, `building:colour`, `building:material`, `building:part`, …).
- **Fantasiestad**: een verzonnen stad van **2,5 km × 25 km**.

### Nova Metropool (fantasiewereld, 25 × 30 km)

Tabblad **Fantasiestad → Nova Metropool → Spelen**. Een zelfgegenereerde wereldstad zonder randen:
een enorm centrum met supermoderne wolkenkrabbers (getrapt, taps, gedraaid, rond, slank; tot ±800 m met
verlichte kronen en spitsen), brede boulevards, een rivier met bruggen, Centraal Park met meer, stadswijken,
voorsteden, industrie, een haven met containerkranen en een cruiseterminal met cruiseschepen, en twee
luchthavens met banen, taxibanen, terminals, verkeerstoren en vliegtuigen. Stukken worden meteen gemaakt
(geen download nodig) en op je toestel bewaard. Generator: `js/metropolis.js`.

### Frankfurt am Main (vaste kaart)

Klik in **Echte wereld** op **Frankfurt am Main → Spelen**: een stad van 2,5 × 2,5 km zonder randen.
De echte gebouwen laden in tegels van 128 m rond je terwijl je loopt of vliegt, en worden op je toestel bewaard
(ook wat je bouwt). Bekende gebouwen krijgen extra details: Commerzbank Tower (hangende tuinen, atrium, antenne),
Messeturm (rood graniet, piramide), Main Tower, Westend Tower (kroon), Opernturm, Tower 185, Silberturm, Trianon,
ECB, Kaiserdom, Paulskirche, Römer, Alte Oper en vakwerkhuizen in de Altstadt. In het pauzemenu staat **Snel naar**.

### Grote kaarten (1 tot 10 km)

Kies in **Echte wereld** een plek op de kaart en een grootte van **1, 2,5, 5 of 10 km**, en klik **Grote kaart maken**.
De kaart verschijnt bij “Mijn stukken”: **Alles downloaden** haalt elk stuk op en bewaart het op je toestel
(met voortgangsbalk, pauzeren kan). Je kan meteen spelen; wat nog niet gedownload is, laadt tijdens het spelen.
Ruwe kaartdata wordt na het omzetten weggegooid om opslag te sparen.

### Echte wereld

1. Zoek een plaats, kies een snelknop (Frankfurt Skyline, Römerberg, Messeturm, …) of vul coördinaten in.
2. Kies 128, 256 of 384 m en klik **Download echte gebouwen**. Met ↑ ↓ ← → schuif je een stuk verder.
3. Geen internettoegang voor de game? Exporteer een gebied op [openstreetmap.org/export](https://www.openstreetmap.org/export) en open het `map.osm`-bestand in de game.

Gegevens © OpenStreetMap-bijdragers (ODbL).

Speel online op https://leander2025-belgium.github.io/miniblockcraft-worlds/ (GitHub Pages: Settings → Pages → branch `main`), of lokaal met `python3 -m http.server` in deze map en ga naar `http://localhost:8000/`.

## Fantasiestad: hoe werkt het?

1. **Kies een stuk stad** op de overzichtskaart (noord boven, scroll naar beneden voor de hele 25 km), of gebruik de snelknoppen of x/z-coördinaten.
2. **Kies de grootte**: 64, 128 of 256 meter in het vierkant.
3. **Download** het stuk. Het wordt opgeslagen in je browser (IndexedDB), zodat je later verder kan bouwen.
4. **Spelen**: lopen, vliegen, blokken breken en plaatsen. Je werk wordt automatisch bewaard (bij pauze en elke 30 s).
5. Met **Bestand** exporteer je een stuk als `.blokstad`-bestand; met **Bestand importeren** laad je het weer in (ook op een ander toestel).

## De stad

De stad wordt procedureel en deterministisch opgebouwd: elk stuk past dus naadloos naast de stukken ernaast.

- Centrum met torens tot ~140 m (drie stadskernen), pleinen met fonteinen
- Stadswijken met gesloten bouwblokken en binnentuinen
- Woonwijken met huizen, tuinen, hagen en geparkeerde auto's
- Industrie met hallen en schoorstenen, havens met containers en dokken
- Parken met vijvers, paden en bomen, een rivier met kades en bruggen, en strand aan beide uiteinden

## Nieuw

- **Dag en nacht** (pauzemenu of T): verlichte ramen, gloeiende lantaarns, weerspiegelend glas en water, wolken.
- **Skyline van ver**: verre gebouwen als eenvoudige blokken, tot 4 km (instelbaar).
- **Minikaart** linksonder en **grote kaart** (M): klik om erheen te vliegen.
- **Straatmeubilair** uit OpenStreetMap, **inrichting** in gebouwen, **verkeer**: auto's, trams, treinen en voetgangers.
- **Opdrachten** in het pauzemenu, **fotomodus** (P, Enter = foto opslaan).
- **Bouwwerken delen**: knop *Delen* bij een grote kaart maakt een `.blokstad-bouw`-bestand; de ander opent het met *Bestand importeren…*.

## Besturing

| Toets | Actie |
|---|---|
| W A S D | lopen |
| Spatie | springen / omhoog vliegen |
| Shift | sprinten / omlaag vliegen |
| F | vliegen aan/uit |
| Linkerklik / rechterklik | breken / plaatsen |
| Middelklik | blok oppakken |
| 1–9, muiswiel | blok kiezen |
| E | alle blokken |
| 2× Spatie / R | vliegen aan/uit / vliegsnelheid |
| T | tijd +3 uur |
| M | kaart |
| P | fotomodus |
| Esc | pauze, opslaan, terug naar kaart |

Op telefoon en tablet verschijnen een joystick en knoppen.

## Bestanden

- `js/osm.js` — echte wereld: OpenStreetMap ophalen en omzetten naar blokken
- `js/city.js` — fantasiestad-generator (wegen, wijken, gebouwen, bomen)
- `js/worker.js` — berekent kaart, voorbeeld en 3D-gebied in de achtergrond
- `js/mesher.js` — zet blokken om in 3D-vlakken (greedy meshing + ambient occlusion)
- `js/game.js` — rendering (Three.js), besturing, natuurkunde, bouwen
- `js/storage.js` — opslag in IndexedDB en import/export
- `js/textures.js`, `js/blocks.js` — blokken en hun pixeltexturen

## Andere bestanden

- `MiniBlock_City_Test_1.mcworld` — testwereld
