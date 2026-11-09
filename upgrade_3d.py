#!/usr/bin/env python3
"""Blokstad: conservative, repeatable visual upgrade for the current main branch."""
from pathlib import Path
import argparse
import shutil
import sys

MARK = '// BLOKSTAD 3D VISUAL V9'


def replace_one(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one anchor, found {count}. Repo may have changed. No files modified.')
    return source.replace(old, new, 1)


def upgrade(source):
    if MARK in source:
        print('Already installed; no changes needed.')
        return source
    # These replacements target existing shader code, not a new engine or dependencies.
    source = replace_one(source,
'''  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float daylight = mix(0.16, 1.0, day);
  float sunF = max(dot(n, sunDir), 0.0);
  vec3 col = c.rgb * vLight * daylight * (0.86 + 0.28 * sunF * day);
  float a = c.a;''',
'''  // BLOKSTAD 3D VISUAL V9: atmospheric, directional, and hemispheric light.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (!gl_FrontFacing) n = -n;
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float daylight = mix(0.14, 1.0, day);
  float sunF = max(dot(n, normalize(sunDir)), 0.0);
  float upF = n.y * 0.5 + 0.5;
  float skyFill = mix(0.62, 1.06, upF);
  float directSun = 0.40 * sunF * day;
  // Greedy mesher already supplies ambient occlusion as vLight.
  float ambient = clamp(vLight, 0.22, 1.0);
  vec3 col = c.rgb * daylight * ambient * (skyFill + directSun);
  // Very light warm sunlight on sun-facing surfaces, without changing block colors.
  col *= mix(vec3(1.0), vec3(1.045, 1.025, 0.975), sunF * day);
  float a = c.a;''', 'lighting')
    source = replace_one(source,
'''    float w = sin(vWorld.x * 0.9 + time * 1.3) * sin(vWorld.z * 0.7 - time * 1.1);
    float fr = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col = mix(col, fogColor * 1.05, 0.25 + 0.45 * fr) + vec3(0.06) * w * daylight;
    a = mix(a, 0.9, fr);''',
'''    // Two overlapping wave frequencies provide reflections without extra geometry.
    float w1 = sin(vWorld.x * 0.55 + vWorld.z * 0.22 + time * 1.1);
    float w2 = sin(vWorld.z * 0.81 - vWorld.x * 0.17 - time * 1.3);
    float ripple = w1 * w2;
    float fr = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 3.0);
    vec3 reflectedSky = fogColor * mix(0.8, 1.25, fr);
    col = mix(col, reflectedSky, 0.17 + 0.58 * fr);
    col += vec3(0.028, 0.045, 0.055) * ripple * daylight;
    a = mix(a, 0.94, fr);''', 'water')
    source = replace_one(source,
'''    float fr = pow(1.0 - abs(dot(n, viewDir)), 2.5);
    col = mix(col, fogColor * daylight * 1.1 + vec3(0.05), 0.2 + 0.55 * fr);
    vec3 cell = floor(vWorld - n * 0.5);
    float lit = step(0.65, h3(cell)) * (1.0 - day);
    col = mix(col, vec3(1.0, 0.84, 0.55), lit * 0.9);
    a = mix(max(a, 0.35 + 0.4 * fr), 0.95, lit);''',
'''    float fr = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 3.0);
    float reflection = 0.12 + 0.65 * fr;
    // Sky reflection and the subtle blue tint are view-dependent.
    col = mix(col, fogColor * daylight + vec3(0.025, 0.045, 0.065), reflection);
    vec3 cell = floor(vWorld - n * 0.5);
    float lit = step(0.65, h3(cell)) * (1.0 - day);
    col = mix(col, vec3(1.0, 0.84, 0.55), lit * 0.88);
    a = mix(max(a, 0.34 + 0.48 * fr), 0.95, lit);''', 'glass')
    source = replace_one(source,
'''  float fog = smoothstep(fogNear, fogFar, vDist);
  gl_FragColor = vec4(mix(col, fogColor, fog), a);''',
'''  // A faint distance haze smooths the transition to far-view scenery.
  float fog = smoothstep(fogNear, fogFar, vDist);
  float heightHaze = 1.0 - 0.12 * clamp((vWorld.y - cameraPosition.y) / 180.0, 0.0, 1.0);
  fog = clamp(fog * heightHaze, 0.0, 1.0);
  // Soft highlight roll-off, avoiding neon-bright surfaces at midday.
  col = max(col, vec3(0.0));
  col = col / (vec3(1.0) + max(col - vec3(0.92), vec3(0.0)) * 0.28);
  gl_FragColor = vec4(mix(col, fogColor, fog), a);''', 'haze')
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('repo', nargs='?', default='.', help='Repository root')
    parser.add_argument('--check', action='store_true', help='Only check compatibility')
    args = parser.parse_args()
    path = Path(args.repo) / 'js' / 'game.js'
    if not path.is_file():
        sys.exit(f'Missing {path}; run from the repository root.')
    old = path.read_text(encoding='utf-8')
    try:
        new = upgrade(old)
    except RuntimeError as e:
        sys.exit(str(e))
    if args.check:
        print('Compatible with current game.js.' if new != old else 'Visual upgrade already installed.')
        return
    if old == new:
        return
    backup = path.with_name('game.js.before-v9.bak')
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(new, encoding='utf-8')
    print(f'Updated {path} (backup at {backup}).')
    print('Note: only the renderer changed; world data, saves and map version are untouched.')

if __name__ == '__main__':
    main()
