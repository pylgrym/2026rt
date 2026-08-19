import { DMap, generateDungeon, Pos, Mob, Tile } from "./dmap";
import { addMobNests } from "./mobs";
import { MsgQueue } from "./msglog";


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
  /** Where the player first appeared (the first room's centre). */
  readonly spawn: Pos; // still just a position.

  /** The message log/queue for this game. Reached as `game.log`. */
  readonly log: MsgQueue;

  constructor() {
    this.map = new DMap();
    // Carve the dungeon and drop the player at the first room's centre.
    this.spawn = generateDungeon(this.map);
    this.player = { x: this.spawn.x, y: this.spawn.y, t: Tile.Ply, name: "player" };
    this.map.Q.push(this.player); // the player is a mob too.

    addMobNests(this.map, 10); //, huddle_npcs);
    this.log = new MsgQueue();
  }
}

