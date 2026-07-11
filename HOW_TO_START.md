# How To Start

This project runs from a local static server. Do not use `file://` for normal work: models, audio files, browser storage and imported assets behave better through `http://`.

## Quick Start On Windows

From the repository root, run:

```bat
avvio.bat
```

This starts the local server on port `5600` and opens the editor:

```text
http://localhost:5600/engine_editor.html
```

Use this when you want the normal local editor workflow.

## Manual Static Server

You can also start a simple server yourself:

```bash
python3 -m http.server 5600
```

Then open one of these:

- `http://localhost:5600/`
- `http://localhost:5600/engine_editor.html`
- `http://localhost:5600/gameplay.html`

## Browser Storage Note

Projects, imported assets and IndexedDB blobs are tied to the exact browser origin.

These are different storage buckets:

- `http://localhost:5600`
- `http://127.0.0.1:5600`
- `http://localhost:8000`
- `http://192.168.x.x:5600`

If a project seems missing, first check that you opened the same host and port you used when saving it.

To move a project between origins or devices, use the editor's project export/import tools.

## Project Workspace And Online Demo

The Project Workspace button is an optional bridge. It does not replace the current local browser database workflow, but it can use a `.lkep.json` file as the portable project document.

- On `localhost`, the editor keeps working as before with localStorage and IndexedDB. The Workspace panel opens automatically in the editor so you can choose the local browser database or open/sync an LKEP project file.
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
http://localhost:5600/engine_editor.html
```
