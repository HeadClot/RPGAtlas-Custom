# RPGAtlas AI Contribution Memory

## Three.js Skill References

Use the installed global Three.js skills below when the corresponding area is in scope. Do not use
WebGPU-based skills or WebGPU APIs for this project.

- `threejs-fundamentals` — scene setup, cameras, renderers, and the core Three.js workflow.
  `C:\Users\Ben Stanley\.agents\skills\threejs-fundamentals\SKILL.md`
- `threejs-animation` — keyframe animation, mixers, clips, and animation playback.
  `C:\Users\Ben Stanley\.agents\skills\threejs-animation\SKILL.md`
- `threejs-geometry` — geometry creation, attributes, buffers, and procedural meshes.
  `C:\Users\Ben Stanley\.agents\skills\threejs-geometry\SKILL.md`
- `threejs-interaction` — raycasting, pointer input, selection, and object interaction.
  `C:\Users\Ben Stanley\.agents\skills\threejs-interaction\SKILL.md`
- `threejs-lighting` — light types, shadows, lighting setup, and environment illumination.
  `C:\Users\Ben Stanley\.agents\skills\threejs-lighting\SKILL.md`
- `threejs-loaders` — GLTF, textures, models, assets, and loading workflows.
  `C:\Users\Ben Stanley\.agents\skills\threejs-loaders\SKILL.md`
- `threejs-materials` — PBR, basic, phong, standard, physical, and custom materials.
  `C:\Users\Ben Stanley\.agents\skills\threejs-materials\SKILL.md`
- `threejs-postprocessing` — EffectComposer, render passes, and screen-space effects.
  `C:\Users\Ben Stanley\.agents\skills\threejs-postprocessing\SKILL.md`
- `threejs-shaders` — GLSL, ShaderMaterial, uniforms, varyings, and custom shader effects.
  `C:\Users\Ben Stanley\.agents\skills\threejs-shaders\SKILL.md`
- `threejs-textures` — texture types, UVs, wrapping, filtering, color spaces, and maps.
  `C:\Users\Ben Stanley\.agents\skills\threejs-textures\SKILL.md`

## Patch Notes Requirement

Every AI-assisted feature addition or substantial project change must include a short, descriptive
entry in `js/patch-notes.js`.

- Prepend the new entry to the top of the `PATCH_NOTES` array so the newest update appears first.
- Never overwrite, remove, reorder, or summarize away previous patch notes.
- Include the date, a concise title, a one-sentence summary, and a short list of notable user-facing
  additions or changes.
- Keep entries easily digestible. Name new commands, buttons, tools, or major behaviors explicitly.
- Small bug fixes, formatting-only edits, and internal maintenance do not require an entry unless
  they materially affect users.
