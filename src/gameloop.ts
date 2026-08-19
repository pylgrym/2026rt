import { Viewport } from "./viewport";
import { movePlayer } from "./move-player";
import { Game } from "./game";
import { inputKey } from "./input";
import { npcTurn } from "./mobs";
import { Mob, isPly } from "./dmap";

/**
 * Runs the main game loop: waits for a key, resolves the player's and
 * mobs' turns, presents any queued messages, and redraws. Never returns.
 *
 * Messages accumulate in the queue during a turn. After the turn resolves,
 * all-but-the-last message are shown one at a time (waiting for a key
 * press), then the final message is committed to the persistent buffer the
 * viewport renders. False-start inputs (unrecognised keys, or a blocked
 * move that produced no message) leave the previous frame and its final
 * message untouched.
 */

async function plyTurn(game: Game):Promise<void> {
    let didTurn = false;
    while (!didTurn) {
      const keyEvent = await inputKey();
      didTurn = movePlayer(game, keyEvent.key);
    }
}

async function doTurn(m:Mob, g: Game):Promise<void> {
  isPly(m) ? await plyTurn(g): npcTurn(g,m); 
}

export async function doTurns(g:Game):Promise<void> {
  const Q = g.map.Q;
  let next = Q.front();
  assert(isPly(next), "player should be first mob in queue"); // INVARIANT expected.
  do {
    turnLoopInvariants(next,g); 
    await doTurn(next!,g);
    next = Q.rotate();
  } while (!isPly(next) && !gameOver(g));
}

// placeholder:
export function isDead(m: Mob): boolean { return false; }
export function gameOver(g: Game): boolean { return isDead(g.player); }

export async function gameLoop(g: Game, vp: Viewport): Promise<void> {
  while (true) {
    await showAnyMessages(g, vp); // now the round has ended, show any messages to the player:
    vp.draw(g); // now that final message is committed, redraw the game state with it.
    if (gameOver(g)){break;}
    await doTurns(g); 
  }
}

async function showAnyMessages(game: Game, viewport: Viewport) {
    // Show all but the last message, one key press at a time, then commit
    // the final message and redraw the new state with it.
    await game.log.showQueuedMessages(viewport,game);
    game.log.commitFinal();
}

export function assert(required: boolean, complaint: string) {
  if (required) { return; }
  throw new Error(complaint);
}

function turnLoopInvariants(m:any, g:Game):void {
  assert(m != null, 'unexpected null in mob q.');
  assert(!!m, 'unexpected empty value in mob q.');
  assert(g.map.Q.mobs.length>0, 'mob q must be non-empty');
}

