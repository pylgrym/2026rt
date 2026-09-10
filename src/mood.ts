import * as ROT from "rot-js";
import { DMap, Mob, Pos, walkable } from "./dmap";
import type { Game } from "./game";

/**
 * Behavioural state for a monster: {@link Sleep}ing mobs sit still in
 * their nest; {@link Wake} mobs chase/wander normally (see
 * {@link ./mobs.ts | npcTurn}). Only monsters use this — the player's
 * `mood` is left `undefined`, and every function here treats `undefined`
 * as "not a moody mob, nothing to do".
 */
export const Mood = {
  Sleep: 0,
  Wake: 1,
} as const;
export type T_Mood = (typeof Mood)[keyof typeof Mood];

/** Squared Euclidean distance between two positions (no sqrt). */
function distanceSq(a: Readonly<Pos>, b: Readonly<Pos>): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * True when a straight line from `a` to `b` (Bresenham) isn't blocked by
 * a wall tile strictly between the two endpoints.
 */
export function hasLineOfSight(map: DMap, a: Readonly<Pos>, b: Readonly<Pos>): boolean {
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    const isEndpoint = (x0 === a.x && y0 === a.y) || (x0 === x1 && y0 === y1);
    if (!isEndpoint && !walkable(map.get({ x: x0, y: y0 }))) return false;
    if (x0 === x1 && y0 === y1) return true;

    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Tiles within which a sleeping mob risks waking as the player nears. */
const WAKE_RISK_RADIUS = 6;
const WAKE_RISK_RADIUS_SQ = WAKE_RISK_RADIUS * WAKE_RISK_RADIUS;
/** Chance, per turn, that an at-risk sleeping mob actually wakes. */
const WAKE_CHANCE = 0.15;

/** Tiles beyond which an awake mob risks drifting back to sleep. */
const SLEEP_RISK_RADIUS = 10;
const SLEEP_RISK_RADIUS_SQ = SLEEP_RISK_RADIUS * SLEEP_RISK_RADIUS;
/** Chance, per turn, that an at-risk awake mob actually falls back asleep. */
const SLEEP_CHANCE = 0.1;

/**
 * True when `mob` currently sits in the zone where its mood could flip:
 * close enough (and, for sleepers, in line of sight) to maybe wake, or far
 * enough to maybe drift back asleep. Drives both the mood-change dice roll
 * in {@link tickMood} and the "at risk" glyph colour in {@link moodColor},
 * so the two always agree on what counts as "at risk".
 */
function atRisk(map: DMap, mob: Readonly<Mob>, player: Readonly<Pos>): boolean {
  if (mob.mood === undefined) return false;
  const distSq = distanceSq(mob, player);
  return mob.mood === Mood.Sleep
    ? distSq <= WAKE_RISK_RADIUS_SQ && hasLineOfSight(map, mob, player)
    : distSq > SLEEP_RISK_RADIUS_SQ;
}

/**
 * Rolls whether `mob`'s mood should flip this turn, mutating `mob.mood` in
 * place. A no-op for mobs without a mood (e.g. the player) and for mobs
 * not currently {@link atRisk}.
 */
export function tickMood(game: Game, mob: Mob): void {
  if (mob.mood === undefined) return;
  if (!atRisk(game.curMap(), mob, game.player)) return;

  const wasAsleep = mob.mood === Mood.Sleep;
  const chance = wasAsleep ? WAKE_CHANCE : SLEEP_CHANCE;
  if (ROT.RNG.getUniform() < chance) {
    mob.mood = wasAsleep ? Mood.Wake : Mood.Sleep;
    game.log.msg(wasAsleep ? `the ${mob.name} stirs` : `the ${mob.name} settles down`);
  }
}

/**
 * The glyph colour a moody mob should be drawn with: gray asleep, white
 * when at risk of waking, red awake, orange when at risk of falling back
 * asleep. Returns `null` for mobs without a mood, so callers can fall back
 * to their normal per-tile colour.
 */
export function moodColor(game: Game, mob: Readonly<Mob>): string | null {
  if (mob.mood === undefined) return null;
  const risk = atRisk(game.curMap(), mob, game.player);
  return mob.mood === Mood.Sleep
    ? (risk ? "#fff" : "#888")
    : (risk ? "#fa0" : "#f33");
}
