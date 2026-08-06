# RPGAtlas Wiki (source)

This folder holds the RPGAtlas beginner-first user manual as plain Markdown, written to GitHub Wiki
conventions. It is the canonical source for creator-facing help. Keeping it in the repo means the
instructions are versioned and reviewable alongside the program; from here they can be published as
the project's **GitHub Wiki** or rendered as the committed static docs site.

## Pages

| File | Page |
|---|---|
| `Home.md` | Landing page |
| `_Sidebar.md` | Navigation (shown on every wiki page) |
| `_Footer.md` | Footer (shown on every wiki page) |
| `Installation-and-Setup.md` | Getting RPGAtlas running |
| `Your-First-Game.md` | The flagship 30-minute tutorial |
| `Making-a-Platformer.md` | A first platformer tutorial |
| `The-Editor-Interface.md` | Menus, tools, modes, shortcuts |
| `Maps-and-Tiles.md` | Layers, passability, shadows, HD-2D |
| `Events.md` | Pages, triggers, full command reference, recipes |
| `Dialogue-and-Cutscenes.md` | Reusable conversation trees, voice cues, conditions, localization, preview |
| `The-Database.md` | Every database tab explained |
| `Battles-and-States.md` | Turn-based combat, enemies, troops, formulas, and states |
| `Action-Combat.md` | Real-time attack profiles, field enemies, and multiplayer combat |
| `Characters-and-Custom-Assets.md` | Character Generator, custom art |
| `Visual-UI-and-HUD-Designer.md` | Visual HUD and message-window layout |
| `Audio.md` | Procedural music & SFX |
| `Message-Text-Codes.md` | Icons, colors, variables in dialogue |
| `Plugins.md` | Extending the engine with JavaScript |
| `Publishing-Your-Game.md` | Exporting EXE/HTML and distribution |
| `Troubleshooting-and-FAQ.md` | Common fixes and FAQ |
| `Resources-and-Glossary.md` | Glossary, primers, licensing, links |

Links between pages use the page name without `.md` (e.g. `[Events](Events)`), which is what GitHub
Wiki expects. Use the exact menu, button, and mode names shown in the editor so readers can follow
the instructions without knowing the file layout.

## Writing rules

- Write for a first-time creator who has never used an RPG maker.
- Explain what a feature is before listing its controls.
- Prefer numbered steps for tasks and short tables for comparisons.
- Explain specialist words the first time they appear; link to the glossary when useful.
- Keep programming, server, and source-checkout instructions in clearly marked optional sections.
- End practical pages with a playtest check and a link to the next useful page.
- Update the wiki source, then regenerate `docs-site/`; never edit generated HTML by hand.

The committed `docs-site/` mirror is generated from these Markdown files with `npm run docs:build`.

## Publishing to the GitHub Wiki

A repository's wiki is its own git repo at `<repo>.wiki.git`. To publish these pages:

1. **Enable the Wiki** for the repo on GitHub (Settings ▸ Features ▸ Wikis) and create the first page
   in the web UI once, so the wiki repo exists.
2. Clone it and copy these files in:

   ```sh
   git clone https://github.com/DriftwoodGaming/RPGAtlas.wiki.git
   cp path/to/RPGAtlas/wiki/*.md RPGAtlas.wiki/
   cd RPGAtlas.wiki
   git add .
   git commit -m "Add RPGAtlas user manual"
   git push
   ```

3. Visit `https://github.com/DriftwoodGaming/RPGAtlas/wiki` — the manual is live, with the sidebar and
   footer applied automatically.

To update later, edit the Markdown here, recopy, and push again (or edit on the wiki and copy back).

## Alternative: host as a static site

The same Markdown works with zero-build doc tools if you'd rather have a standalone site:

- **Docsify** or **MkDocs** can serve this folder. (They expect a lowercase `_sidebar.md` and an
  `index.html`/config; rename/adjust as needed.)
- Or drop the files into a `docs/` folder and enable **GitHub Pages**.

The content doesn't change — only the wrapper does. Ask if you'd like this converted to a specific
site generator.
