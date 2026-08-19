import { Mob } from "./dmap";
/**
 * A queue of {@link Mob}s living on a map. Wraps a plain array (exposed as
 * {@link MobQ.mobs}) so callers can iterate it directly, while push/find go
 * through the queue.
 */
export class MobQ {
  readonly mobs: Mob[] = [];   /** The backing mob list, mutated in place as mobs move. */
  push(...mobs: Mob[]): void { this.mobs.push(...mobs); }   /** Adds one or more mobs to the queue. */
  find(pred: (mob: Mob) => boolean): Mob | undefined { return this.mobs.find(pred); }   /** The first mob matching `pred`, or `undefined` if none do. */
  front(): Mob | null { return this.mobs[0] ?? null; }   /** The mob at the front of the queue, or `null` if the queue is empty. */
  rotate(): Mob | null {
    if (this.mobs.length > 0) { this.mobs.push(this.mobs.shift()!); }
    return this.front();
  }
  /**
   * Moves the front mob to the back of the queue, doing nothing if the
   * queue is empty. Returns the new front mob, or `null` if empty.
   */
}
