import type { ItemInstance } from "./dmap";
import type { Viewport } from "./viewport";
import { inputKey } from "./input";
import { objInfo } from "./objs";
import { itemTypeInfo, ItemKind, type T_ItemKind } from "./item-types";
import { findSpell } from "./spells";

/**
 * One ASCII-art block per item kind (see ./item-types.ts), drawn centered
 * and tinted with the item's own fixed colour by {@link showItemExamine}.
 * "misc" is the fallback for the legacy Kettle/Tea types, which predate
 * (and aren't part of) the potion/scroll/wand/staff roster.
 */
const ART: Record<T_ItemKind | "misc", readonly string[]> = {
  potion: [
    "    ___    ",
    "   [___]   ",
    "    | |    ",
    "   /   \\   ",
    "  |     |  ",
    "  |  ~  |  ",
    "  |     |  ",
    "   \\___/   ",
  ],
  scroll: [
    "  _______  ",
    " (_______) ",
    "  |     |  ",
    "  | ... |  ",
    "  | ... |  ",
    "  |_____|  ",
    " (_______) ",
    "           ",
  ],
  wand: [
    "         * ",
    "        /  ",
    "       /   ",
    "      /    ",
    "     /     ",
    "    /      ",
    "   o       ",
    "           ",
  ],
  staff: [
    "    .-.    ",
    "   ( o )   ",
    "    `-'    ",
    "     |     ",
    "     |     ",
    "     |     ",
    "     |     ",
    "    -+-    ",
  ],
  misc: [
    "   .---.   ",
    "  /     \\  ",
    " |       | ",
    " |       | ",
    "  \\     /  ",
    "   `---'   ",
    "           ",
    "           ",
  ],
} as const;

/**
 * Draws `lines` (an ASCII-art block) horizontally centered on the viewport
 * starting at row `top`, in `color`. Space characters are skipped rather
 * than drawn, so the art's negative space shows the background through
 * instead of painting a solid colour block.
 */
function drawArtCentered(viewport: Viewport, lines: readonly string[], color: string, top: number): void {
  const artWidth = Math.max(...lines.map((l) => l.length));
  const left = Math.max(0, Math.floor((viewport.width - artWidth) / 2));
  lines.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === " ") continue;
      viewport.display.draw(left + col, top + row, ch, color, "#000");
    }
  });
}

/**
 * Handles the inventory's e**x**amine action: a full-screen ASCII rendering
 * of `item`, drawn in the exact same fixed colour ../spells.md's item epic
 * gave its type (./item-types.ts's `colorName`/`color` — permanent and
 * deterministic, not a randomised identification scheme). Legacy Kettle/Tea
 * items fall back to their own plain colour and a generic art block. Shows
 * the item's full (colour-prefixed) name, the spell it grants and its mana
 * cost, and — for a wand/staff — its current charge count. Waits for any
 * key before returning; doesn't touch the bag or consume a turn.
 */
export async function showItemExamine(viewport: Viewport, item: ItemInstance): Promise<void> {
  const info = itemTypeInfo(item.type);
  const base = objInfo(item.type);
  const kind: T_ItemKind | "misc" = info?.kind ?? "misc";
  const color = info?.color ?? base.color;
  const art = ART[kind];

  viewport.display.clear();
  viewport.display.drawText(0, 0, "Examine");
  drawArtCentered(viewport, art, color, 2);

  let row = 2 + art.length + 1;
  viewport.display.drawText(0, row++, base.name);

  if (info) {
    const spell = findSpell(info.spellKey);
    if (spell) viewport.display.drawText(0, row++, `grants: ${spell.name} (${spell.cost}mp)`);
    if (info.kind === ItemKind.Wand || info.kind === ItemKind.Staff) {
      viewport.display.drawText(0, row++, `charges: ${item.charges ?? 0}`);
    }
  }

  viewport.display.drawText(0, viewport.height - 1, "[[ESC]] close");
  await inputKey();
}
