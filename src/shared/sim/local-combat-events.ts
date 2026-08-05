/* DOM-free combat event bridge for the browser solo/friend-room host. */

import type { CombatEvent } from "./combat-persistence.js";
import { CombatEventStream } from "./action-combat-adapter.js";

const localCombatEvents = new CombatEventStream();

export function emitLocalCombat(event: Omit<CombatEvent, "seq">): void {
  localCombatEvents.append(event);
}

export function drainLocalCombatEvents(): CombatEvent[] {
  return localCombatEvents.drain();
}
