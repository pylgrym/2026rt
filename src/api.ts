/**
 * Talks to the Python backend's CAREERS leaderboard API (see
 * ../server/app.py and ../leaderboard-design.md). Both calls degrade
 * silently on failure — a backend hiccup must never block the welcome
 * screen or the game-over flow.
 */
export interface CareerEntry {
  name: string;
  charlevel: number;
  bane: string;
  dunlevel: number;
  when?: string;
}

/**
 * The top-careers leaderboard, or `null` if the backend is unreachable/not
 * running (a 404, or the `fetch` itself throwing) — distinct from an empty
 * `[]`, which means the backend answered but nobody has a career yet. See
 * ./welcome.ts's `drawLeaderboard`, which shows "(inactive)" only for `null`.
 */
export async function fetchTopCareers(): Promise<CareerEntry[] | null> {
  try {
    const res = await fetch("/api/careers/top20");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function registerCareer(entry: CareerEntry): Promise<void> {
  try {
    await fetch("/api/careers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    // Best-effort: losing a leaderboard entry is not worth surfacing to the player.
  }
}
