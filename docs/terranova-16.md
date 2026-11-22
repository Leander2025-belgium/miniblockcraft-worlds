# TERRANOVA 16 — rapport (ontwikkelversie 2026-11-25b)

Branch `terranova-16`, vertrokken van main `25843f5` (TERRANOVA 15.0 ontwikkelversie). `main` is niet aangeraakt.
Gebouwd, getest en gemeten in een Linux-container **zonder grafische kaart** (Chromium met SwiftShader,
software-rendering). Frametijden zijn daar 10–100× trager dan op een echt toestel; echte telefoons, tablets, Macs
of Windows-pc's waren niet beschikbaar.

**Naam.** De opdracht is bewust veel groter dan één update. In een tweede ronde (versie 2026-11-25b) zijn ook de
fasen 2, 4, 5, 8, 10 en 11 en de ontbrekende delen van 6 en 7 gebouwd — elk als een eerste, geteste versie, niet
als het volledige eindbeeld uit de opdracht (zie de tabel onderaan en de grenzen per fase). Daarom heet deze versie
nog steeds **TERRANOVA 16.0 (ontwikkelversie)**.

## Fase 0 — audit en vertrekpunt

- **Afhankelijkheidskaart**: `tools/depmap.mjs` → [`docs/terranova-16-afhankelijkheden.md`](terranova-16-afhankelijkheden.md):
  85 modules, 26 213 regels; kern = `blocks.js` (29 gebruikers), `city.js`, `megacity.js`, `vehicles.js`,
  `storage.js`, `materials.js`, `megaplan.js`. Werelden laden hun verre landschap en treinnet via een pad in een
  variabele (`greenview.js`, `mountainview.js`, `rail-alpen.js`, `rail-green.js`); de kaart herkent dat ook.
- **Wat er al was** (en dus hergebruikt is, niet opnieuw gebouwd): wereldstreaming in tegels met Web Workers,
  vooruit laden in de rijrichting (tot 5 s vooruit bij > 60 m/s, extra tegels tegelijk), parkeren van verre tegels
  in het werkgeheugen met een budget per toestel, LOD voor verre gebouwen, adaptieve resolutie (op FPS), regen,
  sneeuw, onweer, natte wegen met plassen, treinfysica met massa, tractie, kleefkracht en wielslip, ViridCoin.
- **Baseline**: dezelfde code als 15.0 is gisteren volledig getest en gemeten: [`docs/bench16/voor-15.json`](bench16/voor-15.json)
  (= `docs/bench15/na-15.json`, identieke `js/`), regressie 15 groen (zie `docs/terranova-15.md`).

### Onderzoek "30 FPS" op de iPhone

De historische iPhone-meting (Megatower overdag 54,7 FPS; 's nachts 29,4; laan met tram, metroperron, Centraal
30) is **niet opnieuw gemeten**: er is hier geen iPhone. Bevindingen in de code, met bewijs:

- Er staat **nergens een begrenzing op 30** in de spellus: één `requestAnimationFrame` per frame, geen frameskip,
  geen timer. (Een vaste grens bestaat pas in 16, alleen in het nieuwe profiel Batterijbesparing.)
- 54,7 FPS overdag sluit een harde grens van de browser of de energiebesparingsmodus uit (die zou ook overdag op 30
  houden).
- "Precies 30" in drie zware scènes en 29,4 's nachts past bij **vsync-kwantisering**: een scherm van 60 Hz toont
  een nieuw beeld om de 16,7 ms; duurt een frame 17–33 ms, dan wacht het op de volgende verversing en worden het
  exact 30 FPS. Dat is een **vermoeden**, geen bewijs.
- Om het op het toestel zelf te bewijzen meet de prestatietest (📊) nu ook (a) het **ritme van de browser zonder
  tekenen** (geeft de browser zelf maar 30 Hz, dan ligt de grens bij toestel of browser) en (b) per scène de
  **verdeling van de frames over vsync-stappen** (1 = 60 FPS, 2 = 30 FPS, …), met een uitleg in gewone taal.
  Getest in `prestatietest.cjs` (hier: ritme 60 Hz; SwiftShader-frames allemaal ≥ 4 stappen, zoals verwacht).
  **Volgende stap: de 📊-test opnieuw draaien op de iPhone** en het resultaat vergelijken.

