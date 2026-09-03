import { Viewport } from "./viewport";
import { movePlayer } from "./move-player";
import { Game } from "./game";
import { inputKey } from "./input";
import { npcTurn } from "./sneaky-ai";
import { Mob, isPly } from "./dmap";
import { showGameOver } from "./combat";
import { tickOocHeal } from "./ooc-heal";
import { tickMana } from "./magic/mana";
import { tickStatuses, isIncapacitated, isHasted, rollSlowSkip } from "./magic/status-effects";
import { tickFieldEffects } from "./magic/field-effects";
import { isAlly, allyTurn, tickSummonLifespans } from "./magic/summons";
import { tickDelayedEvents } from "./magic/delayed-events";
import { tickPositionHistory } from "./magic/position-history";
import { tickMimicCurse, tickAnchors } from "./magic/forced-movement";
import { tickFracture } from "./magic/fracture";

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

async function plyOneAction(game: Game, vp: Viewport):Promise<void> {
    let didTurn = false;
    while (!didTurn) {
      const keyEvent = await inputKey();
      didTurn = await movePlayer(game, keyEvent.key, vp);
    }
}

async function plyTurn(game: Game, vp: Viewport):Promise<void> {
    if (isIncapacitated(game.player)) {
      game.log.msg("you can't act");
      return;
    }
    if (rollSlowSkip(game.player)) {
      game.log.msg("you are too slow to act");
      return;
    }
    // Haste grants exactly one extra action per round; it does not
    // recursively re-check itself, so it can never compound within a round.
    const extraAction = isHasted(game.player);
    await plyOneAction(game, vp);
    if (extraAction && !is_gameOver(game) && !isIncapacitated(game.player)) await plyOneAction(game, vp);
}

async function doTurn(m:Mob, g: Game, vp: Viewport):Promise<void> {
  if (isPly(m)) { await plyTurn(g, vp); return; }
  if (isIncapacitated(m) || rollSlowSkip(m)) return;
  const act = isAlly(m) ? () => allyTurn(g, m) : () => npcTurn(g, m);
  const extraAction = isHasted(m);
  act();
  if (extraAction && !isIncapacitated(m)) act();
}

export async function doTurns(g:Game, vp: Viewport):Promise<void> {
  const Q = g.map.Q;
  let next = Q.front();
  assert(isPly(next), "player should be first mob in queue"); // INVARIANT expected.
  do {
    turnLoopInvariants(next,g);
    await doTurn(next!,g,vp);
    next = Q.rotate();
  } while (!isPly(next) && !is_gameOver(g));
}

export function isDead(m: Mob): boolean { return m.hp <= 0; }
export function is_gameOver(g: Game): boolean { return isDead(g.player); }

export async function gameLoop(g: Game, vp: Viewport): Promise<void> {
  while (true) {
    await showAnyMessages(g, vp); // now the round has ended, show any messages to the player:
    vp.draw(g); // now that final message is committed, redraw the game state with it.
    if (is_gameOver(g)){break;}
    await doTurns(g, vp);
    tickOocHeal(g); // once per round, after the player and every mob has acted.
    tickMana(g);
    tickStatuses(g);
    tickFieldEffects(g);
    tickSummonLifespans(g);
    tickDelayedEvents(g);
    tickPositionHistory(g);
    tickMimicCurse(g);
    tickAnchors(g);
    tickFracture(g);
  }
  showGameOver(g,vp);
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

