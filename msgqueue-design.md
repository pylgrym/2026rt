# Message Queue Design

## Purpose

Refactor the message log so that `msg()` no longer draws immediately. Instead
messages accumulate in a `MsgQueue` during a turn (player action + all NPC
actions), and are presented in a controlled way afterwards:

- All-but-the-last message are shown one at a time, each waiting for a key press.
- The single remaining ("final") message is shown as part of the normal viewport
  render, and persists on screen until the player commits their next real turn.

## Components

### `MsgQueue`

Fields:

- `queue: string[]` — pending messages for the current turn.
- `finalDisplayMessage: string` — the persistent last message that the viewport
  renders every frame. This is **separate** from `queue`; it is what survives
  across the multiple redraws that can happen while the player makes false-start
  inputs.

The `MsgQueue` is **owned by the `Game` model** and reached as `game.log` (e.g.
`game.log.msg("you wait")`). There is no module-level singleton; anything that
needs the log takes the `Game` (or `game.log`).

### Public API (`MsgQueue`, reached via `game.log`)

- `setDisplay(display)` — registers the rot.js display used for drawing. Wired
  up once by `Viewport.create`.
- `msg(text)` — **enqueues** `text` (does not draw) and immediately
  `console.log`s it to the dev console for diagnostics during development.
- `hasQueued(): boolean` — `true` when at least one message is queued.
- `showQueuedMessages(waitKey): Promise<void>` — the display-and-wait loop.
- `commitFinal(): void` — transfers the last queued message into
  `finalDisplayMessage` and clears the queue.
- `drawFinalMessage(): void` — renders `finalDisplayMessage` on the message row.

## The message row

Messages render on the **top row (row 0)** of the display, padded to the full
width so a shorter message fully overwrites a previous, longer one. This matches
the pre-refactor behaviour. The row overlaps the top map row (acceptable, as
before).

## `showQueuedMessages(waitKey)`

```
while (queue.length >= 2) {
  const text = queue.shift();      // remove the front message
  const n = queue.length;          // messages still remaining after this one
  draw `(${n})${text}` on row 0 (padded);
  await waitKey();                 // wait for ANY key press
}
```

- If the queue starts with 0 or 1 messages, the loop body never runs and the
  function returns immediately.
- The loop always terminates with exactly 0 or 1 messages left in `queue`.

**`n` numbering:** `n` is the count of messages that remain queued *after* the one
currently being shown. Example: queue `[A, B]` → show `(1)A`, wait, leaving `[B]`.
Example: queue `[A, B, C]` → `(2)A`, `(1)B`, leaving `[C]`.

## `commitFinal()`

```
finalDisplayMessage = (queue.length === 1) ? queue[0] : "";
queue.length = 0;                  // clear the collection
```

This is the "transfer" step from the design brief: rather than merely clearing
the queue, the final text is moved into `finalDisplayMessage`. After this call the
`queue` is empty and the viewport draws exclusively from `finalDisplayMessage`.
When there was no final message, `finalDisplayMessage` becomes `""`, which clears
the old message from the row on the next redraw.

## Viewport integration

`Viewport.draw()` renders the map, mobs, and player, then calls
`drawFinalMessage()` last so the persistent final message overlays row 0. Because
the viewport reads only `finalDisplayMessage` (never `queue`), it can be redrawn
any number of times safely.

## Game loop

```
viewport.draw(game)                         // initial frame
while (true) {
  const key = await inputKey()
  if (!isActionKey(key)) continue           // false start: nothing changes

  const moved = await movePlayer(game, key) // may enqueue a bump / "you wait"
  if (moved) await npcTurns(game)           // NPC turns may enqueue messages

  if (!moved && !game.log.hasQueued()) continue  // pure false start (wall):
                                            // preserve finalDisplayMessage & frame

  await game.log.showQueuedMessages(inputKey)    // show all but last, one per keypress
  game.log.commitFinal()                    // last queued -> finalDisplayMessage (or "")
  viewport.draw(game)                       // redraw new state + final message
}
```

### Why this is robust

- **False starts** (unrecognised keys, or a blocked move that produced no
  message) hit a `continue` *before* `commitFinal()`, so `finalDisplayMessage`
  and the on-screen frame are left untouched. The last real message keeps showing.
- **A committed turn** (the player moved, or an action produced a message) always
  runs `commitFinal()`, which overwrites `finalDisplayMessage` — clearing the
  previous turn's message and installing this turn's final one (or `""`).
- The queue collection is only ever consumed inside `showQueuedMessages()` and
  `commitFinal()`. All viewport redraws source from `finalDisplayMessage`, so
  redrawing multiple times during the input wait cannot hit a
  "when-was-the-queue-cleared" edge case.

## Turn / bump semantics

Waiting in place (the `.` key) **counts as a turn**: `movePlayer` enqueues
`you wait` and returns `true`, so `npcTurns` runs.

Bumping a mob (`player pushes mob`) **counts as taking a turn**: `movePlayer`
returns `true`, so `npcTurns` runs and the mobs act. The bump message and any
mob messages flow through the queue and are presented normally; the last one
becomes the final message.

Walking into a wall does **not** count as a turn and produces **no message**:
`movePlayer` returns `false` and nothing is enqueued, so the loop hits the
`!moved && !game.log.hasQueued()` guard, leaves the frame and final message
untouched, and polls for input again.
