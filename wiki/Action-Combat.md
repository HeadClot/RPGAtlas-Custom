# Action Combat

Action Combat adds real-time, map-based encounters to the normal turn-based battle system. Players
face a direction, press the remappable **Attack** action, and resolve short attack phases with
telegraphs, active hit frames, recovery, hitboxes, damage, stagger, and knockback. It works in
solo play and in server-authoritative Beacon rooms/worlds.

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

## Enemy behavior

An enemy's **Action Combat** defaults can be inherited by event pages or overridden per page.

- **None** leaves the event's normal movement in charge.
- **Chase player** closes distance while the target is within the event's configured leash.
- **Touch damage** lets contact hurt the player without a separate attack animation.
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

Action-combat state is included in supported saves and server snapshots: live HP, defeat/revive
state, persistent enemy defeat state, equipment-derived loadouts, and the bounded combat ledger.

## Troubleshooting

- **The attack does nothing:** check the project's remappable Attack action under **Database ▸
  Controls**, confirm the actor has a combat profile/loadout, and make sure the enemy event page is
  enabled.
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
