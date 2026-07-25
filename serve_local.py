#!/usr/bin/env python3
"""Local-only LOT KING editor server with port-independent project backup."""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import shutil
import socket
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATE_URL = "/__lotking/project-state"
STATE_DIR = ".lotking-local"
STATE_FILE = "active-project.lkep.json"
STATE_BACKUP_FILE = "active-project.previous.lkep.json"
MAX_STATE_BYTES = 512 * 1024 * 1024
PERFORMANCE_URL = "/__lotking/developer-performance"
PERFORMANCE_FILE = "developer-performance-latest.md"
MAX_PERFORMANCE_BYTES = 2 * 1024 * 1024
DEMO_PUBLISH_URL = "/__lotking/publish-demo"
DEMO_DIR = "demo"
DEMO_FILE = "demo-project.lkep.json"
DEMO_BACKUP_FILE = "demo-project.previous.lkep.json"


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

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    @property
    def state_path(self) -> Path:
        return self.root / STATE_DIR / STATE_FILE

    @property
    def performance_path(self) -> Path:
        return self.root / STATE_DIR / PERFORMANCE_FILE

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

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        request_path = self.path.split("?", 1)[0]
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

    def do_PUT(self) -> None:
        request_path = self.path.split("?", 1)[0]
        if request_path == DEMO_PUBLISH_URL:
            if not self.require_loopback_bridge():
                return
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
        with tempfile.NamedTemporaryFile("wb", delete=False, dir=path.parent, prefix="project-", suffix=".tmp") as handle:
            handle.write(payload)
            temp_path = Path(handle.name)
        if path.is_file():
            shutil.copy2(path, path.with_name(STATE_BACKUP_FILE))
        os.replace(temp_path, path)
        response = json.dumps({"ok": True, "file": f"{STATE_DIR}/{STATE_FILE}"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("ETag", self.file_etag(path))
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve LOT KING locally with a disk-backed project cache.")
    parser.add_argument("port", nargs="?", type=int, default=5700)
    parser.add_argument("--bind", "-b", default="127.0.0.1")
    parser.add_argument("--directory", "-d", default=os.getcwd())
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    handler = lambda *a, **kw: LocalEditorHandler(*a, directory=str(root), **kw)
    LocalEditorHandler.root = root
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"LOT KING local editor: http://localhost:{args.port}/engine_editor.html")
    if args.bind not in {"127.0.0.1", "localhost", "::1"}:
        print("LAN browser instances:")
        for address in local_ips():
            print(f"  http://{address}:{args.port}/")
            print(f"  http://{address}:{args.port}/engine_editor.html")
        print("Each device keeps an independent browser database; only localhost uses the disk bridge.")
    print(f"Project backup: {root / STATE_DIR / STATE_FILE}")
    print(f"Performance snapshot: {root / STATE_DIR / PERFORMANCE_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
