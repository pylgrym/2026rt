import * as ROT from "rot-js";
import { MobQ } from "./MobQ";
import type { T_Mood } from "./mood";
import type { AiMemory } from "./ai-types";

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
  // Monster levels 1-26, one tile per letter of the alphabet. See
  // {@link ./mob-factory.ts}'s `MOB_TYPES` for the level -> creature
  // mapping and ../progression.md for the design behind it.
  Ant: 4,
  Bat: 5,
  Cat: 6,
  Dog: 7,
  Eye: 8,
  Fox: 9,
  Git: 10,
  Hog: 11,
  Imp: 12,
  Jay: 13,
  Koi: 14,
  Loon: 15,
  Moth: 16,
  Newt: 17,
  Orc: 18,
  Pig: 19,
  Quail: 20,
  Rat: 21,
  Sow: 22,
  Toad: 23,
  Urchin: 24,
  Vole: 25,
  Wasp: 26,
  Xerus: 27,
  Yak: 28,
  Zebu: 29,
  // Stairs between dungeon levels; see ../dungeon-levels-stairs-design.md.
  StairUp: 30,
  StairDown: 31,
} as const;

// we should partition these two types.
export type T_Tile = (typeof Tile)[keyof typeof Tile];

/**
 * Object kinds that can sit on the floor as loot (see {@link ./objs.ts}).
 * A separate namespace from {@link Tile}: objects live in `DMap.objs`, not
 * in the tile grid, so they don't need tile slots of their own.
 */
export const ObjType = {
  Kettle: 0,
  Tea: 1,

  // Potions (see ../spells.md's Defensive/Utility/Buff sections and
  // ./item-types.ts): self-affecting, but see ./items.ts's throwPotion for
  // hurling one at a target instead.
  PotionShield: 2,
  PotionReflect: 3,
  PotionInvisibility: 4,
  PotionHealingAura: 5,
  PotionCleanse: 6,
  PotionDamageReductionWard: 7,
  PotionHaste: 8,
  PotionLevitate: 9,
  PotionWaterwalk: 10,
  PotionEmpower: 11,

  // Scrolls: general one-shot effects, not tied to the reader's own body.
  ScrollSleep: 12,
  ScrollSilence: 13,
  ScrollPolymorph: 14,
  ScrollBlink: 15,
  ScrollLight: 16,
  ScrollDetectEnemies: 17,
  ScrollSummonPortal: 18,
  ScrollSummonSkeleton: 19,
  ScrollSummonSwarm: 20,
  ScrollElementalFamiliar: 21,
  ScrollNecroticReanimation: 22,
  ScrollArmyOfTheDead: 23,
  ScrollWeaken: 24,
  ScrollArmorBreak: 25,
  ScrollMarkForDeath: 26,
  ScrollCurse: 27,
  ScrollDivineJudgment: 28,

  // Wands: charged, targeted NSEW beams/projectiles (see ./items.ts's zapWand).
  WandFireball: 29,
  WandLightningBolt: 30,
  WandIceShard: 31,
  WandChainLightning: 32,
  WandArcaneMissile: 33,
  WandVoidBeam: 34,
  WandShadowSpike: 35,
  WandStunBolt: 36,
  WandRoot: 37,
  WandKnockback: 38,

  // Staffs: charged, more powerful area effects (see ./items.ts's zapStaff).
  StaffPoisonCloud: 39,
  StaffMeteorStrike: 40,
  StaffFrostNova: 41,
  StaffGravityWell: 42,
  StaffTimeSlow: 43,
  StaffBarrierWall: 44,
  StaffEarthquake: 45,
  StaffFlameWall: 46,
  StaffIcePlatform: 47,
  StaffWebTrap: 48,
  StaffSpikeTrap: 49,
  StaffBlizzard: 50,
  StaffBlackHole: 51,
  StaffTimeStop: 52,
} as const;
export type T_ObjType = (typeof ObjType)[keyof typeof ObjType];

/** Whether a given tile can be walked onto (floors yes, walls no). */
export function walkable(tile: T_Tile): boolean {
  return tile !== Tile.Wall; //Floor;
}

/** Default map dimensions, in tiles. */
export const MAP_WIDTH = 420;
export const MAP_HEIGHT = 420;

/**
 * A 2-dimensional grid of {@link Tile}s backed by a single flat array.
 * The dungeon lives here; generators fill it and the viewport reads it.
 */
export class DMap {
  readonly width: number;
  readonly height: number;
  /** Mobs currently living on the map, mutated in place as they move. */
  readonly Q: MobQ = new MobQ();
  /** Objects placed on the map by {@link addObjects}. */
  objs: Obj[] = [];
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
  hp: number;
  maxhp: number;
  /** Max damage this mob can deal in one hit; see {@link ../progression.md}. */
  dmg: number;
  /** Sleep/wake behaviour state; only monsters use it, the player leaves it `undefined`. See {@link ./mood.ts}. */
  mood?: T_Mood;
  /** Behavioural AI scratch state; only monsters use it, the player leaves it `undefined`. See {@link ./ai-types.ts}. */
  ai?: AiMemory;
}

/** An object sitting on the floor at a given position; see {@link ./objs.ts}. */
export interface Obj extends Pos {
  type: T_ObjType;
  /** Charges remaining, for wands/staffs (see ./item-types.ts). `undefined` for single-use/uncharged items. */
  charges?: number;
}

/** A carried item instance: the same identity/charge shape as {@link Obj}, minus a position. Used for `game.bag`. */
export type ItemInstance = { type: T_ObjType; charges?: number };

/** True when `mob` is the player. */
export function isPly(mob: Mob | null): boolean {
  return mob?.t === Tile.Ply;
}

/**
 * Fills a {@link DMap} with rooms and corridors using rot.js's Digger
 * generator, and returns a sensible spawn point (the centre of the
 * first generated room).
 */
export function generateDungeon(map: DMap): ReturnType<InstanceType<typeof ROT.Map.Digger>["getRooms"]> {
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

  return digger.getRooms();
}
