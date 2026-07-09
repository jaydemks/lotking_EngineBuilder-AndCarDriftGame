# Online Demo Project

Place the published demo LKEP here:

```text
demo/demo-project.lkep.json
```

When the site is opened from a non-localhost origin, `js/engine/scene-store.js` loads this file automatically and uses it as the read-only online demo level.

The online demo does not accept uploads, saves, deletes or asset edits. LKEP export is still allowed as a browser download only; it does not write anything to the server.

Export the project from the local editor as a portable LKEP file, then copy/rename it to `demo-project.lkep.json` before uploading the site by FTP.

If the demo uses imported GLB/texture assets, export again after those assets are visible locally. The LKEP must contain portable `data:` asset data, not only local browser database keys.
