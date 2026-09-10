import { Mob, Pos, Tile, walkable } from "./dmap";
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
    key === "<" || key === ">" ||
    key === "s" || key === "S" ||
    key in MOVEMENT
  );
}

/**
 * Handles `<`/`>`/`s`/`S` on a stair tile: travels to the level above/below
 * via {@link Game.dungeon}'s `travel`. `<`/`>` require standing on the
 * matching stair glyph; `s`/`S` auto-detects whichever stair (if any) is
 * underfoot. Climbing up from level 1 is refused with a message instead;
 * descending from the deepest level (15) wins the game instead of
 * traveling anywhere — see ../dungeon-levels-stairs-design.md.
 *
 * @returns `true` (a turn is consumed) whenever the key was a stairs key
 *   and something happened — travel, victory, or the "broken stairs"
 *   refusal. Returns `false` (no turn, no message) when the key was a
 *   stairs key but there's no matching stair underfoot.
 */
function tryUseStairs(game: Game, key: string): boolean {
  const tile = game.curMap().get(game.player);

  if (key === "<" || (key.toLowerCase() === "s" && tile === Tile.StairUp)) {
    if (tile !== Tile.StairUp) return false;
    if (!game.dungeon.canGoUp()) {
      game.log.msg("the stairs appear to be broken");
      return true;
    }
    game.dungeon.travel(game.player, "up");
    game.log.msg(`you climb up to level ${game.dungeon.curLevel}`);
    return true;
  }

  if (key === ">" || (key.toLowerCase() === "s" && tile === Tile.StairDown)) {
    if (tile !== Tile.StairDown) return false;
    if (game.dungeon.isDeepestLevel()) {
      game.won = true;
      game.log.msg("you descend into the depths and win the game!");
      return true;
    }
    game.dungeon.travel(game.player, "down");
    game.log.msg(`you descend to level ${game.dungeon.curLevel}`);
    return true;
  }

  return false;
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
  const nx = wrap(mob.x + delta.x, game.curMap().width);
  const ny = wrap(mob.y + delta.y, game.curMap().height);
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
  const walk = walkable(game.curMap().get(dest)); // Respect walls; a blocked target aborts the move.
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

  if (key === "<" || key === ">" || key === "s" || key === "S") {
    return tryUseStairs(game, key);
  }

  const move = MOVEMENT[key];
  if (!move) return false;

  return moveOrBump(game.player, game, move);
}
