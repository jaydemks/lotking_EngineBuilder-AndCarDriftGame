# How To Start

This project runs from a local static server. Do not use `file://` for normal work: models, audio files, browser storage and imported assets behave better through `http://`.

## Quick Start On Windows

From the repository root, run:

```bat
avvio.bat
```

This starts the local server on port `5700` and opens the landing menu:

```text
http://localhost:5700/
```

The Engine Editor is loaded only after you press **ENGINE EDITOR**. To bypass the landing menu intentionally, run `set PAGE=engine_editor.html` before `avvio.bat`.

## Manual Local Server

You can also start the same project-aware local server yourself:

```bash
python3 serve_local.py 5700 --bind 127.0.0.1
```

Then open one of these:

- `http://localhost:5700/`
- `http://localhost:5700/engine_editor.html`
- `http://localhost:5700/gameplay.html`

## Browser Storage Note

Browser `localStorage` and IndexedDB are technically tied to the exact origin, but they are now caches rather than the authoritative local project.

These are different storage buckets:

- `http://localhost:5700`
- `http://127.0.0.1:5700`
- `http://localhost:8000`
- `http://192.168.x.x:5700`

`avvio.bat` and `serve_local.py` keep the complete project in `.lotking-local/active-project.lkep.json`. When another localhost port is selected, the editor restores every level and migrates embedded assets into that origin's IndexedDB automatically. The previous disk snapshot is also retained before each replacement.

While **Dev → Performance Debugger** is open, the same local server updates `.lotking-local/developer-performance-latest.md` about every five seconds. It is a concise, generated report of frame timing, renderer/scene load, particles, recent diagnostics and the heaviest authored elements. Use **Export log** in the overlay for the complete JSON report. Both local bridge files are ignored by Git.

If you use a generic static server instead of `serve_local.py`, both disk bridges are unavailable: project storage falls back to the origin-specific browser cache and the debugger shows `AUTO LOG · LOCAL ONLY`. Manual project export/import and the debugger's JSON download continue to work.

## Project Workspace And Online Demo

The Project Workspace button is an optional bridge. It does not replace the current local browser database workflow, but it can use a `.lkep.json` file as the portable project document.

- On `localhost`, Save writes the browser cache, the optional linked workspace and the local disk bridge. The Workspace panel can still open/sync a separately chosen LKEP project file.
- The editor detects a hosted site versus localhost automatically. It then asks only which project to open: the author `DEMO` (authored for consumer high-end hardware) or a clean project. The hosted path asks the visitor to authorize a local project directory in Chrome/Edge; the workspace manifest and DEMO project are written there, while browser storage remains local to that visitor.
- On first editor entry, this project choice is required and appears before world/assets/editor warm-up. It has no close button until a choice is completed. After the selection reload, the normal loading phase starts; later the workspace panel can be reopened and closed normally from the toolbar.
- Hosted Editor never uploads project data or imported assets to the site's FTP/server. If writable folder access is unavailable, **Run locally / GitHub** shows the download, extraction and `avvio.bat` steps.
- To publish your authored online demo level, export a portable LKEP locally and upload it as:

```text
demo/demo-project.lkep.json
```

The published site offers that file as the Author DEMO. It remains read-only until the visitor explicitly authorizes a local project folder, then an editable copy is written into that workspace without modifying the hosted source.
- In Chrome or Edge on `localhost`, `Project Workspace -> Open / sync LKEP file` can link a portable project file. The editor imports the file, and the normal Save button writes the portable `.lkep.json` file again.
- Portable LKEP export/import is responsible for carrying imported asset blobs inside the project data when possible.

## Phone Or Tablet On The Same Wi-Fi

Run:

```bash
python3 serve_lan.py
```

Open the LAN URL printed by the script on the phone or tablet.

If you are using WSL2, run the Windows helper instead:

```bat
serve_lan_windows.bat
```

WSL2 is behind a virtual network, so a phone on Wi-Fi often cannot reach a server started inside WSL.

## Firewall / LAN Troubleshooting

If another device cannot connect:

1. Make sure the phone/tablet is on the same Wi-Fi network.
2. Allow Python through the Windows firewall.
3. Start the LAN server from Windows PowerShell:

```powershell
py -3 serve_lan.py --port 8000 --bind 0.0.0.0
```

Then open the printed LAN address on the other device.

## Which Page Should I Open?

- Use `engine_editor.html` to build, edit, save and export projects.
- Use `gameplay.html` to run the playable game without the editor UI.
- Use `/` or `index.html` for the menu shell.

Typical workflows:

- Build locally in `engine_editor.html`, then export a playable ZIP when you want to publish only the game/runtime.
- Publish the whole project as a server-read-only hosted editor: visitors may edit only after authorizing their own local folder, while hosted files remain immutable.
- Use Logic Element from inside the editor when you want Blueprint-style experimental visual scripting for level logic or scene objects.

For day-to-day work, start with:

```text
http://localhost:5700/engine_editor.html
```
