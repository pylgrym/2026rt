import type { Pos, Mob } from "../dmap";
import { walkable } from "../dmap";
import type { Game } from "../game";
import type { Viewport } from "../viewport";
import { viewOrigin } from "../viewport";
import { mapWidth } from "../hud";
import { occupant } from "../mobs";
import { inputKey } from "../input";
import { playZapStep } from "../juice/juice-objs";

/**
 * Targeting primitives shared by every directional/AoE spell in
 * ../spells.md: prompting for a direction, walking a line of tiles out from
 * the caster (with per-step animation), and gathering mobs in a radius or
 * along a line. Generalises ./ranged.ts's single-purpose missile animation
 * so spells don't each reinvent it.
 */

export const DIRECTION_KEYS: Record<string, Readonly<Pos>> = {
  h: { x: -1, y: 0 },
  j: { x: 0, y: 1 },
  k: { x: 0, y: -1 },
  l: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
  ArrowRight: { x: 1, y: 0 },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prompts `label` on the message row and waits for a direction key. `null` when the player cancels (Escape/unrecognised). */
export async function promptDirection(game: Game, viewport: Viewport, label: string): Promise<Readonly<Pos> | null> {
  // Redraw the dungeon first: callers may be entering this from a full-screen
  // menu (e.g. the inventory's 'u'se action), which last drew over the whole
  // frame, not just the message row — the tactical view has to be back on
  // screen for the player to actually pick a sensible direction.
  viewport.draw(game);
  viewport.drawMessageRows(label);
  const keyEvent = await inputKey();
  return DIRECTION_KEYS[keyEvent.key] ?? null;
}

/** Draws a glyph at map position `pos`, if it falls within the visible map area. */
export function drawAt(viewport: Viewport, game: Game, pos: Readonly<Pos>, glyph: string, color: string): void {
  const origin = viewOrigin(viewport, game);
  const mapW = mapWidth(viewport);
  const sx = pos.x - origin.x;
  const sy = pos.y - origin.y;
  if (sx < 0 || sy < 0 || sx >= mapW || sy >= viewport.height) return;
  viewport.display.draw(sx, sy, glyph, color, "#000");
}

export interface ProjectileOptions {
  glyph: string;
  color: string;
  maxSteps?: number;
  stepMs?: number;
  /** Called each step the missile occupies `pos`, in map coords. Return `true` to stop the missile here (already hit something). */
  onStep?: (pos: Readonly<Pos>, mob: Mob | null) => boolean | void;
  /** Whether the missile stops at the first mob it reaches (default true). Set `false` for beams that punch through. */
  stopOnMob?: boolean;
}

/**
 * Steps a glyph one tile at a time from `origin` in `delta`'s direction,
 * redrawing the full frame each step (so whatever the missile vacates is
 * restored) plus the missile glyph, calling `onStep` at every tile entered.
 * Stops on a wall, optionally on the first mob, or after `maxSteps`.
 *
 * @returns every position the missile actually passed through (excluding the origin).
 */
export async function animateProjectile(
  game: Game,
  viewport: Viewport,
  origin: Readonly<Pos>,
  delta: Readonly<Pos>,
  opts: ProjectileOptions
): Promise<Pos[]> {
  const maxSteps = opts.maxSteps ?? 20;
  const stepMs = opts.stepMs ?? 50;
  const stopOnMob = opts.stopOnMob ?? true;
  const path: Pos[] = [];
  const pos: Pos = { x: origin.x, y: origin.y };

  for (let step = 0; step < maxSteps; step++) {
    pos.x += delta.x;
    pos.y += delta.y;
    if (!game.map.inBounds(pos) || !walkable(game.map.get(pos))) break;

    path.push({ x: pos.x, y: pos.y });
    viewport.draw(game);
    drawAt(viewport, game, pos, opts.glyph, opts.color);
    playZapStep(step);

    const mob = occupant(game, pos);
    const stop = opts.onStep?.(pos, mob);
    if (stop || (stopOnMob && mob)) break;

    await sleep(stepMs);
  }
  return path;
}

/** Squared distance helper shared by radius queries. */
function distSq(a: Readonly<Pos>, b: Readonly<Pos>): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Every mob (excluding `exclude`, if given) within `radius` tiles of `center`. */
export function mobsInRadius(game: Game, center: Readonly<Pos>, radius: number, exclude?: Mob): Mob[] {
  const rSq = radius * radius;
  return game.map.Q.mobs.filter((m) => m !== exclude && distSq(m, center) <= rSq);
}

/** Briefly flashes `glyph` across every tile within `radius` of `center`, for AoE feedback. */
export async function flashRadius(
  game: Game,
  viewport: Viewport,
  center: Readonly<Pos>,
  radius: number,
  glyph: string,
  color: string,
  holdMs = 180
): Promise<void> {
  viewport.draw(game);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      drawAt(viewport, game, { x: center.x + dx, y: center.y + dy }, glyph, color);
    }
  }
  await sleep(holdMs);
}

/**
 * Prompts for a direction, then walks a targeting reticle out from `origin`
 * up to `maxRange` tiles (animated like a projectile), stopping early at a
 * wall or the first mob. Used by every ground-targeted AoE spell (Poison
 * Cloud, Meteor Strike, Flame Wall, ...) to pick where the effect lands.
 *
 * @returns the landing tile, or `null` if the player cancelled the
 *   direction prompt (no tiles were walkable at all, incl. `origin` itself,
 *   never happens in practice).
 */
export async function pickGroundTarget(
  game: Game,
  viewport: Viewport,
  maxRange: number,
  label = "which direction?"
): Promise<Pos | null> {
  const delta = await promptDirection(game, viewport, label);
  if (!delta) return null;

  const path = await animateProjectile(game, viewport, game.player, delta, {
    glyph: "x",
    color: "#f0f",
    maxSteps: maxRange,
    stepMs: 35,
  });
  return path.length > 0 ? path[path.length - 1] : { x: game.player.x, y: game.player.y };
}

/**
 * Fires a stopping projectile (see {@link animateProjectile}) from the
 * player in `delta`'s direction and returns the first mob it reaches, or
 * `null` if it hit a wall/ran out of range first. Every single-target
 * directional spell (Stun Bolt, Ice Shard, ...) uses this instead of
 * hand-rolling the `let hit: Mob | null` + `onStep` closure pattern, which
 * also sidesteps a TS control-flow-narrowing quirk with `let` variables
 * mutated from inside a callback and read right after in the same scope.
 */
export async function fireAtFirstHit(
  game: Game,
  viewport: Viewport,
  delta: Readonly<Pos>,
  glyph: string,
  color: string
): Promise<Mob | null> {
  let hit: Mob | null = null;
  await animateProjectile(game, viewport, game.player, delta, {
    glyph, color,
    onStep: (_pos, mob) => { if (mob) { hit = mob; return true; } },
  });
  return hit;
}

/** The nearest mob to `from` with line of sight, excluding `exclude`; used by homing/auto-target spells. */
export function nearestVisibleMob(game: Game, from: Readonly<Pos>, exclude: Mob, maxRadius: number): Mob | null {
  let best: Mob | null = null;
  let bestDist = Infinity;
  for (const m of game.map.Q.mobs) {
    if (m === exclude) continue;
    const d = distSq(m, from);
    if (d <= maxRadius * maxRadius && d < bestDist) { bestDist = d; best = m; }
  }
  return best;
}
