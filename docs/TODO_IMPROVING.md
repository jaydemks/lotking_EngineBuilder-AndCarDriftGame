# TODO_IMPROVING — AAAA quality roadmap

Status board for raising LOT KING from "capable browser editor" to a AAAA-grade authoring surface.
Everything on this list must remain **editable from the editor**, **playable in Play Preview**, and
**present in the playable export**. A feature that only works in one of those three is not done.

The previous file at `__pycache__/TODO_IMPROVING.md` was an unrelated scratch prompt and never held a
roadmap. This document replaces it.

## Ground rules

1. **No regressions.** Every existing setting, panel, template and export path keeps working.
   The Node suite is the gate: `npm test` (browser specs via `npx playwright test`).
2. **Editor is the master authoring surface.** No gameplay system may be reachable only from code.
3. **Registry over hardcoded chains.** New pawn kinds, level templates and game modes self-register;
   they never require an `if (templateId === …)` branch in `scene-store.js`.
4. **Instance isolation.** No system may reach into `GAME.player` outside the named native
   compatibility adapter. Two instances of anything must never share state.
5. **Performance is a feature.** Nothing lands that costs frame time without a quality setting and a
   graceful low-end fallback. Stutter is a bug, not a tuning issue.
6. **Provenance.** Third-party sources keep their license, commit hash and attribution alongside the
   imported files.

---

## Phase 1 — Sketchbook integration completion

| # | Item | State |
| --- | --- | --- |
| 1.1 | Double-entity on entering Play (duplicate pawn/visual) | **complete — Node + Chromium probe** |
| 1.2 | Full-body enter/exit vehicle animation + walk-to-door choreography | **complete — side-aware clips + procedural fallback** |
| 1.3 | Vehicles/elements exposed as first-class Logic Elements with `player_car`-grade customization | **complete — native `player_car` remains separate** |
| 1.4 | Export parity: Sketchbook pawns and world survive the playable ZIP unchanged | **complete — runtime/assets/license are mandatory ZIP inputs** |

Reference: [SKETCHBOOK_INTEGRATION.md](SKETCHBOOK_INTEGRATION.md).

## Phase 2 — Animal Pawns

Same architectural principle as the Sketchbook Advanced Character: a locomotion component registered
against `pawn-core.js`, owning its own capsule, ground probe, spring-damped motion and animation
state machine. It must not import Vehicle Pawn or branch on vehicle globals.

| # | Item | State |
| --- | --- | --- |
| 2.1 | Quadruped locomotion core (gaits: idle / walk / trot / run / pounce / crouch) | **complete** |
| 2.2 | **Cat** — primary target: climbing, ledge balance, pounce, stealth, fall recovery | **complete** |
| 2.3 | Dog — pack chase behaviour, bark/alert, digging | **complete** |
| 2.4 | Horse — rideable seat, gallop/gait blend, jump | **complete** |
| 2.5 | Generic animal profile so authors can add species from the editor | **complete** |
| 2.6 | Pawn Studio adapter category + Logic Element templates | **complete** |

## Phase 3 — Buildable game modes

Each is a **separate, editable level template**, independently modifiable, sharing nothing but the
common pawn/logic layer. Each ships objectives, HUD, win/lose flow and full editor authoring.

| # | Mode | Core loop | State |
| --- | --- | --- | --- |
| 3.1 | **Snowboarding** | Downhill run, gates/tricks/time objectives, authored slope + snow weather | **implemented; browser construction verified** |
| 3.2 | **Cat adventure** | Survive a suburban neighbourhood: mice hunts, dog encounters, tree climbing, balance challenges, human favour tasks for rewards, road traffic to dodge, friendly vehicles that stop for family points | **implemented; browser construction verified** |
| 3.3 | **Jungle car escape** | Drive out of an island jungle to the coast, hazards, route finding, timed extraction | **implemented; browser construction verified** |
| 3.4 | **FPS vs intelligent NPCs** | Enemy NPCs using the Character locomotion, with perception memory, range management, patrol and squad flanking | **implemented; general navmesh/cover authoring still 5.4** |

## Phase 4 — Environment and rendering

| # | Item | State |
| --- | --- | --- |
| 4.1 | Lightweight realistic volumetric clouds (shaping noise, HG scattering, multi-scatter approximation, wind parallax, adaptive quality fallback) | **complete** |
| 4.2 | Weather authoring shared across templates (snow, rain, fog, wind) driving both visuals and surface friction | **complete — `weather-system.js` director drives clouds/rain/fog and scales tyre grip per surface** |
| 4.3 | Texture budget: high perceived quality at low memory — KTX2/basis-style tiering, mip bias, per-platform caps | pending |
| 4.4 | Stutter elimination: shader precompile/warmup, asset streaming off the frame loop, GC pressure audit | **Open World hot-path/GC pass complete; hidden-resource warm pass now bounded and skips collision descriptors (it previously never finished on the Sketchbook world, so Play never started); broader shader streaming remains ongoing** |

## Phase 5 — Editor completeness for AAAA

| # | Item | State |
| --- | --- | --- |
| 5.1 | Level template registry (self-registering templates, no hardcoded chain) | **complete** |
| 5.2 | Objective/mission authoring graph shared by every game mode | **complete** |
| 5.3 | NPC/AI authoring: perception, behaviour trees or utility AI, spawn directors, patrol path editing | **initial editable FPS squad layer complete; general tool pending** |
| 5.4 | Navigation: navmesh or waypoint graph baked from level geometry, editable | pending |
| 5.5 | Save/checkpoint system exposed as Logic nodes | pending |
| 5.6 | Audio: mix buses, occlusion, per-pawn spatialisation beyond the current shared stereo listener | pending |
| 5.7 | Performance HUD/profiler surfaced next to the Logic Profiler | pending |

---

## Definition of done, per item

- Authorable from the editor with persisted, validated settings.
- Runs identically in Play Preview and in `gameplay.html`.
- Survives LKEP export/import and the playable ZIP.
- Covered by a browser-free Node test where the logic allows, plus a Playwright spec where it needs a GPU.
- Documented in `docs/` and listed in the release notes.
