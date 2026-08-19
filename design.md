# 2026rt — Roguelike Foundations

## Original instruction

> Let's do the foundations of a roguelike, using rot.js, TypeScript and Parcel.
> We will just have an @-sign moving around the screen, using keys HJKL and
> cursor keys. If he reaches the edges, his coordinates wrap around. The entire
> viewport is 32 wide and 24 chars high. The rot.js canvas must expand to use up
> the available space, though preserving aspect ratio. It should use the
> infamous open source font SQUARE.ttf.

## Goals

- Establish a minimal, working roguelike foundation that can grow later.
- Keep the stack small and conventional: **rot.js + TypeScript + Parcel**.
- Render a single `@` glyph the player can move around a fixed grid.

## Requirements & how they are met

| Requirement | Implementation |
| --- | --- |
| Built with rot.js | `ROT.Display` renders the grid — see [src/index.ts](src/index.ts). |
| TypeScript | All game logic lives in [src/index.ts](src/index.ts); config in [tsconfig.json](tsconfig.json). |
| Parcel | Parcel bundles the app; entry point is [src/index.html](src/index.html). |
| `@`-sign player | Drawn each frame at the player's tile coordinates. |
| HJKL movement | `h`/`j`/`k`/`l` mapped to left/down/up/right. |
| Cursor-key movement | `ArrowLeft`/`ArrowDown`/`ArrowUp`/`ArrowRight` share the same deltas. |
| Edge wrapping | `wrap()` uses modulo so leaving one edge re-enters the opposite one. |
| 32×24 viewport | `WIDTH = 32`, `HEIGHT = 24` tiles. |
| Canvas fills space, keeps aspect ratio | `fitCanvas()` scales the canvas via CSS to the largest 32:24 (4:3) rectangle that fits the window; re-run on `resize`. |
| SQUARE.ttf font | `@font-face` in [src/style.css](src/style.css) loads `src/fonts/square.ttf`; the display waits for the font (`document.fonts.load`) before rendering. |

## Architecture

```
src/
  index.html    Parcel entry; hosts #game container.
  index.ts      Game bootstrap, input handling, rendering, canvas fitting.
  style.css     Font face, full-viewport layout, crisp pixel scaling.
  fonts/
    square.ttf  The "SQUARE" roguelike font (CC BY 3.0).
```

### Coordinate model

The world is exactly the viewport: a `WIDTH × HEIGHT` grid of tiles. The player
holds integer tile coordinates. On each accepted key press the movement delta is
applied and then wrapped into `[0, WIDTH)` / `[0, HEIGHT)`, producing toroidal
(edge-wrapping) movement.

### Scaling model

rot.js draws to a canvas at a fixed intrinsic pixel resolution. To "expand to use
up the available space" without distorting glyphs, the canvas is stretched purely
in CSS to the largest rectangle that (a) fits the window and (b) matches the
32:24 aspect ratio. `image-rendering: pixelated` keeps the upscaled glyphs crisp.

## Running

```bash
npm install
npm start      # Parcel dev server with hot reload
npm run build  # Production bundle in dist/
```

## Assets & licensing

- **SQUARE** font by Wouter van Oortmerssen — Creative Commons Attribution 3.0
  Unported (CC BY 3.0). Source: <https://strlen.com/square/>.

## Future foundations (not yet implemented)

- A real map layer (walls/floors) instead of an empty field.
- A scheduler / turn engine (`ROT.Engine`, `ROT.Scheduler`).
- Field-of-view and lighting (`ROT.FOV`).
- Entities beyond the player.
