import * as ROT from "rot-js";
import { isPly, walkable, type Mob, type Pos } from "./dmap";
import type { Game } from "./game";
import { Mood, tickMood, hasLineOfSight } from "./mood";
import { occupant } from "./mobs";
import { moveOrBump } from "./move-player";
import { AiState, type AiMemory, type AiTraits } from "./ai-types";
import { getTraits } from "./ai-personalities";
import { stepToward, stepAway, NEIGHBOURS8 } from "./ai-pathing";
import { isInvisible } from "./magic/status-effects";

/**
 * The grand monster-AI dispatcher: replaces the old 50/50 hunt-or-wander
 * coin flip (see git history of `./mobs.ts`) with a per-mob state machine
 * whose transitions are shaped by that monster's {@link AiTraits}
 * personality (`./ai-personalities.ts`). See `../ai_ideas.md` for the
 * design brief this implements: group flanking, ambush/blind-spot hiding,
 * feints, hit-and-run, kiting, morale, territorial guards, alerters, and
 * pack bravery/cowardice.
 *
 * Called once per awake mob's turn from {@link ./gameloop.ts}.
 */
export function npcTurn(game: Game, mob: Mob): void {
  tickMood(game, mob);
  if (mob.mood === Mood.Sleep) return; // sleeping mobs don't act.

  const ai: AiMemory = mob.ai ??= { state: AiState.Idle, home: { x: mob.x, y: mob.y }, timer: 0 };
  const traits = getTraits(mob.name);
  const los = hasLineOfSight(game.curMap(), mob, game.player) && !isInvisible(game.player);
  // Excludes `mob` itself: without that, a mob's own (always-occupied-by-
  // itself) current tile reads as blocked, and rot.js's AStar treats an
  // impassable source tile as "no path exists" — silently killing every
  // pathfinding-driven move before it starts.
  const blocked = (p: Readonly<Pos>) => {
    const occ = occupant(game, p);
    return occ !== null && occ !== mob;
  };

  if (los) ai.lastSeenPlayer = { x: game.player.x, y: game.player.y };

  maybeBreakMorale(game, mob, ai, traits, los);
  maybeNotice(game, mob, ai, traits, los);

  switch (ai.state) {
    case AiState.Idle: return actIdle(game, mob, ai, traits, blocked);
    case AiState.Ambush: return actAmbush(game, mob, ai, blocked);
    case AiState.Hunt: return actHunt(game, mob, ai, traits, los, blocked);
    case AiState.Search: return actSearch(game, mob, ai, los, blocked);
    case AiState.Feint: return actFeint(game, mob, ai, blocked);
    case AiState.HitAndRun: return actHitAndRun(game, mob, ai, blocked);
    case AiState.Flee: return actFlee(game, mob, ai, traits, blocked);
  }
}

