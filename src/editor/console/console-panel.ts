/* RPGAtlas — src/editor/console/console-panel.ts
   The Console dock panel (terminal + rich output): an `atlas>` prompt with
   ↑/↓ history and Tab completion over a scrolling log that renders the
   structured ConsoleResult blocks — plain/toned text, tables, and clickable
   links that jump into the editor. Mounted lazily by the dock (first time the
   tab is shown); importing this module registers every command group and
   installs the window.AtlasConsole programmatic surface.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import { h } from "../dom";
import {
  registerConsoleCommand, executeConsoleLine, completeLine, done,
  installConsoleApi,
  type ConsoleBlock, type ConsoleResult,
} from "./registry";
// Side-effect imports: each module registers its command group.
import "./commands-inspect";
import "./commands-build";
import "./commands-playtest";
import "./commands-data";

export const CONSOLE_PANEL = "console";

const HISTORY_KEY = "rpgatlas_console_history";
const HISTORY_MAX = 100;
const LOG_MAX = 800; // rendered lines kept before the oldest are dropped

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") || []; } catch { return []; }
}
function saveHistory(hist: string[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-HISTORY_MAX))); } catch { /* ignore */ }
}

export function mountConsole(): HTMLElement {
  const log = h("div", { class: "console-log", role: "log", "aria-label": "Console output" });
  const input = h("input", {
    class: "console-input", type: "text", spellcheck: "false",
    autocomplete: "off", "aria-label": "Console command",
  }) as HTMLInputElement;
  const root = h("div", { class: "console-root dock-panel-content" },
    log,
    h("div", { class: "console-input-row", onclick: () => input.focus() },
      h("span", { class: "console-prompt" }, "atlas>"),
      input),
  );

  const history = loadHistory();
  let histPos = history.length;
  let draft = "";

  const trim = () => { while (log.childElementCount > LOG_MAX) log.firstElementChild!.remove(); };
  const scrollDown = () => { log.scrollTop = log.scrollHeight; };
  const append = (el: HTMLElement) => { log.appendChild(el); trim(); scrollDown(); };

  function renderBlock(b: ConsoleBlock): HTMLElement {
    if (b.kind === "text") return h("div", { class: "console-line" + (b.tone ? " console-" + b.tone : "") }, b.text);
    if (b.kind === "link") {
      return h("div", { class: "console-line" },
        h("a", { class: "console-link", href: "#", onclick(e: Event) { e.preventDefault(); b.run(); } }, b.text));
    }
    if (b.kind === "table") {
      const tbl = h("table", { class: "console-table" },
        h("thead", null, h("tr", null, ...b.head.map((c) => h("th", null, c)))));
      const body = h("tbody", null);
      for (const row of b.rows) body.appendChild(h("tr", null, ...row.map((c) => h("td", null, c))));
      tbl.appendChild(body);
      return tbl;
    }
    return h("pre", { class: "console-json" }, JSON.stringify(b.data, null, 2));
  }

  function renderResult(r: ConsoleResult) {
    for (const b of r.blocks) append(renderBlock(b));
  }

  // `clear` needs the log element, so it registers here rather than in a
  // commands module. Registration is keyed by name — remounting is harmless.
  registerConsoleCommand({
    name: "clear",
    group: "Console",
    summary: "Clear the console output",
    usage: "clear",
    run() { log.innerHTML = ""; return done([]); },
  });

  let busy = false;
  async function submit() {
    const line = input.value.trim();
    if (!line || busy) return;
    input.value = "";
    if (history[history.length - 1] !== line) { history.push(line); saveHistory(history); }
    histPos = history.length;
    draft = "";
    append(h("div", { class: "console-line console-echo" }, "atlas> " + line));
    busy = true;
    root.classList.add("console-busy");
    try {
      renderResult(await executeConsoleLine(line));
    } finally {
      busy = false;
      root.classList.remove("console-busy");
      input.focus();
    }
  }

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); void submit(); }
    else if (e.key === "ArrowUp") {
      if (!histPos) return;
      e.preventDefault();
      if (histPos === history.length) draft = input.value;
      histPos--;
      input.value = history[histPos];
    } else if (e.key === "ArrowDown") {
      if (histPos >= history.length) return;
      e.preventDefault();
      histPos++;
      input.value = histPos === history.length ? draft : history[histPos];
    } else if (e.key === "Tab") {
      e.preventDefault();
      const matches = completeLine(input.value);
      if (matches.length === 1) input.value = matches[0] + " ";
      else if (matches.length > 1) {
        append(h("div", { class: "console-line console-dim" }, matches.join("   ")));
      }
    }
    e.stopPropagation(); // keep editor shortcuts (Q/W/E, digits…) out of typing
  });
  input.addEventListener("keyup", (e: KeyboardEvent) => e.stopPropagation());
  input.addEventListener("keypress", (e: KeyboardEvent) => e.stopPropagation());

  // Friendly first contact — poking around is safe.
  renderResult(done([
    { kind: "text", text: "RPGAtlas Console — the engine's power-user corner." },
    { kind: "text", text: "Type help and press Enter to see everything it can do. Looking around can't break your project.", tone: "dim" },
  ]));

  installConsoleApi(window);
  return root;
}
