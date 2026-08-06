#!/usr/bin/env python3
"""Local-only LOT KING editor server with port-independent project backup."""
from __future__ import annotations

import argparse
import hashlib
import http.client
import ipaddress
import json
import os
import re
import shutil
import socket
import tempfile
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

STATE_URL = "/__lotking/project-state"
SERVER_INFO_URL = "/__lotking/server-info"
STATE_DIR = ".lotking-local"
STATE_FILE = "active-project.lkep.json"
STATE_BACKUP_FILE = "active-project.previous.lkep.json"
PROJECT_HISTORY_URL = "/__lotking/project-history"
PROJECT_HISTORY_RESTORE_URL = "/__lotking/project-history/restore"
PROJECT_HISTORY_DIR = "project-history"
MAX_STATE_BYTES = 512 * 1024 * 1024
PROJECT_SHRINK_GUARD_MIN_BYTES = 1024 * 1024
PROJECT_SHRINK_GUARD_RATIO = 0.25
PERFORMANCE_URL = "/__lotking/developer-performance"
PERFORMANCE_FILE = "developer-performance-latest.md"
MAX_PERFORMANCE_BYTES = 2 * 1024 * 1024
DEMO_PUBLISH_URL = "/__lotking/publish-demo"
DEMO_DIR = "demo"
DEMO_FILE = "demo-project.lkep.json"
DEMO_BACKUP_FILE = "demo-project.previous.lkep.json"
DEMO_SPLIT_FOLDER = "demo-project"
DEMO_SPLIT_BACKUP_FOLDER = "demo-project.previous"
DEMO_SPLIT_THRESHOLD_BYTES = 90 * 1000 * 1000
DEMO_CHUNK_CHAR_LIMIT = 8_000_000


def root_fingerprint(root: Path) -> str:
    """Identify one checkout without exposing its local filesystem path."""
    normalized = os.path.normcase(str(Path(root).resolve()))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def _atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent, prefix=path.name + "-", suffix=".tmp") as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def write_split_demo(path: Path, payload: bytes, project: dict) -> dict[str, object]:
    """Publish a static-host-safe demo folder, retaining one local rollback copy."""
    text = payload.decode("utf-8")
    project_folder = path.parent / DEMO_SPLIT_FOLDER
    previous_folder = path.parent / DEMO_SPLIT_BACKUP_FOLDER
    staging = Path(tempfile.mkdtemp(dir=path.parent, prefix=".demo-project-publish-"))
    chunks: list[dict[str, object]] = []
    try:
        chunks_folder = staging / "chunks"
        chunks_folder.mkdir(parents=True)
        for index, offset in enumerate(range(0, len(text), DEMO_CHUNK_CHAR_LIMIT), start=1):
            part = text[offset : offset + DEMO_CHUNK_CHAR_LIMIT]
            encoded = part.encode("utf-8")
            relative = f"chunks/project-{index:04d}.lkep-part"
            (staging / relative).write_bytes(encoded)
            chunks.append({
                "file": relative,
                "chars": _utf16_length(part),
                "bytes": len(encoded),
                "sha256": hashlib.sha256(encoded).hexdigest(),
            })
        manifest = {
            "format": "LKEP_SPLIT_MANIFEST",
            "version": 1,
            "encoding": "utf-8-json-text-chunks",
            "project": {
                "name": project.get("meta", {}).get("projectName")
                or project.get("meta", {}).get("trackName")
                or DEMO_SPLIT_FOLDER,
                "savedAt": project.get("savedAt"),
                "format": "LKEP",
            },
            "totalChars": _utf16_length(text),
            "totalBytes": len(payload),
            "chunkCharLimit": DEMO_CHUNK_CHAR_LIMIT,
            "chunks": chunks,
        }
        (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        backup_path = path.with_name(DEMO_BACKUP_FILE)
        previous_pointer = path.read_bytes() if path.is_file() else None
        if previous_pointer is not None:
            try:
                descriptor = json.loads(previous_pointer.decode("utf-8"))
                if descriptor.get("format") == "LKEP_SPLIT_POINTER":
                    previous_pointer = (json.dumps({
                        "format": "LKEP_SPLIT_POINTER",
                        "version": 1,
                        "manifest": f"{DEMO_SPLIT_BACKUP_FOLDER}/manifest.json",
                    }, indent=2) + "\n").encode("utf-8")
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass

        if previous_folder.exists():
            shutil.rmtree(previous_folder)
        if project_folder.exists():
            os.replace(project_folder, previous_folder)
        os.replace(staging, project_folder)
        staging = None
        if previous_pointer is not None:
            _atomic_write(backup_path, previous_pointer)
        pointer = (json.dumps({
            "format": "LKEP_SPLIT_POINTER",
            "version": 1,
            "manifest": f"{DEMO_SPLIT_FOLDER}/manifest.json",
        }, indent=2) + "\n").encode("utf-8")
        _atomic_write(path, pointer)
        return {"split": True, "chunks": len(chunks), "largestChunkBytes": max(item["bytes"] for item in chunks)}
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging)


