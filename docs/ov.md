# Openbaar vervoer — stand van zaken (versie 2026-11-18b, Blokstad 13.0)

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

## Blokstad 12 (versie 2026-11-17b)

### Dienstregeling ook op het wegen- en sporennet (`js/service.js`, `js/traffic.js`)
- Megatower City, Nova Metropool en de steden volgen nu dezelfde periodes als de treinen: spits (7–9 u, 16–19 u), daluren (5–7 u, 9–16 u, 19–22 u), avond (22–24 u) en nacht (0–5 u). Het uur is het speluur.
- Per periode rijden minder voertuigen. Spits = alles. Daluren: 60 % van metro, tram en bus, 75 % van de auto's. Avond: ongeveer 40 %. Nacht: 25 % (auto's 20 %).
- **Interval**: een nieuwe metro, tram of bus komt in dienst om de 2 / 4 / 6 / 10 min (metro: spits / dal / avond / nacht).
- **Uit dienst**: overtollige voertuigen gaan buiten zicht of aan een halte uit dienst, nooit midden op straat voor je ogen.
- **Haltetijd**: per periode anders (metro: 24 s in de spits, 14 s 's nachts). De deuren gaan open na het stoppen en sluiten 1,5 s voor vertrek.
- Het vertrekbord in de metrostations van Megatower City toont het echte interval, de haltetijd en hoeveel metro's in de buurt in dienst zijn.

### Bus zelf besturen (`js/drive.js`)
- Dashboard met:
  - snelheidsmeter;
  - stuur dat meedraait;
  - gas- en rempedaal;
  - richtingaanwijzers (Z/C) en alarmlichten (X);
  - deuren (Q, alleen stilstaand; met open deuren geeft de bus geen gas);
  - omroep (N);
  - het verkeerslicht vóór je met zijn echte kleur en afstand;
  - de volgende bushalte met afstand.
- **Rood licht**: rijd je door rood, dan krijg je een melding en telt het dashboard het.
- **Deuren**: de deurpanelen van je bus zijn echt open of dicht in beeld.
- **Gelede bus**: de achterwagen hangt aan een scharnier en knikt in bochten (max. 50°). Het dashboard toont de knikhoek.
- **Rijgedrag**: elk bustype heeft zijn eigen eigenschappen. Vroeger reden de nieuwe bustypes als een gewone auto (fout hersteld).
- **Telefoon en tablet**: knoppen voor richtingaanwijzers, deuren en omroep.
- **Nieuwe bustypes**: dubbeldekker (bovenverdieping met stoelen, trap, panoramaruit) en streekbus (bagagerekjes).

### Treinen
- **Draaistellen**: ze zijn aparte onderdelen en draaien in bochten mee met het spoor. In de Alpen is dat tot ongeveer 1°, wat klopt voor een rijtuig van 26 m in een ruime bocht.
- **Treingeluid** (`js/sound.js`, zonder geluidsbestanden):
  - tractiemotor die hoger gaat met de snelheid;
  - rolgeluid;
  - railvoegen (dubbele tik om de 25 m);
  - piepende remmen bij lage snelheid;
  - sissende lucht bij het stilstaan.
  - Je hoort het als bestuurder en als passagier, in treinen, metro's en trams.
- **Wissels bij kruisingssporen**: de wisseltongen schuiven om naar de kant van de trein die eraan komt.

### Tunnels: gecontroleerd op het echte voertuigprofiel
- **Nieuwe controle**: de tunnelcontrole gebruikte een profiel van 3 m breed en 4 m hoog. De treinen zijn echter 4,06 m breed, met een dak op 5,5 m en een stroomafnemer tot 6,85 m.
- **Gevonden met het echte profiel**: 1.784 raakpunten in Greenisland en 721 in de Alpen.
  - De dubbelsporige tunnel was 10 blokken breed: na afronding stond een wand soms 2,0 m van het spoor, terwijl de bak 2,03 m breed is aan elke kant.
  - Het plafond lag 6 m boven de spoorstaaf en verspringt op hellingen een blok.
  - De lampen hingen in de bovenhoek van het profiel.
  - De diepe ondergrond had een enkelsporige tunnel van maar 4 m hoog.
- **Opgelost met één tunnelprofiel** (`js/carve.js`: `boreBlock`/`boreColumn`), voor de tegels én de diepe ondergrond zodat alles naadloos aansluit:
  - 1 m breder per kant, met een verhoogd dienstpad;
  - 8 m vrije hoogte;
  - een kabelgoot langs de wand;
  - lampen hoog tegen de wand, buiten het profiel.
  - Ook de metrotunnels tussen de stations gebruiken dit profiel.
- **Kruisingen**:
  - Een tunnel onder een ander spoor wordt nu tot zijn buitenwand uitgegraven. Bij Munkbay stond eerst een halve tunnelwand van rots.
  - Ligt er een metro vlak boven een tunnel, dan rust de metro op zijn bedding en hangt er geen extra betonplaat in de tunnel eronder.
- **Bovenleiding**: de rijdraad hangt nu op de hoogte van de stroomafnemer (6,85 m boven de spoorstaaf), niet meer 0,85 m lager. In de tunnels blijft hij onder het plafond.
- **Resultaat** (`tools/check-tunnels.mjs`, volledige controle):

  | Wereld | Meetpunten | Geblokkeerd |
  |---|---|---|
  | Greenisland | 137.297 | 0 |
  | Alpen | 58.520 | 0 |
  | Megatower City (profiel van de metro daar) | 1.424 | 0 |

  - Greenisland en de Alpen staan nu ook in `tests/run-all.mjs`.
  - Bij een tunnelkruising (ICEA/ICEF met metro M6, bij 131300,27500 en 134000,25600) ligt het plafond op een paar plekken 6–7 m boven de spoorstaaf. Het dak van de trein past, alleen de stroomafnemer zou raken. De controle meldt dat apart als "laag plafond". Oplossen kan alleen door de lijnen zelf te verleggen.
- De kaartversies zijn verhoogd (Greenisland 6, Alpen 10). Tegels worden opnieuw gemaakt; je eigen bouwwerk blijft bewaard.

### FPS-meter
- In de instellingen of met F3. Hij toont beelden per seconde, het traagste frame, tekenopdrachten, driehoeken, geheugen (waar de browser het geeft), resolutie, laadtijd en wachtrij.

## Blokstad 12.1 (versie 2026-11-18a)

### Wissels tussen lijnen (`js/crossover.js`)
- **Overloopwissels**: waar twee dubbelsporige lijnen minstens 420 m naast elkaar liggen (8–22 m uit elkaar, op dezelfde hoogte, boven de grond en minstens 120 m van een perron), ligt nu een echt verbindingsspoor in een S-bocht, één per rijrichting.
- **In Greenisland**: 2 stuks, IC1 ↔ S1 (sinds Blokstad 13; daarvoor ook 2 tussen IC2 en S1). De betere scheiding bij de tunnelkruisingen veranderde het hoogteprofiel. IC2 en S1 liggen daar nu niet meer overal op dezelfde hoogte, dus de verbinding valt weg.
- **In de Alpen**: geen. Daar liggen de evenwijdige stukken in Reuzenberg Hauptbahnhof, en dat gebied blijft onveranderd.
- **In de wereld**: het verbindingsspoor heeft ballast en vrije ruimte erboven, rails en dwarsliggers (via de spoorpaden), wisselmotoren, lantaarns, wisselborden en wisseltongen die omschuiven.
- **Zelf rijden**:
  - A/D (of ◀ ▶ op de telefoon) zet de volgende wissel binnen 3 km om. Het dashboard toont de wissel en de afstand.
  - De trein rijdt over het verbindingsspoor naar de andere lijn, ook in omgekeerde richting.
  - De rijtuigen erachter volgen het spoor over de wissel. In de test bleef de koppelafstand maximaal 0,75 m, dus er ontstonden geen gaten.
  - Op de wissel geldt 40 km/h; de automatische remming grijpt in als je te hard rijdt.
- **Beperking**: de treinen van de dienstregeling gebruiken de wissels niet; elke dienst rijdt op zijn eigen lijn.

### Tunnels: gewelf en ventilatieschachten (`js/carve.js`)
- **Gewelf**: de tunnels hebben een afgeronde bovenkant (halve ellips boven 4 m). Het voertuigprofiel blijft overal vrij volgens de controle.
- **Lampen** hangen nu tegen de wand op 4 m.
- **Ventilatieschachten** om de 600 m:
  - een schacht van 3 × 2 m naast het dienstpad tot aan de oppervlakte, met een rooster en een betonnen kraag;
  - alleen onder natuurlijk terrein, niet onder straten of gebouwen;
  - in Greenisland: 46 schachten.
- **Beperking**: in de Alpen liggen de tunnels onder de bodem van de tegels (diepe ondergrond). Daar zijn nog geen schachten.

### Stations 3.0 (`js/stationhall.js`, `js/greenisland.js`)
- **Alpen**: elk stationsgebouw (chaletstijl) heeft nu een ingerichte hal:
  - wachtruimte achter een glazen wand met banken en een vertrekbord;
  - loketten en ticketautomaten;
  - kiosk met rekken en toonbank;
  - café met tafels, stoelen, toog en koffiemachine;
  - twee toiletten met wastafel;
  - plafondverlichting en een tweede deur aan de andere kant.
  - De vertrekborden tonen echte vertrektijden (E).
- **Greenisland** (moderne stijl): elk perron (behalve Munkbay Central, dat al een grote hal heeft) krijgt:
  - een glazen wachtruimte met banken en een vertrekbord;
  - een kiosk;
  - ticketautomaten.
  - De bestaande vertrekpalen zijn nu ook leesbaar (E).
- **Bereikbaarheid**: alle stations zijn te voet bereikbaar, zoals voorheen (perrons, pleinen, trappen; Munkbay Central met een reizigerstunnel).

### Voertuigen
- **Verlichte ramen**: de passagiersramen van treinen, metro's, trams en bussen zijn overdag donker getint glas en 's avonds warm verlicht (binnenverlichting).
- **Bestemmingsborden** met tekst op de treinen en trams van Greenisland en de Alpen: lijn en eindbestemming, bijvoorbeeld "S1 Hemelpoort".

### Megatower City: reisplanner (`js/megaplan.js`)
- Pauzemenu → 🧭 Reisplanner. Je kiest van (je positie of een plek), naar en vertrekuur.
- **Wat hij combineert**: wandelen, metro M1 (9 stations, met halte Megatower onder de toren en halte Luchthaven) en de trein van Megatower Centraal naar de Luchthaven.
- **Dienstregeling**: intervallen en haltetijden volgens de periode (`js/service.js`). Metro: 2 / 4 / 6 / 10 min in spits / dal / avond / nacht. Trein: 10 / 15 / 20 / 30 min.
- **Resultaat**: vertrek, aankomst, lijn, richting, perron, aantal haltes, reistijd, overstappen en wandelafstand.
- **Navigatie**: een pijl naar de eerste halte. Sta je er al, dan zegt hij welke metro je neemt en wanneer die vertrekt.
- **Beperking**: de planner rekent met de intervallen, niet met de afzonderlijke metrostellen van het verkeer rond de speler.

### Telefoon en tablet (`tests/browser/mobiel.cjs`)
- Getest met emulatie van een Pixel 7, een iPhone 13 en een iPad Mini: aanraakscherm, schermgrootte en tikken.
  - Alle knoppen zijn minstens 40 px groot en liggen binnen het scherm.
  - De pagina scrollt niet opzij.
  - Het menu opent met een tik, net als de reisplanner, en past op het scherm.
  - De minikaart is zichtbaar.
  - De laadtijd van Megatower City was 8–10 s.
- **Grenzen van deze test**: het is geen echte telefoon. De testbrowser rekent zonder grafische kaart (12 FPS hier), dus over de snelheid op een echt toestel zegt dit niets.

## Blokstad 13.0 (versie 2026-11-18b)

Zie ook `docs/audit-13.md` (technische audit van de hele game).

### Tunnels: geen lage plafonds meer
- **Kruising onder een scherpe hoek**: de scheiding van 10,5 m tussen twee kruisende lijnen werd alleen op het kruispunt zelf vastgelegd. Bij ICEA × M6 lag M6 36 m verder nog maar 8,5 m boven ICEA. Nu geldt de scheiding over het hele stuk waar de tunnels elkaar zijdelings raken (`js/green-net.js`).
- **Talud boven een tunnel**: het talud van IC1 (3 blokken steen onder het spoor) kwam in het plafond van de ICEF-tunnel eronder. Nu blijft de tunnel eronder vrij en blijft alleen het brugdek over.
- **Strengere controle**: de tunnelcontrole faalt nu ook als alleen de stroomafnemer zou raken. Resultaat:

  | Wereld | Geblokkeerd | Laag plafond |
  |---|---|---|
  | Greenisland | 0 | 0 |
  | Alpen | 0 | 0 |
  | Megatower City | 0 | 0 |

### Treinsimulatie (`js/rail.js`: `trainPhysics`, `adhesion`)
- **Per trein**: massa, lengte, tractiekracht en vermogen volgen uit de echte rijtuigen. Locomotieven en motorwagens trekken, rijtuigen niet.
- **Kleefkracht en wielslip**: kleefkracht 0,30 bij droog weer, 0,20 bij regen, 0,17 bij onweer en 0,12 bij sneeuw. Vraag je meer tractie dan de wielen kunnen overbrengen, dan slippen ze (melding op het dashboard) en trekt de trein minder. Met Z strooi je zand: 8 s betere kleefkracht.
- **Remmen**: begrensd door de kleefkracht (bedrijfsrem tot 1,15 m/s², noodrem tot 1,5 m/s²). Het dashboard toont de remweg bij de huidige snelheid.
- **Weerstand**: rol- en luchtweerstand (een ICE is gestroomlijnd) en helling.
- **Klikbare cabine**: de tractie- en remhendel kun je met muis of vinger slepen, met knoppen voor noodrem, zand en deuren.
- **Gemeten** (`tests/browser/treinsim.cjs`, S-Bahn van 160 t, 79 m, elke meting op dezelfde plek, licht bergop):

  | | 0 → 60 km/h | Remweg vanaf 60 km/h (berekend) | Wielslip |
  |---|---|---|---|
  | Droog | 27,0 s | 120 m (121 m) | nee |
  | Sneeuw | 29,2 s | 130 m (131 m) | ja (met zand niet) |

  Op een vlak stuk: 13,8 s tot 60 km/h.

### Reizigers op de perrons (`js/passengers.js`)
- **Wachten**: per stationskant 12 reizigers in de spits, 7 in de daluren, 4 's avonds en 1 's nachts. Ze kijken naar het spoor en schuifelen af en toe een stukje op.
- **Instappen**: staat er een trein met open deuren, dan lopen ze eerst naar de perronrand en dan erlangs naar de dichtste deur.
- **Uitstappen**: bij het openen van de deuren stappen er reizigers uit en die lopen naar de uitgang.
- **Nooit in een muur**: de perronrand wordt afgetast in de echte blokken (vaste vloer, lucht voor voeten en hoofd). Komt er een bank of paal in de weg, dan stappen ze opzij.
- **Getest** (`tests/browser/reizigers.cjs`):
  - Alpen en Greenisland: wachten, instappen en uitstappen werken.
  - Bij elke controle: 0 reizigers in een muur of zwevend (honderden posities gecontroleerd).
- **Beperking**: alleen in de spoorwerelden (Greenisland, Alpen), alleen op de perrons, niet in de stationshallen of aan bushaltes.

### Geluid
- **Omgevingsgeluid** (`js/ambient.js`, instelbaar):
  - verkeersgeruis in de stad, luider met meer voertuigen;
  - wind die aanzwelt, sterker hoog in de bergen en bij onweer;
  - regen;
  - een lage galm ondergronds.
- **Stationsomroep**: staat er een trein klaar aan het perron waar je staat, dan hoor je een omroep, bijvoorbeeld "Gletsjerdal. S1 naar Hemelpoort staat klaar."

## Nog niet gedaan

Van de opdracht Blokstad 13.0 is in deze ronde niet gebouwd:
- **Treinen**: nieuwe treinmodellen (historisch, slaaptrein-buitenkant, bergtrein in een eigen stijl), LOD voor de buitenkant van treinen en bewegende stroomafnemers.
- **Wissels in de dienstregeling**: de treinen van de dienstregeling gebruiken de overloopwissels niet. In de Alpen zijn er geen wissels tussen lijnen.
- **Metro**: metro 4.0 (depots, keersporen, eigen seinbeveiliging) en metrostations met meerdere niveaus en tourniquets.
- **Bus en tram**: bus 4.0 en tram 4.0 (nieuwe modellen, routebegeleiding, tramdepots).
- **Reisplanner**: één reisplanner voor alle werelden samen met echte ritten van het verkeer.
- **Stations**: stations 4.0 (grote hallen met verdiepingen), een betreedbaar centraal station in Megatower City.
- **Tunnels**: nooduitgangen en tunnelbewegwijzering.
- **Werelden**: nieuwe stadsarchitectuur, meer betreedbare gebouwen, Megatower City 2.0 en het herstellen van wereldgeneratiefouten. Er is geen nieuwe controle gedaan: de bestaande controles op zwevende huizen, naden en wegen slagen.
- **Graphics**: graphics 4.0 (PBR-materialen, reflecties, wind).
- **Voetgangers**: buiten de perrons (bushaltes, stationshallen).
- **Interface**: een nieuw hoofdmenu met wereldpreviews en toetsenbordinstellingen.
- **Prestaties**: niet gemeten op echte toestellen. De tests draaien zonder grafische kaart.
