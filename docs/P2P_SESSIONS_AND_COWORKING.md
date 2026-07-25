# P2P Sessions And Coworking

Lot King 0.7.1 includes the default-enabled **P2P Sessions & Coworking** plugin. It uses encrypted WebRTC DataChannels and works without uploading project or gameplay data to the static web server.

## LAN workflow

Run `avvio.bat` on the Windows host. The normal launcher now binds the project-aware server to `0.0.0.0`, opens `localhost` on the host and prints the usable LAN URLs. On the Mac or another computer connected to the same network, open:

```text
http://HOST-LAN-IP:5700/engine_editor.html
```

Every device has its own `localStorage` and IndexedDB database. Only the browser opened through `localhost` uses `.lotking-local/active-project.lkep.json`; `serve_local.py` rejects LAN access to both disk-bridge endpoints with HTTP 403. This keeps ordinary editor instances isolated until the users explicitly connect a P2P session.

If the LAN URL cannot be reached, allow Python through the host firewall and verify that both devices are on the same non-isolated Wi-Fi/Ethernet network.

## Creating a P2P session

1. Open **Plugins → P2P Sessions & Coworking → Open session studio**.
2. The host creates an invitation and privately sends the generated code to one guest.
3. The guest pastes the invitation and creates an answer.
4. The guest returns that answer to the host; the host pastes it and accepts it.
5. Repeat with a fresh invitation for each additional peer.

Invitations expire after 15 minutes. They contain WebRTC connection metadata and must be treated as temporary access credentials. Application data travels peer-to-peer over DTLS after the connection opens.

The implementation uses non-trickle, out-of-band signaling so the repository remains deployable as static files. On a LAN this avoids a mandatory account or signaling backend. Reliable Internet connectivity across unrelated routers cannot be guaranteed without a deployed signaling service and properly authorized STUN/TURN infrastructure.

## Conflict-safe coworking model

Coworking deliberately starts with one active editing authority:

- the host initially owns edit control;
- other peers keep independent local drafts;
- a guest can request control and the host can explicitly grant or reclaim it;
- the authority's selected-object transforms are mirrored live;
- a complete portable LKEP snapshot, including portable assets, is sent only on **Publish snapshot**;
- receiving a snapshot never overwrites the open project automatically. **Apply received snapshot** imports it as a new browser project and reloads the editor.

This is not a silent last-write-wins merge. Arbitrary simultaneous structural editing, asset deletion and graph mutation remain local until a reviewed snapshot is published. A future operation/CRDT layer can build on the same transport without weakening the current project safety rules.

## Logic Element networking

The Network category includes:

- **On Network Message** — receives a filtered application channel, payload and peer identity;
- **Send P2P Message** — sends a JSON-compatible payload to connected peers;
- **P2P Connected** — reports connection state, role and peer count;
- **Open P2P Session Studio** — opens the connection UI from editor preview or exported gameplay;
- **Disconnect P2P Session** — closes the browser instance's peer connections.

Use separate channel names for unrelated systems, for example `lobby`, `race-state`, `chat` and `pawn-input`. Do not send an entire project every frame: use small state messages during gameplay and portable snapshots only for explicit coworking checkpoints.
