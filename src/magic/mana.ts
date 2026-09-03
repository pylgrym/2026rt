import type { Game } from "../game";

/**
 * The player's spell-point resource. See ../spells.md for the roster this
 * powers and ./spells.ts for the casting menu that spends it.
 */
export interface ManaState {
  mana: number;
  maxmana: number;
  /** Rounds elapsed since the last passive regen tick; internal to {@link tickMana}. */
  regenCounter: number;
}

const BASE_MANA = 30;

export function createManaState(): ManaState {
  return { mana: BASE_MANA, maxmana: BASE_MANA, regenCounter: 0 };
}

/** True when the player can afford `cost`; does not deduct. */
export function canAfford(game: Game, cost: number): boolean {
  return game.mana.mana >= cost;
}

/**
 * Deducts `cost` mana if affordable.
 *
 * @returns `true` when there was enough mana and it was spent. Returns
 *   `false` (unchanged) and logs "not enough mana" otherwise.
 */
export function spendMana(game: Game, cost: number): boolean {
  if (!canAfford(game, cost)) {
    game.log.msg("not enough mana");
    return false;
  }
  game.mana.mana -= cost;
  return true;
}

/** Passive mana regeneration: +1 every 3 rounds, capped at max. Call once per round. */
const REGEN_PERIOD = 3;

export function tickMana(game: Game): void {
  const m = game.mana;
  m.regenCounter++;
  if (m.regenCounter % REGEN_PERIOD !== 0) return;
  if (m.mana < m.maxmana) m.mana = Math.min(m.maxmana, m.mana + 1);
}
