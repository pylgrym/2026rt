import * as ROT from "rot-js";
import { DMap, Tile, type Pos, type Mob } from "./dmap";
import type { Game } from "./game";
import { TILE_GLYPHS, Viewport } from "./viewport";
import { moveOrBump } from "./move-player";

/**
 * Scatters up to `count` mob nests across the map by turning vacant
 * floor tiles into {@link Tile.Nest}s. If fewer floor tiles exist than
 * requested, every available floor becomes a nest.
 *
 * @param huddleNpcs When `true`, the floor tiles are used in the order
 *   they were gathered (row-major), so the first `count` tiles end up
 *   bunched together in a heap. When `false`, the candidates are shuffled
 *   first for a proper random scatter.
 */

export function addMobNests(
  map: DMap,
  count: number
): void {
  /**
   * When `true`, mobs are placed with the old "heap" bug: they all huddle
   * together instead of being scattered randomly across the dungeon.
   */
  const huddleNpcs = false;

  // Gather every walkable floor tile as a candidate nest site. One scratch
  // Pos drives the lookup; each floor we keep is pushed as its own object.
  const floors: Pos[] = [];
  const at: Pos = { x: 0, y: 0 };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      at.x = x;
      at.y = y;
      if (map.get(at) === Tile.Floor) floors.push({ x, y });
    }
  }

  // ROT.RNG.shuffle returns a NEW shuffled array; it does not mutate its
  // argument. Huddling keeps the unshuffled, row-major order (tiles bunch
  // together); otherwise we scatter by using the shuffled result.
  const candidates = huddleNpcs ? floors : ROT.RNG.shuffle(floors);
  const nests = candidates.slice(0, count);
  for (const nest of nests) {
    map.set(nest, Tile.Nest);
    map.Q.push({ x: nest.x, y: nest.y, t: Tile.Rat, name: "rat" });
  }
}


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
  let delta: Readonly<Pos>;
  if (ROT.RNG.getUniform() < 0.5) { // Home in on the player, one cardinal/diagonal step at a time.
    delta = { x: Math.sign(game.player.x - mob.x), y: Math.sign(game.player.y - mob.y) };
  } else { // Wander in a random cardinal direction.
    delta = ROT.RNG.getItem(DIRECTIONS as Pos[])!;
  }
  moveOrBump(mob, game, delta);
}


/**
 * Draws a `k` glyph for every mob whose position falls within the
 * viewport window. `origin` is the map coordinate of the viewport's
 * top-left corner, so map positions are shifted by it to get on-screen
 * coordinates.
 */
export function drawMobs(viewport: Viewport, game: Game, origin: Readonly<Pos>): void {
  const { display, width, height } = viewport;
  for (const { x, y, t } of game.map.Q.mobs) {
    const sx = x - origin.x;
    const sy = y - origin.y;
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    const [glyph, fg] = TILE_GLYPHS[t]; 
    display.draw(sx, sy, glyph,fg, "#000");
  }
}
