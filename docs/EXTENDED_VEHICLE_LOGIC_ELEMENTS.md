# Extended Vehicle Logic Elements

Lot King registers every vehicle in this pack as a real Logic Element. The
placeholder, control configuration, collision, seat, damage anchors and towing
contract are saved with the level and remain editable or duplicable.

## Available families

Each of these ten families is available in both **Normal** and
**DollBody-compatible** categories:

- Small Boat, Medium Boat and Large Ship
- Truck Tractor and Detachable Trailer
- Sport Motorcycle, Dirt Bike and Scooter
- BMX Bicycle and Mountain Bike

Normal-rig Airplane and Helicopter entries complement the existing Sketchbook
aircraft. This gives 22 new templates in total.

## Replacing a placeholder

1. Add the Logic Element and test its scale, camera, collision and controls.
2. Export a GLB with Vehicle GLB Rigger 0.3 using the profile selected by the
   element's **GLB Rig Profile** property.
3. Assign it to **Replacement Rigged GLB**. Semantic parts such as wheels,
   propellers, rotors, control surfaces, seats and collision helpers are scanned
   from metadata; names are only a compatibility fallback.
4. Tune mass, maximum speed, acceleration, steering, camera and hitch values in
   the Inspector. The original procedural placeholder remains recoverable.

## Towing

Vehicle input action **Tow / Detach** defaults to `T`. It is active only in the
Vehicle context and therefore does not consume the Character `T` action. The
nearest compatible coupler inside **Tow Attach Radius** is selected.

The truck exposes both a rear hitch and a fifth-wheel dummy. The trailer exposes
an authored front coupler and is not possessable. Native Player Car and all Logic
Vehicles use the same towing service. With Cannon available, the service creates
a point-to-point constraint using each body's own local anchor; otherwise the
fallback synchronizes both the visible transform and physics body.

One vehicle cannot tow itself, already-towed trailers are rejected and cyclic
chains are prevented. Disposal or explicit detach removes the constraint and
emits `OnTowDetached`; a successful attach emits `OnTowAttached`.

## Current watercraft simulation boundary

The boat and ship entries already provide steerable arcade navigation, hull and
deck placeholders, propulsion/rudder anchors, damage, camera and water authoring
metadata. They do not yet claim multi-point, wave-sampled hydrodynamics. That
future layer can replace the current movement backend without changing saved
Logic Elements or GLB rig metadata.
