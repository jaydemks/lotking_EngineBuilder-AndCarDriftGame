# Soccer Match 11 v 11 — template, tactics model and team AI

The `soccer-match-11v11` level template builds a complete eleven-a-side match out
of ordinary editable `scene.added` entries: a regulation stadium, two goal
sensors, a match ball, a Match Director, two Team Managers and **22 individually
editable Soccer Pawn Logic Elements**.

Nothing in the mode is hard-coded gameplay. Formation, tactics, kit colours,
difficulty, match rules, clock and even the AI frame budget are exposed graph
variables. Change them in the editor, press Play, and the runtime director reads
them straight back out of the scene.

---

## 1. Module map and required load order

| # | Module | Depends on | Provides |
|---|--------|-----------|----------|
| 1 | `js/runtime/soccer-tactics.js` | — | `LK_RUNTIME_SOCCER_TACTICS`: formations, roles, tactical presets, shape solver, defensive line, offside, support spots |
| 2 | `js/runtime/soccer-team-ai.js` | 1, pawn registry | `LK_RUNTIME_SOCCER_TEAM_AI`: budgeted team + player AI (`GAME.systems.soccerTeamAI`) |
| 3 | `js/runtime/soccer-match-flow.js` | — | `LK_RUNTIME_SOCCER_MATCH`: clock, score, restarts, half/full time, tie-break |
| 4 | `js/runtime/penalty-flow.js` | — | `LK_RUNTIME_PENALTY_FLOW`: shootout series, kick sequence, keeper read, pressure, cameras |
| 5 | `js/runtime/soccer-stadium.js` | — | pitch, goals, stands, floodlights as editor descriptors |
| 6 | `js/logic/logic-templates-soccer.js` | — | the Player Soccer / Ball / Goal / Penalty Manager Logic Element templates |
| 7 | `js/runtime/soccer-match-level-template.js` | 1–6 + `LK_LEVEL_TEMPLATES` | the `soccer-match-11v11` level template and its runtime director |

**Load order rule:** `soccer-tactics.js` must load before `soccer-team-ai.js`
and before `soccer-match-level-template.js`. The level template must load after
`js/engine/level-template-registry.js`, `soccer-stadium.js` and
`logic-templates-soccer.js`, exactly like the other level templates.

`soccer-team-ai.js` degrades safely: if `soccer-tactics.js` is not present its
`boot()` is a no-op instead of throwing at page load. Any *use* of an unknown
formation, role, tactic, phase, side or duty throws — there is no silent default.

---

## 2. What the template places

| Group | Entries |
|-------|---------|
| `01 Stadium` | the whole `soccer-stadium.js` output as plain primitives and lights |
| `02 Goals & Ball` | 2 × Soccer Goal Frame sensors (`match-goal-north` / `match-goal-south`), 1 × Soccer Ball (`match-ball`) |
| `03 Match Director` | rules, clock, tie-break and the AI performance budget |
| `04 Home Team` | Team Manager + 11 Soccer Pawn Logic Elements |
| `05 Away Team` | Team Manager + 11 Soccer Pawn Logic Elements |

Home defends south (−z) and attacks north; away is the exact mirror. Slot 0 is
always the goalkeeper.

### Editable variables

*Match Director* — `soccerMatchDirector.*`: halves, minutes per half, real
seconds per match minute, stoppage, restart delay, kickoff team, throw-ins,
goal kicks, corners, offside, fouls, cards, substitutions, extra time,
penalties on draw, pitch size, plus `ai.tickHz`, `ai.playersPerTick`, `ai.lod`.

*Team Manager* — `soccerTeamSetup.*`: name, short name, formation, tactical
preset and the seven individual dials (mentality, defensive line, width,
compactness, pressing, tempo, support runs), offside trap, AI difficulty,
controller player id, starting controlled slot, automatic switching, and the
four kit colours.

*Each player* — everything the shipped Player Soccer template exposes (role,
movement, animations, appearance, camera, shot tuning) **plus**
`soccerTeamPlayer.*`: team, formation slot, tactical role, shirt number, "driven
by team AI", and the seven attributes (pace, stamina, shooting, passing,
tackling, positioning, keeping).

