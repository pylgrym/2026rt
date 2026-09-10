import { Tile, walkable, type Mob, type Pos } from "../dmap";
import type { Game } from "../game";
import { occupant } from "../mobs";
import { bump } from "../combat";
import { isIncapacitated, rollSlowSkip } from "./status-effects";

/**
 * Player-controlled minions (Summon Skeleton/Golem, Summon Swarm, Elemental
 * Familiar, Necrotic Reanimation, Army of the Dead — see ../spells.md's
 * Summoning section). Summons are ordinary {@link Mob}s dropped into
 * `game.curMap().Q` like any monster, but flagged in this module's `WeakSet` so
 * the turn loop (./gameloop.ts) routes their turn through {@link allyTurn}
 * here instead of the hostile AI in ./sneaky-ai.ts, and so the player can
 * walk through/swap with them instead of attacking them (./move-player.ts).
 *
 * Ally AI is intentionally simple: chase and melee the nearest non-ally
 * mob in sight; otherwise stick close to the player.
 */
const allies = new WeakSet<Mob>();
/** How many rounds a summon has left to live, keyed the same way. */
const lifespans = new WeakMap<Mob, number>();

export function isAlly(mob: Mob): boolean {
  return allies.has(mob);
}

function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}

/** Spawns a summon of `dmg`/`hp` at the nearest free tile to the player, alive for `lifespanTurns` rounds (Infinity for permanent). */
export function summonAlly(game: Game, name: string, glyph: T_TileLike, hp: number, dmg: number, lifespanTurns: number): Mob | null {
  const pos = nearestFreeTile(game, game.player);
  if (!pos) return null;
  const mob: Mob = { x: pos.x, y: pos.y, t: glyph, name, hp, maxhp: hp, dmg };
  allies.add(mob);
  lifespans.set(mob, lifespanTurns);
  game.curMap().Q.push(mob);
  return mob;
}

/** The tile type used to render a summon; summons reuse existing monster tiles for their glyph/colour. */
export type T_TileLike = Mob["t"];

function distSq(a: Readonly<Pos>, b: Readonly<Pos>): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function nearestFreeTile(game: Game, near: Readonly<Pos>): Pos | null {
  const offsets: Pos[] = [
    { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
    { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
  ];
  for (const o of offsets) {
    const p: Pos = { x: near.x + o.x, y: near.y + o.y };
    if (game.curMap().inBounds(p) && walkable(game.curMap().get(p)) && !occupant(game, p)) return p;
  }
  return null;
}

const SUMMON_SIGHT_SQ = 10 * 10;

/** Nearest non-ally, non-summon-controlled mob to `from` (i.e. a hostile target). */
function nearestHostile(game: Game, from: Readonly<Pos>): Mob | null {
  let best: Mob | null = null;
  let bestD = Infinity;
  for (const m of game.curMap().Q.mobs) {
    if (isAlly(m) || m.t === Tile.Ply) continue;
    const d = distSq(m, from);
    if (d <= SUMMON_SIGHT_SQ && d < bestD) { bestD = d; best = m; }
  }
  return best;
}

/** One ally's turn: melee the nearest hostile if adjacent, chase it if seen, else stay near the player. Runs from ./gameloop.ts instead of npcTurn for any mob {@link isAlly}. */
export function allyTurn(game: Game, mob: Mob): void {
  if (isIncapacitated(mob) || rollSlowSkip(mob)) return;

  const target = nearestHostile(game, mob) ?? (distSq(mob, game.player) > 4 ? game.player : null);
  if (!target || (target === game.player)) {
    if (target === game.player) stepToward(game, mob, game.player);
    return;
  }

  if (distSq(mob, target) <= 2) {
    bump(mob, target, game);
  } else {
    stepToward(game, mob, target);
  }
}

function stepToward(game: Game, mob: Mob, target: Readonly<Pos>): void {
  const dx = Math.sign(target.x - mob.x);
  const dy = Math.sign(target.y - mob.y);
  const dest: Pos = { x: wrap(mob.x + dx, game.curMap().width), y: wrap(mob.y + dy, game.curMap().height) };
  if (!walkable(game.curMap().get(dest))) return;
  if (occupant(game, dest)) return; // never step onto an occupied tile — including the player's.
  mob.x = dest.x;
  mob.y = dest.y;
}

/**
 * Decrements every summon's remaining lifespan, removing (silently, no xp/
 * loot) any whose time has run out. Call once per round, alongside
 * ./status-effects.ts's tickStatuses.
 */
export function tickSummonLifespans(game: Game): void {
  for (const mob of [...game.curMap().Q.mobs]) {
    if (!isAlly(mob)) continue;
    const left = lifespans.get(mob);
    if (left === undefined || !isFinite(left)) continue;
    const next = left - 1;
    if (next <= 0) {
      game.curMap().Q.remove(mob);
      game.log.msg(`your ${mob.name} fades away`);
    } else {
      lifespans.set(mob, next);
    }
  }
}
