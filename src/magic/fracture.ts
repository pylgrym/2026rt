import type { Mob } from "../dmap";
import type { Game } from "../game";

/**
 * Fracture's escalating stack counter, for ../spells-new.md's Fracture
 * debuff: each hit while active adds a stack (extra damage on the *next*
 * hit), and the whole stack resets once `resetTurns` pass without a hit.
 * Kept separate from ./status-effects.ts's generic StatusEntry because it
 * needs a running hit counter, not just a duration + magnitude.
 */
interface FractureEntry { stacks: number; cooldown: number; resetTurns: number; }
const fractured = new WeakMap<Mob, FractureEntry>();

export function applyFracture(mob: Mob, resetTurns: number): void {
  const entry = fractured.get(mob);
  if (entry) { entry.cooldown = resetTurns; entry.resetTurns = resetTurns; }
  else fractured.set(mob, { stacks: 0, cooldown: resetTurns, resetTurns });
}

/** Called from ./status-effects.ts's applyIncomingModifiers on every hit against a fractured mob; returns the damage multiplier and bumps the stack. */
export function onFractureHit(mob: Mob): number {
  const entry = fractured.get(mob);
  if (!entry) return 1;
  entry.stacks++;
  entry.cooldown = entry.resetTurns;
  return 1 + entry.stacks * 0.15;
}

/** Resets any fractured mob's stacks once its no-hit cooldown expires. Call once per round. */
export function tickFracture(game: Game): void {
  for (const mob of game.map.Q.mobs) {
    const entry = fractured.get(mob);
    if (!entry) continue;
    if (--entry.cooldown <= 0) { entry.stacks = 0; entry.cooldown = entry.resetTurns; }
  }
}
