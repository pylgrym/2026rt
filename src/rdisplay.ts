import * as ROT from "rot-js";
import { initGfx } from "./juice-gfx";

/**
 * Creates, configures, and mounts the rot.js display for the game.
 *
 * Waits for the bundled SQUARE font to load (so rot.js measures glyphs
 * correctly), builds a {@link ROT.Display} sized to the given viewport
 * dimensions, appends its canvas to the given container element, and
 * keeps the canvas scaled to the window (now and on every resize).
 *
 * @param width Viewport width, in tiles (characters).
 * @param height Viewport height, in tiles (characters).
 * @param mountId Id of the element to append the canvas to.
 * @returns The configured, mounted display.
 */
export async function createDisplay(
  width: number,
  height: number,
  mountId = "game",
): Promise<ROT.Display> {
  // Ensure the SQUARE font is ready before rot.js measures glyphs.
  await document.fonts.load('16px "Square"');

  const display = new ROT.Display({
    width,
    height,
    fontFamily: "Square",
    fontSize: 20,
    forceSquareRatio: true,
    bg: "#000",
    fg: "#fff",
  });

  const canvas = display.getContainer() as HTMLCanvasElement;
  document.getElementById(mountId)!.appendChild(canvas);

  // Hand the graphics-juice layer the canvas + tile dimensions so it can
  // overlay spark/splatter effects aligned to the terminal grid.
  initGfx(canvas, width, height);

  fitCanvas(canvas);
  window.addEventListener("resize", () => fitCanvas(canvas));

  return display;
}

/**
 * Scales the rot.js canvas to fill the available window space while
 * preserving the viewport's aspect ratio. rot.js keeps the canvas at its
 * intrinsic pixel resolution; we only stretch it via CSS.
 */
function fitCanvas(canvas: HTMLCanvasElement): void {
  const aspect = canvas.width / canvas.height;
  const availW = window.innerWidth;
  const availH = window.innerHeight;

  let width = availW;
  let height = width / aspect;
  if (height > availH) {
    height = availH;
    width = height * aspect;
  }

  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;
}
