/* RPGAtlas — scripts/package-portmaster.mjs
   Experimental PortMaster package builder for ARM64 Linux. It reuses the
   per-game Tauri shell from package-game-exe.mjs, then wraps that binary in
   PortMaster's metadata and launcher layout. The binary must be built on an
   ARM64 Linux host because Tauri's Linux AppImage toolchain is not used here.
   GPL-3.0-or-later. */

import { execFileSync } from "node:child_process";
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { safeFileName } from "../js/standalone-template.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET = "aarch64-unknown-linux-gnu";
const ARCH = "aarch64";
const encoder = new TextEncoder();

export function portNameFor(title) {
  return (String(title || "rpgatlas")
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "") || "rpgatlas").slice(0, 48);
}

export function launcherNameFor(title) {
  return safeFileName(title, "RPGAtlas Game") + ".sh";
}

function xmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function portManifest({ title, description, portName, launcherName, porter = "RPGAtlas" }) {
  return {
    version: 2,
    name: portName + ".zip",
    items: [launcherName, portName],
    items_opt: null,
    attr: {
      title,
      desc: description,
      inst: "Experimental ARM64 build. Requires a compatible PortMaster WebKitGTK/WestonPack runtime.",
      genres: ["rpg"],
      porter: [porter],
      image: {},
      rtr: false,
      runtime: null,
      reqs: ["highres"],
      arch: [ARCH],
    },
  };
}

