/**
 * All game "juice" sound effects live here. The rest of the codebase only
 * ever makes single, argument-free function calls (e.g. {@link playAttack})
 * and never touches the Web Audio API directly.
 *
 * Sounds are synthesised on the fly with a shared {@link AudioContext} and
 * simple oscillators, so there are no audio asset files to ship or load.
 */

/** Lazily-created, shared audio context (one per page). */
let ctx: AudioContext | null = null;

/**
 * Returns the shared {@link AudioContext}, creating it on first use.
 * Browsers require audio contexts to be started from a user gesture; the
 * first key press that triggers a sound satisfies that, and a suspended
 * context is resumed here.
 */
function audio(): AudioContext | null {
  const Ctor =
    (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
  if (!Ctor) { return null; } // No Web Audio support (e.g. a test runner).
  if (!ctx) { ctx = new Ctor(); }
  if (ctx && ctx.state === "suspended") { void ctx.resume(); }
  return ctx;
}

/**
 * Plays a short sequence of tones. Each note is a `[frequency, startOffset,
 * duration]` triple (seconds), letting us build tiny melodies/stingers.
 */
function playTones(
  notes: ReadonlyArray<readonly [number, number, number]>,
  type: OscillatorType,
  peak: number
): void {
  const ac = audio();
  if (!ac) { return; }
  const now = ac.currentTime;
  for (const [freq, at, dur] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + at);

    // Quick attack, exponential decay — a plucky little envelope so notes
    // don't click on start/stop.
    const start = now + at;
    const end = start + dur;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(end);
  }
}

/**
 * A short, cheery ascending blip — played when the player attacks/bumps a
 * mob.
 */
export function playAttack(): void {
  // Bright major-triad arpeggio (C6, E6, G6) on a clean triangle wave.
  playTones(
    [
      [1046.5, 0.0, 0.09],
      [1318.5, 0.06, 0.09],
      [1568.0, 0.12, 0.11],
    ],
    "triangle",
    0.2
  );
}

/**
 * A short, ominous low descending tone — played when a mob bumps/attacks
 * the player.
 */
export function playHurt(): void {
  // Low, dissonant descending pair on a growly sawtooth wave.
  playTones(
    [
      [155.6, 0.0, 0.14],
      [110.0, 0.08, 0.2],
    ],
    "sawtooth",
    0.25
  );
}
