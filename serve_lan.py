#!/usr/bin/env python3
"""
Small LAN static server for phone/tablet testing.

Run from the project root:
  python3 serve_lan.py

Then open one of the printed http://LAN-IP:PORT URLs on a device connected to
the same Wi-Fi network.
"""
from __future__ import annotations

import argparse
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class QuietStaticHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".hdr": "application/octet-stream",
        ".wasm": "application/wasm",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def copyfile(self, source, outputfile) -> None:
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            self.close_connection = True
            self.log_message("client disconnected while sending %s", self.path)


def local_ips() -> list[str]:
    ips: set[str] = set()
    hostname = socket.gethostname()
    try:
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass

    # This normally does not send packets; it asks the OS which local address
    # would be used for outbound LAN/Internet traffic.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass

    return sorted(ips)


def is_wsl() -> bool:
    try:
        with open("/proc/sys/kernel/osrelease", "r", encoding="utf-8") as fh:
            return "microsoft" in fh.read().lower()
    except OSError:
        return False


def windows_path_from_wsl(path: str) -> str | None:
    path = os.path.abspath(path)
    if len(path) > 7 and path.startswith("/mnt/") and path[5].isalpha() and path[6] == "/":
        drive = path[5].upper()
        rest = path[7:].replace("/", "\\")
        return f"{drive}:\\{rest}"
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Lot King on the local network.")
    parser.add_argument("--port", "-p", type=int, default=8000)
    parser.add_argument("--bind", "-b", default="0.0.0.0")
    parser.add_argument("--dir", "-d", default=os.getcwd())
    args = parser.parse_args()

    root = os.path.abspath(args.dir)
    handler = lambda *a, **kw: QuietStaticHandler(*a, directory=root, **kw)
    server = ThreadingHTTPServer((args.bind, args.port), handler)

    print("Lot King LAN server")
    print("Root:", root)
    print("Bind:", f"{args.bind}:{args.port}")
    print("")
    print("Open from this computer:")
    print(f"  http://127.0.0.1:{args.port}/")
    print(f"  http://127.0.0.1:{args.port}/gameplay.html")
    print(f"  http://127.0.0.1:{args.port}/engine_editor.html")
    print("")
    ips = local_ips()
    if ips:
        print("Open from phone/tablet on the same Wi-Fi:")
        for ip in ips:
            print(f"  http://{ip}:{args.port}/")
            print(f"  http://{ip}:{args.port}/gameplay.html")
            print(f"  http://{ip}:{args.port}/engine_editor.html")
    else:
        print("No LAN IP detected. Check your Wi-Fi/network adapter.")
    print("")
    if is_wsl():
        print("WSL2 detected.")
        print("Phone/tablet LAN access usually cannot reach a server bound inside WSL.")
        win_path = windows_path_from_wsl(root)
        print("For mobile testing, run the Windows helper instead:")
        if win_path:
            print(f"  {win_path}\\serve_lan_windows.bat")
            print("or from Windows PowerShell:")
            print(f"  Set-Location '{win_path}'")
        else:
            print("  serve_lan_windows.bat")
        print(f"  py -3 serve_lan.py --port {args.port} --bind 0.0.0.0")
        print("")
    print("If the phone cannot connect, allow Python through the firewall")
    print("or run this from Windows PowerShell in the project folder:")
    print(f"  py -3 serve_lan.py --port {args.port} --bind 0.0.0.0")
    print("")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
