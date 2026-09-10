import type { Game } from "./game";
import { Viewport, wrapText } from "./viewport";
import { inputKey } from "./input";
import { fetchTopCareers } from "./api";

/** Leaves a margin either side so wrapped backstory lines don't touch the screen edges. */
const BACKSTORY_MARGIN = 4;

/**
 * The three screens shown before a fresh game begins, one after the other
 * (the viewport isn't tall enough to combine them): a controls/usage
 * summary, the top-careers leaderboard (see ../leaderboard-design.md and
 * ./api.ts), then the randomly generated character's name and backstory.
 * Each waits for a key before advancing; after the last, control returns to
 * the caller (../index.ts), which starts the game loop as usual.
 */
export async function showWelcomeScreen(g: Game, vp: Viewport): Promise<void> {
  const topCareers = await fetchTopCareers();
  await showUsageScreen(vp);
  await showLeaderboardScreen(vp, topCareers);
  await showBackstoryScreen(g, vp);
}

/**
 * The subset of {@link ./move-player.ts | movePlayer}'s keys shown on the
 * usage screen, paired with a short description. `c` (cast spell) and `z`
 * (fire ranged weapon) are deliberately left off this list.
 */
const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ["hjkl", "move"],
  ["arrows", "move"],
  ["g", "get"],
  ["d", "drop"],
  ["i", "bag"],
  ["u", "use"],
  ["p", "log"],
  ["< > s", "stair"],
  [".", "rest"],
];

/**
 * A 7-wide x 9-tall block-capital glyph per letter of the game's title
 * ("SORL"), `#` filled / ` ` empty. Each letter carries its own jagged
 * `/#####\` / `\#####/` spike caps (S, O, L's crossbar, and R's crown) baked
 * directly into the glyph — a proper spiky/gothic crown-of-thorns look —
 * plus bold 2-cell-thick strokes so the shapes stay unambiguous at this
 * size. {@link showUsageScreen} still frames the whole banner with a
 * `/\/\` border on top of that.
 */
const TITLE_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  S: [
    "/#####\\",
    "##     ",
    "##     ",
    "##     ",
    "#######",
    "     ##",
    "     ##",
    "     ##",
    "\\#####/",
  ],
  O: [
    "/#####\\",
    "##   ##",
    "##   ##",
    "##   ##",
    "##   ##",
    "##   ##",
    "##   ##",
    "##   ##",
    "\\#####/",
  ],
  R: [
    "/#####\\",
    "##   ##",
    "##   ##",
    "##   ##",
    "#######",
    "##  #  ",
    "##   # ",
    "##    #",
    "#     #",
  ],
  L: [
    "##     ",
    "##     ",
    "##     ",
    "##     ",
    "##     ",
    "##     ",
    "##     ",
    "##     ",
    "\\#####/",
  ],
};
const TITLE_WORD = "SORL";

/** The title's rows, each letter's glyph joined with a 1-column gap. */
function buildTitleRows(): string[] {
  const height = TITLE_GLYPHS[TITLE_WORD[0]].length;
  return Array.from({ length: height }, (_, row) =>
    TITLE_WORD.split("").map((ch) => TITLE_GLYPHS[ch][row]).join(" ")
  );
}

/**
 * Draws `text` one cell at a time via `display.draw`, skipping blanks. Used
 * for anything with meaningful internal whitespace (the title's block
 * letters): rot.js's `drawText` word-wraps by tokenizing on whitespace,
 * which collapses runs of spaces and would mangle a glyph like `O`'s
 * `"#   #"` down to a single gap. Bypassing that tokenizer keeps every
 * column exactly where it's supposed to be.
 */
function drawArt(vp: Viewport, x: number, y: number, text: string, color: string): void {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") vp.display.draw(x + i, y, text[i], color, "#000");
  }
}

