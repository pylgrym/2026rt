import type { Pos } from "./dmap";

/**
 * Colours dungeon walls by their distance from the map's centre: gray at
 * the centre, shading to blue near the edges/corners, so a glance at the
 * wall colour around the player hints at how deep into the map they are —
 * the same "centre vs. edge" gradient the monster level system already
 * uses (see ../progression.md), just as a visual instead of a difficulty.
 *
 * This isn't meant to be a precise measurement, just a coarse, cheap hint,
 * so distance is bucketed into a small fixed-size palette precomputed once
 * per map. Colouring a wall tile at draw time only ever squares its offset
 * from the centre (no sqrt) and walks a tiny precomputed threshold array to
 * find its bucket — no colour maths, and no per-tile sqrt, on the hot path.
 *
 * The bucket thresholds are spaced at equal steps of *real* distance (their
 * sqrt is taken once, up front, while building the table) rather than
 * equal steps of squared distance — bucketing directly on squared distance
 * would give a quadratic ramp that stays essentially at bucket 0 for most
 * of the map's radius and only ramps up right near the edge, which reads
 * as "always gray" during ordinary play on a map this large.
 */

/** Gray at the map's centre. */
const CENTER_COLOR: RGB = [0x88, 0x88, 0x88];
/** Blue at the map's edges/corners. */
const EDGE_COLOR: RGB = [0x33, 0x55, 0xee];

/** Number of precomputed gradient steps. Coarse on purpose — see above. */
const BUCKETS = 24;

type RGB = readonly [number, number, number];

export interface DistanceShader {
  /** The gray-to-blue wall colour for the tile at `pos`, as `#rrggbb`. */
  colorAt(pos: Readonly<Pos>): string;
}

/**
 * Builds a {@link DistanceShader} for a `width` x `height` map: a small
 * palette lerped from {@link CENTER_COLOR} to {@link EDGE_COLOR}, plus a
 * matching array of squared-distance bucket thresholds, both precomputed
 * once so `colorAt` is just a square, a short array walk, and a lookup.
 */
export function createDistanceShader(width: number, height: number): DistanceShader {
  const center: Pos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // The farthest any tile can be from the centre is one of the four
  // corners; with `center` computed by flooring, the bottom-right corner
  // is always the farthest (or tied for it), so we only need to check that
  // one rather than all four.
  const maxDist = Math.hypot(width - center.x, height - center.y);

  // Bucket `i` covers real distances up to `thresholdsSq[i]` (squared).
  // Spacing the thresholds evenly in real distance (then squaring each one
  // up front) is what makes the ramp linear in distance instead of in
  // distance-squared.
  const palette: string[] = new Array(BUCKETS);
  const thresholdsSq: number[] = new Array(BUCKETS);
  for (let i = 0; i < BUCKETS; i++) {
    const t = i / (BUCKETS - 1);
    palette[i] = toHex(lerp(CENTER_COLOR, EDGE_COLOR, t));
    thresholdsSq[i] = sq(maxDist * t);
  }

  return {
    colorAt(pos: Readonly<Pos>): string {
      const distSq = sq(pos.x - center.x) + sq(pos.y - center.y);
      let idx = 0;
      while (idx < BUCKETS - 1 && distSq > thresholdsSq[idx]) idx++;
      return palette[idx];
    },
  };
}

function sq(n: number): number {
  return n * n;
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function toHex([r, g, b]: RGB): string {
  const ch = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}
