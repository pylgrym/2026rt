import type { Game } from "../game";

/**
 * Generic turn-delayed callback scheduler, for every ../spells-new.md spell
 * that fires now but resolves later: Echo Strike's damage echo, Cinder
 * Rain's falling scatter, Doom Clock's detonation, Collapsing Ceiling's
 * debris, and Chrono Fracture's replayed echoes. One flat list on
 * {@link Game} (`game.delayedEvents`), ticked once per round from
 * ./gameloop.ts — mirrors ./field-effects.ts's shape but for one-shot
 * callbacks instead of ongoing ground zones.
 */
export interface DelayedEvent {
  turnsLeft: number;
  run: (game: Game) => void;
}

export function scheduleDelayed(game: Game, turns: number, run: (game: Game) => void): void {
  game.delayedEvents.push({ turnsLeft: turns, run });
}

/** Advances every scheduled event by one round, firing (and dropping) any whose timer has run out. */
export function tickDelayedEvents(game: Game): void {
  const remaining: DelayedEvent[] = [];
  for (const ev of game.delayedEvents) {
    ev.turnsLeft -= 1;
    if (ev.turnsLeft <= 0) ev.run(game);
    else remaining.push(ev);
  }
  game.delayedEvents = remaining;
}