Edited variables win over the authored descriptor at Play time:
`overlayBindings()` re-applies every `binding` that starts with the descriptor
key before the systems are configured.

---

## 3. The positional model (`soccer-tactics.js`)

Normalised pitch space is `(spread, depth)`: spread −1 = west touchline,
+1 = east; depth 0 = own goal line, 1 = opponent goal line. One table therefore
serves both teams — `toWorld()` mirrors for the away side.

* **Formations** — `4-4-2`, `4-3-3`, `4-2-3-1`, `3-5-2`, `5-3-2`, `3-4-3`,
  `4-1-4-1`. Each is eleven slots ordered keeper → defence → midfield → attack.
  `formationSlots()` returns the in-play base shape; `kickoffSlots()` compresses
  it into the team's own half for a restart.
* **Roles** — GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LM, RM, LW, RW, CF, ST. Each
  carries a `line`, the Soccer Pawn role it maps onto, and seven 0..1 attributes.
* **Tactical presets** — `parkTheBus`, `counter`, `balanced`, `possession`,
  `gegenpress`, `allOutAttack`; each is a set of eight dials an author can then
  override individually.
* **Phases** — `possession`, `transitionAttack`, `transitionDefence`,
  `outOfPossession`. Each phase supplies a depth push, a width scale, a ball
  attraction and a line compaction, so one formation produces three shapes.
* **`shapeTarget()`** — slot + tactics + phase + ball → one normalised target.
  Per-unit weights mean the attack rides the ball while the defence holds the
  line, instead of the whole team sliding as a rigid grid.
* **`defensiveLineDepth()`** — dial + ball depth + optional offside trap, clamped
  to a playable band.
* **`offsideDepth()` / `isOffside()`** — second-last defender, and the ball can
  never be overtaken as the onside reference.
* **`supportSpotScore()` / `passingLaneOpen()` / `markingTarget()`** — the
  attacking-support, passing and containment primitives the AI scores against.

---

## 4. Team AI and the performance contract (`soccer-team-ai.js`)

Tiered AI: a **team layer** decides phase of play, defensive line, offside line
and duties; a **player layer** turns one duty into one movement command.

Duties, in assignment (priority) order: `keeper`, `carrier`, `firstPress`,
`cover`, `marker`, `support`, `shape`.

The 22-pawn budget is honoured by four mechanisms:

1. **Fixed tick.** Decisions run at `tickHz` (default 12 Hz), never per frame,
   with a catch-up cap of 2 ticks so a stalled frame cannot replay a backlog.
2. **Round-robin budget.** Each tick re-decides at most `playersPerTick`
   (default 6) players. Duty-critical players — keeper, ball carrier, first
   presser — are always decided, whatever the budget.
3. **Behaviour LOD.** Players beyond 44 m from the ball drop to `far` and think
   one tick in three.
4. **Allocation-free frame loop.** The per-frame pass only steers headings and
   writes `x`/`z`/`sprint` into the command object the Pawn already owns.
   Opponent lists, support-spot candidates and the HUD snapshot all use pooled
   buffers.

Roster discovery is a rescan every 1.5 s over `GAME.pawns.list()`, matching
Soccer Pawns to their `graph.soccerTeamPlayer` descriptor. Records are stable
across rescans, so stamina and cooldowns survive.

`snapshot()` returns a pooled view (players, per-team phase/line/offside, ball,
pitch) for a scoreboard, a tactical radar or a minimap.

---

## 5. Penalty shootout (`penalty-flow.js`, schema v2)

The standalone shootout is now a directed sequence, not a single button press.

* **Kick sequence** — `aim({aimX, aimY, power, curve})` → `beginRunUp(seconds)`
  → `feint()` (max 2, only before 80 % of the run-up) → `strike()`. Every step
  is optional; `strike()` alone still produces a legal penalty. Overrunning the
  run-up strikes automatically instead of stalling.
* **Timing window** — striking between 62 % and 88 % of the run-up keeps the
  authored corner, height and power. Early or late strikes bleed accuracy and
  make the ball rise, which is the classic missed-penalty signature. Each feint
  and every point of pressure shrinks that window.
