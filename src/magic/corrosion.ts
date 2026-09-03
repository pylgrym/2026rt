import type { Mob } from "../dmap";

/**
 * Permanent (non-decaying) armor corrosion, for ../spells-new.md's Corrosive
 * Spit and Rust Touch. Unlike ./status-effects.ts's timed ArmorBreak, a
 * corrosion stack never wears off on its own — nothing currently cleanses
 * it, so it's a genuinely lasting mark rather than a combat-duration debuff.
 */
const corrosionByMob = new WeakMap<Mob, number>();

/** Adds `amount` permanent corrosion stacks to `mob` (each stack = +10% incoming damage). */
export function applyCorrosion(mob: Mob, amount: number): void {
  corrosionByMob.set(mob, (corrosionByMob.get(mob) ?? 0) + amount);
}

export function corrosionStacks(mob: Mob): number {
  return corrosionByMob.get(mob) ?? 0;
}

/** The multiplier incoming damage should be scaled by, given `mob`'s accumulated corrosion. */
export function corrosionMultiplier(mob: Mob): number {
  return 1 + corrosionStacks(mob) * 0.1;
}
