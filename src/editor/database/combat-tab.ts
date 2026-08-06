/* RPGAtlas — Database ▸ Attack Profiles and field-combat authoring helpers. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S } from "../core/editor-state";
import { h, nIn, sel, chk, tIn, field, row, dbOpts } from "../core/dom";
import { touch } from "../persistence";
import { listFormTab, nameRefresher } from "./shared";
import { attackHitboxesAt, swordHitboxAt } from "../../shared/sim/action-combat";
import { validateCombatProject } from "../../shared/sim/combat-profiles";

export function attackProfileOptions(none = "(default attack)") {
  return dbOpts((S.proj.attackProfiles || (S.proj.attackProfiles = [])) as any, none);
}

export function animationOptions(none = "(none)") {
  return dbOpts(S.proj.animations || [], none);
}

export function soundOptions(none = "(none)") {
  const sounds = Object.keys((S.proj.system && S.proj.system.sounds) || {});
  return [{ v: "", l: none }].concat(sounds.map((v) => ({ v, l: v }))) as any;
}

/** A small DOM-only timeline that mirrors the shared profile frame contract. */
export function attackTimeline(profile: any) {
  const wrap = h("div", { class: "combat-timeline" });
  const phases = [
    ["Telegraph", Number(profile.windupFrames) || 0, "#d8a94a"],
    ["Active hit", Math.max(1, Number(profile.activeFrames) || 1), "#e85f67"],
    ["Recovery", Number(profile.recoveryFrames) || 0, "#6d88bd"],
  ] as const;
  const total = Math.max(1, phases.reduce((n, p) => n + p[1], 0));
  const cooldown = Math.max(0, Number(profile.cooldown) || 0);
  wrap.appendChild(h("div", { class: "dim" }, "60 Hz attack timeline — " + total + " frames · cooldown " + cooldown + " frames"));
  const bar = h("div", { style: "display:flex;height:26px;border:1px solid #526080;border-radius:4px;overflow:hidden;margin:6px 0" });
  for (const [label, frames, color] of phases) {
    if (!frames) continue;
    const cell = h("div", { title: label + ": " + frames + " frames", style: "flex:" + frames + " 1 0;background:" + color + ";color:#fff;font-size:11px;text-align:center;padding-top:5px;min-width:34px" }, label + " " + frames);
    bar.appendChild(cell);
  }
  wrap.appendChild(bar);
  return wrap;
}

/** Geometry preview shared with the runtime hit-test contract. */
export function directionalHitboxPreview(profile: any = {}) {
  const wrap = h("div", { class: "combat-hitbox-preview" });
  const shape = String(profile.hitbox || "directional");
  const range = Math.max(1, Number(profile.range) || 1);
  wrap.appendChild(h("div", { class: "dim" }, "Hitbox preview · " + shape + " · range " + range));
  const rowEl = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin:6px 0" });
  for (const [label, dir] of [["Down", 0], ["Left", 1], ["Right", 2], ["Up", 3]] as const) {
    const boxes = attackHitboxesAt(1, 1, dir, shape, range);
    const r = boxes[0] || swordHitboxAt(1, 1, dir);
    rowEl.appendChild(h("div", {
      title: label + " hitbox: " + (boxes.length ? boxes.map((b) => [b.x, b.y, b.w, b.h].map((n) => n.toFixed(2)).join(", ")).join(" · ") : "Manhattan radius " + range),
      style: "width:78px;height:42px;border:1px solid #526080;border-radius:4px;padding:4px;font-size:10px;text-align:center",
    }, label + "\n" + (boxes.length ? r.w.toFixed(2) + " × " + r.h.toFixed(2) : "radius " + range)));
  }
  wrap.appendChild(rowEl);
  return wrap;
}

