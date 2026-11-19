# Blokstad — 3D Rendering v9

This visual patch is made for the `main` branch inspected on **9 November 2026** (`js/game.js` blob SHA `b4576cadc057d8aed1f559e05291a0af0f41a1b1`). It improves the **existing** Three.js custom shader with directional and hemispheric light, mild atmospheric fog, glass Fresnel reflections, and multi-frequency water shimmer. It does **not** make the real-world assets photorealistic and does not change world geometry.

## Installation

1. Download your GitHub repository as a ZIP and unpack it, or clone it.
2. Place `upgrade_3d.py` at the root beside `index.html`.
3. Run `python3 upgrade_3d.py . --check`.
4. Run `python3 upgrade_3d.py .`.
5. Check the visual result and performance on your desktop and iPhone, then commit **only `js/game.js`** to GitHub.

The script creates a backup named `js/game.js.before-v9.bak` in your local project folder. Do not upload that backup. Repeated runs do not duplicate the patch. When the source has changed unexpectedly, the script stops without writing any file.

## Next steps toward nearly real 3D cities

- Detailed building geometry: 3D doors, columns, train-station façades, curved roofs, historic landmarks, procedural street furniture.
- Better real-world data: OSM footprints + tagged heights, Overture/3D Tiles where license and browser performance allow, high-res elevation where licensed.
- Use textured geometry or glTF for important buildings (e.g., Frankfurt Hbf, Commerzbank Tower); pure 1-metre voxel blocks cannot reproduce fine ornaments.
- For mobile, add distance- and quality-dependent LOD; don't enable costly shadows on every chunk.
- For accuracy, avoid inventing precise façades for buildings that have no imagery or detailed map data.

## Limitations

This script was syntax-tested on a synthetic copy of the relevant original shader snippets, not on a running iPhone. Shader rendering requires browser validation, especially iOS Safari WebGL. No claim of 'perfect 3D' is made.
