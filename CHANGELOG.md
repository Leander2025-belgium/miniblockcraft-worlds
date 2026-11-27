# Changelog

## TERRANOVA 16.1 (ontwikkelversie) · 2026-11-27a — branch `terranova-16.1`

Megatower City: Ultimate Metropolis Revolution. Details, metingen en grenzen: [`docs/terranova-megatower-revolution.md`](docs/terranova-megatower-revolution.md).

### Nieuw
- 🏙 **The Megatower** (nog altijd exact 1.000 m): gelede vliesgevel met pijlers en twee glassoorten, ribben met
  ledlijnen, lichtbanden bij elke sectie-overgang, negen sky gardens, portaal en glazen luifel bij de hoofdingang,
  verlichte kroon; 's nachts een lichtgolf en kamerverlichting die het uur volgt; eigen gevel van ver.
- 🚉 **Megatower Grand Central**: 22 perronsporen (11 eilandperrons), stationshal (+1) met 38 winkels en horecazaken,
  tramstation (-1, 10 sporen), metrostation (-2, 6 sporen), hyperloopterminal; treindienstleiding met vrije
  spoortoewijzing en vergrendelde wisselstraten.
- 🚊 **Tram T5** (onder Grand Central door), 🚇 **metro M2** (noord–zuid, 8 stations), 🚄 **hyperloop** Grand
  Central – Luchthaven (fictief toekomstconcept, 3,7 km, ± 92 s); alles in de reisplanner en op de vertrekborden.
- 🛍 **Megatower Galleria**: vijf winkelverdiepingen rond een atrium, 360 ingerichte winkels en horecazaken,
  foodcourt, panoramagalerij, logistieke kelder. **Grand Boulevard**: 1,66 km winkelstraat met 227 winkels.
- 🌳 Hoogtemix en pocketparken in het centrum, een culturele wijk en een uitgaanswijk.
- 💾 Bewerkte stukken blijven zoals ze waren; vernieuwen kan op vraag, met back-up (pauzemenu → Wereld).

### Opgelost
- Reizigers: een bewoner wiens reis geen looppad vond, werd meteen opnieuw gekozen en verdrong zo de hele reizen;
  nu 10 minuten (speltijd) wachttijd (gevonden met de regressietest `reizigers-auto`).

## TERRANOVA 16.0 (ontwikkelversie) · 2026-11-25b — branch `terranova-16`

Tweede ronde: de fasen die eerst ontbraken, elk als eerste geteste versie. Details en grenzen: [`docs/terranova-16.md`](docs/terranova-16.md).

### Nieuw
- 🌲 **Wildernis**: nieuwe wereld van 8 × 8 km met zaadgetal, 12 biomen, rivieren, bergen, grotten en ertsen.
- 🏗 **Lege bouwwereld** en **wereldbouwer** in de bouwmodus: weg (N), spoor (G), voetpad (J), vlak maken (Shift+F),
  heuvel (Shift+U), beplanten (Shift+I).
- 👪 **Bewoners** met beroep, woning, werk en dagritme in Megatower City; de reizigers op straat zijn bewoners.
- 🚦 **Treinbeveiliging** voor zelf bestuurde metro's, treinen en trams: blokseinen, remcurve, ATB, STS,
  waakinrichting (B).
- 🔊 **Geluid**: mixer per categorie, voetstappen per ondergrond, donder met bliksem, vogels en krekels, gong aan de
  halte, demping bij sneeuw en onder water, piepende banden, motor met versnellingen.
- ♿ **Interface**: pauzemenu in tabbladen, tabblad Toegankelijkheid (tekstgrootte, grote knoppen, hoog contrast,
  minder beweging, kleurfilters, geluiden als tekst).
- 🧭 Reisplanner over het geladen OV-net voor werelden zonder eigen planner.
- 🛍 **Winkel** (ViridCoin): bouwhelm, OV-pet, hoge hoed. 🚕 Nieuwe carrière **taxichauffeur**; bouwopdrachten weg
  en spoorlijn; ATB-ingrepen en STS tellen mee in de score.

### Opgelost
- Waakinrichting ging nooit af doordat schermknoppen `undefined` gaven.
- Bewoners: verkeerd reisdoel door een te kleine cache.
- Wereldbouwer: stoepen, lantaarns en kartelige randen bij een helling.

## TERRANOVA 16.0 (ontwikkelversie) · 2026-11-25a

Volledig rapport met tests, metingen en wat niet gebouwd is: [`docs/terranova-16.md`](docs/terranova-16.md).

### Nieuw
- Grafische profielen **Batterijbesparing** (30 FPS-grens) en **Adaptief**; automatische kwaliteit stuurt nu op
  gemeten frametijden naar 60 of een stabiele 30 FPS.
- Prestatietest (📊) meet het ritme van de browser zonder tekenen en de verdeling over vsync-stappen (onderzoek naar
  "30 FPS" op telefoons).
- 🧠 Geheugendiagnose in het pauzemenu.
- Weer: sneeuw blijft liggen en smelt, mist, harde wind; grip van de weg voor auto's en bussen, voorzichtiger verkeer.
- Live OV-kaart: **echt gemeten vertraging** per rit (of "nog niet beschikbaar").
- Reisplanner: voorkeuren (snelste, minste overstappen, minst wandelen, toegankelijk) en andere verbindingen.
- Carrière: ViridCoin in alle werelden, rijbewijzen met examen, loon per dienst, betaalde bouwopdrachten,
  dagelijkse uitdagingen, statistieken.
- 👥 **Samen spelen (proef)**: optionele eigen server (`server/`, Docker Compose) met validatie, rate limiting en
  opslag; de game blijft volledig offline werken.

### Verbeterd
- Ongedaan maken in de bouwmodus gebruikt veel minder geheugen (compacte opslag, totale grens).

### Opgelost
- Het scherm "Samen spelen" gebruikte dezelfde knop-id als de reisplanner (sluitknop werkte niet).

### Compatibiliteit
- Opslagsleutels (`blokstad`, `BLOKSTAD1`, `blokstad-*`, `terranova-*`), wereld-ID's en bestandsformaat ongewijzigd;
  carrière, portemonnee, instellingen en favorieten van 15 blijven (getest).

## TERRANOVA 15.0 (ontwikkelversie) · 2026-11-24a
Zie [`docs/terranova-15.md`](docs/terranova-15.md).
