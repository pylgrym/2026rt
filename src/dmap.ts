import * as ROT from "rot-js";
import { MobQ } from "./MobQ";

/**
 * Tile kinds for the dungeon map.
 *
 * This uses the modern TypeScript idiom of a `const` object plus a
 * derived union type, instead of a classic `enum`. It gives us real
 * namespaced values (`Tile.Wall`) while the type `Tile` is just the
 * union of their numeric values — no runtime enum object, no reverse
 * mappings, and it plays nicely with `as const` inference.
 *
 * The numeric values intentionally match what rot.js map generators
 * emit in their callback: `0` = floor (passable), `1` = wall.
 */
export const Tile = {
  Floor: 0,
  Wall: 1,
  Nest: 2,
  Ply: 3,
  Rat: 4
} as const;

// we should partition these two types.
export type T_Tile = (typeof Tile)[keyof typeof Tile];

/** Whether a given tile can be walked onto (floors yes, walls no). */
export function walkable(tile: T_Tile): boolean {
  return tile !== Tile.Wall; //Floor;
}

/** Default map dimensions, in tiles. */
export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 60;

/**
 * A 2-dimensional grid of {@link Tile}s backed by a single flat array.
 * The dungeon lives here; generators fill it and the viewport reads it.
 */
export class DMap {
  readonly width: number;
  readonly height: number;
  /** Mobs currently living on the map, mutated in place as they move. */
  readonly Q: MobQ = new MobQ();
  private readonly tiles: T_Tile[];

  constructor(width = MAP_WIDTH, height = MAP_HEIGHT, fill: T_Tile = Tile.Wall) {
    this.width = width;
    this.height = height;
    this.tiles = new Array<T_Tile>(width * height).fill(fill);
  }

  /** True when `pos` lies inside the map bounds. */
  inBounds(pos: Readonly<Pos>): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x < this.width && pos.y < this.height;
  }

  /** Reads the tile at `pos`; out-of-bounds reads return a wall. */
  get(pos: Readonly<Pos>): T_Tile {
    if (!this.inBounds(pos)) return Tile.Wall;
    return this.tiles[pos.y * this.width + pos.x];
  }

  /** Writes a tile at `pos`. Out-of-bounds writes are ignored. */
  set(pos: Readonly<Pos>, tile: T_Tile): void {
    if (!this.inBounds(pos)) return;
    this.tiles[pos.y * this.width + pos.x] = tile;
  }
}

/** A position on the map, in tile coordinates. */
export interface Pos {
  x: number;
  y: number;
}

export interface Mob extends Pos {
  t: T_Tile;
  name: string;
}

/** True when `mob` is the player. */
export function isPly(mob: Mob | null): boolean {
  return mob?.t === Tile.Ply;
}

/**
 * Fills a {@link DMap} with rooms and corridors using rot.js's Digger
 * generator, and returns a sensible spawn point (the centre of the
 * first generated room).
 */
export function generateDungeon(map: DMap): Pos {
  const digger = new ROT.Map.Digger(map.width, map.height);

  // Reuse one scratch Pos across every cell the generator visits; `set`
  // reads it and forgets it, so mutating in place is safe and avoids a
  // per-cell allocation.
  const at: Pos = { x: 0, y: 0 };
  digger.create((x: number, y: number, value: number) => {
    // rot.js yields 0 = floor, 1 = wall — the same values as Tile.
    at.x = x;
    at.y = y;
    map.set(at, value as T_Tile);
  });

  const rooms = digger.getRooms();
  const [cx, cy] = rooms[0].getCenter();
  return { x: cx, y: cy };
}