## Fase 1 — engine: kwaliteit, profielen, geheugen

| Wat | Hoe | Getest |
|---|---|---|
| Grafische profielen | Batterijbesparing (30 FPS-grens, snel, geen schaduwen, 80 m), Laag, Gemiddeld, Hoog, Ultra, **Adaptief** (`js/adaptive.js PROFILES`) | `adaptief.cjs` |
| Adaptieve kwaliteit op frametijden | `js/adaptive.js`: mediaan en p90 per 1,5 s, ladder resolutie → schaduwen → kijkafstand → resolutie; lukt 60 niet, dan een **stabiele 30** i.p.v. schommelen, later opnieuw 60 proberen (steeds minder vaak). Vervangt de oude regelaar op FPS-drempels. | `check-adaptive.mjs` (nagebootste toestellen: snel 60, middel 60 met lagere resolutie, traag stabiel 30, batterij 30 zonder kwaliteitsverlies); `adaptief.cjs` (in het spel: 2 treden omlaag in SwiftShader) |
| Vaste FPS-grens | `settings.fpsCap`: frames overslaan tot het volgende moment (minder rekenwerk = minder stroom) | `adaptief.cjs` (grens 0,5 FPS: 2 frames in 4 s, kortste tussentijd 1989 ms) |
| Geheugendiagnose | `js/memdiag.js`, pauzemenu → 🧠 Geheugen: JS-geheugen, geometrie op de GPU tegenover in de scène, verborgen meshes, vertexdata, tegels (geladen/geparkeerd/budget), voertuigen, ritten, reizigers, ongedaan-maak-geschiedenis; "mogelijk ongebruikt" met drempels | `adaptief.cjs` |
| Ongedaan maken compact | `js/build.js`: elke stap als één `Int32Array` (±20 i.p.v. ±100 bytes per blok), totaal begrensd op 2 miljoen blokken (±40 MB). Vroeger: tot 120 stappen × elk blok een eigen array (bij 72 000-blokbewerkingen honderden MB). | `bouwmodus.cjs` |

Bevinding van de diagnose in Megatower City: ±70 verborgen meshes bij normale kijkafstand (verborgen interieurs,
samen < 1 MB vertexdata); geen lek gevonden.

**Niet gedaan** in fase 1: occlusion culling, dynamische interne resolutie los van de pixelratio, nieuwe
streaming-architectuur (de bestaande voldeed; verbeteringen voor 300 km/u zijn niet gemeten), laden per verdieping
(bestond al voor de Megatower), geheugenlimiet per toestel (bestond al: `memBudget`).

## Fase 3 — weer (deels)

`js/weather.js` (één tabel per weertype) + `js/game.js`, `js/drive.js`, `js/traffic.js`, `js/rail.js`:

- **Sneeuw blijft liggen** (± 4 min tot volledig wit, smelt in ± 15 min, sneller bij regen): bovenkanten worden
  vlekkerig en dan dicht wit, niet binnen of onder de grond (shader).
- **Mist** (zicht ± 120 m) en **harde wind** als nieuwe weertypes; wind draait langzaam en geeft vlagen; regen
  valt schuin en sneeuw drijft mee.
- **Weer op het rijden**: grip van de weg (droog 1, regen 0,75, storm 0,65, sneeuw 0,45, smeltende sneeuw ertussen):
  auto's en bussen remmen korter/langer, trekken trager op en sturen minder in bij snelheid; het verkeer rijdt
  voorzichtiger (snelheid × 0,7–0,95); treinen hadden al kleefkracht per weer, nu ook vochtige spoorstaven in mist.
- `weer16.cjs`: sneeuwdek 0 → 0,5 → 1 → smelt → 0, grip en verkeer volgen, mist zicht 120 m, wind > 9 m/s, schuine
  regen. Screenshots: [`terranova-16-weer.jpg`](terranova-16-weer.jpg) (droog · na sneeuw · mist, zelfde plek).

**Niet gedaan**: nieuwe materialen (glas, metaal, water …), mooiere hemel en wolken, nieuw water, nieuwe gevels,
seizoenen (alleen sneeuw die blijft liggen).

