import * as ROT from "rot-js";
import { DMap, Tile, ObjType, type T_ObjType, type Pos, type Obj } from "./dmap";
import type { Game } from "./game";
import type { Viewport } from "./viewport";
import { hasLineOfSight } from "./mood";
import { playObjHealSimple, playObjHealFancy } from "./juice/juice-objs";
import { addToBag } from "./bag";
import { ITEM_TYPES, itemTypeInfo, ItemKind } from "./item-types";

/**
 * The object type roster: name, glyph and colour per {@link ObjType}.
 * Mirrors {@link MOB_TYPES} in mob-factory.ts, one entry per enum member.
 */
interface ObjTypeInfo {
  readonly type: T_ObjType;
  readonly name: string;
  readonly glyph: string;
  readonly color: string;
}

const OBJ_TYPES: readonly ObjTypeInfo[] = [
  { type: ObjType.Kettle, name: "kettle", glyph: "!", color: "#0cf" },
  { type: ObjType.Tea, name: "tea", glyph: "?", color: "#3a3" },
] as const;

/** Fast `type -> info` lookup, built once from {@link OBJ_TYPES}. */
const OBJ_INFO_BY_TYPE = new Map<T_ObjType, ObjTypeInfo>(OBJ_TYPES.map((o) => [o.type, o]));

/**
 * Every pickupable type's display info, legacy Kettle/Tea plus every
 * potion/scroll/wand/staff from ./item-types.ts. Also used by bag.ts to
 * render inventory entries.
 *
 * Every spell item's `name` here is already prefixed with its fixed poetic
 * {@link ItemTypeInfo.colorName} (e.g. "vermillion staff of meteors") —
 * that colour is a permanent, deterministic identity per item type, not a
 * randomised-per-game identification scheme, so baking it into the label
 * once here means every call site (pickup/drop messages, the bag menu, ...)
 * shows it for free.
 */
export function objInfo(type: T_ObjType): ObjTypeInfo {
  const legacy = OBJ_INFO_BY_TYPE.get(type);
  if (legacy) return legacy;
  const item = itemTypeInfo(type)!;
  return { type: item.type, name: `${item.colorName} ${item.name}`, glyph: item.glyph, color: item.color };
}

/** The full pool of types the world can spawn: legacy Kettle/Tea plus every spell item. */
const ALL_OBJ_TYPES: readonly T_ObjType[] = [...OBJ_TYPES.map((o) => o.type), ...ITEM_TYPES.map((i) => i.type)];

/** Picks a uniformly random object type, drawn from every pickupable kind (legacy and spell items alike). */
function randomObjType(): T_ObjType {
  return ALL_OBJ_TYPES[ROT.RNG.getUniformInt(0, ALL_OBJ_TYPES.length - 1)];
}

/**
 * Builds a freshly-placed/dropped {@link Obj} of `type` at `pos`. Wands and
 * staffs (see ./item-types.ts) get a random starting charge count from 0 up
 * to their base max — most are found partly spent, some empty, a few full
 * — everything else is left uncharged (`charges: undefined`).
 */
function makeObj(pos: Readonly<Pos>, type: T_ObjType): Obj {
  const info = itemTypeInfo(type);
  const isCharged = info && (info.kind === ItemKind.Wand || info.kind === ItemKind.Staff);
  const charges = isCharged ? ROT.RNG.getUniformInt(0, info!.baseMaxCharges ?? 5) : undefined;
  return { x: pos.x, y: pos.y, type, charges };
}

/**
 * Finds every vacant floor tile on `map` (walkable, unoccupied by a mob),
 * then randomly selects 10% of them and returns objects of random types at
 * those positions. Mirrors the candidate-gathering half of
 * {@link addMobNests} in mob-factory.ts; see ../obj-design.md for the
 * object epic this kicks off.
 */
export function addObjects(map: DMap): Obj[] {
  // PLACE them.
  const candidates: Pos[] = [];
  const at: Pos = { x: 0, y: 0 };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      at.x = x;
      at.y = y;
      if (map.get(at) !== Tile.Floor || map.Q.find((mob) => mob.x === x && mob.y === y)) continue;
      candidates.push({ x, y });
    }
  }

  const count = Math.floor(candidates.length * 0.1);
  return (ROT.RNG.shuffle(candidates) as Pos[])
    .slice(0, count)
    .map((pos: Pos) => makeObj(pos, randomObjType()));
}

/**
 * Draws a `?` for every object whose position falls within the visible map
 * area, or its real type-specific glyph/colour instead when it also has
 * line of sight to the player (see {@link hasLineOfSight}) — items you
 * haven't laid eyes on read as unidentified. `origin` is the map coordinate
 * of the visible area's top-left corner; `drawWidth` caps how many columns
 * of `viewport` are the map's to draw into. Mirrors {@link drawMobs} in
 * mobs.ts.
 */
export function drawObjects(viewport: Viewport, game: Game, origin: Readonly<Pos>, drawWidth: number): void {
  const { display, height } = viewport;
  for (const obj of game.map.objs) {
    const sx = obj.x - origin.x;
    const sy = obj.y - origin.y;
    if (sx < 0 || sy < 0 || sx >= drawWidth || sy >= height) continue;
    const visible = hasLineOfSight(game.map, game.player, obj);
    if (!visible) continue; // objects without line of sight no longer draw
    const [glyph, color] = [objInfo(obj.type).glyph, objInfo(obj.type).color];
    // const [glyph, color] = visible ? [objInfo(obj.type).glyph, objInfo(obj.type).color] : ["?", "#fff"];
    display.draw(sx, sy, glyph, color, "#000");
  }
}

