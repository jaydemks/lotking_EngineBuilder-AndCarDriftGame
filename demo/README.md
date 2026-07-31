# Online Demo Project

The published demo may be one LKEP file. Large projects use this GitHub-safe layout:

```text
demo/demo-project.lkep.json
demo/demo-project/manifest.json
demo/demo-project/chunks/project-0001.lkep-part
demo/demo-project/chunks/...
```

The root file is a tiny pointer. Editor and Game load the manifest, verify every part and reconstruct the original project automatically.

The online demo does not accept uploads, saves, deletes or asset edits. LKEP export is still allowed as a browser download only; it does not write anything to the server.

The safe publishing path is **Projects → chosen project → ★ DEMO**. The active row uses the exact open editor state; another row uses exactly that saved project as the root publication.

- On the host opened through `localhost`, the editor validates the exact open project. At 90 MB it automatically publishes a pointer plus ~8 MB parts; once split, later publications keep the same safe layout. The previous publication is retained in Git-ignored local rollback files.
- From a LAN or hosted browser, repository writes remain forbidden. Use **Export project folder (GitHub)**. Chrome/Edge can write the folder directly; the fallback ZIP must be extracted before copying both the pointer and folder here.

Ordinary **Export single LKEP** uses a timestamped project filename and may exceed GitHub's per-file limit. It should not be treated as proof that the Author DEMO file was replaced.

If the demo uses GLB/audio/texture assets that already live in the project root, keep them as root-relative paths such as `models/player.glb`, `media/...` or `musics/...` and upload those folders beside the demo. Use embedded `data:` assets only as a fallback for small imported files that are not shipped from the project root.

## Demo asset credit

The city background embedded in the demo project uses
[Modern City Block](https://sketchfab.com/3d-models/modern-city-block-c80dba249d9547cbb48d00828d23cfa7)
by [akselmot](https://sketchfab.com/akselmot). The current model listing uses
the Sketchfab Free Standard License. This credit is retained voluntarily and
also covers copies obtained while the asset was distributed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) terms. The copy used
by Lot King was converted and adapted for the demo scene.
