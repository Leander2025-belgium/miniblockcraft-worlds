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

## Ronde 2 (versie 2026-11-17a)

- **Metrostations**
  - In Greenisland:
    - een lift van het perron naar de stoep, aan het andere uiteinde dan de trap (op het liftblok springen = omhoog);
    - roltrapbanden op de trappen;
    - ticketautomaten en afvalbakken;
    - vertrekborden: E op een bord toont de volgende vertrekken met lijn, bestemming, spoor en vertraging. M opent de OV-kaart en de routekaart.
  - In Megatower City: een lift naar de middenberm, vertrekborden, afvalbakken en ticketautomaten.
- **Treinen in Megatower City**
  - Stoelen 2+2 met hoofdsteunen en tafeltjes, bagagerekken, plafondverlichting, infoschermen, toilet en tussendeuren.
  - Dubbeldekstreinen hebben dit op beide verdiepingen.
  - Meerijden kan met J.
- **Bestuurdersmodus (trein)**
  - Een cabinedashboard met een snelheidsmeter als wijzerplaat, een tractie- en remhendel, een seinlamp, het snelheidsbord en de afstand tot het stopbord ("goed gestopt").
  - V wisselt tussen 4 camera's: cabine, achter de trein, buiten langs het spoor en bij de passagiers. Bij de buitencamera's zie je de gladde buitenkant van je eigen trein.
- **Dienstregeling: spits, dal, avond, nacht**
  - Spits (7–9 u, 16–19 u): alle ritten.
  - Daluren (9–16 u en 19–22 u): de helft bij lijnen die minstens om het halfuur rijden.
  - Vroege ochtend (5–7 u): de helft bij lijnen die minstens om het halfuur rijden.
  - Avond (22–24 u): een derde.
  - Nacht (0–5 u): een kwart. Diensten met eigen uren, zoals nachtbussen, zijn uitgezonderd.
  - Treinen, vertrekborden en reisplanner gebruiken dezelfde regel.
- **Reisplanner** (OV-kaart → 🧭 Reisplanner)
  - Je kiest van, naar en het vertrekuur, voor trein, metro, tram en bus samen.
  - Overstappen te voet tussen stations en haltes binnen 700 m.
  - Per stap: lijn, perron of spoor, vertrek, aankomst en duur. Daarnaast de totale reisduur, het aantal overstappen en hoeveel meter je wandelt.
  - Navigatie: een pijl en de afstand naar het vertrekstation bovenaan het scherm.
  - In een test met 40 willekeurige reizen werd voor elke reis een verbinding gevonden.
- **Spoor in 3D** (`js/railinfra.js`, rond de speler)
  - Bovenleidingmasten met uitleggers, en de rijdraad boven elk spoor (ook in tunnels).
  - Seinpalen met seinkast en achterplaat; de lamp toont rood, geel of groen.
  - Wissels bij de kruisingssporen van enkelsporige lijnen: wisselmotor, lantaarn en wisselbord.

## Nog niet gedaan

- Wissels tussen verschillende lijnen, met bewegende tongen. Er zijn alleen wisselmotoren bij kruisingssporen.
- Een eigen bus-dashboard.
- De dienstregeling van het verkeer in Megatower City volgt spits en dal nog niet: de metro rijdt daar continu. Het vertrekbord zegt wel hoe vaak de metro in elke periode rijdt.
