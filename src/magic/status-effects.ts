import type { Mob } from "../dmap";
import type { Game } from "../game";
import { isPly } from "../dmap";
import { awardKillXp } from "../xp";
import { levelOfTile } from "../mob-factory";
import { killDrop } from "../objs";
import { corrosionMultiplier } from "./corrosion";
import { onFractureHit } from "./fracture";

/**
 * Generic per-mob status effect engine, shared by every crowd-control,
 * buff/debuff and defensive spell in ../spells.md so each spell only has to
 * call {@link addStatus} with its own numbers instead of reinventing timers.
 *
 * State is kept in a `WeakMap<Mob, Entry[]>` rather than a field on
 * {@link Mob} itself, so mobs that never get statused pay nothing and
 * dmap.ts stays untouched.
 */
export const StatusKind = {
  Stun: "stun",           // can't act at all (attack or move).
  Root: "root",           // can't move, can still attack.
  Freeze: "freeze",       // can't act; also treated as CC for "asleep" flavour.
  SleepCc: "sleepCc",     // magically put to sleep; woken early by taking damage.
  Silence: "silence",     // can't cast spells.
  Slow: "slow",           // 50% chance to lose the turn entirely.
  Haste: "haste",         // acts twice per round.
  Poison: "poison",       // damage over time.
  Curse: "curse",         // damage over time + weakened.
  Weaken: "weaken",       // outgoing damage reduced.
  ArmorBreak: "armorBreak", // incoming damage increased.
  Mark: "mark",           // incoming damage from all sources boosted further.
  Shield: "shield",       // absorbs incoming damage up to a pool.
  DamageReduction: "damageReduction", // incoming damage reduced by a fraction.
  Reflect: "reflect",     // a fraction of incoming damage bounces back at the attacker.
  Empower: "empower",     // next outgoing attack gets a flat damage bonus, consumed on use.
  Invisible: "invisible", // monsters can't notice/target this mob.
  Regen: "regen",         // heal over time (Healing Aura).
  Levitate: "levitate",   // immune to ground field-effect hazards (Levitate/Fly).
  Waterwalk: "waterwalk", // immune to ground field-effect hazards (Waterwalk).

  // ---- ../spells-new.md additions ----
  CritNext: "critNext",       // next incoming hit is a guaranteed critical (Paper Skin).
  CritImmune: "critImmune",   // can't be critically hit (Sanctuary Circle).
  ExposedNerve: "exposedNerve", // incoming damage boosted further while incapacitated/rooted.
  SiphonMark: "siphonMark",   // a fraction of damage dealt to this mob heals the attacker.
  Thorns: "thorns",           // flat damage dealt back to any melee attacker (Thorned Ward).
  StaticSkin: "staticSkin",   // flat shock damage dealt back to any melee attacker (Static Skin).
  SecondWind: "secondWind",   // survives a would-be-fatal hit at 1 HP, once.
  Intangible: "intangible",   // negates the very next hit entirely (Phase Step).
  AbsorbStore: "absorbStore", // fully absorbs incoming damage into a growing pool (Absorb & Release).
  Tarred: "tarred",           // can't be missed — attacks against this mob always deal at least 1 (Tar Pool).
  Blind: "blind",             // this mob's own attacks always miss (Dazzle Flash).
  FeedbackLoop: "feedbackLoop", // immune to crowd control while active.
  Confuse: "confuse",         // extra chance to lose the turn entirely (Whisper of Madness).
  Scentless: "scentless",     // hidden from hostile notice, like Invisible but its own flavour (Scentless).
  Featherfall: "featherfall", // immune to ground field-effect hazards (Featherfall).
} as const;
export type T_StatusKind = (typeof StatusKind)[keyof typeof StatusKind];

export interface StatusEntry {
  kind: T_StatusKind;
  turns: number;
  /** Meaning depends on kind: dot damage/turn, weaken fraction, shield pool, etc. */
  magnitude: number;
}

const statusesByMob = new WeakMap<Mob, StatusEntry[]>();

function entriesFor(mob: Mob): StatusEntry[] {
  let entries = statusesByMob.get(mob);
  if (!entries) { entries = []; statusesByMob.set(mob, entries); }
  return entries;
}

/** Crowd-control kinds {@link StatusKind.FeedbackLoop} grants immunity to. */
const CC_STATUS_KINDS: readonly T_StatusKind[] = [
  StatusKind.Stun, StatusKind.Root, StatusKind.Freeze, StatusKind.SleepCc,
  StatusKind.Silence, StatusKind.Slow, StatusKind.Confuse,
];

/** Adds (or refreshes) a status on `mob`. A repeated kind replaces the weaker/shorter of the two rather than stacking. */
export function addStatus(mob: Mob, kind: T_StatusKind, turns: number, magnitude = 0): void {
  if (CC_STATUS_KINDS.includes(kind) && hasStatus(mob, StatusKind.FeedbackLoop)) return;
  const entries = entriesFor(mob);
  const existing = entries.find((e) => e.kind === kind);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    existing.magnitude = Math.max(existing.magnitude, magnitude);
  } else {
    entries.push({ kind, turns, magnitude });
  }
}

