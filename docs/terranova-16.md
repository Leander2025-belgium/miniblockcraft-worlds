# TERRANOVA 16 — rapport (ontwikkelversie 2026-11-25a)

Branch `terranova-16`, vertrokken van main `25843f5` (TERRANOVA 15.0 ontwikkelversie). `main` is niet aangeraakt.
Gebouwd, getest en gemeten in een Linux-container **zonder grafische kaart** (Chromium met SwiftShader,
software-rendering). Frametijden zijn daar 10–100× trager dan op een echt toestel; echte telefoons, tablets, Macs
of Windows-pc's waren niet beschikbaar.

**Naam.** De opdracht is bewust veel groter dan één update. Een groot deel van de 14 fasen is niet of maar
gedeeltelijk gebouwd (zie de tabel onderaan). Daarom heet deze versie **TERRANOVA 16.0 (ontwikkelversie)**.

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

## Fase 9-13 — regressie, metingen

(ingevuld na de volledige regressie, zie hieronder)

## Samenvatting van de 14 fasen

| Fase | Onderwerp | Status | Wat er is / wat ontbreekt |
|---|---|---|---|
| 0 | Audit, baseline | **Gedaan** | afhankelijkheidskaart, baseline 15, 30-FPS-onderzoek met meetinstrument (niet op de iPhone zelf) |
| 1 | Engine 16 | **Gedeeltelijk** | profielen incl. Batterij en Adaptief, regelaar op frametijden, FPS-grens, geheugendiagnose, compact ongedaan maken; geen occlusion culling of nieuwe streaming |
| 2 | Wereldgeneratie | **Niet gebouwd** | bestaande werelden en OSM-steden ongewijzigd |
| 3 | Graphics | **Gedeeltelijk** | alleen weer: sneeuwdek, mist, wind, grip; geen nieuwe materialen, hemel, water of gevels |
| 4 | Transport-simulator | **Niet gebouwd** | bestaande treinen, metro's, trams, bussen, auto's, vliegtuigen en schepen ongewijzigd (behalve grip bij weer) |
| 5 | Levende samenleving | **Niet gebouwd** | de reizigers-AI van 15 blijft; wachten op een volgende dienst bij een volle bus bestond al |
| 6 | Transportnetwerk | **Gedeeltelijk** | gemeten vertraging, planner met voorkeuren en alternatieven; geen planner voor alle werelden |
| 7 | Carrière en economie | **Gedeeltelijk** | ViridCoin overal, rijbewijzen, loon, uitdagingen, statistieken; geen nieuwe carrières of winkel |
| 8 | World builder | **Niet gebouwd** | bouwmodus van 15 blijft; geen wereldeditor of eigen infrastructuur |
| 9 | Multiplayer | **Prototype** | server + client + Docker Compose, getest met twee browsers; Docker-image niet gebouwd (Docker Hub-limiet) |
| 10 | Audio | **Niet gebouwd** | |
| 11 | Interface | **Niet gebouwd** | alleen nieuwe knoppen en schermen voor de nieuwe functies |
| 12 | Stabiliteit, savegames | **Gedaan** (binnen deze omgeving) | compatibiliteitstest, crashherstel blijft, duurtest (zie hieronder) |
| 13 | Testsuite | **Uitgebreid** | 6 nieuwe browsertests, 5 nieuwe controles zonder browser, servertest |
| 14 | Release | **Releasekandidaat op de branch** | niet gepubliceerd |