async function showUsageScreen(vp: Viewport): Promise<void> {
  vp.display.clear();

  const titleRows = buildTitleRows();
  const bannerWidth = titleRows[0].length;
  const titleX = Math.max(0, Math.floor((vp.width - bannerWidth) / 2));
  // A jagged spike border, above and below the title, for the spooky/moody
  // feel the plain block letters don't carry on their own.
  const spikes = Array.from({ length: bannerWidth }, (_, i) => (i % 2 === 0 ? "/" : "\\")).join("");

  let row = 1; // extra top margin, freed up by moving the controls list down.
  drawArt(vp, titleX, row++, spikes, "#a11");
  for (const line of titleRows) drawArt(vp, titleX, row++, line, "#eee");
  drawArt(vp, titleX, row++, spikes, "#a11");
  row++; // blank spacer between the title and the controls list.

  // Keys right-align on a shared column (one space left of where labels
  // start); labels all left-align on the column right after that gap. Both
  // columns are centred as one fixed-width block so every row lines up.
  // Each key is drawn on its own (at a per-row start x, not via leading-space
  // padding) because rot.js's drawText tokenizer trims leading spaces while
  // word-wrapping, which would otherwise silently defeat the right-align.
  const keyWidth = Math.max(...CONTROLS.map(([key]) => key.length));
  const labelWidth = Math.max(...CONTROLS.map(([, action]) => action.length));
  const blockX = Math.max(0, Math.floor((vp.width - (keyWidth + 1 + labelWidth)) / 2));
  const labelX = blockX + keyWidth + 1;

  CONTROLS.forEach(([key, action], i) => {
    const r = row + i;
    vp.display.drawText(blockX + keyWidth - key.length, r, `%c{#3f3}${key}%c{}`);
    vp.display.drawText(labelX, r, `%c{#ccc}${action}%c{}`);
  });
  vp.drawCentered(vp.height - 1, "[[SPACE]] continue");
  await waitForSpace();
}

async function showLeaderboardScreen(vp: Viewport, careers: Awaited<ReturnType<typeof fetchTopCareers>>): Promise<void> {
  vp.display.clear();
  drawLeaderboard(vp, careers);
  await waitForEnter();
}

async function showBackstoryScreen(g: Game, vp: Viewport): Promise<void> {
  vp.display.clear();
  const mid = Math.floor(vp.height / 2);

  vp.drawCentered(mid - 2, "%c{yellow}welcome, adventurer%c{}");
  vp.drawCentered(mid - 1, `you are %c{#3f3}${g.charName}%c{}`);

  const storyLines = wrapText(g.backstory, vp.width - BACKSTORY_MARGIN * 2);
  storyLines.forEach((line, i) => vp.drawCentered(mid + 1 + i, `%c{#aaa}${line}%c{}`));

  vp.drawCentered(mid + 2 + storyLines.length, "[[ENTER]] begin");
  await waitForEnter();
}

/** Renders the leaderboard as its own full-screen list, using the whole viewport height. */
function drawLeaderboard(vp: Viewport, careers: Awaited<ReturnType<typeof fetchTopCareers>>): void {
  vp.drawCentered(0, "%c{yellow}top careers%c{}");
  const availableRows = Math.max(0, vp.height - 3);
  if (careers === null) {
    if (availableRows >= 1) vp.drawCentered(2, "%c{#888}(inactive)%c{}");
  } else if (careers.length === 0) {
    if (availableRows >= 1) vp.drawCentered(2, "%c{#888}(NO ENTRIES)%c{}");
  } else {
    careers.slice(0, availableRows).forEach((c, i) => {
      vp.drawCentered(2 + i, `%c{#ccc}${c.name} L${c.charlevel} D${c.dunlevel} ${formatBane(c.bane)}${formatDate(c.when)}%c{}`);
    });
  }
  vp.drawCentered(vp.height - 1, "[[ENTER]] continue");
}

/** Swaps the "slain by" prefix a death-by-combat bane carries for a skull glyph; other banes (poison, ripe old age, ...) pass through unchanged. */
function formatBane(bane: string): string {
  const prefix = "slain by ";
  return bane.startsWith(prefix) ? `☠ ${bane.slice(prefix.length)}` : bane;
}

/** " DD/MM/YYYY" suffix for a row's date, or "" if `when` is missing/unparseable. */
function formatDate(when: string | undefined): string {
  if (!when) return "";
  const d = new Date(when);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return ` ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

async function waitForEnter(): Promise<void> {
  while ((await inputKey()).key !== "Enter") { /* keep waiting */ }
}

async function waitForSpace(): Promise<void> {
  while ((await inputKey()).key !== " ") { /* keep waiting */ }
}
