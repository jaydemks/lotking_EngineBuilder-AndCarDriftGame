# Release Notes: v0.7.9

## Urgent online and gameplay fixes

- Author Demo exports now carry material textures stored in the local asset database, fixing missing asphalt and other authored surface maps online.
- Characters now leave native, Logic and custom vehicles upright at the resolved safe exit point. Body, camera and input frames return to normal on-foot behavior without reversed movement—even after travelling away from spawn—or seated-pose and inactive weapon-IK leaks.
- Helicopter landing contact absorbs rebound for softer, controllable touchdowns.
- The fuel-tank damage dummy is hidden by default and remains author-visible on demand for mesh placement.
- Camera-enclosing mesh shells are skipped for the current frame, reducing close-overlap line artifacts, overdraw and interior stutter.

## Current Character scope

- Character gameplay is still being optimized across different level layouts. Shooter levels currently provide the recommended starting point for testing locomotion, animation, combat and imported character models.
