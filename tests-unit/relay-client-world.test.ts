/* RPGAtlas — tests-unit/relay-client-world.test.ts
   Project Beacon MP8·B (item 4, D-8-4): the client half of the WORLD handshake,
   proven headless over a mock transport (no socket — the protocol logic is the
   subject). A world RelayClient (passport present) must NOT send its hello
   eagerly: it waits for the server's `challenge`, signs the nonce with the
   device passport, and sends the SIGNED hello (pub/sig) before `join`/`resume`.
   A friend-room client (no passport) keeps the MP5 eager anonymous handshake,
   byte-identical. The `handoff` frame (the CF socket-per-zone reconnect arm,
   D-8-1) fires the reconnect hook. GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from "vitest";
import { RelayClient } from "../src/engine/net/relay-client";
import { createWorld } from "../src/shared/sim/world";
import type { NetMessage, Transport } from "../src/shared/net/transport";
import { generatePassport, verifyChallenge, randomChallengeNonce } from "../src/shared/net/passport";

class MockTransport implements Transport {
  isOpen = true;
  readonly sent: any[] = [];
  private h: ((m: NetMessage) => void) | null = null;
  send(m: NetMessage): void { this.sent.push(m); }
  onMessage(h: (m: NetMessage) => void): void { this.h = h; }
  close(): void { this.isOpen = false; }
  recv(m: any): void { this.h?.(m); }
  ofType(t: string): any[] { return this.sent.filter((m) => m.t === t); }
}

// WebCrypto sign/export settle on a macrotask; poll (bounded) for the signed
// frame rather than a fixed flush count, which can race under heavy test load.
async function waitFor(pred: () => boolean, tries = 100): Promise<void> {
  for (let i = 0; i < tries && !pred(); i++) await new Promise((r) => setTimeout(r, 0));
}

describe("RelayClient WORLD handshake (D-8-4)", () => {
  it("ignores stale frames, cancels an older async snapshot, and reports ack", async () => {
    const tr = new MockTransport();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const acks: number[] = [];
    const world = createWorld(null);
    const client = new RelayClient(world, tr, {
      name: "Ada",
      onAck: (ack) => acks.push(ack),
      onSnapshot: async () => pending,
      onLocal: (state) => { (world.g as any).seenX = state.x; },
    });
    tr.recv({ t: "welcome", proto: 1, playerId: 1, roomCode: "ROOM", resumeToken: "token", tick: 0 });
    const local = (x: number) => ({ id: 1, name: "Ada", charset: "", mapId: 1, x, y: 1, rx: x, ry: 1, dir: 0, moving: false, animT: 0, combat: undefined });
    tr.recv({ t: "snapshot", tick: 5, world: { players: [local(5)], mapId: 1, timeOfDay: 12 } as any });
    tr.recv({ t: "delta", tick: 6, ack: 3, changes: { players: [local(6)] } as any });
    tr.recv({ t: "delta", tick: 4, ack: 99, changes: { players: [local(4)] } as any });
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(world.tick).toBe(6);
    expect((world.g as any).seenX).toBe(6);
    expect(client.lastAck).toBe(3);
    expect(acks).toEqual([3]);
    client.close();
  });

  it("waits for the challenge, then sends a VALID signed hello + codeless join", async () => {
    const passport = await generatePassport("Mara");
    const tr = new MockTransport();
    new RelayClient(createWorld(null), tr, { name: "Mara", passport });
    // Nothing sent yet — a world client answers the server's challenge first.
    expect(tr.sent).toHaveLength(0);

    const nonce = randomChallengeNonce();
    tr.recv({ t: "challenge", nonce });
    await waitFor(() => tr.ofType("hello").length > 0 && tr.ofType("join").length > 0);

    const hello = tr.ofType("hello")[0];
    expect(hello).toBeTruthy();
    expect(typeof hello.pub).toBe("string");
    expect(typeof hello.sig).toBe("string");
    // The signature must verify against the challenge nonce (the server checks
    // exactly this) — i.e. the client actually signed with its passport.
    expect(await verifyChallenge(hello.pub, nonce, hello.sig)).toBe(true);
    // …and the entry frame follows the hello, in order.
    const join = tr.ofType("join")[0];
    expect(join).toBeTruthy();
    expect(join.code).toBeUndefined(); // a world has one shared room (codeless)
    expect(tr.sent.indexOf(hello)).toBeLessThan(tr.sent.indexOf(join));
  });

  it("world resume signs the hello then sends resume with the token", async () => {
    const passport = await generatePassport("Bo");
    const tr = new MockTransport();
    new RelayClient(createWorld(null), tr, { name: "Bo", passport, resume: { code: "ABC-DEF-GHI", token: "tok123" } });
    tr.recv({ t: "challenge", nonce: randomChallengeNonce() });
    await waitFor(() => tr.ofType("hello").length > 0 && tr.ofType("resume").length > 0);
    expect(tr.ofType("hello")[0].sig).toBeTruthy();
    const resume = tr.ofType("resume")[0];
    expect(resume.token).toBe("tok123");
    expect(tr.ofType("join")).toHaveLength(0);
  });

  it("a friend room (no passport) sends the eager anonymous hello + join", () => {
    const tr = new MockTransport();
    new RelayClient(createWorld(null), tr, { name: "Ada", code: "ABC-DEF-GHI" });
    const hello = tr.ofType("hello")[0];
    expect(hello).toBeTruthy();
    expect(hello.pub).toBeUndefined(); // anonymous (D3)
    expect(hello.sig).toBeUndefined();
    expect(tr.ofType("join")[0].code).toBe("ABC-DEF-GHI");
  });

  it("a handoff frame fires the reconnect hook (the CF socket-per-zone arm)", () => {
    const tr = new MockTransport();
    const seen: any[] = [];
    new RelayClient(createWorld(null), tr, {
      name: "Cy", passport: undefined,
      onHandoff: (h) => seen.push(h),
    });
    tr.recv({ t: "handoff", mapId: 7, token: "handoff-tok", url: "wss://w.example/wrt?world=main" });
    expect(seen).toEqual([{ mapId: 7, token: "handoff-tok", url: "wss://w.example/wrt?world=main" }]);
  });
});
