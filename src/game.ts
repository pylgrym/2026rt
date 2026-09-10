import { DMap, Pos, Mob, Tile, type ItemInstance } from "./dmap";
import { BASE_HP } from "./mob-factory";
import { Dungeon } from "./dungeon";
import { createBag } from "./bag";
import { MsgQueue } from "./msglog";
import { createOocHealState, type OocHealState } from "./ooc-heal";
import { createXpState, type XpState } from "./xp";
import { createLastFoeState, type LastFoeState } from "./last-foe";
import type { DistanceShader } from "./shader";
import { createManaState, type ManaState } from "./magic/mana";
import type { FieldEffect } from "./magic/field-effects";
import type { DelayedEvent } from "./magic/delayed-events";
import { generateCharName } from "./char-name";
import { generateBackstory } from "./char-backstory";


/**
 * Owns the mutable game state: the {@link Dungeon} (one {@link DMap} per
 * level), the player's position, and the spawn point the player started
 * from. Presentation (rot.js display, viewport, input wiring) lives in the
 * caller.
 */
export class Game {
  /** The dungeon: a DMap per level, indexed by level number. See {@link curMap}. */
  readonly dungeon: Dungeon;
  /** The player's current position, mutated in place as they move. */
  readonly player: Mob;
  /** Where the player first appeared (level 1's centre, or nearest walkable tile to it). */
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

  /** The player's spell-point resource. See {@link ./mana.ts} and {@link ./spells.ts}. */
  readonly mana: ManaState;

  /** Ground-anchored lingering spell effects (clouds, walls, traps, pulls...). See {@link ./field-effects.ts}. */
  fieldEffects: FieldEffect[] = [];

  /** One-shot turn-delayed callbacks (telegraphed detonations, echoed damage...). See {@link ./delayed-events.ts}. */
  delayedEvents: DelayedEvent[] = [];

  /** True once the player has descended from the deepest dungeon level (15) — see ../dungeon-levels-stairs-design.md. */
  won = false;

  /**
   * The player character's randomly-generated name, shown on the welcome
   * screen (see ./welcome.ts). Purely flavour — the player {@link Mob}'s
   * own `name` field stays "ply", the in-game designation everything else
   * (combat log, isPly checks) relies on.
   */
  readonly charName: string;

  /** A one-sentence randomly-generated backstory, shown alongside {@link charName} on the welcome screen. */
  readonly backstory: string;

  /**
   * A short description of whatever last damaged the player, kept up to
   * date by every source of damage to them (melee, spells, reflect/thorns,
   * item mishaps, damage-over-time). Shown on the game-over screen (see
   * ./combat.ts's drawEndScreen) as their cause of death — so it only
   * needs to be accurate at the moment they actually die, but there's no
   * cheaper way to know that in advance than tracking it as it happens.
   */
  deathCause = "unknown causes";

  constructor() {
    this.dungeon = new Dungeon();
    // Drop the player at level 1's exact centre (or the nearest walkable
    // tile to it, avoiding the stairs).
    this.spawn = this.dungeon.initialSpawn();
    this.player = { x: this.spawn.x, y: this.spawn.y, t: Tile.Ply, name: "ply", hp: BASE_HP, maxhp: BASE_HP, dmg: 2 };
    // unshift, not push: buildLevel() already seeded level 1's monster nests
    // (see Dungeon.initialSpawn(), called just above) before the player
    // existed, so the player must go to the *front* of the queue, not the
    // back, to satisfy doTurns' "player is always Q.front()" invariant.
    this.dungeon.curMap().Q.unshift(this.player); // the player is a mob too.

    this.bag = createBag();
    this.log = new MsgQueue();
    this.oocHeal = createOocHealState();
    this.xp = createXpState();
    this.lastFoe = createLastFoeState();
    this.mana = createManaState();
    this.charName = generateCharName();
    this.backstory = generateBackstory();
  }

  /** The {@link DMap} for the level the player is currently on. Every access to "the map" goes through this. */
  curMap(): DMap {
    return this.dungeon.curMap();
  }

  /** The wall-colouring shader for the current level's map. See {@link ./shader.ts}. */
  curShader(): DistanceShader {
    return this.dungeon.curShader();
  }
}