/** Removes the object at `pos` from `map.objs`, if one is there. */
function removeObject(map: DMap, pos: Readonly<Pos>): void {
  const idx = map.objs.findIndex((p) => p.x === pos.x && p.y === pos.y);
  if (idx !== -1) map.objs.splice(idx, 1);
}

/**
 * Heals the player by `amount` hp, capped at their max. When already at
 * full health, boosts their max hp by 15% instead (and heals to the new
 * max), so healing is never wasted.
 */
export function healSpell(game: Game, amount: number): void {
  const player = game.player;
  if (player.hp < player.maxhp) {
    const healed = Math.min(amount, player.maxhp - player.hp);
    player.hp += healed;
    game.log.msg(`you feel better (+${healed})`);
    playObjHealSimple();
  } else {
    const increase = Math.round(player.maxhp * 0.15);
    player.maxhp += increase;
    player.hp = player.maxhp;
    game.log.msg(`you feel much healthier! (max hp +${increase})`);
    playObjHealFancy();
  }
}

/**
 * Logs the effect of using an object of `type`. Every object type
 * currently just heals the player. Called from bag.ts's 'u' (use)
 * inventory command.
 */
export function useObjectType(game: Game, type: T_ObjType): void {
  game.log.msg(`you use ${objInfo(type).name}`);
  healSpell(game, Math.round(game.player.maxhp * 0.25));
}

/**
 * Picks `obj` up off the map and into the player's bag (see bag.ts).
 *
 * @returns `true` when the bag had room and the object was taken (removed
 *   from the map). Returns `false` (object left on the ground) when the
 *   bag was full — {@link addToBag} has already logged that.
 */
function takeObject(game: Game, obj: Readonly<Obj>): boolean {
  if (!addToBag(game, obj.type, obj.charges)) return false;
  removeObject(game.map, obj);
  game.log.msg(`got ${objInfo(obj.type).name}`);
  return true;
}

/** Logs a message for `obj`, then takes it. */
function noticeObject(game: Game, obj: Readonly<Obj>): void {
  game.log.msg(`${objInfo(obj.type).name} here`);
  //takeObject(game, obj); // no, stepping on it no longer auto-picks up.
}

/** The object at `pos`, if any. */
function objectAt(game: Game, pos: Readonly<Pos>): Obj | undefined {
  return game.map.objs.find((p) => p.x === pos.x && p.y === pos.y);
}

/**
 * Notices the object (if any) at the player's current position. Called from
 * `movePlayer` right after a successful move (not a bump), so it fires
 * exactly on the turn the player steps onto the item.
 */
export function noticeObjects(game: Game): void {
  const obj = objectAt(game, game.player);
  if (obj) noticeObject(game, obj);
}

/**
 * Handles the 'g'/'G' pickup command: takes the object under the player, if
 * any. Wired from `movePlayer` (`src/move-player.ts`).
 *
 * @returns `true` when an object was there and taking it consumed a turn.
 *   Returns `false` (no turn consumed) when there was nothing to pick up.
 */
export function pickupObject(game: Game): boolean {
  const obj = objectAt(game, game.player);
  if (!obj) {
    game.log.msg("nothing to get");
    return false;
  }
  return takeObject(game, obj);
}

/**
 * Drops an object of `type` onto the dungeon floor at `pos`. Pass `charges`
 * when dropping a specific carried instance (so its exact remaining
 * charges survive onto the ground); omitted (loot spawns), a fresh
 * wand/staff rolls a random starting charge count via {@link makeObj}.
 */
export function dropObject(game: Game, pos: Readonly<Pos>, type: T_ObjType, charges?: number): void {
  game.map.objs.push(charges !== undefined ? { x: pos.x, y: pos.y, type, charges } : makeObj(pos, type));
}

/**
 * With `chance` probability (0..1), drops an object of `type` at `pos` via
 * {@link dropObject}.
 */
export function dropLoot(game: Game, pos: Readonly<Pos>, chance: number, type: T_ObjType): void {
  if (ROT.RNG.getUniform() < chance) dropObject(game, pos, type);
}

/**
 * A same-level kill drops loot 33% of the time; each level the monster sits
 * *above* the player adds another sixth on top of that, each level *below*
 * subtracts a sixth — mirroring the xp curve in xp.ts's `xpForKill`. Never
 * negative: a kill far beneath the player's level never drops loot.
 */
const KILL_DROP_BASE_CHANCE = 1 / 3;
const KILL_DROP_LEVEL_STEP = 1 / 6;

/**
 * Rolls loot (a random object type) for a monster of `mobLevel` killed at
 * `pos`, scaled by the player's level.
 */
export function killDrop(game: Game, pos: Readonly<Pos>, mobLevel: number): void {
  const diff = mobLevel - game.xp.level;
  const chance = Math.max(0, KILL_DROP_BASE_CHANCE + diff * KILL_DROP_LEVEL_STEP);
  dropLoot(game, pos, chance, randomObjType());
}
