# Asset Scout

Asset Scout is the editor's built-in search for **free online 3D assets**. It finds models
and PBR textures in public catalogues, downloads them, converts them to the engine's
canonical format and hands them to the ordinary asset-import pipeline — the same one a
local drag-and-drop uses.

The goal is level-building speed: find a crate, a barrel or a brick wall, click Import, and
place it, without leaving the editor or opening a browser tab.

---

## Where it is

- **Floating button** `⌕ ASSET SCOUT`, bottom-right of the editor viewport.
- **Menu bar** → `Tools` → `Asset Scout`.
- **API** `GAME.editor.openAssetScout()` / `GAME.editor.toggleAssetScout()`.

The button is hidden during Play Preview and Simulate Preview, so it never sits on top of a
running game or steals a click.

---

## Sources

| Source | Content | License | Format delivered |
| --- | --- | --- | --- |
| [Poly Haven](https://polyhaven.com/) | Models, PBR textures | **CC0** for the whole catalogue | glTF → GLB, or FBX source, or texture maps |
| [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | Reference models | **Per-model**, from CC0 to CC BY-NC | GLB, imported directly |

### Why only these two

A source ships in the built-in editor only if it satisfies three rules, documented at the top
of [`js/editor/asset-scout-providers.js`](../js/editor/asset-scout-providers.js):

1. **CORS.** Both the catalogue endpoint and the file host must send
   `Access-Control-Allow-Origin`. Without it the browser blocks the request and the entry
   could only ever display an error.
2. **License clarity.** Every result must carry a license label and a link. Results whose
   license cannot be resolved are shown as *License not resolved* rather than presented as
   free — they are never silently importable.
3. **No API key.** Anything that needs a token or an account belongs in a plugin, not in the
   built-in editor.

**ambientCG is deliberately absent.** Its catalogue is CC0 and would otherwise be a good fit,
but `ambientcg.com/api/v2` currently returns no CORS header, so a browser fetch is blocked.
It can be revisited if that changes.

**HDRIs are deliberately absent.** The engine sky consumes a fixed set of bundled `.hdr`
files and has no import path for arbitrary ones, so listing them would offer a download that
nothing in the project could then use.

### Adding or removing a source

Every source is one object in the `PROVIDERS` array at the bottom of
`js/editor/asset-scout-providers.js`. **Deleting that object removes the source completely** —
no other file references a provider by name, and the panel renders whatever the registry
returns.

A provider descriptor needs:

```js
{
  id, label, home,
  licenseSummary,                 // shown under the search row
  categories: [{id, label, kind}],
  resolutions: ['1k', '2k'],      // optional
  formats: [{id, label, kinds}],  // optional
  search(query, options),         // -> Promise<Asset[]>
  resolveLicense(asset),          // optional, for per-asset license lookup
  resolveDownload(asset, options) // -> Promise<Download>
}
```

`search()` returns plain objects (`id`, `name`, `kind`, `thumbnail`, `pageUrl`, `license`,
`info[]`, `tags[]`, `authors[]`). `resolveDownload()` returns file **descriptors**, not blobs,
so the UI decides when to download and can report progress per file.

---

## Licenses in the interface

Every card shows its license. There is no "unknown, import anyway" path.

- **Green badge** — public domain (CC0). One-click import.
- **Amber badge** — attribution required, share-alike, no-derivatives, non-commercial, or
  unresolved. Import opens a confirmation dialog that states the terms and makes clear that
  respecting them in anything you publish is your responsibility.
- **Card contents** — name, author(s), category, triangle count, real-world dimensions,
  maximum texture resolution, tags, and a `Source` link to the original page.

If the preview image fails to load, the card keeps the name, the specs and the license
instead of disappearing, so an asset is always identifiable.

### Multiple licenses on one asset

Khronos models frequently list several copyright holders with different licenses (an original
model plus a re-converted version, for example). Asset Scout resolves **the strictest one**.
`DamagedHelmet` lists CC BY 4.0 and CC BY-NC 4.0; the card reports **CC BY-NC
(non-commercial)**, because that is the constraint that actually applies.

Khronos licenses live in per-model READMEs, not in the catalogue index. They are fetched
lazily after a search — the card reads *Checking license…* until it resolves, and import stays
behind the confirmation prompt while it does.

---

## What happens on Import

| Source format | Pipeline |
| --- | --- |
| `.glb` | Downloaded and imported directly. |
| `.gltf` + `.bin` + textures | Dependencies are downloaded, re-linked through a `LoadingManager` URL modifier and re-exported as **one canonical GLB** via `GLTFExporter`, then imported. |
| `.fbx` + textures | Downloaded as a set and handed to the **FBX → GLB Importer** plugin, which preserves the FBX source and builds the runtime GLB. |
| Texture maps | Diffuse, Normal (GL), Roughness, AO, Metal and Displacement are downloaded as individual images and imported as texture assets. |

The glTF bundling step exists because Poly Haven serves textures from a different path than
the `.gltf` itself, so relative resolution would fail. It mirrors what the FBX plugin already
does for its own sources.

After import the asset is an ordinary imported asset: it appears in the asset panel, is stored
in IndexedDB, survives reloads, and is included in portable LKEP exports and playable ZIPs.
Provenance (provider, source URL, license) is attached to the imported file.

### Guards

- **220 MB cap** on a single download bundle. A larger request is refused with a message
  suggesting a lower resolution.
- **20 s timeout** on catalogue requests.
- Failures report the actual error in the status bar; nothing is imported half-way.

---

## Choosing a resolution

Poly Haven serves 1K, 2K and 4K. The panel defaults to **1K**, which is the right choice for
almost every prop in a browser-native project: a 4K texture set for a single crate can exceed
100 MB and will not survive a mobile session. Raise it only for hero assets.

---

## Removing Asset Scout entirely

1. Delete `js/editor/asset-scout.js` and `js/editor/asset-scout-providers.js`.
2. Remove their two `<script>` tags from `engine_editor.html`.
3. Remove the `lkAssetScoutFab` / `lkAssetScoutPanel` block from
   `js/editor/editor-template.js`.
4. Remove the `assetScout` block in `js/editor/editor.js` and the `Asset Scout` entry in
   `js/editor/editor-menu-bar.js`.
5. Optionally delete the `ASSET SCOUT` CSS section in `css/editor.css`.

Nothing else depends on it. `importAssetFiles` and every other import path are untouched.