def local_ips() -> list[str]:
    """Return usable IPv4 addresses without depending on external packages."""
    addresses: set[str] = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = info[4][0]
            if address and not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            address = probe.getsockname()[0]
            if address and not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


def _markdown_value(value: object) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value).replace("\n", " ").replace("|", "\\|")


def performance_markdown(payload: dict) -> str:
    perf = payload.get("performance") if isinstance(payload.get("performance"), dict) else {}
    renderer = payload.get("renderer") if isinstance(payload.get("renderer"), dict) else {}
    scene = payload.get("scene") if isinstance(payload.get("scene"), dict) else {}
    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    lines = [
        "# LOT KING Developer Performance Snapshot",
        "",
        "> Automatically refreshed by the Developer Debugger. Generated data; do not edit manually.",
        "",
        f"- Updated: `{_markdown_value(payload.get('generatedAt'))}`",
        f"- Engine: `{_markdown_value(payload.get('version'))}`",
        f"- Mode: `{_markdown_value(payload.get('mode'))}`",
        f"- Project/page: `{_markdown_value(project.get('title'))}`",
        f"- Active level: `{_markdown_value(project.get('activeLevel'))}`",
        "",
        "## Frame and renderer",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| FPS | {_markdown_value(perf.get('fps'))} |",
        f"| Average frame | {_markdown_value(perf.get('frameAverageMs'))} ms |",
        f"| P95 frame | {_markdown_value(perf.get('frameP95Ms'))} ms |",
        f"| Worst recent frame | {_markdown_value(perf.get('worstRecentFrameMs'))} ms |",
        f"| Captured stutters | {_markdown_value(perf.get('stutterCount'))} |",
        f"| Draw calls | {_markdown_value(renderer.get('calls'))} |",
        f"| Triangles | {_markdown_value(renderer.get('triangles'))} |",
        f"| GPU textures | {_markdown_value(renderer.get('textures'))} |",
        f"| GPU geometries | {_markdown_value(renderer.get('geometries'))} |",
        "",
        "## Scene complexity",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Authored elements | {_markdown_value(scene.get('authoredElements'))} |",
        f"| Scene objects | {_markdown_value(scene.get('objects'))} |",
        f"| Meshes / lights | {_markdown_value(scene.get('meshes'))} / {_markdown_value(scene.get('lights'))} |",
        f"| Particle systems | {_markdown_value(scene.get('particleSystems'))} |",
        f"| Particle capacity / live | {_markdown_value(scene.get('particleCapacity'))} / {_markdown_value(scene.get('liveParticles'))} |",
        f"| Visible / total sprites | {_markdown_value(scene.get('visibleSprites'))} / {_markdown_value(scene.get('sprites'))} |",
        f"| Shadow casters | {_markdown_value(scene.get('shadowCasters'))} |",
        f"| Transparent materials | {_markdown_value(scene.get('transparentMaterials'))} |",
        "",
        "## Recent diagnostics",
        "",
    ]
    diagnostics = payload.get("diagnostics") if isinstance(payload.get("diagnostics"), list) else []
    if diagnostics:
        for item in diagnostics[:12]:
            if not isinstance(item, dict):
                continue
            detail = f" — {_markdown_value(item.get('detail'))}" if item.get("detail") else ""
            lines.append(f"- `{_markdown_value(item.get('time'))}` **{_markdown_value(item.get('kind'))}**: {_markdown_value(item.get('message'))}{detail}")
    else:
        lines.append("- No errors, long tasks or frame hitches captured.")
    lines.extend(["", "## Heaviest authored elements", "", "| Element | Type | Resident estimate | Triangles | Details |", "| --- | --- | ---: | ---: | --- |"])
    elements = payload.get("heaviestElements") if isinstance(payload.get("heaviestElements"), list) else []
    if elements:
        for item in elements[:12]:
            if not isinstance(item, dict):
                continue
            lines.append(
                f"| {_markdown_value(item.get('name'))} | {_markdown_value(item.get('type'))} | "
                f"{_markdown_value(item.get('residentBytes'))} B | {_markdown_value(item.get('triangles'))} | {_markdown_value(item.get('details'))} |"
            )
    else:
        lines.append("| No authored elements detected | — | 0 B | 0 | — |")
    lines.extend(["", "Full reports are exported manually from **Dev → Performance Debugger → Export log**.", ""])
    return "\n".join(lines)


