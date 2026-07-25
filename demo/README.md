# Online Demo Project

Place the published demo LKEP here:

```text
demo/demo-project.lkep.json
```

When the site is opened from a non-localhost origin, `js/engine/scene-store.js` loads this file automatically and uses it as the read-only online demo level.

The online demo does not accept uploads, saves, deletes or asset edits. LKEP export is still allowed as a browser download only; it does not write anything to the server.

The safe publishing path is **Projects → chosen project → ★ DEMO**. The active row uses the exact open editor state; another row uses exactly that saved project as the root publication.

- On the host opened through `localhost`, the editor validates and writes the exact open project directly to `demo/demo-project.lkep.json`. The previous publication is retained as `demo/demo-project.previous.lkep.json`.
- From a LAN, Safari or hosted browser, repository writes remain forbidden. The same command downloads a correctly named `demo-project.lkep.json`; copy that file into this directory on the publishing computer.

Ordinary **Export LKEP** uses a timestamped project filename and may export a different saved project row. It should not be treated as proof that the Author DEMO file was replaced.

If the demo uses GLB/audio/texture assets that already live in the project root, keep them as root-relative paths such as `models/player.glb`, `media/...` or `musics/...` and upload those folders beside the demo. Use embedded `data:` assets only as a fallback for small imported files that are not shipped from the project root.
