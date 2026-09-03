import { DMap, generateDungeon, Pos, Mob, Tile, type ItemInstance } from "./dmap";
import { addMobNests, pickSpawnCenter, BASE_HP } from "./mob-factory";
import { addObjects } from "./objs";
import { createBag } from "./bag";
import { MsgQueue } from "./msglog";
import { createOocHealState, type OocHealState } from "./ooc-heal";
import { createXpState, type XpState } from "./xp";
import { createLastFoeState, type LastFoeState } from "./last-foe";
import { createDistanceShader, type DistanceShader } from "./shader";
import { createManaState, type ManaState } from "./magic/mana";
import type { FieldEffect } from "./magic/field-effects";
import type { DelayedEvent } from "./magic/delayed-events";


/**
 * Owns the mutable game state: the dungeon {@link DMap}, the player's
 * position, and the spawn point the player started from. Presentation
 * (rot.js display, viewport, input wiring) lives in the caller.
 */
export class Game {
  /** The dungeon map the player walks. */
  readonly map: DMap;
  /** The player's current position, mutated in place as they move. */
  readonly player: Mob;
  /** Where the player first appeared (the map's centre, or nearest walkable tile). */
  readonly spawn: Pos; // still just a position.

  /** The message log/queue for this game. Reached as `game.log`. */
  readonly log: MsgQueue;

  /** The player's carried items (teas, kettles, potions, scrolls, wands, staffs...). See {@link ./bag.ts}. */
  readonly bag: ItemInstance[];

  /** Out-of-combat regeneration state. See {@link ./ooc-heal.ts}. */
  readonly oocHeal: OocHealState;

  /** Player kill xp/level state. See {@link ./xp.ts}. */
  readonly xp: XpState;

  /** The last monster the player fought, for the HUD. See {@link ./last-foe.ts}. */
  readonly lastFoe: LastFoeState;

  /** Centre-to-edge wall colouring for the dungeon view. See {@link ./shader.ts}. */
  readonly wallShader: DistanceShader;

  /** The player's spell-point resource. See {@link ./mana.ts} and {@link ./spells.ts}. */
  readonly mana: ManaState;

  /** Ground-anchored lingering spell effects (clouds, walls, traps, pulls...). See {@link ./field-effects.ts}. */
  fieldEffects: FieldEffect[] = [];

  /** One-shot turn-delayed callbacks (telegraphed detonations, echoed damage...). See {@link ./delayed-events.ts}. */
  delayedEvents: DelayedEvent[] = [];

  constructor() {
    this.map = new DMap();
    // Carve the dungeon, then drop the player at the map's exact centre
    // (or the nearest walkable tile to it).
    generateDungeon(this.map);
    this.spawn = pickSpawnCenter(this.map);
    this.player = { x: this.spawn.x, y: this.spawn.y, t: Tile.Ply, name: "player", hp: BASE_HP, maxhp: BASE_HP, dmg: 2 };
    this.map.Q.push(this.player); // the player is a mob too.

    addMobNests(this.map, 5); // 5 of each monster level (1-26).
    this.map.objs = addObjects(this.map);
    this.bag = createBag();
    this.log = new MsgQueue();
    this.oocHeal = createOocHealState();
    this.xp = createXpState();
    this.lastFoe = createLastFoeState();
    this.wallShader = createDistanceShader(this.map.width, this.map.height);
    this.mana = createManaState();
  }
}

