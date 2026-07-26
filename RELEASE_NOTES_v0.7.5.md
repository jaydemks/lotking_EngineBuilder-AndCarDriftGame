# Release Notes: v0.7.5

## Lot King Engine v0.7.5 — In Development

### Development status

- Status: unreleased and in active development.
- Current public release: `v0.7.4`.
- Three.js baseline: pinned local r185 compatibility bundle.
- This document tracks work completed after the v0.7.4 tag and will be finalized when v0.7.5 is ready for release.

### Project identity and documentation

- Reworked the main README into a shorter, more approachable project overview while keeping detailed implementation information in the Technical README.
- Clarified that Lot King is a browser-native 3D game engine and visual editor expanding beyond its original car-drift foundation.
- Documented car racing and drifting as the most mature ready-to-use gameplay path rather than the limit of the engine.
- Clarified the asset-authoring boundary: complex meshes, rigs and textures are created in dedicated tools and imported, while Lot King assembles, configures and connects them to gameplay.
- Documented the current scope honestly, including the need for faster objective, game-rule and project-specific UI authoring.
- Restored the v0.7.1 and v0.6.x previews as native inline GitHub video players.
- Aligned the Technical README, architecture and runtime-module documentation with the broader engine direction.
- Kept historical release notes under `docs/releases/` while reserving the root release-note file for the active development cycle.

### Discoverability and web metadata

- Added a concise product title and description for the public landing page.
- Added canonical, Open Graph and Twitter Card metadata with a large preview image.
- Added `WebSite`, `SoftwareApplication` and author JSON-LD data.
- Added `robots.txt`, `sitemap.xml` and a web application manifest.
- Marked direct editor, gameplay, redirect and test pages as secondary or non-indexable so the public landing page remains the canonical result.
- Updated package and new project/export identity metadata to describe Lot King as a browser-native 3D engine and editor rather than a car-only product.
- Updated the public GitHub repository description, homepage and discovery topics.

### Verification

- Validated the JSON-LD, manifest and sitemap formats.
- Verified the canonical, Open Graph, Twitter Card and robots metadata directly from the deployed GitHub Pages build.
- Verified both README videos through GitHub's own Markdown renderer and remote README response.
- Confirmed that the v0.7.4 tag and release remain attached to the original v0.7.4 release commit.
