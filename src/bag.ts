import type { T_ObjType, Pos, ItemInstance } from "./dmap";
import type { Game } from "./game";
import type { Viewport } from "./viewport";
import { inputKey } from "./input";
import { objInfo, dropObject, useObjectType } from "./objs";
import { itemTypeInfo, ItemKind } from "./item-types";
import { useItem, throwPotion, rechargeItem } from "./items-act";
import { showItemExamine } from "./item-art";

/** See ../bag.md for the original design behind this file, and ../spells.md for the item epic that extended it. */

/** The player can carry at most this many items. */
export const BAG_CAPACITY = 17;

/** Creates an empty bag, for {@link Game}'s constructor. */
export function createBag(): ItemInstance[] {
  return [];
}

function bagFull(bag: readonly ItemInstance[]): boolean {
  return bag.length >= BAG_CAPACITY;
}

/**
 * Adds an item of `type` (with `charges`, for wands/staffs) to the player's
 * bag. Wired from `takeObject()` (`src/objs.ts`).
 *
 * @returns `true` when there was room and the item was added. Returns
 *   `false` (bag unchanged) and logs "your bag is full" otherwise.
 */
export function addToBag(game: Game, type: T_ObjType, charges?: number): boolean {
  if (bagFull(game.bag)) {
    game.log.msg("your bag is full");
    return false;
  }
  game.bag.push({ type, charges });
  return true;
}

/** Maps a bag index (0-based) to its display letter: 0 -> 'a', 16 -> 'q'. */
function letterFor(index: number): string {
  return String.fromCharCode("a".charCodeAt(0) + index);
}

/** Maps a pressed key back to a bag index; -1 when it isn't a single letter. */
function indexForLetter(key: string): number {
  if (key.length !== 1) return -1;
  const lower = key.toLowerCase();
  if (lower < "a" || lower > "z") return -1;
  return lower.charCodeAt(0) - "a".charCodeAt(0);
}

type BagAction = "drop" | "use" | "examine" | "throw" | "recharge";

/** Which inventory-menu key starts which action. */
const ACTION_KEYS: Record<string, BagAction> = {
  d: "drop", D: "drop",
  u: "use", U: "use",
  x: "examine", X: "examine",
  t: "throw", T: "throw",
  r: "recharge", R: "recharge",
};

/** A bag entry's display line, e.g. "wand of fireballs [3]" for a charged item, plain name otherwise. */
function describeItem(item: ItemInstance): string {
  const info = objInfo(item.type);
  const kindInfo = itemTypeInfo(item.type);
  const charged = kindInfo && (kindInfo.kind === ItemKind.Wand || kindInfo.kind === ItemKind.Staff);
  return charged ? `[${item.charges ?? 0}] ${info.name}` : info.name;
}

/**
 * Redraws the full-screen inventory menu: a title, one lettered line per
 * bag item (or "(empty)"), and `footer` on the bottom row.
 */
function drawBagMenu(viewport: Viewport, game: Game, footer: string): void {
  const { display, height } = viewport;
  display.clear();
  display.drawText(0, 0, "Inventory");
  if (game.bag.length === 0) {
    display.drawText(0, 2, "(empty)");
  } else {
    game.bag.forEach((item, i) => {
      display.drawText(0, 2 + i, `${letterFor(i)}) ${describeItem(item)}`);
    });
  }
  display.drawText(0, height - 1, footer);
}

/**
 * Handles the 'i'/'I' inventory command. Shows the bag menu and lets the
 * player pick drop/use/examine/throw/recharge, each of which then prompts
 * for which lettered item to act on. Escape at the top level closes the
 * menu; Escape at an item prompt cancels just that action, back to the
 * menu. Wired from `movePlayer()` (`src/move-player.ts`).
 *
 * @returns `true` when an action was taken that consumes a turn. Returns
 *   `false` (no turn consumed) for examine, for a cancelled prompt, or for
 *   an action that turned out not to apply to the chosen item.
 */
