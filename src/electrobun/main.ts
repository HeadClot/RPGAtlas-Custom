/* RPGAtlas — Electrobun main process. */

import Electrobun, { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import { createServer, connect, type Server } from "node:net";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { DesktopRPCSchema } from "../shared/electrobun-rpc";
import { serializeDesktopError } from "../platform/electrobun/native/desktop-error";
import { assetDeleteCache, assetIndexRead, assetIndexWrite, assetRead, assetWriteCache, assetWriteInPlace, assetsScan, ensureReadme } from "../platform/electrobun/native/assets";
import { libraryDelete, libraryList, libraryRead, librarySetMeta, libraryWrite, importDir, scanImport } from "../platform/electrobun/native/global-library";
import { projectCreate, projectOpen, projectSave, readRecents, recentsRemove, recentsTouch } from "../platform/electrobun/native/project";
import { projectArgFromArgs } from "../platform/electrobun/native/launch";

const FRONTEND = "views://frontend";
const USER_DATA = Utils.paths.userData;
const CONFIG_DIR = join(Utils.paths.config, "RPGAtlas");
const LOCK_PATH = join(USER_DATA, "instance.lock");

let mainWindow: BrowserWindow;
let mainRpc: ReturnType<typeof BrowserView.defineRPC<DesktopRPCSchema>>;
let playtestWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;
let instanceServer: Server | null = null;
let instanceToken = "";

function requestDialog(opts: Parameters<typeof Utils.openFileDialog>[0]): Promise<string | null> {
  return Utils.openFileDialog(opts).then((paths) => paths.find((path) => !!path) || null);
}

async function pickDirectory(): Promise<string | null> {
  return requestDialog({ canChooseFiles: false, canChooseDirectory: true, allowsMultipleSelection: false });
}

async function saveFile(json: string, suggested: string): Promise<string | null> {
  // Electrobun 1.18 exposes the native open picker but not a separate save picker.
  // Selecting an existing project file remains a native save flow; when the user
  // cancels, choose a destination directory and create the suggested filename.
  const existing = await requestDialog({ startingFolder: Utils.paths.downloads, canChooseFiles: true, canChooseDirectory: false, allowsMultipleSelection: false, allowedFileTypes: "json" });
  if (existing) { writeFileSync(existing, json); return existing; }
  const directory = await requestDialog({ startingFolder: Utils.paths.downloads, canChooseFiles: false, canChooseDirectory: true, allowsMultipleSelection: false });
  if (!directory) return null;
  const path = join(directory, `${suggested}.json`);
  writeFileSync(path, json);
  return path;
}

function handlerError(error: unknown): never {
  throw new Error(JSON.stringify(serializeDesktopError(error)));
}

function withError<T>(fn: () => T): T {
  try { return fn(); } catch (error) { return handlerError(error); }
}

async function withErrorAsync<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (error) { return handlerError(error); }
}

function getPlaytest(): BrowserWindow {
  if (playtestWindow) return playtestWindow;
  const win = new BrowserWindow({
    title: "RPGAtlas — Playtest",
    frame: { x: 0, y: 0, width: 816, height: 624 },
    url: `${FRONTEND}/playtest-idle.html`,
    hidden: true,
  });
  win.on("close", () => { playtestWindow = null; });
  playtestWindow = win;
  return win;
}

function openPlaytest(): void {
  const win = getPlaytest();
  win.webview.loadURL(`${FRONTEND}/play.html?playtest=${Date.now()}`);
  win.show();
  win.activate();
}

