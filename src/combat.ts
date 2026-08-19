import { Mob, isPly } from "./dmap";
import type { Game } from "./game";
import { playAttack, playHurt } from "./juice-sound";
import { spark, splatter } from "./juice-gfx";

/**
 * Reports a (currently harmless) bump between two combatants: the
 * `attacker` shoves the `target`. For now this just announces the shove
 * via the message log; later it can grow into real combat resolution.
 */
export function bump(atk:Mob, def:Mob, game: Game): boolean {
  const attacker = atk.name;
  const target = def.name;
  game.log.msg(`${attacker} pushes ${target}`);
  // Juice: cheery blip when the player lands a hit, ominous tone when the
  // player takes one, and (for now) a coin-flip between sparks and splatter
  // on whoever just got struck.
  if (isPly(atk)) { playAttack(); }
  else if (isPly(def)) { playHurt(); }
  Math.random() < 0.5 ? spark(def, game.player) : splatter(def, game.player);
  return true;
}
