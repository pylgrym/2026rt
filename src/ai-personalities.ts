import type { AiTraits } from "./ai-types";

/**
 * The "average" monster: middling on everything. Every entry in
 * {@link PERSONALITIES} is a partial override merged on top of this, so a
 * species only needs to specify the traits that make it stand out.
 */
const DEFAULT_TRAITS: AiTraits = {
  aggression: 0.5,
  territorial: 0.5,
  ambusher: 0.1,
  feinter: 0.1,
  hitAndRun: 0.1,
  kiter: 0.1,
  morale: 0.4,
  alerter: 0.2,
  courage: 0.5,
};

/**
 * Fixed personality mixes for the 26 monster levels (see
 * {@link ./mob-factory.ts}'s `MOB_TYPES`), keyed by name. Each is a
 * deliberately small set of standout traits layered over
 * {@link DEFAULT_TRAITS} — the point isn't precise tuning, it's that
 * `fox` and `hog` and `rat` *feel* like different animals when you meet
 * them, per ../ai_ideas.md.
 */
export const PERSONALITIES: Readonly<Record<string, Partial<AiTraits>>> = {
  // Level 1-5: simple critters, mostly default with one quirk each.
  ant: { territorial: 0.9, courage: 0.8 }, // colony insect: never strays, brave near the nest.
  bat: { aggression: 0.3, ambusher: 0.2, territorial: 0.2, kiter: 0.6 }, // erratic flier, never sits still long enough to be cornered.
  cat: { ambusher: 0.7, feinter: 0.4 }, // stalks from blind spots, toys with its prey.
  dog: { aggression: 0.7, alerter: 0.5, courage: 0.7 }, // barks the alarm, presses the chase.
  eye: { ambusher: 0.8, aggression: 0.2, territorial: 0.7, kiter: 0.4 }, // a watcher that lurks and keeps its distance.

  // Level 6-10.
  fox: { feinter: 0.6, hitAndRun: 0.4, courage: 0.6 }, // classic trickster: bait and dart.
  git: { alerter: 0.7, courage: 0.2, hitAndRun: 0.3 }, // sneaky little coward that calls its friends.
  hog: { territorial: 0.8, aggression: 0.7, morale: 0.1 }, // brute that holds its ground and doesn't flee.
  imp: { feinter: 0.7, hitAndRun: 0.3, ambusher: 0.3 }, // impish, unpredictable, loves faking a retreat.
  jay: { alerter: 0.8, ambusher: 0.3, kiter: 0.5 }, // a lookout bird — sounds the alarm from cover, won't be pinned.

  // Level 11-15.
  koi: { territorial: 0.95, aggression: 0.1, morale: 0.2 }, // stays in its pond, barely bothers to fight.
  loon: { feinter: 0.5, ambusher: 0.4, kiter: 0.4 }, // odd, evasive, hard to pin down.
  moth: { aggression: 0.2, territorial: 0.1, morale: 0.6, kiter: 0.5 }, // drifts, doesn't commit, flees readily.
  newt: { territorial: 0.7, morale: 0.6 }, // timid, sticks close to home water.
  orc: { aggression: 0.9, courage: 0.8, hitAndRun: 0.1 }, // straightforward brute, presses every fight.

  // Level 16-20.
  pig: { territorial: 0.7, morale: 0.5 }, // placid, defends its patch, no hero.
  quail: { courage: 0.15, morale: 0.8, alerter: 0.4, kiter: 0.3 }, // covey bird: brave in numbers, bolts alone.
  rat: { aggression: 0.6, courage: 0.2, alerter: 0.3 }, // swarms in packs, useless alone.
  sow: { territorial: 0.8, morale: 0.2, courage: 0.9 }, // protective, will not run from a threat near home.
  toad: { ambusher: 0.9, aggression: 0.1, territorial: 0.6 }, // sits and waits, barely moves otherwise.

  // Level 21-26.
  urchin: { courage: 0.15, aggression: 0.5, alerter: 0.4 }, // gang mentality: bold together, timid alone.
  vole: { territorial: 0.6, morale: 0.7 }, // skittish burrower.
  wasp: { hitAndRun: 0.8, aggression: 0.6 }, // sting-and-flee, repeatedly.
  xerus: { alerter: 0.9, territorial: 0.6 }, // ground-squirrel sentinel: watches, calls, doesn't chase far.
  yak: { territorial: 0.9, morale: 0.05, courage: 0.9 }, // huge and stubborn, never flees.
  zebu: { territorial: 0.7, morale: 0.3, courage: 0.7, alerter: 0.3 }, // herd animal, calls the herd, holds firm.
} as const;

/** The full trait set for a monster of the given `name`, defaults filled in for anything the species doesn't override. */
export function getTraits(name: string): AiTraits {
  return { ...DEFAULT_TRAITS, ...PERSONALITIES[name] };
}
