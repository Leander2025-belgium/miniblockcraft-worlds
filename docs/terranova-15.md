# TERRANOVA 15 — rapport (ontwikkelversie 2026-11-24a)

Branch `terranova-15`, vertrokken van main `223036a` (TERRANOVA 14.2). Alles hieronder is gebouwd, getest en gemeten in
deze omgeving: een Linux-container zonder grafische kaart (Chromium met SwiftShader, software-rendering). Wat daar niet
kon (echte GPU's, echte telefoons), staat er eerlijk bij.

**Naam van de release.** De acceptatiecriteria zijn niet allemaal gehaald (zie "Niet gedaan" en de samenvattende tabel).
Daarom heet deze versie in het spel **TERRANOVA 15.0 (ontwikkelversie)** en niet "TERRANOVA 15.0".

## Fase 0 — audit en vertrekpunt

- Laatste stand: main `223036a` (merge van PR #3, 14.2). De opdracht noemde `42a192a` (14.0); 14.1 en 14.2 zaten er al
  in (reizigers die vanzelf verschijnen, live OV-kaart, multimodale planner, remises, vaste buslijnen…). Daarop is verder
  gebouwd in plaats van het opnieuw te doen.
- Regressie van 14.2 (de dag ervoor): alle controles zonder browser en 35 browsertests groen.
- Voor-meting met `tests/browser/bench.cjs` op een ongewijzigde kopie van 14.2 (`docs/bench15/voor-14.2-onder-belasting.json`).
  Die liep terwijl andere tests draaiden: de frametijden zijn daardoor niet bruikbaar, de tekenopdrachten en driehoeken
  wel. De vergelijkbare voor/na-meting staat onder Fase 9.
- Savegames: de opslagsleutels (`blokstad`, `blokstad-settings`, …) en het bestandsformaat zijn niet veranderd. Nieuwe
  gegevens gebruiken nieuwe sleutels (`terranova-career`, `terranova-build-fav`, `terranova-build-recent`).

## 1. Living world — reizigers en levende stations

| Wat | Hoe | Gemeten |
|---|---|---|
| Hele reizen van deur tot deur | `js/journeys.js` + `js/travelers.js`: vertrek aan een echte deur (of gevel), de planner kiest ritten en overstappen, wachten op de juiste lijn én richting, instappen bij open deuren, uitstappen aan de juiste halte (naam én plek), overstappen, lopen naar de deur van de bestemming. 40 % komt van ver en loopt hier een gebouw binnen. | `reizen.cjs`: 65 reizen, 97 ritten, 32 overstappen, 0 keer in een verkeerde lijn, 0 niet-beloopbare punten |
| Simulatie op afstand | Buiten beeld gaat de reis verder met de tijden van de planner; wie aan boord was, blijft in de bezetting van de rit (`js/ovtrips.js remoteOn/remoteOff`) tot hij op afstand uitstapt. Komt hij weer bij de speler, dan wordt hij zichtbaar aan de uitstaphalte. | bezetting per rit = aantal reizigers op afstand (gecontroleerd) |
| Levende stations | Zitten op banken (perrons, pleinen), een ticket kopen aan de automaat vóór metro en trein, liften in de padzoeker (trapvrij naar het perron), meer drukte bij grote stations en in de spits, weinig 's nachts, luchthavenreizigers met koffers bij de luchthaven, nachtreizigers. | 66 keer gezeten, 10 tickets in één test |
| Reizigerstypes | pendelaar, student, toerist, zakenreiziger (nieuw), gezin met kinderen (nieuw, telt als 3 in de bezetting), luchthavenreiziger, beperkte mobiliteit (alleen trapvrij: lift), nachtreiziger | `reizigers-auto.cjs` |
| Bezoekers in de Megatower | Op openbare verdiepingen (lobby, winkels, sky gardens, observatie…) lopen mensen rond over de echte vloer, alleen op de verdieping van de speler. | `torenbezoekers.cjs`: 14 in de lobby, 9 in de sky gardens, niemand op een andere verdieping |
| Prestaties | De planner is ±10× sneller (vaste graaf per periode + heap: 8 ms i.p.v. 50–100 ms) en draait voor reizigers in een eigen Web Worker (`js/planworker.js`); A* heeft een tijdsbudget per frame. | p95 van de reizigerslogica: 9,1 ms per tik (SwiftShader-container) |

Niet gedaan: reizigers die vanzelf hele reizen maken in Greenisland en de Alpen (daar blijven de perronreizigers van
`js/passengers.js`); de planner met overstappen bestaat alleen voor Megatower City.

## 2. Voertuigen

Na een audit bleek het meeste uit de opdracht al te bestaan (14.0–14.2): S-Bahn, metro, Airport Express, regionale
motorwagen, ICE (hogesnelheid), dubbeldekker, tandradtreinen, historische stoomtrein, goederenwagens en diesellocomotief;
draaistellen, werkende pantografen, koppelingen, balgen, bestemmingsschermen met tekst, front- en sluitlichten,
schuifdeuren; stads-, elektrische, gelede, streek-, dubbeldek- en buurtbussen en touringcars; trams en metro's in twee
generaties met infoschermen ("volgende halte" als echte tekst); voertuig-LOD zonder interieur vanaf ±70 m; alle zes
cameramodi (cabine, zittend, staand, rondlopen, raam, buiten).

Nieuw in 15:
- **Chauffeursplaats van de bus** (`js/vehicles.js busCab`): stoel met hoofdsteun, dashboard met instrumenten,
  boordcomputer, stuur op een kolom, pedalen, ticketprinter, deurknoppen, zonneklep, cabinedeurtje; de cabinecamera zit
  nu op de chauffeursstoel. Voor/na: `docs/terranova-15-buscabine-voor.png`, `-na.png`.
- **Rook van de stoomlocomotief** (`js/smoke.js`): wolkjes in het ritme van de drijfwielen. `stoomrook.cjs`,
  `docs/terranova-15-stoomrook.png`.
- **Koplampbundels** op het wegdek 's nachts (één tekenopdracht voor alle voertuigen).

Niet gedaan: volledig nieuwe 3D-modellen voor elke treinsoort (de bestaande zijn behouden); de paarse plafondfout van M1
komt niet terug (gecontroleerd door `metro-interieur.cjs` en `voertuig-interieurs.cjs` in de regressie).

## 3. Megatower City 2.0

- **Wijken met een eigen karakter** (`js/megacity.js QUARTER`): historisch centrum rond metro Oude Markt (smalle huizen
  van 6 m met trap-, klok- en lijstgevels, witte lateien, winkels met luifels), winkelkwartier (autovrij plein met
  winkels, terrassen met parasols, banken, fontein), villawijk (moderne villa's met tuin, terras, zwembad, oprit),
  havenpakhuizen langs de rivier (laaddeuren, hijsbalken, kratten, bolders). Zakencentrum, universiteit, industrie,
  station en luchthaven bestonden al.
- **Straatmeubilair** langs de lanen: banken, bloembakken, verlichte reclamezuilen, verkeersborden voor elk kruispunt,
  rood fietspad buiten het centrum (bomen, lantaarns, bushokjes, zebrapaden en verkeerslichten waren er al).
- **Megatower**: lobby, hotel, suites, winkels, restaurants, sky gardens en observatie bestonden al; nieuw zijn de
  bewegende bezoekers. 250 verdiepingen en 25 kelderniveaus zijn behouden (`megatower.cjs`).
- **Wereldkwaliteit**: `tools/check-megacity.mjs` kijkt nu ook naar zwevende blokken in de nieuwe wijken (0), naast
  gaten (0), doodlopende lanen, bruggen en sporen. De wereldversie gaat van 5 naar 6 (verre gebouwen opnieuw berekend).
- Screenshots (zelfde camera, 14.2 en 15): `docs/terranova-15-wijk-*.jpg` (zie Fase 9).

Let op: wie in Megatower City al gebouwd heeft, houdt zijn eigen bewerkte stukken zoals ze waren (zo werkt het opslaan
van bewerkte tegels al sinds het begin); daar komen de nieuwe wijken niet in.

## 4. Depots

- **Treinremises Greenisland** (4 bestaande): nu met werkplaats achterin de hal (inspectieputten tussen de rails,
  rolbrug boven het vrije profiel, werkbanken en rekken), een wasstraat met borstels over opstelspoor 1 en dwergseinen
  aan de keel. Een locloods en bovenleiding in de remise zijn **niet** gebouwd.
- **Metroremises** (8 tunnelhallen uit 14.2) ongewijzigd.
- **Fout hersteld (al in 14.1):** de remiseplanning hield geen rekening met vertraagde treinen; op dagen waarop de
  (per dag gelote) vertragingen ongelukkig vielen, botste een uitrukrit met een vertraagde trein. Nu 0 conflicten over 7
  opeenvolgende dagen (`check-depots.mjs`).
- **Busremise Oostkade** (nieuw, Megatower City, aan B11 en B31): stallingen met laadpalen, werkplaats met putten,
  wasstraat, chauffeursgebouw, poortgebouw, hekken met in- en uitritten. Bussen staan er volgens de dienstregeling: 2 in
  de spits, 9 's nachts (plus 6 reserve). Bij het begin van de spits rijden ze van hun plaats door de poort naar de
  rijstrook en gaan daar in dienst als echte lijnbus met rit; 's avonds rijden lijnbussen bij de poort de remise in.
  `busremise.cjs`: 7 uitgerukt (allemaal met lijn en rit), 3 ingerukt, nooit twee op één plaats.
  `docs/terranova-15-busremise-nacht.png`.
- Eerlijk: de overgang van de remiserit naar de lijnbus gebeurt aan de poort (de lijnbus begint op de dichtste plek van
  de rijstrook); bussen buiten Megatower City (Nova, OSM-steden) hebben geen remise.

## 5. OV-planner en routebegeleiding

- Planner (Megatower City): metro, trein, tram, bus, wandelen en overstappen, met vertrekpunt, bestemming, vertrek- en
  aankomsttijd, reistijd, wandelafstand, lijnen, richting, perron, **wachttijd per rit en totaal** (nieuw). Vertraging:
  eerlijk vermeld als "niet gemeten" (de voertuigen rond de speler volgen de dienstregeling niet op de minuut; er wordt
  niets verzonnen).
- Live OV-kaart: per voertuig nu ook **snelheid** en de vertraging (of "niet gemeten").
- **Routebegeleiding** (`js/routeguide.js`, knop "🧭 Begeleid mij"): loop naar de halte → wacht op lijn X richting Y
  (vertrek volgens de dienstregeling) → verkeerde lijn? waarschuwing → rij mee (volgende halte, stap hier uit) → stap
  over → wandel naar de bestemming → aangekomen. Elders uitgestapt: automatisch een nieuwe route vanaf daar.
  `routebegeleiding.cjs` (instappen nagebootst; het echte instappen testen andere tests).
- Niet gedaan: één planner voor alle werelden (Greenisland en de Alpen houden hun eigen treinplanner).

## 6. Carrièremodus

- `js/career.js`, knop **📋 Carrière** in het pauzemenu. Vrijwillig: zonder dienst of opdracht blijft alles sandbox.
- **Diensten** als trein-, bus-, metro- of trambestuurder, beoordeeld op gemeten gegevens: stiptheid t.o.v. de
  dienstregeling (trein), stopplaats, automatische remming (sein op rood of te snel), noodrem, snelheid, rode lichten,
  deuren buiten een halte, comfort (versnelling), bediende haltes. Score /100, sterren, XP.
- **Bouwopdrachten** (woning, bushalte, park, appartement, stadsplein, station), gecontroleerd op de blokken die de
  speler zelf plaatste: een woning moet een dichte ruimte van ≥ 12 m² zijn met deur, ≥ 2 ramen en een dak; een
  appartement heeft bed, tafel, stoel en lamp in die ruimte; enz.
- 10 levels, vrijgespeelde opdrachten, prestaties, geschiedenis, opgeslagen (`terranova-career`).
- `carriere.cjs`: lege plek telt niet, woning en appartement wel (pas vanaf level 2), straf voor rood/deuren/te snel
  (bus) en noodrem/+4 min (trein), voortgang blijft na herladen. De diensten zijn daar getest met een nagebootste
  bestuurderstoestand; ze lezen dezelfde velden die de echte besturing bijhoudt.

## 7. Bouwmodus

- Bestond al: ongedaan maken/opnieuw, selecteren, vullen, muren, leegmaken, kopiëren, draaien, plakken, blauwdrukken.
- Nieuw: vloer (F), kamer met vloer en plafond (U), rechte lijn (I), spiegelen (M/Shift+M), selectiegrootte en draaihoek
  in de balk, **doorzichtige voorvertoning** van het plakken met **botsingscontrole** (rood = overschrijft een bestaand
  blok → eerst bevestigen; niet op de speler), **grote bewerkingen in stukjes** (±8 ms per frame, chunks via de
  bouwwachtrij) met ongedaan maken als één stap, **bouwbibliotheek** met 12 categorieën, zoeken, favorieten en recent.
- Fout opgelost: in lage tegels van Megatower City kon je niet hoger bouwen dan de tegel hoog was (±24 m boven de
  straat); de tegel groeit nu mee (tot 400 blokken) en wordt zo bewaard.
- `bouwmodus.cjs`: vloer 80/80, kamer 144/144 met lege binnenkant, lijn 10/10, spiegelen en draaien juist, botsing eerst
  geweigerd, 72 000 blokken in 14 frames met hoogstens 15 ms per frame, ongedaan maken herstelt alles.

## 8. Prestaties, stabiliteit en crashherstel

- **Veilig opslaan** (`js/storage.js`): controlegetal en lengte bij elke opslag, de vorige versie blijft bewaard (in
  dezelfde transactie), bij het laden gecontroleerd; beschadigd = automatisch de vorige versie terug en de beschadigde
  kopie apart; een beschadigde opslag overschrijft nooit een goede. Ook voor bewerkte tegels. Knop "↶ Vorige versie".
  De bestaande `.terranova-backup` en het automatisch hervatten na een crash blijven. `crashherstel.cjs`.
- Optimalisaties: planner ±10× sneller en in een worker, A* met tijdsbudget, grote bouwacties gespreid, busremise en
  reizigers kosten niets ver van de speler, koplampen en rook elk één tekenopdracht.
- Lange sessie: `duurtest.cjs` (zie Fase 9).
- Mobiel: alleen in emulatie getest (`mobiel.cjs`, telefoonformaat met aanraakbediening). Geen echte iPhone, Android,
  iPad, Mac of Windows beschikbaar in deze omgeving; de prestatietest in het spel (📊) kan daar gedraaid worden.

## Fase 9 — regressie, metingen, screenshots

Alles in een Linux-container zonder grafische kaart (Chromium + SwiftShader). Frametijden zijn daardoor 10–100× trager
dan op een echt toestel en zeggen niets over de echte FPS; vergelijk alleen 14.2 met 15 onderling.

### Regressie

- Controles zonder browser (`node tests/run-all.mjs`): **alle geslaagd**.
- Browsertests: 43 tests in één ronde (`regr15.sh`), terwijl de machine ook nog andere metingen deed: 39 groen, 4 rood.
  Opnieuw één voor één in rustige omstandigheden:
  - `reizen` en `prestatietest`: groen (eerder alleen te traag onder belasting).
  - `reizigers-auto`: rood door de test zelf (een gezin telt als 3 in de bezetting, de test verwachtte +1). Test en
    reizigerslog aangepast (groepsgrootte in het logboek) → groen.
  - `ovkaart`: af en toe rood door een **echte fout**: een bus die net uit dienst ging terwijl je hem op de kaart
    aangeklikt had, bleef zijn oude rit en bezetting tonen. Opgelost: de kaart zegt nu "niet meer in beeld: uit dienst
    genomen of buiten beeld gereden" → groen.
- Daarmee is elke browsertest minstens één keer groen gelopen op de laatste code, maar **niet alle 43 in één en dezelfde
  ronde na de laatste twee correcties** (enkel de twee betrokken tests zijn opnieuw gedraaid).

### Prestaties: 14.2 tegen 15 (zelfde scènes, na elkaar, rustige machine)

`tests/browser/bench.cjs` → `docs/bench15/voor-14.2.json` en `docs/bench15/na-15.json`.

| Scène | tekenopdrachten 14.2 → 15 | driehoeken (k) | heap (MB) | mediaan frame (ms, SwiftShader) |
|---|---|---|---|---|
| mega-dag | 805 → 784 | 1270 → 1261 | 341 → 344 | 705 → 815 |
| mega-nacht | 886 → 870 | 1298 → 1281 | 395 → 404 | 1009 → 910 |
| mega-straat | 852 → 856 | 1224 → 1223 | 489 → 507 | 1004 → 1049 |
| mega-metro | 176 → 174 | 275 → 266 | 691 → 703 | 325 → 312 |
| mega-centraal | 753 → 791 | 1466 → 1456 | 671 → 633 | 1286 → 1387 |
| munkbay (Greenisland) | 727 → 702 | 3308 → 3460 | 189 → 192 | 3351 → 1611 |
| alpen-hbf | 1212 → 1119 | 1713 → 1662 | 131 → 141 | 1471 → 1184 |

Conclusie: de grafische belasting is gelijk of iets lager (tekenopdrachten −2 % tot −8 %, behalve het station
Centraal +5 % door de busremise en de koplampbundels in beeld); het geheugen 3–18 MB hoger, in het centrum 38 MB lager. De
frametijden schommelen in SwiftShader met ±30 % tussen twee runs en tonen geen echte winst of achteruitgang. **Een
FPS-winst op echte toestellen is niet aangetoond.**

### Duurtest (31 minuten, rondes stad → toren → bouwen → opslaan → wereldwissel → rust)

| Scène | 14.2: eerste → laatste ronde (MB) | 15: eerste → laatste ronde (MB) | 15: groei laatste ronde |
|---|---|---|---|
| stad | 1050 → 1303 | 1194 → 1404 | +22 |
| toren | 1115 → 1393 | 1305 → 1515 | +19 |
| wereldwissel | 329 → 421 | 571 → 661 | −1 |

Geen crash, geen fouten in de console, het geheugen vlakt af (groei per ronde van +150 naar +20 MB, zoals in 14.2).
Wel gebruikt 15 **±100–240 MB meer geheugen** dan 14.2 (reizigers, planner-graaf, nieuwe wijken). Op een telefoon met
weinig geheugen is dat een risico dat hier niet getest kon worden.

### Screenshots voor/na (zelfde camera; links 14.2, rechts 15)

- `docs/terranova-15-wijk-historisch.jpg`: kantoortorens → historisch centrum met smalle trapgevels.
- `docs/terranova-15-wijk-villawijk.jpg`: rijhuizen → moderne villa's met tuin en zwembad.
- `docs/terranova-15-wijk-winkelkwartier.jpg`, `docs/terranova-15-wijk-haven.jpg`.
- `docs/terranova-15-wijk-laan.jpg`: zelfde laan, nu met rood fietspad.
- `docs/terranova-15-wijk-laan-nacht.jpg`: 's nachts op die plek **geen zichtbaar verschil** (die laan ligt in het
  centrum, waar geen extra straatmeubilair komt; de koplampbundels zie je alleen als er een auto in beeld rijdt).
- Verder: `terranova-15-buscabine-voor/na.png`, `terranova-15-stoomrook.png`, `terranova-15-busremise-nacht.png`.

## Samenvatting van de 8 verbeteringen

| # | Verbetering | Status | Wat ontbreekt |
|---|---|---|---|
| 1 | Living world: reizigers met hele reizen, levende stations, types | **Gebouwd** (Megatower City) | Hele reizen niet in Greenisland/Alpen |
| 2 | Voertuigen | **Gedeeltelijk** | Buscabine, stoomrook, koplampen nieuw; geen nieuwe 3D-modellen per treinsoort |
| 3 | Megatower City 2.0 | **Gebouwd** | Bewerkte tegels van spelers krijgen de nieuwe wijken niet; geen extra nachtverlichting |
| 4 | Depots (trein, metro, bus) | **Grotendeels** | Busremise nieuw en werkend; treinremise uitgebreid; geen locloods/bovenleiding in de remise; metroremise ongewijzigd |
| 5 | OV-planner + routebegeleiding | **Gebouwd** (Megatower City) | Geen planner voor alle werelden; vertraging "niet gemeten" |
| 6 | Carrièremodus | **Gebouwd** | Diensten getest met nagebootste bestuurderstoestand |
| 7 | Bouwmodus | **Gebouwd** | — |
| 8 | Prestaties, stabiliteit, crashherstel | **Gedeeltelijk** | Crashherstel en duurtest gedaan; geen gemeten FPS-winst; geen echte telefoons/GPU's; ±100–240 MB meer geheugen |

## Gewijzigde bestanden

49 bestanden t.o.v. 14.2 (`git diff --stat 223036a`): nieuw `js/journeys.js`, `js/planworker.js`, `js/routeguide.js`,
`js/career.js`, `js/buildlib.js`, `js/smoke.js`, 11 nieuwe browsertests; aangepast o.a. `js/travelers.js`,
`js/megacity.js`, `js/traffic.js`, `js/build.js`, `js/storage.js`, `js/game.js`, `js/app.js`, `js/megaplan.js`,
`js/rail.js`, `js/greenisland.js`, `index.html`.

## Bekende problemen

- Meer geheugen dan 14.2 (zie duurtest).
- Vertraging in planner en OV-kaart blijft "niet gemeten" in Megatower City.
- Spelers die Megatower City al bewerkt hebben, zien op die plekken de oude stad.
- De reizigerstest `reizen` haalt onder zware belasting de 40 ms-grens niet (49 ms p95); rustig wel.
- Niets getest op echte telefoons, tablets, Mac of Windows.

## Volgende stappen

1. De prestatietest in het spel (📊) draaien op een echte telefoon en pc, vóór publicatie.
2. Geheugen terugdringen (planner-graaf delen met de worker, minder gelijktijdige reizigers op zwakke toestellen).
3. Hele reizen en de planner uitbreiden naar Greenisland en de Alpen.
4. Echte vertraging meten voor voertuigen rond de speler.

## Oordeel

Niet alle acceptatiecriteria zijn gehaald (geen aangetoonde FPS-winst, geen tests op echte toestellen, enkele
onderdelen gedeeltelijk). Deze versie blijft daarom **TERRANOVA 15.0 (ontwikkelversie)** op de branch `terranova-15`;
`main` is niet aangeraakt. Publiceren alleen na een uitdrukkelijk "go".
