# Custom Assets

Copy image files into these shared engine folders, then reload the editor:

- `characters/` - walking sprite sheets
- `facesets/` - actor portraits
- `enemies/` - battle images
- `tilesets/` - individual map tiles
- `system/` - shared engine UI graphics such as `icon_set.png`

Projects store references to these files rather than copying the images. Standalone exports embed only
the custom images referenced by the project.

The editor automatically scans these folders when RPGAtlas is run with the documented
`python -m http.server` workflow. On a web host that disables folder listings, run
`tools/update-assets.ps1` after changing the folders to generate `img/assets.json`.

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