## Fase 6 — transportnetwerk (deels)

- **Echt gemeten vertraging** (`js/traffic.js measureDelay`): elke rit van een echt voertuig rond de speler meet
  van aankomst tot aankomst aan de volgende halte de echte tijd tegenover de geplande (afgelegde weg / geplande
  rijsnelheid + geplande halteertijd). Te laat = positief, te vroeg = negatief, opgeteld over de rit. Zonder meting
  zegt de OV-kaart "nog niet beschikbaar". `vertraging.cjs`: 10 metingen in 6 min verkeer (bussen B8, B29),
  elke meting = echt − gepland, op de kaart "op tijd (+32 s, gemeten over 1 haltes)".
  Eerlijk: de planner rekent nog met de dienstregeling (niet met de gemeten vertraging), en metro's werden in die
  6 minuten niet gemeten (te weinig haltes binnen beeld).
- **Reisplanner met voorkeuren** (`js/megaplan.js PREFS`): snelste (zoals voorheen), minste overstappen, minst
  wandelen, toegankelijk (weinig lopen en overstappen, wandelstukken ≤ 700 m) en **andere verbindingen** in het
  planner-scherm. `check-planner.mjs` (56 reizen: niets sneller dan "snelste", minder overstappen/wandelen waar
  beloofd), `planner16.cjs` (scherm). Voorbeeld: snelste 56 min met 2 overstappen en 2,1 km lopen; toegankelijk
  64 min met 1 overstap en 727 m lopen.
- Bezetting, volgende halte, ritnummer, snelheid, positie op de OV-kaart bestonden al.

**Niet gedaan**: één gedeelde planner voor alle werelden (Greenisland en Alpen houden hun treinplanner), veerboten
in de planner, aansluitingen.

## Fase 7 — economie

`js/economy.js` met de **bestaande ViridCoin** (zelfde opslag `blokstad-viridcoin`: wat al verdiend was, blijft),
nu in alle werelden:

- **Rijbewijzen** (bus, tram, metro, trein): de eerste dienst in een soort is het examen (≥ 60 punten, +50 VC).
  Zonder rijbewijs mag je rijden (sandbox), maar zonder loon.
- **Loon** per dienst (score × 0,6 + 6 VC per halte), **betaalde bouwopdrachten** (80–250 VC, één keer).
- **Dagelijkse uitdagingen**: drie per dag (voor iedereen dezelfde op dezelfde datum), gevolgd op echte
  gebeurtenissen: dienst met ≥ 70 punten, bus- of raildienst, haltes bediend, blokken geplaatst, bouwopdracht,
  kilometers meegereden als passagier.
- **Statistieken** in het carrièrescherm; knop naar de portemonnee (Zenvo-showroom bestond al).
- Kaartjes betalen blijft alleen in Greenisland; elders is reizen gratis zoals voorheen. Geen echt geld.
- `check-economy.mjs`, `carriere.cjs` (examen gezakt bij 55 en 43 punten → geen rijbewijs).

**Niet gedaan**: nieuwe carrières (vrachtwagen, taxi, piloot, kapitein, bouwvakker, …), winkel voor woningen,
garages en decoratie.

## Fase 9 — multiplayerprototype

Optioneel; zonder server werkt alles zoals altijd, offline en zonder account.

- **Server** `server/mp-server.mjs` (Node 20+, enige afhankelijkheid `ws`), regels in `server/protocol.mjs`:
  kamers per wereld, posities met controle op plausibele snelheid (≤ 140 m/s, anders gecorrigeerd), **bouwacties
  gevalideerd** (bereik 10 m, blok-id, grenzen) en **in één volgorde genummerd** voor iedereen (twee spelers op
  hetzelfde blok: iedereen ziet hetzelfde resultaat), chat met filter en lengtegrens, **rate limiting** per
  soort bericht, max. 8 verbindingen per IP, max. spelers per kamer, berichtgrootte ≤ 4 KB, optioneel
  toegangswachtwoord (`MP_TOKEN`, tijdsveilig vergeleken) en toegestane origins (`MP_ORIGINS`), **atomaire opslag**
  (tijdelijk bestand + rename) en 5 roterende back-ups, `/health`.
