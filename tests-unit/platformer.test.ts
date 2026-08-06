import {
  DEFAULT_PLATFORMER_SETTINGS,
  PLATFORMER_COLLISION,
  createPlatformerBody,
  normalizePlatformerSettings,
  respawnPlatformerBody,
  stepPlatformerBody,
  type PlatformerCollisionKind,
} from "../src/shared/sim/platformer";

function world(rows: string[]) {
  const height = rows.length;
  const width = rows[0].length;
  const cells: PlatformerCollisionKind[] = rows.join("").split("").map((c) =>
    c === "#" ? PLATFORMER_COLLISION.SOLID : c === "-" ? PLATFORMER_COLLISION.ONE_WAY : PLATFORMER_COLLISION.EMPTY,
  );
  return { width, height, kindAt: (x: number, y: number) => cells[y * width + x] || PLATFORMER_COLLISION.EMPTY };
}

const idle = { axis: 0 as const, jumpPressed: false, jumpHeld: false, downHeld: false };

describe("platformer simulation", () => {
  it("normalizes malformed settings and keeps the forgiving defaults", () => {
    expect(normalizePlatformerSettings({ gravity: -10, coyoteFrames: 99 }).gravity).toBe(0.1);
    expect(normalizePlatformerSettings({ coyoteFrames: 99 }).coyoteFrames).toBe(30);
    expect(DEFAULT_PLATFORMER_SETTINGS.jumpBufferFrames).toBe(6);
  });

  it("accelerates, coasts, and applies ground friction", () => {
    const body = createPlatformerBody(1, 1);
    body.grounded = true;
    stepPlatformerBody(body, { ...idle, axis: 1 }, world([".....", ".....", "#####"]));
    expect(body.vx).toBeGreaterThan(0);
    const speed = body.vx;
    stepPlatformerBody(body, idle, world([".....", ".....", "#####"]));
    expect(body.vx).toBeLessThan(speed);
  });

  it("jumps, supports variable height, coyote time, and buffered landing", () => {
    const w = world([".....", ".....", "#####"]);
    const body = createPlatformerBody(1, 1.1);
    body.grounded = true;
    const jumped = stepPlatformerBody(body, { ...idle, jumpPressed: true, jumpHeld: true }, w);
    expect(jumped.jumped).toBe(true);
    expect(body.vy).toBeLessThan(0);

    const short = createPlatformerBody(1, 1.1);
    short.grounded = true;
    stepPlatformerBody(short, { ...idle, jumpPressed: true, jumpHeld: true }, w);
    stepPlatformerBody(short, idle, w);
    expect(short.vy).toBeGreaterThan(body.vy);

    const coyote = createPlatformerBody(1, 1.1);
    coyote.grounded = false;
    coyote.coyoteFrames = 2;
    expect(stepPlatformerBody(coyote, { ...idle, jumpPressed: true, jumpHeld: true }, w).jumped).toBe(true);

    const buffered = createPlatformerBody(1, 0.2);
    buffered.vy = 3;
    stepPlatformerBody(buffered, { ...idle, jumpPressed: true, jumpHeld: true }, w);
    expect(buffered.jumpBufferFrames).toBeGreaterThan(0);
  });

  it("arms coyote time when walking off a ledge", () => {
    const ledge = world([".....", "#####"]);
    const body = createPlatformerBody(4.2, 0.1);
    body.grounded = true;

    for (let i = 0; i < 13; i++) stepPlatformerBody(body, { ...idle, axis: 1 }, ledge);
    expect(body.grounded).toBe(false);
    expect(body.coyoteFrames).toBeGreaterThan(0);
    expect(stepPlatformerBody(body, { ...idle, jumpPressed: true, jumpHeld: true }, ledge).jumped).toBe(true);
  });

  it("resolves full solids, ceilings, one-way platforms, and drop-through", () => {
    const w = world([".....", "..#..", "..-..", "#####"]);
    const body = createPlatformerBody(1.1, 1.4);
    body.vx = 20;
    stepPlatformerBody(body, { ...idle, axis: 1 }, w);
    expect(body.x).toBeLessThan(2);

    const oneWay = createPlatformerBody(2.1, 0.95);
    oneWay.vy = 8;
    stepPlatformerBody(oneWay, idle, w, undefined, 1 / 10);
    expect(oneWay.grounded).toBe(true);
    expect(oneWay.y).toBeCloseTo(2 - oneWay.height);

    const falling = createPlatformerBody(2.1, 1.1);
    falling.grounded = true;
    stepPlatformerBody(falling, { ...idle, jumpPressed: true, jumpHeld: false, downHeld: true }, w);
    expect(falling.grounded).toBe(false);
  });

  it("reports falls and resets deterministically at a checkpoint", () => {
    const body = createPlatformerBody(1, 5);
    const result = stepPlatformerBody(body, idle, world(["...", "...", "..."]));
    expect(result.fell).toBe(true);
    respawnPlatformerBody(body, 0.2, 0.5, { respawnInvulnerabilityFrames: 60 });
    expect(body).toMatchObject({ x: 0.2, y: 0.5, vx: 0, vy: 0, invulnerableFrames: 60 });
  });
});
