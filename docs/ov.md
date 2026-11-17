# Openbaar vervoer — stand van zaken (versie 2026-11-17a)

## Fase 1 — tunnels (af)

### De oorzaken van de "massieve muren", gevonden en opgelost

1. **Diepe ondergrond (`js/underground.js`)**
   - Een stuk ondergrond dat gemaakt werd terwijl de tegel erboven nog niet geladen was, kreeg rots tot een *geschatte* bodem (maaiveld − 24 m).
   - Die rots bleef in het geheugen staan. Laadde de tegel later met een diepere tunnel, dan stond de oude rots als muur in de tunnel.
   - Nu maakt de ondergrond niets onder een niet-geladen tegel, en wordt alles onder een tegel opnieuw berekend zodra die laadt (`tileLoaded`).
   - Test: `tools/check-underground.mjs`. Vóór de reparatie bleven er 125 blokken rots in de tunnelzone staan, erna 0.
2. **Megatower City (`js/megacity.js`)**
   - Aan beide uiteinden van elk metrostation stond een volle betonmuur over de sporen.
   - Nu lopen de sporen door en heeft alleen het perron een eindwand.
3. **Enkelsporige tunnels (Greenisland, Alpen)**
   - Ze waren 5,2 m breed. Door de afronding op blokken raakte een rijtuig soms de wand.
   - Nu zijn ze 6 m breed, en de lampen hangen hoog tegen de wand, buiten het vrijprofiel.

### Validatie

- **`tools/check-tunnels.mjs [greenisland|alpen|megatower]`**
  - Loopt langs elk spoor in een tunnel en elke metrolijn.
  - Controleert het volledige 3D-vrijprofiel van een trein (3 m breed, 4 m hoog boven de spoorstaaf) in de echte gegenereerde wereld: tegels én diepe ondergrond.
  - Meldt elk geblokkeerd blok met coördinaten, blok en generator. Met `--json` worden ze weggeschreven.
  - Resultaat na de reparaties:

    | Wereld | Meetpunten | Geblokkeerd | Treden van 1 blok in de bedding |
    |---|---|---|---|
    | Greenisland | 18.319 | 0 | 68 |
    | Alpen | 7.805 | 0 | 155 |
    | Megatower City | 5.694 | 0 | 0 |

  - Een trede is een helling in blokken: één blok hoger in de spoorbedding, met vrije ruimte erboven. Dat is geen muur.
- **OV-diagnose in de game** (pauzemenu → 🛠 OV-diagnose), rond de speler in de geladen wereld:
  - geblokkeerde tunnels, rood getoond met coördinaten;
  - losgekoppelde sporen;
  - onmogelijke hellingen;
  - voertuigen buiten hun route;
  - mogelijke botsingen tussen treinen.

## Fase 2–4 — voertuigen (deels)

- **Treinen in Greenisland en de Alpen (`js/trainshell.js`)**
  - Een gladde buitenkant: gestroomlijnde neus, ruiten met stijlen, draaistellen met wielen en veren, koppelingen en balgen.
  - Kop- en sluitlichten, bestemmingsbord, spiegels, en een pantograaf op elektrische rijtuigen.
  - Containerwagens, ketelwagens en gesloten goederenwagens.
  - Schuifdeuren gaan open zodra de trein aan een perron staat, en 4 s voor vertrek weer dicht.
  - Aan boord zie je het bestaande interieur (stoelen, tafeltjes, eerste klas, restaurant, slaaprijtuig, cabine) waar je rondloopt en zit.
  - De rijtuigen stonden al op twee draaistelposities; hun richting komt daaruit.
- **Bussen (`js/vehicles.js`)**: stadsbus, gelede bus, elektrische bus, touringcar en buurtbus.
  - Bij de gelede bus volgen voor- en achterwagen elk het spoor, met een balg ertussen. Het scharnier knikt dus in de bochten.
  - Elke bus heeft ruiten met stijlen, een bestemmingsscherm, spiegels op armen, richtingaanwijzers, stoelen, een chauffeursplaats en deuren die opengaan aan de halte.
- **Trams**: deuren gaan open aan de halte.

## Nog niet gedaan

- Nieuwe metrostations met roltrappen, liften, vertrekborden en routekaart. De bestaande stations hebben perrons, trappen naar de straat, borden en banken.
- Volledige interieurs voor de verkeerstreinen in Megatower City en de echte kaarten. Die zijn (nog) niet betreedbaar; de metro wel.
- Nieuwe bestuurdersmodus met hendels en camera's. De bestaande treinbestuurder heeft al snelheid, tractie, rem, noodrem, deuren, seinen en de volgende halte.
- Spits- en daldienstregelingen, en een reisplanner voor alle vervoersvormen samen. De bestaande dienstregeling en reisplanner voor trein en metro (OV-kaart) blijven.
- Wissels en seinen als 3D-modellen, bovenleiding langs het hele spoor, en LOD voor voertuigen.
- Buschauffeur zijn met een eigen bus-dashboard. Zelf rijden met een bus kan al via het bestaande rijden.
