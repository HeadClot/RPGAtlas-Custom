/* RPGAtlas — src/editor/console/commands-build.ts
   Console commands: build & export. Thin fronts over the exact same builders
   the File ▸ Export Standalone Game… dialog uses, so the two can never drift.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  exportStandaloneHtmlFile, exportWebZip, exportWindowsExeFile, saveNow,
} from "../persistence";
import { registerConsoleCommand, done, fail, text } from "./registry";

const BUILD_HINT = [
  text("What do you want to build?"),
  text("  build web    itch.io-ready .zip — installable, replayable offline", "dim"),
  text("  build html   one self-contained .html file, runs anywhere", "dim"),
  text("  build exe    Windows launcher .exe (unsigned; extracts and opens the game)", "dim"),
];

registerConsoleCommand({
  name: "build",
  group: "Build",
  summary: "Show the available build targets",
  usage: "build",
  run: () => done(BUILD_HINT, { targets: ["web", "html", "exe"] }),
});

registerConsoleCommand({
  name: "build web",
  group: "Build",
  summary: "Export the game as a web zip (itch.io-ready, offline-capable PWA)",
  usage: "build web",
  async run() {
    saveNow();
    await exportWebZip();
    return done([
      text("✓ Web zip built and downloaded.", "ok"),
      text("Upload it straight to itch.io (HTML5 game) or any static host — players can install it as an app and replay offline.", "dim"),
    ], { target: "web", ok: true });
  },
});

registerConsoleCommand({
  name: "build html",
  group: "Build",
  summary: "Export the game as one standalone .html file",
  usage: "build html",
  async run() {
    saveNow();
    await exportStandaloneHtmlFile();
    return done([
      text("✓ Standalone HTML built.", "ok"),
      text("One file, no server needed — send it to anyone; it opens in their browser.", "dim"),
    ], { target: "html", ok: true });
  },
});

registerConsoleCommand({
  name: "build exe",
  group: "Build",
  summary: "Export the game as a Windows launcher executable",
  usage: "build exe",
  async run() {
    saveNow();
    try {
      await exportWindowsExeFile();
    } catch (e: any) {
      return fail("EXE build failed: " + ((e && e.message) || e) +
        ". Tip: a fully native EXE can also be built from the repo with “node scripts/package-game-exe.mjs <project.json>”.");
    }
    return done([
      text("✓ Windows game executable built.", "ok"),
      text("The launcher is unsigned, so Windows may show a security warning the first time. For a fully native EXE (own window, no browser), run: node scripts/package-game-exe.mjs <project.json>", "dim"),
    ], { target: "exe", ok: true });
  },
});
