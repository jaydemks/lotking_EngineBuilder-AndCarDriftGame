# Player Car vs Logic Vehicle Pawn — Parity Checklist

Use the same level, spawn transform, model and input profile for both runs. Record native values first, then disable/unpossess the native Player Car and possess the Logic Vehicle Pawn with the same Player ID.

## Runtime Identity

- Native reference appears in `LOT_KING.pawns` as `native-player-car`.
- Each Logic car has a distinct Pawn ID and reports `physicsMode = cannon-raycast` during Play Preview.
- Only one Pawn owns a Player ID unless `Possess Pawn.force` is deliberately used.
- `None` produces zero throttle, brake, steer and handbrake.

## Driving Comparison

Test each item from a full stop and after reset:

- launch acceleration and wheelspin;
- service braking distance;
- reverse engagement and maximum reverse speed;
- steering response at low, medium and high speed;
- handbrake rotation and rear grip loss;
- recovery when steering returns to center;
- maximum speed and limiter behavior;
- slope/ramp contact;
- wall and prop collision response;
- chassis roll, suspension compression and landing stability.

Tune the Logic Pawn from `VEHICLE PAWN > PAWN DRIVING / PHYSICS`, `PAWN COLLIDER` and `RAYCAST SUSPENSION`. Do not change the native values during the comparison.

## Isolation Tests

- Place two Player Car Logic Elements with different Player IDs.
- Confirm speed, steer, gear, RPM and reverse state remain different per instance.
- Disable one Pawn and verify the other continues moving.
- Reset one Pawn and verify the other body does not teleport or lose velocity.
- Delete one Pawn during a stopped preview/rebuild and confirm its body, vehicle, collision listener and Player slot are released.

## Visual/Reactive Tests

- Four wheel meshes spin from their own wheel infos.
- Front wheel meshes follow steering and suspension compression.
- Brake lights respond only to the owning Pawn brake state.
- Reverse lights respond only to the owning Pawn reverse state.
- Left/right conditional lights respond only to the owning Pawn steering state.
- `Set Vehicle Lights` affects only the selected Pawn.

## Persistence

- Save/reload retains `graph.vehiclePawn.schemaVersion = 2`.
- Save/reload retains driving, collider and suspension values.
- LKEP export/import retains the Vehicle Pawn and complete `playerPawnBlueprint` migration snapshot.
- Play Preview runtime speed/RPM/gear values are not written into authoring data.

## Not Yet Sign-Off Ready

Do not mark full Player Car parity until the shared specialist inspectors, per-Pawn camera/HUD, engine audio, exhaust, skid/smoke, neon, arbitrary rig assignment and multiplayer viewport work are completed and checked.