class LocalEditorHandler(SimpleHTTPRequestHandler):
    root: Path
    project_write_lock = threading.RLock()

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    @property
    def state_path(self) -> Path:
        return self.root / STATE_DIR / STATE_FILE

    @property
    def performance_path(self) -> Path:
        return self.root / STATE_DIR / PERFORMANCE_FILE

    @property
    def project_history_path(self) -> Path:
        return self.root / STATE_DIR / PROJECT_HISTORY_DIR

    @property
    def demo_path(self) -> Path:
        return self.root / DEMO_DIR / DEMO_FILE

    @staticmethod
    def file_etag(path: Path) -> str:
        stat = path.stat()
        return f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'

    def is_loopback_client(self) -> bool:
        """Disk bridges are host-private even when static files are LAN-visible."""
        try:
            address = ipaddress.ip_address(self.client_address[0].split("%", 1)[0])
            return address.is_loopback
        except (ValueError, IndexError):
            return False

    def require_loopback_bridge(self) -> bool:
        if self.is_loopback_client():
            return True
        self.send_error(403, "Lot King disk bridge is available only to the host computer")
        return False

    @staticmethod
    def _project_file_metadata(path: Path, source: str, identifier: str) -> dict[str, object]:
        stat = path.stat()
        # Project identity and save time are at the beginning of every LKEP.
        # Reading a bounded prefix keeps the Projects panel cheap even when a
        # portable version contains hundreds of megabytes of embedded assets.
        with path.open("rb") as handle:
            prefix = handle.read(1024 * 1024).decode("utf-8", errors="ignore")
        def first(field: str) -> str | None:
            match = re.search(r'"' + re.escape(field) + r'"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', prefix)
            if not match:
                return None
            try:
                return json.loads('"' + match.group(1) + '"')
            except json.JSONDecodeError:
                return match.group(1)
        project_name = first("projectName") or first("trackName") or first("name") or path.stem
        return {
            "id": identifier,
            "file": path.name,
            "name": project_name,
            "savedAt": first("savedAt"),
            "bytes": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "source": source,
        }

    def _history_candidates(self) -> list[tuple[Path, str, str]]:
        candidates: list[tuple[Path, str, str]] = []
        history = self.project_history_path
        if history.is_dir():
            for path in history.glob("*.lkep.json"):
                candidates.append((path, "version", "history/" + path.name))
        state_dir = self.root / STATE_DIR
        if state_dir.is_dir():
            for path in state_dir.glob("*.json"):
                if path.name == STATE_FILE or path.parent == history:
                    continue
                try:
                    with path.open("rb") as handle:
                        prefix = handle.read(4096)
                    if b'"format"' not in prefix or b'"LKEP"' not in prefix:
                        continue
                except OSError:
                    continue
                source = "quarantined" if "accidental-minimal" in path.name else ("recovery" if "recovery" in path.name else "legacy-backup")
                candidates.append((path, source, "legacy/" + path.name))
        return candidates

    def _history_records(self) -> list[dict[str, object]]:
        records = []
        for path, source, identifier in self._history_candidates():
            try:
                records.append(self._project_file_metadata(path, source, identifier))
            except OSError:
                continue
        records.sort(key=lambda item: str(item.get("savedAt") or item.get("modifiedAt") or ""), reverse=True)
        return records

    def _resolve_history_file(self, identifier: str) -> Path | None:
        if not isinstance(identifier, str) or "/" not in identifier:
            return None
        prefix, name = identifier.split("/", 1)
        if not name or Path(name).name != name or not name.endswith(".json"):
            return None
        base = self.project_history_path if prefix == "history" else (self.root / STATE_DIR if prefix == "legacy" else None)
        if base is None:
            return None
        path = base / name
        allowed = {candidate.resolve() for candidate, _, _ in self._history_candidates()}
        try:
            resolved = path.resolve()
        except OSError:
            return None
        return path if resolved in allowed and path.is_file() else None

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(4 * 1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    def _archive_active_project(self, reason: str) -> dict[str, object] | None:
        active = self.state_path
        if not active.is_file():
            return None
        history = self.project_history_path
        history.mkdir(parents=True, exist_ok=True)
        digest = self._file_sha256(active)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        safe_reason = re.sub(r"[^a-z0-9]+", "-", str(reason or "save").lower()).strip("-") or "save"
        stem = f"{stamp}-{safe_reason}-{digest[:12]}"
        destination = history / f"{stem}.lkep.json"
        sequence = 1
        while destination.exists():
            destination = history / f"{stem}-{sequence}.lkep.json"
            sequence += 1
        with tempfile.NamedTemporaryFile("wb", delete=False, dir=history, prefix="version-", suffix=".tmp") as handle:
            temporary = Path(handle.name)
        try:
            shutil.copy2(active, temporary)
            if self._file_sha256(temporary) != digest:
                raise OSError("project-history checksum mismatch")
            os.replace(temporary, destination)
        finally:
            if temporary.exists():
                temporary.unlink()
        return self._project_file_metadata(destination, "version", "history/" + destination.name)

    def _archive_project_payload(self, payload: bytes, reason: str) -> dict[str, object]:
        history = self.project_history_path
        history.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(payload).hexdigest()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        safe_reason = re.sub(r"[^a-z0-9]+", "-", str(reason or "snapshot").lower()).strip("-") or "snapshot"
        stem = f"{stamp}-{safe_reason}-{digest[:12]}"
        destination = history / f"{stem}.lkep.json"
        sequence = 1
        while destination.exists():
            destination = history / f"{stem}-{sequence}.lkep.json"
            sequence += 1
        _atomic_write(destination, payload)
        if self._file_sha256(destination) != digest:
            destination.unlink(missing_ok=True)
            raise OSError("project-history payload checksum mismatch")
        return self._project_file_metadata(destination, "version", "history/" + destination.name)

    def _published_demo_payload(self) -> bytes | None:
        path = self.demo_path
        if not path.is_file():
            return None
        payload = path.read_bytes()
        try:
            descriptor = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return payload
        if not isinstance(descriptor, dict) or descriptor.get("format") != "LKEP_SPLIT_POINTER":
            return payload
        manifest_name = descriptor.get("manifest")
        if not isinstance(manifest_name, str):
            raise OSError("invalid split DEMO pointer")
        manifest_path = (path.parent / manifest_name).resolve()
        if path.parent.resolve() not in manifest_path.parents:
            raise OSError("split DEMO manifest escapes demo folder")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("format") != "LKEP_SPLIT_MANIFEST":
            raise OSError("invalid split DEMO manifest")
        parts = []
        total = 0
        for spec in manifest.get("chunks") or []:
            chunk = (manifest_path.parent / str(spec.get("file") or "")).resolve()
            if manifest_path.parent not in chunk.parents or not chunk.is_file():
                raise OSError("invalid split DEMO chunk")
            data = chunk.read_bytes()
            if len(data) != int(spec.get("bytes") or -1) or hashlib.sha256(data).hexdigest() != spec.get("sha256"):
                raise OSError("split DEMO chunk integrity failure")
            parts.append(data)
            total += len(data)
        if total != int(manifest.get("totalBytes") or -1):
            raise OSError("split DEMO total size mismatch")
        return b"".join(parts)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        request_path = self.path.split("?", 1)[0]
        if request_path == SERVER_INFO_URL:
            if not self.require_loopback_bridge():
                return
            payload = json.dumps({
                "schema": "lotking.local-server.v1",
                "rootFingerprint": root_fingerprint(self.root),
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if request_path == PROJECT_HISTORY_URL:
            if not self.require_loopback_bridge():
                return
            requested = parse_qs(urlparse(self.path).query).get("file", [""])[0]
            if requested:
                path = self._resolve_history_file(requested)
                if path is None:
                    self.send_error(404, "Project version not found")
                    return
                length = path.stat().st_size
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
                self.send_header("Content-Length", str(length))
                self.end_headers()
                with path.open("rb") as handle:
                    shutil.copyfileobj(handle, self.wfile, length=1024 * 1024)
                return
            payload = json.dumps({"ok": True, "versions": self._history_records()}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if request_path == DEMO_PUBLISH_URL:
            if not self.require_loopback_bridge():
                return
            path = self.demo_path
            if not path.is_file():
                self.send_error(404, "No published demo")
                return
            try:
                project = json.loads(path.read_text(encoding="utf-8"))
                meta = project.get("meta") if isinstance(project.get("meta"), dict) else {}
                response = json.dumps({
                    "ok": True,
                    "file": f"{DEMO_DIR}/{DEMO_FILE}",
                    "bytes": path.stat().st_size,
                    "savedAt": project.get("savedAt"),
                    "trackId": meta.get("trackId"),
                    "trackName": meta.get("trackName") or meta.get("levelName"),
                }).encode("utf-8")
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                self.send_error(500, f"Published demo is invalid: {exc}")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            return
        if request_path == PERFORMANCE_URL:
            if not self.require_loopback_bridge():
                return
            path = self.performance_path
            if not path.is_file():
                self.send_error(404, "No developer performance snapshot")
                return
            payload = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/markdown; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if request_path != STATE_URL:
            super().do_GET()
            return
        if not self.require_loopback_bridge():
            return
        path = self.state_path
        if not path.is_file():
            self.send_error(404, "No local project backup")
            return
        etag = self.file_etag(path)
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        length = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(length))
        self.send_header("ETag", etag)
        self.end_headers()
        with path.open("rb") as handle:
            shutil.copyfileobj(handle, self.wfile, length=1024 * 1024)

    def do_POST(self) -> None:
        request_path = self.path.split("?", 1)[0]
        if request_path != PROJECT_HISTORY_RESTORE_URL:
            self.send_error(404)
            return
        if not self.require_loopback_bridge():
            return
        if self.headers.get("X-LotKing-Project-Authority", "") != "local-disk":
            self.send_error(409, "Explicit local project authority required")
            return
        if self.headers.get("X-LotKing-Confirm-Restore", "") != "1":
            self.send_error(409, "Explicit project-version restore confirmation required")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 64 * 1024:
            self.send_error(413, "Invalid restore request")
            return
        try:
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            identifier = request.get("id") if isinstance(request, dict) else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            identifier = None
        source = self._resolve_history_file(identifier)
        if source is None:
            self.send_error(404, "Project version not found")
            return
        if source.stat().st_size <= 0 or source.stat().st_size > MAX_STATE_BYTES:
            self.send_error(413, "Invalid project version size")
            return
        try:
            with source.open("r", encoding="utf-8") as handle:
                project = json.load(handle)
            if not isinstance(project, dict) or project.get("format") != "LKEP" or "scene" not in project:
                raise ValueError("not an LKEP project")
            with self.project_write_lock:
                archived = self._archive_active_project("before-restore")
                path = self.state_path
                path.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent, prefix="restore-", suffix=".tmp") as handle:
                    temporary = Path(handle.name)
                try:
                    shutil.copy2(source, temporary)
                    if self._file_sha256(source) != self._file_sha256(temporary):
                        raise OSError("restored project checksum mismatch")
                    os.replace(temporary, path)
                    restored_metadata = self._project_file_metadata(path, "active", "active")
                    restored_etag = self.file_etag(path)
                finally:
                    if temporary.exists():
                        temporary.unlink()
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self.send_error(500, f"Project version restore failed: {exc}")
            return
        response = json.dumps({
            "ok": True,
            "restored": restored_metadata,
            "archivedCurrent": archived,
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("ETag", restored_etag)
        self.end_headers()
        self.wfile.write(response)

    def do_PUT(self) -> None:
        request_path = self.path.split("?", 1)[0]
        if request_path == DEMO_PUBLISH_URL:
            if not self.require_loopback_bridge():
                return
            if self.headers.get("X-LotKing-Confirm-Demo-Publish", "") != "1":
                self.send_error(409, "Explicit DEMO replacement confirmation required")
                return
            with self.project_write_lock:
                self._publish_demo_project()
            return
        if request_path == PERFORMANCE_URL:
            if not self.require_loopback_bridge():
                return
            self._write_performance_snapshot()
            return
        if request_path != STATE_URL:
            self.send_error(404)
            return
        if not self.require_loopback_bridge():
            return
        if self.headers.get("X-LotKing-Project-Authority", "") != "local-disk":
            self.send_error(409, "Explicit local project authority required")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_STATE_BYTES:
            self.send_error(413, "Invalid project backup size")
            return
        payload = self.rfile.read(length)
        try:
            project = json.loads(payload.decode("utf-8"))
            if not isinstance(project, dict) or project.get("format") != "LKEP" or "scene" not in project:
                raise ValueError("not an LKEP project")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self.send_error(400, f"Invalid project backup: {exc}")
            return
        path = self.state_path
        path.parent.mkdir(parents=True, exist_ok=True)
        allow_shrink = self.headers.get("X-LotKing-Allow-Project-Shrink", "") == "1"
        with self.project_write_lock:
            if path.is_file() and self.headers.get("X-LotKing-Confirm-Overwrite", "") != "1":
                self.send_error(409, "Explicit confirmation required before replacing the active project")
                return
            if path.is_file():
                previous_size = path.stat().st_size
                suspicious_shrink = (
                    previous_size >= PROJECT_SHRINK_GUARD_MIN_BYTES
                    and length < previous_size * PROJECT_SHRINK_GUARD_RATIO
                )
                if suspicious_shrink and not allow_shrink:
                    self.send_error(409, "Refusing suspicious project shrink; use an explicit project import/replacement")
                    return
            archived = None
            if path.is_file():
                try:
                    archived = self._archive_active_project("before-save")
                except OSError as exc:
                    self.send_error(500, f"Cannot preserve the current project version: {exc}")
                    return
            with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent, prefix="project-", suffix=".tmp") as handle:
                handle.write(payload)
                temp_path = Path(handle.name)
            os.replace(temp_path, path)
            saved_etag = self.file_etag(path)
        response = json.dumps({"ok": True, "file": f"{STATE_DIR}/{STATE_FILE}", "archived": archived}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("ETag", saved_etag)
        self.end_headers()
        self.wfile.write(response)

    def _publish_demo_project(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_STATE_BYTES:
            self.send_error(413, "Invalid demo project size")
            return
        payload = self.rfile.read(length)
        try:
            project = json.loads(payload.decode("utf-8"))
            scene = project.get("scene") if isinstance(project, dict) else None
            meta = project.get("meta") if isinstance(project, dict) else None
            if project.get("format") != "LKEP" or not isinstance(scene, dict) or not isinstance(meta, dict):
                raise ValueError("not a complete LKEP project")
            if not (meta.get("trackName") or meta.get("levelName")):
                raise ValueError("project has no level name")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, AttributeError) as exc:
            self.send_error(400, f"Invalid demo project: {exc}")
            return
        path = self.demo_path
        path.parent.mkdir(parents=True, exist_ok=True)
        archived = None
        try:
            previous_payload = self._published_demo_payload()
            if previous_payload:
                archived = self._archive_project_payload(previous_payload, "before-demo-publish")
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.send_error(500, f"Cannot preserve the current DEMO version: {exc}")
            return
        publish_report: dict[str, object] = {"split": False, "chunks": 1, "largestChunkBytes": len(payload)}
        existing_split = False
        if path.is_file():
            try:
                existing_split = json.loads(path.read_text(encoding="utf-8")).get("format") == "LKEP_SPLIT_POINTER"
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass
        if len(payload) >= DEMO_SPLIT_THRESHOLD_BYTES or existing_split:
            publish_report = write_split_demo(path, payload, project)
        else:
            with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent, prefix="demo-project-", suffix=".tmp") as handle:
                handle.write(payload)
                temp_path = Path(handle.name)
            if path.is_file():
                shutil.copy2(path, path.with_name(DEMO_BACKUP_FILE))
            os.replace(temp_path, path)
        response = json.dumps({
            "ok": True,
            "file": f"{DEMO_DIR}/{DEMO_FILE}",
            "backup": f"{DEMO_DIR}/{DEMO_BACKUP_FILE}",
            "bytes": len(payload),
            "savedAt": project.get("savedAt"),
            "trackId": meta.get("trackId"),
            "trackName": meta.get("trackName") or meta.get("levelName"),
            "archived": archived,
            **publish_report,
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def _write_performance_snapshot(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_PERFORMANCE_BYTES:
            self.send_error(413, "Invalid performance snapshot size")
            return
        try:
            report = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(report, dict) or report.get("schema") != "lotking.developer-performance.v1":
                raise ValueError("unsupported performance report")
            markdown = performance_markdown(report).encode("utf-8")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self.send_error(400, f"Invalid performance snapshot: {exc}")
            return
        path = self.performance_path
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent, prefix="performance-", suffix=".tmp") as handle:
            handle.write(markdown)
            temp_path = Path(handle.name)
        os.replace(temp_path, path)
        response = json.dumps({"ok": True, "file": f"{STATE_DIR}/{PERFORMANCE_FILE}"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def existing_lotking_server(port: int, root: Path) -> bool:
    """Reuse a server only when it belongs to this exact checkout."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=1.5)
    try:
        connection.request("GET", SERVER_INFO_URL)
        response = connection.getresponse()
        payload = json.loads(response.read(64 * 1024).decode("utf-8"))
        return (
            response.status == 200
            and payload.get("schema") == "lotking.local-server.v1"
            and payload.get("rootFingerprint") == root_fingerprint(root)
        )
    except (OSError, http.client.HTTPException, UnicodeDecodeError, json.JSONDecodeError):
        return False
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve LOT KING locally with a disk-backed project cache.")
    parser.add_argument("port", nargs="?", type=int, default=5700)
    parser.add_argument("--bind", "-b", default="127.0.0.1")
    parser.add_argument("--directory", "-d", default=os.getcwd())
    parser.add_argument("--page", default="index.html")
    parser.add_argument("--open-browser", action="store_true")
    args = parser.parse_args()
    try:
        bind_address = ipaddress.ip_address(socket.gethostbyname(args.bind))
    except (ValueError, OSError):
        parser.error("--bind must resolve to a loopback address")
    if not bind_address.is_loopback:
        parser.error("serve_local.py is loopback-only; use serve_lan.py for network access")
    root = Path(args.directory).resolve()
    page = str(args.page or "index.html").lstrip("/")
    handler = lambda *a, **kw: LocalEditorHandler(*a, directory=str(root), **kw)
    LocalEditorHandler.root = root
    server = None
    selected_port = args.port
    for candidate in range(args.port, min(65536, args.port + 20)):
        url = f"http://localhost:{candidate}/{page}"
        if existing_lotking_server(candidate, root):
            print(f"LOT KING local editor already running: {url}")
            if args.open_browser:
                webbrowser.open(url)
            return
        try:
            server = ThreadingHTTPServer((str(bind_address), candidate), handler)
            selected_port = candidate
            break
        except OSError as exc:
            if exc.errno not in {getattr(socket, "EADDRINUSE", 98), 10048}:
                raise
    if server is None:
        raise SystemExit(f"No free local editor port found from {args.port} through {min(65535, args.port + 19)}.")
    url = f"http://localhost:{selected_port}/{page}"
    print(f"LOT KING local editor: http://localhost:{selected_port}/engine_editor.html")
    print("Security boundary: loopback only (not exposed to LAN).")
    print(f"Project backup: {root / STATE_DIR / STATE_FILE}")
    print(f"Performance snapshot: {root / STATE_DIR / PERFORMANCE_FILE}")
    if args.open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