function profilePreview(e: any) {
  const wrap = h("div", { class: "combat-profile-preview" });
  const title = h("div", { class: "subhead" }, "Resolved attack preview");
  const body = h("div", { class: "dim" });
  const refresh = () => {
    const d = Number(e.damage) || 0;
    body.textContent = "Damage " + d + " · range " + (Number(e.range) || 1) + " · " + (e.hitbox || "directional") + " hitbox · " +
      (Number(e.windupFrames) || 0) + "/" + (Number(e.activeFrames) || 1) + "/" + (Number(e.recoveryFrames) || 0) + " frames";
  };
  wrap.append(title, body);
  wrap.addEventListener("input", refresh);
  refresh();
  return wrap;
}

export const attackProfilesTab = () => listFormTab({
  kind: "attackProfiles",
  list: () => (S.proj.attackProfiles || (S.proj.attackProfiles = [])) as any,
  blank: () => ({ id: 0, name: "Attack", damage: 1, damageScale: 1, windupFrames: 3, activeFrames: 9,
    recoveryFrames: 6, cooldown: 0, range: 1, knockbackTiles: 1, staggerFrames: 10,
    hitbox: "directional", animationId: 0, telegraphAnimationId: 0, hitAnimationId: 0,
    hurtAnimationId: 0, defeatAnimationId: 0, reviveAnimationId: 0,
    attackSound: "combatAttack", telegraphSound: "combatTelegraph", hitSound: "combatHit",
    hurtSound: "combatHurt", defeatSound: "combatDefeat", reviveSound: "combatRevive" }),
  form(e: any, box: any, redrawList: any) {
    box.appendChild(row(field("Name", nameRefresher(e, redrawList)), field("Damage", nIn(e, "damage", 0, 99999)), field("Damage scale", nIn(e, "damageScale", 0, 100, 0.05))));
    box.appendChild(row(field("Wind-up / telegraph", nIn(e, "windupFrames", 0, 180)), field("Active frames", nIn(e, "activeFrames", 1, 180)), field("Recovery frames", nIn(e, "recoveryFrames", 0, 600)), field("Cooldown", nIn(e, "cooldown", 0, 3600))));
    box.appendChild(row(field("Range", nIn(e, "range", 1, 16)), field("Knockback tiles", nIn(e, "knockbackTiles", 0, 8)), field("Stagger frames", nIn(e, "staggerFrames", 0, 600)), field("Hitbox", sel(e, "hitbox", [{ v: "directional", l: "Directional" }, { v: "adjacent", l: "Adjacent" }, { v: "radius", l: "Radius" }]))));
    box.appendChild(h("div", { class: "subhead" }, "Presentation references"));
    box.appendChild(row(field("Attack VFX", sel(e, "animationId", animationOptions())), field("Telegraph VFX", sel(e, "telegraphAnimationId", animationOptions())), field("Hit VFX", sel(e, "hitAnimationId", animationOptions()))));
    box.appendChild(row(field("Hurt VFX", sel(e, "hurtAnimationId", animationOptions())), field("Defeat VFX", sel(e, "defeatAnimationId", animationOptions())), field("Revive VFX", sel(e, "reviveAnimationId", animationOptions()))));
    box.appendChild(row(field("Attack SFX", sel(e, "attackSound", soundOptions())), field("Telegraph SFX", sel(e, "telegraphSound", soundOptions())), field("Hit SFX", sel(e, "hitSound", soundOptions()))));
    box.appendChild(row(field("Hurt SFX", sel(e, "hurtSound", soundOptions())), field("Defeat SFX", sel(e, "defeatSound", soundOptions())), field("Revive SFX", sel(e, "reviveSound", soundOptions()))));
    box.appendChild(attackTimeline(e));
    box.appendChild(directionalHitboxPreview(e));
    box.appendChild(profilePreview(e));
    const issues = validateCombatProject(S.proj).filter((issue) => issue.where === "Attack Profile: " + (e.name || e.id));
    if (issues.length) box.appendChild(h("div", { class: "dim" }, "Validation: " + issues.map((issue) => issue.message).join(" · ")));
  },
});

