# Action Combat

Action Combat adds optional real-time, map-based encounters to the normal turn-based battle system.
Players face a direction, press the remappable **Attack** action, or choose an action from the
hotbar, then resolve short attack phases with telegraphs, active hit frames, recovery, hitboxes,
damage, stagger, and knockback. It works in solo play and in server-authoritative Beacon
rooms/worlds. Existing turn-based behavior remains unchanged when a Skill, Item, or State has no
enabled Action Combat profile.

## Start with one simple enemy

Action Combat has many settings, but you can learn it in a small slice:

1. Enable Action Combat in **Database ▸ System**.
2. Keep one hotbar slot and use the default Attack control.
3. Create one Attack Profile with a short wind-up, a small hitbox, and a generous recovery time.
4. Give one enemy event that profile and place it in a small empty arena.
5. Playtest until the player can clearly see when the enemy is preparing, attacking, recovering,
   and defeated.
6. Add Skills, Items, States, and enemy abilities one at a time. If several things change at once,
   it becomes difficult to tell which setting caused a problem.

## Configure the action layer

Action Combat is configured in layers so a project can start with simple enemy contact attacks and
add abilities only where they are needed:

1. Open **Database ▸ System ▸ Action Combat**. Enable the system, choose the hotbar size (up to
   eight slots), decide whether MP/TP and map item use are available, select the default targeting
   mode, and choose whether opening a menu pauses combat.
2. Open **Database ▸ System ▸ Controls** and assign **Combat slot 1** through **Combat slot 8**.
   Fresh projects use number keys 1–8; every slot is remappable for keyboard and gamepad layouts.
3. Use **Map Properties ▸ Action Combat** for a map-specific override of enablement, hotbar size,
   resource display, item use, targeting, or menu pause behavior. A map override wins over the
   System setting for that map.
4. Author the records used by the hotbar and enemies: Skills and Items receive optional real-time
   profiles, States receive frame-based effects, and Actors/Classes receive hotbar and resource
   defaults.

The map must have Action Combat enabled before hotbar inputs or enemy abilities can start. A
turn-based battle can still use the same Skill, Item, and State records without enabling the map
layer.

The quickest path is to create one profile, configure one enemy, place one event, and playtest it
before building a larger encounter.

## Build a first encounter

1. Open **Tools ▸ Database…** (`F1`) and choose **Attack Profiles**.
2. Add a profile named `Sword slash`. Start with the defaults: a short wind-up, active frames,
   recovery, range 1, one tile of knockback, and a small stagger duration.
3. Choose optional Attack, Hit, Hurt, Defeat, and Revive VFX and SFX. The timeline preview shows
   the profile at 60 frames per second; the directional preview shows the four cardinal hitboxes.
4. Open **Enemies**, select an enemy, and open its **Action Combat** tab. Set its HP, AI, touch
   damage, attack timing, range, knockback, stagger, invulnerability, respawn, and defeat behavior.
   Add weighted ability rows when the enemy should telegraph an action-enabled Skill instead of
   using only its basic contact attack.
5. Open a map, switch to **Event Mode**, and create an event on a walkable tile.
6. On the event page, expand **Action Combat**, turn **Enabled** on, choose the enemy, and decide
   whether the page inherits the enemy defaults. Page values override the database defaults.
7. Choose a **Defeat Self-Switch** if the event should reveal a chest, open a path, or switch to a
   defeated page. Use **Persistent Defeat** when it should remain defeated after map reloads.
8. Press **Playtest** (`F5`). Face the enemy and press the configured Attack action. Confirm that
   the telegraph, hit, knockback, stagger, defeat, and respawn behavior feel fair.

## Attack Profiles

An Attack Profile is reusable timing and presentation data. Its main values are:

