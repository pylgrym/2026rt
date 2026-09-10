import * as ROT from "rot-js";
import { Tile, T_Tile, Pos } from "./dmap";
import { Game } from "./game";
import { drawMobs } from "./mobs";
import { drawObjects } from "./objs";
import { MOB_TYPES } from "./mob-factory";
import { createDisplay } from "./rdisplay";
import { drawHud, mapWidth } from "./hud";
import { drawFieldEffects } from "./magic/field-effects";
import { hasLineOfSight } from "./mood";

/** The most rows {@link Viewport.drawMessageRows} will ever draw a single message across. */
const MAX_MESSAGE_LINES = 3;

/**
 * Word-wraps `text` into lines no longer than `maxWidth`, breaking on
 * spaces where possible. A single word longer than `maxWidth` is
 * hard-broken rather than left overflowing. Never returns an empty array
 * (an empty `text` yields `[""]`), so callers can always index line 0.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    let rest = word;
    while (rest.length > maxWidth) {
      lines.push(rest.slice(0, maxWidth));
      rest = rest.slice(maxWidth);
    }
    current = rest;
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

/** Converts an HSL colour to a `#rrggbb` hex string. */
function hslHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Visual representation of each tile: [glyph, foreground colour]. */
const glyphs: Partial<Record<T_Tile, [string, string]>> = {
  [Tile.Floor]: [".", "#555"],
  [Tile.Wall]: ["#", "#888"],
  [Tile.Nest]: ["*", "#c33"],
  [Tile.Ply]: ["@", "#fff"],
  [Tile.StairUp]: ["<", "#0ff"],
  [Tile.StairDown]: [">", "#ff0"],
};

// Grade monster colour by level: green (weak, near the centre) through
// to red (strong, near the edges), matching the spawn scheme in
// ../progression.md.
MOB_TYPES.forEach((mobType, i) => {
  const hue = 140 - (140 * i) / (MOB_TYPES.length - 1);
  glyphs[mobType.tile] = [mobType.glyph, hslHex(hue, 55, 50)];
});

export const TILE_GLYPHS: Record<T_Tile, [string, string]> = glyphs as Record<T_Tile, [string, string]>;

/**
 * Map-space coordinate of the visible dungeon area's top-left corner, with
 * the player centred within the dungeon-view columns (which stop short of
 * the HUD, see ./hud.ts). Shared by {@link Viewport.draw} and anything else
 * (e.g. ./ranged.ts's missile animation) that needs to convert between map
 * and screen coordinates the same way the normal frame draw does.
 */
export function viewOrigin(viewport: Viewport, game: Game): Pos {
  const mapW = mapWidth(viewport);
  const halfW = Math.floor(mapW / 2);
  const halfH = Math.floor(viewport.height / 2);
  return { x: game.player.x - halfW, y: game.player.y - halfH };
}

/**
 * Renders a fixed-size window of the dungeon onto a rot.js display,
 * always keeping the player centred. Map cells outside the bounds are
 * left blank so the edges of the world read as empty space.
 *
 * The viewport owns the display it draws to; callers just hand it the
 * {@link Game} whose state should be shown.
 */
export class Viewport {
  private constructor( // we use async helper, because createDisplay is async.
    readonly width: number,
    readonly height: number,
    public readonly display: ROT.Display,
  ) {}

  /**
   * Creates a viewport of the given size, setting up (and mounting) the
   * rot.js display it will render to
   *
   * @param width Viewport width, in tiles (characters).
   * @param height Viewport height, in tiles (characters).
   * @param game The game whose message log renders onto this display.
   */
  static async create( // async because it calls async createDisplay()
    width: number,
    height: number
  ): Promise<Viewport> {
    const display = await createDisplay(width, height);
    return new Viewport(width, height, display);
  }

