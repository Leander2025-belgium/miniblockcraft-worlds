# TERRANOVA — afhankelijkheidskaart van `js/`

Automatisch gemaakt door `tools/depmap.mjs`. 85 modules, 26213 regels. Instap vanuit index.html: `app.js`.

## Kern (gebruikt door ≥ 5 modules)

| Module | regels | gebruikt door |
|---|---|---|
| `blocks.js` | 182 | 29: aircraft, alpen, build, buildlib, career, carve, city, game, greenisland-arch, greenisland, interact, journeys, lifts, megacity, megatower, megaview, mesher, metropolis, mountain, osm, ovdiag, rail-green, rail, stationhall, textures, trainshell, underground, vessel, worker |
| `city.js` | 591 | 12: alpen-terrain, alpen, game, gnmi, greenisland-arch, greenisland-terrain, greenisland, megacity, metropolis, mountain, osm, worker |
| `greenisland-data.js` | 226 | 7: gnmi, green-net, greenisland-meta, greenisland-places, greenisland-terrain, greenisland, rail-green |
| `megacity.js` | 1206 | 7: app, game (dynamisch), lod, megaplan, megaview, ovmap, worker (dynamisch) |
| `vehicles.js` | 642 | 7: aircraft, avatar, drive, lift-view, mountainview, traffic, trainshell |
| `storage.js` | 334 | 6: app, build, game, terrain, underground, worker |
| `materials.js` | 74 | 5: game, greenview, lod, mountainview, textures |
| `megaplan.js` | 204 | 5: app (dynamisch), game (dynamisch), megaview, ovmap, planworker |

## Niet geïmporteerd door een andere module

- `app.js` (1299 regels) — instap index.html

## Alle modules

