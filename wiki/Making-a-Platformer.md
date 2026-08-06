# Making a Platformer

RPGAtlas can make a side-on platformer as well as a classic grid-based RPG. Platformer mode gives
the player continuous running, jumping, falling, solid floors, one-way platforms, hazards,
checkpoints, and goals. You still use the familiar map editor, event editor, Database, playtest,
and export tools.

> **Important:** Platformer mode is a project-wide choice. In this release it uses the classic
> Canvas presentation, so HD-2D and Beacon multiplayer are unavailable for platformer projects.
> Existing RPG projects are not changed unless you select Platformer as their game mode.

## What you will build

This tutorial makes a small platformer with a starting floor, a raised platform, a hazard, a
checkpoint, and a goal. It is designed to take about 20 minutes.

## 1. Create a platformer project

1. Choose **File ▸ New Project**.
2. Select the **Platformer** starter template if it is offered. The template includes a playable
   starting floor and platformer controls.
3. If you started with a blank project, open **Tools ▸ Database… ▸ System**.
4. Set **Game mode** to **Platformer (side-on movement)**.
5. Set the game title and confirm that the start position is somewhere above a floor.

The player now moves freely from side to side instead of stepping from tile to tile. Hold the
movement controls to run. Press the action assigned to **Jump**; the default keyboard binding is
**Space**.

## 2. Paint the level

1. Open a map and switch to **Map mode**.
2. Paint a long floor with tiles that look solid.
3. Add a few raised platforms with empty space below them.
4. Add walls or scenery on the upper and lower layers as decoration.
5. Press **Playtest** and check that the player starts above a floor and can reach every platform.

Platformer collision starts by reading the walkable or blocked nature of the tiles. This is a
useful starting point, but you should paint explicit collision anywhere the visual art does not
match the gameplay surface.

## 3. Paint collision

1. Choose **Mode ▸ Platformer Collision Mode**.
2. Click a tile to cycle through **Auto**, **Solid**, **Empty**, and **One-way**.
3. Use **Solid** for floors, walls, and ceilings.
4. Use **One-way** for a platform the player can jump up through and land on from above.
5. Use **Empty** for decorative tiles that should never stop the player.
6. Playtest after each group of changes. Walk into walls, land on platforms, and try jumping up
   through one-way platforms.

When you hold down while standing on a one-way platform, the player briefly drops through it. This
is useful for multi-level stages without adding a separate ladder system.

## 4. Add a hazard

Hazards are events that react when the player touches them.

1. Switch to **Event mode** and double-click the tile where the hazard should be.
2. Give the event a graphic, such as spikes, fire, or an invisible damage area.
3. In the event page, set **Platformer role** to **Hazard**.
4. Add the commands that should happen when the player touches it. A simple first hazard can use
   **Game Over**, or you can use a defeat command that sends the player back to a checkpoint.
5. Playtest by touching the hazard and confirm that the intended result happens only once per
   contact.

The event's normal command list is reused for the hazard. This means you can add a message, sound,
screen flash, switch, or other event action before the player is defeated.

## 5. Add a checkpoint

1. Create or open an event at the place where the player should respawn.
2. Give it a visible flag, crystal, sign, or other graphic.
3. Set **Platformer role** to **Checkpoint**.
4. Turn on **Save on checkpoint** if reaching it should also create a save.
5. Playtest by touching the checkpoint, then touch a hazard. The player should return to the
   checkpoint instead of the original start position.

Checkpoints are local to the current map. If the player reaches a checkpoint on a different map,
the new map becomes the checkpoint location.

## 6. Add a goal

1. Create an event at the end of the level.
2. Give it a flag, doorway, treasure, or other goal graphic.
3. Set **Platformer role** to **Goal**.
4. Add commands for the ending: show a message, turn on a victory switch, transfer to a results
   map, or return to the title screen.
5. Playtest from a fresh start and reach the goal without using editor-only shortcuts.

Goals are ordinary events with a special touch condition, so you can make a short level or a full
story ending with the same tools.

## 7. Connect levels

You can build a platformer as several touching maps.

1. Create a second map and paint its first floor so it lines up with the edge of the first map.
2. Open **View ▸ Map Connections**.
3. Drag the map cards until their borders touch at the intended seam.
4. Check the map's collision near the seam. The destination side must contain a usable floor or
   landing space.
5. Playtest by running, jumping, or falling across the edge.

Connected platformer maps keep the player's movement speed and momentum while crossing. A gap,
overlap, or blocked destination prevents the crossing, so use the connection view to diagnose the
layout before adding more decoration.

## 8. Tune the feel

In **Database ▸ System**, the Platformer settings control the overall movement feel:

| Setting | What it changes |
|---|---|
| **Run speed** | How quickly the player reaches top speed. |
| **Gravity** | How quickly the player falls. |
| **Jump speed** | How high and fast a jump begins. |
| **Jump cut** | How much releasing Jump early shortens the jump. |
| **Coyote frames** | How long a jump still works after walking off an edge. |
| **Jump buffer frames** | How early a jump press can be remembered before landing. |
| **Respawn invulnerability** | How long the player cannot be hurt after respawning. |

For a first level, leave the defaults in place. Make the level easier by lowering gravity, adding
more coyote time, widening platforms, or placing checkpoints before difficult jumps.

## 9. Playtest checklist

Start from a fresh playtest and verify:

- The player appears on a floor and cannot fall through it.
- Walls stop the player without trapping them inside scenery.
- One-way platforms can be jumped through and landed on.
- A short jump and a held jump both feel intentional.
- Hazards return the player to the correct checkpoint.
- Checkpoints save only when you intended them to.
- The goal works after restarting the level.
- Connected maps have no gaps, invisible walls, or unreachable landing tiles.

## Common problems

- **The player falls through the floor:** select the floor in Platformer Collision Mode and make it
  **Solid**.
- **A decorative wall blocks movement:** make its collision **Empty**, or move the decoration to a
  layer that is not being used as the gameplay surface.
- **A platform cannot be jumped through:** change it from **Solid** to **One-way**.
- **The hazard triggers repeatedly:** add a short wait, erase the event after use, or use a switch
  and a second page to control what happens after contact.
- **A map connection does not work:** check that the maps touch exactly, the destination side is
  placed, and the landing area is not solid.
- **The game still behaves like an RPG:** return to **Database ▸ System** and confirm that **Game
  mode** is set to **Platformer (side-on movement)**.

When the level is enjoyable from start to goal, use [Publishing Your Game](Publishing-Your-Game) to
export it. Platformer projects follow the same export steps as RPG projects.

**Next:** [The Editor Interface →](The-Editor-Interface)
