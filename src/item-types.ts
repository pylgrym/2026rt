import { ObjType, type T_ObjType } from "./dmap";

/**
 * The four consumable kinds the player can find, per ../spells.md's closing
 * brief: potions affect the drinker's own body (or whoever a thrown one
 * lands on); scrolls are general one-shot effects with nothing to do with
 * the reader's body; wands are charged, targeted NSEW beams/projectiles;
 * staffs are charged, more powerful area effects. See ./items.ts for the
 * behaviour each kind drives.
 */
export const ItemKind = {
  Potion: "potion",
  Scroll: "scroll",
  Wand: "wand",
  Staff: "staff",
} as const;
export type T_ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export interface ItemTypeInfo {
  readonly type: T_ObjType;
  readonly kind: T_ItemKind;
  /** The bare item name, e.g. "wand of fireballs" — see {@link colorName} for the poetic identity prefix shown in the full label. */
  readonly name: string;
  readonly glyph: string;
  /**
   * A fixed, poetic colour name — vermillion, puce, byzantium, and so on —
   * that deterministically identifies this exact item type, every game,
   * forever. Not a random-per-playthrough identification scheme (the user
   * doesn't want one): the same spell always wears the same colour. See
   * {@link ../src/objs.ts}'s `objInfo()`, which prefixes {@link name} with
   * this to build the label the player actually sees, e.g. "vermillion
   * staff of meteors".
   */
  readonly colorName: string;
  /** The hex swatch matching {@link colorName}; also what {@link ../src/objs.ts}'s `drawObjects()` draws the glyph in. */
  readonly color: string;
  /** The letter key of the ../spells.md spell (see ./spells.ts's SPELLS) this item grants for free. */
  readonly spellKey: string;
  /** Wands/staffs only: the charge count new-found/newly-crafted items are capped around; see ./items.ts's recharge risk curve. */
  readonly baseMaxCharges?: number;
}

/**
 * The full roster: every one of ../spells.md's 51 spells reachable through
 * exactly one item, each wearing its own fixed poetic colour (see
 * {@link ItemTypeInfo.colorName}). Mirrors {@link ../src/objs.ts}'s
 * `OBJ_TYPES` in shape; kept in its own file (rather than growing objs.ts
 * further) since this table alone is as large as everything objs.ts had
 * before it.
 */
