import * as ROT from "rot-js";
import { Mob, isPly } from "./dmap";
import type { Game } from "./game";
import { playAttack, playHurt } from "./juice-sound";
import { spark, splatter } from "./juice-gfx";
import { isDead } from "./gameloop";
import { Viewport } from "./viewport";
import { noteCombatAttempt } from "./ooc-heal";
import { noteLastFoe } from "./last-foe";
import { awardKillXp } from "./xp";

/**
 * Reports a (currently harmless) bump between two combatants: the
 * `attacker` shoves the `target`. For now this just announces the shove
 * via the message log; later it can grow into real combat resolution.
 */
export function bump(atk:Mob, def:Mob, game: Game): boolean {
  const attacker = atk.name;
  const target = def.name;

  noteCombatAttempt(game.oocHeal, atk, def); // any attempt, hit or miss, counts as combat.
  noteLastFoe(game.lastFoe, atk, def); // remember this fight for the HUD's "foe" bar.

  const damage = ROT.RNG.getUniformInt(0, atk.dmg);
  def.hp -= damage;
  game.log.msg( damage ?
    `${attacker} hits ${target} for ${damage}` :
    `${attacker} misses ${target}`
  );
  if (isDead(def)) { kill(atk, def, game); }

  attack_juice(atk, def, game); // (pure effect/feedback, no gameplay impact.)
  return true;
}

function attack_juice(atk: Mob, def: Mob, game: Game) {
  // Juice: cheery blip when the player lands a hit, ominous tone when the
  // player takes one, and (for now) a coin-flip between sparks and splatter
  // on whoever just got struck.
  if (isPly(atk)) { playAttack(); }
  else if (isPly(def)) { playHurt(); }
  Math.random() < 0.5 ? spark(def, game.player) : splatter(def, game.player);
} // todo, we should rearrange the spark/splat, to have one of them for mob-death.

function kill(atk: Mob, def: Mob, game: Game) {
  game.log.msg(`${def.name} dies`);
  game.map.Q.remove(def);
  if (isPly(atk)) { awardKillXp(game, def); }
}

export function showGameOver(g: Game, vp: Viewport) {
  g.log.msg("GAME OVER");
  vp.draw(g);
  vp.drawCentered(
    Math.floor(vp.height / 2),
    "%c{yellow}%b{#400}[%c{red}GAME OVER%c{yellow}]%b{}%c{}"
  );
  vp.drawCentered(Math.floor(vp.height / 2) + 1, "press ENTER to restart");
}
  