- **Client** `js/multiplayer.js`, pauzemenu → 👥 Samen spelen (proef): andere spelers als avatar met naamkaartje,
  vloeiende posities, bouwacties van anderen (niet in je eigen ongedaan maken), chat, "👀 deel voertuig".
- **Docker**: `server/Dockerfile`, `server/docker-compose.multiplayer.yml` (eigen projectnaam, netwerk en volume,
  standaard alleen op `127.0.0.1:8787`, poort instelbaar, read-only, geen root, geheugenlimiet).
- Tests: `server/test-protocol.mjs` (18 controles met echte WebSocket-verbindingen, ook herstart en wachtwoord),
  `samenspelen.cjs` (twee spelers in twee browsers: elkaar zien en zien bewegen, bouwactie van A verschijnt bij B,
  te verre bouwactie geweigerd, chat, weggaan; zonder server mislukt verbinden netjes en draait de game door).
- **Eerlijk**: de Docker-image kon hier niet gebouwd worden (Docker Hub weigerde het basisimage: 429 Too Many
  Requests); `docker compose config` is geldig, de server zelf is wel getest. Geen echte accounts (alleen een
  gedeeld wachtwoord), geen privéwerelden met rechten, geen voertuigsynchronisatie, geen TLS (zet er een reverse
  proxy voor: `wss://`). De chatfilter is een korte woordenlijst.

### Installatie (server, optioneel)

```
cd server && npm install && node mp-server.mjs          # of:
cd server && docker compose -f docker-compose.multiplayer.yml up -d --build
# controleer eerst vrije poorten (ss -tlnp) en zet TERRANOVA_MP_PORT / TERRANOVA_MP_TOKEN / TERRANOVA_MP_ORIGINS
```
In het spel: pauzemenu → 👥 Samen spelen (proef) → adres `ws://…:8787` (of `wss://` achter een proxy).

## Fase 12 — compatibiliteit en savegames

- Opslagsleutels, wereld-ID's en bestandsformaat ongewijzigd; nieuwe gegevens in bestaande objecten (carrière:
  `licenses`, `stats`, `daily`) of nieuwe sleutels (`terranova-mp`).
- `compat16.cjs`: carrière, portemonnee (777,50 VC en een Zenvo), instellingen en favorieten zoals 15 ze bewaarde,
  worden geladen en na opslaan onveranderd teruggevonden; de nieuwe velden komen erbij.
- Crashherstel (veilig opslaan, vorige versie, beschadigde kopie apart) uit 15 blijft (`crashherstel.cjs`).

## Ronde 2 (2026-11-25b) — de fasen die eerst ontbraken

### Fase 2 — wereldgeneratie: Wildernis
Nieuwe wereld **Wildernis** (`js/wildernis.js`), 8 × 8 km, met een **zaadgetal**: hetzelfde getal = exact dezelfde
wereld, een ander getal = een aparte wereld met eigen ID (`wildernis-<getal>`) en eigen opslag. Zee en stranden,
rivieren die in de bergen smaller worden, heuvels en bergketens met besneeuwde toppen, en **12 biomen** volgens
temperatuur en vochtigheid (woestijn, steppe, grasland, loofbos, naaldbos, moeras, toendra, gebergte, toppen,
strand, zee, rivier), elk met eigen bodem, planten en bomen. Onder de grond lagen (aarde, steen, diepsteen,
bodemrots) met **kolen, ijzer, goud en diamant** en slingerende **grotten**. Biomenkaart in het menu.
- Getest (`wildernis.cjs`): 12 kleuren op de menukaart, start op droog land, bovenlaag in woestijn (zand),
  toendra (sneeuw) en zee (water) klopt met de generator, ± 1500 grotblokken en ± 1600 ertsblokken onder de speler,
  zaadgetal 42 geeft een andere wereld (38 van 40 hoogtes anders).
- Grenzen: ± 270 ms per tegel (in de achtergrondwerker); geen dorpen of wegen; de andere werelden zijn ongewijzigd.

