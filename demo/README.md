# Online Demo Project

Place the published demo LKEP here:

```text
demo/demo-project.lkep.json
```

When the site is opened from a non-localhost origin, `js/engine/scene-store.js` loads this file automatically and uses it as the read-only online demo level.

The online demo does not accept uploads, saves, deletes or asset edits. LKEP export is still allowed as a browser download only; it does not write anything to the server.

Export the project from the local editor as an FTP/root project LKEP file, then copy/rename it to `demo-project.lkep.json` before uploading the site by FTP.

If the demo uses GLB/audio/texture assets that already live in the project root, keep them as root-relative paths such as `models/player.glb`, `media/...` or `musics/...` and upload those folders beside the demo. Use embedded `data:` assets only as a fallback for small imported files that are not shipped from the project root.
