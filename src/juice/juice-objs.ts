/**
 * Sound effects for the objects/ranged epics (see ../obj-design.md and
 * ../ranged-design.md): using an item to heal (the plain hp top-up and the
 * fancier max-hp boost), and the ranged missile's looping zap. Reuses
 * {@link playTones} from ./juice-sound.ts for the actual oscillator work —
 * this file just picks notes.
 */

import { playTones } from "./juice-sound";

/**
 * A quick two-note upward chime — {@link healSpell}'s plain case, topping
 * the player's hp back up.
 */
export function playObjHealSimple(): void {
  playTones(
    [
      [880.0, 0.00, 0.10],
      [1174.7, 0.05, 0.14],
    ],
    "sine",
    0.2
  );
}

/**
 * A grander five-note ascending fanfare with a shimmering high cap note —
 * {@link healSpell}'s rarer case, boosting the player's max hp.
 */
export function playObjHealFancy(): void {
  playTones(
    [
      [523.25, 0.00, 0.10],
      [659.25, 0.05, 0.10],
      [783.99, 0.10, 0.10],
      [1046.5, 0.15, 0.14],
      [1568.0, 0.20, 0.22],
    ],
    "triangle",
    0.22
  );
}

/**
 * One "zap" of the ranged missile's travel sound. Called once per animation
 * step in ./ranged.ts, so retriggering it every ~50ms is what makes the
 * effect read as one continuous, buzzing zap rather than a single blip. The
 * pitch descends and jitters a little with each `step`, so consecutive
 * retriggers don't sound like an identical loop.
 */
export function playZapStep(step: number): void {
  const descend = step * 18;
  const jitter = (Math.random() - 0.5) * 70;
  const freq = Math.max(180, 900 - descend + jitter);
  playTones([[freq, 0, 0.045]], "square", 0.12);
}