### Fase 4 — transportsimulator: treinbeveiliging
`js/atb.js` voor zelf bestuurde metro's, treinen en trams (Megatower City en de verkeerswerelden): **blokseinen**
(rood/geel/groen volgens het bezette blok erachter), **lijnsnelheid en naderingssnelheid** met een **remcurve**,
**ATB** (eerst een bel; remt de bestuurder niet binnen 3 s, dan remt de trein zelf), **STS** (rood sein voorbij =
noodremming tot stilstand), **waakinrichting** (60 s geen bediening = bel, na 65 s remming; B bevestigt). Een
dashboardregel toont sein, afstand en toegestane snelheid. Greenisland en de Alpen hadden al seinen met een
eenvoudige automatische remming (`js/rail.js`); die blijven.
- Getest: `tools/check-atb.mjs` (seinbeelden, op tijd remmen = geen ingreep, ingreep na 3 s, STS, waaktimer 62/67 s)
  en `atb16.cjs` in het spel (waarschuwing en ingreep van 90 naar onder de toegestane snelheid, waakremming tot
  stilstand en vrijgeven met B, waaktimer loopt 19,6 s bij 19,6 s rijden).
- Fout gevonden en opgelost: de schermknoppen gaven `undefined` in plaats van `false`, waardoor elk beeld als
  bediening telde en de waakinrichting nooit afging.
- Grenzen: geen echte seinpalen in de wereld voor deze voertuigen (alleen in het dashboard); de blokken zijn vaste
  lengtes langs de lijn, geen echte seinplaatsen.

