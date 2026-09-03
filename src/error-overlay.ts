/**
 * Global crash reporter. The game runs its whole turn loop as one long
 * chain of `await`ed promises (see ./gameloop.ts) — an uncaught exception
 * anywhere in it (a bad spell, a bug in AI, anything) silently kills that
 * chain. Nothing else in the game would ever tell the player; the screen
 * just stops responding to input, looking indistinguishable from "still
 * thinking". This installs a `window`-level catch-all for both thrown
 * errors and rejected promises that:
 *
 *  - leaves the browser's own default console logging alone (we never call
 *    `preventDefault()`), so the error is still fully visible in devtools
 *    exactly as before — nothing here suppresses that;
 *  - additionally shows a plain, unmissable full-screen overlay so the
 *    player themselves — not just whoever's watching devtools — knows the
 *    game broke, with the error message and a way to reload.
 *
 * Pure DOM, independent of the rot.js display/Viewport, since either one
 * may itself be the thing that just broke.
 */

let overlayShown = false;
let extraCount = 0;

/** Pulls a human-readable message (and stack, if any) out of anything `error`/`unhandledrejection` can hand us. */
function describeError(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message || reason.name, stack: reason.stack };
  }
  if (typeof reason === "string") return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

/** Installs the `<style>` block for the overlay exactly once. */
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    #crash-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(10, 0, 0, 0.88);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: monospace;
      color: #f5f5f5;
    }
    #crash-overlay .panel {
      max-width: min(720px, 90vw);
      max-height: 80vh;
      overflow-y: auto;
      background: #1a0a0a;
      border: 2px solid #c0392b;
      border-radius: 6px;
      padding: 20px 24px;
      box-shadow: 0 0 40px rgba(192, 57, 43, 0.5);
    }
    #crash-overlay h1 {
      margin: 0 0 12px;
      color: #ff6b5e;
      font-size: 1.2em;
      letter-spacing: 0.05em;
    }
    #crash-overlay .message {
      color: #ffd7d0;
      white-space: pre-wrap;
      margin: 0 0 10px;
    }
    #crash-overlay .stack {
      color: #b08b86;
      font-size: 0.85em;
      white-space: pre-wrap;
      margin: 0 0 16px;
      max-height: 30vh;
      overflow-y: auto;
    }
    #crash-overlay .extra {
      color: #d99;
      font-size: 0.85em;
      margin: 0 0 16px;
    }
    #crash-overlay button {
      font-family: inherit;
      font-size: 1em;
      background: #c0392b;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 8px 18px;
      cursor: pointer;
    }
    #crash-overlay button:hover { background: #e74c3c; }
  `;
  document.head.appendChild(style);
}

/** Builds and shows the overlay for the first crash; later crashes just bump a counter onto it instead of stacking overlays. */
function showOverlay(message: string, stack: string | undefined): void {
  if (overlayShown) {
    extraCount++;
    const extra = document.querySelector("#crash-overlay .extra");
    if (extra) extra.textContent = `+${extraCount} more error(s) since — see the console.`;
    return;
  }
  overlayShown = true;
  injectStyles();

  const overlay = document.createElement("div");
  overlay.id = "crash-overlay";
  overlay.innerHTML = `
    <div class="panel">
      <h1>The game has crashed</h1>
      <p class="message"></p>
      ${stack ? `<pre class="stack"></pre>` : ""}
      <p class="extra"></p>
      <button type="button">Reload</button>
    </div>
  `;
  // textContent (not innerHTML) for the actual error text, so a message that
  // happens to contain HTML-looking characters can't inject markup.
  overlay.querySelector(".message")!.textContent = message;
  if (stack) overlay.querySelector(".stack")!.textContent = stack;
  overlay.querySelector("button")!.addEventListener("click", () => location.reload());

  document.body.appendChild(overlay);
}

/**
 * Wires up the global `error`/`unhandledrejection` listeners. Call this
 * once, as early as possible (before anything else can throw) — see
 * ./index.ts.
 */
export function installGlobalErrorHandler(): void {
  window.addEventListener("error", (event) => {
    const { message, stack } = describeError(event.error ?? event.message);
    showOverlay(message, stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const { message, stack } = describeError(event.reason);
    showOverlay(message, stack);
  });
}
