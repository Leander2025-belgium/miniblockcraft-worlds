# Megatower City en The Megatower (versie 2026-11-16j)

## Wat er is (gebouwd en getest)

### Megatower City (js/megacity.js)
- Een stad van 10,24 × 10,24 km, 1 blok = 1 m, alles deterministisch per tegel van 128 m.
- **Stratenplan**
  - Lanen op elke tegelgrens, met stoep, 2 × 2 rijstroken, middenberm en zebrapaden.
  - Verkeerslichten op elk kruispunt.
  - Straten door het midden van elke tegel.
  - Een laan stopt alleen op een dwarslaan; dat controleert `tools/check-megacity.mjs`.
- **Rivier** (tegelkolom 17)
  - Kades en een brug voor elke laan, met doorlopend dek en pijlers.
  - Een jachthaven met steigers en boten.
- **Metrolijn M1**
  - Loopt onder de laan op z = 5120, met 9 stations.
  - Eilandperrons en trappen naar de middenberm.
  - Het station bij de toren heeft een tussenverdieping en een roltrap naar B3.
- **Trein**
  - Spoorviaduct op 8 m hoogte, dus zonder overwegen.
  - Station **Megatower Centraal**: 4 sporen, 3 perrons en trappen.
  - Eindpunt aan de luchthaven.
- **Tram en bus**
  - Trams in de middenberm van 4 lanen, met haltes.
  - Bushaltes met bushokje.
  - Busstation Centraal.
- **Luchthaven**
  - Startbaan van 2,5 km, taxibaan en platform met gates.
  - Terminal, verkeerstoren en parking.
  - Bewegende vliegtuigen via het bestaande vliegtuigsysteem.
- **Wijken**
  - **Torens van 100 tot 600 m**: 8 vormen en 8 gevelstijlen, hotels, kantoren en woontorens, met lobby, ingang, luifel, verlichte kroon en dakinstallaties.
  - **Middelhoge bouwblokken**:
    - winkels met gekleurde luifels en etalages;
    - ramen met diepte (het glas zit 1 m naar binnen);
    - balkons, regenpijpen, dakrand, zonnepanelen en een binnentuin.
  - **Lagere wijken**:
    - rijhuizen met zadeldak, schoorsteen, dakkapel, regenpijp en voortuin met haag;
    - vrijstaande huizen.
  - **Grote gebouwen en parken**:
    - supermarkten met parking;
    - winkelcentra met glazen atrium;
    - een ziekenhuis met helikopterplatform;
    - een universiteit met koepel;
    - een stadion;
    - Centraal Park met meer en andere parken.
  - **Industrie**.
- Auto's, bussen, trams, metro's, treinen, boten en voetgangers rijden met het bestaande verkeerssysteem over deze wegen en sporen.

### The Megatower (js/megatower.js)
- **Hoogte en verdiepingen**
  - Precies 1.000 m: 250 verdiepingen van 4 m. Het dak ligt op exact 1.000 m, met het helikopterplatform op het dak.
  - 25 kelderverdiepingen tot -100 m.
- **Vorm**
  - Getrapt silhouet met 8 plaatvormen en afgeronde hoeken.
  - Terrassen op elke versmalling, met glazen deuren naar buiten.
  - Kroon met vinnen en nachtverlichting.
- **Kern**
  - Liftschachten, twee wenteltrappen van B25 tot 249, en zichtbare technische schachten.
  - Een liftlobby op elke verdieping.
- **Verdiepingsprogramma** (zoals gevraagd):

  | Verdiepingen | Functie |
  |---|---|
  | B25–B16 | Techniek: elektriciteit, pompen, ventilatie, servers, noodgeneratoren, opslagtanks, werkplaats |
  | B15–B6 | Parkeergarage (zie hieronder) |
  | B5 | Logistiek |
  | B4–B3 | Metrohal met ticketautomaten en poortjes |
  | B2–B1 | Winkelcentrum met supermarkt en roltrappen |
  | 0 | Lobby met receptie, vier ingangen met overkapping en de inrit van de garage |
  | 1 | Mezzanine |
  | 2–4 | Restaurants |
  | 5–9 | Winkels |
  | 10–29 | Kantoren, met congrescentrum op 20–22 |
  | 30–79 | Hotel (zie hieronder) |
  | 80–119 | Appartementen, waarvan 110–119 duplex |
  | 120–149 | Sky gardens (dubbele hoogte met bomen), fitness, zwembad met uitzicht, bioscoop, bibliotheek, lounges |
  | 150–199 | Luxe woningen |
  | 200–229 | Exclusieve suites, penthouses en duplexpenthouses |
  | 230–249 | Sky lounge, restaurants, stormdemper, observatieplatform op 248 (992 m), liftmachinekamer |

