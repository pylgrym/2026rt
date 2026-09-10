import { Tile, isPly, type Mob, type Pos, type T_Tile } from "./dmap";
import type { Game } from "./game";
import type { Viewport } from "./viewport";
import { inputKey } from "./input";
import { dealSpellDamage } from "./combat";
import { spendMana } from "./magic/mana";
import {
  StatusKind, addStatus, isSilenced, cleanseNegative, hasStatus, getStatus, removeStatus,
} from "./magic/status-effects";
import {
  promptDirection, animateProjectile, pickGroundTarget, mobsInRadius,
  flashRadius, nearestVisibleMob, fireAtFirstHit,
} from "./magic/spell-targeting";
import { spawnFieldEffect, layTemporaryTile } from "./magic/field-effects";
import { summonAlly, isAlly } from "./magic/summons";
import { AiState } from "./ai-types";
import { playSpellFail, SPELL_SOUND } from "./juice/juice-spells";
import { applyCorrosion } from "./magic/corrosion";
import { scheduleDelayed } from "./magic/delayed-events";
import { positionTurnsAgo, positionHistory } from "./magic/position-history";
import { addMimicCurse, spawnAnchor } from "./magic/forced-movement";
import { applyFracture } from "./magic/fracture";

/** See ../spells.md for the full roster and completion checklist this file implements. */

export interface SpellDef {
  readonly key: string;
  readonly name: string;
  readonly cost: number;
  readonly category: string;
  /** Casts the spell. Returns whether a turn was consumed (i.e. the cast actually happened, vs. being cancelled). */
  readonly cast: (game: Game, viewport: Viewport) => Promise<boolean>;
  /** This spell's own unique sound (see ./juice-spells.ts's `SPELL_SOUND`), played once by {@link openSpellMenu} (or ./items.ts's `castSpellFree`) after a successful cast. */
  readonly sound: () => void;
}

const BEAM_RANGE = 12;

/** Spends `cost` mana, playing a fail cue and returning `false` when unaffordable. The spell's own sound (not a generic one) plays separately, once the cast actually succeeds — see {@link SpellDef.sound}. */
function pay(game: Game, cost: number): boolean {
  if (!spendMana(game, cost)) { playSpellFail(); return false; }
  return true;
}

/** The nearest hostile mob to the player within `radius`, or `null`. Every auto-target single-target spell uses this. */
function autoTarget(game: Game, radius = BEAM_RANGE): Mob | null {
  return nearestVisibleMob(game, game.player, game.player, radius);
}

// ---------------------------------------------------------------------------
// Offensive / Damage Spells
// ---------------------------------------------------------------------------

async function castFireball(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "fireball which direction?");
  if (!delta) return false;
  if (!pay(game, 15)) return false;

  const path = await animateProjectile(game, viewport, game.player, delta, { glyph: "*", color: "#f80" });
  const impact = path.length > 0 ? path[path.length - 1] : game.player;
  await flashRadius(game, viewport, impact, 2, "#", "#f60");
  for (const mob of mobsInRadius(game, impact, 2)) dealSpellDamage(game, game.player, mob, 12, "burned");
  return true;
}

async function castLightningBolt(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "lightning bolt which direction?");
  if (!delta) return false;
  if (!pay(game, 12)) return false;

  const hit = await fireAtFirstHit(game, viewport, delta, "!", "#8cf");
  if (!hit) return true;
  dealSpellDamage(game, game.player, hit, 14, "shocked");

  const chained = mobsInRadius(game, hit, 3, hit).find((m) => m !== hit);
  if (chained && Math.random() < 0.3) {
    await flashRadius(game, viewport, chained, 0, "!", "#8cf", 100);
    dealSpellDamage(game, game.player, chained, 7, "shocked");
  }
  return true;
}

async function castIceShard(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "ice shard which direction?");
  if (!delta) return false;
  if (!pay(game, 10)) return false;

  const hit = await fireAtFirstHit(game, viewport, delta, "*", "#0ff");
  if (!hit) return true;
  dealSpellDamage(game, game.player, hit, 8, "chilled");
  addStatus(hit, StatusKind.Slow, 4);
  return true;
}

async function castPoisonCloud(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 8, "poison cloud where?");
  if (!target) return false;
  if (!pay(game, 16)) return false;

  await flashRadius(game, viewport, target, 2, "%", "#3c3");
  spawnFieldEffect(game, {
    pos: target, radius: 2, turnsLeft: 6, glyph: "%", color: "#3a3",
    caster: game.player, dmgPerTurn: 3, verb: "poisoned",
  });
  return true;
}

async function castMeteorStrike(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 10, "meteor strike where?");
  if (!target) return false;
  if (!pay(game, 25)) return false;

  game.log.msg("the sky darkens...");
  spawnFieldEffect(game, {
    pos: target, radius: 3, turnsLeft: 2, glyph: "^", color: "#f33",
    caster: game.player, dmgPerTurn: 30, verb: "crushed", armAfter: 1,
  });
  return true;
}

async function castChainLightning(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "chain lightning which direction?");
  if (!delta) return false;
  if (!pay(game, 20)) return false;

  const hit = await fireAtFirstHit(game, viewport, delta, "!", "#ccf");
  if (!hit) return true;

  let dmg = 12;
  let current: Mob = hit;
  const seen = new Set<Mob>([current]);
  for (let bounce = 0; bounce < 4; bounce++) {
    dealSpellDamage(game, game.player, current, dmg, "electrocuted");
    const next = mobsInRadius(game, current, 4).find((m) => !seen.has(m));
    if (!next) break;
    await flashRadius(game, viewport, next, 0, "!", "#ccf", 90);
    seen.add(next);
    current = next;
    dmg = Math.max(2, Math.round(dmg * 0.65));
  }
  return true;
}

async function castArcaneMissile(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 8)) return false;

  await animateProjectile(game, viewport, game.player,
    { x: Math.sign(target.x - game.player.x) || 1, y: Math.sign(target.y - game.player.y) },
    { glyph: "o", color: "#fd0", maxSteps: 1, stepMs: 30 });
  dealSpellDamage(game, game.player, target, 6, "struck");
  return true;
}

async function castVoidBeam(game: Game, viewport: Viewport): Promise<boolean> {
  viewport.draw(game); // in case we got here from a full-screen menu (e.g. items.ts's useItem).
  viewport.drawMessageRows("channel how long? 1/2/3   [[ESC]] cancel");
  const key = (await inputKey()).key;
  const tier = key === "1" ? 1 : key === "2" ? 2 : key === "3" ? 3 : 0;
  if (tier === 0) { viewport.draw(game); return false; }
  const cost = 8 * tier;
  if (!pay(game, cost)) return false;

  const delta = await promptDirection(game, viewport, "void beam which direction?");
  if (!delta) return true; // mana already spent channeling; direction fumbled, spell fizzles.

  const hitMobs: Mob[] = [];
  await animateProjectile(game, viewport, game.player, delta, {
    glyph: "0", color: "#a0f", stopOnMob: false,
    onStep: (pos, mob) => { if (mob) hitMobs.push(mob); },
  });
  for (const mob of hitMobs) dealSpellDamage(game, game.player, mob, 10 * tier, "unmade");
  return true;
}

async function castShadowSpike(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 11)) return false;

  await flashRadius(game, viewport, target, 1, "^", "#818");
  dealSpellDamage(game, game.player, target, 13, "impaled");
  return true;
}

async function castFrostNova(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 14)) return false;
  await flashRadius(game, viewport, game.player, 2, "*", "#0ff");
  for (const mob of mobsInRadius(game, game.player, 2, game.player)) {
    dealSpellDamage(game, game.player, mob, 6, "frozen");
    addStatus(mob, StatusKind.Freeze, 2);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Crowd Control
// ---------------------------------------------------------------------------

async function castStunBolt(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "stun bolt which direction?");
  if (!delta) return false;
  if (!pay(game, 10)) return false;

  const hit = await fireAtFirstHit(game, viewport, delta, "!", "#ff0");
  if (!hit) return true;
  dealSpellDamage(game, game.player, hit, 3, "jolted");
  addStatus(hit, StatusKind.Stun, 2);
  return true;
}

