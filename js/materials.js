// Materiaalsysteem (TERRANOVA 14): elke blokstextuur hoort bij een materiaalklasse met een ruwheid. Samen met de
// bestaande waarden glans / reliëf / weerspiegeling (textures.js) bepaalt dat in de wereldshader (game.js):
// - metaal: weerspiegeling en glans in de kleur van het metaal zelf (geen witte plastic glans);
// - ruwheid: hoe scherp het zonlicht weerkaatst (gepolijst marmer scherp, beton breed en zwak);
// - natheid bij regen: poreuze steen en beton worden donkerder (ook muren, in strepen), plassen alleen op
//   asfalt, stoep en bestrating, planten krijgen een lichte glans, glas en metaal veranderen niet;
// - eigen licht (lampen, schermen): niet door zon of schaduw beïnvloed.
// Codering in het alfakanaal van de materiaaltextuur: klasse × 16 + ruwheid (0..15).
export const CLASS = { default: 0, glass: 1, metal: 2, paint: 3, stone: 4, porous: 5, wood: 6, plant: 7, water: 8, snow: 9, emissive: 10, fabric: 11 };
export const CLASS_NAMES = Object.keys(CLASS);
const RULES = [ // [regex op de tegelnaam, klasse, ruwheid 0..1]; de eerste die past, telt
  [/^(water)$/, 'water', 0.05],
  [/^(lamp|tv_on|liftbutton|sign|ticket|paymachine|charger)$/, 'emissive', 0.4],
  [/glass|mirror|^ice$/, 'glass', 0.05],
  [/^(metal|copper|solar|elevator|elevator_top|escalator|liftdoor|barrier|server|generator|generator_top|pump|vent|fridge|stove_top|oven|sink_top|shower|gym|gym_top|shelf|post|ladder|tv_off|switch|lamp_off)$/, 'metal', 0.35],
  [/^paint_|^panel_|^checker$|^counter_top$|^cabinet$|^wardrobe$|^toilet|^bath_/, 'paint', 0.3],
  [/^(marble|granite|red_granite|tile|helipad)$/, 'stone', 0.25],
  [/brick|ashlar|limestone|sandstone|terracotta|cobble|^stone$|mossy_stone|deepslate|basalt|_ore$|bedrock|^roof_|clay_roof|half_timber|plaster/, 'stone', 0.8],
  [/^(asphalt|line_white|line_yellow|bus_lane|bike_path|sidewalk|concrete|gravel|ballast|planter|planter_top)$/, 'porous', 0.85],
  [/plank|log|birch$|birch_top|^crate$|bookshelf|parquet|wall_wood|door_|table_|chair_top|chair_side/, 'wood', 0.6],
  [/grass|hedge|leaves|spruce|flowers/, 'plant', 0.9],
  [/^(dirt|sand|clay)$/, 'porous', 0.95],
  [/^snow/, 'snow', 0.7],
  [/bed_|pillow|sofa_|leather_|carpet_|wool_|chair_red/, 'fabric', 0.95],
];
export function materialOf(name) {
  for (const [re, cls, rough] of RULES) if (re.test(name)) return { cls, rough };
  return { cls: 'default', rough: 0.8 };
}
export const encodeMaterial = (name) => { const m = materialOf(name); return CLASS[m.cls] * 16 + Math.round(m.rough * 15); };

// Gedeelde tonemapping voor de hele game: dezelfde curve voor de voxelwereld (eigen shader), de verre gebouwen
// (LOD-shaders) en alle Three.js-materialen (voertuigen, reizigers, borden). Gebaseerd op de 'PBR Neutral'-curve
// van Khronos: kleuren onder ±0,76 blijven zoals ze zijn, alleen fel licht wordt zacht afgeremd in plaats van hard
// wit te worden (zon op witte tegels, glas, sneeuw). De wereldshaders rekenen in beeldruimte (sRGB): die zetten om
// naar lineair, passen de curve toe en zetten terug; de Three.js-materialen krijgen dezelfde curve in lineaire ruimte.
export const TONE_GLSL = `
vec3 tnNeutral(vec3 color) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 tnToneSrgb(vec3 c) { // beeldruimte in, beeldruimte uit
  vec3 lin = pow(max(c, vec3(0.0)), vec3(2.2));
  return pow(max(tnNeutral(lin), vec3(0.0)), vec3(1.0 / 2.2));
}`;
let installed = false;
export function installTone(THREE, renderer) {
  if (!installed) {
    installed = true;
    THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
      // eigen namen (tm…): Three.js voegt dit stuk ook toe aan ShaderMaterials die TONE_GLSL al zelf bevatten
      /vec3 CustomToneMapping\( vec3 color \) \{[^}]*\}/, `${TONE_GLSL.replace(/tnNeutral/g, 'tmNeutral').replace(/tnToneSrgb/g, 'tmToneSrgb')}\nvec3 CustomToneMapping( vec3 color ) { return tmNeutral( color * toneMappingExposure ); }`);
  }
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1;
}
