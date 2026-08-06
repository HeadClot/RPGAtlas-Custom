/* RPGAtlas — shared platformer movement and collision rules.
   Host-neutral by design: browser, tests, and a future Beacon authority can
   feed the same fixed-step solver without importing DOM or engine modules. */

export const PLATFORMER_COLLISION = {
  AUTO: 0,
  SOLID: 1,
  EMPTY: 2,
  ONE_WAY: 3,
} as const;

export type PlatformerCollisionKind = 0 | 1 | 2 | 3;

export interface PlatformerSettings {
  maxRunSpeed: number;
  groundAcceleration: number;
  airAcceleration: number;
  groundFriction: number;
  gravity: number;
  jumpSpeed: number;
  maxFallSpeed: number;
  jumpCutMultiplier: number;
  coyoteFrames: number;
  jumpBufferFrames: number;
  dropThroughFrames: number;
  respawnInvulnerabilityFrames: number;
  fallMargin: number;
}

export const DEFAULT_PLATFORMER_SETTINGS: PlatformerSettings = {
  maxRunSpeed: 5,
  groundAcceleration: 45,
  airAcceleration: 30,
  groundFriction: 60,
  gravity: 30,
  jumpSpeed: 11.5,
  maxFallSpeed: 16,
  jumpCutMultiplier: 2.2,
  coyoteFrames: 6,
  jumpBufferFrames: 6,
  dropThroughFrames: 8,
  respawnInvulnerabilityFrames: 60,
  fallMargin: 2,
};

export interface PlatformerBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  coyoteFrames: number;
  jumpBufferFrames: number;
  dropThroughFrames: number;
  invulnerableFrames: number;
}

export interface PlatformerInput {
  axis: -1 | 0 | 1;
  jumpPressed: boolean;
  jumpHeld: boolean;
  downHeld: boolean;
}

export interface PlatformerCollisionWorld {
  width: number;
  height: number;
  kindAt(x: number, y: number): PlatformerCollisionKind;
}

export interface PlatformerStepResult {
  landed: boolean;
  jumped: boolean;
  droppedThrough: boolean;
  hitWall: boolean;
  fell: boolean;
}

export function createPlatformerBody(x: number, y: number, width = 0.7, height = 0.9): PlatformerBody {
  return {
    x, y, vx: 0, vy: 0, width, height,
    grounded: false, coyoteFrames: 0, jumpBufferFrames: 0,
    dropThroughFrames: 0, invulnerableFrames: 0,
  };
}

export function normalizePlatformerSettings(input?: Partial<PlatformerSettings> | null): PlatformerSettings {
  const source = input || {};
  const positive = (key: keyof PlatformerSettings, fallback: number, min: number, max: number) => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  return {
    maxRunSpeed: positive("maxRunSpeed", DEFAULT_PLATFORMER_SETTINGS.maxRunSpeed, 0.1, 30),
    groundAcceleration: positive("groundAcceleration", DEFAULT_PLATFORMER_SETTINGS.groundAcceleration, 0.1, 240),
    airAcceleration: positive("airAcceleration", DEFAULT_PLATFORMER_SETTINGS.airAcceleration, 0.1, 240),
    groundFriction: positive("groundFriction", DEFAULT_PLATFORMER_SETTINGS.groundFriction, 0.1, 240),
    gravity: positive("gravity", DEFAULT_PLATFORMER_SETTINGS.gravity, 0.1, 240),
    jumpSpeed: positive("jumpSpeed", DEFAULT_PLATFORMER_SETTINGS.jumpSpeed, 0.1, 60),
    maxFallSpeed: positive("maxFallSpeed", DEFAULT_PLATFORMER_SETTINGS.maxFallSpeed, 0.1, 120),
    jumpCutMultiplier: positive("jumpCutMultiplier", DEFAULT_PLATFORMER_SETTINGS.jumpCutMultiplier, 1, 8),
    coyoteFrames: Math.round(positive("coyoteFrames", DEFAULT_PLATFORMER_SETTINGS.coyoteFrames, 0, 30)),
    jumpBufferFrames: Math.round(positive("jumpBufferFrames", DEFAULT_PLATFORMER_SETTINGS.jumpBufferFrames, 0, 30)),
    dropThroughFrames: Math.round(positive("dropThroughFrames", DEFAULT_PLATFORMER_SETTINGS.dropThroughFrames, 1, 60)),
    respawnInvulnerabilityFrames: Math.round(positive("respawnInvulnerabilityFrames", DEFAULT_PLATFORMER_SETTINGS.respawnInvulnerabilityFrames, 0, 600)),
    fallMargin: positive("fallMargin", DEFAULT_PLATFORMER_SETTINGS.fallMargin, 0, 20),
  };
}

function approach(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
}

function overlaps(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin;
}

function solidAt(world: PlatformerCollisionWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  return world.kindAt(x, y) === PLATFORMER_COLLISION.SOLID;
}

function oneWayAt(world: PlatformerCollisionWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  return world.kindAt(x, y) === PLATFORMER_COLLISION.ONE_WAY;
}

function cellRange(min: number, max: number): [number, number] {
  return [Math.floor(min), Math.floor(Math.max(min, max - Number.EPSILON))];
}

