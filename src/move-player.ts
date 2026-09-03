import { Mob, Pos, walkable } from "./dmap";
import { Game } from "./game";
import type { Viewport } from "./viewport";
import { occupant } from "./mobs";
import { bump } from "./combat";
import { noticeObjects, pickupObject } from "./objs";
import { fireMissile } from "./magic/ranged";
import { openBag, openBagUse, openBagDrop } from "./bag";
import { openSpellMenu } from "./spells";
import { openLogView } from "./msglog";
import { isAlly } from "./magic/summons";
import { isRooted } from "./magic/status-effects";
import { recordPlayerMove } from "./magic/forced-movement";

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
  return (
    key === "." ||
    key === "g" || key === "G" ||
    key === "z" || key === "Z" ||
    key === "i" || key === "I" ||
    key === "c" || key === "C" ||
    key === "p" || key === "P" ||
    key === "u" || key === "U" ||
    key === "d" || key === "D" ||
    key in MOVEMENT
  );
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
  if (occupier) {
    if (mob === game.player && isAlly(occupier)) return swapWithAlly(mob, occupier);
    return bump(mob, occupier, game);
  }

  if (isRooted(mob)) {
    if (mob === game.player) game.log.msg("you can't move");
    return true; // rooted: the turn is still consumed, just no movement happens.
  }

  const moved = moveMob(mob, game, target);
  if (moved && mob === game.player) { noticeObjects(game); recordPlayerMove(delta); }
  return moved;
}


/** The player and a friendly summon trade places instead of the player attacking it. */
function swapWithAlly(player: Mob, ally: Mob): boolean {
  const px = player.x, py = player.y;
  player.x = ally.x; player.y = ally.y;
  ally.x = px; ally.y = py;
  return true;
}

export function moveMob(mob: Mob, game: Game, dest: Readonly<Pos>): boolean {
  const walk = walkable(game.map.get(dest)); // Respect walls; a blocked target aborts the move.
  if (walk) { mob.x = dest.x; mob.y = dest.y; }
  return walk;
}

export async function movePlayer(game: Game, key: string, viewport: Viewport): Promise<boolean> {
  if (!isActionKey(key)) { return false; }

  if (key === ".") {
    game.log.msg("you wait");
    return true;
  } // Waiting in place (the period key) is a deliberate turn.

  if (key === "g" || key === "G") {
    return pickupObject(game);
  }

  if (key === "z" || key === "Z") {
    return fireMissile(game, viewport);
  }

  if (key === "i" || key === "I") {
    return openBag(game, viewport);
  }

  if (key === "c" || key === "C") {
    return openSpellMenu(game, viewport);
  }

  if (key === "p" || key === "P") {
    return openLogView(game, viewport);
  }

  if (key === "u" || key === "U") {
    return openBagUse(game, viewport);
  }

  if (key === "d" || key === "D") {
    return openBagDrop(game, viewport);
  }

  const move = MOVEMENT[key];
  if (!move) return false;

  return moveOrBump(game.player, game, move);
}
