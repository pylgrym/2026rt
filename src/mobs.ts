import { type Pos, type Mob } from "./dmap";
import type { Game } from "./game";
import { TILE_GLYPHS, Viewport } from "./viewport";
import { moodColor } from "./mood";

/** The mob occupying `at`, or `null` if the tile is free. */
export function occupant(game: Game, at: Readonly<Pos>): Mob | null {
  return game.map.Q.find((mob) => mob.x === at.x && mob.y === at.y) ?? null;
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
