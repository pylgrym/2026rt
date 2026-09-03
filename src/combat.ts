import * as ROT from "rot-js";
import { Mob, isPly } from "./dmap";
import type { Game } from "./game";
import { playAttack, playHurt } from "./juice/juice-sound";
import { spark, splatter } from "./juice/juice-gfx";
import { isDead } from "./gameloop";
import { Viewport } from "./viewport";
import { noteCombatAttempt } from "./ooc-heal";
import { noteLastFoe } from "./last-foe";
import { awardKillXp } from "./xp";
import { levelOfTile } from "./mob-factory";
import { killDrop } from "./objs";
import {
  applyIncomingModifiers, applyOutgoingModifiers, breakSleepOnDamage,
  hasStatus, getStatus, StatusKind, preventDeathOnce,
} from "./magic/status-effects";
import { inputKey } from "./input";
import { drawLogScreen } from "./msglog";

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

  let rolled = ROT.RNG.getUniformInt(0, atk.dmg);
  if (hasStatus(atk, StatusKind.Blind)) rolled = 0; // Dazzle Flash: blinded attackers always miss.
  else if (rolled === 0 && hasStatus(def, StatusKind.Tarred)) rolled = 1; // Tar Pool: can't be missed.
  const outgoing = applyOutgoingModifiers(atk, rolled);
  const { damage, reflected, siphon } = applyIncomingModifiers(def, outgoing);
  def.hp -= damage;
  breakSleepOnDamage(def);
  game.log.msg( damage ?
    `${attacker} hits ${target} for ${damage}` :
    `${attacker} misses ${target}`
  );
  if (reflected > 0) {
    atk.hp -= reflected;
    game.log.msg(`${target} reflects ${reflected} back at ${attacker}`);
  }
  if (siphon > 0) {
    atk.hp = Math.min(atk.maxhp, atk.hp + siphon);
    game.log.msg(`${attacker} siphons ${siphon} health from ${target}`);
  }
  const thorns = getStatus(def, StatusKind.Thorns) ?? getStatus(def, StatusKind.StaticSkin);
  if (thorns) {
    atk.hp -= thorns.magnitude;
    game.log.msg(`${target}'s ward sears ${attacker} for ${thorns.magnitude}`);
  }
  if (isDead(def) && preventDeathOnce(def)) {
    def.hp = 1;
    game.log.msg(`${target} narrowly survives!`);
  } else if (isDead(def)) { kill(atk, def, game); }

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

/**
 * Deals `rawDamage` from a spell (as opposed to a melee {@link bump}) to
 * `target`, running it through {@link applyIncomingModifiers} (shield,
 * armor break, mark, damage reduction, reflect) and killing/awarding xp and
 * loot exactly like a normal hit when it's fatal. `verb` reads into the log
 * as "the orc is {verb} for N" (e.g. "burned", "shocked", "frozen").
 */
export function dealSpellDamage(game: Game, caster: Mob, target: Mob, rawDamage: number, verb: string): void {
  const { damage, reflected, siphon } = applyIncomingModifiers(target, rawDamage);
  target.hp -= damage;
  breakSleepOnDamage(target);
  game.log.msg(damage > 0 ? `${target.name} is ${verb} for ${damage}` : `${target.name} resists`);
  if (reflected > 0 && caster !== target) {
    caster.hp -= reflected;
    game.log.msg(`${target.name} reflects ${reflected} back at ${caster.name}`);
  }
  if (siphon > 0 && caster !== target) {
    caster.hp = Math.min(caster.maxhp, caster.hp + siphon);
    game.log.msg(`${caster.name} siphons ${siphon} health from ${target.name}`);
  }
  if (isDead(target) && preventDeathOnce(target)) {
    target.hp = 1;
    game.log.msg(`${target.name} narrowly survives!`);
  } else if (isDead(target)) kill(caster, target, game);
  else attack_juice(caster, target, game);
}

function kill(atk: Mob, def: Mob, game: Game) {
  game.log.msg(`${def.name} dies`);
  game.map.Q.remove(def);
  if (isPly(atk)) {
    awardKillXp(game, def);
    killDrop(game, def, levelOfTile(def.t));
  }
}

export function showGameOver(g: Game, vp: Viewport) {
  g.log.msg("GAME OVER"); // logged once, here — drawGameOverScreen() re-draws this same screen on toggling back from the log without re-logging it.
  drawGameOverScreen(g, vp);
}

function drawGameOverScreen(g: Game, vp: Viewport): void {
  vp.draw(g);
  vp.drawCentered(
    Math.floor(vp.height / 2),
    "%c{yellow}%b{#400}[%c{red}GAME OVER%c{yellow}]%b{}%c{}"
  );
  vp.drawCentered(Math.floor(vp.height / 2) + 1, "[[ENTER]] restart   [[P]] view message log");
}

/**
 * Waits for the player to restart after death (see {@link showGameOver}),
 * letting them toggle 'p'/'P' any number of times to read the full message
 * log — to see how they died — and back to the death screen, before
 * finally pressing Enter. Wired from `main()` (`src/index.ts`).
 */
export async function waitAfterGameOver(g: Game, vp: Viewport): Promise<void> {
  let onLog = false;
  while (true) {
    const key = (await inputKey()).key;
    if (key === "Enter") return;
    if (key === "p" || key === "P") {
      onLog = !onLog;
      if (onLog) drawLogScreen(g, vp, "[[P]] back to game over screen   [[ENTER]] restart");
      else drawGameOverScreen(g, vp);
    }
  }
}


