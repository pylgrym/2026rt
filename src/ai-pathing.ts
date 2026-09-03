import * as ROT from "rot-js";
import { DMap, walkable, type Pos } from "./dmap";

/** The four cardinal and four diagonal unit steps. */
export const NEIGHBOURS8: ReadonlyArray<Pos> = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];

/**
 * The delta for the first step of the shortest walkable path from `from`
 * to `to` (8-directional), or `null` if `from` already equals `to`, or if
 * no path exists.
 *
 * `blocked`, when given, marks additional tiles as impassable (typically
 * "occupied by another mob") without treating `to` itself as blocked, so a
 * hunter can still path onto — and then bump-attack — an occupied target
 * tile.
 */
export function stepToward(
  map: DMap,
  from: Readonly<Pos>,
  to: Readonly<Pos>,
  blocked?: (p: Readonly<Pos>) => boolean
): Pos | null {
  if (from.x === to.x && from.y === to.y) return null;

  const passable = (x: number, y: number): boolean => {
    if (x === to.x && y === to.y) return true;
    if (!walkable(map.get({ x, y }))) return false;
    return !blocked?.({ x, y });
  };

  const astar = new ROT.Path.AStar(to.x, to.y, passable, { topology: 8 });
  let firstStep: Pos | null = null;
  let i = 0;
  astar.compute(from.x, from.y, (x: number, y: number) => {
    if (i === 1) firstStep = { x: x - from.x, y: y - from.y };
    i++;
  });
  return firstStep;
}

/**
 * The delta for a single step from `from` that moves it as far away from
 * `away` as possible, preferring walkable, unblocked tiles. Falls back to
 * whatever legal step increases distance the most, and to `null` if `from`
 * is completely boxed in.
 */
export function stepAway(
  map: DMap,
  from: Readonly<Pos>,
  away: Readonly<Pos>,
  blocked?: (p: Readonly<Pos>) => boolean
): Pos | null {
  let best: Pos | null = null;
  let bestDistSq = -Infinity;
  for (const d of NEIGHBOURS8) {
    const p: Pos = { x: from.x + d.x, y: from.y + d.y };
    if (!walkable(map.get(p)) || blocked?.(p)) continue;
    const distSq = (p.x - away.x) ** 2 + (p.y - away.y) ** 2;
    if (distSq > bestDistSq) { bestDistSq = distSq; best = d; }
  }
  return best;
}
