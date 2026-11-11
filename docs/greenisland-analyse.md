# Greenisland – analyse van de stedengenerator (vóór City Rebuild 2.0)

Gemeten met `node tools/analyse-green-infra.mjs` op versie 2026-11-16b.

## Modules

| Onderdeel | Waar |
|---|---|
| Terrein (kust, rivieren, meren, bergen) | `js/greenisland-terrain.js` (`rawHeight`, `coastDist`) |
| Landschapsvorm (wegen, spoor, havens) | `js/greenisland.js` → `natural()` = `rawHeight` → `roadShape` → `railShape` |
| Plaatsen en wijken | `js/greenisland-places.js`, `MUNKBAY_AREAS` in `js/greenisland-data.js` |
| Stratenraster en kavels | `js/greenisland.js` → `gridFor`, `streetAt`, `lotAt`, `fitLot` |
| Gebouwen | `js/greenisland.js` → `buildingColumn`, `matsFor`, `interior` |
| Nationale wegen | tracés: `tools/plan-green.mjs` → `js/greenisland-routes.js`; profiel en tekenen: `ROADS`, `roadColumn` |
| Spoor, stations, tunnels, viaducten | `js/rline.js`, `js/green-net.js`, `railColumn` in `js/greenisland.js` |
| Metro, tram, bus, kabelbanen | `metroCarve`, `streetColumn`, `BUS_LINES`, `js/lifts.js` |
| Tegels, LOD, ver landschap | `generateTile` (worker), `js/greenview.js`, `js/lod.js` |

## Gevonden oorzaken

1. **Wegen, spoor en straten worden onafhankelijk van elkaar gemaakt.** De tracés van wegen en spoor komen uit
   aparte zoekopdrachten; het stratenraster van elke stad is een vast rooster dat niets van het spoor weet.
   In een kolom wint gewoon wie eerst getekend wordt (eerst spoor, dan weg, dan straat).
2. **Nationale wegen × spoor: 108 van de 127 kruisingen zijn fout.** De weg ligt op bijna dezelfde hoogte als het
   spoor (geen brug, geen tunnel, geen overweg). Een groot deel daarvan zijn wegen die honderden meters *over*
   het spoorbed lopen (evenwijdig, bv. Vosmeer–Berkfield langs IC3): de weg verdwijnt daar onder de ballast.
3. **Stadsstraten × spoor: 977 van de 1240 kruisingen zijn fout.** De straat loopt tot in de sleuf of tegen de dijk
   van het spoor en houdt daar abrupt op (of loopt mee naar beneden in de sleuf). Slechts 3 kruisingen liggen op
   dezelfde hoogte, 22 onder een viaduct en 238 boven een tunnel.
4. **Landmarks liggen los van het stratenraster.** Een landmark wordt over straten heen gezet; die straten
   verdwijnen dan onder het gebouw.
5. **Gebouwen lijken op elkaar.** In Munkbay zijn er maar vier soorten (toren, appartement, winkel, oud huis),
   allemaal rechthoekige blokken met hetzelfde raampatroon; alleen kleur en hoogte verschillen (310 combinaties
   op 146 543 bemonsterde kavels). Geen L-, U- of getrapte vormen, geen hoekgebouwen, geen balkons.
6. **Weinig straatdetail.** Alleen lantaarnpalen en (op lanen) tramsporen; geen verkeerslichten, zebrapaden,
   bomen, banken of borden.

## Aanpak (City Rebuild 2.0)

- Eén gedeeld infrastructuurmodel: elke kruising weg × spoor en straat × spoor krijgt een *type*
  (overweg, wegbrug over het spoor, straat onder een spoorbrug, of een ontworpen doodlopend einde), en zowel
  het terrein, het tekenen als het verkeer gebruiken diezelfde gegevens.
- Wegen die evenwijdig over het spoorbed lopen worden opzij gelegd.
- Landmarks op het raster; straten eindigen netjes aan een plein voor het gebouw.
- Nieuw architectuursysteem met gebouwfamilies, vormen (L, U, getrapt, toren op sokkel, hofblok, rond), daken,
  balkons, winkelplinten en ornamenten, gekozen per wijk.
- Straatmeubilair en verkeerslichten; verkeer wacht aan overwegen en lichten.
- Automatische controles voor dit alles in `tools/check-green.mjs`.