| Module | regels | gebruikt | exports |
|---|---|---|---|
| `aircraft.js` | 447 | blocks, mesher, vehicles | PLANES, Plane, Airports, FlightControl |
| `alpen-meta.js` | 10 | — | OX, META |
| `alpen-net.js` | 260 | alpen-plan, alpen-routes, alpen-terrain, mountain | TRACK, BED, RLine, NET, LINES, LINE, nearLine, nearLines … |
| `alpen-plan.js` | 62 | — | OLD_RAIL, LINE_PLAN |
| `alpen-routes.js` | 3 | — | ROUTES |
| `alpen-terrain.js` | 133 | city, dem-data | W, G, fbm, ridged, sstep, PATCHES, HEMEL, basinMask … |
| `alpen.js` | 1127 | alpen-meta, alpen-net, alpen-terrain, blocks, carve, city, mountain, stationhall | T, TOFF, TOWNS, LAKES, LIFTS, TRAILS, natural, surfaceAt … |
| `ambient.js` | 57 | sound | Ambient |
| `app.js` | 1299 | alpen-meta, alpen (dynamisch), bigmap, diag, frankfurt, game (dynamisch), greenisland-meta, greenisland (dynamisch), megacity, megaplan (dynamisch), megatower, metropolis, osm, ovdiag (dynamisch), ovmap (dynamisch), perftest (dynamisch), routeguide (dynamisch), storage, sw (pad), worker (worker) |  |
| `avatar.js` | 100 | vehicles | DEFAULT_LOOK, Avatar |
| `bigmap.js` | 45 | osm | MAP_VERSION, MZ, makeMap, mapMX, mapSize, toBlocks, tileCenter, superCount … |
| `blocks.js` | 182 | — | B, BLOCKS, N_BLOCKS, IS_TRANSPARENT, IS_CUTOUT, IS_SOLID, IS_OPAQUE, IS_INVISIBLE … |
| `build.js` | 332 | blocks, storage | Builder |
| `buildlib.js` | 40 | blocks | CATEGORIES, categoryOf, BuildLibrary |
| `buspax.js` | 91 | — | BUS_WAIT, BusPax |
| `career.js` | 264 | blocks | LEVELS, levelOf, TASKS, checkTask, Career |
| `carve.js` | 164 | blocks | BORE_W, boreBlock, SHAFT_EVERY, ventShaft, boreColumn, carveAt, CarveIndex |
| `city.js` | 591 | blocks | WIDTH, LENGTH, GROUND, HEIGHT, WATER_TOP, D, DISTRICT_NAMES, K … |
| `crossover.js` | 95 | — | buildCrossovers, crossoverNear |
| `dem-data.js` | 3 | — | DEM |
| `depot.js` | 185 | — | DepotPath, findDepot, depotAt, depotNear, shuntPath, tailDepotAt, DEPOT_DIM |
| `depotsim.js` | 151 | depot | depotPlan, shuntPos, depotState, SHUNT_SPEED |
| `diag.js` | 18 | — | diag, diagList, diagText |
| `drive.js` | 447 | sound, vehicles | INTERIOR, Drive |
| `environment.js` | 130 | — | skyAt, SkyDome, makeClouds |
| `frankfurt.js` | 19 | bigmap, osm | CITY, SIZE, toBlocks, SPAWN, PLACES |
| `game.js` | 2306 | aircraft, ambient, avatar, blocks, build, buildlib, buspax, career, city, diag, drive, environment, gnmi (dynamisch), interact, lod, materials, megacity (dynamisch), megaplan (dynamisch), megatower (dynamisch), megaview (dynamisch), mesher, metropolis, missions, mountainview (pad), planworker (worker), rail-alpen (pad), rail (dynamisch), storage, textures, traffic, travelers, underground, vessel, viridcoin (dynamisch) | Game, hudSafe |
| `gnmi.js` | 71 | city, greenisland-data, greenisland-terrain | REGIONS, regionAt, weatherIn, warningsFor, LEVEL_RANK, weatherAt, overview |
| `green-net.js` | 114 | greenisland-data, greenisland-routes, greenisland-terrain, greenisland-trams, rline | NET, LINES, LINE, stationsOf, STATIONS_ALL, trackOffset |
| `greenisland-arch.js` | 356 | blocks, city | FAMILIES, FAMILY_COUNT, familyMix, chooseFamily, planOf, archColumn |
| `greenisland-buses.js` | 3 | — | CITY_BUS |
| `greenisland-data.js` | 226 | — | COUNTRY, W, COAST, PROVINCES, PROVINCE_BOUNDS, provinceAt, MOUNTAINS, PEAKS … |
| `greenisland-meta.js` | 11 | greenisland-data, greenview (pad), rail-green (pad) | META |
| `greenisland-places.js` | 60 | greenisland-data, greenisland-terrain | ALL_PLACES, PLACE |
| `greenisland-routes.js` | 5 | — | RAIL, ROADS, SEA |
| `greenisland-terrain.js` | 114 | city, greenisland-data | fbm, ridged, sstep, coastDist, rawHeight, lakeAt, riverAt |
| `greenisland-trams.js` | 3 | — | TRAMS |
| `greenisland.js` | 1916 | blocks, carve, city, crossover, depot, green-net, greenisland-arch, greenisland-buses, greenisland-data, greenisland-meta, greenisland-places, greenisland-routes, greenisland-terrain, lifts, rline | T, DEPOT_DEF, DEPOTS, ROADS, HARBOURS, TRACK_Z, natural, surfaceAt … |
| `greenview.js` | 162 | greenisland, lift-view, materials | MountainView, stationNear, gondolaAt, STATIONS |
| `interact.js` | 131 | blocks | actionFor, updateSeat |
| `journeys.js` | 120 | blocks | MODE_KIND, doorNear, facadeNear, benchNear, ticketNear, stopFor, stepsFromPlan |
| `lift-view.js` | 84 | lifts, vehicles | LiftView |
| `lifts.js` | 82 | blocks | LIFT_SPEED, buildLifts, liftUV, liftColumn |
| `lod.js` | 272 | materials, megacity | FarView |
| `materials.js` | 74 | — | CLASS, CLASS_NAMES, materialOf, encodeMaterial, TONE_GLSL, installTone |
| `megacity.js` | 1206 | blocks, city, megatower, stationhall | TILES, META, SPAWN, RAIL_Z, TRAM_X, BUS_NS, busLineNS, busLineEW … |
| `megaplan.js` | 204 | megacity, service | STOPS, PLACES, TRAIN_HEADWAY, BUS_HEADWAY, LINES, plan, planHtml, scheduled … |
| `megatower.js` | 1060 | blocks | G, Y0, F_MIN, CX, BOX0, HEIGHT_M, floorY, floorAt … |
| `megaview.js` | 339 | blocks, megacity, megaplan, megatower, service | MegaView |
| `mesher.js` | 300 | blocks, textures | CS, LMAX, SMOOTH, OVER, meshChunk |
| `metropolis.js` | 589 | blocks, city | MW, META, PLACES, coastZ, riverX, zoneAtExport, zoneName, generateTile |
| `missions.js` | 52 | — | MISSIONS, Missions |
| `mountain-extras.js` | 489 | — | makeExtras |
| `mountain-trail.js` | 3 | — | TRAIL_WAYPOINTS |
| `mountain.js` | 566 | blocks, city, mountain-extras, mountain-trail | MW, META, LAKE, CX, STATIONS, CABLE_ATTACH, CABLE, cableY … |
| `mountainview.js` | 392 | alpen, materials, mountain, vehicles | MountainView, RIDE_SPEED, gondolaAt, CABLE_LEN, Gondolas, stationNear, LIFT_SPEED, AlpLifts |
| `osm.js` | 1410 | blocks, carve, city | REAL_GROUND, parseOSM, bboxFor, fetchOSM, aerowayQuery, overpassQuery, fetchOSMBox, resolveParts … |
| `ovdiag.js` | 107 | blocks, rail (dynamisch) | runOvDiag, ovDiagText |
| `ovmap.js` | 105 | megacity, megaplan | openOvMap |
| `ovtrips.js` | 78 | — | CAPACITY, capacityOf, Trips |
| `passengers.js` | 135 | — | WAIT_PER_PERIOD, Passengers |
| `perftest.js` | 75 | — | PROFILE, SCENES, deviceInfo, runPerfTest, resultHtml |
| `planworker.js` | 10 | megaplan |  |
| `rail-alpen.js` | 25 | alpen-net, alpen | SERVICES, NET |
| `rail-green.js` | 38 | blocks, green-net, greenisland-data, greenisland-trams, greenisland | NET |
| `rail.js` | 1601 | blocks, crossover, depotsim, mesher, passengers, railinfra, railroute, smoke, sound, trainshell | RUNS, netInfo, useNet, loadOverrides, rebuildTimetable, setDelayWeather, delayOf, delayReason … |
| `railinfra.js` | 154 | — | RailInfra |
| `railroute.js` | 66 | — | Route, routeServices |
| `rline.js` | 193 | — | TRACK, RLine |
| `routeguide.js` | 79 | — | RouteGuide |
| `service.js` | 26 | — | periodOfHour, SERVICE, DWELL, PERIOD_LABEL, scaled, HEADWAY |
| `smoke.js` | 38 | — | Smoke |
| `sound.js` | 94 | — | audioCtx, RailSound |
| `stationhall.js` | 57 | blocks | hallBlock, hallFloor |
| `storage.js` | 334 | — | listRegions, getRegionMeta, loadRegionData, fnv, PREV, saveRegion, loadRegionSafe, restorePrevious … |
| `terrain.js` | 82 | storage | decodeTerrarium, URL_T, elevationSampler, elevationBase |
| `textures.js` | 512 | blocks, materials | TILE, ATLAS_COLS, TILE_NAMES, TILE_INDEX, ATLAS_ROWS, RES, PAD, CELL … |
| `traffic.js` | 1090 | ovtrips, service, vehicles, vessel | Traffic |
| `trainshell.js` | 245 | blocks, vehicles | CAR_BASE, shellParts, LOD_DIST, TrainShells |
| `travelers.js` | 479 | journeys | NavGrid, doorsOpen, PROFILES, Travelers |
| `underground.js` | 268 | blocks, carve, storage, textures | DEPTH, Underground |
| `vehicles.js` | 642 | — | Parts, BUS_TYPES, seat, pole, rail, strap, hollowSides, METRO_LEAVES … |
| `vessel.js` | 309 | blocks, mesher | SHIP_TYPES, shipTypeFor, Vessel, Ships |
| `viridcoin.js` | 37 | — | START, ZENVO_MODELS, ticketPrice, Wallet, fmt |
| `worker.js` | 359 | alpen-meta, alpen (dynamisch), bigmap, blocks, city, greenisland-meta, greenisland (dynamisch), megacity (dynamisch), metropolis, osm, storage, terrain | takeVox |