async function castRoot(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "root which direction?");
  if (!delta) return false;
  if (!pay(game, 9)) return false;

  const hit = await fireAtFirstHit(game, viewport, delta, "&", "#4a2");
  if (!hit) return true;
  addStatus(hit, StatusKind.Root, 4);
  game.log.msg(`vines grip ${hit.name}`);
  return true;
}

async function castKnockbackBlast(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "knockback which direction?");
  if (!delta) return false;
  if (!pay(game, 11)) return false;

  const hits: Mob[] = [];
  await animateProjectile(game, viewport, game.player, delta, {
    glyph: "=", color: "#fa5", stopOnMob: false,
    onStep: (pos, mob) => { if (mob) hits.push(mob); },
  });
  for (const mob of hits) {
    dealSpellDamage(game, game.player, mob, 4, "blasted");
    for (let i = 0; i < 3; i++) {
      const dest: Pos = { x: mob.x + delta.x, y: mob.y + delta.y };
      if (!game.curMap().inBounds(dest) || game.curMap().get(dest) === Tile.Wall) break;
      if (game.curMap().Q.mobs.some((m) => m !== mob && m.x === dest.x && m.y === dest.y)) break;
      mob.x = dest.x; mob.y = dest.y;
    }
  }
  return true;
}

async function castGravityWell(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 8, "gravity well where?");
  if (!target) return false;
  if (!pay(game, 18)) return false;

  spawnFieldEffect(game, {
    pos: target, radius: 5, turnsLeft: 4, glyph: "o", color: "#619",
    caster: game.player, dmgPerTurn: 0, verb: "", pull: 1,
  });
  return true;
}

async function castSleepSpell(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 13)) return false;

  addStatus(target, StatusKind.SleepCc, 999);
  game.log.msg(`${target.name} falls into a magical slumber`);
  return true;
}

async function castSilence(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 9)) return false;

  addStatus(target, StatusKind.Silence, 6);
  game.log.msg(`${target.name} is silenced`);
  return true;
}

/** Original {name, tile} for currently-polymorphed mobs, so a re-cast (or the scheduled revert below) always restores the true original form rather than the critter shape. */
const polymorphed = new WeakMap<Mob, { name: string; tile: T_Tile }>();
const POLYMORPH_DURATION = 8;

async function castPolymorph(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 17)) return false;

  addStatus(target, StatusKind.Weaken, POLYMORPH_DURATION, 0.95);

  if (polymorphed.has(target)) {
    game.log.msg(`the critter's transformation is renewed`);
    return true;
  }

  const original = { name: target.name, tile: target.t };
  polymorphed.set(target, original);
  game.log.msg(`arcane light engulfs ${original.name}`);
  target.name = "harmless critter";
  target.t = Tile.Ant;
  game.log.msg(`${original.name} shrinks down into a harmless critter — its attacks are now nearly powerless`);

  scheduleDelayed(game, POLYMORPH_DURATION, (g) => {
    const stillPolymorphed = polymorphed.get(target);
    polymorphed.delete(target);
    if (!stillPolymorphed || !g.curMap().Q.mobs.includes(target)) return; // died, or was already reverted, while transformed.
    target.name = stillPolymorphed.name;
    target.t = stillPolymorphed.tile;
    g.log.msg(`the critter reverts back into ${stillPolymorphed.name}`);
  });
  return true;
}

async function castTimeSlow(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 8, "time slow where?");
  if (!target) return false;
  if (!pay(game, 16)) return false;

  await flashRadius(game, viewport, target, 3, "~", "#88f");
  for (const mob of mobsInRadius(game, target, 3)) addStatus(mob, StatusKind.Slow, 6);
  return true;
}

// ---------------------------------------------------------------------------
// Defensive Spells
// ---------------------------------------------------------------------------

async function castShield(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 12)) return false;
  addStatus(game.player, StatusKind.Shield, 20, 25);
  game.log.msg("a shimmering shield surrounds you");
  return true;
}

async function castBarrierWall(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "barrier wall which direction?");
  if (!delta) return false;
  if (!pay(game, 14)) return false;

  const perp: Pos = { x: -delta.y, y: delta.x };
  const center: Pos = { x: game.player.x + delta.x, y: game.player.y + delta.y };
  for (const off of [-1, 0, 1]) {
    const p: Pos = { x: center.x + perp.x * off, y: center.y + perp.y * off };
    if (game.curMap().inBounds(p)) layTemporaryTile(game, p, Tile.Wall, 8);
  }
  game.log.msg("a wall of force rises");
  return true;
}

async function castReflect(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 14)) return false;
  addStatus(game.player, StatusKind.Reflect, 8, 0.5);
  game.log.msg("your skin turns to mirrors");
  return true;
}

async function castInvisibility(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 16)) return false;
  addStatus(game.player, StatusKind.Invisible, 10);
  game.log.msg("you fade from sight");
  return true;
}

async function castHealingAura(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 15)) return false;
  addStatus(game.player, StatusKind.Regen, 8, 4);
  game.log.msg("a warm aura settles over you");
  return true;
}

async function castCleanse(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 8)) return false;
  cleanseNegative(game.player);
  game.log.msg("you feel purified");
  return true;
}

async function castDamageReductionWard(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 13)) return false;
  addStatus(game.player, StatusKind.DamageReduction, 10, 0.4);
  game.log.msg("your ward hardens your skin");
  return true;
}

async function castBlink(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "blink which direction?");
  if (!delta) return false;
  if (!pay(game, 7)) return false;

  const path = await animateProjectile(game, viewport, game.player, delta, {
    glyph: "@", color: "#fff", maxSteps: 5, stepMs: 20, stopOnMob: true,
  });
  const landing = [...path].reverse().find((p) => !game.curMap().Q.mobs.some((m) => m.x === p.x && m.y === p.y));
  if (landing) { game.player.x = landing.x; game.player.y = landing.y; }
  return true;
}

// ---------------------------------------------------------------------------
// Utility / Movement
// ---------------------------------------------------------------------------

async function castHaste(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 14)) return false;
  addStatus(game.player, StatusKind.Haste, 6);
  game.log.msg("your limbs blur with speed");
  return true;
}

async function castLevitate(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 10)) return false;
  addStatus(game.player, StatusKind.Levitate, 10);
  game.log.msg("you rise off the ground");
  return true;
}

async function castLight(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 6)) return false;
  await flashRadius(game, viewport, game.player, 4, ".", "#ff8");
  let roused = 0;
  for (const mob of mobsInRadius(game, game.player, 5, game.player)) {
    if (mob.ai?.state === AiState.Ambush) { mob.ai.state = AiState.Hunt; roused++; }
  }
  game.log.msg(roused > 0 ? `the light exposes ${roused} lurking foe(s)` : "the area is lit");
  return true;
}

async function castDetectEnemies(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 6)) return false;
  const found = mobsInRadius(game, game.player, 20, game.player);
  game.log.msg(found.length > 0 ? `you sense ${found.length} enemy(s) nearby` : "you sense nothing nearby");
  return true;
}

const portalWaypoints = new WeakMap<Game, Pos>();

async function castSummonPortal(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 12)) return false;
  const existing = portalWaypoints.get(game);
  if (existing) {
    portalWaypoints.delete(game);
    const from: Pos = { x: game.player.x, y: game.player.y };
    game.player.x = existing.x;
    game.player.y = existing.y;
    game.log.msg("you step through the portal");
    void from;
  } else {
    portalWaypoints.set(game, { x: game.player.x, y: game.player.y });
    game.log.msg("a portal anchor shimmers here; cast again elsewhere to step through");
  }
  return true;
}

async function castWaterwalk(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 8)) return false;
  addStatus(game.player, StatusKind.Waterwalk, 12);
  game.log.msg("your feet no longer sink");
  return true;
}

// ---------------------------------------------------------------------------
// Summoning
// ---------------------------------------------------------------------------