export function hasStatus(mob: Mob, kind: T_StatusKind): boolean {
  return !!statusesByMob.get(mob)?.some((e) => e.kind === kind);
}

export function getStatus(mob: Mob, kind: T_StatusKind): StatusEntry | undefined {
  return statusesByMob.get(mob)?.find((e) => e.kind === kind);
}

export function removeStatus(mob: Mob, kind: T_StatusKind): void {
  const entries = statusesByMob.get(mob);
  if (!entries) return;
  const idx = entries.findIndex((e) => e.kind === kind);
  if (idx !== -1) entries.splice(idx, 1);
}

export function clearStatuses(mob: Mob): void {
  statusesByMob.delete(mob);
}

/** True when `mob` cannot take any action this turn (attack or move). */
export function isIncapacitated(mob: Mob): boolean {
  return hasStatus(mob, StatusKind.Stun) || hasStatus(mob, StatusKind.Freeze) || hasStatus(mob, StatusKind.SleepCc);
}

/** True when `mob` cannot move (but may still attack if already adjacent). */
export function isRooted(mob: Mob): boolean {
  return hasStatus(mob, StatusKind.Root) || isIncapacitated(mob);
}

export function isSilenced(mob: Mob): boolean {
  return hasStatus(mob, StatusKind.Silence);
}

export function isInvisible(mob: Mob): boolean {
  return hasStatus(mob, StatusKind.Invisible) || hasStatus(mob, StatusKind.Scentless);
}

/** True when `mob` should ignore ground field-effect hazards (Levitate/Fly, Waterwalk, Featherfall). */
export function isHazardImmune(mob: Mob): boolean {
  return hasStatus(mob, StatusKind.Levitate) || hasStatus(mob, StatusKind.Waterwalk) || hasStatus(mob, StatusKind.Featherfall);
}

/** Consumes a would-be-fatal hit once (Second Wind); returns whether it fired. */
export function preventDeathOnce(mob: Mob): boolean {
  if (!hasStatus(mob, StatusKind.SecondWind)) return false;
  removeStatus(mob, StatusKind.SecondWind);
  return true;
}

/** The debuff kinds {@link cleanseNegative} strips; every DoT/CC/debuff, none of the self-buffs. */
const NEGATIVE_KINDS: readonly T_StatusKind[] = [
  StatusKind.Stun, StatusKind.Root, StatusKind.Freeze, StatusKind.SleepCc, StatusKind.Silence,
  StatusKind.Slow, StatusKind.Poison, StatusKind.Curse, StatusKind.Weaken, StatusKind.ArmorBreak,
  StatusKind.Mark, StatusKind.ExposedNerve, StatusKind.Tarred, StatusKind.Blind,
  StatusKind.Confuse, StatusKind.CritNext, StatusKind.SiphonMark,
];

/** Strips every negative status from `mob` (Cleanse). Leaves buffs like Shield/Haste/Reflect alone. */
export function cleanseNegative(mob: Mob): void {
  for (const kind of NEGATIVE_KINDS) removeStatus(mob, kind);
}

/** Rolls whether `mob` loses its turn to Slow this round (50% when slowed). */
export function rollSlowSkip(mob: Mob): boolean {
  if (hasStatus(mob, StatusKind.Slow) && Math.random() < 0.5) return true;
  if (hasStatus(mob, StatusKind.Confuse) && Math.random() < 0.6) return true;
  return false;
}

export function isHasted(mob: Mob): boolean {
  return hasStatus(mob, StatusKind.Haste);
}

/**
 * Applies outgoing-damage modifiers (Weaken reduces, Empower adds a flat
 * bonus and is consumed) to a raw damage roll from `attacker`.
 */
export function applyOutgoingModifiers(attacker: Mob, rawDamage: number): number {
  let dmg = rawDamage;
  const weaken = getStatus(attacker, StatusKind.Weaken);
  if (weaken) dmg = Math.max(0, Math.round(dmg * (1 - weaken.magnitude)));
  const empower = getStatus(attacker, StatusKind.Empower);
  if (empower) {
    dmg += empower.magnitude;
    removeStatus(attacker, StatusKind.Empower);
  }
  return dmg;
}

/**
 * Applies incoming-damage modifiers on `defender` in order: Mark bonus,
 * Armor Break bonus, Damage Reduction, then Shield absorption. Any damage
 * that gets reflected is returned separately so the caller can apply it
 * back to the attacker.
 */
export interface IncomingResult {
  damage: number;
  reflected: number;
  /** Damage the attacker should be healed for (Siphon Sigil); 0 normally. */
  siphon: number;
}

