/* RPGAtlas — src/engine/interpreter/commands/index.ts
   Registers every built-in interpreter command onto the shared registry
   (Phase 1 Stage B). Called once at boot, before plugins load, so plugin
   commands (atlas.registerCommand) can override built-ins by re-registering the
   same type — matching the monolith, where Plugins.commands overwrote by type.
   GPL-3.0-or-later (see LICENSE). */

import { registerFlowCommands } from "./flow.js";
import { registerStateCommands } from "./state.js";
import { registerPresentationCommands } from "./presentation.js";
import { registerWorldCommands } from "./world.js";
import { registerCombatCommands } from "./combat.js";
import { registerActorCommands } from "./actors.js";
import { registerSystemCommands } from "./system.js";

export function registerBuiltinCommands(): void {
  registerFlowCommands();
  registerStateCommands();
  registerPresentationCommands();
  registerWorldCommands();
  registerCombatCommands();
  registerActorCommands();
  registerSystemCommands();
}
