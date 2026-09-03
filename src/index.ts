import { Viewport } from "./viewport";
import { Game } from "./game";
import { gameLoop } from "./gameloop";
import { waitAfterGameOver } from "./combat";
import { installGlobalErrorHandler } from "./error-overlay";

// Installed first, before anything else can throw.
installGlobalErrorHandler();

// TEMPORARY test hooks for the crash overlay — call from the devtools
// console: `testCrash()` for a thrown error, `testCrashAsync()` for a
// rejected promise (the shape the original bug report actually was).
// Remove once the overlay's been verified.
(window as any).testCrash = () => { throw new Error("Test crash (testCrash())"); };
(window as any).testCrashAsync = () => { Promise.reject(new Error("Test async crash (testCrashAsync())")); };

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
    await waitAfterGameOver(game, viewport);
  }
}

main();
