/**
 * All graphical "juice" lives here: transient flash / spark / splatter
 * animations overlaid on top of the rot.js terminal. The rest of the
 * codebase only ever makes single function calls (e.g. {@link spark},
 * {@link splatter}) and never touches the DOM or coordinate maths directly.
 *
 * Effects are plain DOM elements positioned with `position: fixed` over the
 * game canvas. We map a map-space tile to on-screen pixels using the
 * canvas's live bounding rect, so effects stay aligned even though the
 * canvas is CSS-scaled to fit the window.
 */

import type { Pos } from "./dmap";

/** The mounted rot.js canvas we overlay effects on. */
let canvasEl: HTMLCanvasElement | null = null;
/** Viewport size in tiles — needed to turn a tile into a screen fraction. */
let tilesWide = 0;
let tilesHigh = 0;

/**
 * Wires the graphics layer to the game canvas. Called once, right after the
 * rot.js display is created and mounted. Without this, effect calls are
 * harmless no-ops (e.g. under a test runner with no DOM).
 */
export function initGfx(
  canvas: HTMLCanvasElement,
  viewportTilesWide: number,
  viewportTilesHigh: number
): void {
  canvasEl = canvas;
  tilesWide = viewportTilesWide;
  tilesHigh = viewportTilesHigh;
  injectStyles();
}

/**
 * Where a map-space tile lands on screen, in fixed/viewport pixels, plus the
 * on-screen size of one tile. Returns `null` when the graphics layer isn't
 * initialised or the tile falls outside the visible viewport.
 */
interface ScreenSpot {
  px: number;
  py: number;
  tilePx: number;
}

/**
 * Converts a map-space `target` tile to an on-screen pixel spot, given the
 * `camera` tile that sits at the centre of the viewport (the player). The
 * player is always centred, so screen-tile = target − camera + halfViewport.
 */
function locate(target: Pos, camera: Pos): ScreenSpot | null {
  if (!canvasEl) { return null; }
  const sx = target.x - camera.x + Math.floor(tilesWide / 2);
  const sy = target.y - camera.y + Math.floor(tilesHigh / 2);
  if (sx < 0 || sy < 0 || sx >= tilesWide || sy >= tilesHigh) { return null; }

  const rect = canvasEl.getBoundingClientRect();
  return {
    px: rect.left + ((sx + 0.5) / tilesWide) * rect.width,
    py: rect.top + ((sy + 0.5) / tilesHigh) * rect.height,
    tilePx: rect.width / tilesWide,
  };
}

/**
 * A cheery burst of sparks on the tile that just got struck — call whenever
 * a combatant lands a bump/attack, passing the defender and the player
 * (camera centre).
 */
export function spark(target: Pos, camera: Pos): void {
  const spot = locate(target, camera);
  if (!spot) { return; }
  flash(spot, "radial-gradient(circle, #fff 0%, #ffdf6b 45%, rgba(255,190,60,0) 70%)", 220);
  burst(spot, {
    count: 9,
    colors: ["#fff3b0", "#ffd23f", "#ffeffb"],
    minSize: 0.10,
    maxSize: 0.20,
    spread: 1.1,
    gravity: 0,
    durMs: 320,
  });
}

/**
 * A gory splatter for when a mob dies and is removed from the board. (Mob
 * destruction isn't wired up yet, but the effect is ready to call.)
 */
export function splatter(target: Pos, camera: Pos): void {
  const spot = locate(target, camera);
  if (!spot) { return; }
  flash(spot, "radial-gradient(circle, #c1121f 0%, #7a0b13 55%, rgba(122,11,19,0) 72%)", 380);
  burst(spot, {
    count: 16,
    colors: ["#c1121f", "#9d0208", "#e01e37", "#6a040f"],
    minSize: 0.12,
    maxSize: 0.26,
    spread: 1.5,
    gravity: 0.9, // droplets arc downward as they fly out
    durMs: 620,
  });
}

/** Options controlling a particle burst. */
interface BurstOpts {
  count: number;
  colors: string[];
  /** Particle diameter as a fraction of a tile. */
  minSize: number;
  maxSize: number;
  /** How far particles fly, in tiles. */
  spread: number;
  /** Downward drift added to travel, in tiles (0 = none). */
  gravity: number;
  durMs: number;
}

/** Spawns a ring of short-lived particles flying outward from `spot`. */
function burst(spot: ScreenSpot, o: BurstOpts): void {
  const { px, py, tilePx } = spot;
  for (let i = 0; i < o.count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = tilePx * o.spread * (0.45 + Math.random() * 0.55);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist + o.gravity * tilePx;
    const size = tilePx * (o.minSize + Math.random() * (o.maxSize - o.minSize));

    const el = document.createElement("div");
    el.className = "juice-particle";
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = o.colors[(Math.random() * o.colors.length) | 0];
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    el.style.animationDuration = `${o.durMs}ms`;
    spawn(el, o.durMs);
  }
}

/** Spawns a single expanding, fading flash blob centred on `spot`. */
function flash(spot: ScreenSpot, background: string, durMs: number): void {
  const size = spot.tilePx * 1.6;
  const el = document.createElement("div");
  el.className = "juice-flash";
  el.style.left = `${spot.px}px`;
  el.style.top = `${spot.py}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background = background;
  el.style.animationDuration = `${durMs}ms`;
  spawn(el, durMs);
}

/** Appends an effect element and removes it once its animation ends. */
function spawn(el: HTMLElement, durMs: number): void {
  document.body.appendChild(el);
  const remove = () => el.remove();
  el.addEventListener("animationend", remove);
  // Safety net in case animationend never fires (e.g. tab backgrounded).
  window.setTimeout(remove, durMs + 100);
}

/** Injects the effect keyframes/stylesheet exactly once. */
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected || typeof document === "undefined") { return; }
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .juice-particle, .juice-flash {
      position: fixed;
      pointer-events: none;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      will-change: transform, opacity;
      z-index: 9999;
    }
    .juice-particle {
      animation-name: juice-fly;
      animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
      animation-fill-mode: forwards;
    }
    .juice-flash {
      animation-name: juice-pop;
      animation-timing-function: ease-out;
      animation-fill-mode: forwards;
    }
    @keyframes juice-fly {
      from { transform: translate(-50%, -50%) translate(0, 0) scale(1); opacity: 1; }
      to   { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.25); opacity: 0; }
    }
    @keyframes juice-pop {
      from { transform: translate(-50%, -50%) scale(0.3); opacity: 0.9; }
      60%  { opacity: 0.7; }
      to   { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