async function castSummonSkeleton(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 20)) return false;
  const ally = summonAlly(game, "skeleton", Tile.Dog, 30, 5, 40);
  game.log.msg(ally ? "a skeleton claws its way up to serve you" : "there's no room to summon here");
  return true;
}

async function castSummonSwarm(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 15)) return false;
  let count = 0;
  for (let i = 0; i < 3; i++) if (summonAlly(game, "swarmling", Tile.Ant, 4, 1, 20)) count++;
  game.log.msg(count > 0 ? `${count} swarmling(s) skitter to your side` : "there's no room to summon here");
  return true;
}

async function castElementalFamiliar(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 22)) return false;
  const ally = summonAlly(game, "elemental familiar", Tile.Imp, 18, 4, Infinity);
  game.log.msg(ally ? "an elemental familiar binds itself to you" : "there's no room to summon here");
  return true;
}

async function castNecroticReanimation(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 20)) return false;

  const finishingBlow = Math.max(target.hp, 1);
  const stats = { name: target.name, dmg: Math.max(1, Math.round(target.dmg / 2)), hp: Math.max(1, Math.round(target.maxhp / 2)), t: target.t };
  target.hp -= finishingBlow;
  game.log.msg(`${target.name} collapses, its corpse rising under your will`);
  game.curMap().Q.remove(target);
  const raised = summonAlly(game, `undead ${stats.name}`, stats.t, stats.hp, stats.dmg, 30);
  return true;
}

async function castArmyOfTheDead(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 45)) return false;
  let count = 0;
  for (let i = 0; i < 5; i++) if (summonAlly(game, "risen soldier", Tile.Orc, 22, 6, 25)) count++;
  game.log.msg(count > 0 ? `an army of ${count} rises from the ground` : "there's no room to summon here");
  return true;
}

// ---------------------------------------------------------------------------
// Environmental / Terrain
// ---------------------------------------------------------------------------

async function castEarthquake(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 22)) return false;
  await flashRadius(game, viewport, game.player, 4, "#", "#a52");
  for (const mob of mobsInRadius(game, game.player, 4, game.player)) {
    dealSpellDamage(game, game.player, mob, 10, "staggered");
    addStatus(mob, StatusKind.Stun, 1);
  }
  return true;
}

async function castFlameWall(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "flame wall which direction?");
  if (!delta) return false;
  if (!pay(game, 16)) return false;

  const perp: Pos = { x: -delta.y, y: delta.x };
  const center: Pos = { x: game.player.x + delta.x * 2, y: game.player.y + delta.y * 2 };
  for (const off of [-1, 0, 1]) {
    const p: Pos = { x: center.x + perp.x * off, y: center.y + perp.y * off };
    if (!game.curMap().inBounds(p)) continue;
    spawnFieldEffect(game, {
      pos: p, radius: 0, turnsLeft: 6, glyph: "^", color: "#f60",
      caster: game.player, dmgPerTurn: 5, verb: "burned",
    });
  }
  return true;
}

async function castIcePlatform(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "ice platform which direction?");
  if (!delta) return false;
  if (!pay(game, 10)) return false;

  for (let i = 1; i <= 4; i++) {
    const p: Pos = { x: game.player.x + delta.x * i, y: game.player.y + delta.y * i };
    if (!game.curMap().inBounds(p)) break;
    layTemporaryTile(game, p, Tile.Floor, 10);
  }
  game.log.msg("a bridge of ice forms");
  return true;
}

async function castWebTrap(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 6, "web trap where?");
  if (!target) return false;
  if (!pay(game, 11)) return false;

  spawnFieldEffect(game, {
    pos: target, radius: 1, turnsLeft: 10, glyph: "\"", color: "#eee",
    caster: game.player, dmgPerTurn: 1, verb: "entangled",
    statusOnTick: { kind: StatusKind.Root, turns: 2, magnitude: 0 },
  });
  return true;
}

async function castSpikeTrap(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 6, "spike trap where?");
  if (!target) return false;
  if (!pay(game, 13)) return false;

  spawnFieldEffect(game, {
    pos: target, radius: 1, turnsLeft: 1, glyph: "^", color: "#ccc",
    caster: game.player, dmgPerTurn: 18, verb: "impaled",
  });
  return true;
}

// ---------------------------------------------------------------------------
// Buff / Debuff
// ---------------------------------------------------------------------------

async function castWeaken(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 9)) return false;
  addStatus(target, StatusKind.Weaken, 6, 0.4);
  game.log.msg(`${target.name} weakens`);
  return true;
}

async function castArmorBreak(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 9)) return false;
  addStatus(target, StatusKind.ArmorBreak, 6, 0.4);
  game.log.msg(`${target.name}'s defenses crack`);
  return true;
}

async function castMarkForDeath(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 12)) return false;
  addStatus(target, StatusKind.Mark, 8, 0.5);
  game.log.msg(`${target.name} is marked for death`);
  return true;
}

async function castEmpower(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 10)) return false;
  addStatus(game.player, StatusKind.Empower, 10, 10);
  game.log.msg("your next strike crackles with power");
  return true;
}

async function castCurse(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 13)) return false;
  addStatus(target, StatusKind.Curse, 6, 4);
  addStatus(target, StatusKind.Weaken, 6, 0.25);
  game.log.msg(`a curse settles over ${target.name}`);
  return true;
}

// ---------------------------------------------------------------------------
// Ultimate / High-Cost Spells
// ---------------------------------------------------------------------------

async function castBlizzard(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 10, "blizzard where?");
  if (!target) return false;
  if (!pay(game, 40)) return false;

  await flashRadius(game, viewport, target, 4, "*", "#0ff");
  spawnFieldEffect(game, {
    pos: target, radius: 4, turnsLeft: 6, glyph: "*", color: "#0af",
    caster: game.player, dmgPerTurn: 6, verb: "frozen",
    statusOnTick: { kind: StatusKind.Slow, turns: 2, magnitude: 0 },
  });
  return true;
}

async function castBlackHole(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 10, "black hole where?");
  if (!target) return false;
  if (!pay(game, 45)) return false;

  await flashRadius(game, viewport, target, 5, "@", "#204");
  spawnFieldEffect(game, {
    pos: target, radius: 5, turnsLeft: 5, glyph: "@", color: "#408",
    caster: game.player, dmgPerTurn: 8, verb: "crushed", pull: 1,
  });
  return true;
}

async function castDivineJudgment(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game, 20);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 50)) return false;

  await flashRadius(game, viewport, target, 1, "|", "#ffd");
  dealSpellDamage(game, game.player, target, 60, "smote");
  return true;
}

async function castTimeStop(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 55)) return false;
  await flashRadius(game, viewport, game.player, 30, ".", "#fff", 120);
  let count = 0;
  for (const mob of game.curMap().Q.mobs) {
    if (isPly(mob)) continue;
    addStatus(mob, StatusKind.Stun, 3);
    count++;
  }
  game.log.msg(`time freezes around ${count} creature(s)`);
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Offensive / Damage
// ---------------------------------------------------------------------------

async function castPrismLance(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "prism lance which direction?");
  if (!delta) return false;
  if (!pay(game, 14)) return false;

  const hits: Mob[] = [];
  const path = await animateProjectile(game, viewport, game.player, delta, {
    glyph: "/", color: "#f6f", stopOnMob: false, maxSteps: BEAM_RANGE,
    onStep: (_pos, mob) => { if (mob) hits.push(mob); },
  });
  for (const mob of hits) dealSpellDamage(game, game.player, mob, 10, "pierced");

  if (path.length > 0 && path.length < BEAM_RANGE) {
    const impact = path[path.length - 1];
    const perp: Pos = { x: -delta.y, y: delta.x };
    for (const splitDelta of [perp, { x: -perp.x, y: -perp.y }, delta]) {
      await animateProjectile(game, viewport, impact, splitDelta, {
        glyph: "/", color: "#f6f", maxSteps: 5, stepMs: 25, stopOnMob: false,
        onStep: (_pos, mob) => { if (mob) dealSpellDamage(game, game.player, mob, 6, "pierced"); },
      });
    }
  }
  return true;
}

