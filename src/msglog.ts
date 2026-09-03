import { Game } from "./game";
import { inputKey } from "./input";
import { Viewport } from "./viewport";

/* On the one hand, this mixes 'model' and 'view' parts.
On the other hand, this places all/most-of the messagelog-stuff
together in a single place.
*/


/**
 * Accumulates messages produced during a turn and controls how they are
 * shown to the player. Owned by the {@link Game} and reached via
 * `game.log`.
 *
 * During a turn (the player's action plus every NPC's action), {@link msg}
 * enqueues text instead of drawing it. Afterwards the loop calls
 * {@link showQueuedMessages} to present all-but-the-last message one at a
 * time (each waiting for a key press), then {@link commitFinal} to move the
 * single remaining message into the persistent final-message buffer. The
 * viewport renders that final message every frame via
 * {@link drawFinalMessage}, so it persists across redraws until the player
 * commits their next real turn.
 */
/** How many past messages {@link MsgQueue.history} keeps around for the 'p'/'P' log view (see {@link openLogView}). */
const HISTORY_LIMIT = 200;

export class MsgQueue {
  /** Messages pending for the current turn. */
  private readonly queue: string[] = [];

  /**
   * Every message ever logged this game, oldest first, capped at
   * {@link HISTORY_LIMIT} (oldest entries drop off the front once full).
   * Independent of {@link queue}/{@link finalDisplayMessage} — those are
   * about *how* a message is first shown to the player turn-by-turn; this
   * is the permanent record {@link openLogView} scrolls back through.
   */
  private readonly history: string[] = [];

  /**
   * The last message of the previous turn, shown as part of the normal
   * viewport render. Kept separate from {@link queue} so it survives the
   * multiple redraws that can happen while the player makes false-start
   * inputs.
   */
  private finalDisplayMessage = "";

  /**
   * Enqueues a message to be shown after the turn resolves, records it into
   * {@link history}, and logs it to the dev console immediately to aid
   * diagnostics during development.
   */
  msg(text: string): void {
    this.queue.push(text);
    this.history.push(text);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    console.log(text);
  }
  hasQueued(): boolean { return this.queue.length > 0; } /** True when at least one message is waiting in the queue. */

  /** The most recent `count` messages ever logged, oldest first (so they read top-to-bottom in log order). */
  recent(count: number): string[] {
    return this.history.slice(Math.max(0, this.history.length - count));
  }

  /**
   * Shows every queued message except the last, one at a time, waiting for a
   * key press between each. Returns immediately when 0 or 1 messages are
   * queued. Each shown message is removed, so the queue ends with 0 or 1
   * messages remaining.
   */
  async showQueuedMessages(viewport: Viewport, game: Game): Promise<void> {
    if (this.queue.length < 2) { return; }

    // if we are going to page messages, we need the game viewport refreshed to current state:
    viewport.draw(game);

    while (this.queue.length >= 2) {
      const text = this.queue.shift()!;
      // Number of messages still queued AFTER the one being shown now.
      const remaining = this.queue.length;
      this.drawRow(`(${remaining})${text}`, viewport);
      await inputKey();
    }
  }

  /**
   * Transfers the single remaining queued message (if any) into
   * {@link finalDisplayMessage} and clears the queue. When the queue is
   * empty, the final message becomes `""`, which clears the row on the next
   * redraw.
   */
  commitFinal(): void {
    this.finalDisplayMessage = this.queue.length === 1 ? this.queue[0] : "";
    this.queue.length = 0;
  }

  /** Renders the persistent final message on the message row, if any. */
  drawFinalMessage(viewport: Viewport): void {
    if (!this.finalDisplayMessage) { return; }
    this.drawRow(this.finalDisplayMessage, viewport);
  }

  /** Draws `text` in the message area, wrapping across rows if necessary — see {@link Viewport.drawMessageRows}. */
  private drawRow(text: string, viewport: Viewport): void {
    viewport.drawMessageRows(text);
  }
}

/**
 * Draws the read-only message-log screen — title, the most recent messages
 * (see {@link MsgQueue.recent}) oldest at the top, newest at the bottom,
 * and `footer` on the bottom row. Shared by {@link openLogView} (the normal
 * in-game 'p'/'P' log) and ./combat.ts's game-over log toggle, so "how do I
 * read the log" only has one implementation.
 */
export function drawLogScreen(game: Game, viewport: Viewport, footer: string): void {
  const { display, height, width } = viewport;
  const bodyRows = Math.max(0, height - 2); // title row + footer row.
  const lines = game.log.recent(bodyRows);

  display.clear();
  display.drawText(0, 0, "Message Log");
  lines.forEach((line, i) => display.drawText(0, 1 + i, line.slice(0, width)));
  display.drawText(0, height - 1, footer);
}

/**
 * Handles the 'p'/'P' log command: a full-screen, read-only view of the
 * most recent messages, oldest at the top, newest at the bottom. Escape
 * closes it. Wired from `movePlayer()` (`src/move-player.ts`).
 *
 * @returns `false` always — reading the log isn't an action in the world,
 *   so it never consumes a turn.
 */
export async function openLogView(game: Game, viewport: Viewport): Promise<boolean> {
  drawLogScreen(game, viewport, "[[ESC]] close");

  while ((await inputKey()).key !== "Escape") { /* ignore any other key */ }

  viewport.draw(game);
  return false;
}
