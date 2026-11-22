# Changelog

## TERRANOVA 16.0 (ontwikkelversie) · 2026-11-25a — branch `terranova-16`

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
