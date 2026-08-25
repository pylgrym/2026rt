import * as ROT from "rot-js";
import { DMap, type Pos, type Mob } from "./dmap";
import type { Game } from "./game";
import { TILE_GLYPHS, Viewport } from "./viewport";
import { moveOrBump } from "./move-player";
import { Mood, tickMood, moodColor } from "./mood";

/** The mob occupying `at`, or `null` if the tile is free. */
export function occupant(game: Game, at: Readonly<Pos>): Mob | null {
  return game.map.Q.find((mob) => mob.x === at.x && mob.y === at.y) ?? null;
}

/** The four cardinal steps a mob can wander in. */
const DIRECTIONS: ReadonlyArray<Pos> = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
];


/**
 * Moves a single mob one step. On a coin flip it either steps toward the
 * player or wanders in a random cardinal direction. The move is skipped
 * when the chosen target tile is blocked (a wall) or already occupied by
 * another mob, so mobs never walk into or through something solid.
 */
export function npcTurn(game: Game, mob: Mob): void {
  tickMood(game, mob);
  if (mob.mood === Mood.Sleep) return; // sleeping mobs don't act.

  let delta: Readonly<Pos>;
  if (ROT.RNG.getUniform() < 0.5) { // Home in on the player, one cardinal/diagonal step at a time.
    delta = { x: Math.sign(game.player.x - mob.x), y: Math.sign(game.player.y - mob.y) };
  } else { // Wander in a random cardinal direction.
    delta = ROT.RNG.getItem(DIRECTIONS as Pos[])!;
  }
  moveOrBump(mob, game, delta);
}


/**
 * Draws a `k` glyph for every mob whose position falls within the visible
 * map area. `origin` is the map coordinate of that area's top-left corner,
 * so map positions are shifted by it to get on-screen coordinates.
 * `drawWidth` caps how many columns of `viewport` are the map's to draw
 * into — callers pass a value narrower than `viewport.width` when part of
 * the screen (e.g. the HUD, see ./hud.ts) is reserved for something else.
 */
export function drawMobs(viewport: Viewport, game: Game, origin: Readonly<Pos>, drawWidth: number): void {
  const { display, height } = viewport;
  for (const mob of game.map.Q.mobs) {
    const { x, y, t } = mob;
    const sx = x - origin.x;
    const sy = y - origin.y;
    if (sx < 0 || sy < 0 || sx >= drawWidth || sy >= height) continue;
    const [glyph, defaultFg] = TILE_GLYPHS[t];
    display.draw(sx, sy, glyph, moodColor(game, mob) ?? defaultFg, "#000");
  }
}
