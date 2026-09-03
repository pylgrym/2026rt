/**
 * Every one of ../spells.md's 51 spells gets its own unique, hand-tuned
 * sound effect here — no two spells share notes, oscillator type, and
 * envelope all at once. All built from {@link playTones} (./juice-sound.ts)
 * so there's still just the one shared oscillator/envelope implementation;
 * only the note data differs per spell.
 *
 * {@link SPELL_SOUND} maps each spell's ../src/spells.ts `SPELLS` registry
 * letter key to its sound, so `spells.ts` and `items.ts` (which casts
 * spells for free through potions/scrolls/wands/staffs) can trigger the
 * right one with a single `spell.sound()` call after a successful cast,
 * instead of every cast function picking its own sound by hand.
 */
import { playTones } from "./juice-sound";

/** A dull thud, played when the player tries to cast without enough mana. Not a spell effect — a UI failure cue, so it isn't part of the per-spell roster below. */
export function playSpellFail(): void {
  playTones([[140.0, 0.0, 0.12]], "square", 0.15);
}

// ---------------------------------------------------------------------------
// Offensive / Damage Spells
// ---------------------------------------------------------------------------

function soundFireball(): void {
  playTones([[90, 0, 0.05], [600, 0.02, 0.05], [1400, 0.05, 0.08], [300, 0.12, 0.15]], "sawtooth", 0.28);
}
function soundLightningBolt(): void {
  playTones([[1800, 0, 0.02], [2200, 0.02, 0.02], [1600, 0.04, 0.02], [2400, 0.06, 0.05]], "square", 0.2);
}
function soundIceShard(): void {
  playTones([[1200, 0, 0.05], [1600, 0.04, 0.05], [2000, 0.08, 0.05], [2600, 0.12, 0.12]], "triangle", 0.18);
}
function soundPoisonCloud(): void {
  playTones([[300, 0, 0.1], [280, 0.08, 0.1], [320, 0.16, 0.1], [260, 0.24, 0.18]], "sine", 0.16);
}
function soundMeteorStrike(): void {
  playTones([[2000, 0, 0.05], [1000, 0.05, 0.08], [500, 0.12, 0.1], [80, 0.2, 0.35]], "sawtooth", 0.3);
}
function soundChainLightning(): void {
  playTones([[1500, 0, 0.03], [1300, 0.04, 0.03], [1700, 0.08, 0.03], [1200, 0.12, 0.03], [1900, 0.16, 0.05]], "square", 0.18);
}
function soundArcaneMissile(): void {
  playTones([[900, 0, 0.05], [1200, 0.05, 0.08]], "sine", 0.18);
}
function soundVoidBeam(): void {
  playTones([[110, 0, 0.15], [116, 0.05, 0.15], [220, 0.15, 0.2]], "sawtooth", 0.2);
}
function soundShadowSpike(): void {
  playTones([[80, 0, 0.08], [1000, 0.06, 0.04], [60, 0.1, 0.15]], "square", 0.22);
}
function soundFrostNova(): void {
  playTones([[1046, 0, 0.1], [1318, 0.02, 0.1], [1568, 0.04, 0.14], [2093, 0.08, 0.2]], "triangle", 0.2);
}

// ---------------------------------------------------------------------------
// Crowd Control
// ---------------------------------------------------------------------------

function soundStunBolt(): void {
  playTones([[2500, 0, 0.03], [100, 0.03, 0.08]], "square", 0.22);
}
function soundRoot(): void {
  playTones([[150, 0, 0.12], [200, 0.1, 0.12], [260, 0.2, 0.16]], "sawtooth", 0.16);
}
function soundKnockbackBlast(): void {
  playTones([[400, 0, 0.06], [200, 0.06, 0.06], [80, 0.12, 0.14]], "triangle", 0.22);
}
function soundGravityWell(): void {
  playTones([[500, 0, 0.15], [300, 0.15, 0.15], [150, 0.3, 0.2], [80, 0.45, 0.25]], "sine", 0.2);
}
function soundSleepSpell(): void {
  playTones([[784, 0, 0.15], [659, 0.15, 0.15], [523, 0.3, 0.2], [392, 0.45, 0.3]], "sine", 0.14);
}
function soundSilence(): void {
  playTones([[500, 0, 0.06]], "sine", 0.1);
}
function soundPolymorph(): void {
  playTones([[300, 0, 0.06], [600, 0.06, 0.06], [250, 0.12, 0.06], [700, 0.18, 0.1]], "square", 0.18);
}
function soundTimeSlow(): void {
  playTones([[800, 0, 0.3], [400, 0.3, 0.3], [200, 0.6, 0.4]], "triangle", 0.16);
}