/** The four cardinal steps a mob can wander in. */
const DIRECTIONS: ReadonlyArray<Pos> = [
  { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
];

function distSq(a: Readonly<Pos>, b: Readonly<Pos>): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Applies an AI-computed step, but refuses to walk onto — and thereby
 * bump-attack — anything other than the player. Pathfinding waypoints
 * (an ally's tile as a flee rally point, a flanking ring offset, home)
 * can legitimately coincide with another mob's current position; without
 * this guard that would read as a deliberate attack and mobs would fight
 * each other by pathfinding coincidence instead of only ever fighting the
 * player.
 */
function moveAi(mob: Mob, game: Game, delta: Readonly<Pos>): void {
  const wrap = (v: number, size: number) => ((v % size) + size) % size;
  const dest: Pos = { x: wrap(mob.x + delta.x, game.curMap().width), y: wrap(mob.y + delta.y, game.curMap().height) };
  const occ = occupant(game, dest);
  if (occ && !isPly(occ)) return;
  moveOrBump(mob, game, delta);
}

/** Radius within which another mob counts as "nearby" for pack courage, alerting, and flanking. */
const ALLY_RADIUS_SQ = 6 * 6;
/** Wider radius an alerter's cry reaches to rouse sleeping/idle allies. */
const ALERT_RADIUS_SQ = 10 * 10;
/** Beyond this straight-line distance, fall back to a naive step instead of running A* (keeps far-away mobs cheap). */
const MAX_PATH_DIST_SQ = 30 * 30;
const AMBUSH_DURATION = 15;

/**
 * How far beyond home a territorial mob will chase/search before giving up
 * and heading back: a tight ~4-tile leash at `territorial = 1`, effectively
 * unlimited range at `territorial = 0`.
 */
function leashRadiusSq(traits: Pick<AiTraits, "territorial">): number {
  const r = 4 + (1 - traits.territorial) * 40;
  return r * r;
}

/** `stepToward`, but degrades to a cheap naive step once `to` is far enough away that a full A* search isn't worth it. */
function pathStep(game: Game, from: Readonly<Pos>, to: Readonly<Pos>, blocked: (p: Readonly<Pos>) => boolean): Pos | null {
  if (from.x === to.x && from.y === to.y) return null;
  if (distSq(from, to) > MAX_PATH_DIST_SQ) {
    return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
  }
  return stepToward(game.curMap(), from, to, blocked);
}

/** Every other (non-player) mob within {@link ALLY_RADIUS_SQ} of `mob` that is currently awake. */
function nearbyAwakeAllies(game: Game, mob: Mob): Mob[] {
  return game.curMap().Q.mobs.filter(
    (m) => m !== mob && !isPly(m) && m.mood === Mood.Wake && distSq(m, mob) <= ALLY_RADIUS_SQ
  );
}

/** The nearest other (non-player) mob to `mob`, awake or not — used as a flee/rally point. */
function nearestAlly(game: Game, mob: Mob): Mob | null {
  let best: Mob | null = null;
  let bestDistSq = Infinity;
  for (const m of game.curMap().Q.mobs) {
    if (m === mob || isPly(m)) continue;
    const d = distSq(m, mob);
    if (d < bestDistSq) { bestDistSq = d; best = m; }
  }
  return best;
}

/**
 * Morale and pack-courage check, run before the state switch so it can
 * override any current state into {@link AiState.Flee}: low-HP mobs weighted
 * by `traits.morale`, and low-courage mobs caught fighting alone.
 */
function maybeBreakMorale(game: Game, mob: Mob, ai: AiMemory, traits: AiTraits, los: boolean): void {
  if (ai.state === AiState.Flee) return;
  const hpFrac = mob.hp / mob.maxhp;
  const engaged = ai.state === AiState.Hunt || ai.state === AiState.Feint || ai.state === AiState.HitAndRun || los;
  if (!engaged) return;

  const isolated = nearbyAwakeAllies(game, mob).length === 0;
  const moraleBreak = hpFrac <= 0.3 && ROT.RNG.getUniform() < traits.morale;
  const courageBreak = isolated && ROT.RNG.getUniform() < Math.max(0, 0.5 - traits.courage);
  if (moraleBreak || courageBreak) {
    ai.state = AiState.Flee;
    ai.timer = 5 + Math.round(6 * (1 - traits.courage));
  }
}

/** First-sighting transition: Idle/Ambush mobs that spot the player commit to the hunt, maybe crying out to allies. */
function maybeNotice(game: Game, mob: Mob, ai: AiMemory, traits: AiTraits, los: boolean): void {
  if (!los || (ai.state !== AiState.Idle && ai.state !== AiState.Ambush)) return;
  ai.state = AiState.Hunt;
  const roll = ROT.RNG.getUniform();
  const sounds = roll < traits.alerter;
  console.debug(`[alert] ${mob.name}@(${mob.x},${mob.y}) notices player: alerter=${traits.alerter} roll=${roll.toFixed(3)} sounds=${sounds}`);
  if (sounds) alertNearbyAllies(game, mob);
}

/** Chance a nearby mob of the alerter's own species heeds the alarm. */
const ALERT_CHANCE_SAME_KIND = 0.33;
/** Chance a nearby mob of a *different* species heeds the alarm. */
const ALERT_CHANCE_OTHER_KIND = 0.07;

/** Rouses nearby sleeping mobs and redirects nearby idle ones toward the commotion — each one indepedently, favouring its own kind. Logs a single ominous cry for the alarm itself, but stays silent per-mob in the in-game log (many could be in range) — see the console for a per-candidate trace. */
function alertNearbyAllies(game: Game, mob: Mob): void {
  game.log.msg(`${mob.name} sounds the alarm!`);
  const candidates = game.curMap().Q.mobs.filter(
    (m) => m !== mob && !isPly(m) && distSq(m, mob) <= ALERT_RADIUS_SQ
  );
  console.debug(`[alert] ${mob.name}@(${mob.x},${mob.y}) cries out: radiusSq=${ALERT_RADIUS_SQ} candidatesInRange=${candidates.length}/${game.curMap().Q.mobs.length}`);
  let woken = 0;
  for (const m of candidates) {
    const sameKind = m.name === mob.name;
    const chance = sameKind ? ALERT_CHANCE_SAME_KIND : ALERT_CHANCE_OTHER_KIND;
    const roll = ROT.RNG.getUniform();
    const heeds = roll < chance;
    const wasAsleep = m.mood === Mood.Sleep;
    console.debug(`[alert]   -> ${m.name}@(${m.x},${m.y}) dSq=${distSq(m, mob)} sameKind=${sameKind} chance=${chance} roll=${roll.toFixed(3)} heeds=${heeds} wasAsleep=${wasAsleep}`);
    if (!heeds) continue;
    if (wasAsleep) { m.mood = Mood.Wake; woken++; }
    // Idle and Ambush are the only states maybeNotice will act on (see its
    // own Idle/Ambush check above) — so a mob left in either of those after
    // being alerted would be free to roll traits.alerter itself on its very
    // next turn and cry out again. Moving it to Search closes that loophole:
    // an alarm-woken mob heads for the commotion instead of sounding its own.
    if (m.ai && (m.ai.state === AiState.Idle || m.ai.state === AiState.Ambush)) {
      m.ai.state = AiState.Search;
      m.ai.lastSeenPlayer = { x: mob.x, y: mob.y };
      m.ai.timer = 6;
    }
  }
  console.debug(`[alert] ${mob.name}@(${mob.x},${mob.y}) done: woke ${woken}/${candidates.length} nearby mobs`);
}

/** Idle wandering: territorial mobs drift back toward home once they've strayed, everyone else roams freely. Occasionally settles into an ambush instead. */
function actIdle(game: Game, mob: Mob, ai: AiMemory, traits: AiTraits, blocked: (p: Readonly<Pos>) => boolean): void {
  if (ROT.RNG.getUniform() < traits.ambusher * 0.3) {
    ai.state = AiState.Ambush;
    ai.timer = AMBUSH_DURATION;
    return;
  }

  const strayedFar = distSq(mob, ai.home) > leashRadiusSq(traits) * 0.25;
  const delta = traits.territorial > 0.5 && strayedFar
    ? pathStep(game, mob, ai.home, blocked) ?? ROT.RNG.getItem(DIRECTIONS as Pos[])!
    : ROT.RNG.getItem(DIRECTIONS as Pos[])!;
  moveAi(mob, game, delta);
}

/** The walkable neighbour (or the mob's own tile) with the most wall-adjacent cover, i.e. the best nearby blind spot. */
function bestHidingSpot(game: Game, mob: Mob): Pos | null {
  let best: Pos | null = null;
  let bestScore = -1;
  for (const d of [{ x: 0, y: 0 }, ...DIRECTIONS]) {
    const p: Pos = { x: mob.x + d.x, y: mob.y + d.y };
    if ((d.x !== 0 || d.y !== 0) && (!walkable(game.curMap().get(p)) || occupant(game, p))) continue;
    let score = 0;
    for (const n of NEIGHBOURS8) if (!walkable(game.curMap().get({ x: p.x + n.x, y: p.y + n.y }))) score++;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best && (best.x !== 0 || best.y !== 0) ? best : null;
}

/** Ambush: relocate once to a nearby blind spot, then hold perfectly still until {@link maybeNotice} spots the player or patience runs out. */
function actAmbush(game: Game, mob: Mob, ai: AiMemory, blocked: (p: Readonly<Pos>) => boolean): void {
  if (ai.timer === AMBUSH_DURATION) {
    const step = bestHidingSpot(game, mob);
    if (step) moveAi(mob, game, step);
  }
  if (--ai.timer <= 0) ai.state = AiState.Idle;
}

/** The ring of tiles immediately surrounding a target, used to spread a hunting pack around it instead of everyone funnelling onto the same tile. */
const RING_OFFSETS: ReadonlyArray<Pos> = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

/** When other hunters share this target, gives `mob` a deterministic ring slot around it so the group flanks from multiple sides instead of single-filing in. */
function flankingTarget(game: Game, mob: Mob, target: Readonly<Pos>): Pos {
  const pack = game.curMap().Q.mobs.filter(
    (m) => !isPly(m) && m.ai?.state === AiState.Hunt && distSq(m, target) <= ALLY_RADIUS_SQ
  );
  if (pack.length <= 1) return target;

  pack.sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const idx = pack.indexOf(mob);
  // mob can be filtered out of its own pack (e.g. still far from target
  // right after noticing the player), leaving indexOf at -1 — fall back to
  // the unflanked target rather than indexing RING_OFFSETS with -1.
  if (idx === -1) return target;
  const offset = RING_OFFSETS[idx % RING_OFFSETS.length];
  const dest: Pos = { x: target.x + offset.x, y: target.y + offset.y };
  return walkable(game.curMap().get(dest)) ? dest : target;
}

/** Hunt: pathfind toward the last-seen player position (flanking when packmates share the target), attacking on contact and giving up beyond a territorial mob's leash. */
function actHunt(game: Game, mob: Mob, ai: AiMemory, traits: AiTraits, los: boolean, blocked: (p: Readonly<Pos>) => boolean): void {
  const target = ai.lastSeenPlayer;
  if (!target) { ai.state = AiState.Idle; return; }

  if (distSq(mob, ai.home) > leashRadiusSq(traits) && distSq(mob, game.player) > 4) {
    // Give up the chase and head home — actually retreat a step now rather
    // than just relabelling the state, otherwise a mob whose leash sits
    // within sight of the player would flip Hunt/Idle every turn without
    // ever moving (maybeNotice re-triggers Hunt next turn as long as `los`
    // holds, before actIdle's wander ever gets a turn to run).
    ai.state = AiState.Idle;
    ai.lastSeenPlayer = undefined;
    const step = pathStep(game, mob, ai.home, blocked);
    if (step) moveAi(mob, game, step);
    return;
  }

  const adjacent = distSq(mob, game.player) <= 2;
  const hpBefore = game.player.hp;

  if (adjacent) {
    moveAi(mob, game, { x: Math.sign(game.player.x - mob.x), y: Math.sign(game.player.y - mob.y) });
  } else if (traits.kiter > 0 && distSq(mob, game.player) <= 4 && ROT.RNG.getUniform() < traits.kiter) {
    // Kiters sidestep instead of closing the last stretch, staying just out of reach.
    const side = RING_OFFSETS[(RING_OFFSETS.findIndex((o) => o.x === Math.sign(mob.x - game.player.x) && o.y === Math.sign(mob.y - game.player.y)) + 2) % RING_OFFSETS.length];
    const step = pathStep(game, mob, { x: mob.x + side.x, y: mob.y + side.y }, blocked);
    if (step) moveAi(mob, game, step);
  } else {
    const dest = flankingTarget(game, mob, target);
    const step = pathStep(game, mob, dest, blocked);
    if (step) moveAi(mob, game, step);
    else if (!los) { ai.state = AiState.Search; ai.timer = 5; return; }
  }

  if (game.player.hp < hpBefore) {
    if (ROT.RNG.getUniform() < traits.hitAndRun) { ai.state = AiState.HitAndRun; ai.timer = 4; return; }
    if (ROT.RNG.getUniform() < traits.feinter) { ai.state = AiState.Feint; ai.timer = 2; return; }
  }
}

/** Search: lost sight of the player, so mill around their last known position for a few turns before giving up. */
function actSearch(game: Game, mob: Mob, ai: AiMemory, los: boolean, blocked: (p: Readonly<Pos>) => boolean): void {
  if (los) { ai.state = AiState.Hunt; return; }

  const target = ai.lastSeenPlayer ?? mob;
  const step = pathStep(game, mob, target, blocked) ?? ROT.RNG.getItem(DIRECTIONS as Pos[])!;
  moveAi(mob, game, step);

  if (--ai.timer <= 0) {
    ai.state = AiState.Idle;
    ai.lastSeenPlayer = undefined;
  }
}

/** Feint: after landing a hit, fake a short retreat before charging back in. */
function actFeint(game: Game, mob: Mob, ai: AiMemory, blocked: (p: Readonly<Pos>) => boolean): void {
  const step = stepAway(game.curMap(), mob, game.player, blocked);
  if (step) moveAi(mob, game, step);

  if (--ai.timer <= 0) {
    ai.state = AiState.Hunt;
    ai.lastSeenPlayer = { x: game.player.x, y: game.player.y };
  }
}

/** Hit-and-run: after landing a hit, retreat all the way toward home before daring to re-approach. */
function actHitAndRun(game: Game, mob: Mob, ai: AiMemory, blocked: (p: Readonly<Pos>) => boolean): void {
  const step = pathStep(game, mob, ai.home, blocked) ?? stepAway(game.curMap(), mob, game.player, blocked);
  if (step) moveAi(mob, game, step);
  if (--ai.timer <= 0) ai.state = AiState.Hunt;
}

/** Flee: run from a fight it wants no part of, heading for the nearest ally/home rather than straight away — baiting a pursuer toward help. */
function actFlee(game: Game, mob: Mob, ai: AiMemory, traits: AiTraits, blocked: (p: Readonly<Pos>) => boolean): void {
  const rally = nearestAlly(game, mob) ?? ai.home;
  const step = pathStep(game, mob, rally, blocked) ?? stepAway(game.curMap(), mob, game.player, blocked);
  if (step) moveAi(mob, game, step);

  if (--ai.timer <= 0) {
    ai.state = ai.lastSeenPlayer && traits.aggression > 0.5 ? AiState.Hunt : AiState.Idle;
  }
}
