import * as ROT from "rot-js";

/** Syllable pools for {@link generateCharName}: a name is `onset + middle + coda`, each optional-weighted by pool. */
const ONSETS = ["b", "br", "c", "d", "dr", "f", "gr", "h", "k", "l", "m", "n", "r", "s", "sh", "t", "th", "v", "w"];
const MIDDLES = ["a", "e", "i", "o", "u", "ae", "ia", "or", "an", "en", "ar"];
const CODAS = ["", "", "n", "r", "s", "th", "d", "k", "m", "rd", "lin", "ric", "wyn"];

/** A short, pronounceable fantasy name for the player character, e.g. "Brenthor", "Kaeric". */
export function generateCharName(): string {
  const onset = ROT.RNG.getItem(ONSETS)!;
  const middle = ROT.RNG.getItem(MIDDLES)!;
  const coda = ROT.RNG.getItem(CODAS)!;
  const raw = onset + middle + coda;
  return raw[0].toUpperCase() + raw.slice(1);
}
