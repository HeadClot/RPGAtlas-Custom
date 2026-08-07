/* RPGAtlas — player touch controls.
   The controls are player-side presentation only: they inject transient
   logical actions into runtime/input.js and never alter project bindings or
   saved data. GPL-3.0-or-later (see LICENSE). */

export interface VirtualInputPort {
  setVirtualAction(action: string, held: boolean): void;
  clearVirtualActions(): void;
}

export interface TouchControlsOptions {
  stage: HTMLElement;
  input: VirtualInputPort;
  window?: Window;
  document?: Document;
  force?: boolean;
}

const CONTROL_DEFINITIONS = [
  { className: "touch-dpad-up", label: "Move up", actions: ["up"] },
  { className: "touch-dpad-down", label: "Move down", actions: ["down"] },
  { className: "touch-dpad-left", label: "Move left", actions: ["left"] },
  { className: "touch-dpad-right", label: "Move right", actions: ["right"] },
  { className: "touch-action-a", label: "Confirm or jump", actions: ["ok", "jump"] },
  { className: "touch-action-b", label: "Cancel or menu", actions: ["cancel"] },
  { className: "touch-action-x", label: "Attack", actions: ["attack"] },
  { className: "touch-action-y", label: "Dash", actions: ["dash"] },
  { className: "touch-action-hud", label: "Toggle HUD", actions: ["hud"] },
] as const;

export function hasTouchInput(
  win: Window | null = typeof window !== "undefined" ? window : null,
  nav: Navigator | null = typeof navigator !== "undefined" ? navigator : null,
): boolean {
  if (!win || !nav) return false;
  if (Number(nav.maxTouchPoints) > 0) return true;
  return !!win.matchMedia?.("(pointer: coarse)").matches;
}

function isPortrait(win: Window): boolean {
  const orientation = win.matchMedia?.("(orientation: portrait)");
  if (orientation) return orientation.matches;
  return win.innerHeight > win.innerWidth;
}

type PointerState = { actions: readonly string[]; button: HTMLButtonElement };

export class TouchControls {
  private readonly stage: HTMLElement;
  private readonly input: VirtualInputPort;
  private readonly win: Window;
  private readonly doc: Document;
  private readonly root: HTMLDivElement | null;
  private readonly hint: HTMLDivElement | null;
  private readonly pointers = new Map<number, PointerState>();
  private readonly actionRefs = new Map<string, number>();
  private readonly onViewportChange = () => this.refresh();
  private readonly onWindowBlur = () => this.releaseAll();
  private readonly onDocumentPointerUp = (event: PointerEvent) => this.release(event.pointerId);
  private readonly onDocumentPointerCancel = (event: PointerEvent) => this.release(event.pointerId);
  private readonly onVisibilityChange = () => {
    if (this.doc.hidden) this.releaseAll();
  };

  constructor(options: TouchControlsOptions) {
    this.stage = options.stage;
    this.input = options.input;
    this.win = options.window || window;
    this.doc = options.document || document;

    if (!options.force && !hasTouchInput(this.win, this.win.navigator)) {
      this.root = null;
      this.hint = null;
      return;
    }

    this.root = this.buildControls();
    this.hint = this.buildOrientationHint();
    this.stage.dataset.touchControls = "enabled";
    this.win.addEventListener("resize", this.onViewportChange);
    this.win.addEventListener("orientationchange", this.onViewportChange);
    this.win.visualViewport?.addEventListener("resize", this.onViewportChange);
    this.win.addEventListener("blur", this.onWindowBlur);
    this.doc.addEventListener("pointerup", this.onDocumentPointerUp, true);
    this.doc.addEventListener("pointercancel", this.onDocumentPointerCancel, true);
    this.doc.addEventListener("visibilitychange", this.onVisibilityChange);
    this.refresh();
  }