- **Parkeergarage (B15–B6)**
  - Rijstroken, vakken, kolommen en geparkeerde auto's.
  - Laadpalen, betaalautomaten en borden.
  - Een hellingbaan tussen alle niveaus.
- **Hotel (30–79)**
  - Receptie, restaurant en ontbijtbuffet, conferentie, zwembad, wellness, fitness, keukens, wasserij en personeel.
  - Kamers en suites met bed, nachtkastjes, bureau, stoel, tv, kleerkast en badkamer met douche, toilet, wastafel en spiegel.
  - Suites met woonkamer, kitchenette, eettafel, zetels, apart slaapgedeelte, bad en balkon.
- **Appartementen**: studio's en woningen met 1 tot 4 slaapkamers, in 4 stijlen (modern, Scandinavisch, industrieel, ultra-luxe).
- **Gecontroleerd met `tools/check-megatower.mjs`**
  - 4.347 ruimtes, allemaal bereikbaar vanaf de liftlobby.
  - 8.416 deuren, geen enkele tegen een muur of meubel.
  - 2.456 kamers en woningen, allemaal met meubels.
  - Alle liftdeuren vrij, en alle snelreisplaatsen op een vrije vloer.

### Liften (js/megaview.js)
- **11 liften in groepen met overstapverdiepingen**
  - Snelliften (18 m/s) naar 0, 30, 80, 120, 150, 200 en 230.
  - Lokale liften per zone: kantoren, hotel, wonen en sky lounge.
  - Een parkeerlift, een privélift voor de penthouses en een goederenlift (alle verdiepingen).
  - Een glazen panoramalift aan de gevel (120–149).
- **Zo werkt een rit**
  - Druk op de liftknop. De cabine komt, de schuifdeuren gaan open en je stapt in.
  - Een verdiepingsmenu verschijnt. Na je keuze gaan de deuren dicht en rijd je mee, met optrekken en afremmen.
  - Bij aankomst gaan de deuren open.
- **Veiligheid**: gesloten liftdeuren en de cabinevloer zijn vast, zodat je niet in de schacht valt. Tijdens de rit sta je vast in de cabine.

### Interactie (js/interact.js), in alle werelden
- E (als je naar iets bedienbaars kijkt; anders opent E zoals vroeger de inventaris) of de ✋-knop op een telefoon.
- Wat je kan bedienen:
  - deuren openen en sluiten, met een zichtbaar deurblad;
  - lichtschakelaars (alle lampen van de ruimte) en lampen;
  - tv aan en uit;
  - zitten op stoelen, zetels en toiletten, en liggen in bed;
  - slagbomen openen via de betaalautomaat;
  - ticketautomaat, laadpaal en borden (met verdieping en liften);
  - liftknoppen.
- De toestand van deuren, lampen en tv's zit in de blokken en wordt bewaard zoals elk bouwwerk.

### Engine
- **Verticale streaming**
  - Torens met interieur worden in secties van 32 m opgebouwd.
  - Alleen de verdiepingen rond de speler worden volledig getoond; de rest is een lichte gevelschil met verlichte kamers achter het glas.
  - Secties die je verlaat worden na 4 s uit het geheugen gehaald.
- **Binnenlicht**: warm kunstlicht in de toren in plaats van zonlicht.
- **Grafische profielen**: Laag, Gemiddeld, Hoog en Ultra. Ultra gebruikt schaduwen van 4096.
- **Kamernaam**: op de HUD zie je verdieping en kamer, en bij binnenkomst van een kamer of woning verschijnt de naam.

## Wat (nog) niet gedaan is
- **Graphics**: geen nieuwe hemel of wolken, geen nieuwe bomen of voertuigmodellen, geen volumetrische mist en geen nieuwe waterweergave. Wel: binnenlicht, verlichte kamers 's nachts en het profiel Ultra.
- **Bestaande werelden**: geen aparte herziening van Nova Metropool, Greenisland, de Alpen of de echte kaarten. Hun eerdere controles slagen nog steeds.
- **Torens in de stad**: boven de lobby zijn ze niet te betreden; daar zitten verlichte kamers achter het glas. Alleen The Megatower is volledig ingericht.
- **Lichtschakelaars**: die zetten de lampen aan en uit, maar het licht in de kamer wordt niet echt donkerder.
- **Instanced rendering en verdiepingen per functietype**:
  - Meubels zijn blokken, gegroepeerd per chunk, niet geïnstanced.
  - Verdiepingen van hetzelfde type delen een plan, met variatie in stijl, spiegeling en mix van woningen.
- **Prestaties**:
  - Gemeten in een softwarebrowser (zonder grafische kaart); echte cijfers op een telefoon zijn niet gemeten.
  - Rond de toren staan op een straat in het centrum honderdduizenden tot een paar miljoen driehoeken in beeld. Op een oudere telefoon is profiel Laag nodig.