async function castCorrosiveSpit(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 12)) return false;

  dealSpellDamage(game, game.player, target, 4, "spat on");
  applyCorrosion(target, 2);
  game.log.msg(`${target.name}'s armor corrodes`);
  return true;
}

async function castEchoStrike(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 13)) return false;

  const dmg = 10;
  dealSpellDamage(game, game.player, target, dmg, "struck");
  scheduleDelayed(game, 2, (g) => {
    if (g.curMap().Q.mobs.includes(target)) dealSpellDamage(g, g.player, target, Math.round(dmg * 0.5), "echoed");
  });
  return true;
}

async function castGravitySpear(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "gravity spear which direction?");
  if (!delta) return false;
  if (!pay(game, 15)) return false;

  let hit: Mob | null = null;
  let steps = 0;
  await animateProjectile(game, viewport, game.player, delta, {
    glyph: "^", color: "#864",
    onStep: (_pos, mob) => { steps++; if (mob) { hit = mob; return true; } },
  });
  if (hit) dealSpellDamage(game, game.player, hit, 6 + steps * 3, "impaled");
  return true;
}

async function castBloodTithe(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 10)) return false;

  const missing = game.player.maxhp - game.player.hp;
  dealSpellDamage(game, game.player, target, 8 + Math.round(missing * 0.5), "tithed");
  return true;
}

async function castStaticSkin(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 12)) return false;
  addStatus(game.player, StatusKind.StaticSkin, 10, 4);
  game.log.msg("your skin crackles with static");
  return true;
}

async function castCinderRain(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 9, "cinder rain where?");
  if (!target) return false;
  if (!pay(game, 17)) return false;

  game.log.msg("embers gather overhead...");
  scheduleDelayed(game, 2, async (g) => {
    await flashRadius(g, viewport, target, 3, "*", "#f80");
    for (const mob of mobsInRadius(g, target, 3)) dealSpellDamage(g, g.player, mob, 9, "singed");
  });
  return true;
}

async function castWhisperOfMadness(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 13)) return false;

  dealSpellDamage(game, game.player, target, 9, "unsettled");
  addStatus(target, StatusKind.Confuse, 5);
  game.log.msg(`${target.name}'s mind reels`);
  return true;
}

async function castRustTouch(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game, 2);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 11)) return false;

  removeStatus(target, StatusKind.Shield);
  removeStatus(target, StatusKind.Reflect);
  removeStatus(target, StatusKind.DamageReduction);
  applyCorrosion(target, 3);
  dealSpellDamage(game, game.player, target, 10, "rusted");
  return true;
}

async function castStarfallLance(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "starfall lance which direction?");
  if (!delta) return false;
  if (!pay(game, 24)) return false;

  const hits: Mob[] = [];
  await animateProjectile(game, viewport, game.player, delta, {
    glyph: "|", color: "#ffd", stopOnMob: false, maxSteps: BEAM_RANGE,
    onStep: (_pos, mob) => { if (mob) hits.push(mob); },
  });
  for (const mob of hits) dealSpellDamage(game, game.player, mob, 22, "obliterated");
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Crowd Control
// ---------------------------------------------------------------------------

async function castPaperSkin(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 8)) return false;
  addStatus(target, StatusKind.CritNext, 6, 1);
  game.log.msg(`${target.name}'s guard is shattered`);
  return true;
}

async function castTarPool(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 8, "tar pool where?");
  if (!target) return false;
  if (!pay(game, 12)) return false;

  spawnFieldEffect(game, {
    pos: target, radius: 2, turnsLeft: 8, glyph: "~", color: "#432",
    caster: game.player, dmgPerTurn: 0, verb: "",
    statusOnTick: { kind: StatusKind.Tarred, turns: 2, magnitude: 0 },
  });
  return true;
}

async function castMimicCurse(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 14)) return false;
  addMimicCurse(target, 5);
  game.log.msg(`${target.name} is bound to mimic your steps`);
  return true;
}

async function castFearWard(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 13)) return false;
  await flashRadius(game, viewport, game.player, 4, "!", "#fd0");
  for (const mob of mobsInRadius(game, game.player, 4, game.player)) {
    const dx = Math.sign(mob.x - game.player.x) || 1;
    const dy = Math.sign(mob.y - game.player.y);
    for (let i = 0; i < 2; i++) {
      const dest: Pos = { x: mob.x + dx, y: mob.y + dy };
      if (!game.curMap().inBounds(dest) || game.curMap().get(dest) === Tile.Wall) break;
      if (game.curMap().Q.mobs.some((m) => m !== mob && m.x === dest.x && m.y === dest.y)) break;
      mob.x = dest.x; mob.y = dest.y;
    }
  }
  game.log.msg("a wave of dread pushes enemies back");
  return true;
}

async function castAnchorChain(game: Game, viewport: Viewport): Promise<boolean> {
  const found = mobsInRadius(game, game.player, BEAM_RANGE).filter((m) => m !== game.player);
  if (found.length < 2) { game.log.msg("not enough targets in range"); return false; }
  if (!pay(game, 16)) return false;

  const [a, b] = found;
  spawnAnchor(a, b, 8, 4);
  game.log.msg(`chains bind ${a.name} and ${b.name}`);
  return true;
}

async function castFeedbackLoop(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 12)) return false;
  addStatus(game.player, StatusKind.FeedbackLoop, 8);
  game.log.msg("crowd control will bounce off you");
  return true;
}

async function castDazzleFlash(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "dazzle flash facing which direction?");
  if (!delta) return false;
  if (!pay(game, 11)) return false;

  await flashRadius(game, viewport, game.player, 4, "*", "#ff8");
  let count = 0;
  for (const mob of mobsInRadius(game, game.player, 4, game.player)) {
    const vx = mob.x - game.player.x, vy = mob.y - game.player.y;
    if (vx * delta.x + vy * delta.y > 0) { addStatus(mob, StatusKind.Blind, 4); count++; }
  }
  game.log.msg(count > 0 ? `${count} foe(s) are dazzled` : "the flash catches no one");
  return true;
}

async function castPuppetString(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 9)) return false;

  const delta = await promptDirection(game, viewport, "force them which direction?");
  if (!delta) return true; // mana already spent; the puppetry fumbles.

  const dest: Pos = { x: target.x + delta.x, y: target.y + delta.y };
  if (game.curMap().inBounds(dest) && game.curMap().get(dest) !== Tile.Wall &&
      !game.curMap().Q.mobs.some((m) => m !== target && m.x === dest.x && m.y === dest.y)) {
    target.x = dest.x; target.y = dest.y;
    game.log.msg(`${target.name} is forced to step`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Defensive
// ---------------------------------------------------------------------------

async function castMirrorSkin(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 15)) return false;
  const decoy = summonAlly(game, "mirror decoy", Tile.Loon, 10, 0, 8);
  game.log.msg(decoy ? "a decoy mirroring your form appears" : "there's no room for a decoy here");
  return true;
}

const absorbing = new WeakSet<Game>();

async function castAbsorbRelease(game: Game, viewport: Viewport): Promise<boolean> {
  if (absorbing.has(game)) {
    const stored = getStatus(game.player, StatusKind.AbsorbStore);
    const burst = stored?.magnitude ?? 0;
    removeStatus(game.player, StatusKind.AbsorbStore);
    absorbing.delete(game);
    if (burst <= 0) { game.log.msg("you release... nothing"); return true; }
    await flashRadius(game, viewport, game.player, 2, "@", "#fd0");
    for (const mob of mobsInRadius(game, game.player, 2, game.player)) dealSpellDamage(game, game.player, mob, burst, "blasted");
    game.log.msg(`you unleash ${burst} stored damage`);
    return true;
  }
  if (!pay(game, 10)) return false;
  addStatus(game.player, StatusKind.AbsorbStore, 12, 0);
  absorbing.add(game);
  game.log.msg("you brace, absorbing incoming blows — cast again to release");
  return true;
}

