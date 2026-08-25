import * as ROT from "rot-js";
import { Tile, T_Tile, Pos } from "./dmap";
import { Game } from "./game";
import { drawMobs } from "./mobs";
import { MOB_TYPES } from "./mob-factory";
import { createDisplay } from "./rdisplay";
import { drawHud, mapWidth } from "./hud";

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
    const { map, player } = game;
    const mapW = mapWidth(this);
    const halfW = Math.floor(mapW / 2);
    const halfH = Math.floor(this.height / 2);
    const originX = player.x - halfW;
    const originY = player.y - halfH;

    this.display.clear(); // (we only need clear because of the map.inBounds mechanism below. if we drew the entire viewport always, that would handle the clear. )

    // Reuse one scratch Pos for every cell; inBounds/get read it and forget
    // it, so mutating in place avoids allocating an object per tile.
    const at: Pos = { x: 0, y: 0 };
    for (let sy = 0; sy < this.height; sy++) {
      for (let sx = 0; sx < mapW; sx++) {
        at.x = originX + sx;
        at.y = originY + sy;
        if (!map.inBounds(at)) continue;

        const tile = map.get(at);
        const [glyph, fg] = TILE_GLYPHS[tile];
        const color = tile === Tile.Wall ? game.wallShader.colorAt(at) : fg;
        this.display.draw(sx, sy, glyph, color, "#000");
      }
    }

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
