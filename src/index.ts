import { Viewport } from "./viewport";
import { Game } from "./game";
import { gameLoop } from "./gameloop";
import { waitAfterRoundEnd } from "./combat";
import { installGlobalErrorHandler } from "./error-overlay";
import { showWelcomeScreen } from "./welcome";
import { registerCareer } from "./api";

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

  // Each pass plays one game to its end — death or victory (see
  // ./combat.ts's showGameOver/showVictory) — then waits for Enter before
  // starting a fresh one. The viewport/canvas is only ever set up once;
  // just the Game state gets replaced.
  while (true) {
    const game = new Game();
    await showWelcomeScreen(game, viewport);
    await gameLoop(game, viewport);
    await registerCareer({
      name: game.charName,
      charlevel: game.xp.level,
      bane: game.won ? "ripe old age" : game.deathCause,
      dunlevel: game.dungeon.curLevel,
    });
    await waitAfterRoundEnd(game, viewport, game.won ? "win" : "loss");
  }
}

main();