async function castPhaseStep(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 9)) return false;
  addStatus(game.player, StatusKind.Intangible, 3);
  game.log.msg("you turn ephemeral for a heartbeat");
  return true;
}

async function castThornedWard(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 11)) return false;
  addStatus(game.player, StatusKind.Thorns, 10, 5);
  game.log.msg("thorns wreathe your skin");
  return true;
}

async function castSecondWind(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 18)) return false;
  addStatus(game.player, StatusKind.SecondWind, 40);
  game.log.msg("you feel death loosen its grip, for now");
  return true;
}

async function castSanctuaryCircle(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 16)) return false;
  await flashRadius(game, viewport, game.player, 3, "o", "#adf");
  spawnFieldEffect(game, {
    pos: { x: game.player.x, y: game.player.y }, radius: 3, turnsLeft: 8, glyph: "o", color: "#8cf",
    caster: game.player, dmgPerTurn: 0, verb: "",
    statusOnTick: { kind: StatusKind.CritImmune, turns: 2, magnitude: 0 },
  });
  return true;
}

async function castNullField(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 8, "null field where?");
  if (!target) return false;
  if (!pay(game, 20)) return false;

  await flashRadius(game, viewport, target, 3, "0", "#888");
  spawnFieldEffect(game, {
    pos: target, radius: 3, turnsLeft: 6, glyph: "0", color: "#666",
    caster: game.player, dmgPerTurn: 0, verb: "",
    statusOnTick: { kind: StatusKind.Silence, turns: 2, magnitude: 0 },
  });
  game.log.msg("magic itself falls silent here — yours included, if you linger");
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Utility / Movement
// ---------------------------------------------------------------------------

async function castBacktrack(game: Game, viewport: Viewport): Promise<boolean> {
  const past = positionTurnsAgo(game.player, 3);
  if (!past) { game.log.msg("not enough of a past to return to"); return false; }
  if (!pay(game, 10)) return false;

  if (!game.curMap().Q.mobs.some((m) => m !== game.player && m.x === past.x && m.y === past.y)) {
    game.player.x = past.x; game.player.y = past.y;
    game.log.msg("you snap back to where you stood");
  } else {
    game.log.msg("that spot is occupied now — the spell fizzles");
  }
  return true;
}

async function castScentless(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 8)) return false;
  addStatus(game.player, StatusKind.Scentless, 12);
  game.log.msg("your scent and presence fade from notice");
  return true;
}

async function castGrappleHook(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "grapple which direction?");
  if (!delta) return false;
  if (!pay(game, 9)) return false;

  const path = await animateProjectile(game, viewport, game.player, delta, {
    glyph: "=", color: "#aa8", maxSteps: 10, stepMs: 20, stopOnMob: true,
  });
  const landing = [...path].reverse().find((p) => !game.curMap().Q.mobs.some((m) => m.x === p.x && m.y === p.y));
  if (landing) { game.player.x = landing.x; game.player.y = landing.y; }
  return true;
}

async function castFeatherfall(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 6)) return false;
  addStatus(game.player, StatusKind.Featherfall, 15);
  game.log.msg("you feel light as a feather");
  return true;
}

async function castMappersEye(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 9)) return false;
  await flashRadius(game, viewport, game.player, 6, ".", "#8f8");
  const enemies = mobsInRadius(game, game.player, 6, game.player).length;
  const items = game.curMap().objs.filter((o) => {
    const dx = o.x - game.player.x, dy = o.y - game.player.y;
    return dx * dx + dy * dy <= 36;
  }).length;
  game.log.msg(`you sense ${enemies} foe(s) and ${items} item(s) nearby`);
  return true;
}

async function castBorrowedTime(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 10)) return false;
  addStatus(game.player, StatusKind.Haste, 1);
  game.log.msg("you seize a fleeting extra instant — but you'll pay for it");
  scheduleDelayed(game, 1, (g) => {
    addStatus(g.player, StatusKind.Slow, 6);
    g.log.msg("the borrowed time comes due; you feel sluggish");
  });
  return true;
}

async function castSplitPath(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 11)) return false;
  const decoy = summonAlly(game, "illusory path", Tile.Moth, 1, 0, 6);
  game.log.msg(decoy ? "a phantom path forks behind you, confusing pursuers" : "there's nowhere to conjure the illusion");
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Summoning
// ---------------------------------------------------------------------------

async function castSwarmMother(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 24)) return false;
  const mother = summonAlly(game, "swarm mother", Tile.Wasp, 26, 3, 30);
  if (mother) {
    scheduleDelayed(game, 4, function birth(g: Game) {
      if (!g.curMap().Q.mobs.includes(mother)) return;
      summonAlly(g, "swarmling", Tile.Ant, 4, 1, 15);
      scheduleDelayed(g, 4, birth);
    });
  }
  game.log.msg(mother ? "a swarm mother settles in to breed" : "there's no room to summon here");
  return true;
}

async function castBoundBlade(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 16)) return false;
  const blade = summonAlly(game, "bound blade", Tile.Jay, 8, 9, 20);
  if (blade) {
    let lastHp = game.player.hp;
    scheduleDelayed(game, 1, function watch(g: Game) {
      if (!g.curMap().Q.mobs.includes(blade)) return;
      if (g.player.hp < lastHp) { g.curMap().Q.remove(blade); g.log.msg("the bound blade shatters as you take damage"); return; }
      lastHp = g.player.hp;
      scheduleDelayed(g, 1, watch);
    });
  }
  game.log.msg(blade ? "a spectral blade takes up the fight beside you" : "there's no room to summon here");
  return true;
}

async function castMirrorTwin(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 20)) return false;
  const twin = summonAlly(game, "mirror twin", Tile.Koi, game.player.maxhp, Math.max(1, Math.round(game.player.dmg / 2)), 15);
  game.log.msg(twin ? "a twin of yourself splits off to fight" : "there's no room to summon here");
  return true;
}

async function castVulturePact(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 14)) return false;
  const vulture = summonAlly(game, "vulture", Tile.Bat, 10, 3, Infinity);
  if (vulture) {
    scheduleDelayed(game, 5, function grow(g: Game) {
      if (!g.curMap().Q.mobs.includes(vulture)) return;
      vulture.dmg += 1; vulture.maxhp += 2; vulture.hp += 2;
      scheduleDelayed(g, 5, grow);
    });
  }
  game.log.msg(vulture ? "a vulture circles, waiting to feast" : "there's no room to summon here");
  return true;
}

async function castLivingArmor(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 18)) return false;
  addStatus(game.player, StatusKind.Shield, 15, 30);
  addStatus(game.player, StatusKind.DamageReduction, 15, 0.2);
  game.log.msg("animated armor clanks into place around you");
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Environmental / Terrain
// ---------------------------------------------------------------------------

async function castShiftingSands(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 8, "shifting sands where?");
  if (!target) return false;
  if (!pay(game, 13)) return false;

  spawnFieldEffect(game, {
    pos: target, radius: 2, turnsLeft: 8, glyph: "~", color: "#eb5",
    caster: game.player, dmgPerTurn: 2, verb: "sinking",
    statusOnTick: { kind: StatusKind.Root, turns: 1, magnitude: 0 },
  });
  return true;
}

async function castOvergrowth(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "overgrowth which direction?");
  if (!delta) return false;
  if (!pay(game, 12)) return false;

  const perp: Pos = { x: -delta.y, y: delta.x };
  const center: Pos = { x: game.player.x + delta.x * 2, y: game.player.y + delta.y * 2 };
  for (const off of [-1, 0, 1]) {
    const p: Pos = { x: center.x + perp.x * off, y: center.y + perp.y * off };
    if (game.curMap().inBounds(p)) layTemporaryTile(game, p, Tile.Wall, 12);
  }
  game.log.msg("thick growth rises, blocking sight");
  return true;
}

async function castMagneticField(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 12)) return false;
  addStatus(game.player, StatusKind.DamageReduction, 8, 0.25);
  game.log.msg("metal warps away from you in a magnetic haze");
  return true;
}

