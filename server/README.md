# RPGAtlas Beacon Server

The open-source multiplayer server for [RPGAtlas](../README.md) games — Project
Beacon. Host full-engine friend rooms (2–16 players) or your own persistent
world. One
TypeScript core (`src/core`, shared with the game engine's `src/shared/`), two
deploy targets:

- **Node** (`src/node`) — one command, runs anywhere Node runs.
- **Cloudflare Durable Objects** (`src/cf`) — one room per DO, WebSocket
  hibernation, free-tier friendly.

It is **server-authoritative**: clients send input intents, the server owns the
world and streams back validated movement and combat outcomes. No P2P, no
player-visible IPs. Room codes are unguessable capability tokens; empty rooms
expire.

> **Scope.** The server simulates the player layer and the shared action-combat
> runtime — movement/collision, presence, late-join, resume, enemy chase AI,
> telegraphs, damage, knockback, defeat, death, and respawn. Cloudflare keeps
> the same runtime behind its capability gate and Durable Object persistence.

---

## Node (self-host in one command)

```bash
# from the repo root (needs `ws` — already a dev dependency there)
cd server
bun run build                       # → dist/beacon.mjs (esbuild bundle)
node dist/beacon.mjs --project ../Atlas_Quest.json --port 8787
```

### Practice Clearing

Build and host the dedicated authoritative action-combat slice from the repo
root:

```text
bun scripts/build-practice-clearing-demo.mjs
node server/dist/beacon.mjs --project Practice_Clearing.json
```

The demo includes two players, two chasing enemies, telegraphs, knockback,
respawn, and a map transfer. `Atlas_Quest_Coop.json` remains the turn-based
co-op compatibility fixture.

Players connect over `ws://<host>:8787` (put it behind a TLS-terminating proxy
for `wss://`, which the browser client requires off localhost). Friend rooms
run the full engine by default: parties, authored events, shared battles, and
action combat. Use `--no-engine-rooms` for the lighter walk/emote/chat mode.
Options:

| flag | meaning |
|------|---------|
| `--project, -p <path>` | game project JSON to host (**required**) |
| `--port <n>` | listen port (default 8787) |
| `--host <addr>` | bind address (default all interfaces) |
| `--max-players <n>` | players per room (default 16) |
| `--max-rooms <n>` | simultaneous room cap (default 1000) |
| `--no-engine-rooms` | disable full engine workers for friend rooms |
| `--world` | serve one shared persistent-world endpoint instead of code rooms |
| `--data <dir>` | persist Node world snapshots to this directory |
| `--engine-events` | run authored NPCs/events/cutscenes server-side in world mode |
| `--zone-workers` | shard world maps across worker threads |
| `--trust-proxy` | read `X-Forwarded-For` for the rate-limit source (only behind a proxy you control) |

`GET /` returns a JSON health snapshot (`{ ok, rooms, connections, players }`).

### Behind a TLS proxy (recommended)

Terminate TLS at nginx/Caddy/Cloudflare and proxy the WebSocket upgrade to the
Node server. Example nginx:

```nginx
location /rt { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
```

Run the server with `--trust-proxy` so join rate-limiting sees the real client IP.

---

## Cloudflare Durable Objects (free-tier relay)

One room per Durable Object, hibernating when idle. The game project lives in a
KV namespace (too large for a plaintext var).

```bash
cd server
bun install                                     # install locked dev deps, including Wrangler
bunx wrangler kv namespace create GAME          # copy the id into wrangler.jsonc
bunx wrangler kv key put --binding=GAME project --path ../Atlas_Quest.json --remote
bunx wrangler deploy                             # deploys the Worker + DO
```

Don't skip `--remote` on the `kv key put` line: without it wrangler stores the
value on your own computer only (its local dev storage), the deployed Worker's
GAME namespace stays empty, and every room connection fails with
`beacon: GAME KV has no 'project' key`.

Client routes on the deployed Worker:

- `GET /new` → `{ "code": "BCDFGHJKM" }` — mint a fresh room code (a "create").
- `GET /rt?code=XXXXXXXXX` — WebSocket upgrade into that room.
- `GET /health` → `{ ok: true }`.
- `GET /wrt?world=main` — WebSocket connection to a persistent world.

`bunx wrangler dev` runs it locally against a real Workers runtime (miniflare).

Durable Object storage preserves persistent-world state across hibernation and
eviction. Friend rooms still expire when empty according to the room policy.

---

## What ships on the wire (privacy)

Only what the game needs: a player is a server-assigned id + display name +
position + appearance key, plus validated gameplay state such as party presence,
HP, defeat/revive state, and action-combat events. No account or PII is sent in
either direction. The rate-limit source (an IP) is held transiently in memory
for abuse control and never crosses the wire or a log line tied to a player.

## Development

```bash
bun run typecheck    # Node target (tsconfig.json) + CF target (tsconfig.cf.json)
```

The core's behaviour is covered from the repo root: `bunx vitest run
tests-unit/collision.test.ts tests-unit/beacon-server.test.ts
tests-unit/beacon-ws.test.ts`.

Licensed GPL-3.0-or-later (see [`LICENSE`](../LICENSE)).