export function combatProfileIdField(target: any, label = "Attack profile") {
  const input = sel(target, "profileId", attackProfileOptions());
  if (target.profileId == null) input.value = "0";
  return field(label, input);
}

export function combatAttackOverrideFields(target: any) {
  return [
    row(combatProfileIdField(target), field("Damage override", nIn(target, "damage", 0, 99999)), field("Damage scale", nIn(target, "damageScale", 0, 100, 0.05)), field("Range", nIn(target, "range", 1, 16)), field("Hitbox", sel(target, "hitbox", [{ v: "directional", l: "Directional" }, { v: "adjacent", l: "Adjacent" }, { v: "radius", l: "Radius" }]))),
    row(field("Wind-up", nIn(target, "windupFrames", 0, 180)), field("Active", nIn(target, "activeFrames", 1, 180)), field("Recovery", nIn(target, "recoveryFrames", 0, 600)), field("Cooldown", nIn(target, "cooldown", 0, 3600))),
    row(field("Knockback", nIn(target, "knockbackTiles", 0, 8)), field("Stagger", nIn(target, "staggerFrames", 0, 600))),
  ];
}

export function combatPresentationFields(target: any, mode: "attack" | "full" = "attack") {
  const rows = [
    row(field("Attack VFX", sel(target, "animationId", animationOptions())), field("Telegraph VFX", sel(target, "telegraphAnimationId", animationOptions())), field("Hit VFX", sel(target, "hitAnimationId", animationOptions())), field("Attack SFX", sel(target, "attackSound", soundOptions())), field("Telegraph SFX", sel(target, "telegraphSound", soundOptions())), field("Hit SFX", sel(target, "hitSound", soundOptions()))),
  ];
  if (mode === "full") {
    rows.unshift(row(field("Hurt VFX", sel(target, "hurtAnimationId", animationOptions())), field("Defeat VFX", sel(target, "defeatAnimationId", animationOptions())), field("Revive VFX", sel(target, "reviveAnimationId", animationOptions()))));
    rows.push(row(field("Hurt SFX", sel(target, "hurtSound", soundOptions())), field("Defeat SFX", sel(target, "defeatSound", soundOptions())), field("Revive SFX", sel(target, "reviveSound", soundOptions()))));
  }
  return h("div", { class: "combat-presentation-fields" }, ...rows);
}

export function combatResetButton(target: any, keys: string[], label = "Reset page overrides") {
  return h("button", { class: "mini", type: "button", onclick(ev: any) {
    ev.preventDefault();
    for (const key of keys) delete target[key];
    touch();
    const root = (ev.currentTarget as HTMLElement)?.parentElement;
    if (root) root.dispatchEvent(new Event("input", { bubbles: true }));
  } }, label);
}

export function combatSourceNote(text: string) {
  return h("div", { class: "dim" }, text);
}

export function actionTargetModeOptions() {
  const options: any = [
    { v: "facing", l: "Facing target" }, { v: "nearestEnemy", l: "Nearest enemy" },
    { v: "allEnemies", l: "All enemies" }, { v: "nearestAlly", l: "Nearest ally" },
    { v: "allAllies", l: "All allies" }, { v: "self", l: "Self" }, { v: "radius", l: "Radius" },
  ];
  options.stringValues = true;
  return options;
}

