import * as ROT from "rot-js";
import { DMap, Tile, T_Tile, Mob, walkable, generateDungeon, MAP_WIDTH, MAP_HEIGHT, type Pos } from "./dmap";
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
export function* spiralPositions(cx: number, cy: number, maxRadius: number): Generator<Pos> {
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
 * The centre-to-corner radius of the *full* (level-15) dungeon extent —
 * the fixed yardstick every level's monster-level radius bands are measured
 * against, not each map's own (possibly much smaller) size. See
 * ../dungeon-levels-stairs-design.md: a small early-level map must only
 * ever reach the low monster levels, because its own centre-to-edge radius
 * covers just the innermost slice of this fixed scale.
 */
const FULL_MAX_RADIUS = Math.hypot(MAP_WIDTH / 2, MAP_HEIGHT / 2);

/**
 * The radius scale is divided into {@link MAX_LEVEL} monster rings *plus one
 * extra, innermost ring that never gets any monsters at all* — a mob-free
 * safe zone around the centre (where the player spawns). So level 1 (ant)
 * occupies the *second* ring from the centre, not the first; level 26 still
 * ends exactly at {@link FULL_MAX_RADIUS}, same as before this ring got
 * inserted.
 */
const RING_COUNT = MAX_LEVEL + 1;

/**
 * How many distinct monster levels (0-26) a map whose centre-to-edge reaches
 * `r`, measured against the fixed {@link FULL_MAX_RADIUS} yardstick, should
 * ever spawn. A small early-level map's own extent covers just the innermost
 * slice of that fixed scale, so it reaches only a handful of levels (or, if
 * its extent doesn't even clear the empty first ring, none at all) — the "a
 * small dungeon might only get the a and b monsters" behaviour the design
 * calls for. This is purely a *pacing* decision (which levels exist on this
 * map at all); {@link addMobNests} handles *how tiles are divided* among
 * those levels separately, so the two concerns can't be tangled together the
 * way they previously were.
 */
function reachableLevelCount(r: number): number {
  const ringsReached = Math.ceil((r / FULL_MAX_RADIUS) * RING_COUNT);
  return Math.min(MAX_LEVEL, Math.max(0, ringsReached - 1)); // -1: the innermost ring is never a monster level.
}

/**
 * Scatters mob nests across the map by turning vacant floor tiles into
 * {@link Tile.Nest}s, and spawns up to `perLevelCount` monsters of each
 * level 1-26 that this map's extent actually reaches, leaving the innermost
 * ring around the centre — see {@link RING_COUNT} — free of monsters.
 *
 * Two separate steps, deliberately not conflated:
 *  1. {@link reachableLevelCount} decides *how many* levels this map reaches
 *     at all, from its own centre-to-corner radius against the fixed
 *     dungeon-wide yardstick — so a tiny early map still only ever gets the
 *     low levels, never something like level 26 shoved into a corner.
 *  2. Every candidate floor tile is ranked by distance from centre and that
 *     ranked list is sliced into `reachableLevelCount + 1` equal-*sized*
 *     chunks (the nearest chunk is the empty safe zone, the next is level 1,
 *     and so on outward) — so each reached level gets a fair, roughly-equal
 *     share of whatever floor this specific dungeon actually generated,
 *     instead of an idealised disk's area (which starves the low levels,
 *     since a disk's area shrinks toward its centre).
 */
export function addMobNests(
  map: DMap,
  perLevelCount: number
): void {
  const center = mapCenter(map);
  const corner: Pos = { x: map.width - 1, y: map.height - 1 };
  const maxLevel = reachableLevelCount(Math.hypot(corner.x - center.x, corner.y - center.y));
  if (maxLevel === 0) return; // this map's extent doesn't even clear the empty innermost ring.

  // Gather every walkable, unoccupied floor tile as a nest candidate, paired
  // with its distance from the centre. The player already picked their spot
  // (see Game's constructor, which places the player before calling this)
  // and occupies map.Q, so exclude any tile already taken by them — or by
  // any other mob — from consideration.
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
  const totalChunks = maxLevel + 1; // +1: chunk 0 is the empty innermost ring, skipped below.
  for (let level = 1; level <= maxLevel; level++) {
    const lo = Math.floor((level * n) / totalChunks);
    const hi = Math.floor(((level + 1) * n) / totalChunks);
    // ROT.RNG.shuffle returns a NEW shuffled array; it does not mutate its
    // argument.
    const chunk = ROT.RNG.shuffle(candidates.slice(lo, hi).map((c) => c.pos));
    for (const nest of chunk.slice(0, perLevelCount)) {
      map.set(nest, Tile.Nest);
      map.Q.push(makeMob(level, nest));
    }
  }
}