export function applyIncomingModifiers(defender: Mob, rawDamage: number): IncomingResult {
  let dmg = rawDamage;

  if (hasStatus(defender, StatusKind.Intangible)) {
    removeStatus(defender, StatusKind.Intangible);
    return { damage: 0, reflected: 0, siphon: 0 };
  }

  const mark = getStatus(defender, StatusKind.Mark);
  if (mark) dmg = Math.round(dmg * (1 + mark.magnitude));

  const armorBreak = getStatus(defender, StatusKind.ArmorBreak);
  if (armorBreak) dmg = Math.round(dmg * (1 + armorBreak.magnitude));

  dmg = Math.round(dmg * corrosionMultiplier(defender));

  const exposedNerve = getStatus(defender, StatusKind.ExposedNerve);
  if (exposedNerve && isIncapacitated(defender)) dmg = Math.round(dmg * (1 + exposedNerve.magnitude));

  dmg = Math.round(dmg * onFractureHit(defender));

  const critNext = getStatus(defender, StatusKind.CritNext);
  if (critNext && !hasStatus(defender, StatusKind.CritImmune)) {
    dmg = Math.round(dmg * (1 + critNext.magnitude));
    removeStatus(defender, StatusKind.CritNext);
  }

  const reduction = getStatus(defender, StatusKind.DamageReduction);
  if (reduction) dmg = Math.max(0, Math.round(dmg * (1 - reduction.magnitude)));

  let reflected = 0;
  const reflect = getStatus(defender, StatusKind.Reflect);
  if (reflect) {
    reflected = Math.round(dmg * reflect.magnitude);
  }

  const shield = getStatus(defender, StatusKind.Shield);
  if (shield && shield.magnitude > 0) {
    const absorbed = Math.min(shield.magnitude, dmg);
    shield.magnitude -= absorbed;
    dmg -= absorbed;
    if (shield.magnitude <= 0) removeStatus(defender, StatusKind.Shield);
  }

  const absorbStore = getStatus(defender, StatusKind.AbsorbStore);
  if (absorbStore) {
    absorbStore.magnitude += dmg;
    dmg = 0;
  }

  let siphon = 0;
  const siphonMark = getStatus(defender, StatusKind.SiphonMark);
  if (siphonMark) siphon = Math.round(dmg * siphonMark.magnitude);

  return { damage: Math.max(0, dmg), reflected, siphon };
}

/** Damage that wakes a Sleep-cc'd mob early; call whenever a statused mob takes damage. */
export function breakSleepOnDamage(mob: Mob): void {
  if (hasStatus(mob, StatusKind.SleepCc)) removeStatus(mob, StatusKind.SleepCc);
}

/**
 * Ticks every status on every mob currently on the map by one round: applies
 * damage-over-time (Poison, Curse), decrements durations, and drops expired
 * entries, logging when a notable effect wears off or ticks. Call once per
 * round from the game loop, alongside {@link ./ooc-heal.ts}'s tickOocHeal.
 */
export function tickStatuses(game: Game): void {
  // Snapshot: a DoT death can remove a mob from game.curMap().Q.mobs mid-loop.
  for (const mob of [...game.curMap().Q.mobs]) {
    const entries = statusesByMob.get(mob);
    if (!entries || entries.length === 0) continue;

    for (const entry of entries) {
      if (entry.kind === StatusKind.Regen) {
        const healed = Math.min(entry.magnitude, mob.maxhp - mob.hp);
        if (healed > 0) {
          mob.hp += healed;
          game.log.msg(`${mobLabel(mob)} ${isPly(mob) ? "feel" : "feels"} the aura's warmth (+${healed})`);
        }
      }
      if (entry.kind === StatusKind.Poison || entry.kind === StatusKind.Curse) {
        mob.hp -= entry.magnitude;
        if (isPly(mob)) game.deathCause = entry.kind === StatusKind.Poison ? "poison" : "a curse";
        game.log.msg(`${mobLabel(mob)} suffers ${entry.magnitude} from ${entry.kind}`);
        if (mob.hp <= 0 && preventDeathOnce(mob)) {
          mob.hp = 1;
          game.log.msg(`${mobLabel(mob)} narrowly survives!`);
        } else if (mob.hp <= 0 && !isPly(mob)) {
          game.log.msg(`${mobLabel(mob)} dies`);
          game.curMap().Q.remove(mob);
          awardKillXp(game, mob);
          killDrop(game, mob, levelOfTile(mob.t));
        }
      }
    }

    const expired = entries.filter((e) => e.turns <= 0);
    if (expired.length > 0) {
      statusesByMob.set(mob, entries.filter((e) => e.turns > 0));
      if (isPly(mob)) {
        for (const e of expired) game.log.msg(`your ${e.kind} fades`);
      }
    }

    for (const entry of entries) entry.turns -= 1;
  }
}

function mobLabel(mob: Mob): string {
  return isPly(mob) ? "you" : `the ${mob.name}`;
}
