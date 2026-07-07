# Published: 2026-07-07 13:20:48 +0200 (tag v0.5.7)

# LOT KING ENGINE EDITOR v0.5.7 — Projects, touch UI + texture decals

## v0.5.7 — Projects, touch UI + texture decals

### Release Status

- Status: released.
- Tag target: `v0.5.7`.
- Scope: browser-based Projects workflow, portable project import/export, mobile touch UI polish, four-wheel skid marks, Free Texture / Decal scene elements, EN/IT consolidation, LAN helper cleanup, and runtime/editor save-flow fixes after `v0.5.6`.

### Added

- Added four editable skid mark sources on the player vehicle: rear left/right and front left/right.
- Skid marks now react to drift, braking, wheelspin, burnout and spinout instead of only rear drift.
- Skid mark density, opacity and lifetime now scale with slip, speed, yaw/spin and G-force.
- Added Free Texture / Decal as a scene element.
- Texture/decal elements can be created from the Add menu, positioned in the scene and edited from the inspector.
- Texture/decal inspector now includes preview, image import, mode, blending, tint, size, opacity, alpha cut, depth bias, double side and GIF refresh options.
- Image assets can now be imported into the Assets library: PNG, JPG, WEBP, AVIF and GIF.
- Dropping an image into the viewport creates a texture/decal element and saves the image as an asset.
- Playable export now resolves texture/decal image blobs so they can be included in exported projects.
- Project export now prepares portable `.lkep.json` files with embedded asset data instead of relying on browser-origin blob cache.
- Project import now moves embedded GLB/texture data back into the editor asset blob database before saving the level locally.
- Added a browser-based Projects overlay for editor projects: list, create, load, rename, delete, import and export project files.
- The editor Save action now updates the active browser project and keeps export as the portable file workflow.
- Opening the editor now shows the Projects overlay first, and the legacy/current saved editor project is seeded into Projects when the project list is empty.
- Added a shared EN/IT language helper for runtime/editor UI and connected it to editor preferences.
- Runtime input mapping and the new texture/decal UI now read the selected EN/IT language.
- Added root `avvio.bat` to start a local Python server and open the main index page.
- LAN testing remains a separate static-server helper; the Windows LAN helper now uses `serve_lan.py`, which treats aborted large-asset transfers as normal client disconnects instead of printing Python tracebacks.

### Improved

- Touch UI is constrained inside the active aspect-ratio frame and safe margins.
- Touch UI appears only in editor preview and gameplay, not over loading screens or menus.
- The vehicle speedometer moves up when touch controls are active.
- Touch steering direction was corrected.
- Time-of-day vehicle lights are refreshed when loading/running scenes.
- The local LAN helper scripts were added to make mobile testing easier from the same network.

### Notes / to verify

- Free Texture / Decal currently uses a transparent surface plane with blending and depth bias. True projected decal geometry on irregular meshes is still a future pass.
- GIF animation support is best-effort and depends on browser texture refresh behavior.
- Runtime/browser testing is still needed for texture import, save/load, playable export and mobile touch behavior.
- Projects are full browser-based; moving a project between PC/mobile, different ports, or different hostnames still requires `Export Project` / `Import Project`.
