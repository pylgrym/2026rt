import * as ROT from "rot-js";
import { Tile, T_Tile, Pos } from "./dmap";
import { Game } from "./game";
import { drawMobs } from "./mobs";
import { createDisplay } from "./rdisplay";

/** Visual representation of each tile: [glyph, foreground colour]. */
export const TILE_GLYPHS: Record<T_Tile, [string, string]> = {
  [Tile.Floor]: [".", "#555"],
  [Tile.Wall]: ["#", "#888"],
  [Tile.Nest]: ["*", "#c33"],
  [Tile.Ply]: ["@", "#fff"],
  [Tile.Rat]: ["r", "#287"],
};

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

  /** Draws the current frame of {@link game}, centred on the player. */
  draw(game: Game): void {
    const { map, player } = game;
    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);
    const originX = player.x - halfW;
    const originY = player.y - halfH;

    this.display.clear(); // (we only need clear because of the map.inBounds mechanism below. if we drew the entire viewport always, that would handle the clear. )

    // Reuse one scratch Pos for every cell; inBounds/get read it and forget
    // it, so mutating in place avoids allocating an object per tile.
    const at: Pos = { x: 0, y: 0 };
    for (let sy = 0; sy < this.height; sy++) {
      for (let sx = 0; sx < this.width; sx++) {
        at.x = originX + sx;
        at.y = originY + sy;
        if (!map.inBounds(at)) continue;

        const [glyph, fg] = TILE_GLYPHS[map.get(at)];
        this.display.draw(sx, sy, glyph, fg, "#000");
      }
    }

    drawMobs(this, game, { x: originX, y: originY });

    // player is now drawn as part of mobs.
    // The player is always drawn at the centre of the viewport.
    //this.display.draw(halfW, halfH, "@", "#fff", "#000");
    
    game.log.drawFinalMessage(this); // Overlay the persistent final message (if any) on the message row.
  }
}
