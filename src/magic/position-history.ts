import type { Pos, Mob } from "../dmap";
import type { Game } from "../game";

/**
 * Rolling position history for the player, one entry pushed per round, for
 * ../spells-new.md spells that reach back into recent movement: Backtrack
 * (rewind 3 turns) and Chrono Fracture (echo the last few turns of
 * positions). Ticked once per round from ./gameloop.ts.
 */
const HISTORY_LENGTH = 6;
const historyByMob = new WeakMap<Mob, Pos[]>();

export function tickPositionHistory(game: Game): void {
  const hist = historyByMob.get(game.player) ?? [];
  hist.push({ x: game.player.x, y: game.player.y });
  if (hist.length > HISTORY_LENGTH) hist.shift();
  historyByMob.set(game.player, hist);
}

/** The position `mob` occupied `turnsAgo` rounds ago, or `null` if there isn't enough history yet. */
export function positionTurnsAgo(mob: Mob, turnsAgo: number): Pos | null {
  const hist = historyByMob.get(mob);
  if (!hist) return null;
  const idx = hist.length - 1 - turnsAgo;
  return idx >= 0 ? hist[idx] : null;
}

/** Every recorded position for `mob`, oldest first. */
export function positionHistory(mob: Mob): readonly Pos[] {
  return historyByMob.get(mob) ?? [];
}