// ---------------------------------------------------------------------------
// Defensive Spells
// ---------------------------------------------------------------------------

function soundShield(): void {
  playTones([[660, 0, 0.1], [880, 0.03, 0.14], [660, 0.15, 0.2]], "triangle", 0.2);
}
function soundBarrierWall(): void {
  playTones([[100, 0, 0.08], [80, 0.08, 0.12], [60, 0.16, 0.2]], "square", 0.26);
}
function soundReflect(): void {
  playTones([[2000, 0, 0.06], [2500, 0.05, 0.14]], "sine", 0.18);
}
function soundInvisibility(): void {
  playTones([[600, 0, 0.1], [400, 0.1, 0.12], [200, 0.22, 0.2]], "sine", 0.12);
}
function soundHealingAura(): void {
  playTones([[523, 0, 0.1], [659, 0.06, 0.1], [880, 0.12, 0.14], [1046, 0.2, 0.2]], "sine", 0.2);
}
function soundCleanse(): void {
  playTones([[1200, 0, 0.05], [1500, 0.04, 0.05], [1800, 0.08, 0.08]], "triangle", 0.16);
}
function soundDamageReductionWard(): void {
  playTones([[220, 0, 0.15], [220, 0.15, 0.15], [330, 0.3, 0.2]], "square", 0.16);
}
function soundBlink(): void {
  playTones([[400, 0, 0.03], [1600, 0.03, 0.05]], "sine", 0.18);
}

// ---------------------------------------------------------------------------
// Utility / Movement
// ---------------------------------------------------------------------------

function soundHaste(): void {
  playTones([[600, 0, 0.03], [800, 0.03, 0.03], [1000, 0.06, 0.03], [1300, 0.09, 0.05]], "triangle", 0.18);
}
function soundLevitate(): void {
  playTones([[400, 0, 0.08], [600, 0.08, 0.08], [800, 0.16, 0.1], [1000, 0.26, 0.14]], "sine", 0.14);
}
function soundLight(): void {
  playTones([[1500, 0, 0.08], [2000, 0.06, 0.16]], "triangle", 0.18);
}
function soundDetectEnemies(): void {
  playTones([[800, 0, 0.04], [800, 0.1, 0.04], [800, 0.2, 0.06]], "square", 0.14);
}
function soundSummonPortal(): void {
  playTones([[500, 0, 0.1], [700, 0.1, 0.1], [500, 0.2, 0.1], [900, 0.3, 0.16]], "sawtooth", 0.16);
}
function soundWaterwalk(): void {
  playTones([[1000, 0, 0.04], [1200, 0.05, 0.04], [900, 0.1, 0.06]], "sine", 0.14);
}

// ---------------------------------------------------------------------------
// Summoning
// ---------------------------------------------------------------------------

function soundSummonSkeleton(): void {
  playTones([[200, 0, 0.05], [220, 0.05, 0.05], [180, 0.1, 0.05], [100, 0.16, 0.2]], "square", 0.2);
}
function soundSummonSwarm(): void {
  playTones([[1200, 0, 0.02], [1400, 0.02, 0.02], [1100, 0.04, 0.02], [1500, 0.06, 0.02], [1300, 0.08, 0.03]], "square", 0.12);
}
function soundElementalFamiliar(): void {
  playTones([[700, 0, 0.06], [1000, 0.05, 0.06], [1300, 0.1, 0.1]], "sawtooth", 0.18);
}
function soundNecroticReanimation(): void {
  playTones([[130, 0, 0.2], [164, 0.2, 0.2], [196, 0.4, 0.3]], "sawtooth", 0.2);
}
function soundArmyOfTheDead(): void {
  playTones([[110, 0, 0.15], [110, 0.1, 0.15], [147, 0.25, 0.2], [196, 0.45, 0.3], [220, 0.7, 0.4]], "sawtooth", 0.26);
}

