/* Register the .rpgatlas association for standalone Electrobun builds.
   Electrobun currently emits document associations for macOS; this helper
   fills the Windows/Linux gap without requiring an installer. */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const executable = resolve(process.argv[2] || join(process.cwd(), process.platform === "win32" ? "RPGAtlas-Desktop.exe" : "RPGAtlas-Desktop"));

if (process.platform === "win32") {
  const key = "HKCU\\Software\\Classes\\RPGAtlas.Game";
  execFileSync("reg", ["add", "HKCU\\Software\\Classes\\.rpgatlas", "/ve", "/d", "RPGAtlas.Game", "/f"], { stdio: "inherit" });
  execFileSync("reg", ["add", key, "/ve", "/d", "RPGAtlas Game", "/f"], { stdio: "inherit" });
  execFileSync("reg", ["add", `${key}\\shell\\open\\command`, "/ve", "/d", `"${executable}" "%1"`, "/f"], { stdio: "inherit" });
  console.log("Registered .rpgatlas for " + executable);
} else if (process.platform === "linux") {
  const applications = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "applications");
  mkdirSync(applications, { recursive: true });
  const desktop = join(applications, "rpgatlas.desktop");
  writeFileSync(desktop, `[Desktop Entry]\nType=Application\nName=RPGAtlas\nExec=${executable} %f\nMimeType=application/x-rpgatlas;\nNoDisplay=true\nTerminal=false\n`);
  const mimeDir = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "mime", "packages");
  mkdirSync(mimeDir, { recursive: true });
  writeFileSync(join(mimeDir, "rpgatlas.xml"), `<?xml version="1.0"?><mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info"><mime-type type="application/x-rpgatlas"><comment>RPGAtlas game</comment><glob pattern="*.rpgatlas"/></mime-type></mime-info>`);
  try { execFileSync("update-mime-database", [join(mimeDir, "..")], { stdio: "inherit" }); } catch { /* optional tool */ }
  try { execFileSync("xdg-mime", ["default", "rpgatlas.desktop", "application/x-rpgatlas"], { stdio: "inherit" }); } catch { /* optional tool */ }
  console.log("Registered .rpgatlas for " + executable);
} else {
  console.log("macOS associations are provided by electrobun.config.ts.");
}
