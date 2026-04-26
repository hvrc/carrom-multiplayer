# Carrom Multiplayer — Development Plan

## Decisions & Ground Rules

| Topic | Decision |
|---|---|
| Physics authority | **Server-authoritative** — client sends flick input, server runs physics, broadcasts final state |
| Queen rules | **Standard** — pocket queen, then must cover (pocket another coin same/next turn) or queen returns |
| Player count | **2-player only** — polish before expanding |
| Rendering | **Raw Canvas2D** — remove Phaser dependency |
| Mobile | **Nice to have** — desktop first |
| Persistence | **In-memory** — no database needed for now |

---

## Phase 0 — Critical Bug Fixes
> Fast, isolated fixes. Do these before anything else.

- [x] Fix typo: `room.debs` → `room.debts` in `server/index.js` (~L930, `payDebt` handler)
- [x] Re-enable all commented-out server-side room validation (`if (!rooms.has(roomName))` blocks)
- [x] Remove unused `coinsMove` socket listener on server (client never emits it)
- [ ] Remove `sliderValue`, `sliderMin`, `sliderMax` from `Hand.js` (unused)
- [x] Remove `phaser` from `client/package.json` dependencies and run `npm install`
**Estimated effort:** ~1–2 hours

---

## Phase 1 — Server-Authoritative Physics
> The most important architectural change. Fixes the core multiplayer sync problem.

### Problem
Both clients independently run physics. Floating-point divergence means coins end up in different positions on each screen — the game is fundamentally broken for multiplayer.

### New Architecture

```
Client A                    Server                      Client B
--------                    ------                      --------
User flicks striker
→ emit "flick" { angle, force }
                    Receive flick
                    Run full physics loop until all objects stop
                    Compute: pocketed coins, scores, whose turn, queen state
                    → emit "gameState" { coins, score, turn, pocketed, queenState }
                    ←────────────────────────────────────────────
Receive gameState                               Receive gameState
Render from server state                        Render from server state
```

### Tasks

- [ ] **Port physics to server** — copy `Physics.js` logic into `server/physics.js` (pure JS, no DOM/canvas dependencies)
- [ ] **Server game loop** — after receiving a `flick` event, run physics tick by tick until all velocities are below threshold, collect results
- [ ] **Define `gameState` payload** — canonical shape:
  ```js
  {
    coins: [{ id, x, y, color, pocketed }],
    striker: { x, y },
    turn: "creator" | "joiner",
    pocketed: [{ id, color, pocketedBy }],
    scores: { creator: number, joiner: number },
    debts: { creator: number, joiner: number },
    queenState: "on_board" | "pocketed_uncovered" | "covered",
    continuedTurn: boolean,   // true if player pocketed a coin and goes again
    strikerPocketed: boolean, // triggers penalty
    gameOver: boolean,
    winner: null | "creator" | "joiner"
  }
  ```
- [ ] **Client: remove independent physics from flick flow** — on flick, just emit `{ angle, force }` to server, wait for `gameState`
- [ ] **Client: render from `gameState`** — update all refs from server payload instead of computing locally
- [ ] **Keep client physics only for local preview** (optional, later) — optimistic rendering can be added in Phase 5 if lag is noticeable
- [ ] **Remove parallel `strikerAnimation` / `strikerMove` events** — replace with single `gameState` broadcast

**Estimated effort:** 3–5 hours

---

## Phase 2 — Game Flow Correctness
> Fix game rules and turn logic so the game plays correctly end-to-end.

### Turn Race Condition Fix
- [ ] Remove `movementStopConfirmed` client-to-client pattern — server is now authority, so this is obsolete after Phase 1
- [ ] Server emits `gameState` only after physics fully resolves — no need for confirmation handshake