export function gameInfoXml({ title, description, launcherName, releasedate }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<gameList>
  <game>
    <path>./${xmlText(launcherName)}</path>
    <name>${xmlText(title)}</name>
    <desc>${xmlText(description)}</desc>
    <releasedate>${xmlText(releasedate)}</releasedate>
    <developer>RPGAtlas contributors</developer>
    <publisher>RPGAtlas contributors</publisher>
    <genre>RPG</genre>
    <image>./screenshot.png</image>
  </game>
</gameList>
`;
}

export function gptkConfig() {
  return `back = esc
start = enter
a = z
b = x
x = space
y = c
l1 = q
r1 = e
up = up
down = down
left = left
right = right
left_analog_up = w
left_analog_down = s
left_analog_left = a
left_analog_right = d
`;
}

export function launcherScript({ portName }) {
  return `#!/bin/bash
# RPGAtlas PortMaster launcher — generated for ${portName} (${ARCH}).
set -u

XDG_DATA_HOME=\${XDG_DATA_HOME:-$HOME/.local/share}
if [ -d "/opt/system/Tools/PortMaster/" ]; then
  controlfolder="/opt/system/Tools/PortMaster"
elif [ -d "/opt/tools/PortMaster/" ]; then
  controlfolder="/opt/tools/PortMaster"
elif [ -d "$XDG_DATA_HOME/PortMaster/" ]; then
  controlfolder="$XDG_DATA_HOME/PortMaster"
else
  controlfolder="/roms/ports/PortMaster"
fi

source "$controlfolder/control.txt"
[ -f "\${controlfolder}/mod_\${CFW_NAME}.txt" ] && source "\${controlfolder}/mod_\${CFW_NAME}.txt"
get_controls

GAMEDIR="/$directory/ports/${portName}/"
CONFDIR="$GAMEDIR/conf"
mkdir -p "$CONFDIR"
cd "$GAMEDIR"
> "$GAMEDIR/log.txt" && exec > >(tee "$GAMEDIR/log.txt") 2>&1

export XDG_DATA_HOME="$CONFDIR"
export XDG_CONFIG_HOME="$CONFDIR"
export SDL_GAMECONTROLLERCONFIG="$sdl_controllerconfig"
export LD_LIBRARY_PATH="$GAMEDIR/libs.\${DEVICE_ARCH}:$LD_LIBRARY_PATH"

if [ -f "\${controlfolder}/libgl_\${CFW_NAME}.txt" ]; then
  source "\${controlfolder}/libgl_\${CFW_NAME}.txt"
elif [ -f "\${controlfolder}/libgl_default.txt" ]; then
  source "\${controlfolder}/libgl_default.txt"
fi

GPTK_FILE="./${portName}/${portName}.gptk.\${ANALOG_STICKS:-1}"
$GPTOKEYB "${portName}.\${DEVICE_ARCH}" -c "$GPTK_FILE" &
pm_platform_helper "$GAMEDIR/${portName}/${portName}.\${DEVICE_ARCH}"
"$GAMEDIR/${portName}/${portName}.\${DEVICE_ARCH}"
pm_finish
`;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    let x = (c ^ byte) & 0xff;
    for (let i = 0; i < 8; i++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
    c = (c >>> 8) ^ x;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Deterministic STORE zip with Unix mode bits preserved for scripts/binaries. */
export function buildPortZip(entries, date = new Date(2026, 0, 1, 12, 0, 0)) {
  const { time, date: dosDate } = dosDateTime(date);
  const chunks = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name.replaceAll("\\", "/"));
    const data = entry.data;
    const crc = crc32(data);
    const mode = /(^|\/)([^/]+\.sh|[^/]+\.aarch64)$/.test(entry.name) ? 0o100755 : 0o100644;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, time, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cdir = new DataView(new ArrayBuffer(46));
    cdir.setUint32(0, 0x02014b50, true); cdir.setUint16(4, 0x0314, true);
    cdir.setUint16(6, 20, true); cdir.setUint16(8, 0x0800, true);
    cdir.setUint16(12, time, true); cdir.setUint16(14, dosDate, true);
    cdir.setUint32(16, crc, true); cdir.setUint32(20, data.length, true);
    cdir.setUint32(24, data.length, true); cdir.setUint16(28, nameBytes.length, true);
    cdir.setUint32(38, mode << 16, true); cdir.setUint32(42, offset, true);
    central.push(new Uint8Array(cdir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
    centralSize += 46 + nameBytes.length;
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true); eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  chunks.push(...central, new Uint8Array(eocd.buffer));
  const out = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
  return out;
}

function pngInfo(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 24 || !bytes.subarray(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    throw new Error("screenshot must be a PNG file");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 640 || height < 480 || Math.abs(width / height - 4 / 3) > 0.02) {
    throw new Error(`screenshot must be at least 640x480 with a 4:3 aspect ratio (got ${width}x${height})`);
  }
  return { width, height, bytes };
}

function parseArgs(args) {
  const projectPath = args.find((arg) => !arg.startsWith("--"));
  const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  return {
    projectPath,
    out: value("--out"),
    screenshot: value("--screenshot"),
    porter: value("--porter") || "RPGAtlas",
    skipBuild: args.includes("--skip-frontend-build"),
  };
}

export function buildPortMasterPackage({ projectPath, out, screenshot, porter, skipBuild = false }) {
  if (process.platform !== "linux" || process.arch !== "arm64") {
    throw new Error("PortMaster ARM64 packaging must run on an ARM64 Linux build host (aarch64 Linux); no cross-compiled AppImage is produced.");
  }
  if (!projectPath) throw new Error("missing project JSON path");
  if (!screenshot) throw new Error("--screenshot <640x480-or-larger-4:3-png> is required for PortMaster metadata");
  const project = JSON.parse(readFileSync(resolve(projectPath), "utf8"));
  if (!project?.meta || project.meta.engine !== "rpgatlas") throw new Error("not an RPGAtlas project file: " + projectPath);
  const title = project.system?.title || "RPGAtlas Game";
  const description = `A game made with RPGAtlas: ${title}.`;
  const portName = portNameFor(title);
  const launcherName = launcherNameFor(title);
  const screenshotInfo = pngInfo(resolve(screenshot));
  const stage = mkdtempSync(join(tmpdir(), "rpgatlas-portmaster-"));
  try {
    const binary = join(stage, portName + ".aarch64");
    const packager = join(root, "scripts", "package-game-exe.mjs");
    const packagerArgs = [packager, resolve(projectPath), "--out", binary, "--target", TARGET];
    if (skipBuild) packagerArgs.push("--skip-frontend-build");
    console.log("[package-portmaster] building ARM64 Linux game binary");
    execFileSync(process.execPath, packagerArgs, { cwd: root, stdio: "inherit" });

    const entries = [
      { name: "port.json", data: encoder.encode(JSON.stringify(portManifest({ title, description, portName, launcherName, porter }), null, 2) + "\n") },
      { name: "README.md", data: encoder.encode(`# ${title}\n\nExperimental ARM64 Linux PortMaster package generated by RPGAtlas.\n\n## Notes\n\nThis package embeds the game and its referenced assets. It requires a PortMaster-compatible ARM64 environment with the WebKitGTK/WestonPack runtime path validated for this build.\n\n## Controls\n\n- D-pad / left stick: move\n- A: confirm\n- B: cancel\n- X: menu/secondary action\n- Start: confirm/menu\n- Select + Start: PortMaster quit shortcut\n\n## License\n\nThe RPGAtlas engine is GPL-3.0-or-later; see licenses/RPGAtlas-LICENSE.txt. Game content remains the project creator's responsibility.\n`) },
      { name: "screenshot.png", data: screenshotInfo.bytes },
      { name: "gameinfo.xml", data: encoder.encode(gameInfoXml({ title, description, launcherName, releasedate: new Date().toISOString().slice(0, 10).replaceAll("-", "") + "T000000" })) },
      { name: "licenses/RPGAtlas-LICENSE.txt", data: readFileSync(join(root, "LICENSE")) },
      { name: "licenses/THIRD-PARTY-RUNTIME-STATUS.txt", data: encoder.encode("The ARM64 Tauri/WebKitGTK/WestonPack runtime must be reviewed and its applicable licenses added before upstream PortMaster submission.\n") },
      { name: launcherName, data: encoder.encode(launcherScript({ portName })) },
      { name: `${portName}/${portName}.aarch64`, data: readFileSync(binary) },
      { name: `${portName}/${portName}.gptk.1`, data: encoder.encode(gptkConfig()) },
      { name: `${portName}/${portName}.gptk.2`, data: encoder.encode(gptkConfig()) },
    ];
    const destination = resolve(out || `${safeFileName(title, "RPGAtlas_Game")}-portmaster.zip`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, buildPortZip(entries));
    console.log(`[package-portmaster] wrote ${destination} (${screenshotInfo.width}x${screenshotInfo.height} screenshot)`);
    return destination;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.projectPath) throw new Error("Usage: npm run package:portmaster -- <project.json> --screenshot <gameplay.png> [--out <port.zip>] [--skip-frontend-build]");
    buildPortMasterPackage(options);
  } catch (error) {
    console.error("[package-portmaster] ERROR: " + (error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}
