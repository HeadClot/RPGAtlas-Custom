/* RPGAtlas — src/engine/interpreter/registry.ts
   The event-command registry: the architectural core extracted from the
   monolith's Interp.exec switch (Phase 1 Stage B), and the prerequisite for the
   Phase 4 Atlas Graph. Built-in commands register handlers here by type; the
   plugin bridge (atlas.registerCommand) routes onto the SAME registry, so
   plugin commands and built-ins are dispatched by one lookup. Interp.exec
   becomes: look up the handler for cmd.t and call it; unknown types are a
   silent no-op, exactly as the monolith's switch `default` did (it only ran a
   handler if one existed, otherwise fell through and did nothing).

   Signatures follow docs/phase-1-spec.md. Phase 1 keeps the payload/context
   `any`-heavy; the AnyCommand discriminated union and typed services land in
   Stage D. GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AnyCommand = any;

/** The interpreter instance: runList / exec / testCond / selfKey /
 *  callCommonEvent. Typed loosely this phase. */
export type Interp = any;

/** Live game state (the monolith's `G`). */
export type GameState = any;

/** Engine service surface a command handler may call: message, quests, scene
 *  transitions, party/inventory ops, battle/shop, camera, waits, refresh hooks,
 *  and the mutable engine context. Populated at boot; typed in Stage D. */
export type EngineServices = any;

/** Context handed to every command handler. */
export interface InterpContext {
  interp: Interp;
  state: GameState;
  services: EngineServices;
}

export type CommandHandler = (
  cmd: AnyCommand,
  ctx: InterpContext,
) => Promise<void> | void;

const handlers = new Map<string, CommandHandler>();

/** Register a handler for an event-command type. Last registration wins (this
 *  mirrors the monolith's plugin bridge, where atlas.registerCommand(t, fn)
 *  overwrote Plugins.commands[t]). */
export function registerCommand(type: string, handler: CommandHandler): void {
  handlers.set(type, handler);
}

/** Look up the handler for a command type, or undefined if none is registered.
 *  An undefined result is the interpreter's silent-skip (the old switch default). */
export function getCommand(type: string): CommandHandler | undefined {
  return handlers.get(type);
}
