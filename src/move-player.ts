import { Mob, Pos, walkable } from "./dmap";
import { Game } from "./game";
import { occupant } from "./mobs";
import { bump } from "./combat";

/**
 * Maps every accepted key to a movement delta.
 * Supports both vi-style HJKL and the arrow (cursor) keys.
 */
const MOVEMENT: Record<string, Readonly<Pos>> = {
  h: { x: -1, y: 0 },
  j: { x: 0, y: 1 },
  k: { x: 0, y: -1 },
  l: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
  ArrowRight: { x: 1, y: 0 },
};

/** Wraps a value into the half-open range [0, size). */
function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** True when the key maps to an action the player can take. */
export function isActionKey(key: string): boolean {
  return key === "." || key in MOVEMENT;
}

/**
 * Attempts to move the player in response to a key press.
 *
 * Recognises vi-style HJKL and the arrow keys; the position wraps around
 * the map edges and walls block movement. Mutates the game's player in
 * place.
 *
 * @returns `true` when the player takes a turn — either by stepping onto a
 *   walkable tile or by bumping a mob — so the caller lets the mobs act and
 *   redraws. Returns `false` when the key is unrecognised or a wall blocks
 *   the move (no turn is taken and no message is produced).
 */

export function moveOrBump(mob: Mob, game: Game, delta: Readonly<Pos>): boolean {
  const nx = wrap(mob.x + delta.x, game.map.width);
  const ny = wrap(mob.y + delta.y, game.map.height);
  if (nx === mob.x && ny === mob.y) { return true; }
  const target: Pos = { x: nx, y: ny };
  const occupier = occupant(game, target);
  return occupier ? bump(mob, occupier, game) : moveMob(mob, game, target);
}


export function moveMob(mob: Mob, game: Game, dest: Readonly<Pos>): boolean {
  const walk = walkable(game.map.get(dest)); // Respect walls; a blocked target aborts the move.
  if (walk) { mob.x = dest.x; mob.y = dest.y; }
  return walk;
}

export function movePlayer(game: Game, key: string): boolean {
  if (!isActionKey(key)) { return false; }
  
  if (key === ".") {
    game.log.msg("you wait");
    return true;
  } // Waiting in place (the period key) is a deliberate turn.
 
  const move = MOVEMENT[key];
  if (!move) return false;

  return moveOrBump(game.player, game, move);
}