/** Shared editor fields for Skill and Item real-time action profiles. */
export function actionAbilityFields(target: any, label = "Action Combat") {
  target.enabled = target.enabled !== false;
  if (target.consumeOnStart == null) target.consumeOnStart = true;
  return h("div", { class: "action-ability-fields" },
    h("div", { class: "subhead" }, label),
    row(field("Enabled", chk(target, "enabled")), field("Target mode", sel(target, "targetMode", actionTargetModeOptions())),
      field("Hitbox", sel(target, "hitbox", [{ v: "directional", l: "Directional" }, { v: "adjacent", l: "Adjacent" }, { v: "radius", l: "Radius" }])),
      field("Range", nIn(target, "range", 1, 16))),
    row(field("Wind-up", nIn(target, "windupFrames", 0, 180)), field("Active", nIn(target, "activeFrames", 1, 180)),
      field("Recovery", nIn(target, "recoveryFrames", 0, 600)), field("Cooldown", nIn(target, "cooldownFrames", 0, 3600))),
    row(field("MP cost", nIn(target, "mpCost", 0, 999999)), field("TP cost", nIn(target, "tpCost", 0, 999999)),
      field("Damage", nIn(target, "damage", 0, 999999)), field("Damage scale", nIn(target, "damageScale", 0, 100, 0.05))),
    row(field("Knockback", nIn(target, "knockbackTiles", 0, 8)), field("Stagger", nIn(target, "staggerFrames", 0, 600)),
      field("State", sel(target, "stateId", dbOpts(S.proj.states, "(none)"))), field("State chance %", nIn(target, "stateChance", 0, 100))),
    row(field("Consume item at start", chk(target, "consumeOnStart")), field("Formula (optional)", tIn(target, "formula"))),
    combatPresentationFields(target, "full"),
    attackTimeline({ windupFrames: target.windupFrames, activeFrames: target.activeFrames, recoveryFrames: target.recoveryFrames, cooldown: target.cooldownFrames }),
    directionalHitboxPreview(target),
  );
}

export function actionStateFields(target: any) {
  target.enabled = target.enabled !== false;
  return h("div", { class: "action-state-fields" },
    row(field("Enabled", chk(target, "enabled")), field("Duration frames", nIn(target, "durationFrames", 1, 36000)),
      field("Tick interval", nIn(target, "tickIntervalFrames", 1, 36000)), field("Damage per tick", nIn(target, "damagePerTick", -999999, 999999))),
    row(field("Stacking", sel(target, "stacking", [{ v: "refresh", l: "Refresh duration" }, { v: "replace", l: "Replace" }, { v: "stack", l: "Stack" }])),
      field("Max stacks", nIn(target, "maxStacks", 1, 99)), field("Movement rate", nIn(target, "movementRate", 0, 2, 0.05)), field("Attack rate", nIn(target, "attackRate", 0, 2, 0.05))),
    row(field("Stagger rate", nIn(target, "staggerRate", 0, 2, 0.05)), field("Root movement", chk(target, "root")), field("Silence", chk(target, "silence")), field("Invulnerable", chk(target, "invulnerable")), field("Resistance %", nIn(target, "resistance", 0, 100))),
  );
}

/** Eight-slot editor shared by actor/class action defaults. */
export function combatHotbarEditor(target: any, skills: any[], items: any[]) {
  target.hotbar = Array.isArray(target.hotbar) ? target.hotbar : [];
  const wrap = h("div", { class: "minilist" });
  const redraw = () => {
    wrap.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const slot = target.hotbar[i] || { kind: "skill", id: 0 };
      const holder = { v: String(slot.kind || "skill") };
      const id = h("span");
      const redrawId = () => {
        id.innerHTML = "";
        id.appendChild(sel(slot, "id", dbOpts(holder.v === "item" ? items : skills, "(empty)"), (value: any) => {
          if (Number(value) > 0) target.hotbar[i] = slot;
          else delete target.hotbar[i];
          touch();
        }));
      };
      const kind = sel(holder, "v", [{ v: "skill", l: "Skill" }, { v: "item", l: "Item" }], (value: any) => {
        slot.kind = value; slot.id = 0; delete target.hotbar[i]; touch(); redrawId();
      });
      redrawId();
      wrap.appendChild(h("div", { class: "minirow" }, h("span", null, "Slot " + (i + 1)), kind, id));
    }
  };
  redraw();
  return wrap;
}
