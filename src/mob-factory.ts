import * as ROT from "rot-js";
import { DMap, Tile, T_Tile, Mob, walkable, generateDungeon, type Pos } from "./dmap";
import { Mood } from "./mood";
import { AiState } from "./ai-types";

/**
 * The level 1-26 monster roster, one entry per letter of the alphabet.
 * Level 1 (`ant`) is the original single monster this game had (it used
 * to be called `rat` — that name now belongs to level 21 instead). See
 * ../progression.md for the design behind the level system.
 */
export interface MobType {
  readonly tile: T_Tile;
  readonly name: string;
  readonly glyph: string;
}

export const MOB_TYPES: readonly MobType[] = [
  { tile: Tile.Ant, name: "ant", glyph: "a" },
  { tile: Tile.Bat, name: "bat", glyph: "b" },
  { tile: Tile.Cat, name: "cat", glyph: "c" },
  { tile: Tile.Dog, name: "dog", glyph: "d" },
  { tile: Tile.Eye, name: "eye", glyph: "e" },
  { tile: Tile.Fox, name: "fox", glyph: "f" },
  { tile: Tile.Git, name: "git", glyph: "g" },
  { tile: Tile.Hog, name: "hog", glyph: "h" },
  { tile: Tile.Imp, name: "imp", glyph: "i" },
  { tile: Tile.Jay, name: "jay", glyph: "j" },
  { tile: Tile.Koi, name: "koi", glyph: "k" },
  { tile: Tile.Loon, name: "loon", glyph: "l" },
  { tile: Tile.Moth, name: "moth", glyph: "m" },
  { tile: Tile.Newt, name: "newt", glyph: "n" },
  { tile: Tile.Orc, name: "orc", glyph: "o" },
  { tile: Tile.Pig, name: "pig", glyph: "p" },
  { tile: Tile.Quail, name: "quail", glyph: "q" },
  { tile: Tile.Rat, name: "rat", glyph: "r" },
  { tile: Tile.Sow, name: "sow", glyph: "s" },
  { tile: Tile.Toad, name: "toad", glyph: "t" },
  { tile: Tile.Urchin, name: "urchin", glyph: "u" },
  { tile: Tile.Vole, name: "vole", glyph: "v" },
  { tile: Tile.Wasp, name: "wasp", glyph: "w" },
  { tile: Tile.Xerus, name: "xerus", glyph: "x" },
  { tile: Tile.Yak, name: "yak", glyph: "y" },
  { tile: Tile.Zebu, name: "zebu", glyph: "z" },
] as const;

export const MAX_LEVEL = MOB_TYPES.length;

/** Fast `tile -> level` reverse lookup, built once from {@link MOB_TYPES}. */
const LEVEL_BY_TILE = new Map<T_Tile, number>(MOB_TYPES.map((m, i) => [m.tile, i + 1]));

/** The monster level (1-26) a tile represents, or 1 if it isn't a monster tile. */
export function levelOfTile(tile: T_Tile): number {
  return LEVEL_BY_TILE.get(tile) ?? 1;
}

/** The base (level-1) stats every higher level doubles from. */
export const BASE_HP = 8;
const BASE_DMG = 2;

/** Creates a monster of the given `level` (1-26) at `pos`, asleep. */
export function makeMob(level: number, pos: Readonly<Pos>): Mob {
  const idx = Math.min(MAX_LEVEL, Math.max(1, level)) - 1;
  const { tile, name } = MOB_TYPES[idx];
  const scale = 2 ** idx; // each level doubles hp and damage over the last.
  const hp = BASE_HP * scale;
  const ai = { state: AiState.Idle, home: { x: pos.x, y: pos.y }, timer: 0 };
  return { x: pos.x, y: pos.y, t: tile, name, hp, maxhp: hp, dmg: BASE_DMG * scale, mood: Mood.Sleep, ai };
}