| Setting | Meaning |
|---|---|
| **Damage / Damage scale** | Base damage and the attacker's resolved stat multiplier. |
| **Wind-up / telegraph** | Frames before the hit becomes active. |
| **Active frames** | Frames during which the hitbox can damage targets. |
| **Recovery** | Frames before the attacker can act normally again. |
| **Cooldown** | Minimum time between attacks. |
| **Range** | Maximum attack distance in tiles. |
| **Hitbox** | Directional, adjacent, or radius geometry. |
| **Knockback tiles** | Distance a valid target is pushed when the landing tile is open. |
| **Stagger frames** | How long the target is interrupted after being hit. |
| **VFX/SFX** | Presentation references for attack, telegraph, hit, hurt, defeat, and revive. |

Actors, weapons, armor, enemies, and event pages can reference a profile. This lets a project
reuse the same sword behavior while giving a particular actor or enemy different stats and
presentation.

### Inheritance and overrides

The effective value is resolved in this order:

`Attack Profile → actor/weapon/armor/enemy database defaults → event-page override`

Only authored page values override a database value when **Inherit enemy/profile defaults** is on.
The editor keeps seeded legacy page values as compatibility defaults and treats an empty page field
as an explicit blank where the field supports it. **Reset page overrides** removes the sparse keys so
the inherited value is visible again. Pages with `inheritDefaults` off continue to use their authored
legacy values without being filled from database defaults.

Actors expose damage, scaling, timing, cooldown, range, hitbox, knockback, stagger, defensive timing,
revive behavior, and the complete attack/hurt/defeat/revive presentation contract. Weapons can supply
attack profile, damage, timing, range, hitbox, knockback, stagger, and attack presentation overrides;
armor supplies invulnerability, stagger resistance, revive, hurt, and revive presentation overrides.
Enemy defaults and pages expose the same enemy attack contract, including telegraph, hurt, defeat, and
revive effects.

The database and event tabs show a resolved-value summary and compact validation feedback. The
**Inspect** command remains the detailed diagnostic view for missing profile, animation, sound, and
equipment references.

### Hitbox shapes

All hosts use the same 60 Hz shared hit test:

- **Directional** preserves the original sword collider at range 1 and extends it along the facing
  direction for larger ranges.
- **Adjacent** covers the four cardinal neighboring tiles, regardless of facing.
- **Radius** covers a Manhattan diamond centered on the attacker, excluding the attacker's own tile.

An entity is damaged at most once per attack. Diagonal facing remains supported for legacy movement,
but the default authored attack remains cardinal directional behavior.

## Action skills, items, and hotbars

Skills and Items can opt into map combat from their own **Action Combat** subtab. Leave **Enabled**
off to keep the record turn-based/menu-only. When enabled, the profile can define:

| Setting | Meaning |
|---|---|
| **Target mode** | Facing target, nearest/all enemy, nearest/all ally, self, or radius selection. |
| **Timing** | Wind-up/telegraph, active hit, recovery, and cooldown in 60 Hz frames. |
| **Hitbox / range** | Directional, adjacent, or radius grid geometry and its tile range. |
| **MP / TP cost** | Resources required before the action starts. Costs must be non-negative and available. |
| **Damage / formula** | Flat damage, damage scale, or an optional formula for the action effect. |
| **Knockback / stagger** | Tile displacement and interruption applied on a successful hit. |
| **State effect** | A State to add or remove and its application chance. |
| **Presentation** | Attack, telegraph, hit, hurt, defeat, and revive animation/SFX references. |
| **Item consumption** | Whether an Item is consumed when the action starts. Items also require map item use to be allowed. |

Put Skills and Items into **Actors ▸ Action Combat hotbar** or **Classes ▸ Action Combat hotbar**.
Actor entries override class defaults. Class **Allowed skill IDs** limits which Skills can be used by
that class, while an actor's learned skills still need to include a hotbar Skill. Empty slots are
safe and are ignored at runtime. Duplicate or unavailable entries are reported by **Inspect**.

The shared resolver checks the record kind and ID, map/system rules, learned/allowed Skills,
resources, inventory, target mode, and cooldown before starting an action. The same validation is
used by solo play, Node Beacon, and Cloudflare runtimes.

## Real-time States

