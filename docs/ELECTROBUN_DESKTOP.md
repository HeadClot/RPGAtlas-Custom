# RPGAtlas desktop host

RPGAtlas uses Electrobun 1.18.1 for its native desktop shell. The Bun main process lives in
`src/electrobun/main.ts`; the typed contract is `src/shared/electrobun-rpc.ts`; and the native
filesystem services are isolated under `src/platform/electrobun/`.

## Development and packaging

```text
bun install
bun run desktop:dev
bun run desktop:build
bun run desktop:associate
```

`desktop:build` stages the Vite frontend, builds Electrobun, and copies the newest Windows
artifact to `RPGAtlas-Desktop.exe` at the repository root. `scripts/package-game-exe.mjs` uses the
same host to produce a native game executable from an exported project file.

The browser build remains independent of Electrobun. `?fakehost` continues to exercise the project
manager against its local-storage fake host, while the staged desktop pages receive the native
bridge from `src/platform/electrobun/view-bridge.ts`.

## Native behavior

The host preserves project-folder persistence, atomic saves and rolling backups, path containment,
asset indexes and in-place assets, the legacy app-data library, native dialogs, path reveal,
launch arguments, and a reusable playtest window. A per-user lock file plus authenticated loopback
socket forwards a second launch to the existing editor window.

`.rpgatlas` association metadata is included in `electrobun.config.ts`. The Windows helper writes
per-user registry entries; the Linux helper writes a per-user desktop file and MIME definition.

Electrobun's officially supported boundary is macOS 14+, Windows 11+, and Ubuntu 24.04+. Other
Linux distributions remain compatibility targets and may require platform-specific WebKit or
desktop integration packages.