  private buildControls(): HTMLDivElement {
    const root = this.doc.createElement("div");
    root.className = "touch-controls";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Touch controls");

    const dpad = this.doc.createElement("div");
    dpad.className = "touch-dpad";
    root.appendChild(dpad);
    const actions = this.doc.createElement("div");
    actions.className = "touch-actions";
    root.appendChild(actions);

    for (const definition of CONTROL_DEFINITIONS) {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.className = "touch-control " + definition.className;
      button.textContent = definition.className.includes("touch-action-")
        ? definition.className.replace("touch-action-", "").toUpperCase()
        : "";
      button.setAttribute("aria-label", definition.label);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("contextmenu", (event) => event.preventDefault());
      button.addEventListener("pointerdown", (event) => this.press(button, event, definition.actions));
      button.addEventListener("pointerup", (event) => this.release(event.pointerId));
      button.addEventListener("pointercancel", (event) => this.release(event.pointerId));
      button.addEventListener("lostpointercapture", (event) => this.release(event.pointerId));
      (definition.className.startsWith("touch-dpad-") ? dpad : actions).appendChild(button);
    }

    this.stage.appendChild(root);
    return root;
  }

  private buildOrientationHint(): HTMLDivElement {
    const hint = this.doc.createElement("div");
    hint.className = "touch-rotate-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    hint.innerHTML =
      '<div class="touch-rotate-icon" aria-hidden="true">↻</div>' +
      "<strong>Rotate your device</strong><span>RPGAtlas games play in landscape.</span>";
    (this.stage.parentElement || this.doc.body).appendChild(hint);
    return hint;
  }

  private press(button: HTMLButtonElement, event: PointerEvent, actions: readonly string[]): void {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    event.preventDefault();
    event.stopPropagation();
    if (this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { actions, button });
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      /* Some embedded WebViews do not implement pointer capture. */
    }
    button.classList.add("is-pressed");
    button.setAttribute("aria-pressed", "true");
    for (const action of actions) {
      const refs = (this.actionRefs.get(action) || 0) + 1;
      this.actionRefs.set(action, refs);
      if (refs === 1) this.input.setVirtualAction(action, true);
    }
  }

  private release(pointerId: number): void {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return;
    this.pointers.delete(pointerId);
    pointer.button.classList.remove("is-pressed");
    pointer.button.setAttribute("aria-pressed", "false");
    for (const action of pointer.actions) {
      const refs = Math.max(0, (this.actionRefs.get(action) || 0) - 1);
      if (refs) this.actionRefs.set(action, refs);
      else {
        this.actionRefs.delete(action);
        this.input.setVirtualAction(action, false);
      }
    }
  }

  private releaseAll(): void {
    for (const pointerId of Array.from(this.pointers.keys())) this.release(pointerId);
    this.input.clearVirtualActions();
    this.actionRefs.clear();
  }

  refresh(): void {
    if (!this.root || !this.hint) return;
    const portrait = isPortrait(this.win);
    this.root.hidden = portrait;
    this.hint.hidden = !portrait;
    this.stage.dataset.touchPortrait = portrait ? "true" : "false";
    if (portrait) this.releaseAll();
  }

  destroy(): void {
    if (!this.root || !this.hint) return;
    this.releaseAll();
    this.win.removeEventListener("resize", this.onViewportChange);
    this.win.removeEventListener("orientationchange", this.onViewportChange);
    this.win.visualViewport?.removeEventListener("resize", this.onViewportChange);
    this.win.removeEventListener("blur", this.onWindowBlur);
    this.doc.removeEventListener("pointerup", this.onDocumentPointerUp, true);
    this.doc.removeEventListener("pointercancel", this.onDocumentPointerCancel, true);
    this.doc.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.root.remove();
    this.hint.remove();
    delete this.stage.dataset.touchControls;
    delete this.stage.dataset.touchPortrait;
  }
}

export function mountTouchControls(stage: HTMLElement, input: VirtualInputPort): TouchControls {
  return new TouchControls({ stage, input });
}
