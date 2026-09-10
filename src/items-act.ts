import * as ROT from "rot-js";
import type { Mob, ItemInstance } from "./dmap";
import type { Game } from "./game";
import type { Viewport } from "./viewport";
import { findSpell } from "./spells";
import { itemTypeInfo, ItemKind, type ItemTypeInfo } from "./item-types";
import { addStatus, StatusKind, cleanseNegative } from "./magic/status-effects";
import { promptDirection, fireAtFirstHit, mobsInRadius } from "./magic/spell-targeting";
import { dealSpellDamage } from "./combat";
import { spendMana } from "./magic/mana";

/**
 * Item behaviour for the four consumable kinds (see ./item-types.ts): using
 * a potion/scroll/wand/staff, zapping an empty charged item, and pumping a
 * wand/staff's charge count up (with real explosion risk). Wired from
 * ./bag.ts's `u`se and (new) `r`echarge inventory actions.
 */
export interface UseResult {
  /** Whether using the item consumed the player's turn. */
  turnConsumed: boolean;
  /** Whether the item should be removed from the bag afterward (spent, or destroyed). */
  removeItem: boolean;
}

/**
 * Casts spell `key` from ../spells.md's roster at zero real mana cost, by
 * temporarily loading the player's mana with exactly the spell's price
 * (so its own internal `pay()` check succeeds), then restoring the
 * player's actual mana afterward regardless of outcome. This lets every
 * item just reuse ./spells.ts's existing cast functions — targeting
 * prompts, animations, and all — instead of duplicating them.
 */
export async function castSpellFree(game: Game, viewport: Viewport, spellKey: string): Promise<boolean> {
  const spell = findSpell(spellKey);
  if (!spell) return false;
  const before = game.mana.mana;
  game.mana.mana = spell.cost;
  const consumed = await spell.cast(game, viewport);
  game.mana.mana = before;
  if (consumed) spell.sound();
  return consumed;
}

/** Direct (non-spell-menu) potion effects, applied to whichever mob a thrown potion lands on. Mirrors the self-cast versions in ./spells.ts. */
const POTION_EFFECTS: Readonly<Record<string, (mob: Mob) => void>> = {
  s: (m) => addStatus(m, StatusKind.Shield, 20, 25),
  u: (m) => addStatus(m, StatusKind.Reflect, 8, 0.5),
  v: (m) => addStatus(m, StatusKind.Invisible, 10),
  w: (m) => addStatus(m, StatusKind.Regen, 8, 4),
  x: (m) => cleanseNegative(m),
  y: (m) => addStatus(m, StatusKind.DamageReduction, 10, 0.4),
  A: (m) => addStatus(m, StatusKind.Haste, 6),
  B: (m) => addStatus(m, StatusKind.Levitate, 10),
  F: (m) => addStatus(m, StatusKind.Waterwalk, 12),
  S: (m) => addStatus(m, StatusKind.Empower, 10, 10),
};

/**
 * Drinks a potion: applies its effect to the player for free via
 * {@link castSpellFree}. Consumed (removed from the bag) only if the
 * effect actually landed — cancelling out of nothing (potions never
 * prompt) can't happen, but keeps the same shape as scrolls/wands.
 */
async function usePotion(game: Game, viewport: Viewport, info: ItemTypeInfo): Promise<UseResult> {
  const consumed = await castSpellFree(game, viewport, info.spellKey);
  return { turnConsumed: consumed, removeItem: consumed };
}

/** Reads a scroll: same free-cast mechanism as a potion, just flavoured differently (see ./item-types.ts). Single-use. */
async function useScroll(game: Game, viewport: Viewport, info: ItemTypeInfo): Promise<UseResult> {
  const consumed = await castSpellFree(game, viewport, info.spellKey);
  return { turnConsumed: consumed, removeItem: consumed };
}

/**
 * Zaps a wand or staff: if it has charges, spends one and casts its spell
 * for free; if empty, the attempt is risky instead of a harmless no-op (see
 * {@link zapEmpty}). Never removed from the bag just for running dry —
 * only recharging (successfully or explosively) changes that.
 */
async function useCharged(game: Game, viewport: Viewport, info: ItemTypeInfo, item: ItemInstance): Promise<UseResult> {
  if ((item.charges ?? 0) <= 0) return zapEmpty(game, info);

  const consumed = await castSpellFree(game, viewport, info.spellKey);
  if (consumed) item.charges = (item.charges ?? 0) - 1;
  return { turnConsumed: consumed, removeItem: false };
}

