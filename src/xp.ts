import type { Game } from "./game";
import type { Mob } from "./dmap";
import { levelOfTile } from "./mob-factory";

/**
 * Player experience and levelling.
 *
 * Killing a monster grants xp (see {@link xpForKill}) toward
 * {@link XP_PER_LEVEL}. Every time that threshold is crossed the player
 * levels up: their level counter increments, and their `hp`/`maxhp`/`dmg`
 * each grow by their own exponential *growth base* (see
 * {@link awardKillXp}) — e.g. at growth base 1.5, hp after N level-ups is
 * `startingHp * 1.5^N`. Monster levels are a separate, unrelated system
 * that still scales by a growth base of exactly 2 (see ../progression.md)
 * — this file is about the player only, whose progression is intentionally
 * gentler.
 */

/** xp required to go from one level to the next. */
export const XP_PER_LEVEL = 100;

/** Per-level growth base for the player's max/current hp (was 2). */
const HP_GROWTH_BASE = 1.5;
/** Per-level growth base for the player's damage (was 2). */
const DMG_GROWTH_BASE = 1.75;

export interface XpState {
  /** The player's current level, starting at 1. */
  level: number;
  /** xp accumulated toward the next level, 0..XP_PER_LEVEL-1. */
  xp: number;
}

/** A freshly reset state, as used at game start. */
export function createXpState(): XpState {
  return { level: 1, xp: 0 };
}

/**
 * How much xp killing a level-`mobLevel` monster is worth to a
 * level-`playerLevel` player.
 *
 * A same-level kill is worth a third of a level ({@link XP_PER_LEVEL} / 3,
 * rounded up). Every level the monster sits *above* the player adds
 * another sixth of a level on top of that; every level *below* subtracts
 * a sixth — so a monster one level higher is worth half a level, one level
 * lower a sixth, two levels higher three-quarters, and so on. Never
 * negative: a kill far beneath the player's level is worth nothing rather
 * than draining xp.
 */
export function xpForKill(mobLevel: number, playerLevel: number): number {
  const diff = mobLevel - playerLevel;
  const raw = (XP_PER_LEVEL * (diff + 2)) / 6;
  return Math.max(0, Math.ceil(raw));
}

/**
 * Call once for every kill credited to the player, passing the monster
 * that was just killed. Grants xp per {@link xpForKill}, then levels the
 * player up for every full {@link XP_PER_LEVEL} crossed (a single very
 * lopsided kill can trigger more than one level-up at once): bumps
 * `state.level`, scales `player.hp`/`player.maxhp` by
 * {@link HP_GROWTH_BASE} and `player.dmg` by {@link DMG_GROWTH_BASE}
 * (rounded to whole numbers), and logs a message for each level gained.
 */
export function awardKillXp(game: Game, killed: Readonly<Mob>): void {
  const state = game.xp;
  state.xp += xpForKill(levelOfTile(killed.t), state.level);

  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;

    const player = game.player;
    player.hp = Math.round(player.hp * HP_GROWTH_BASE);
    player.maxhp = Math.round(player.maxhp * HP_GROWTH_BASE);
    player.dmg = Math.round(player.dmg * DMG_GROWTH_BASE);

    game.log.msg(`you feel much stronger! (level ${state.level})`);
  }
}