async function castMirrorFloor(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 14)) return false;
  addStatus(game.player, StatusKind.Reflect, 10, 0.6);
  game.log.msg("the ground beneath you turns to mirrored glass");
  return true;
}

async function castCollapsingCeiling(game: Game, viewport: Viewport): Promise<boolean> {
  const target = await pickGroundTarget(game, viewport, 9, "collapsing ceiling where?");
  if (!target) return false;
  if (!pay(game, 18)) return false;

  game.log.msg("the ceiling groans overhead...");
  scheduleDelayed(game, 2, async (g) => {
    await flashRadius(g, viewport, target, 2, "#", "#996");
    for (const mob of mobsInRadius(g, target, 2)) dealSpellDamage(g, g.player, mob, 20, "crushed by debris");
  });
  return true;
}

async function castBrambleBridge(game: Game, viewport: Viewport): Promise<boolean> {
  const delta = await promptDirection(game, viewport, "bramble bridge which direction?");
  if (!delta) return false;
  if (!pay(game, 9)) return false;

  for (let i = 1; i <= 5; i++) {
    const p: Pos = { x: game.player.x + delta.x * i, y: game.player.y + delta.y * i };
    if (!game.curMap().inBounds(p)) break;
    layTemporaryTile(game, p, Tile.Floor, 12);
  }
  game.log.msg("vines knit together into a bridge");
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Buff / Debuff
// ---------------------------------------------------------------------------

async function castExposedNerve(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 10)) return false;
  addStatus(target, StatusKind.ExposedNerve, 8, 0.75);
  game.log.msg(`${target.name}'s nerves lie exposed`);
  return true;
}

async function castSiphonSigil(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 12)) return false;
  addStatus(target, StatusKind.SiphonMark, 10, 0.3);
  game.log.msg(`a sigil marks ${target.name}`);
  return true;
}

async function castOverclock(game: Game, viewport: Viewport): Promise<boolean> {
  const ally = mobsInRadius(game, game.player, BEAM_RANGE, game.player).find((m) => isAlly(m));
  const targetMob = ally ?? game.player;
  if (!pay(game, 11)) return false;
  addStatus(targetMob, StatusKind.Haste, 8);
  if (targetMob === game.player) game.mana.mana = Math.max(0, game.mana.mana - 5);
  game.log.msg(targetMob === game.player
    ? "you overclock yourself, burning through mana faster"
    : `${targetMob.name} is overclocked, burning through energy faster`);
  return true;
}

async function castDoomClock(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 16)) return false;
  game.log.msg(`a countdown appears over ${target.name}'s head`);
  scheduleDelayed(game, 5, (g) => {
    if (g.curMap().Q.mobs.includes(target)) dealSpellDamage(g, g.player, target, 35, "detonated");
  });
  return true;
}

async function castFracture(game: Game, viewport: Viewport): Promise<boolean> {
  const target = autoTarget(game);
  if (!target) { game.log.msg("no target in range"); return false; }
  if (!pay(game, 13)) return false;
  applyFracture(target, 4);
  dealSpellDamage(game, game.player, target, 5, "cracked");
  game.log.msg(`${target.name} begins to fracture`);
  return true;
}

// ---------------------------------------------------------------------------
// ../spells-new.md — Ultimate / High-Cost
// ---------------------------------------------------------------------------

async function castWorldTreesBloom(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 60)) return false;
  await flashRadius(game, viewport, game.player, 8, "&", "#4f8");
  let healed = 0;
  for (const mob of mobsInRadius(game, game.player, 8, game.player)) {
    if (!isAlly(mob)) continue;
    mob.hp = mob.maxhp;
    cleanseNegative(mob);
    healed++;
  }
  game.mana.maxmana = Math.max(10, Math.round(game.mana.maxmana / 2));
  game.mana.mana = Math.min(game.mana.mana, game.mana.maxmana);
  game.log.msg(healed > 0
    ? `the world tree blooms, fully restoring ${healed} ally(s) — your reserves are forever diminished`
    : "the world tree blooms, but no allies remain to heal — your reserves are forever diminished");
  return true;
}

