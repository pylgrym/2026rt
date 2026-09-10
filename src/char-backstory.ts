import * as ROT from "rot-js";

/** Word pools for {@link generateBackstory}'s templates. */
const ORIGINS = ["a disgraced knight", "an orphaned scribe", "a runaway apprentice", "a debt-ridden merchant", "an exiled priest", "a failed alchemist", "a wandering mercenary", "a village outcast"];
const REASONS = ["seeking a lost treasure", "fleeing a cursed name", "chasing a family debt", "hunting the beast that killed their kin", "searching for a cure", "answering a dead god's whisper", "running from the law", "looking for a place to belong"];

/** A one-sentence, randomly assembled backstory for the player character. */
export function generateBackstory(): string {
  const origin = ROT.RNG.getItem(ORIGINS)!;
  const reason = ROT.RNG.getItem(REASONS)!;
  return `${capitalize(origin)}, ${reason}.`;
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
