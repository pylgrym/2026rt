import * as ROT from "rot-js";
import { DMap, Mob, Pos, Tile, generateDungeon, walkable, MAP_WIDTH, MAP_HEIGHT } from "./dmap";
import { addMobNests, spiralPositions } from "./mob-factory";
import { addObjects } from "./objs";
import { createDistanceShader, type DistanceShader } from "./shader";

/**
 * The dungeon level at which the full, original (level-15-and-up) map
 * extent is reached. See ../dungeon-levels-stairs-design.md.
 */
export const FULL_EXTENT_LEVEL = 15;
/** The smallest early-level map extent (level 1). */
const MIN_WIDTH = 25;
const MIN_HEIGHT = 25;

/** The width/height a freshly-generated level should have, per the design doc's level-1..15 scaling. */
function extentForLevel(level: number): { width: number; height: number } {
  const t = Math.max(0, Math.min(1, (level - 1) / (FULL_EXTENT_LEVEL - 1)));
  return {
    width: Math.round(MIN_WIDTH + (MAP_WIDTH - MIN_WIDTH) * t),
    height: Math.round(MIN_HEIGHT + (MAP_HEIGHT - MIN_HEIGHT) * t),
  };
}

/** Spirals outward from `target` for the nearest walkable tile, skipping any position in `exclude`. */
function nearestWalkable(map: DMap, target: Readonly<Pos>, exclude: readonly Readonly<Pos>[] = []): Pos {
  const maxRadius = Math.max(map.width, map.height);
  for (const pos of spiralPositions(target.x, target.y, maxRadius)) {
    if (!map.inBounds(pos)) continue;
    if (!walkable(map.get(pos))) continue;
    if (exclude.some((e) => e.x === pos.x && e.y === pos.y)) continue;
    return pos;
  }
  return { x: target.x, y: target.y };
}

/** A floor tile from the outer edge of the map's actual floor plan — where the down-stair belongs. */
function pickPeripheralFloor(map: DMap, center: Readonly<Pos>, exclude: readonly Readonly<Pos>[]): Pos {
  const candidates: { pos: Pos; r: number }[] = [];
  const at: Pos = { x: 0, y: 0 };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      at.x = x;
      at.y = y;
      if (!walkable(map.get(at))) continue;
      if (exclude.some((e) => e.x === x && e.y === y)) continue;
      candidates.push({ pos: { x, y }, r: Math.hypot(x - center.x, y - center.y) });
    }
  }
  if (candidates.length === 0) return { x: center.x, y: center.y };
  candidates.sort((a, b) => b.r - a.r); // farthest-from-centre first.
  const peripheralCount = Math.max(1, Math.floor(candidates.length * 0.05));
  return candidates[ROT.RNG.getUniformInt(0, peripheralCount - 1)].pos;
}

/** Carves `<` near the map's centre and `>` near its periphery; see ../dungeon-levels-stairs-design.md. */
function placeStairs(map: DMap): { stairUp: Pos; stairDown: Pos } {
  const center: Pos = { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  const stairUp = nearestWalkable(map, center);
  const stairDown = pickPeripheralFloor(map, center, [stairUp]);
  map.set(stairUp, Tile.StairUp);
  map.set(stairDown, Tile.StairDown);
  return { stairUp, stairDown };
}

/** Per-level state: the generated map plus the render/travel data that goes with it. */
interface Level {
  readonly map: DMap;
  readonly wallShader: DistanceShader;
  readonly stairUp: Pos;
  readonly stairDown: Pos;
  /** Rounds spent on this level so far. Starts at 0 when the level is first built (see {@link Dungeon.tickCurLevelTurns}). */
  turnsSpent: number;
}

function buildLevel(level: number): Level {
  const { width, height } = extentForLevel(level);
  const map = new DMap(width, height);
  generateDungeon(map);
  const { stairUp, stairDown } = placeStairs(map);
  addMobNests(map, 5); // 5 of each monster level this map's extent reaches.
  map.objs = addObjects(map);
  const wallShader = createDistanceShader(width, height);
  return { map, wallShader, stairUp, stairDown, turnsSpent: 0 };
}

/**
 * The dungeon: a collection of {@link DMap} levels, indexed by level number
 * (starting at 1), each built and cached on first visit. See
 * ../dungeon-levels-stairs-design.md.
 */
export class Dungeon {
  /** The level the player is currently on. */
  curLevel = 1;

  private readonly levels = new Map<number, Level>();

  private ensureLevel(level: number): Level {
    let lvl = this.levels.get(level);
    if (!lvl) {
      lvl = buildLevel(level);
      this.levels.set(level, lvl);
    }
    return lvl;
  }

  /** The {@link DMap} for {@link curLevel}, generating it on first visit. */
  curMap(): DMap {
    return this.ensureLevel(this.curLevel).map;
  }

  /** The wall-colouring shader for {@link curLevel}'s map. */
  curShader(): DistanceShader {
    return this.ensureLevel(this.curLevel).wallShader;
  }

  /**
   * Rounds spent on {@link curLevel} so far. Persists across leaving and
   * returning to an already-visited level; only starts back at 0 the first
   * time a level is built (see {@link tickCurLevelTurns}). Tracked to
   * eventually inform the hunger clock's design — see the HUD's "TN" stat.
   */
  curLevelTurns(): number {
    return this.ensureLevel(this.curLevel).turnsSpent;
  }

  /** Advances {@link curLevelTurns} by one round. Call once per round, after the player and every mob has acted. */
  tickCurLevelTurns(): void {
    this.ensureLevel(this.curLevel).turnsSpent += 1;
  }

  /** False on level 1 — there's nowhere to climb up to. */
  canGoUp(): boolean {
    return this.curLevel > 1;
  }

  /** True on level 15, the deepest dungeon level — descending further wins the game instead of generating a level 16. */
  isDeepestLevel(): boolean {
    return this.curLevel >= FULL_EXTENT_LEVEL;
  }

  /** Where the player first appears: near level 1's centre, avoiding its stairs. */
  initialSpawn(): Pos {
    const lvl = this.ensureLevel(1);
    const center: Pos = { x: Math.floor(lvl.map.width / 2), y: Math.floor(lvl.map.height / 2) };
    return nearestWalkable(lvl.map, center, [lvl.stairUp, lvl.stairDown]);
  }

  /**
   * Moves `player` to the level above/below {@link curLevel}, landing on
   * the matching stair tile there (going down lands on the new level's
   * up-stair, going up lands on the new level's down-stair), and keeps
   * `MobQ` membership in sync — the player must always be present in the
   * `MobQ` of whichever map they're currently on.
   */
  travel(player: Mob, direction: "up" | "down"): void {
    const from = this.ensureLevel(this.curLevel);
    from.map.Q.remove(player);

    this.curLevel += direction === "down" ? 1 : -1;
    const to = this.ensureLevel(this.curLevel);
    const landing = direction === "down" ? to.stairUp : to.stairDown;
    player.x = landing.x;
    player.y = landing.y;

    to.map.Q.unshift(player); // must be Q.front() for the next round's turn-order invariant.
  }
}