// ---------------------------------------------------------------------------
// Environmental / Terrain
// ---------------------------------------------------------------------------

function soundEarthquake(): void {
  playTones([[60, 0, 0.3], [70, 0.15, 0.3], [55, 0.3, 0.4]], "sawtooth", 0.3);
}
function soundFlameWall(): void {
  playTones([[500, 0, 0.05], [700, 0.03, 0.05], [400, 0.08, 0.08], [600, 0.13, 0.1]], "sawtooth", 0.22);
}
function soundIcePlatform(): void {
  playTones([[900, 0, 0.06], [1100, 0.06, 0.06], [1300, 0.12, 0.08], [1500, 0.2, 0.12]], "triangle", 0.16);
}
function soundWebTrap(): void {
  playTones([[500, 0, 0.05], [450, 0.05, 0.05], [500, 0.1, 0.05], [400, 0.15, 0.1]], "square", 0.14);
}
function soundSpikeTrap(): void {
  playTones([[1800, 0, 0.02], [200, 0.02, 0.1]], "square", 0.24);
}

// ---------------------------------------------------------------------------
// Buff / Debuff
// ---------------------------------------------------------------------------

function soundWeaken(): void {
  playTones([[500, 0, 0.1], [350, 0.1, 0.14], [250, 0.24, 0.18]], "sawtooth", 0.16);
}
function soundArmorBreak(): void {
  playTones([[1200, 0, 0.02], [800, 0.02, 0.03], [400, 0.05, 0.06], [150, 0.11, 0.12]], "square", 0.2);
}
function soundMarkForDeath(): void {
  playTones([[90, 0, 0.2], [1800, 0.05, 0.1]], "triangle", 0.2);
}
function soundEmpower(): void {
  playTones([[400, 0, 0.05], [600, 0.05, 0.05], [800, 0.1, 0.05], [1100, 0.15, 0.1], [1400, 0.25, 0.16]], "sawtooth", 0.2);
}
function soundCurse(): void {
  playTones([[400, 0, 0.15], [420, 0.1, 0.15], [380, 0.25, 0.2]], "sawtooth", 0.18);
}

// ---------------------------------------------------------------------------
// Ultimate / High-Cost Spells
// ---------------------------------------------------------------------------

function soundBlizzard(): void {
  playTones([[1568, 0, 0.15], [1976, 0.05, 0.15], [2349, 0.1, 0.2], [1046, 0.2, 0.3]], "triangle", 0.22);
}
function soundBlackHole(): void {
  playTones([[800, 0, 0.2], [400, 0.2, 0.2], [150, 0.4, 0.3], [40, 0.7, 0.5]], "sine", 0.24);
}
function soundDivineJudgment(): void {
  playTones([[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.1], [1046, 0.24, 0.14], [1568, 0.34, 0.3]], "triangle", 0.3);
}
function soundTimeStop(): void {
  playTones([[440, 0, 0.4], [466, 0, 0.4], [880, 0.1, 0.5]], "sine", 0.18);
}

// ---------------------------------------------------------------------------
// ../spells-new.md additions — 50 more spells. Generated procedurally so
// each still gets its own distinct, deterministic stinger without 50
// hand-tuned note tables; only the seed (and thus the resulting
// frequencies/oscillator/note-count) differs per spell, still built on the
// one shared {@link playTones} envelope.
// ---------------------------------------------------------------------------

const NEW_SPELL_OSC: readonly OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

function proceduralSpellSound(seed: number): () => void {
  const osc = NEW_SPELL_OSC[seed % NEW_SPELL_OSC.length];
  const base = 200 + (seed * 137) % 1600;
  const noteCount = 2 + (seed % 3);
  const notes: Array<[number, number, number]> = [];
  for (let i = 0; i < noteCount; i++) {
    const freq = base * (1 + i * 0.35 + (seed % 5) * 0.05);
    notes.push([freq, i * 0.05, 0.06 + (seed % 4) * 0.02]);
  }
  return () => playTones(notes, osc, 0.18 + (seed % 3) * 0.03);
}