### Fase 5 — levende samenleving: bewoners met een dagritme
`js/society.js`: **12.000 bewoners** in Megatower City met naam, leeftijd, beroep (kantoor, winkel, zorg, industrie,
luchthaven, horeca, docent, student, gepensioneerd), een woning en werkplek op **echte percelen** (woontorens,
rijhuizen, villa's, kantoren, winkels, industrie, universiteit, ziekenhuis, luchthaven) en een **dagplanning**
(slapen, thuis, naar het werk, werken, boodschappen, vrije tijd, ploegendiensten vroeg/laat/nacht, weekend anders).
De **reizigers op straat zijn bewoners** met een echte verplaatsing die nu begint of eindigt in de buurt (60 % vertrek
hier, 40 % aankomst), en de drukte volgt hoeveel mensen nu onderweg zijn. Scherm **👪 Bewoners** in het pauzemenu
(wie doet wat, verloop over de dag, voorbeeldbewoners met hun dag, wie er rond je onderweg is). Uit te zetten in
Tijd & weer. Standaard een werkdag (dinsdag); de dag is te kiezen.
- Getest (`bewoners.cjs`): sluitende planning voor alle 12.000 (geen gaten), 's nachts > 9000 slapend, spits > 300
  onderweg, zaterdag veel minder werk en meer winkelen, drukte 8u en 17u30 > 2× 3u; reizigers met naam, beroep en
  doel dat klopt met hun planning, niemand twee keer tegelijk.
- Gevonden en opgelost: het doel stond soms verkeerd ('naar huis' i.p.v. 'naar het werk') door een te kleine cache.
- Gevolg voor de oude test `reizen.cjs`: met bewoners lopen veel korte verplaatsingen te voet, waardoor zijn
  momentopname 'iemand rijdt op afstand mee' vaker leeg was. Die test (reismechaniek) draait nu met bewoners uit.
- Grenzen: alleen in Megatower City; ± 1 op 3 gekozen bewoners heeft geen bereikbare deur in het geladen stuk en
  wordt overgeslagen (dan een willekeurige reiziger zoals vroeger); geen gezinnen of relaties tussen bewoners.

### Fase 8 — wereldbouwer
In de bouwmodus (B), van hoek ① naar hoek ②: **weg** (N: twee rijstroken, onderbroken middenstreep, stoepen,
lantaarns, helling als de hoeken op een andere hoogte liggen, steunlaag en pijlers boven een dal), **spoor** (G:
ballast, dwarsliggers, spoorstaven), **voetpad** (J, volgt de grond), **terrein vlak maken** (Shift+F), **heuvel**
(Shift+U), **beplanten** (Shift+I). Elk is één stap ongedaan te maken. Nieuwe **lege bouwwereld** (4 × 4 km vlak gras)
in het menu. Twee nieuwe bouwopdrachten in de carrière: *weg* en *spoorlijn*.
- Getest (`wereldbouwer.cjs`): weg met middenstreep, stoepen, helling 0 → 3 → 6 m, 40 pijlerblokken boven een dal,
  5 lantaarns; spoor 567 ballast, 162 spoorstaven; voetpad; heuvel 14 m; vlak maken; ongedaan maken; bewaard na
  herladen.
- Gevonden en opgelost: stoepen en lantaarns ontbraken door een afrondingsfout; kartelige randen bij een helling.
- Grenzen: de aangelegde wegen en sporen zijn blokken: het verkeer en de treinen van de stad rijden er **niet**
  over; geen bochten (rechte stukken van hoek tot hoek).

### Fase 10 — geluid
Mixer met volume per categorie (**alles, omgeving, voertuigen, effecten**), bewaard in de instellingen; alle geluid
via één AudioContext. Nieuw (`js/soundscape.js`): **voetstappen per ondergrond** (zacht, hard, hout, metaal, zand,
sneeuw, water), **donder met bliksemflits** bij onweer, **vogels** overdag en **krekels** 's nachts op rustige
plekken, **aankomstgong** als een metro, trein of tram vlakbij aan een halte stopt, **demping** bij sneeuw en onder
water, **piepende banden** zonder grip, **motor met versnellingen**.
- Getest (`geluid16.cjs`): echt hoorbaar signaal achter de mixer gemeten, volume-schuif werkt en wordt bewaard,
  8 stappen op 8 m, donder (niet ondergronds), geen vogels in de regen, gong alleen voor rail vlakbij, versnellingen.
- Grenzen: alles is synthetisch (geen opgenomen geluiden); geen ruimtelijk 3D-geluid per voertuig.

### Fase 11 — interface en toegankelijkheid
Het pauzemenu is opgedeeld in **tabbladen** (Spel, Personage, Beeld, Tijd & weer, Geluid, Besturing,
Toegankelijkheid; ook met de pijltjestoetsen). Nieuw tabblad **Toegankelijkheid**: tekstgrootte 85–150 %, grote
knoppen, hoog contrast, minder beweging (volgt de instelling van het toestel), **kleurfilters** voor rood-, groen-
en blauwzwak zien (daltonisering) en grijstinten, **geluiden als tekst** (gong, donder, omroep). Al toegepast in het
menu, vóór een wereld geladen is.
- Getest (`interface16.cjs`): alle oude instellingen staan in een tabblad, pijltjestoetsen, 130 % tekst, knoppen
  ≥ 48 px, zwarte panelen met witte rand, geen overgangen en geen bliksemflits bij minder beweging, ondertitels;
  het kleurfilter is pixel voor pixel gecontroleerd tegen de matrix (afwijking < 1,5 op 255).
- Grenzen: geen volledig nieuw ontwerp van het HUD; geen schermlezer-test.

### Fase 6 (rest) — reisplanner in de andere verkeerswerelden
`js/localplan.js`: planner over het **geladen** OV-net (metro, trein, tram, bus, lopen, overstappen te voet) voor
werelden zonder eigen planner (echte OSM-steden). Knop 🧭 in het pauzemenu.
- Getest: `tools/check-localplan.mjs` (nagebootst net: lopen, metro, metro + overstap + tram, bus — sneller dan
  lopen, stukken sluiten aan) en `planner-overal.cjs` (scherm, echt net van het spel).
- Grenzen (eerlijk): Nova Metropool heeft **geen OV-haltes** (alleen wegen), dus daar is niets te plannen; het
  geladen gebied is klein (± 500 m), dus lopen is daar vaak het snelst; zonder dienstregeling (gemiddelde wachttijd).
  De echte OSM-steden heb ik niet kunnen testen (geen internet in deze omgeving).

### Fase 7 (rest) — winkel en nieuwe carrière
**Winkel** in het carrièrescherm (ViridCoin, spelgeld): bouwhelm, OV-pet (alleen met een brevet voor bus, tram, metro
of trein), hoge hoed; gekocht = blijft, meteen te dragen, in de hoed-keuze alleen gekochte. **Taxichauffeur**: met
een auto een klant naar een bestemming 0,5–1,5 km verder brengen (eerste rit = examen → **taxivergunning**, daarna
loon; rood licht en traagheid kosten punten). **ATB-ingrepen** (−10) en **STS** (−40) tellen mee in de dienstscore.
- Getest (`carriere16.cjs`): kopen, te weinig geld en zonder brevet geweigerd, saldo klopt, avatar draagt het;
  taxi-examen gezakt (rood licht + STS), daarna gehaald, daarna loon; opdrachten weg en spoorlijn betaald.
- Grenzen: de taxi-test bootst het voertuig na (de dienstlogica wordt getest, niet het rijden zelf); geen
  klant-figuur in de auto.

### Fase 1 en 3 (rest) — wat al bestond
- Niet tekenen wat je niet ziet: ondergronds worden sinds 14 alleen de ondergrondse delen en wat dichtbij is
  getekend (`js/game.js`, renderprioriteit). Geen nieuwe occlusion culling of streaming gebouwd.
- Hemel en water: de koepel met maan en fonkelende sterren en het water met golfjes en glinstering bestonden al
  (sinds 14). Niets nieuws gebouwd aan materialen, hemel of water.

## Fase 9-13 — regressie, metingen

Alle cijfers komen uit deze ontwikkelomgeving: headless Chromium met SwiftShader (rekent zonder grafische kaart,
4 kernen). FPS-waarden zijn daardoor heel laag en alleen onderling vergelijkbaar (15 tegenover 16 op dezelfde machine),
niet met een telefoon of pc.

**Regressie** (alle controles zonder browser + 49 browsertests, één voor één):
- `run-all` (alle controles zonder browser, inclusief de 5 nieuwe en de servertest): geslaagd.
- 47 van de 49 browsertests slaagden in de eerste volledige ronde. `megatower` werd onderbroken door de tijdslimiet
  van de achtergrondtaak (geen fout) en slaagde daarna apart.
- `samenspelen` faalde twee keer: speler A zag de nieuwe positie van speler B nog niet na 2,5 s. Oorzaak: de test
  wachtte een vaste tijd terwijl de spellus onder belasting traag is. De test wacht nu tot de positie aankomt (max.
  15 s) en slaagt. Aan de game zelf is niets veranderd.
- `prestatietest` bleef twee keer 15 minuten hangen (in de volledige ronde en in de eerste herkansing). Daarna slaagde
  hij drie keer na elkaar in ± 2,5 minuut. De oorzaak van het hangen heb ik **niet gevonden**; bij een losse meting
  verliep elke stap normaal. Dit blijft een open punt.

**Benchmark 15 tegenover 16** (`tests/browser/bench.cjs`, zelfde profiel, zelfde machine, na elkaar;
[`bench16/`](bench16/)):

| Scène | 15 (FPS) | 16 (FPS) |
|---|---|---|
| Megatower overdag | 1,3 | 1,2 |
| Megatower ’s nachts | 1,0 | 1,1 |
| Laan met tram | 1,0 | 0,9 |
| Metroperron | 3,3 | 3,4 |
| Station Megatower Centraal | 0,9 | 0,9 |
| Munkbay | 0,4 | 0,5 |
| Alpen Hbf | 0,6 | 0,8 |

Binnen de meetonzekerheid (± 10–20 % tussen twee runs) is er geen verschil. Een eerste run van 16 was veel trager
(metro 0,7 FPS, `na-16-uitschieter.json`). Ik kon dat niet herhalen: een tweede volledige run en een meting per
onderdeel van de spellus (verkeer, reizigers, laden, tekenen) gaven dezelfde waarden als 15. Die eerste run staat
erbij zodat niets wordt weggelaten.

**Duurtest 60 minuten** (`tests/browser/duurtest.cjs`, MIN=60, [`bench16/duurtest-60min.json`](bench16/duurtest-60min.json)):
afwisselend door de stad vliegen, de toren in, bouwen, opslaan, van wereld wisselen en stilstaan. 61 minuten,
49 metingen, geen fouten. JS-geheugen tussen 345 en 1400 MB, in de tweede helft licht dalend (−1,6 MB per minuut):
geen lek gemeten. Maximaal 3230 geometrieën en 13 texturen.

**Niet gemeten:** echte telefoons (iPhone, Android) en een echte grafische kaart. Het 30-FPS-onderzoek op de iPhone
kan alleen met de prestatietest (📊) op het toestel zelf.

**Gewijzigde bestanden** ten opzichte van `main`: 47 bestanden, ± 2050 regels erbij, ± 80 eraf. Nieuw: `js/adaptive.js`,
`js/memdiag.js`, `js/weather.js`, `js/economy.js`, `js/multiplayer.js`, `server/`, `tools/depmap.mjs`, 6 browsertests,
5 controles. Aangepast: o.a. `js/game.js`, `js/build.js`, `js/career.js`, `js/traffic.js`, `js/ovmap.js`,
`js/megaplan.js`, `js/perftest.js`, `js/rail.js`, `js/drive.js`, `js/app.js`, `index.html`.

**Bekende problemen:**
- `prestatietest.cjs` bleef twee keer hangen zonder gevonden oorzaak (zie boven).
- Docker-image van de server niet gebouwd (Docker Hub weigerde het basisimage door een downloadlimiet);
  `docker compose config` is geldig.
- Samen spelen is een proef: geen accounts, alleen een gedeeld wachtwoord, en geen gedeelde voertuigen of OV.
- Gemeten vertraging alleen voor voertuigen in de buurt van de speler (daar rijdt de simulatie).

## Samenvatting van de 14 fasen

| Fase | Onderwerp | Status | Wat er is / wat ontbreekt |
|---|---|---|---|
| 0 | Audit, baseline | **Gedaan** | afhankelijkheidskaart, baseline 15, 30-FPS-onderzoek met meetinstrument (niet op de iPhone zelf) |
| 1 | Engine 16 | **Gedeeltelijk** | profielen incl. Batterij en Adaptief, regelaar op frametijden, FPS-grens, geheugendiagnose, compact ongedaan maken; ondergronds niet-tekenen bestond al; geen nieuwe occlusion culling of streaming |
| 2 | Wereldgeneratie | **Eerste versie** | Wildernis 8 × 8 km met zaadgetal, 12 biomen, rivieren, bergen, grotten, ertsen; geen dorpen |
| 3 | Graphics | **Gedeeltelijk** | weer (sneeuwdek, mist, wind, grip) nieuw; hemel met maan/sterren en water met golven bestonden al; geen nieuwe materialen |
| 4 | Transport-simulator | **Eerste versie** | blokseinen, remcurve, ATB, STS, waakinrichting voor metro/trein/tram; motor met versnellingen; geen seinpalen in de wereld |
| 5 | Levende samenleving | **Eerste versie** | 12.000 bewoners met beroep, woning, werk en dagritme in Megatower City; reizigers zijn bewoners; alleen Megatower City |
| 6 | Transportnetwerk | **Gedeeltelijk** | gemeten vertraging, planner met voorkeuren en alternatieven, planner over het geladen net voor OSM-steden; Nova Metropool heeft geen OV |
| 7 | Carrière en economie | **Gedeeltelijk** | ViridCoin overal, rijbewijzen, loon, uitdagingen, statistieken, winkel (3 hoofddeksels), taxichauffeur, ATB/STS in de score |
| 8 | World builder | **Eerste versie** | weg, spoor, voetpad, vlak maken, heuvel, beplanten, lege bouwwereld; verkeer rijdt niet over zelfgebouwde wegen |
| 9 | Multiplayer | **Prototype** | server + client + Docker Compose, getest met twee browsers; Docker-image niet gebouwd (Docker Hub-limiet) |
| 10 | Audio | **Eerste versie** | mixer, voetstappen, donder, vogels/krekels, gong, demping, banden, versnellingen; synthetisch |
| 11 | Interface | **Eerste versie** | tabbladen in het pauzemenu, tabblad Toegankelijkheid (tekst, knoppen, contrast, beweging, kleurfilters, ondertitels) |
| 12 | Stabiliteit, savegames | **Gedaan** (binnen deze omgeving) | compatibiliteitstest, crashherstel blijft, duurtest 60 min zonder lek (zie boven) |
| 13 | Testsuite | **Uitgebreid** | 14 nieuwe browsertests, 7 nieuwe controles zonder browser, servertest |
| 14 | Release | **Releasekandidaat op de branch** | niet gepubliceerd |
