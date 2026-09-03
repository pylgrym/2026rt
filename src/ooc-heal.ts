import type { Game } from "./game";
import { isPly, type Mob } from "./dmap";
import { playHeal } from "./juice/juice-sound";

/**
 * Out-of-combat regeneration.
 *
 * ## The mechanism
 *
 * Two counters move in opposite directions:
 *
 *  - `countdown` (a.k.a. TIME_TO_HEAL): counts DOWN each turn the player
 *    spends out of combat. It starts at {@link BASE_TIME_TO_HEAL} (5).
 *    When it reaches 0, a heal fires.
 *  - `healAmount` (a.k.a. AMOUNT_TO_HEAL): the number of hp restored the
 *    next time the countdown reaches 0. It starts at
 *    {@link BASE_AMOUNT_TO_HEAL} (1).
 *
 * After each heal, a new cycle begins: the countdown is reloaded from
 * `cycleLength`, which is `cycleLength - 1` (floored at
 * {@link MIN_CYCLE_LENGTH}, i.e. 1 — it never reaches 0, so healing never
 * happens more often than every turn), and `healAmount` is incremented by
 * 1 (uncapped). So successive heals-while-standing-still come faster and
 * heal for more: wait 5 turns to heal 1, then 4 turns to heal 2, then 3
 * turns to heal 3, then 2, then every single turn thereafter for ever
 * larger amounts — until the player is topped up.
 *
 * ## The triggers
 *
 * "In combat" is defined loosely and generously: EITHER side merely
 * *attempting* to hit the other counts, whether or not the attempt lands.
 * Concretely, that's every call to {@link bump} in combat.ts that involves
 * the player (as attacker or as target). Any such attempt:
 *
 *  - resets `countdown` back to {@link BASE_TIME_TO_HEAL} (5), and
 *  - resets `healAmount` back to {@link BASE_AMOUNT_TO_HEAL} (1).
 *
 * i.e. combat doesn't just pause the mechanism, it wipes all progress.
 *
 * The countdown only ticks on rounds where combat did NOT happen (checked
 * once per round, after both the player's and every mob's turn have
 * resolved — see {@link tickOocHeal}). A round in which the player fought
 * both resets the state AND is not itself counted as an idle turn.
 *
 * Finally, the whole mechanism is inert while the player is at full
 * health: no ticking, no counting, nothing — it only engages once the
 * player is missing hp, and stops the instant a heal brings them back to
 * full (any leftover progress toward the next heal is simply discarded,
 * since state resets to base whenever health is full).
 */

/** Starting/reset value for the countdown, in turns. */
const BASE_TIME_TO_HEAL = 5;

/** The countdown's cycle length never drops below this. */
const MIN_CYCLE_LENGTH = 1;

/** Starting/reset value for the heal amount, in hp. */
const BASE_AMOUNT_TO_HEAL = 1;

export interface OocHealState {
  /** Turns remaining until the next heal fires. */
  countdown: number;
  /** The countdown value a fresh cycle reloads from; shrinks each heal. */
  cycleLength: number;
  /** hp restored the next time `countdown` reaches 0; grows each heal. */
  healAmount: number;
  /** Set by {@link noteCombatAttempt} during the round, consumed by {@link tickOocHeal}. */
  combatThisRound: boolean;
}

/** A freshly reset state, as used both at game start and after any reset. */
export function createOocHealState(): OocHealState {
  return {
    countdown: BASE_TIME_TO_HEAL,
    cycleLength: BASE_TIME_TO_HEAL,
    healAmount: BASE_AMOUNT_TO_HEAL,
    combatThisRound: false,
  };
}

function resetToBase(state: OocHealState): void {
  state.countdown = BASE_TIME_TO_HEAL;
  state.cycleLength = BASE_TIME_TO_HEAL;
  state.healAmount = BASE_AMOUNT_TO_HEAL;
}

/**
 * Call whenever one mob attempts to hit another (hit or miss both count).
 * Only attempts involving the player arm/disarm the mechanism; mob-vs-mob
 * scuffles elsewhere on the map don't affect the player's regen.
 */
export function noteCombatAttempt(state: OocHealState, atk: Mob, def: Mob): void {
  if (!isPly(atk) && !isPly(def)) return;
  state.combatThisRound = true;
  resetToBase(state);
}

/**
 * Advances the mechanism by one round. Call once per round, after the
 * player and every mob has acted. Heals the player in place when the
 * countdown reaches 0.
 */
export function tickOocHeal(game: Game): void {
  const state = game.oocHeal;
  const player = game.player;

  if (player.hp >= player.maxhp) {
    // Nothing to heal: keep the mechanism disarmed so it doesn't have
    // stale progress lying around if the player takes damage later.
    resetToBase(state);
    state.combatThisRound = false;
    return;
  }

  if (state.combatThisRound) {
    // Combat already reset the counters when it happened; this round just
    // doesn't count as idle time on top of that.
    state.combatThisRound = false;
    return;
  }

  state.countdown -= 1;
  if (state.countdown > 0) return;

  const healed = Math.min(state.healAmount, player.maxhp - player.hp);
  player.hp += healed;
  const firstHeal = state.healAmount === BASE_AMOUNT_TO_HEAL;
  game.log.msg(firstHeal ? "you feel better" : `you feel a little better (+${healed})`);
  playHeal();

  state.cycleLength = Math.max(MIN_CYCLE_LENGTH, state.cycleLength - 1);
  state.healAmount += 1;
  state.countdown = state.cycleLength;
}