const NEW_SPELL_SOUND: Readonly<Record<string, () => void>> = {
  Z: proceduralSpellSound(1), "1": proceduralSpellSound(2), "2": proceduralSpellSound(3),
  "3": proceduralSpellSound(4), "4": proceduralSpellSound(5), "5": proceduralSpellSound(6),
  "6": proceduralSpellSound(7), "7": proceduralSpellSound(8), "8": proceduralSpellSound(9),
  "9": proceduralSpellSound(10), "0": proceduralSpellSound(11), "!": proceduralSpellSound(12),
  "@": proceduralSpellSound(13), "#": proceduralSpellSound(14), "$": proceduralSpellSound(15),
  "%": proceduralSpellSound(16), "^": proceduralSpellSound(17), "&": proceduralSpellSound(18),
  "*": proceduralSpellSound(19), "(": proceduralSpellSound(20), ")": proceduralSpellSound(21),
  "-": proceduralSpellSound(22), "=": proceduralSpellSound(23), "[": proceduralSpellSound(24),
  "]": proceduralSpellSound(25), "\\": proceduralSpellSound(26), ";": proceduralSpellSound(27),
  "'": proceduralSpellSound(28), ",": proceduralSpellSound(29), ".": proceduralSpellSound(30),
  "/": proceduralSpellSound(31), "`": proceduralSpellSound(32), "_": proceduralSpellSound(33),
  "+": proceduralSpellSound(34), "{": proceduralSpellSound(35), "}": proceduralSpellSound(36),
  "|": proceduralSpellSound(37), ":": proceduralSpellSound(38), "\"": proceduralSpellSound(39),
  "<": proceduralSpellSound(40), ">": proceduralSpellSound(41), "?": proceduralSpellSound(42),
  "~": proceduralSpellSound(43), F1: proceduralSpellSound(44), F2: proceduralSpellSound(45),
  F3: proceduralSpellSound(46), F4: proceduralSpellSound(47), F5: proceduralSpellSound(48),
  F6: proceduralSpellSound(49), F7: proceduralSpellSound(50),
};

/**
 * Every spell's sound, keyed by its ../src/spells.ts `SPELLS` registry
 * letter — the single source of truth `spells.ts` and `items.ts` reach for.
 */
export const SPELL_SOUND: Readonly<Record<string, () => void>> = {
  a: soundFireball,
  b: soundLightningBolt,
  c: soundIceShard,
  d: soundPoisonCloud,
  e: soundMeteorStrike,
  f: soundChainLightning,
  g: soundArcaneMissile,
  h: soundVoidBeam,
  i: soundShadowSpike,
  j: soundFrostNova,

  k: soundStunBolt,
  l: soundRoot,
  m: soundKnockbackBlast,
  n: soundGravityWell,
  o: soundSleepSpell,
  p: soundSilence,
  q: soundPolymorph,
  r: soundTimeSlow,

  s: soundShield,
  t: soundBarrierWall,
  u: soundReflect,
  v: soundInvisibility,
  w: soundHealingAura,
  x: soundCleanse,
  y: soundDamageReductionWard,
  z: soundBlink,

  A: soundHaste,
  B: soundLevitate,
  C: soundLight,
  D: soundDetectEnemies,
  E: soundSummonPortal,
  F: soundWaterwalk,

  G: soundSummonSkeleton,
  H: soundSummonSwarm,
  I: soundElementalFamiliar,
  J: soundNecroticReanimation,

  K: soundEarthquake,
  L: soundFlameWall,
  M: soundIcePlatform,
  N: soundWebTrap,
  O: soundSpikeTrap,

  P: soundWeaken,
  Q: soundArmorBreak,
  R: soundMarkForDeath,
  S: soundEmpower,
  T: soundCurse,

  U: soundBlizzard,
  V: soundBlackHole,
  W: soundDivineJudgment,
  X: soundArmyOfTheDead,
  Y: soundTimeStop,

  ...NEW_SPELL_SOUND,
};
