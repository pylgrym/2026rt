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
export class MsgQueue {
  /** Messages pending for the current turn. */
  private readonly queue: string[] = [];

  /**
   * The last message of the previous turn, shown as part of the normal
   * viewport render. Kept separate from {@link queue} so it survives the
   * multiple redraws that can happen while the player makes false-start
   * inputs.
   */
  private finalDisplayMessage = "";

  /**
   * Enqueues a message to be shown after the turn resolves, and logs it to
   * the dev console immediately to aid diagnostics during development.
   */
  msg(text: string): void { this.queue.push(text); console.log(text); } 
  hasQueued(): boolean { return this.queue.length > 0; } /** True when at least one message is waiting in the queue. */

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

  /** Draws `text` across the top row, padded so it overwrites the row. */
  private drawRow(text: string, viewport: Viewport): void {
    const display = viewport.display; 
    const width = display.getOptions().width;
    display.drawText(0, 0, text.padEnd(width, " "));
  }
}
