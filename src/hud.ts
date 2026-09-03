import type { Game } from "./game";
import type { Viewport } from "./viewport";
import { XP_PER_LEVEL } from "./xp";

/**
 * The vertical status HUD, cut out of the right edge of the terminal
 * canvas (replacing the old single-line horizontal HP bar). Owns its own
 * column budget: a narrow stats box (each stat's label stacked directly
 * above its value, so the box only needs to be as wide as the value) plus
 * two vertical health bars — one for the player, one for the last fought
 * foe — running the full height of the screen flush against the right
 * edge, immediately next to each other with no gap.
 */

/** A blank column separating the map viewport from the stats box. */
const GAP_WIDTH = 1;
/** Columns used by the stacked label/value stats box. */
const STATS_WIDTH = 7;
/** Columns used by the two health bars (1 each), flush against the edge. */
const BARS_WIDTH = 2;
/** Columns reserved on the right edge of the viewport for the whole HUD. */
export const HUD_WIDTH = GAP_WIDTH + STATS_WIDTH + BARS_WIDTH;

/** How many columns of `viewport` are left for the dungeon view. */
export function mapWidth(viewport: Viewport): number {
  return viewport.width - HUD_WIDTH;
}

/** Row 0 stays reserved for the message log (see ./msglog.ts); shifted one further to give the stats box a blank row of breathing room below it. */
const STATS_TOP = 2;

/** Draws the vertical HUD: a stats box, then two full-height health bars. */
export function drawHud(viewport: Viewport, game: Game): void {
  const statsX = mapWidth(viewport) + GAP_WIDTH;
  const { player, xp, oocHeal, lastFoe } = game;

  // Each stat is a label row followed by one or more value rows. HP gets
  // two: current hp (suffixed with `/`) then maxhp on the line under it.
  const stats: [string, string[]][] = [
    ["LV", [`${xp.level}`]],
    ["XP", [`${xp.xp}/${XP_PER_LEVEL}`]],
    ["HP", [`${player.hp}/`, `${player.maxhp}`]],
    ["MP", [`${game.mana.mana}/`, `${game.mana.maxmana}`]],
    ["DM", [`${player.dmg}`]],
    ["HL", [`${oocHeal.countdown}+${oocHeal.healAmount}`]],
  ];
  let row = STATS_TOP;
  for (const [label, values] of stats) {
    viewport.display.drawText(statsX, row, label);
    values.forEach((value, i) => viewport.display.drawText(statsX, row + 1 + i, value));
    row += 1 + values.length;
  }

  // The two bars run the full height of the screen, flush against the
  // right edge, immediately next to each other.
  const plyBarX = viewport.width - 2;
  const foeBarX = viewport.width - 1;
  drawBar(viewport, plyBarX, 0, viewport.height, fracHp(player.hp, player.maxhp), "#3c3", "#c33");

  const foe = lastFoe.mob;
  drawBar(viewport, foeBarX, 0, viewport.height, foe ? fracHp(foe.hp, foe.maxhp) : 0, "#eee", "#333");
}

function fracHp(hp: number, maxhp: number): number {
  if (maxhp <= 0) return 0;
  return Math.max(0, Math.min(1, hp / maxhp));
}

/**
 * Draws one vertical gauge `height` rows tall at column `x`, starting at
 * row `top`. Fills bottom-up: the bottom `frac` fraction of the bar is
 * drawn in `fullColor`, the rest (the "missing" portion, at the top) in
 * `emptyColor`. Both use the same glyph — a health bar reads by colour,
 * not by shape — so it renders fine even on fonts without block glyphs.
 */
function drawBar(
  viewport: Viewport,
  x: number,
  top: number,
  height: number,
  frac: number,
  fullColor: string,
  emptyColor: string
): void {
  const filled = Math.round(frac * height);
  for (let i = 0; i < height; i++) {
    const row = top + height - 1 - i; // bottom-up: i=0 is the bottommost row.
    const color = i < filled ? fullColor : emptyColor;
    viewport.display.draw(x, row, "#", color, "#000");
  }
}
