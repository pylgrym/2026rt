import type { Pos } from "../dmap";
import { walkable } from "../dmap";
import type { Game } from "../game";
import type { Viewport } from "../viewport";
import { viewOrigin } from "../viewport";
import { mapWidth } from "../hud";
import { occupant } from "../mobs";
import { inputKey } from "../input";
import { playZapStep } from "../juice/juice-objs";

/** See ../ranged-design.md for the full design behind this file. */

/** The direction a missile can be fired in, keyed by the accepted key. */
const MISSILE_DIRS: Record<string, Readonly<Pos>> = {
  h: { x: -1, y: 0 },
  j: { x: 0, y: 1 },
  k: { x: 0, y: -1 },
  l: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
  ArrowRight: { x: 1, y: 0 },
};

/** The missile never travels further than this many tiles, so the animation always terminates. */
const MAX_STEPS = 20;
/** Delay between animation frames. */
const STEP_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles the 'z'/'Z' ranged-attack command. Prompts for a direction (drawn
 * directly on the message row, not queued as a log message), then either
 * cancels or animates a missile in that direction. Wired from
 * `movePlayer()` (`src/move-player.ts`).
 *
 * @returns `true` when a direction was chosen and the missile fired (a
 *   turn is consumed, even if it hits a wall immediately). Returns `false`
 *   (no turn consumed) when the player pressed Escape or any other
 *   unrecognised key, cancelling the prompt.
 */
export async function fireMissile(game: Game, viewport: Viewport): Promise<boolean> {
  viewport.drawMessageRows("which dir?");

  const keyEvent = await inputKey();
  const delta = MISSILE_DIRS[keyEvent.key];
  if (!delta) {
    viewport.draw(game); // erase the prompt, restoring the previous frame.
    return false;
  }

  await animateMissile(game, viewport, delta);
  return true;
}

/**
 * Steps a `*` missile one tile at a time from the player's position in
 * `delta`'s direction, redrawing the full frame (so whatever the missile
 * vacates is properly restored) plus the missile glyph itself each step,
 * waiting {@link STEP_MS} between steps. Stops on a wall, on the first mob
 * it reaches, or after {@link MAX_STEPS} tiles, whichever comes first. Each
 * step also retriggers {@link playZapStep}, so the zap sound keeps going
 * (and keeps varying) for as long as the missile is flying.
 */
async function animateMissile(game: Game, viewport: Viewport, delta: Readonly<Pos>): Promise<void> {
  const pos: Pos = { x: game.player.x, y: game.player.y };
  for (let step = 0; step < MAX_STEPS; step++) {
    pos.x += delta.x;
    pos.y += delta.y;
    if (!game.map.inBounds(pos) || !walkable(game.map.get(pos))) break;

    viewport.draw(game);
    drawMissile(viewport, game, pos);
    playZapStep(step);
    if (occupant(game, pos)) break;

    await sleep(STEP_MS);
  }
}

/** Draws the `*` missile glyph at `pos`, if it falls within the visible map area. */
function drawMissile(viewport: Viewport, game: Game, pos: Readonly<Pos>): void {
  const origin = viewOrigin(viewport, game);
  const mapW = mapWidth(viewport);
  const sx = pos.x - origin.x;
  const sy = pos.y - origin.y;
  if (sx < 0 || sy < 0 || sx >= mapW || sy >= viewport.height) return;
  viewport.display.draw(sx, sy, "*", "#ff0", "#000");
}
