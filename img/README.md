# Custom Assets

There are two asset locations:

- In the **desktop app**, put project assets in the game's visible `assets/` folder. Files stay in
  place and are discovered on project open/focus or with **Tools ▸ Asset Browser ▸ Scan**.
- In a **source checkout**, the shared `img/` folders below are the engine library used by the
  bundled samples and projects that reference shared assets.

Copy image files into the appropriate shared engine folder, then reload the editor:

- `characters/` - walking sprite sheets
- `facesets/` - actor portraits
- `enemies/` - battle images
- `tilesets/` - individual map tiles
- `system/` - shared engine UI graphics such as `icon_set.png`

Projects store references to these files rather than copying the images. Standalone exports embed only
the custom images referenced by the project.

The editor scans these folders when RPGAtlas is served by the launcher or a directory-listing static
server such as `python -m http.server`. Vite does not expose directory listings; after changing
shared `img/` files in a source checkout, run `tools/update-assets.ps1` to generate `img/assets.json`.
Project-folder assets are indexed through the desktop asset store and do not need this shared manifest.

## Characters

Use PNG, WebP, JPG, or JPEG sprite sheets. Each sheet must contain:

- 3 columns: walk left, idle, walk right
- 4 rows: down, left, right, up

The recommended size is 144x192 pixels, making each frame 48x48. Other sizes are scaled automatically.
The filename becomes the asset name.

## Facesets

Faces are scaled to 48x48. Give the face image the same base filename as its character sheet:

```text
characters/mira.png
facesets/mira.png
```

## Enemies

Enemy images may use any dimensions and are scaled proportionally in battle. Transparent PNG or WebP
files work best.

## Tilesets

Each file is one tile and is scaled to 48x48.

- `stone.png` - blocked decoration tile
- `bridge.pass.png` - passable decoration tile
- `meadow.terrain.png` - passable terrain tile for Auto Layer

Do not rename or delete a custom tile after painting it onto maps unless you also replace its usages.
Projects store stable asset references rather than copying source images. Standalone exports embed
only referenced assets; keep the source files available when reopening or re-exporting a project.
