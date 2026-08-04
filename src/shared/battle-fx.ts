/* RPGAtlas — src/shared/battle-fx.ts
   Battle visual effects (particle pool, bursts, floating numbers, pulses,
   projectile travel, cast flashes). Extracted verbatim from the js/engine.js
   monolith in Phase 1 (as src/engine/scenes/battle-fx.ts) and moved to shared
   in Phase 5 Stage A so the animation player and the editor's animation
   preview can drive the same primitives; src/engine/scenes/battle-fx.ts
   re-exports from here. Every Phase-1 effect function body is unchanged.

   Phase 5 additions (additive only):
   - fxPoint() also accepts a plain {x,y} point (already in `win` coordinate
     space) beside a DOM element — the map-side animation glue passes points.
   - The returned bundle exposes the pool via spawn()/release(), so the
     animation player's extra emitters (ring/rain/spiral, projectiles,
     flashes, flipbooks) share the same fixed pool instead of allocating.
   GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

function el(tag: string, cls?: string, html?: any): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}

export function createBattleFx(win: any, fxLayer: any): any {
  // Battle effects use a fixed pool so repeated multi-target skills do not
  // continually allocate and discard DOM nodes.
  const particlePool = Array.from({ length: 84 }, () => {
    const p: any = el("i", "fx-particle");
    p._busy = false;
    fxLayer.appendChild(p);
    return p;
  });
  function takeParticle(cls: any): any {
    const p = particlePool.find((node: any) => !node._busy) || particlePool[0];
    p.getAnimations().forEach((a: any) => a.cancel());
    p._busy = true;
    p.className = "fx-particle " + (cls || "");
    p.style.cssText = "";
    return p;
  }
  function releaseParticle(p: any): void {
    p._busy = false;
    p.className = "fx-particle";
    p.style.cssText = "";
    p.textContent = "";
  }
  function fxPoint(target: any): any {
    const wr = win.getBoundingClientRect();
    if (!target) return { x: wr.width * 0.5, y: wr.height * 0.42 };
    // Phase 5: plain {x,y} points (already win-relative) pass through — the
    // map animation glue computes entity screen positions itself.
    if (typeof target.x === "number" && typeof target.y === "number" && !target.getBoundingClientRect) {
      return { x: target.x, y: target.y };
    }
    const r = target.getBoundingClientRect();
    return {
      x: r.left - wr.left + r.width * 0.5,
      y: r.top - wr.top + r.height * 0.43,
    };
  }
  function burst(target: any, kind: any, opts?: any): void {
    opts = opts || {};
    const pt = fxPoint(target);
    const colors: any = {
      hit: ["#fff4cf", "#ffc85a", "#ef694f"],
      crit: ["#ffffff", "#ffe45c", "#ff6b45"],
      fire: ["#fff08a", "#ff9d36", "#e84931"],
      ice: ["#eaffff", "#8edcff", "#5b8cff"],
      thunder: ["#ffffff", "#fff36b", "#77dfff"],
      heal: ["#efffcf", "#79e8a2", "#42cfd0"],
      poison: ["#e5a2ff", "#9c54cf", "#5d338d"],
      status: ["#ffffff", "#d6a3ff", "#8f72e6"],
      death: ["#ffffff", "#9ea8c4", "#4c526b"],
      item: ["#ffffff", "#8edfff", "#ffd76d"],
      dust: ["#d8c39d", "#a88d67", "#73624f"],
    };
    const palette = colors[kind] || [opts.color || "#ffffff"];
    const count =
      opts.count || (kind === "crit" || kind === "death" ? 18 : 11);
    for (let i = 0; i < count; i++) {
      const p = takeParticle("fx-" + kind);
      const angle = Math.random() * Math.PI * 2;
      const distance = (opts.radius || 42) * (0.45 + Math.random() * 0.7);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - (kind === "heal" ? 20 : 0);
      const size = (opts.size || 7) * (0.65 + Math.random() * 0.7);
      p.style.left = pt.x + "px";
      p.style.top = pt.y + "px";
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.background = opts.color || palette[i % palette.length];
      p.style.boxShadow =
        "0 0 " + Math.ceil(size * 1.8) + "px currentColor";
      const anim = p.animate(
        [
          {
            opacity: 0,
            transform: "translate(-50%,-50%) scale(0.2) rotate(0deg)",
          },
          { opacity: 1, offset: 0.18 },
          {
            opacity: 0,
            transform:
              "translate(calc(-50% + " +
              dx +
              "px),calc(-50% + " +
              dy +
              "px)) scale(0.05) rotate(" +
              (180 + rnd(220)) +
              "deg)",
          },
        ],
        {
          duration: opts.duration || 470,
          easing: "cubic-bezier(.18,.75,.25,1)",
        },
      );
      anim.finished
        .then(() => releaseParticle(p))
        .catch(() => releaseParticle(p));
    }
  }
  function floatText(target: any, text: any, kind: any): void {
    const p = takeParticle(
      "fx-number " + (kind ? "fx-number-" + kind : ""),
    );
    const pt = fxPoint(target);
    p.textContent = text;
    p.style.left = pt.x + "px";
    p.style.top = pt.y - 12 + "px";
    const anim = p.animate(
      [
        { opacity: 0, transform: "translate(-50%,0) scale(.65)" },
        {
          opacity: 1,
          transform: "translate(-50%,-12px) scale(1.12)",
          offset: 0.2,
        },
        {
          opacity: 1,
          transform: "translate(-50%,-28px) scale(1)",
          offset: 0.72,
        },
        { opacity: 0, transform: "translate(-50%,-48px) scale(.9)" },
      ],
      { duration: 720, easing: "ease-out" },
    );
    anim.finished
      .then(() => releaseParticle(p))
      .catch(() => releaseParticle(p));
  }
  function pulse(kind: any, color: any): void {
    const p = takeParticle("fx-pulse fx-" + kind);
    p.style.left = "50%";
    p.style.top = "43%";
    p.style.borderColor = color || "#ffffff";
    const anim = p.animate(
      [
        { opacity: 0.8, transform: "translate(-50%,-50%) scale(.1)" },
        { opacity: 0, transform: "translate(-50%,-50%) scale(8)" },
      ],
      { duration: 440, easing: "ease-out" },
    );
    anim.finished
      .then(() => releaseParticle(p))
      .catch(() => releaseParticle(p));
  }
  function skillKind(skill: any): string {
    if (!skill) return "hit";
    const name = String(skill.name || "").toLowerCase();
    if (skill.type === "heal") return "heal";
    if (skill.type === "phys") return "crit";
    if (name.includes("fire") || name.includes("ember")) return "fire";
    if (name.includes("ice")) return "ice";
    if (name.includes("thunder") || name.includes("static"))
      return "thunder";
    if (
      name.includes("venom") ||
      name.includes("spore") ||
      skill.stateId === 1
    )
      return "poison";
    return "status";
  }
  async function travel(source: any, target: any, skill: any): Promise<void> {
    if (!skill || skill.type === "phys" || skill.type === "heal") return;
    const from = fxPoint(source),
      to = fxPoint(target);
    const p = takeParticle("fx-projectile fx-" + skillKind(skill));
    p.style.left = from.x + "px";
    p.style.top = from.y + "px";
    p.style.background = skill.color || "#ffffff";
    const anim = p.animate(
      [
        { opacity: 0, transform: "translate(-50%,-50%) scale(.4)" },
        { opacity: 1, offset: 0.12 },
        {
          opacity: 1,
          transform:
            "translate(calc(-50% + " +
            (to.x - from.x) +
            "px),calc(-50% + " +
            (to.y - from.y) +
            "px)) scale(1.3)",
          offset: 0.88,
        },
        {
          opacity: 0,
          transform:
            "translate(calc(-50% + " +
            (to.x - from.x) +
            "px),calc(-50% + " +
            (to.y - from.y) +
            "px)) scale(2)",
        },
      ],
      { duration: 330, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
    await anim.finished.catch(() => {});
    releaseParticle(p);
  }
  function castFx(source: any, skill: any, targetCount: any): void {
    const kind = skillKind(skill);
    burst(source, kind, {
      count: 8,
      radius: 30,
      color: skill && skill.color,
    });
    if (targetCount > 1) pulse(kind, skill && skill.color);
  }

  return {
    fxPoint, burst, floatText, pulse, skillKind, travel, castFx,
    // Phase 5: pooled-particle access for the animation player's emitters.
    spawn: takeParticle, release: releaseParticle,
  };
}