function createRPC() {
  return BrowserView.defineRPC<DesktopRPCSchema>({
    maxRequestTime: 60_000,
    handlers: {
      requests: {
        save_project: ({ json, suggested }) => withErrorAsync(() => saveFile(json, suggested)),
        save_project_to_path: ({ path, json }) => withError(() => { writeFileSync(path, json); }),
        open_project: () => withErrorAsync(async () => {
          const path = await requestDialog({ canChooseFiles: true, canChooseDirectory: false, allowsMultipleSelection: false, allowedFileTypes: "json,rpgatlas" });
          return path ? readFileSync(path, "utf8") : null;
        }),
        open_playtest: () => withError(openPlaytest),
        library_list: () => withError(() => libraryList(USER_DATA)),
        library_read: ({ key }) => withError(() => libraryRead(USER_DATA, key)),
        library_write: ({ metaJson, dataBase64 }) => withError(() => libraryWrite(USER_DATA, metaJson, dataBase64)),
        library_delete: ({ key }) => withError(() => libraryDelete(USER_DATA, key)),
        library_set_meta: ({ metaJson }) => withError(() => librarySetMeta(USER_DATA, metaJson)),
        library_import_dir: () => withError(() => importDir(USER_DATA)),
        library_reveal_import: () => withErrorAsync(async () => { await Utils.openPath(importDir(USER_DATA)); }),
        library_scan_import: () => withError(() => JSON.stringify(scanImport(USER_DATA))),
        project_create: ({ parentDir, name, documentJson }) => withError(() => projectCreate(parentDir, name, documentJson)),
        project_open: ({ target }) => withError(() => projectOpen(target)),
        project_save: ({ root, documentJson }) => withError(() => projectSave(root, documentJson)),
        recents_list: () => withError(() => JSON.stringify(readRecents(CONFIG_DIR))),
        recents_touch: ({ path, name }) => withError(() => recentsTouch(CONFIG_DIR, path, name)),
        recents_remove: ({ path }) => withError(() => recentsRemove(CONFIG_DIR, path)),
        project_reveal: ({ root }) => withError(() => { Utils.showItemInFolder(root); }),
        project_asset_index_read: ({ root }) => withError(() => assetIndexRead(root)),
        project_asset_index_write: ({ root, json }) => withError(() => assetIndexWrite(root, json)),
        project_asset_read: ({ root, relPath, hash }) => withError(() => assetRead(root, relPath, hash)),
        project_asset_write_inplace: ({ root, assetType, fileName, dataBase64 }) => withError(() => assetWriteInPlace(root, assetType, fileName, dataBase64)),
        project_asset_write_cache: ({ root, hash, dataBase64 }) => withError(() => assetWriteCache(root, hash, dataBase64)),
        project_asset_delete_cache: ({ root, hash }) => withError(() => assetDeleteCache(root, hash)),
        project_assets_scan: ({ root }) => withError(() => JSON.stringify(assetsScan(root))),
        project_ensure_assets_readme: ({ root }) => withError(() => ensureReadme(root)),
        take_launch_path: () => { const path = initialLaunchPath; initialLaunchPath = null; return path; },
        pick_directory: () => withErrorAsync(pickDirectory),
        pick_folder: () => withErrorAsync(pickDirectory),
      },
    },
  });
}

let initialLaunchPath = projectArgFromArgs(process.argv, process.cwd());

async function acquireSingleInstance(): Promise<boolean> {
  mkdirSync(USER_DATA, { recursive: true });
  instanceToken = randomBytes(24).toString("hex");
  const server = createServer((socket) => {
    let text = "";
    socket.on("data", (data) => { text += data.toString(); });
    socket.on("end", () => {
      try {
        const packet = JSON.parse(text) as { token: string; path?: string };
        if (packet.token === instanceToken && packet.path) {
          pendingOpenPath = packet.path;
          if (mainWindow) mainRpc.send.open_project_request({ path: packet.path });
        }
      } catch { /* malformed second launch is ignored */ }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const fd = openSync(LOCK_PATH, "wx");
    writeFileSync(fd, JSON.stringify({ port, token: instanceToken }));
    closeSync(fd);
    instanceServer = server;
    return true;
  } catch {
    try {
      const owner = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as { port: number; token: string };
      const path = projectArgFromArgs(process.argv, process.cwd());
      await new Promise<void>((resolve) => {
        const socket = connect(owner.port, "127.0.0.1", () => { socket.end(JSON.stringify({ token: owner.token, path })); resolve(); });
        socket.on("error", () => { resolve(); });
      });
      server.close();
      return false;
    } catch {
      try { rmSync(LOCK_PATH, { force: true }); } catch { /* retry below */ }
      server.close();
      return acquireSingleInstance();
    }
  }
}

async function run(): Promise<void> {
  if (!(await acquireSingleInstance())) return;
  const rpc = createRPC();
  mainRpc = rpc;
  mainWindow = new BrowserWindow({
    title: "RPGAtlas Desktop",
    frame: { x: 0, y: 0, width: 1280, height: 800 },
    url: `${FRONTEND}/index.html`,
    rpc,
  });
  mainWindow.on("close", () => Utils.quit());
  if (pendingOpenPath) mainRpc.send.open_project_request({ path: pendingOpenPath });
  Electrobun.events.on("before-quit", () => {
    try { rmSync(LOCK_PATH, { force: true }); } catch { /* best effort */ }
    instanceServer?.close();
  });
}

void run().catch((error) => { console.error("RPGAtlas Electrobun host failed", error); Utils.quit(); });
