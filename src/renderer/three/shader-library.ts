/* RPGAtlas — internal Three.js shader source library.
   Shader strings are kept verbatim from the parity renderer. */
export interface ShaderLibrary {
  SCENE_VS: string;
  SCENE_FS: string;
  DEPTH_VS: string;
  DEPTH_FS: string;
  WATER_VS: string;
  WATER_FS: string;
  WEATHER_VS: string;
  WEATHER_FS: string;
  DROP_FS: string;
  POST_VS: string;
  BRIGHT_FS: string;
  BLUR_FS: string;
  COMP_FS: string;
  AO_FS: string;
  FXAA_FS: string;
}

export function createShaderLibrary(
  TILE: number,
  MAX_LIGHTS: number,
  MAX_PLS: number,
  PL_FACE: number,
  PL_NEAR: number,
): ShaderLibrary {
  // ---------------------------- shaders ----------------------------
  // Verbatim from js/renderer.js (see header) — do not "modernize" these while
  // the parity goldens gate the port.
  const SCENE_VS =
    "layout(location=0) in vec3 aPos;\n" +
    "layout(location=1) in vec2 aUV;\n" +
    "layout(location=2) in float aTint;\n" +
    "uniform mat4 uMVP;\n" +
    "out vec2 vUV; out float vTint; out vec3 vWorld;\n" +
    "void main() {\n" +
    "  gl_Position = uMVP * vec4(aPos, 1.0);\n" +
    "  vUV = aUV; vTint = aTint; vWorld = aPos;\n" +
    "}";
  const SCENE_FS =
    "precision mediump float;\n" +
    "in vec2 vUV; in float vTint; in vec3 vWorld;\n" +
    "uniform sampler2D uTex;\n" +
    "uniform vec3 uEye;\n" +
    "uniform float uAmbient;\n" + // < 0 means lighting disabled
    "uniform int uLightCount;\n" +
    "uniform vec4 uLightPos[" + MAX_LIGHTS + "];\n" + // xyz + radius
    "uniform vec3 uLightCol[" + MAX_LIGHTS + "];\n" +
    "uniform vec4 uFog;\n" + // rgb + on/off
    "uniform vec2 uFogRange;\n" + // near, far (view distance px)
    "out vec4 outColor;\n" +
    // Stage B: sun shadow mapping. Compiled ONLY when the material carries the
    // SHADOWS define (map.hd2d.shadows) — without it the preprocessor strips
    // all of this and the program is identical to the Stage A parity shader.
    "#ifdef SHADOWS\n" +
    "uniform sampler2D uShadowMap;\n" +
    "uniform mat4 uSunMVP;\n" +
    "uniform float uShadowStrength;\n" +
    "uniform vec2 uShadowTexel;\n" +
    "float shadowVis() {\n" + // 3x3 PCF, 1 = fully lit
    "  vec4 sc = uSunMVP * vec4(vWorld, 1.0);\n" +
    "  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;\n" +
    "  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;\n" +
    "  float vis = 0.0;\n" +
    "  for (int dy = -1; dy <= 1; dy++) {\n" +
    "    for (int dx = -1; dx <= 1; dx++) {\n" +
    "      float d = texture(uShadowMap, p.xy + vec2(float(dx), float(dy)) * uShadowTexel).r;\n" +
    "      vis += (p.z - 0.0018) <= d ? 1.0 : 0.0;\n" +
    "    }\n" +
    "  }\n" +
    "  return vis / 9.0;\n" +
    "}\n" +
    "#endif\n" +
    // Stage B.2: point-light shadows. Compiled ONLY under POINT_SHADOWS
    // (map.hd2d.pointShadows) — stripped otherwise, so programs without the
    // define stay identical to the Stage A/B.1 shaders. The first uPLCount
    // entries of the light arrays are the shadow casters; each has 6 depth
    // faces in the shared uPLMap atlas (see renderPointDepth for the layout —
    // the face axes here MUST match the JS view matrices in PL_FACES).
    "#ifdef POINT_SHADOWS\n" +
    "uniform sampler2D uPLMap;\n" +
    "uniform int uPLCount;\n" +
    "uniform float uPLStrength;\n" +
    "float plLinZ(float s, float f) {\n" + // window z -> view distance
    "  float d = s * 2.0 - 1.0;\n" +
    "  return 2.0 * " + PL_NEAR.toFixed(1) + " * f / (f + " + PL_NEAR.toFixed(1) + " - d * (f - " + PL_NEAR.toFixed(1) + "));\n" +
    "}\n" +
    "float plVis(int i) {\n" + // 1 = fully lit by caster i
    "  vec3 d = vWorld - uLightPos[i].xyz;\n" +
    "  float range = max(uLightPos[i].w, " + (PL_NEAR * 2).toFixed(1) + ");\n" +
    "  vec3 a = abs(d);\n" +
    "  float zv; vec2 uv; float face;\n" +
    "  if (a.x >= a.y && a.x >= a.z) {\n" +
    "    zv = a.x;\n" +
    "    uv = d.x > 0.0 ? vec2(-d.z, d.y) : vec2(d.z, d.y);\n" +
    "    face = d.x > 0.0 ? 0.0 : 1.0;\n" +
    "  } else if (a.y >= a.x && a.y >= a.z) {\n" +
    "    zv = a.y;\n" +
    "    uv = d.y > 0.0 ? vec2(d.x, d.z) : vec2(d.x, -d.z);\n" +
    "    face = d.y > 0.0 ? 2.0 : 3.0;\n" +
    "  } else {\n" +
    "    zv = a.z;\n" +
    "    uv = d.z > 0.0 ? vec2(d.x, d.y) : vec2(-d.x, d.y);\n" +
    "    face = d.z > 0.0 ? 4.0 : 5.0;\n" +
    "  }\n" +
    "  if (zv >= range) return 1.0;\n" +
    "  uv = uv / zv * 0.5 + 0.5;\n" +
    "  float col = face >= 3.0 ? face - 3.0 : face;\n" +
    "  float row = float(i) * 2.0 + (face >= 3.0 ? 1.0 : 0.0);\n" +
    "  float bias = 3.0 + zv * 0.05;\n" + // slope term: ground is near-grazing in the side faces
    "  float vis = 0.0;\n" +
    "  for (int ty = 0; ty < 2; ty++) {\n" + // 4-tap PCF inside the face
    "    for (int tx = 0; tx < 2; tx++) {\n" +
    "      vec2 t = uv + (vec2(float(tx), float(ty)) - 0.5) * " + (2 / PL_FACE).toFixed(6) + ";\n" +
    "      t = clamp(t, " + (1.5 / PL_FACE).toFixed(6) + ", " + (1 - 1.5 / PL_FACE).toFixed(6) + ");\n" +
    "      vec2 at = vec2((col + t.x) / 3.0, (row + t.y) / " + (MAX_PLS * 2).toFixed(1) + ");\n" +
    // textureLod: this runs inside the light loop (non-uniform control flow),
    // where implicit-derivative sampling is undefined; the map has no mips.
    "      vis += (zv - bias) <= plLinZ(textureLod(uPLMap, at, 0.0).r, range) ? 1.0 : 0.0;\n" +
    "    }\n" +
    "  }\n" +
    "  return vis * 0.25;\n" +
    "}\n" +
    "#endif\n" +
    // Stage C: CLIPY discards below-waterline fragments during the planar-
    // reflection pass (compiled only when the map has water); MATERIALS adds
    // the auto-generated normal/specular/emissive maps (terrain chunks only).
    "#ifdef CLIPY\n" +
    "uniform vec2 uClipY;\n" + // x: pass active, y: waterline
    "#endif\n" +
    "#ifdef MATERIALS\n" +
    "uniform sampler2D uMatMap;\n" + // rgb: world-space normal, a: specular
    "uniform sampler2D uEmisMap;\n" + // rgb: emissive color
    "uniform float uGlow;\n" + // emissive engagement (rises as ambient falls)
    "#endif\n" +
    // Stage D: the day/night cycle tints the ambient term (dawn gold, night
    // blue). Compiled only under map.hd2d.dayNight.
    "#ifdef DAYNIGHT\n" +
    "uniform vec3 uAmbTint;\n" +
    "#endif\n" +
    "void main() {\n" +
    "#ifdef CLIPY\n" +
    "  if (uClipY.x > 0.5 && vWorld.y < uClipY.y) discard;\n" +
    "#endif\n" +
    "  vec4 c = texture(uTex, vUV);\n" +
    "  if (c.a < 0.25) discard;\n" +
    "  vec3 rgb = c.rgb * vTint;\n" +
    "  if (uAmbient >= 0.0) {\n" +
    "    vec3 lit = vec3(uAmbient);\n" +
    "#ifdef DAYNIGHT\n" +
    "    lit *= uAmbTint;\n" +
    "#endif\n" +
    "#ifdef MATERIALS\n" +
    "    vec3 N = normalize(texture(uMatMap, vUV).rgb * 2.0 - 1.0);\n" +
    "    float specM = texture(uMatMap, vUV).a;\n" +
    "    vec3 V = normalize(uEye - vWorld);\n" +
    "    vec3 spec = vec3(0.0);\n" +
    "#endif\n" +
    "    for (int i = 0; i < " + MAX_LIGHTS + "; i++) {\n" +
    "      if (i >= uLightCount) break;\n" +
    "      float f = max(0.0, 1.0 - distance(vWorld, uLightPos[i].xyz) / uLightPos[i].w);\n" +
    // sqrt so the squared falloff scales linearly with the PCF visibility
    "#ifdef POINT_SHADOWS\n" +
    "      if (i < uPLCount && f > 0.0) f *= sqrt(mix(1.0, plVis(i), uPLStrength));\n" +
    "#endif\n" +
    "#ifdef MATERIALS\n" +
    "      vec3 Ld = normalize(uLightPos[i].xyz - vWorld);\n" +
    // relief shading: darken faces turned away, keep the flat look's base
    "      f *= sqrt(mix(0.45, 1.0, clamp(dot(N, Ld), 0.0, 1.0)));\n" +
    "      spec += uLightCol[i] * (f * specM * pow(max(dot(N, normalize(Ld + V)), 0.0), 48.0));\n" +
    "#endif\n" +
    "      lit += f * f * uLightCol[i];\n" +
    "    }\n" +
    "    rgb *= lit;\n" +
    "#ifdef MATERIALS\n" +
    "    rgb += spec * 0.9;\n" +
    "    rgb += texture(uEmisMap, vUV).rgb * uGlow;\n" +
    "#endif\n" +
    "  }\n" +
    "#ifdef SHADOWS\n" +
    "  rgb *= 1.0 - uShadowStrength * (1.0 - shadowVis());\n" +
    "#endif\n" +
    "  if (uFog.a > 0.0) {\n" +
    "    float f = clamp((distance(vWorld, uEye) - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);\n" +
    "    rgb = mix(rgb, uFog.rgb * c.a, f);\n" +
    "  }\n" +
    "  outColor = vec4(rgb, c.a);\n" +
    "}";
  // Depth pass (Stage B): world geometry rasterized from a light's view —
  // the sun's orthographic frustum or one point-light cube face (uDepthMVP is
  // set per pass); alpha-tested like the scene pass so sprite cutouts and
  // tile transparency cast correct silhouettes.
  const DEPTH_VS =
    "layout(location=0) in vec3 aPos;\n" +
    "layout(location=1) in vec2 aUV;\n" +
    "uniform mat4 uDepthMVP;\n" +
    "out vec2 vUV;\n" +
    "void main() {\n" +
    "  gl_Position = uDepthMVP * vec4(aPos, 1.0);\n" +
    "  vUV = aUV;\n" +
    "}";
  const DEPTH_FS =
    "precision mediump float;\n" +
    "in vec2 vUV;\n" +
    "uniform sampler2D uTex;\n" +
    "out vec4 outColor;\n" +
    "void main() {\n" +
    "  if (texture(uTex, vUV).a < 0.25) discard;\n" +
    "  outColor = vec4(1.0);\n" +
    "}";

  // Water surface (Stage C): refraction = the chunk's own prerendered pixels
  // sampled with wave-distorted UVs; reflection = the mirrored-camera pass
  // sampled at (distorted) screen position; foam rides the aTint attribute
  // (1 at shore corners, 0 inside). Lighting/fog mirror the scene shader so
  // water sits in the same ambiance. Everything animates off uTime, which the
  // hosts derive from the engine tick — no internal clocks (determinism).
  const WATER_VS =
    "layout(location=0) in vec3 aPos;\n" +
    "layout(location=1) in vec2 aUV;\n" +
    "layout(location=2) in float aTint;\n" +
    "uniform mat4 uMVP;\n" +
    "out vec2 vUV; out float vFoam; out vec3 vWorld;\n" +
    "void main() {\n" +
    "  gl_Position = uMVP * vec4(aPos, 1.0);\n" +
    "  vUV = aUV; vFoam = aTint; vWorld = aPos;\n" +
    "}";
  const WATER_FS =
    "precision mediump float;\n" +
    "in vec2 vUV; in float vFoam; in vec3 vWorld;\n" +
    "uniform sampler2D uTex;\n" + // this chunk's prerender (refraction source)
    "uniform sampler2D uReflect;\n" + // mirrored scene, screen-space
    "uniform vec2 uScreen;\n" +
    "uniform vec2 uChunkPx;\n" +
    "uniform float uTime;\n" +
    "uniform vec3 uEye;\n" +
    "uniform vec3 uSunDir;\n" +
    "uniform float uAmbient;\n" +
    "uniform int uLightCount;\n" +
    "uniform vec4 uLightPos[" + MAX_LIGHTS + "];\n" +
    "uniform vec3 uLightCol[" + MAX_LIGHTS + "];\n" +
    "uniform vec4 uFog;\n" +
    "uniform vec2 uFogRange;\n" +
    "#ifdef DAYNIGHT\n" +
    "uniform vec3 uAmbTint;\n" +
    "#endif\n" +
    "out vec4 outColor;\n" +
    "vec3 waveN(vec2 p, float t) {\n" + // analytic normal of 3 summed sines
    "  vec2 d = vec2(cos(p.x * 0.130 + t * 1.7) * 0.286, 0.0);\n" +
    "  d.y += cos(p.y * 0.087 + t * 1.3) * 0.226;\n" +
    "  vec2 dir = vec2(0.6, 0.8);\n" +
    "  d += dir * (cos(dot(p, dir) * 0.176 + t * 2.3) * 0.246);\n" +
    "  return normalize(vec3(-d.x, 1.0, -d.y));\n" +
    "}\n" +
    "void main() {\n" +
    "  vec3 n = waveN(vWorld.xz, uTime);\n" +
    "  vec3 refr = texture(uTex, vUV + n.xz * 5.0 / uChunkPx).rgb;\n" +
    "  vec2 suv = clamp(gl_FragCoord.xy / uScreen + n.xz * 0.02, 0.001, 0.999);\n" +
    "  vec3 refl = texture(uReflect, suv).rgb;\n" +
    "  vec3 V = normalize(uEye - vWorld);\n" +
    "  float fres = 0.08 + 0.55 * pow(1.0 - max(dot(V, n), 0.0), 3.0);\n" +
    "  vec3 rgb = mix(refr * vec3(0.78, 0.92, 1.0), refl, fres);\n" +
    "  rgb += vec3(0.5) * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 90.0);\n" + // sun glint
    "  float foam = vFoam * (0.55 + 0.45 * sin(uTime * 2.0 + (vWorld.x + vWorld.z) * 0.21));\n" +
    "  rgb = mix(rgb, vec3(0.92, 0.96, 1.0), clamp(foam, 0.0, 1.0) * 0.7);\n" +
    "  if (uAmbient >= 0.0) {\n" + // same forward lighting as the scene pass
    "    vec3 lit = vec3(uAmbient);\n" +
    "#ifdef DAYNIGHT\n" +
    "    lit *= uAmbTint;\n" +
    "#endif\n" +
    "    for (int i = 0; i < " + MAX_LIGHTS + "; i++) {\n" +
    "      if (i >= uLightCount) break;\n" +
    "      float f = max(0.0, 1.0 - distance(vWorld, uLightPos[i].xyz) / uLightPos[i].w);\n" +
    "      lit += f * f * uLightCol[i];\n" +
    "    }\n" +
    "    rgb *= lit;\n" +
    "  }\n" +
    "  if (uFog.a > 0.0) {\n" +
    "    float f = clamp((distance(vWorld, uEye) - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);\n" +
    "    rgb = mix(rgb, uFog.rgb, f);\n" +
    "  }\n" +
    "  outColor = vec4(rgb, 1.0);\n" +
    "}";

  // GPU weather particles (Stage E): stateless — every particle's position is
  // a pure function of its per-particle seeds and uTime, evaluated in the
  // vertex shader. No CPU simulation, no state, fully deterministic under the
  // frozen-clock goldens. One static buffer holds WEATHER_MAX quads; unused
  // particles collapse to a degenerate position.
  const WEATHER_VS =
    "layout(location=0) in vec3 aSeed;\n" +
    "layout(location=1) in vec2 aCorner;\n" +
    "layout(location=2) in float aId;\n" +
    "uniform mat4 uMVP;\n" +
    "uniform float uTime;\n" +
    "uniform vec4 uArea;\n" + // cx, cz, halfW, halfH (world px around the camera)
    "uniform float uWCount, uWMode;\n" + // 0 rain, 1 snow, 2 motes
    "out vec2 vUV; out float vA;\n" +
    "void main() {\n" +
    "  if (aId >= uWCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUV = vec2(0.0); vA = 0.0; return; }\n" +
    "  const float H = 380.0;\n" + // fall-column height, px
    "  vec3 p; vec2 sz; float a;\n" +
    "  float px = uArea.x + (aSeed.x * 2.0 - 1.0) * uArea.z;\n" +
    "  float pz = uArea.y + (fract(aSeed.x * 7.31 + aSeed.y * 3.7) * 2.0 - 1.0) * uArea.w;\n" +
    "  if (uWMode < 0.5) {\n" + // rain: fast fall, slight slant
    "    float y = H - mod(aSeed.y * H + uTime * (620.0 + aSeed.z * 260.0), H + 30.0);\n" +
    "    p = vec3(px + (H - y) * 0.12, y, pz);\n" +
    "    sz = vec2(1.4, 16.0); a = 0.38;\n" +
    "  } else if (uWMode < 1.5) {\n" + // snow: slow fall, sway
    "    float y = H - mod(aSeed.y * H + uTime * (42.0 + aSeed.z * 34.0), H + 12.0);\n" +
    "    p = vec3(px + sin(uTime * 0.9 + aSeed.z * 6.28) * 14.0, y, pz);\n" +
    "    sz = vec2(3.0, 3.0); a = 0.8;\n" +
    "  } else {\n" + // ambient motes: hovering drift + pulse
    "    float y = 16.0 + aSeed.y * 110.0 + sin(uTime * 0.5 + aSeed.z * 6.28) * 9.0;\n" +
    "    p = vec3(px + sin(uTime * 0.23 + aSeed.z * 12.6) * 22.0, y, pz + cos(uTime * 0.31 + aSeed.x * 9.4) * 18.0);\n" +
    "    sz = vec2(2.6, 2.6); a = 0.3 * (0.55 + 0.45 * sin(uTime * 1.7 + aSeed.z * 17.0));\n" +
    "  }\n" +
    "  vec3 world = p + vec3(aCorner.x * sz.x, aCorner.y * sz.y, 0.0);\n" +
    "  gl_Position = uMVP * vec4(world, 1.0);\n" +
    "  vUV = aCorner + 0.5; vA = a;\n" +
    "}";
  const WEATHER_FS =
    "precision mediump float;\n" +
    "in vec2 vUV; in float vA;\n" +
    // highp to match the vertex stage's default precision — strict linkers
    // (ANGLE D3D) reject a mediump/highp mismatch on a shared uniform.
    "uniform highp float uWMode;\n" +
    "out vec4 outColor;\n" +
    "void main() {\n" +
    "  float d; vec3 col;\n" +
    "  if (uWMode < 0.5) {\n" + // soft vertical streak
    "    d = (1.0 - abs(vUV.x - 0.5) * 2.0) * (1.0 - abs(vUV.y - 0.5) * 1.6);\n" +
    "    col = vec3(0.62, 0.72, 0.92);\n" +
    "  } else {\n" +
    "    float r = length(vUV - 0.5) * 2.0;\n" +
    "    d = clamp(1.0 - r, 0.0, 1.0);\n" +
    "    if (uWMode < 1.5) { col = vec3(0.96); d = smoothstep(0.0, 0.7, d); }\n" +
    "    else { col = vec3(1.0, 0.95, 0.7); d *= d; }\n" +
    "  }\n" +
    "  float alpha = clamp(d, 0.0, 1.0) * vA;\n" +
    "  outColor = vec4(col * alpha, alpha);\n" + // premultiplied
    "}";
  // Soft character drop shadows (Stage E): a radial-gradient blob under each
  // sprite, faded slightly by distance — cheap grounding when the real sun
  // shadows are off (and harmless alongside them).
  const DROP_FS =
    "precision mediump float;\n" +
    "in vec2 vUV; in float vFoam; in vec3 vWorld;\n" +
    "uniform sampler2D uTex;\n" +
    "out vec4 outColor;\n" +
    "void main() {\n" +
    "  float a = texture(uTex, vUV).a * 0.34;\n" +
    "  outColor = vec4(0.04 * a, 0.04 * a, 0.09 * a, a);\n" +
    "}";

  // Fullscreen triangle: same three clip-space vertices the classic
  // gl_VertexID trick produced — (-1,-1) (3,-1) (-1,3).
  const POST_VS =
    "layout(location=0) in vec2 aPos;\n" +
    "out vec2 vUV;\n" +
    "void main() {\n" +
    "  gl_Position = vec4(aPos, 0.0, 1.0);\n" +
    "  vUV = aPos * 0.5 + 0.5;\n" +
    "}";
  const BRIGHT_FS =
    "precision mediump float;\n" +
    "in vec2 vUV; uniform sampler2D uTex; uniform float uThreshold;\n" +
    "out vec4 outColor;\n" +
    "void main() {\n" +
    "  vec3 c = texture(uTex, vUV).rgb;\n" +
    "  outColor = vec4(max(c - uThreshold, 0.0) / (1.0 - min(uThreshold, 0.99)), 1.0);\n" +
    "}";
  const BLUR_FS =
    "precision mediump float;\n" +
    "in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;\n" +
    "out vec4 outColor;\n" +
    "void main() {\n" +
    "  const float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);\n" +
    "  vec3 c = texture(uTex, vUV).rgb * w[0];\n" +
    "  for (int i = 1; i < 5; i++) {\n" +
    "    c += texture(uTex, vUV + uDir * float(i)).rgb * w[i];\n" +
    "    c += texture(uTex, vUV - uDir * float(i)).rgb * w[i];\n" +
    "  }\n" +
    "  outColor = vec4(c, 1.0);\n" +
    "}";
  // Stage D extensions (SSAO multiply, ACES, color grade, vignette) are all
  // behind runtime `if` gates on uniforms that default to off, so a map using
  // only the classic bloom/DoF still composites bit-identically — the Stage A
  // post-stack golden holds.
  const COMP_FS =
    "precision highp float;\n" +
    "in vec2 vUV;\n" +
    "uniform sampler2D uScene, uBlurScene, uBlurBright, uDepth, uAO;\n" +
    "uniform float uBloom, uDof, uFocusDist, uFocusRange;\n" +
    "uniform vec2 uNearFar;\n" +
    "uniform float uSsao, uAces, uVignette, uGradeOn;\n" +
    "uniform mat3 uGradeM;\n" +
    "uniform vec3 uGradeB;\n" +
    "out vec4 outColor;\n" +
    "vec3 aces(vec3 x) {\n" + // Narkowicz ACES filmic fit
    "  return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);\n" +
    "}\n" +
    "void main() {\n" +
    "  vec3 col = texture(uScene, vUV).rgb;\n" +
    "  if (uDof > 0.0) {\n" +
    "    float d = texture(uDepth, vUV).r * 2.0 - 1.0;\n" +
    "    float z = 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - d * (uNearFar.y - uNearFar.x));\n" +
    "    float coc = clamp((abs(z - uFocusDist) - " + (TILE * 3).toFixed(1) + ") / uFocusRange, 0.0, 1.0) * uDof;\n" +
    "    col = mix(col, texture(uBlurScene, vUV).rgb, coc);\n" +
    "  }\n" +
    "  if (uSsao > 0.0) col *= mix(1.0, texture(uAO, vUV).r, uSsao);\n" +
    "  if (uBloom > 0.0) col += texture(uBlurBright, vUV).rgb * uBloom;\n" +
    "  if (uAces > 0.5) col = aces(col * 1.25);\n" + // slight exposure lift into the shoulder
    "  if (uGradeOn > 0.5) col = clamp(uGradeM * col + uGradeB, 0.0, 1.0);\n" +
    "  if (uVignette > 0.0) {\n" +
    "    vec2 q = vUV - 0.5;\n" +
    "    col *= 1.0 - uVignette * smoothstep(0.15, 0.5, dot(q, q));\n" +
    "  }\n" +
    "  outColor = vec4(col, 1.0);\n" +
    "}";
  // Depth-derived ambient occlusion at half res (Stage D): fixed spiral taps
  // (no per-pixel noise — determinism), world-space depth deltas, blurred by
  // the shared Gaussian before the composite multiplies it in.
  const AO_FS =
    "precision highp float;\n" +
    "in vec2 vUV;\n" +
    "uniform sampler2D uDepth;\n" +
    "uniform vec2 uNearFar;\n" +
    "uniform vec2 uInvSize;\n" + // 1 / half-res target size
    "uniform float uProjScale;\n" + // (h/2)/tan(fov/2): world px -> screen px at z=1
    "out vec4 outColor;\n" +
    "float lin(float s) {\n" +
    "  float d = s * 2.0 - 1.0;\n" +
    "  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - d * (uNearFar.y - uNearFar.x));\n" +
    "}\n" +
    "void main() {\n" +
    "  float z0 = lin(texture(uDepth, vUV).r);\n" +
    "  float rp = clamp(30.0 * uProjScale / z0 * 0.5, 2.0, 24.0);\n" + // ~30 world px
    "  const vec2 taps[8] = vec2[](\n" +
    "    vec2(1.0, 0.0), vec2(0.5257, 0.8507), vec2(-0.4045, 0.6545), vec2(-0.9511, -0.3090),\n" +
    "    vec2(-0.2245, -0.6909), vec2(0.4635, -0.6373), vec2(0.7290, 0.2367), vec2(-0.0784, 0.2412));\n" +
    "  float occ = 0.0;\n" +
    "  for (int i = 0; i < 8; i++) {\n" +
    "    float zi = lin(texture(uDepth, vUV + taps[i] * rp * uInvSize).r);\n" +
    "    float d = z0 - zi;\n" + // occluder in front of us -> positive
    "    occ += clamp(d / 24.0, 0.0, 1.0) * clamp(1.0 - d / 260.0, 0.0, 1.0);\n" +
    "  }\n" +
    "  outColor = vec4(vec3(1.0 - occ / 8.0 * 0.9), 1.0);\n" +
    "}";
  // Compact luma FXAA (Stage D, the classic diagonal-tap variant): edge-
  // blended final resolve when map.hd2d.fxaa.
  const FXAA_FS =
    "precision highp float;\n" +
    "in vec2 vUV;\n" +
    "uniform sampler2D uTex;\n" +
    "uniform vec2 uInvSize;\n" +
    "out vec4 outColor;\n" +
    "float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }\n" +
    "void main() {\n" +
    "  vec3 cM = texture(uTex, vUV).rgb;\n" +
    "  float lM = luma(cM);\n" +
    "  float lNW = luma(texture(uTex, vUV + vec2(-1.0, -1.0) * uInvSize).rgb);\n" +
    "  float lNE = luma(texture(uTex, vUV + vec2(1.0, -1.0) * uInvSize).rgb);\n" +
    "  float lSW = luma(texture(uTex, vUV + vec2(-1.0, 1.0) * uInvSize).rgb);\n" +
    "  float lSE = luma(texture(uTex, vUV + vec2(1.0, 1.0) * uInvSize).rgb);\n" +
    "  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));\n" +
    "  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));\n" +
    "  if (lMax - lMin < max(0.0312, lMax * 0.125)) { outColor = vec4(cM, 1.0); return; }\n" +
    "  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));\n" +
    "  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);\n" +
    "  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);\n" +
    "  dir = clamp(dir * rcpDirMin, -8.0, 8.0) * uInvSize;\n" +
    "  vec3 a = 0.5 * (texture(uTex, vUV + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, vUV + dir * (2.0 / 3.0 - 0.5)).rgb);\n" +
    "  vec3 b = a * 0.5 + 0.25 * (texture(uTex, vUV + dir * -0.5).rgb + texture(uTex, vUV + dir * 0.5).rgb);\n" +
    "  float lB = luma(b);\n" +
    "  outColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);\n" +
    "}";
  return { SCENE_VS, SCENE_FS, DEPTH_VS, DEPTH_FS, WATER_VS, WATER_FS, WEATHER_VS, WEATHER_FS, DROP_FS, POST_VS, BRIGHT_FS, BLUR_FS, COMP_FS, AO_FS, FXAA_FS };
}