/** The exact centre tile of `map`. */
function mapCenter(map: DMap): Pos {
  return { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
}

/**
 * The original spawn picker: drops the player at the centre of the first
 * room rot.js generated. Kept alongside {@link pickSpawnCenter} for
 * reference now that the player spawns at the map's centre instead.
 */
export function pickSpawnFirstRoom(rooms: ReturnType<typeof generateDungeon>): Pos {
  const [cx, cy] = rooms[0].getCenter();
  return { x: cx, y: cy };
}

/**
 * Enumerates positions in a square spiral around `(cx, cy)`, starting at
 * the centre itself and walking outward ring by ring (top edge, bottom
 * edge, then the left/right edges of each ring) up to `maxRadius` tiles
 * out. Used to find the closest vacant tile to a target point.
 */
function* spiralPositions(cx: number, cy: number, maxRadius: number): Generator<Pos> {
  yield { x: cx, y: cy };
  for (let r = 1; r <= maxRadius; r++) {
    for (let x = cx - r; x <= cx + r; x++) {
      yield { x, y: cy - r };
      yield { x, y: cy + r };
    }
    for (let y = cy - r + 1; y <= cy + r - 1; y++) {
      yield { x: cx - r, y };
      yield { x: cx + r, y };
    }
  }
}

/**
 * Picks the player's spawn point by spiralling outward from the exact
 * centre of the map and stopping at the first walkable tile found. Falls
 * back to the centre itself if, somehow, nothing walkable was found.
 */
export function pickSpawnCenter(map: DMap): Pos {
  const center = mapCenter(map);
  const maxRadius = Math.max(map.width, map.height);
  for (const pos of spiralPositions(center.x, center.y, maxRadius)) {
    if (!map.inBounds(pos)) continue;
    if (walkable(map.get(pos))) return pos;
  }
  return center;
}

/**
 * Scatters mob nests across the map by turning vacant floor tiles into
 * {@link Tile.Nest}s, and spawns exactly `perLevelCount` monsters of
 * *every* level 1-26 (so `perLevelCount * MAX_LEVEL` monsters in total,
 * as long as the dungeon has that many floor tiles to spare).
 *
 * Every candidate floor tile is ranked by its distance from the map's
 * centre, then that ranked list is sliced into `MAX_LEVEL` equal-sized
 * chunks: the nearest chunk (where the player spawns) becomes the level-1
 * pool, the farthest chunk the level-26 pool, and so on in between. Levels
 * then draw `perLevelCount` random nests from their own chunk.
 *
 * A fixed geometric radius cutoff (e.g. "level 26 = beyond 90% of the
 * theoretical corner-to-corner distance") was tried first and rejected: a
 * rot.js dungeon is mostly wall, its rooms land wherever the generator
 * happens to put them, and nothing guarantees any floor exists that close
 * to the actual corners — that approach could leave the highest levels
 * with zero candidates. Ranking by distance and slicing into equal chunks
 * instead adapts to whatever floor the generated dungeon actually has, so
 * every level's chunk is guaranteed a fair (roughly 1/26th) share of it,
 * however that floor happens to be laid out. See ../progression.md.
 */
export function addMobNests(
  map: DMap,
  perLevelCount: number
): void {
  const center = mapCenter(map);

  // Gather every walkable, unoccupied floor tile as a nest candidate,
  // paired with its distance from the centre. The player already picked
  // their spot (see Game's constructor, which places the player before
  // calling this) and occupies map.Q, so exclude any tile already taken by
  // them — or by any other mob — from consideration.
  const candidates: { pos: Pos; r: number }[] = [];
  const at: Pos = { x: 0, y: 0 };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      at.x = x;
      at.y = y;
      if (map.get(at) !== Tile.Floor || map.Q.find((mob) => mob.x === x && mob.y === y)) continue;
      candidates.push({ pos: { x, y }, r: Math.hypot(x - center.x, y - center.y) });
    }
  }
  candidates.sort((a, b) => a.r - b.r);

  const n = candidates.length;
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const lo = Math.floor(((level - 1) * n) / MAX_LEVEL);
    const hi = Math.floor((level * n) / MAX_LEVEL);
    // ROT.RNG.shuffle returns a NEW shuffled array; it does not mutate its
    // argument.
    const chunk = ROT.RNG.shuffle(candidates.slice(lo, hi).map((c) => c.pos));
    for (const nest of chunk.slice(0, perLevelCount)) {
      map.set(nest, Tile.Nest);
      map.Q.push(makeMob(level, nest));
    }
  }
}
