import type { Pos, Mob, T_Tile } from "../dmap";
import { walkable } from "../dmap";
import type { Game } from "../game";
import type { Viewport } from "../viewport";
import { dealSpellDamage } from "../combat";
import { addStatus, isHazardImmune, type T_StatusKind } from "./status-effects";
import { drawAt, mobsInRadius } from "./spell-targeting";

/**
 * Persistent, ground-anchored spell effects that outlive the turn they were
 * cast on: damage zones (Poison Cloud, Flame Wall), traps (Web, Spike),
 * pulls (Gravity Well, Black Hole), telegraphed detonations (Meteor
 * Strike), and reversible terrain (Ice Platform). One flat list on
 * {@link Game} (`game.fieldEffects`), ticked once per round from
 * ./gameloop.ts — see {@link tickFieldEffects}.
 */
export interface FieldEffect {
  pos: Pos;
  radius: number;
  turnsLeft: number;
  glyph: string;
  color: string;
  caster: Mob;
  /** Damage dealt to every mob in radius each tick; 0 for non-damaging effects. */
  dmgPerTurn: number;
  /** Log verb for damage ticks, e.g. "burned", "poisoned". */
  verb: string;
  /** A status applied to every mob in radius each tick (e.g. web -> Root). */
  statusOnTick?: { kind: T_StatusKind; turns: number; magnitude: number };
  /** Pull strength in tiles/turn toward `pos`, for gravity-well-style effects. */
  pull?: number;
  /** Only affects mobs, never damages/pulls until this many ticks have passed (telegraphed detonations). */
  armAfter?: number;
  /** Called once, when the effect expires (e.g. revert an ice tile). */
  onExpire?: (game: Game) => void;
}

export function spawnFieldEffect(game: Game, effect: FieldEffect): void {
  game.fieldEffects.push(effect);
}

function distSq(a: Readonly<Pos>, b: Readonly<Pos>): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Advances every field effect by one round: damage, statuses, pulls, then expiry. Call once per round. */
export function tickFieldEffects(game: Game): void {
  const remaining: FieldEffect[] = [];
  for (const fx of game.fieldEffects) {
    const armed = (fx.armAfter ?? 0) <= 0;
    if (armed) {
      const hit = mobsInRadius(game, fx.pos, fx.radius).filter((m) => !isHazardImmune(m));
      for (const mob of hit) {
        if (fx.dmgPerTurn > 0) dealSpellDamage(game, fx.caster, mob, fx.dmgPerTurn, fx.verb);
        if (fx.statusOnTick) addStatus(mob, fx.statusOnTick.kind, fx.statusOnTick.turns, fx.statusOnTick.magnitude);
        if (fx.pull) pullToward(game, mob, fx.pos, fx.pull);
      }
    } else {
      fx.armAfter = (fx.armAfter ?? 0) - 1;
    }

    fx.turnsLeft -= 1;
    if (fx.turnsLeft <= 0) {
      fx.onExpire?.(game);
    } else {
      remaining.push(fx);
    }
  }
  game.fieldEffects = remaining;
}

/** Steps `mob` one tile toward `center`, ignoring walls/occupants (a supernatural pull) but never landing exactly on `center`. */
function pullToward(game: Game, mob: Mob, center: Readonly<Pos>, strength: number): void {
  if (distSq(mob, center) <= strength * strength) return;
  const dx = Math.sign(center.x - mob.x);
  const dy = Math.sign(center.y - mob.y);
  const dest: Pos = { x: mob.x + dx, y: mob.y + dy };
  if (!game.map.inBounds(dest) || !walkable(game.map.get(dest))) return;
  if (game.map.Q.mobs.some((m) => m !== mob && m.x === dest.x && m.y === dest.y)) return;
  mob.x = dest.x;
  mob.y = dest.y;
}

/** Temporarily overrides the tile at `pos` (e.g. Ice Platform bridging a wall), reverting when the effect expires. */
export function layTemporaryTile(game: Game, pos: Readonly<Pos>, tile: T_Tile, turns: number): void {
  const original = game.map.get(pos);
  game.map.set(pos, tile);
  spawnFieldEffect(game, {
    pos: { x: pos.x, y: pos.y },
    radius: 0,
    turnsLeft: turns,
    glyph: "",
    color: "",
    caster: game.player,
    dmgPerTurn: 0,
    verb: "",
    onExpire: (g) => g.map.set(pos, original),
  });
}

/** Draws every field effect's glyph over the tiles it currently covers. Wired from Viewport.draw. */
export function drawFieldEffects(viewport: Viewport, game: Game): void {
  for (const fx of game.fieldEffects) {
    if (!fx.glyph) continue;
    for (let dy = -fx.radius; dy <= fx.radius; dy++) {
      for (let dx = -fx.radius; dx <= fx.radius; dx++) {
        if (dx * dx + dy * dy > fx.radius * fx.radius) continue;
        drawAt(viewport, game, { x: fx.pos.x + dx, y: fx.pos.y + dy }, fx.glyph, fx.color);
      }
    }
  }
}