export async function openBag(game: Game, viewport: Viewport): Promise<boolean> {
  while (true) {
    drawBagMenu(viewport, game, "d)rop u)se x)amine t)hrow r)echarge   [[ESC]] close");
    const key = (await inputKey()).key;
    if (key === "Escape") {
      viewport.draw(game);
      return false;
    }

    const action = ACTION_KEYS[key];
    if (!action) continue;

    const index = await promptForItem(viewport, game, action);
    if (index === -1) continue; // cancelled back to the bag menu.

    const consumed = await performAction(game, viewport, action, index);
    viewport.draw(game);
    return consumed;
  }
}

/**
 * Handles a top-level bag-action shortcut ('u'/'U' for use, 'd'/'D' for
 * drop): jumps straight to the same "<verb> which item?" prompt that
 * pressing that letter from inside the {@link openBag} menu reaches,
 * skipping the top-level d/u/x/t/r menu entirely. Escape here cancels the
 * whole thing (there's no top-level menu to fall back to). Wired from
 * `movePlayer()` (`src/move-player.ts`).
 *
 * @returns `true` when acting on the chosen item consumed a turn. Returns
 *   `false` when the item prompt was cancelled or the action itself didn't
 *   consume a turn (e.g. a targeting prompt inside it was cancelled).
 */
async function openBagAction(game: Game, viewport: Viewport, action: BagAction): Promise<boolean> {
  const index = await promptForItem(viewport, game, action);
  if (index === -1) {
    viewport.draw(game);
    return false;
  }

  const consumed = await performAction(game, viewport, action, index);
  viewport.draw(game);
  return consumed;
}

/** Handles the 'u'/'U' top-level use-item shortcut. See {@link openBagAction}. */
export function openBagUse(game: Game, viewport: Viewport): Promise<boolean> {
  return openBagAction(game, viewport, "use");
}

/** Handles the 'd'/'D' top-level drop-item shortcut. See {@link openBagAction}. */
export function openBagDrop(game: Game, viewport: Viewport): Promise<boolean> {
  return openBagAction(game, viewport, "drop");
}

/** Prompts "<verb> which item?", re-drawing the menu until a valid letter or Escape is pressed. */
async function promptForItem(viewport: Viewport, game: Game, action: BagAction): Promise<number> {
  while (true) {
    drawBagMenu(viewport, game, `${action} which item?   [[ESC]] cancel`);
    const key = (await inputKey()).key;
    if (key === "Escape") return -1;
    const index = indexForLetter(key);
    if (index < 0 || index >= game.bag.length) continue; // not a listed item; keep prompting.
    return index;
  }
}

/** Performs `action` on the bag item at `index`. */
async function performAction(game: Game, viewport: Viewport, action: BagAction, index: number): Promise<boolean> {
  const item = game.bag[index];
  const info = itemTypeInfo(item.type);

  switch (action) {
    case "drop": {
      game.bag.splice(index, 1);
      dropObject(game, game.player, item.type, item.charges);
      game.log.msg(`you drop ${objInfo(item.type).name}`);
      return true;
    }

    case "use": {
      if (!info) {
        // Legacy Kettle/Tea: always a single-use heal.
        game.bag.splice(index, 1);
        useObjectType(game, item.type);
        return true;
      }
      const result = await useItem(game, viewport, item);
      if (result.removeItem) game.bag.splice(index, 1);
      return result.turnConsumed;
    }

    case "examine": {
      await showItemExamine(viewport, item);
      return false;
    }

    case "throw": {
      if (!info || info.kind !== ItemKind.Potion) {
        game.log.msg("you can't throw that usefully");
        return false;
      }
      const result = await throwPotion(game, viewport, info);
      if (result.removeItem) game.bag.splice(index, 1);
      return result.turnConsumed;
    }

    case "recharge": {
      if (!info || (info.kind !== ItemKind.Wand && info.kind !== ItemKind.Staff)) {
        game.log.msg("that can't be recharged");
        return false;
      }
      const result = rechargeItem(game, info, item);
      if (result.removeItem) game.bag.splice(index, 1);
      return result.turnConsumed;
    }
  }
}