Open **Database ▸ States ▸ Action Combat** to add optional map-time behavior without changing the
existing turn-based state rules. Configure duration and tick interval in frames, stacking policy
(**Refresh duration**, **Replace**, or **Stack**), maximum stacks, and damage per tick. States can
also modify movement, attack, and stagger rates or apply **Root**, **Silence**, **Invulnerable**,
and resistance behavior.

State effects are stored in combat snapshots with their remaining frames and stacks. A State with
no enabled Action Combat profile continues to use its existing turn duration and battle behavior.

## Enemy behavior

An enemy's **Action Combat** defaults can be inherited by event pages or overridden per page.

- **None** leaves the event's normal movement in charge.
- **Chase player** closes distance while the target is within the event's configured leash.
- **Touch damage** lets contact hurt the player without a separate attack animation.
- **Ability list** lets an enemy select weighted, action-enabled Skills with optional cooldowns,
  target modes, and conditions such as HP percentage, distance, a State, or a switch. The first
  eligible row wins after weighted selection; if no row is eligible, the configured basic contact
  attack remains the fallback.
- **Invulnerability** prevents repeated hits from dealing damage every frame.
- **Respawn** sets a delay in frames; zero means no automatic respawn.
- **Player defeat behavior** can return the player to a checkpoint, respawn in place, or trigger
  game over according to the actor/player combat settings.
- A defeat self-switch or **Persistent Defeat** flag can turn a defeated event into a permanent world
  change. Persistent Defeat takes precedence over respawn; defeat switches still activate when one is
  configured.

Keep the first enemy readable: use a visible telegraph, modest chase range, and enough recovery
time for the player to dodge or counterattack.

## Multiplayer and persistence

Beacon is authoritative for online action combat. Clients send input intents; the server validates
the attack profile, loadout, collision, timing, damage, stagger, knockback, defeat, revive, and
respawn outcomes. Snapshots and combat events update remote HP, damage text, telegraphs, sounds,
and defeat effects.

Node Beacon friend rooms run the full engine by default, so parties and shared battles work without
extra flags. Use `--no-engine-rooms` only when you specifically want lighter walk/emote/chat rooms.
Persistent worlds use `--engine-events` for authored server-side NPCs, events, and cutscenes.
Cloudflare Durable Object rooms/worlds use the same shared combat runtime.

Action-combat state is included in supported saves and server snapshots: live HP, MP/TP resources,
cooldowns, active ability, real-time States, defeat/revive state, persistent enemy defeat state,
equipment-derived loadouts, and the bounded combat ledger.

## Troubleshooting

- **The attack does nothing:** check the project's remappable Attack action under **Database ▸
  Controls**, confirm the actor has a combat profile/loadout, and make sure the enemy event page is
  enabled.
- **A hotbar action does nothing:** confirm Action Combat is enabled in System and Map Properties,
  the slot references an enabled Skill or Item, the actor has the Skill available, and MP/TP and
  cooldown requirements are satisfied.
- **An Item cannot be used on the map:** enable map item use, check the Item's Action Combat profile,
  confirm the target mode is valid, and make sure the inventory contains at least one copy.
- **A State never ticks:** enable its Action Combat profile and set a positive duration and tick
  interval in frames. Check resistance and stacking settings on the target.
- **The enemy is too hard to read:** increase wind-up frames, add a telegraph VFX/SFX, reduce
  chase range, and give the player more recovery time after a hit.
- **Knockback stops early:** the destination tile must be open; collision prevents pushing through
  walls, blocked tiles, or other invalid destinations.
- **A defeated enemy returns:** set a defeat self-switch or **Persistent Defeat**, or set a respawn
  delay of zero if the event should not respawn.
- **Online combat differs from local play:** host the same project file the exported game uses and
  restart Beacon after editing. The server reads the project at startup.

For turn-based battles, states, formulas, and troops, see [Battles & States](Battles-and-States).
For the underlying plugin/script hooks, see [Plugin & Script API](Plugin-and-Script-API).
