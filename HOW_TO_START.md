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

For day-to-day work, start with:

```text
http://localhost:5600/engine_editor.html
```