export const ITEM_TYPES: readonly ItemTypeInfo[] = [
  // Potions
  { type: ObjType.PotionShield, kind: ItemKind.Potion, name: "potion of shielding", glyph: "!", colorName: "cerulean", color: "#007BA7", spellKey: "s" },
  { type: ObjType.PotionReflect, kind: ItemKind.Potion, name: "potion of mirrors", glyph: "!", colorName: "orchid", color: "#DA70D6", spellKey: "u" },
  { type: ObjType.PotionInvisibility, kind: ItemKind.Potion, name: "potion of invisibility", glyph: "!", colorName: "glaucous", color: "#6082B6", spellKey: "v" },
  { type: ObjType.PotionHealingAura, kind: ItemKind.Potion, name: "potion of healing aura", glyph: "!", colorName: "rose", color: "#FF007F", spellKey: "w" },
  { type: ObjType.PotionCleanse, kind: ItemKind.Potion, name: "potion of cleansing", glyph: "!", colorName: "periwinkle", color: "#CCCCFF", spellKey: "x" },
  { type: ObjType.PotionDamageReductionWard, kind: ItemKind.Potion, name: "potion of warding", glyph: "!", colorName: "umber", color: "#635147", spellKey: "y" },
  { type: ObjType.PotionHaste, kind: ItemKind.Potion, name: "potion of haste", glyph: "!", colorName: "tangerine", color: "#F28500", spellKey: "A" },
  { type: ObjType.PotionLevitate, kind: ItemKind.Potion, name: "potion of levitation", glyph: "!", colorName: "aquamarine", color: "#7FFFD4", spellKey: "B" },
  { type: ObjType.PotionWaterwalk, kind: ItemKind.Potion, name: "potion of waterwalking", glyph: "!", colorName: "turquoise", color: "#40E0D0", spellKey: "F" },
  { type: ObjType.PotionEmpower, kind: ItemKind.Potion, name: "potion of empowerment", glyph: "!", colorName: "amber", color: "#FFBF00", spellKey: "S" },

  // Scrolls
  { type: ObjType.ScrollSleep, kind: ItemKind.Scroll, name: "scroll of sleep", glyph: "?", colorName: "indigo", color: "#4B0082", spellKey: "o" },
  { type: ObjType.ScrollSilence, kind: ItemKind.Scroll, name: "scroll of silence", glyph: "?", colorName: "wenge", color: "#645452", spellKey: "p" },
  { type: ObjType.ScrollPolymorph, kind: ItemKind.Scroll, name: "scroll of polymorph", glyph: "?", colorName: "chartreuse", color: "#7FFF00", spellKey: "q" },
  { type: ObjType.ScrollBlink, kind: ItemKind.Scroll, name: "scroll of blinking", glyph: "?", colorName: "lavender", color: "#B57EDC", spellKey: "z" },
  { type: ObjType.ScrollLight, kind: ItemKind.Scroll, name: "scroll of light", glyph: "?", colorName: "saffron", color: "#F4C430", spellKey: "C" },
  { type: ObjType.ScrollDetectEnemies, kind: ItemKind.Scroll, name: "scroll of detect enemies", glyph: "?", colorName: "carmine", color: "#960018", spellKey: "D" },
  { type: ObjType.ScrollSummonPortal, kind: ItemKind.Scroll, name: "scroll of summon portal", glyph: "?", colorName: "byzantium", color: "#702963", spellKey: "E" },
  { type: ObjType.ScrollSummonSkeleton, kind: ItemKind.Scroll, name: "scroll of summon skeleton", glyph: "?", colorName: "xanadu", color: "#738678", spellKey: "G" },
  { type: ObjType.ScrollSummonSwarm, kind: ItemKind.Scroll, name: "scroll of summon swarm", glyph: "?", colorName: "citrine", color: "#E4D00A", spellKey: "H" },
  { type: ObjType.ScrollElementalFamiliar, kind: ItemKind.Scroll, name: "scroll of elemental familiar", glyph: "?", colorName: "gamboge", color: "#E49B0F", spellKey: "I" },
  { type: ObjType.ScrollNecroticReanimation, kind: ItemKind.Scroll, name: "scroll of necrotic reanimation", glyph: "?", colorName: "tyrian purple", color: "#66023C", spellKey: "J" },
  { type: ObjType.ScrollArmyOfTheDead, kind: ItemKind.Scroll, name: "scroll of the army of the dead", glyph: "?", colorName: "falu red", color: "#801818", spellKey: "X" },
  { type: ObjType.ScrollWeaken, kind: ItemKind.Scroll, name: "scroll of weakening", glyph: "?", colorName: "puce", color: "#A95C68", spellKey: "P" },
  { type: ObjType.ScrollArmorBreak, kind: ItemKind.Scroll, name: "scroll of armor break", glyph: "?", colorName: "rust", color: "#B7410E", spellKey: "Q" },
  { type: ObjType.ScrollMarkForDeath, kind: ItemKind.Scroll, name: "scroll of marking", glyph: "?", colorName: "crimson", color: "#DC143C", spellKey: "R" },
  { type: ObjType.ScrollCurse, kind: ItemKind.Scroll, name: "scroll of cursing", glyph: "?", colorName: "mulberry", color: "#C54B8C", spellKey: "T" },
  { type: ObjType.ScrollDivineJudgment, kind: ItemKind.Scroll, name: "scroll of divine judgment", glyph: "?", colorName: "topaz", color: "#FFC87C", spellKey: "W" },

  // Wands
  { type: ObjType.WandFireball, kind: ItemKind.Wand, name: "wand of fireballs", glyph: "/", colorName: "scarlet", color: "#FF2400", spellKey: "a", baseMaxCharges: 6 },
  { type: ObjType.WandLightningBolt, kind: ItemKind.Wand, name: "wand of lightning", glyph: "/", colorName: "zaffre", color: "#0014A8", spellKey: "b", baseMaxCharges: 6 },
  { type: ObjType.WandIceShard, kind: ItemKind.Wand, name: "wand of ice shards", glyph: "/", colorName: "powder blue", color: "#B0E0E6", spellKey: "c", baseMaxCharges: 7 },
  { type: ObjType.WandChainLightning, kind: ItemKind.Wand, name: "wand of chain lightning", glyph: "/", colorName: "cobalt", color: "#0047AB", spellKey: "f", baseMaxCharges: 5 },
  { type: ObjType.WandArcaneMissile, kind: ItemKind.Wand, name: "wand of arcane missiles", glyph: "/", colorName: "heliotrope", color: "#DF73FF", spellKey: "g", baseMaxCharges: 8 },
  { type: ObjType.WandVoidBeam, kind: ItemKind.Wand, name: "wand of the void", glyph: "/", colorName: "aubergine", color: "#3B0910", spellKey: "h", baseMaxCharges: 6 },
  { type: ObjType.WandShadowSpike, kind: ItemKind.Wand, name: "wand of shadow spikes", glyph: "/", colorName: "plum", color: "#8E4585", spellKey: "i", baseMaxCharges: 6 },
  { type: ObjType.WandStunBolt, kind: ItemKind.Wand, name: "wand of stunning", glyph: "/", colorName: "naples yellow", color: "#FADA5E", spellKey: "k", baseMaxCharges: 7 },
  { type: ObjType.WandRoot, kind: ItemKind.Wand, name: "wand of entangling", glyph: "/", colorName: "fern green", color: "#4F7942", spellKey: "l", baseMaxCharges: 7 },
  { type: ObjType.WandKnockback, kind: ItemKind.Wand, name: "wand of knockback", glyph: "/", colorName: "ochre", color: "#CC7722", spellKey: "m", baseMaxCharges: 6 },

  // Staffs
  { type: ObjType.StaffPoisonCloud, kind: ItemKind.Staff, name: "staff of poison clouds", glyph: "|", colorName: "viridian", color: "#40826D", spellKey: "d", baseMaxCharges: 4 },
  { type: ObjType.StaffMeteorStrike, kind: ItemKind.Staff, name: "staff of meteors", glyph: "|", colorName: "vermillion", color: "#E34234", spellKey: "e", baseMaxCharges: 3 },
  { type: ObjType.StaffFrostNova, kind: ItemKind.Staff, name: "staff of frost nova", glyph: "|", colorName: "azure", color: "#007FFF", spellKey: "j", baseMaxCharges: 4 },
  { type: ObjType.StaffGravityWell, kind: ItemKind.Staff, name: "staff of gravity wells", glyph: "|", colorName: "damson", color: "#7B3F61", spellKey: "n", baseMaxCharges: 4 },
  { type: ObjType.StaffTimeSlow, kind: ItemKind.Staff, name: "staff of time slowing", glyph: "|", colorName: "slate blue", color: "#6A5ACD", spellKey: "r", baseMaxCharges: 4 },
  { type: ObjType.StaffBarrierWall, kind: ItemKind.Staff, name: "staff of barriers", glyph: "|", colorName: "payne's grey", color: "#536878", spellKey: "t", baseMaxCharges: 5 },
  { type: ObjType.StaffEarthquake, kind: ItemKind.Staff, name: "staff of earthquakes", glyph: "|", colorName: "sienna", color: "#A0522D", spellKey: "K", baseMaxCharges: 3 },
  { type: ObjType.StaffFlameWall, kind: ItemKind.Staff, name: "staff of flame walls", glyph: "|", colorName: "coquelicot", color: "#FF3800", spellKey: "L", baseMaxCharges: 4 },
  { type: ObjType.StaffIcePlatform, kind: ItemKind.Staff, name: "staff of ice bridges", glyph: "|", colorName: "alice blue", color: "#F0F8FF", spellKey: "M", baseMaxCharges: 5 },
  { type: ObjType.StaffWebTrap, kind: ItemKind.Staff, name: "staff of webs", glyph: "|", colorName: "gainsboro", color: "#DCDCDC", spellKey: "N", baseMaxCharges: 5 },
  { type: ObjType.StaffSpikeTrap, kind: ItemKind.Staff, name: "staff of spikes", glyph: "|", colorName: "gunmetal", color: "#2A3439", spellKey: "O", baseMaxCharges: 4 },
  { type: ObjType.StaffBlizzard, kind: ItemKind.Staff, name: "staff of blizzards", glyph: "|", colorName: "baby blue", color: "#89CFF0", spellKey: "U", baseMaxCharges: 3 },
  { type: ObjType.StaffBlackHole, kind: ItemKind.Staff, name: "staff of black holes", glyph: "|", colorName: "raisin black", color: "#242124", spellKey: "V", baseMaxCharges: 2 },
  { type: ObjType.StaffTimeStop, kind: ItemKind.Staff, name: "staff of time stop", glyph: "|", colorName: "platinum", color: "#E5E4E2", spellKey: "Y", baseMaxCharges: 2 },
] as const;

const ITEM_INFO_BY_TYPE = new Map<T_ObjType, ItemTypeInfo>(ITEM_TYPES.map((it) => [it.type, it]));

/** Looks up a spell-item's metadata, or `undefined` for the legacy Kettle/Tea types (see ./objs.ts's OBJ_TYPES instead). */
export function itemTypeInfo(type: T_ObjType): ItemTypeInfo | undefined {
  return ITEM_INFO_BY_TYPE.get(type);
}

/** Picks a uniformly random spell-item type of any kind. */
export function randomItemType(): T_ObjType {
  return ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)].type;
}
