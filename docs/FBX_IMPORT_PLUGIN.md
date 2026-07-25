# FBX to GLB Importer Plugin

`FBX → GLB Importer` is a normal Lot King editor plugin. It is shipped with the editor, enabled by default, and can be disabled from **Plugins → Plugin Manager**.

The plugin treats FBX as an authoring source and GLB as its compiled runtime artifact:

1. The editor gives the plugin the selected or dropped source files.
2. `FBXLoader` parses each FBX in browser memory.
3. A `LoadingManager` maps FBX texture requests to the selected files. Relative paths are preferred and filename matching is used as a fallback. Common TGA textures are decoded with the bundled `TGALoader`.
4. The original FBX and the sidecar files actually used by it are persisted in IndexedDB on the same logical asset record.
5. `GLTFExporter` writes the scene, skeleton and animation clips to a binary GLB derivative.
6. Asset Properties and Pawn Studio preview the original FBX directly through the plugin's `assetPreviewLoader`; gameplay and portable exports use the linked GLB derivative.

Use **Plugins → FBX → GLB Importer → Import FBX + textures…** when the FBX and its textures can be selected together. Use **Import an FBX folder…** for nested texture folders. Dragging the same files onto the Assets panel or viewport uses the same conversion path.

Missing textures are replaced by a transparent pixel so one bad reference does not abort the model compilation. The asset records conversion warnings, source/build state and linked dependency count. Deleting the logical asset removes its GLB, original FBX and persisted sidecars together. Because compilation temporarily holds the FBX, Three.js scene, decoded images and GLB at once, very large sources can require several times their disk size in memory.

Asset Properties also exposes **Check / relink FBX source**. The browser file picker supplies a comparable file version (name, byte size and `lastModified`); the editor persists the selected source and marks the linked runtime build as `STALE` when that version differs. The direct FBX preview immediately reads the refreshed source, while gameplay/export keep using the last valid GLB until **Rebuild runtime GLB** succeeds. Browsers cannot monitor arbitrary disk files silently, so this explicit check is the permission-safe synchronization point.

Character and Soccer Pawns use a Motion Animation Set whose entries can select converted assets independently. This allows one FBX/GLB per motion sample or action while direction, speed and physical-state metadata drive runtime selection and blending. Animation-only FBX files may omit skin geometry but must retain their armature and keyframes. Common Mixamo/Blender naming variants are rebound automatically and compatible real skeletons can be retargeted to the Main Mesh; unrelated hierarchies remain an authoring error.

Asset cards support Ctrl/Meta/Shift multi-selection. Deleting a selection removes each logical asset once and also removes its compiled GLB, preserved FBX and persisted sidecars; deletion is intentionally grouped so a converted source cannot leave hidden orphan blobs.

## Asset importer extension point

The plugin is also the reference implementation for source-format importers. A plugin registers an importer during its `register(api)` lifecycle:

```js
api.assetImporter('my-format', {
  label:'My format → GLB',
  extensions:['myext'],
  accepts:file => /\.myext$/i.test(file.name || ''),
  async prepare(files, context){
    context.progress('model.myext', 25, 'Parsing source');
    // Return browser File objects understood by the normal asset pipeline.
    return [new File([glbArrayBuffer], 'model.glb', {
      type:'model/gltf-binary',
    })];
  },
});
```

`prepare()` receives the complete user-selected batch so the importer can resolve sidecar files. It must return the files that should continue through the canonical asset pipeline. `context` currently exposes:

- `THREE`: the pinned compatibility bundle.
- `progress(name, percent, step)`: editor loading progress.
- `warn(message)`: non-fatal diagnostics displayed after import.

An importer should emit canonical formats already supported by the runtime. A source-format plugin can additionally register `assetPreviewLoader(type, config)` to keep its authoring preview isolated from scene storage and playable export.
