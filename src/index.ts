import { Viewport } from "./viewport";
import { Game } from "./game";
import { gameLoop } from "./gameloop";

async function main(): Promise<void> {
  /** The dungeon map and the player that walks it. */
  const game = new Game();

  /** Logical viewport size, measured in tiles (characters). */
  const VP_WIDTH = 32;
  const VP_HEIGHT = 24;
  const viewport = await Viewport.create(VP_WIDTH, VP_HEIGHT);

  await gameLoop(game, viewport);
}

main();