### Queen Mechanics (Standard Rules)
State machine for queen:
```
on_board → [player pockets queen] → pocketed_uncovered
pocketed_uncovered → [player pockets another coin same turn] → covered (queen stays pocketed, +5 pts)
pocketed_uncovered → [turn ends without covering] → on_board (queen respawns at center, no points)
```
- [ ] Track `queenState` on server (not client)
- [ ] On pocket event: if queen pocketed, set `queenState = "pocketed_uncovered"`, flag turn as "must cover"
- [ ] If another coin pocketed in same turn while `pocketed_uncovered` → set `queenState = "covered"`, award queen points
- [ ] If turn ends while `pocketed_uncovered` → reset queen to center, set `queenState = "on_board"`, no points awarded
- [ ] Remove `hasPocketedQueen` / `hasCoveredQueen` from client `Player.js` — server owns this state

### Debt System (Server as Single Source of Truth)
- [ ] Remove debt calculation from client `Manager.js` — server is authority
- [ ] Server computes debt changes after each turn, sends via `gameState`
- [ ] Client only displays, never calculates debt
- [ ] Define debt rules clearly in server code comments:
  - Striker pocketed: opponent gets +1 coin from your pocketed pile (or debt if pile empty)
  - Opponent's coin pocketed: goes back on board, no direct debt
  - Last opponent coin pocketed: 3-point penalty

### Striker Penalty / Coin Respawn
- [ ] On `strikerPocketed: true` in gameState: client animates striker going into pocket
- [ ] Server: if player has pocketed coins, return one to center; else increment debt
- [ ] Wire respawn animation in `Pocket.js`

**Estimated effort:** 3–4 hours

---

## Phase 3 — Code Cleanup & Refactor
> Make the codebase maintainable before adding more features.

### Board.jsx (600+ lines → split into focused modules)
- [ ] Extract `useGameCanvas()` hook — canvas setup, context, scaling, pocket array
- [ ] Extract `useGameSocket()` hook — all socket event listeners and emitters
- [ ] `Board.jsx` becomes a thin coordinator that uses these hooks
- [ ] Target: Board.jsx under 200 lines

### Naming & Clarity
- [ ] Rename `handRef` → `handManagerRef`
- [ ] Rename `animationRef` → `gameLoopRef`
- [ ] Rename `continuedTurnsRef` → `turnsInARowRef`

### Socket Event Audit
- [ ] List every `socket.on` and `socket.emit` across client and server
- [ ] Remove any with no corresponding sender/receiver
- [ ] Document remaining events in a comment block at top of `server/index.js`

### Dead Code Removal
- [ ] Remove commented-out blocks in `Animation.js`
- [ ] Remove Lorem Ipsum placeholder in `Board.jsx`
- [ ] Remove inline debug console.logs

**Estimated effort:** 3–4 hours

---

## Phase 4 — UI/UX Polish
> Make the game feel complete and readable.

- [ ] **Turn indicator** — clear visual showing whose turn it is (not just a text label, highlight the active player's side)
- [ ] **Pocketed coin tally** — show count of pocketed white/black/queen per player
- [ ] **Score display** — current score, debt owed, max score to win
- [ ] **Game over screen** — winner announcement, final scores, "play again" button
- [ ] **Error boundary** — catch canvas errors, show "Something went wrong — refresh" UI
- [ ] **Socket disconnect UI** — show "Opponent disconnected" overlay, option to wait or exit
- [ ] **Room state on join** — if player joins a room mid-game, show waiting screen rather than broken board

**Estimated effort:** 3–5 hours

---

## Phase 5 — Mobile Support *(Nice to Have)*
> Desktop is primary, but touch should work.

- [ ] Replace invisible slider with a visible arc-based power selector on mobile
- [ ] Add `touchstart` / `touchmove` / `touchend` handlers to flick mechanic
- [ ] Test on iOS Safari and Android Chrome
- [ ] Lock to landscape orientation or adapt layout for portrait
- [ ] Increase tap target sizes for room join buttons

**Estimated effort:** 3–4 hours

---

## Backlog / Not Planned
- 4-player mode
- Phaser migration
- Database / game state persistence
- AI opponent
- Leaderboard / accounts
- Sound effects (can revisit after Phase 4)
- Talc powder particle effects

---

## Suggested Order of Work

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5 (optional)
~2h          ~5h          ~4h          ~4h          ~5h          ~4h
```

Total estimated: ~20–24 hours of focused work to reach a polished, correct 2-player game.
