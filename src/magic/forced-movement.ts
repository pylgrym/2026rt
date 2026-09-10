import { walkable, type Mob, type Pos } from "../dmap";
import type { Game } from "../game";
import { occupant } from "../mobs";
import { dealSpellDamage } from "../combat";

/**
 * Positional-coercion mechanics that don't fit ./status-effects.ts's
 * damage/duration model, for ../spells-new.md's Mimic Curse (a mob repeats
 * the player's last movement input every round) and Anchor Chain (two mobs
 * tethered together, punished for drifting apart). Both ticked once per
 * round from ./gameloop.ts.
 */

let lastPlayerMove: Readonly<Pos> | null = null;

/** Records the player's last successful movement delta; called from ./move-player.ts. */
export function recordPlayerMove(delta: Readonly<Pos>): void {
  lastPlayerMove = delta;
}

interface MimicEntry { mob: Mob; turnsLeft: number; }
const mimicked: MimicEntry[] = [];

export function addMimicCurse(mob: Mob, turns: number): void {
  mimicked.push({ mob, turnsLeft: turns });
}

/** Steps every mimic-cursed mob by the player's last movement delta, if the destination is free. */
export function tickMimicCurse(game: Game): void {
  for (let i = mimicked.length - 1; i >= 0; i--) {
    const entry = mimicked[i];
    if (lastPlayerMove) {
      const dest: Pos = { x: entry.mob.x + lastPlayerMove.x, y: entry.mob.y + lastPlayerMove.y };
      if (game.curMap().inBounds(dest) && walkable(game.curMap().get(dest)) && !occupant(game, dest)) {
        entry.mob.x = dest.x;
        entry.mob.y = dest.y;
      }
    }
    if (--entry.turnsLeft <= 0) mimicked.splice(i, 1);
  }
}

interface Anchor { a: Mob; b: Mob; turnsLeft: number; maxDist: number; }
const anchors: Anchor[] = [];

export function spawnAnchor(a: Mob, b: Mob, turns: number, maxDist = 5): void {
  anchors.push({ a, b, turnsLeft: turns, maxDist });
}

/** Punishes any tethered pair that's drifted beyond its max distance, then ages every tether down. */
export function tickAnchors(game: Game): void {
  for (let i = anchors.length - 1; i >= 0; i--) {
    const link = anchors[i];
    const dx = link.a.x - link.b.x, dy = link.a.y - link.b.y;
    if (dx * dx + dy * dy > link.maxDist * link.maxDist) {
      dealSpellDamage(game, game.player, link.a, 4, "wrenched by the chain");
      dealSpellDamage(game, game.player, link.b, 4, "wrenched by the chain");
    }
    if (--link.turnsLeft <= 0) anchors.splice(i, 1);
  }
}