export function stepPlatformerBody(
  body: PlatformerBody,
  input: PlatformerInput,
  world: PlatformerCollisionWorld,
  rawSettings?: Partial<PlatformerSettings>,
  dt = 1 / 60,
): PlatformerStepResult {
  const settings = normalizePlatformerSettings(rawSettings);
  const result: PlatformerStepResult = {
    landed: false, jumped: false, droppedThrough: false, hitWall: false, fell: false,
  };
  const wasGrounded = body.grounded;

  if (body.invulnerableFrames > 0) body.invulnerableFrames--;
  if (body.dropThroughFrames > 0) body.dropThroughFrames--;
  if (body.jumpBufferFrames > 0) body.jumpBufferFrames--;
  if (input.jumpPressed) body.jumpBufferFrames = settings.jumpBufferFrames;
  if (!body.grounded && body.coyoteFrames > 0) body.coyoteFrames--;

  if (input.jumpPressed && input.downHeld && body.grounded) {
    body.dropThroughFrames = settings.dropThroughFrames;
    body.grounded = false;
    body.y += 0.06;
    body.coyoteFrames = 0;
    body.jumpBufferFrames = 0;
    result.droppedThrough = true;
  } else if (body.jumpBufferFrames > 0 && (body.grounded || body.coyoteFrames > 0)) {
    body.vy = -settings.jumpSpeed;
    body.grounded = false;
    body.coyoteFrames = 0;
    body.jumpBufferFrames = 0;
    result.jumped = true;
  }

  const targetSpeed = input.axis * settings.maxRunSpeed;
  const acceleration = body.grounded ? settings.groundAcceleration : settings.airAcceleration;
  body.vx = input.axis === 0
    ? approach(body.vx, 0, settings.groundFriction * dt)
    : approach(body.vx, targetSpeed, acceleration * dt);

  if (!input.jumpHeld && body.vy < 0) body.vy += settings.gravity * (settings.jumpCutMultiplier - 1) * dt;
  body.vy = Math.min(settings.maxFallSpeed, body.vy + settings.gravity * dt);

  const nextX = body.x + body.vx * dt;
  const [minY, maxY] = cellRange(body.y, body.y + body.height);
  if (body.vx > 0) {
    const right = nextX + body.width;
    const cellX = Math.floor(right - Number.EPSILON);
    for (let y = minY; y <= maxY; y++) {
      if (solidAt(world, cellX, y) && overlaps(body.y, body.y + body.height, y, y + 1)) {
        body.x = cellX - body.width;
        body.vx = 0;
        result.hitWall = true;
        break;
      }
    }
    if (!result.hitWall) body.x = nextX;
  } else if (body.vx < 0) {
    const cellX = Math.floor(nextX);
    for (let y = minY; y <= maxY; y++) {
      if (solidAt(world, cellX, y) && overlaps(body.y, body.y + body.height, y, y + 1)) {
        body.x = cellX + 1;
        body.vx = 0;
        result.hitWall = true;
        break;
      }
    }
    if (!result.hitWall) body.x = nextX;
  }

  const previousBottom = body.y + body.height;
  const nextY = body.y + body.vy * dt;
  body.grounded = false;
  if (body.vy >= 0) {
    const bottom = nextY + body.height;
    const [minX, maxX] = cellRange(body.x, body.x + body.width);
    let landingY = Infinity;
    for (let x = minX; x <= maxX; x++) {
      for (let y = Math.floor(previousBottom - Number.EPSILON); y <= Math.floor(bottom - Number.EPSILON); y++) {
        const solid = solidAt(world, x, y);
        const oneWay = body.dropThroughFrames === 0 && oneWayAt(world, x, y);
        if ((solid || oneWay) && previousBottom <= y + 0.001 && bottom >= y && overlaps(body.x, body.x + body.width, x, x + 1)) {
          landingY = Math.min(landingY, y);
        }
      }
    }
    if (landingY !== Infinity) {
      body.y = landingY - body.height;
      body.vy = 0;
      body.grounded = true;
      result.landed = !wasGrounded;
    } else body.y = nextY;
  } else {
    const top = nextY;
    const [minX, maxX] = cellRange(body.x, body.x + body.width);
    let ceilingY = -Infinity;
    for (let x = minX; x <= maxX; x++) {
      for (let y = Math.floor(top); y <= Math.floor(body.y); y++) {
        if (solidAt(world, x, y) && body.y >= y + 1 - 0.001 && top <= y + 1 && overlaps(body.x, body.x + body.width, x, x + 1)) {
          ceilingY = Math.max(ceilingY, y + 1);
        }
      }
    }
    if (ceilingY !== -Infinity) {
      body.y = ceilingY;
      body.vy = 0;
    } else body.y = top;
  }

  if (body.grounded) body.coyoteFrames = settings.coyoteFrames;
  else if (wasGrounded && !result.jumped && !result.droppedThrough && body.vy >= 0)
    body.coyoteFrames = settings.coyoteFrames;
  if (body.y > world.height + settings.fallMargin) result.fell = true;
  return result;
}

export function respawnPlatformerBody(
  body: PlatformerBody,
  x: number,
  y: number,
  rawSettings?: Partial<PlatformerSettings>,
): void {
  body.x = x;
  body.y = y;
  body.vx = 0;
  body.vy = 0;
  body.grounded = false;
  body.coyoteFrames = 0;
  body.jumpBufferFrames = 0;
  body.dropThroughFrames = 0;
  body.invulnerableFrames = normalizePlatformerSettings(rawSettings).respawnInvulnerabilityFrames;
}