async function castChronoFracture(game: Game, viewport: Viewport): Promise<boolean> {
  if (!pay(game, 50)) return false;
  const echoes = positionHistory(game.player);
  if (echoes.length === 0) { game.log.msg("there is no past to echo"); return true; }

  game.log.msg("echoes of your last moments burst into being");
  for (const pos of echoes) {
    scheduleDelayed(game, 1, async (g) => {
      await flashRadius(g, viewport, pos, 1, "@", "#84f");
      for (const mob of mobsInRadius(g, pos, 1)) dealSpellDamage(g, g.player, mob, 14, "struck by an echo");
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SPELLS: readonly SpellDef[] = [
  { key: "a", name: "Fireball", cost: 15, category: "Offensive", cast: castFireball, sound: SPELL_SOUND.a },
  { key: "b", name: "Lightning Bolt", cost: 12, category: "Offensive", cast: castLightningBolt, sound: SPELL_SOUND.b },
  { key: "c", name: "Ice Shard", cost: 10, category: "Offensive", cast: castIceShard, sound: SPELL_SOUND.c },
  { key: "d", name: "Poison Cloud", cost: 16, category: "Offensive", cast: castPoisonCloud, sound: SPELL_SOUND.d },
  { key: "e", name: "Meteor Strike", cost: 25, category: "Offensive", cast: castMeteorStrike, sound: SPELL_SOUND.e },
  { key: "f", name: "Chain Lightning", cost: 20, category: "Offensive", cast: castChainLightning, sound: SPELL_SOUND.f },
  { key: "g", name: "Arcane Missile", cost: 8, category: "Offensive", cast: castArcaneMissile, sound: SPELL_SOUND.g },
  { key: "h", name: "Void Beam", cost: 8, category: "Offensive", cast: castVoidBeam, sound: SPELL_SOUND.h },
  { key: "i", name: "Shadow Spike", cost: 11, category: "Offensive", cast: castShadowSpike, sound: SPELL_SOUND.i },
  { key: "j", name: "Frost Nova", cost: 14, category: "Offensive", cast: castFrostNova, sound: SPELL_SOUND.j },

  { key: "k", name: "Stun Bolt", cost: 10, category: "Crowd Control", cast: castStunBolt, sound: SPELL_SOUND.k },
  { key: "l", name: "Root/Entangle", cost: 9, category: "Crowd Control", cast: castRoot, sound: SPELL_SOUND.l },
  { key: "m", name: "Knockback Blast", cost: 11, category: "Crowd Control", cast: castKnockbackBlast, sound: SPELL_SOUND.m },
  { key: "n", name: "Gravity Well", cost: 18, category: "Crowd Control", cast: castGravityWell, sound: SPELL_SOUND.n },
  { key: "o", name: "Sleep Spell", cost: 13, category: "Crowd Control", cast: castSleepSpell, sound: SPELL_SOUND.o },
  { key: "p", name: "Silence", cost: 9, category: "Crowd Control", cast: castSilence, sound: SPELL_SOUND.p },
  { key: "q", name: "Polymorph", cost: 17, category: "Crowd Control", cast: castPolymorph, sound: SPELL_SOUND.q },
  { key: "r", name: "Time Slow", cost: 16, category: "Crowd Control", cast: castTimeSlow, sound: SPELL_SOUND.r },

  { key: "s", name: "Shield", cost: 12, category: "Defensive", cast: castShield, sound: SPELL_SOUND.s },
  { key: "t", name: "Barrier Wall", cost: 14, category: "Defensive", cast: castBarrierWall, sound: SPELL_SOUND.t },
  { key: "u", name: "Reflect", cost: 14, category: "Defensive", cast: castReflect, sound: SPELL_SOUND.u },
  { key: "v", name: "Invisibility", cost: 16, category: "Defensive", cast: castInvisibility, sound: SPELL_SOUND.v },
  { key: "w", name: "Healing Aura", cost: 15, category: "Defensive", cast: castHealingAura, sound: SPELL_SOUND.w },
  { key: "x", name: "Cleanse", cost: 8, category: "Defensive", cast: castCleanse, sound: SPELL_SOUND.x },
  { key: "y", name: "Damage Reduction Ward", cost: 13, category: "Defensive", cast: castDamageReductionWard, sound: SPELL_SOUND.y },
  { key: "z", name: "Teleport/Blink", cost: 7, category: "Defensive", cast: castBlink, sound: SPELL_SOUND.z },

  { key: "A", name: "Haste", cost: 14, category: "Utility", cast: castHaste, sound: SPELL_SOUND.A },
  { key: "B", name: "Levitate/Fly", cost: 10, category: "Utility", cast: castLevitate, sound: SPELL_SOUND.B },
  { key: "C", name: "Light", cost: 6, category: "Utility", cast: castLight, sound: SPELL_SOUND.C },
  { key: "D", name: "Detect Enemies", cost: 6, category: "Utility", cast: castDetectEnemies, sound: SPELL_SOUND.D },
  { key: "E", name: "Summon Portal", cost: 12, category: "Utility", cast: castSummonPortal, sound: SPELL_SOUND.E },
  { key: "F", name: "Waterwalk", cost: 8, category: "Utility", cast: castWaterwalk, sound: SPELL_SOUND.F },

  { key: "G", name: "Summon Skeleton/Golem", cost: 20, category: "Summoning", cast: castSummonSkeleton, sound: SPELL_SOUND.G },
  { key: "H", name: "Summon Swarm", cost: 15, category: "Summoning", cast: castSummonSwarm, sound: SPELL_SOUND.H },
  { key: "I", name: "Elemental Familiar", cost: 22, category: "Summoning", cast: castElementalFamiliar, sound: SPELL_SOUND.I },
  { key: "J", name: "Necrotic Reanimation", cost: 20, category: "Summoning", cast: castNecroticReanimation, sound: SPELL_SOUND.J },

  { key: "K", name: "Earthquake", cost: 22, category: "Environmental", cast: castEarthquake, sound: SPELL_SOUND.K },
  { key: "L", name: "Flame Wall", cost: 16, category: "Environmental", cast: castFlameWall, sound: SPELL_SOUND.L },
  { key: "M", name: "Ice Platform", cost: 10, category: "Environmental", cast: castIcePlatform, sound: SPELL_SOUND.M },
  { key: "N", name: "Web Trap", cost: 11, category: "Environmental", cast: castWebTrap, sound: SPELL_SOUND.N },
  { key: "O", name: "Spike Trap", cost: 13, category: "Environmental", cast: castSpikeTrap, sound: SPELL_SOUND.O },

  { key: "P", name: "Weaken", cost: 9, category: "Buff/Debuff", cast: castWeaken, sound: SPELL_SOUND.P },
  { key: "Q", name: "Armor Break", cost: 9, category: "Buff/Debuff", cast: castArmorBreak, sound: SPELL_SOUND.Q },
  { key: "R", name: "Mark for Death", cost: 12, category: "Buff/Debuff", cast: castMarkForDeath, sound: SPELL_SOUND.R },
  { key: "S", name: "Empower", cost: 10, category: "Buff/Debuff", cast: castEmpower, sound: SPELL_SOUND.S },
  { key: "T", name: "Curse", cost: 13, category: "Buff/Debuff", cast: castCurse, sound: SPELL_SOUND.T },

  { key: "U", name: "Blizzard", cost: 40, category: "Ultimate", cast: castBlizzard, sound: SPELL_SOUND.U },
  { key: "V", name: "Black Hole", cost: 45, category: "Ultimate", cast: castBlackHole, sound: SPELL_SOUND.V },
  { key: "W", name: "Divine Judgment", cost: 50, category: "Ultimate", cast: castDivineJudgment, sound: SPELL_SOUND.W },
  { key: "X", name: "Army of the Dead", cost: 45, category: "Summoning", cast: castArmyOfTheDead, sound: SPELL_SOUND.X },
  { key: "Y", name: "Time Stop", cost: 55, category: "Ultimate", cast: castTimeStop, sound: SPELL_SOUND.Y },

  // ---- ../spells-new.md additions ----
  { key: "Z", name: "Prism Lance", cost: 14, category: "Offensive", cast: castPrismLance, sound: SPELL_SOUND.Z },
  { key: "1", name: "Corrosive Spit", cost: 12, category: "Offensive", cast: castCorrosiveSpit, sound: SPELL_SOUND["1"] },
  { key: "2", name: "Echo Strike", cost: 13, category: "Offensive", cast: castEchoStrike, sound: SPELL_SOUND["2"] },
  { key: "3", name: "Gravity Spear", cost: 15, category: "Offensive", cast: castGravitySpear, sound: SPELL_SOUND["3"] },
  { key: "4", name: "Blood Tithe", cost: 10, category: "Offensive", cast: castBloodTithe, sound: SPELL_SOUND["4"] },
  { key: "5", name: "Static Skin", cost: 12, category: "Offensive", cast: castStaticSkin, sound: SPELL_SOUND["5"] },
  { key: "6", name: "Cinder Rain", cost: 17, category: "Offensive", cast: castCinderRain, sound: SPELL_SOUND["6"] },
  { key: "7", name: "Whisper of Madness", cost: 13, category: "Offensive", cast: castWhisperOfMadness, sound: SPELL_SOUND["7"] },
  { key: "8", name: "Rust Touch", cost: 11, category: "Offensive", cast: castRustTouch, sound: SPELL_SOUND["8"] },
  { key: "9", name: "Starfall Lance", cost: 24, category: "Offensive", cast: castStarfallLance, sound: SPELL_SOUND["9"] },

  { key: "0", name: "Paper Skin", cost: 8, category: "Crowd Control", cast: castPaperSkin, sound: SPELL_SOUND["0"] },
  { key: "!", name: "Tar Pool", cost: 12, category: "Crowd Control", cast: castTarPool, sound: SPELL_SOUND["!"] },
  { key: "@", name: "Mimic Curse", cost: 14, category: "Crowd Control", cast: castMimicCurse, sound: SPELL_SOUND["@"] },
  { key: "#", name: "Fear Ward", cost: 13, category: "Crowd Control", cast: castFearWard, sound: SPELL_SOUND["#"] },
  { key: "$", name: "Anchor Chain", cost: 16, category: "Crowd Control", cast: castAnchorChain, sound: SPELL_SOUND["$"] },
  { key: "%", name: "Feedback Loop", cost: 12, category: "Crowd Control", cast: castFeedbackLoop, sound: SPELL_SOUND["%"] },
  { key: "^", name: "Dazzle Flash", cost: 11, category: "Crowd Control", cast: castDazzleFlash, sound: SPELL_SOUND["^"] },
  { key: "&", name: "Puppet String", cost: 9, category: "Crowd Control", cast: castPuppetString, sound: SPELL_SOUND["&"] },

  { key: "*", name: "Mirror Skin", cost: 15, category: "Defensive", cast: castMirrorSkin, sound: SPELL_SOUND["*"] },
  { key: "(", name: "Absorb & Release", cost: 10, category: "Defensive", cast: castAbsorbRelease, sound: SPELL_SOUND["("] },
  { key: ")", name: "Phase Step", cost: 9, category: "Defensive", cast: castPhaseStep, sound: SPELL_SOUND[")"] },
  { key: "-", name: "Thorned Ward", cost: 11, category: "Defensive", cast: castThornedWard, sound: SPELL_SOUND["-"] },
  { key: "=", name: "Second Wind", cost: 18, category: "Defensive", cast: castSecondWind, sound: SPELL_SOUND["="] },
  { key: "[", name: "Sanctuary Circle", cost: 16, category: "Defensive", cast: castSanctuaryCircle, sound: SPELL_SOUND["["] },
  { key: "]", name: "Null Field", cost: 20, category: "Defensive", cast: castNullField, sound: SPELL_SOUND["]"] },

  { key: "\\", name: "Backtrack", cost: 10, category: "Utility", cast: castBacktrack, sound: SPELL_SOUND["\\"] },
  { key: ";", name: "Scentless", cost: 8, category: "Utility", cast: castScentless, sound: SPELL_SOUND[";"] },
  { key: "'", name: "Grapple Hook", cost: 9, category: "Utility", cast: castGrappleHook, sound: SPELL_SOUND["'"] },
  { key: ",", name: "Featherfall", cost: 6, category: "Utility", cast: castFeatherfall, sound: SPELL_SOUND[","] },
  { key: ".", name: "Mapper's Eye", cost: 9, category: "Utility", cast: castMappersEye, sound: SPELL_SOUND["."] },
  { key: "/", name: "Borrowed Time", cost: 10, category: "Utility", cast: castBorrowedTime, sound: SPELL_SOUND["/"] },
  { key: "`", name: "Split Path", cost: 11, category: "Utility", cast: castSplitPath, sound: SPELL_SOUND["`"] },

  { key: "_", name: "Swarm Mother", cost: 24, category: "Summoning", cast: castSwarmMother, sound: SPELL_SOUND["_"] },
  { key: "+", name: "Bound Blade", cost: 16, category: "Summoning", cast: castBoundBlade, sound: SPELL_SOUND["+"] },
  { key: "{", name: "Mirror Twin", cost: 20, category: "Summoning", cast: castMirrorTwin, sound: SPELL_SOUND["{"] },
  { key: "}", name: "Vulture Pact", cost: 14, category: "Summoning", cast: castVulturePact, sound: SPELL_SOUND["}"] },
  { key: "|", name: "Living Armor", cost: 18, category: "Summoning", cast: castLivingArmor, sound: SPELL_SOUND["|"] },

  { key: ":", name: "Shifting Sands", cost: 13, category: "Environmental", cast: castShiftingSands, sound: SPELL_SOUND[":"] },
  { key: "\"", name: "Overgrowth", cost: 12, category: "Environmental", cast: castOvergrowth, sound: SPELL_SOUND["\""] },
  { key: "<", name: "Magnetic Field", cost: 12, category: "Environmental", cast: castMagneticField, sound: SPELL_SOUND["<"] },
  { key: ">", name: "Mirror Floor", cost: 14, category: "Environmental", cast: castMirrorFloor, sound: SPELL_SOUND[">"] },
  { key: "?", name: "Collapsing Ceiling", cost: 18, category: "Environmental", cast: castCollapsingCeiling, sound: SPELL_SOUND["?"] },
  { key: "~", name: "Bramble Bridge", cost: 9, category: "Environmental", cast: castBrambleBridge, sound: SPELL_SOUND["~"] },

  { key: "F1", name: "Exposed Nerve", cost: 10, category: "Buff/Debuff", cast: castExposedNerve, sound: SPELL_SOUND.F1 },
  { key: "F2", name: "Siphon Sigil", cost: 12, category: "Buff/Debuff", cast: castSiphonSigil, sound: SPELL_SOUND.F2 },
  { key: "F3", name: "Overclock", cost: 11, category: "Buff/Debuff", cast: castOverclock, sound: SPELL_SOUND.F3 },
  { key: "F4", name: "Doom Clock", cost: 16, category: "Buff/Debuff", cast: castDoomClock, sound: SPELL_SOUND.F4 },
  { key: "F5", name: "Fracture", cost: 13, category: "Buff/Debuff", cast: castFracture, sound: SPELL_SOUND.F5 },

  { key: "F6", name: "World Tree's Bloom", cost: 60, category: "Ultimate", cast: castWorldTreesBloom, sound: SPELL_SOUND.F6 },
  { key: "F7", name: "Chrono Fracture", cost: 50, category: "Ultimate", cast: castChronoFracture, sound: SPELL_SOUND.F7 },
] as const;

const SPELLS_BY_KEY = new Map(SPELLS.map((s) => [s.key, s]));

/** Looks up a spell by its spellbook letter (see {@link SpellDef.key}); used by ./items.ts to grant a spell for free through an item. */
export function findSpell(key: string): SpellDef | undefined {
  return SPELLS_BY_KEY.get(key);
}

/**
 * One line of the spellbook menu: either a category header or a castable
 * spell. Flattened once, up front, so pagination just slices this array
 * instead of re-walking {@link SPELLS} and re-deciding header placement on
 * every page turn.
 */
type SpellMenuRow = { readonly header: string } | { readonly spell: SpellDef };

function buildSpellMenuRows(): SpellMenuRow[] {
  const rows: SpellMenuRow[] = [];
  let lastCategory = "";
  for (const spell of SPELLS) {
    if (spell.category !== lastCategory) {
      rows.push({ header: spell.category });
      lastCategory = spell.category;
    }
    rows.push({ spell });
  }
  return rows;
}

/** All 101+ menu lines, computed once — {@link SPELLS} never changes at runtime. */
const SPELL_MENU_ROWS: readonly SpellMenuRow[] = buildSpellMenuRows();

/**
 * Redraws one page of the full-screen spellbook menu, grouped by category.
 * With 101 spells across 8 categories, the roster is far taller than any
 * reasonable viewport (`../src/index.ts`'s VP_HEIGHT is 24 rows), so the
 * menu paginates instead of truncating silently — see {@link openSpellMenu}
 * for the Up/Down page-turn keys.
 *
 * @returns the page actually drawn, clamped to a valid range — callers
 *   should feed this back in as `page` on the next call so an out-of-range
 *   request (e.g. paging down past the last page) settles at the boundary
 *   instead of getting stuck past it.
 */
function drawSpellMenu(viewport: Viewport, game: Game, page: number, footer: string): number {
  const { display, height } = viewport;
  display.clear();
  display.drawText(0, 0, `Spellbook  (mana ${game.mana.mana}/${game.mana.maxmana})`);

  const pageRows = Math.max(1, height - 3); // rows 2..height-2; row 0 is the header, height-1 the footer.
  const pageCount = Math.max(1, Math.ceil(SPELL_MENU_ROWS.length / pageRows));
  const clampedPage = Math.min(Math.max(page, 0), pageCount - 1);
  const start = clampedPage * pageRows;

  let row = 2;
  for (const entry of SPELL_MENU_ROWS.slice(start, start + pageRows)) {
    if ("header" in entry) {
      display.drawText(0, row, `-- ${entry.header} --`);
    } else {
      const { key, name, cost } = entry.spell;
      display.drawText(0, row, `${key}) ${name} (${cost}mp)`);
    }
    row++;
  }

  const pageInfo = pageCount > 1 ? `  page ${clampedPage + 1}/${pageCount}` : "";
  display.drawText(0, height - 1, footer + pageInfo);
  return clampedPage;
}

/**
 * Handles the 'c'/'C' cast-spell command: shows the spellbook, lets the
 * player pick a lettered spell, then hands off to that spell's own `cast`.
 * Wired from `movePlayer()` (`src/move-player.ts`).
 *
 * Casting works by typing a spell's key directly, from any page — Up/Down
 * (or Page Up/Down) only scroll the reference list into view, they don't
 * gate which keys are recognised.
 *
 * @returns `true` when a spell was actually cast (a turn is consumed).
 *   Returns `false` when the menu was cancelled or the chosen spell's own
 *   targeting prompt was cancelled.
 */
export async function openSpellMenu(game: Game, viewport: Viewport): Promise<boolean> {
  if (isSilenced(game.player)) {
    game.log.msg("you are silenced and cannot cast");
    return false;
  }

  let page = 0;
  while (true) {
    page = drawSpellMenu(viewport, game, page, "cast which spell?   [[Up/Down]] page   [[ESC]] close");
    const key = (await inputKey()).key;
    if (key === "Escape") {
      viewport.draw(game);
      return false;
    }
    if (key === "ArrowDown" || key === "PageDown") { page += 1; continue; }
    if (key === "ArrowUp" || key === "PageUp") { page -= 1; continue; }

    const spell = SPELLS_BY_KEY.get(key);
    if (!spell) continue;

    const consumed = await spell.cast(game, viewport);
    if (consumed) spell.sound();
    viewport.draw(game);
    return consumed;
  }
}
