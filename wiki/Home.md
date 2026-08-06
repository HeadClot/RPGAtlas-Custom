# RPGAtlas User Guide

<p align="center"><i>Chart your world. Tell your story.</i></p>

RPGAtlas is a game-making program for building 2D role-playing games and side-on platformers.
You create maps, place characters, write conversations, design battles, and press **▶ Playtest**
to try the result. You do not need to know how to program to make a complete game.

This manual is written for first-time creators. Read it from the top if you are new, or use the
sidebar to jump to a feature you are ready to use.

## The short version

Most RPGAtlas projects follow this loop:

1. **Start a project** and choose a game title.
2. **Paint a map** with the tile palette.
3. **Place events** for people, doors, treasure, dialogue, and battles.
4. **Set up the Database** for actors, items, skills, enemies, and system rules.
5. **Playtest often** and fix one small problem at a time.
6. **Export the game** when someone else can play it from beginning to end.

You can make a small game with only one map, one character, and a few events. Start small; a
finished five-minute game teaches more than an unfinished epic.

## Start here

1. **[Installation & Setup](Installation-and-Setup)** — open RPGAtlas and understand where your
   project is saved.
2. **[Make Your First Game](Your-First-Game)** — build a town, villager, chest, cave, and battle
   in one guided tutorial.
3. **[The Editor Interface](The-Editor-Interface)** — learn where the tools are and how to undo,
   zoom, and playtest.
4. **[Maps & Tiles](Maps-and-Tiles)** — make places the player can explore.
5. **[Events](Events)** — make those places respond to the player.
6. **[The Database](The-Database)** — customize the people, items, enemies, and rules.
7. **[Publishing Your Game](Publishing-Your-Game)** — package a finished project for other people.

## Choose a project type

### Classic RPG

Use the default RPG mode for exploration, dialogue, quests, shops, turn-based battles, and
optional real-time Action Combat. Follow [Make Your First Game](Your-First-Game) first.

### Side-on platformer

Platformer mode uses RPGAtlas maps and events for running, jumping, hazards, checkpoints, and
goals. Start with [Making a Platformer](Making-a-Platformer). Existing RPG projects stay RPG
projects unless you deliberately change the game mode.

## Build your game

- **[Maps & Tiles](Maps-and-Tiles)** — painting, layers, walkable areas, shadows, connected maps,
  encounters, and optional HD-2D presentation.
- **[Advanced Map Editor](Advanced-Map-Editor)** — extra layers, terrain brushes, stamps, zones,
  and automatic detailing.
- **[Events](Events)** — the building blocks for dialogue, doors, chests, shops, quests,
  cutscenes, transfers, and battles.
- **[Dialogue & Cutscenes](Dialogue-and-Cutscenes)** — reusable conversations and branching choices.
- **[The Database](The-Database)** — actors, classes, skills, items, equipment, enemies, troops,
  states, switches, variables, and system settings.
- **[Battles & States](Battles-and-States)** — turn-based battle views, battle timing, enemies,
  status effects, and balance advice.
- **[Action Combat](Action-Combat)** — optional real-time attacks, hotbars, telegraphs, enemy
  abilities, knockback, and defeat behavior.
- **[Characters & Custom Assets](Characters-and-Custom-Assets)** — generated characters,
  portraits, tiles, enemies, and your own art.
- **[The Asset Browser](The-Asset-Browser)** and **[Audio](Audio)** — import and organize pictures,
  music, ambience, and sound effects.
- **[Visual UI and HUD Designer](Visual-UI-and-HUD-Designer)** — customize gauges, text, minimaps,
  menus, and message windows.
- **[Generators](Generators)** — create names, items, enemies, locations, quests, and story ideas.

## Optional features

- **[Making Your Game Multiplayer](Making-Your-Game-Multiplayer)** — let friends join with a room
  code. Multiplayer is off until you enable it.
- **[Online Safety](Online-Safety)** — a plain-language guide for parents, teachers, and creators.
- **[Coming from RPG Maker](Coming-from-RPG-Maker)** — import an MV or MZ project.
- **[Message Text Codes](Message-Text-Codes)** — add icons, colors, variables, and formatting.
- **[Plugins](Plugins)** and **[Plugin & Script API](Plugin-and-Script-API)** — optional advanced
  extensions for creators who want to customize behavior with code.
- **[Hosting a World](Hosting-a-World)** — optional advanced instructions for running your own
  multiplayer server.

## When something goes wrong

Use **[Troubleshooting & FAQ](Troubleshooting-and-FAQ)** for startup, saving, map, event, battle,
performance, and publishing problems. The most useful habit is to playtest after every small
change. If a feature stops working, undo the last change or check the event's page conditions.

## A few words you will see often

- A **map** is a place in your game.
- An **event** is something that happens when the player interacts with a map.
- A **page** is one version of an event, used when a condition is true.
- A **switch** is an on/off story flag, such as `BridgeRepaired`.
- A **variable** is a number your game remembers, such as a quest counter.
- A **self-switch** belongs to one event, which makes it useful for chests and doors.
- The **Database** is where you define reusable game content such as actors, items, skills, and
  enemies.

## The important promise

Your maps, story, characters, and game content belong to you. RPGAtlas can work offline for
single-player creation, and exported games contain the runtime and the assets they use. See
[Resources & Glossary](Resources-and-Glossary) for plain-language licensing information.

**Next:** [Installation & Setup →](Installation-and-Setup)
