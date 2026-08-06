# P2P Sessions And Coworking

Lot King 0.7.1 includes the default-enabled **P2P Sessions & Coworking** plugin. It uses encrypted WebRTC DataChannels and works without uploading project or gameplay data to the static web server.

## LAN workflow

Run `serve_lan_windows.bat` on the Windows host. It binds the static server to the LAN adapter and prints the usable LAN URLs. (`avvio.bat` deliberately remains the private, disk-backed localhost editor.) On the Mac or another computer connected to the same network, open:

```text
http://HOST-LAN-IP:8000/engine_editor.html
```

Every device has its own `localStorage` and IndexedDB database. Only the private browser opened through `localhost` uses `.lotking-local/active-project.lkep.json`; the LAN static server exposes no disk-bridge endpoints. This keeps ordinary editor instances isolated until the users explicitly connect a P2P session.

If the LAN URL cannot be reached, allow Python through the host firewall and verify that both devices are on the same non-isolated Wi-Fi/Ethernet network.

## Creating a P2P session

1. Open **Plugins → P2P Sessions & Coworking → Open session studio**.
2. In **Host**, create an invitation and privately send the **Invitation to send** code to one guest. Creating another invitation does not close existing peers or invalidate earlier pending invitations.
3. In **Guest**, paste it into **Paste host invitation**, then select **Join and create answer**.
4. The guest returns **Answer to return** to the host. The host pastes it into **Paste guest answer** and selects **Accept guest answer**.
5. Repeat with a fresh invitation for each additional peer.

Invitations expire after 15 minutes. They contain WebRTC connection metadata and must be treated as temporary access credentials. Application data travels peer-to-peer over DTLS after the connection opens. An answer belongs to the exact host session and invitation that produced it; the Studio now preserves that pending session and reports a specific error if an answer is pasted into a different/restarted host.

The Studio decodes whether pasted text is an invitation or an answer. A valid token accidentally pasted into one of the legacy/wrong fields is routed to the correct step; using an answer for Join, or an invitation for Accept, reports the exact mismatch instead of claiming that no token was pasted.

The implementation uses non-trickle, out-of-band signaling so the repository remains deployable as static files. The default ICE configuration includes the STUN route used by the official WebRTC peer-connection guide, which covers LAN and many ordinary home-network NAT configurations. In **Advanced Internet connection (TURN)** each browser can instead store a private JSON `iceServers` array with authenticated TURN credentials; that configuration remains browser-local and is not written into the project or invitation.

STUN discovers a direct route but is not a relay. Symmetric/carrier-grade NAT and restrictive firewalls require a real TURN service, so “every network” cannot be guaranteed by static browser code alone. This is a WebRTC infrastructure boundary, not a gameplay/editor distinction; see the official [WebRTC peer connection guide](https://webrtc.org/getting-started/peer-connections) and [TURN server guide](https://webrtc.org/getting-started/turn-server).

## Session lifetime and Play

Session Studio adopts the already-active runtime session instead of silently creating another one. Coworking, editor Play and gameplay Logic nodes therefore share the same connection inside that page. Closing the Studio only hides its interface; it does not disconnect. Use **Disconnect P2P Session** when teardown is intentional.

The editor toolbar keeps a persistent P2P monitor after the Studio is closed. Its
LIVE indicator reports role and connected-peer count; the compact panel lists
connected and recently disconnected users, opens the full Studio, adds another
guest and disconnects the local browser. The host can remove one connected peer
or create a fresh re-invitation for a disconnected peer. A guest that loses the
host gets a direct **Reconnect…** path back to the invitation field.

Offer and answer codes remain in page memory when the Studio is closed and
reopened, but are deliberately not written to project data or permanent browser
storage. A fully closed WebRTC connection still requires a fresh offer/answer:
without a signaling server a browser cannot silently reconnect two peers. The
monitor makes that exchange explicit and preserves the surviving host session.

## Conflict-safe multi-author coworking

Every connected editor can work and save. Ownership is temporary and scoped to
one persistent scene element rather than to the whole project:

- selecting an element requests a 9-second renewable edit lease from the host;
- the first requester receives the lease; another peer selecting that same
  element sees its owner and Inspector, viewport gizmo, Pawn Studio or Cinema
  Studio becomes read-only;
- unrelated elements remain editable at the same time, so collaborators can
  work in different parts of the level without taking global control;
- deselection, peer disconnect and lease expiry release the element. The lease
  is renewed while its editor remains active, so a crashed client cannot leave
  a permanent lock;
- position, rotation, scale, visibility, name and the complete serializable
  Inspector/Pawn Studio/Cinema Studio entry are mirrored for the lock owner;
- newly selected added elements are reconstructed from their saved entry on
  peers that do not have them yet, and deleting an added element is relayed
  while the author still owns its lease;
- low-latency transform packets use the state channel while a reliable settle
  revision guarantees the final value after a drag or gizmo operation;
- Save persists the current synchronized project locally and sends a reliable
  final object state before its save request, causing every connected editor to
  verify and persist its own local copy. A received save cannot echo and create
  a save loop;
- a complete portable LKEP snapshot, including portable assets, is sent only on **Publish snapshot**;
- snapshots are streamed in bounded chunks with progress, back-pressure and an
  end-to-end checksum. Projects up to the explicit 256 MiB application limit no
  longer depend on one giant WebRTC message;
- receiving a snapshot never overwrites the open project automatically. **Apply received snapshot** imports it as a new browser project and reloads the editor.

This is not a silent last-write-wins merge. Both peers must open copies of the
same saved project so persistent `editorId` values identify the same objects.
The host only arbitrates leases; it is not privileged as an author. Portable
snapshots remain the explicit path for importing a complete project copy.

## Logic Element networking

The Network category includes:

- **On Network Message** — receives a filtered application channel, payload and peer identity;
- **Send P2P Message** — sends a JSON-compatible payload to connected peers;
- **P2P Connected** — reports connection state, role and peer count;
- **Open P2P Session Studio** — opens the connection UI from editor preview or exported gameplay;
- **Disconnect P2P Session** — closes the browser instance's peer connections.

Use separate channel names for unrelated systems, for example `lobby`, `race-state`, `chat` and `pawn-input`. Do not send an entire project every frame: use small state messages during gameplay and portable snapshots only for explicit coworking checkpoints.
