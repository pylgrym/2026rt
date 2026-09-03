import type { Pos } from "./dmap";

/**
 * Behavioural state machine driving a mob's turn-to-turn decisions. See
 * {@link ./sneaky-ai.ts}, which owns every transition between these.
 *
 *  - {@link Idle}: no notion of the player; wanders (territorial mobs stay
 *    near {@link AiMemory.home}, others roam freely).
 *  - {@link Ambush}: deliberately parked in a blind spot, holding still
 *    until the player wanders into range.
 *  - {@link Hunt}: actively pathfinding toward {@link AiMemory.lastSeenPlayer}.
 *  - {@link Search}: lost the player; mills around their last known
 *    position for a few turns before giving up to {@link Idle}.
 *  - {@link Feint}: just landed a hit and is faking a short retreat before
 *    charging back in.
 *  - {@link HitAndRun}: just landed a hit and is retreating a long way
 *    (toward home) before it dares approach again.
 *  - {@link Flee}: running from a fight it wants no part of (low morale, or
 *    a coward caught alone) — heads for the nearest ally or home, luring
 *    pursuers toward help rather than just running away.
 */
export const AiState = {
  Idle: 0,
  Ambush: 1,
  Hunt: 2,
  Search: 3,
  Feint: 4,
  HitAndRun: 5,
  Flee: 6,
} as const;
export type T_AiState = (typeof AiState)[keyof typeof AiState];

/**
 * Per-mob AI scratch state. Optional on {@link ./dmap.ts | Mob} the same
 * way `mood` is — only monsters carry it, the player leaves it `undefined`.
 */
export interface AiMemory {
  state: T_AiState;
  /** The nest tile this mob spawned at; anchors territorial/guard behaviour and flee/rally targets. */
  home: Readonly<Pos>;
  /** Generic countdown whose meaning depends on `state` (Search patience, Feint/HitAndRun retreat length). */
  timer: number;
  /** Where this mob last saw the player, if it has ever seen them. */
  lastSeenPlayer?: Pos;
}

/**
 * A monster type's personality: fixed weights (0-1) mixing the behaviours
 * from `../ai_ideas.md` in different proportions so each of the 26
 * monsters *feels* different, not just numerically stronger. See
 * {@link ./ai-personalities.ts} for the per-monster tables and
 * {@link ./sneaky-ai.ts} for how each trait is actually used.
 */
export interface AiTraits {
  /** How readily it commits to a full pathfinding hunt once it's seen the player. */
  aggression: number;
  /** How far from home a hunt/search is allowed to range before a territorial mob gives up and returns. 0 = never leaves, 1 = no leash. */
  territorial: number;
  /** Chance it prefers lying in wait in a blind spot over hunting/wandering in the open. */
  ambusher: number;
  /** Chance a landed hit triggers a short fake retreat (bait) rather than continued pursuit. */
  feinter: number;
  /** Chance a landed hit triggers a long retreat-then-reapproach cycle instead of pressing the attack. */
  hitAndRun: number;
  /** How readily it sidesteps to keep its distance instead of closing the last step or two to melee range. */
  kiter: number;
  /** How readily it flees toward home/allies at low HP rather than fighting to the death. */
  morale: number;
  /** Chance, on first spotting the player, it rouses nearby sleeping/idle allies. */
  alerter: number;
  /** Willingness to engage while alone; low + isolated means it flees even at full HP ("brave only in packs"). */
  courage: number;
}
