/* RPGAtlas — shared persisted action-combat data contracts. */

import type { CombatNetState } from "./action-combat.js";

export type CombatEventKind = "telegraph" | "hit" | "damage" | "defeat" | "respawn" | "playerDeath" | "revive";

export interface CombatEvent {
  tick: number;
  seq: number;
  kind: CombatEventKind;
  source?: number | string;
  target?: number | string;
  mapId?: number;
  eventId?: number;
  amount?: number;
  attackId?: number;
  x?: number;
  y?: number;
  dir?: number;
  hpAfter?: number;
  animationId?: number;
  sound?: string;
}

export interface PlayerCombatSnapshot {
  hp: number;
  maxHp: number;
  dead: boolean;
  revive: number;
  mp?: number;
  maxMp?: number;
  tp?: number;
  maxTp?: number;
  mapId?: number;
  x?: number;
  y?: number;
  dir?: number;
  state?: CombatNetState;
}

export interface CombatZoneSnapshot {
  events: Record<string, {
    mapId: number;
    eventId: number;
    hp: number;
    maxHp: number;
    dead: boolean;
    respawn: number;
    defeated: boolean;
    persistentDefeat: boolean;
  }>;
  ledger: CombatEvent[];
}

/** Storage adapter used by browser saves, Node stores, and Durable Objects.
 * Implementations may batch writes; callers never depend on storage latency for
 * the authoritative simulation tick. */
export interface CombatPersistence {
  loadPlayer(key: string): Promise<PlayerCombatSnapshot | null>;
  savePlayer(key: string, value: PlayerCombatSnapshot): Promise<void>;
  loadZone(mapId: number): Promise<CombatZoneSnapshot | null>;
  saveZone(mapId: number, value: CombatZoneSnapshot): Promise<void>;
}

/** Minimal key/value shape shared by browser local saves and Durable Objects.
 * Values are JSON-compatible and adapters may batch writes. */
export interface CombatPersistenceKv {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

/** A portable persistence adapter for local-memory, Node-KV, and DO-backed
 * stores. The simulation never depends on storage latency. */
export class KeyValueCombatPersistence implements CombatPersistence {
  constructor(private readonly kv: CombatPersistenceKv, private readonly prefix = "combat:") {}

  loadPlayer(key: string): Promise<PlayerCombatSnapshot | null> {
    return this.kv.get<PlayerCombatSnapshot>(this.prefix + "player:" + key).then((v) => v || null);
  }
  savePlayer(key: string, value: PlayerCombatSnapshot): Promise<void> {
    return this.kv.put(this.prefix + "player:" + key, value);
  }
  loadZone(mapId: number): Promise<CombatZoneSnapshot | null> {
    return this.kv.get<CombatZoneSnapshot>(this.prefix + "zone:" + mapId).then((v) => v || null);
  }
  saveZone(mapId: number, value: CombatZoneSnapshot): Promise<void> {
    return this.kv.put(this.prefix + "zone:" + mapId, {
      ...value, ledger: value.ledger.slice(-COMBAT_LEDGER_LIMIT),
    });
  }
}

/** Browser/local-save implementation. It intentionally uses the same JSON
 * keys as the async adapter so a later host can migrate saves without data
 * reshaping. */
export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalStorageCombatPersistence implements CombatPersistence {
  constructor(private readonly storage: LocalStorageLike, private readonly prefix = "rpgatlas:combat:") {}

  private read<T>(key: string): T | null {
    const raw = this.storage.getItem(this.prefix + key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  private write(key: string, value: unknown): Promise<void> {
    this.storage.setItem(this.prefix + key, JSON.stringify(value));
    return Promise.resolve();
  }
  loadPlayer(key: string): Promise<PlayerCombatSnapshot | null> {
    return Promise.resolve(this.read<PlayerCombatSnapshot>("player:" + key));
  }
  savePlayer(key: string, value: PlayerCombatSnapshot): Promise<void> {
    return this.write("player:" + key, value);
  }
  loadZone(mapId: number): Promise<CombatZoneSnapshot | null> {
    return Promise.resolve(this.read<CombatZoneSnapshot>("zone:" + mapId));
  }
  saveZone(mapId: number, value: CombatZoneSnapshot): Promise<void> {
    return this.write("zone:" + mapId, { ...value, ledger: value.ledger.slice(-COMBAT_LEDGER_LIMIT) });
  }
}

export const COMBAT_LEDGER_LIMIT = 1024;

export class CombatLedger {
  private readonly rows: CombatEvent[] = [];
  private nextSeq = 1;

  constructor(initial: CombatEvent[] = []) {
    for (const row of initial.slice(-COMBAT_LEDGER_LIMIT)) this.append(row);
  }

  append(event: Omit<CombatEvent, "seq"> | CombatEvent): CombatEvent {
    const row = { ...event, seq: Number((event as CombatEvent).seq) || this.nextSeq++ };
    this.nextSeq = Math.max(this.nextSeq, row.seq + 1);
    this.rows.push(row);
    if (this.rows.length > COMBAT_LEDGER_LIMIT) this.rows.splice(0, this.rows.length - COMBAT_LEDGER_LIMIT);
    return row;
  }

  toJSON(): CombatEvent[] { return this.rows.map((row) => ({ ...row })); }
  get length(): number { return this.rows.length; }
}
