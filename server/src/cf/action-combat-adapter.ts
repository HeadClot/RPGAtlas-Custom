/* Cloudflare composition adapter for the shared field-combat runtime. */

import { Zone, type ZoneApi, type ZoneOutbox } from "../core/zone.js";
import { createCloudActionCombatRuntime } from "../core/action-combat-runtime.js";
import type { WorldLimits } from "../core/config.js";
import type { CombatPersistence } from "../../../src/shared/sim/combat-persistence.js";

export function cloudActionZoneFactory(opts: {
  project: unknown;
  limits: WorldLimits;
  seed?: number | null;
  persistence?: CombatPersistence;
}): (mapId: number, outbox: ZoneOutbox) => ZoneApi {
  return (mapId, outbox) => new Zone(mapId, opts.project, outbox, {
    limits: opts.limits,
    seed: opts.seed ?? null,
    combatPersistence: opts.persistence,
    runtimeFactory: createCloudActionCombatRuntime,
  });
}
