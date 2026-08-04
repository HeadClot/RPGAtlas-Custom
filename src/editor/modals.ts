/* RPGAtlas — src/editor/modals.ts
   Modal framework + reusable lightweight popup menu.
   Verbatim move from the editor monolith (Phase 1 Stage C, Package 1):
   logic unchanged, closure vars already routed through editor-state.ts.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { t, editorState as S } from "./editor-state";
import { $, h } from "./dom";

  export const modalRoot = () => $("modal-root");
  export function modal(opts: any) {
    const overlay = h("div", { class: "overlay" });
    const win = h("div", { class: "modal " + (opts.wide ? "wide " : "") + (opts.resizable ? "resizable " : "") + (opts.class || "") });
    win.appendChild(h("div", { class: "modal-title" }, t(opts.title || "")));
    const body = h("div", { class: "modal-body" });
    if (opts.content) body.appendChild(opts.content);
    win.appendChild(body);
    let onKey: any = null;
    function close(result?: any) {
      if (onKey) document.removeEventListener("keydown", onKey);
      overlay.remove();
      if (opts.onClose) opts.onClose(result);
    }
    // A caller can supply a fully custom footer node (its own button layout); otherwise we
    // generate the standard right-aligned button row from opts.buttons.
    if (opts.footer) {
      win.appendChild(opts.footer);
    } else {
      const btnrow = h("div", { class: "modal-btns" });
      (opts.buttons || [{ label: "Close" }]).forEach((b: any) => {
        btnrow.appendChild(h("button", {
          class: b.primary ? "primary" : "",
          onclick() { if (b.onClick) b.onClick(close); else close(); },
        }, t(b.label)));
      });
      win.appendChild(btnrow);
    }
    overlay.appendChild(win);
    overlay.addEventListener("mousedown", (e: any) => { if (e.target === overlay && opts.dismissable !== false) close(); });
    // Opt-in keyboard shortcuts for small dialogs: Enter = primary (OK/Save), Esc = Cancel/Close.
    // Only the topmost dialog responds, and Enter is ignored while typing in a textarea/select so
    // multi-line fields (Show Text, Script) keep their newline behavior.
    if (opts.dialogKeys) {
      const runBtn = (b: any) => { if (!b) return; if (b.onClick) b.onClick(close); else close(); };
      onKey = (e: any) => {
        if (overlay !== modalRoot().lastElementChild) return;
        if (e.key === "Escape") {
          const cancel = (opts.buttons || []).find((b: any) => b.label && /^(cancel|close|no)$/i.test(b.label));
          if (cancel) { e.preventDefault(); runBtn(cancel); }
          else if (opts.dismissable !== false) { e.preventDefault(); close(); }
        } else if (e.key === "Enter") {
          const ae: any = document.activeElement, tag = ae && ae.tagName;
          if (tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || (ae && ae.isContentEditable)) return;
          const primary = (opts.buttons || []).find((b: any) => b.primary);
          if (primary) { e.preventDefault(); runBtn(primary); }
        }
      };
      document.addEventListener("keydown", onKey);
    }
    modalRoot().appendChild(overlay);
    return { close, body, el: win };
  }
  export function confirmBox(text: any, onYes: any) {
    modal({
      title: "Confirm",
      content: h("div", null, text),
      buttons: [
        { label: "OK", primary: true, onClick(c: any) { c(); onYes(); } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }

  // Reusable lightweight popup menu (reuses the menu-drop / menu-item / mi-key / menu-sep CSS that
  // the event-editor menus use). `items` is an array of "separator" or
  // { label, key?, enabled?, onClick, submenu? }. A submenu (its own items array) opens to the side
  // on hover; entering a different top-level row closes it. NOTE: openCmdMenu/openPageMenu predate
  // this and hand-roll the same pattern — left as-is to avoid regressions.
  export function closePopupMenu() {
    if (S.popupSubTimer) { clearTimeout(S.popupSubTimer); S.popupSubTimer = null; }
    if (!S.popupMenuEl) return;
    S.popupMenuEl.remove(); S.popupMenuEl = null;
    document.removeEventListener("mousedown", onPopupOutside, true);
    document.removeEventListener("keydown", onPopupKey, true);
  }
  function onPopupOutside(e: any) { if (S.popupMenuEl && !S.popupMenuEl.contains(e.target)) closePopupMenu(); }
  function onPopupKey(e: any) { if (e.key === "Escape") { e.preventDefault(); closePopupMenu(); } }
  function buildPopupList(items: any, isSub: any) {
    const menu = h("div", { class: "menu-drop" + (isSub ? " menu-sub" : "") });
    const rows: any[] = [];
    for (const it of items) {
      if (it === "separator") { menu.appendChild(h("div", { class: "menu-sep" })); continue; }
      const on = it.enabled !== false;
      const hasSub = Array.isArray(it.submenu) && it.submenu.length;
      const rowEl = h("div", { class: "menu-item" + (on ? "" : " disabled") },
        h("span", { class: "mi-label" }, it.label),
        it.key ? h("span", { class: "mi-key" }, it.key) : (hasSub ? h("span", { class: "mi-key" }, "▸") : null));
      if (!isSub) {
        rowEl.addEventListener("mouseenter", () => {
          // A pass-through (mouse skimming across rows) shouldn't flash a submenu open: defer the
          // open behind a short hover-intent delay, cancelled if the pointer leaves first.
          if (S.popupSubTimer) { clearTimeout(S.popupSubTimer); S.popupSubTimer = null; }
          rows.forEach((r) => { if (r !== rowEl && r._sub) { r._sub.remove(); r._sub = null; } });
          if (hasSub && on && !rowEl._sub) {
            S.popupSubTimer = setTimeout(() => {
              S.popupSubTimer = null;
              if (rowEl._sub) return;
              const sub = buildPopupList(it.submenu, true);
              rowEl.appendChild(sub);
              rowEl._sub = sub;
              if (sub.getBoundingClientRect().right > window.innerWidth - 4) sub.classList.add("flip-left");
            }, 220);
          }
        });
        rowEl.addEventListener("mouseleave", () => {
          // Cancel a not-yet-fired open; an already-open submenu stays (it's a child of this row, so
          // moving onto it doesn't fire this leave) until a different row is hovered.
          if (S.popupSubTimer) { clearTimeout(S.popupSubTimer); S.popupSubTimer = null; }
        });
      }
      if (on && !hasSub) {
        rowEl.addEventListener("mousedown", (e: any) => { e.stopPropagation(); closePopupMenu(); it.onClick(); });
      }
      rows.push(rowEl);
      menu.appendChild(rowEl);
    }
    return menu;
  }
  export function showPopupMenu(x: any, y: any, items: any) {
    closePopupMenu();
    const menu = buildPopupList(items, false);
    document.body.appendChild(menu);
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - menu.offsetWidth - 4)) + "px";
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - menu.offsetHeight - 4)) + "px";
    S.popupMenuEl = menu;
    document.addEventListener("mousedown", onPopupOutside, true);
    document.addEventListener("keydown", onPopupKey, true);
  }