/**
 * Trying to draw on an empty wand/staff: always consumes the turn (you
 * still tried), and half the time backfires — a jolt of raw, uncontrolled
 * magic that hurts and briefly stuns the caster. The other half, it just
 * clicks uselessly.
 */
function zapEmpty(game: Game, info: ItemTypeInfo): UseResult {
  if (ROT.RNG.getUniform() < 0.5) {
    const dmg = ROT.RNG.getUniformInt(2, 7);
    game.player.hp -= dmg;
    addStatus(game.player, StatusKind.Stun, 1);
    game.deathCause = `a backfiring ${info.name}`;
    game.log.msg(`the ${info.name} is empty — it backfires, searing you for ${dmg}!`);
  } else {
    game.log.msg(`the ${info.name} is empty; it gives an ominous, useless click`);
  }
  return { turnConsumed: true, removeItem: false };
}

/** Dispatches to the right kind-specific use behaviour. `info` must come from {@link itemTypeInfo} (i.e. not a legacy Kettle/Tea). */
export async function useItem(game: Game, viewport: Viewport, item: ItemInstance): Promise<UseResult> {
  const info = itemTypeInfo(item.type)!;
  switch (info.kind) {
    case ItemKind.Potion: return usePotion(game, viewport, info);
    case ItemKind.Scroll: return useScroll(game, viewport, info);
    case ItemKind.Wand:
    case ItemKind.Staff:
      return useCharged(game, viewport, info, item);
  }
}

/** Mana spent per charge pumped into a wand/staff. */
const RECHARGE_MANA_COST = 8;

/**
 * Pumps one extra charge into a wand/staff. Risk-free up to the item's
 * {@link ItemTypeInfo.baseMaxCharges}; every charge pumped in *beyond* that
 * adds real explosion risk (this is about overcharging capacity, not
 * routine top-ups — see ../spells.md's design brief). A failed pump
 * destroys the item and burns the caster (and anything standing close).
 */
export function rechargeItem(game: Game, info: ItemTypeInfo, item: ItemInstance): UseResult {
  if (!spendMana(game, RECHARGE_MANA_COST)) return { turnConsumed: false, removeItem: false };

  const current = item.charges ?? 0;
  const target = current + 1;
  const base = info.baseMaxCharges ?? 5;
  const overflow = Math.max(0, target - base);
  const risk = Math.min(0.85, overflow === 0 ? 0.05 : 0.12 + overflow * 0.12);

  if (ROT.RNG.getUniform() < risk) {
    const blast = 8 + overflow * 6;
    game.log.msg(`the ${info.name} shudders, overloads, and explodes!`);
    game.player.hp -= blast;
    game.deathCause = `an exploding ${info.name}`;
    for (const mob of mobsInRadius(game, game.player, 2, game.player)) {
      dealSpellDamage(game, game.player, mob, Math.round(blast / 2), "caught in the blast");
    }
    return { turnConsumed: true, removeItem: true };
  }

  item.charges = target;
  game.log.msg(`the ${info.name} hums, now holding ${target} charge(s)`);
  return { turnConsumed: true, removeItem: false };
}

/**
 * Throws a potion instead of drinking it: it flies like a missile and
 * shatters on the first mob it reaches, applying that potion's effect to
 * *them* instead of the thrower (see {@link POTION_EFFECTS}) — useful for
 * buffing an ally/summon from a distance. Shatters harmlessly if it hits no
 * one before running out of range.
 */
export async function throwPotion(game: Game, viewport: Viewport, info: ItemTypeInfo): Promise<UseResult> {
  const delta = await promptDirection(game, viewport, `throw ${info.name} which direction?`);
  if (!delta) return { turnConsumed: false, removeItem: false };

  const hit = await fireAtFirstHit(game, viewport, delta, info.glyph, info.color);

  const effect = POTION_EFFECTS[info.spellKey];
  if (hit && effect) {
    effect(hit);
    game.log.msg(`the ${info.name} shatters on ${hit.name}`);
  } else {
    game.log.msg(`the ${info.name} shatters on the ground, wasted`);
  }
  return { turnConsumed: true, removeItem: true };
}
