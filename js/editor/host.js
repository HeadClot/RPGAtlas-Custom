/* RPGAtlas — editor/host.js
   Host abstraction. On the plain web build (served by the bundled local web
   server) every entry point reports isDesktop=false and callers fall back to
   normal browser behavior. Inside the Electrobun desktop wrapper these route
   through native file dialogs and a dedicated play-test window.
   GPL-3.0-or-later (see LICENSE). */

const desktop = typeof window !== "undefined" ? window.__ATLAS_ELECTROBUN__ : undefined;

/** True when running inside the Electrobun desktop wrapper. */
export const isDesktop = !!desktop;

function invoke(cmd, args) {
  if (!desktop) return Promise.reject(new Error("The desktop bridge is unavailable."));
  return desktop.rpc.request[cmd](args);
}

/** Open (or focus) the native play-test window. */
export function openPlaytest() {
  return invoke("open_playtest");
}

/**
 * Save the project to a user-chosen .json file via a native Save dialog.
 * Resolves to the chosen path, or null if the user cancelled.
 */
export function saveProjectToFile(project) {
  const json = JSON.stringify(project, null, 1);
  const suggested =
    (project && project.system && project.system.title || "rpgatlas-project")
      .replace(/[^\w\- ]+/g, "").trim().replace(/ +/g, "_") || "rpgatlas-project";
  return invoke("save_project", { json, suggested });
}

/**
 * Save the project to an already-known file path, no dialog (the Save button's
 * silent overwrite once a project is bound to a file).
 */
export function saveProjectToPath(path, project) {
  const json = JSON.stringify(project, null, 1);
  return invoke("save_project_to_path", { path, json });
}

/**
 * Open a project via a native Open dialog. Resolves to the parsed project
 * object, or null if the user cancelled.
 */
export async function openProjectFromFile() {
  const json = await invoke("open_project");
  return json ? JSON.parse(json) : null;
}

// --- Project folders (Project Harbor H1·C) ---------------------------------
// Thin desktop-gated wrappers over the native project commands (src/platform/
// project.ts). Each is a one-liner over invoke; the typed façade lives in
// src/platform/electrobun/project-host.ts. Nothing here is wired into boot yet (H2).

/** Create a project folder; resolves to { root, name, document }. */
export function projectCreate(parentDir, name, documentJson) {
  return invoke("project_create", { parentDir, name, documentJson });
}

/** Open a project by folder path or game.rpgatlas path; resolves to the bundle. */
export function projectOpen(target) {
  return invoke("project_open", { target });
}

/** Save the document into <root>/game.rpgatlas (atomic + rolling backup). */
export function projectSave(root, documentJson) {
  return invoke("project_save", { root, documentJson });
}

/** The recents registry as a JSON string ("[]" when absent/corrupt). */
export function recentsList() {
  return invoke("recents_list");
}

/** Upsert a recent to the front (dedupe by path, cap 12). */
export function recentsTouch(path, name) {
  return invoke("recents_touch", { path, name });
}

/** Remove a recent by exact path. */
export function recentsRemove(path) {
  return invoke("recents_remove", { path });
}

/** Reveal the project folder in the OS file manager. */
export function projectReveal(root) {
  return invoke("project_reveal", { root });
}
