import { Viewport } from "./viewport";
import { Game } from "./game";
import { gameLoop } from "./gameloop";
import { inputKey } from "./input";

async function main(): Promise<void> {
  /** Logical viewport size, measured in tiles (characters). */
  const VP_WIDTH = 32;
  const VP_HEIGHT = 24;
  const viewport = await Viewport.create(VP_WIDTH, VP_HEIGHT);

  // Each pass plays one game to its end (see ./combat.ts's showGameOver),
  // then waits for Enter before starting a fresh one. The viewport/canvas
  // is only ever set up once; just the Game state gets replaced.
  while (true) {
    const game = new Game();
    await gameLoop(game, viewport);
    await waitForEnter();
  }
}

/** Waits for the player to press Enter, ignoring any other key. */
async function waitForEnter(): Promise<void> {
  while ("Enter" !== (await inputKey()).key); {} 
}

main();
