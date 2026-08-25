import { isPly, type Mob } from "./dmap";

/**
 * Tracks the last monster the PLAYER traded blows with, for the "foe"
 * health bar in the HUD (see ./hud.ts). Only combat involving the player
 * (as attacker or target) updates this — mob-vs-mob scuffles elsewhere on
 * the map are ignored, same convention as ./ooc-heal.ts.
 *
 * The tracked object is the live {@link Mob}, not a snapshot: its hp keeps
 * reflecting reality (including death, i.e. hp <= 0) until a new fight
 * replaces it.
 */
export interface LastFoeState { mob: Mob | null; }
export function createLastFoeState(): LastFoeState { return { mob: null }; } // A freshly reset state, as used at game start. 

/** Call whenever one mob attempts to hit another (hit or miss both count). */
export function noteLastFoe(state: LastFoeState, atk: Mob, def: Mob): void {
  if (isPly(atk)) { state.mob = def; }
  else if (isPly(def)) { state.mob = atk; }
}