  /**
   * Draws the current frame of {@link game}, centred on the player. The
   * dungeon view only occupies the left `mapWidth()` columns — the right
   * edge is reserved for the vertical HUD, see ./hud.ts.
   */
  draw(game: Game): void {
    const map = game.curMap();
    const mapW = mapWidth(this);
    const { x: originX, y: originY } = viewOrigin(this, game);

    this.display.clear(); // (we only need clear because of the map.inBounds mechanism below. if we drew the entire viewport always, that would handle the clear. )

    // Reuse one scratch Pos for every cell; inBounds/get read it and forget
    // it, so mutating in place avoids allocating an object per tile.
    const at: Pos = { x: 0, y: 0 };
    for (let sy = 0; sy < this.height; sy++) {
      for (let sx = 0; sx < mapW; sx++) {
        at.x = originX + sx;
        at.y = originY + sy;
        if (!map.inBounds(at)) continue;

        let tile = map.get(at);
        // Stairs only draw once they're in line of sight — otherwise show
        // the plain floor underneath, same as an unseen object staying
        // hidden (see ./objs.ts's drawObjects).
        if ((tile === Tile.StairUp || tile === Tile.StairDown) && !hasLineOfSight(map, game.player, at)) {
          tile = Tile.Floor;
        }
        const [glyph, fg] = TILE_GLYPHS[tile];
        const color = tile === Tile.Wall ? game.curShader().colorAt(at) : fg;
        this.display.draw(sx, sy, glyph, color, "#000");
      }
    }

    drawObjects(this, game, { x: originX, y: originY }, mapW);
    drawFieldEffects(this, game);
    drawMobs(this, game, { x: originX, y: originY }, mapW);

    // player is now drawn as part of mobs.
    // The player is always drawn at the centre of the viewport.
    //this.display.draw(halfW, halfH, "@", "#fff", "#000");

    game.log.drawFinalMessage(this); // Overlay the persistent final message (if any) on the message row.
    drawHud(this, game);
  }

  /**
   * Blanks an entire row. `display.drawText` trims trailing spaces while
   * word-wrapping (see rot.js's `Text.breakLines`), so padding a string
   * with spaces does NOT reliably clear the rest of a row — this instead
   * writes blank cells directly via `display.draw`, which isn't tokenized
   * and so isn't subject to that trimming.
   */
  clearRow(row: number): void {
    for (let x = 0; x < this.width; x++) {
      this.display.draw(x, row, " ", null, null);
    }
  }

  /**
   * Draws `text` starting at row 0 (the message area — see ../hud.ts's
   * `STATS_TOP`), word-wrapped across at most {@link MAX_MESSAGE_LINES}
   * rows (truncating with a trailing "…" if it still doesn't fit) — never
   * more than that, and never fewer rows than it actually needs.
   *
   * This is the *only* sanctioned way to draw a message/prompt: rot.js's
   * own `display.drawText` word-*wraps* with no row limit at all, which
   * would spill an overlong message straight through the HUD and into the
   * dungeon view below it — see ../proper-redraw.md for the bug this was
   * written to fix. Every "flash a message" call site (./msglog.ts,
   * ./spell-targeting.ts's `promptDirection`, Void Beam's channel prompt,
   * ./ranged.ts's `fireMissile`) goes through this instead of hand-rolling
   * `clearRow(0)` + `drawText(0, 0, ...)`.
   *
   * Rows within the message area that this particular text *doesn't* need
   * are deliberately left untouched here — they don't need clearing,
   * because the dungeon-tile pass earlier in {@link draw} already painted
   * them fresh this same frame. A one-line message costs nothing extra; a
   * rare three-line one temporarily (this frame only) covers that much of
   * the dungeon view, exactly like row 0 always has.
   */
  drawMessageRows(text: string): void {
    const allLines = wrapText(text, this.width);
    const shown = allLines.slice(0, MAX_MESSAGE_LINES);
    if (allLines.length > MAX_MESSAGE_LINES) {
      const last = shown[shown.length - 1];
      shown[shown.length - 1] = `${last.slice(0, Math.max(0, this.width - 1))}…`;
    }
    shown.forEach((line, row) => {
      this.clearRow(row);
      this.display.drawText(0, row, line);
    });
  }

  /**
   * Draws `text` horizontally centred on `row`. `text` may use rot.js's
   * inline `%c{fg}` / `%b{bg}` colour markup; that markup is stripped
   * before measuring so centring is based on the visible characters only.
   */
  drawCentered(row: number, text: string): void {
    const visibleLength = text.replace(/%[cb]\{[^}]*\}/g, "").length;
    const x = Math.max(0, Math.floor((this.width - visibleLength) / 2));
    this.display.drawText(x, row, text);
  }
}
