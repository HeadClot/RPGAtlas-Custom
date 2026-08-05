/* RPGAtlas — Database ▸ Attack Profiles and field-combat authoring helpers. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S } from "../core/editor-state";
import { h, nIn, sel, field, row, dbOpts } from "../core/dom";
import { listFormTab, nameRefresher } from "./shared";
import { swordHitboxAt } from "../../shared/sim/action-combat";

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
  wrap.appendChild(h("div", { class: "dim" }, "60 Hz attack timeline — " + total + " frames"));
  const bar = h("div", { style: "display:flex;height:26px;border:1px solid #526080;border-radius:4px;overflow:hidden;margin:6px 0" });
  for (const [label, frames, color] of phases) {
    if (!frames) continue;
    const cell = h("div", { title: label + ": " + frames + " frames", style: "flex:" + frames + " 1 0;background:" + color + ";color:#fff;font-size:11px;text-align:center;padding-top:5px;min-width:34px" }, label + " " + frames);
    bar.appendChild(cell);
  }
  wrap.appendChild(bar);
  return wrap;
}

/** Directional geometry preview for the four cardinal sword facings. The
 * numbers come directly from the shared hitbox primitive, so this is also a
 * quick authoring/debug check for the server-side collision contract. */
export function directionalHitboxPreview() {
  const wrap = h("div", { class: "combat-hitbox-preview" });
  wrap.appendChild(h("div", { class: "dim" }, "Directional hitbox preview"));
  const rowEl = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin:6px 0" });
  for (const [label, dir] of [["Down", 0], ["Left", 1], ["Right", 2], ["Up", 3]] as const) {
    const r = swordHitboxAt(1, 1, dir);
    rowEl.appendChild(h("div", {
      title: label + " hitbox: " + [r.x, r.y, r.w, r.h].map((n) => n.toFixed(2)).join(", "),
      style: "width:78px;height:42px;border:1px solid #526080;border-radius:4px;padding:4px;font-size:10px;text-align:center",
    }, label + "\n" + r.w.toFixed(2) + " × " + r.h.toFixed(2)));
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
    body.textContent = "Damage " + d + " · range " + (Number(e.range) || 1) + " · directional hitbox · " +
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
    box.appendChild(directionalHitboxPreview());
    box.appendChild(profilePreview(e));
  },
});

export function combatProfileIdField(target: any, label = "Attack profile") {
  if (target.profileId == null) target.profileId = 0;
  return field(label, sel(target, "profileId", attackProfileOptions()));
}

export function combatPresentationFields(target: any) {
  return row(field("Attack VFX", sel(target, "animationId", animationOptions())), field("Hit VFX", sel(target, "hitAnimationId", animationOptions())), field("Attack SFX", sel(target, "attackSound", soundOptions())), field("Hit SFX", sel(target, "hitSound", soundOptions())));
}

export function combatSourceNote(text: string) {
  return h("div", { class: "dim" }, text);
}