* **Goalkeeper read model** — four skill presets (`rookie`, `amateur`, `pro`,
  `worldClass`). A plan is built the moment a kick becomes ready: the keeper
  either **guesses** a side up front (weighted by `guessBias`) or **reads** the
  strike with `readAccuracy`. A feint the keeper buys pulls its commitment
  earlier. `js/runtime/soccer-pawns.js` executes that decision through
  `commitPenaltyDive()`, ahead of its usual ball-flight prediction.
* **Pressure** — 0..1 from decisive kick, deficit, late round and sudden death.
  It shrinks the sweet window and scatters the AI's aim, and it is published in
  the snapshot for the HUD.
* **Presentation cameras** — a named preset per phase (`ready`, `aim`, `runUp`,
  `shot`, `resolved`, `finished`) with a hold time, exposed as `state().camera`
  and as `OnPenaltyPhaseChanged.camera`. This module never touches a Three.js
  camera; a level template or a Cinema Studio consumes the data.
* **Frame clock** — `update(dt)` drives the run-up, the camera holds and the
  advance between kicks, so timing is frame-accurate rather than `setTimeout`
  based. The old timer is still armed, so a level that never calls `update()`
  keeps working.

The v1 series rules (regulation five, early mathematical decision, sudden death)
are unchanged, and `penalty-flow.js` still shares no state with
`soccer-match-flow.js`.

The Penalty Shootout Stadium template (v5) exposes the new dials as
`penaltyShootout.*` variables — goalkeeper skill, run-up length, pressure,
presentation cameras, delay between kicks — applied on Play by its own director.

---

## 6. Tests

| Test | Covers |
|------|--------|
| `tests/soccer-tactics.test.js` | formations, roles, mirroring, phases, shape bounds, defensive line, offside, support spots, passing lanes, marking, preset clamping, throw-on-unknown-name |
| `tests/soccer-match-level-template.test.js` | registry wiring, 22 placed pawns, formation → placement, per-player editability, single possession, manager/director variables, binding overlay, runtime configuration, live AI driving all 22 |
| `tests/soccer-penalty-shootout.test.js` | v1 series rules, aim axes, run-up timing, feints, pressure, keeper read/guess, cameras, tick-driven advance, pawn hook |
| `tests/soccer-core.test.js` | Soccer Pawn, ball, stadium and the penalty stadium template (v5 dials) |
| `tests/soccer-match-flow.test.js` | match clock, restarts, half/full time, extra time, shootout tie-break |

---

## 7. Design references

* **EA SPORTS FC 27 gameplay deep dive** — AI defenders support through
  positioning rather than auto-tackling; teammates contain from a greater
  distance; attacking runs curve away from crowded areas. Applied to the `cover`
  and `marker` duties (goal-side offset, not a magnet) and to the crowding
  penalty inside `supportSpotScore()`.
* **FIFA / FC custom tactics conventions** — a defensive line around 60/100 is
  the practical sweet spot between suffocating midfield and dying to a failed
  offside trap. Applied as `LINE.defaultHeight = .58` with an explicit
  `offsideTrap` switch that only steps up out of possession.
* **Football Manager 26, "In Possession / Out of Possession"** — one squad, one
  shape per phase. Applied as the `PHASE_SHAPE` table.
* **Mat Buckland, *Programming Game AI by Example*, ch. 4 "Simple Soccer"** —
  tiered AI (team state machine above player state machines) and a scored grid
  of supporting spots. Applied as the team/player split and as
  `supportSpotScore()`, reduced to a fixed candidate fan so 22 players fit in
  one frame budget.
* **eFootball 2025 AI notes** — teammates with better spatial awareness making
  smarter supporting runs. Applied as the `support` duty evaluating a fan of
  offsets around its shape position rather than standing on it.
* **Penalty policy research and arcade penalty conventions** — goalkeepers
  frequently pre-commit to a side; arcade penalties lock direction and power on
  separate taps. Applied as `guessBias` in the keeper model and as the single
  run-up timeline that folds both taps into one readable window.
