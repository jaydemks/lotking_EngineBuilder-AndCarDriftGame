import http.client
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from pathlib import Path

from serve_local import LocalEditorHandler, root_fingerprint, write_split_demo
from serve_lan import LanEditorHandler


class LocalBridgeBoundaryTests(unittest.TestCase):
    def test_checkout_fingerprint_is_stable_and_path_specific(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            self.assertEqual(root_fingerprint(Path(first)), root_fingerprint(Path(first)))
            self.assertNotEqual(root_fingerprint(Path(first)), root_fingerprint(Path(second)))

    def handler_for(self, address: str) -> LocalEditorHandler:
        handler = object.__new__(LocalEditorHandler)
        handler.client_address = (address, 50000)
        return handler

    def test_loopback_can_use_disk_bridge(self) -> None:
        self.assertTrue(self.handler_for("127.0.0.1").is_loopback_client())

    def test_lan_client_cannot_use_disk_bridge(self) -> None:
        self.assertFalse(self.handler_for("192.168.1.42").is_loopback_client())

    def test_lan_server_allows_bridge_only_to_the_host_machine(self) -> None:
        handler = object.__new__(LanEditorHandler)
        handler.client_address = ("192.168.1.10", 50000)
        with patch("serve_lan.local_ips", return_value=["192.168.1.10"]):
            self.assertTrue(handler.is_loopback_client())
        handler.client_address = ("192.168.1.42", 50000)
        with patch("serve_lan.local_ips", return_value=["192.168.1.10"]):
            self.assertFalse(handler.is_loopback_client())

    def test_lan_server_keeps_project_state_port_independent_on_host(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            LanEditorHandler.root = root
            handler = lambda *args, **kwargs: LanEditorHandler(*args, directory=str(root), **kwargs)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            project = {"format":"LKEP", "meta":{"projectName":"Active Local"}, "scene":{"added":[]}, "savedAt":"now"}
            payload = json.dumps(project).encode("utf-8")
            try:
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                connection.request("PUT", "/__lotking/project-state", body=payload, headers={"Content-Type":"application/json", "Content-Length":str(len(payload)), "X-LotKing-Project-Authority":"local-disk", "X-LotKing-Confirm-Overwrite":"1"})
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, 200)
                connection.request("GET", "/__lotking/project-state")
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read()), project)
                connection.request("GET", "/.lotking-local/active-project.lkep.json")
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, 404)
                connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)

    def test_local_bridge_rejects_an_accidental_major_project_shrink(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            state = root / ".lotking-local" / "active-project.lkep.json"
            state.parent.mkdir(parents=True)
            large = {"format":"LKEP", "meta":{"projectName":"Real Project"}, "scene":{"added":[]}, "payload":"x" * (2 * 1024 * 1024)}
            small = {"format":"LKEP", "meta":{"projectName":"Empty"}, "scene":{"added":[]}}
            state.write_text(json.dumps(large), encoding="utf-8")
            LocalEditorHandler.root = root
            handler = lambda *args, **kwargs: LocalEditorHandler(*args, directory=str(root), **kwargs)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                payload = json.dumps(small).encode("utf-8")
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                connection.request("PUT", "/__lotking/project-state", body=payload, headers={"Content-Type":"application/json", "Content-Length":str(len(payload)), "X-LotKing-Project-Authority":"local-disk", "X-LotKing-Confirm-Overwrite":"1"})
                response = connection.getresponse(); response.read()
                self.assertEqual(response.status, 409)
                self.assertEqual(json.loads(state.read_text(encoding="utf-8"))["meta"]["projectName"], "Real Project")
                connection.request("PUT", "/__lotking/project-state", body=payload, headers={"Content-Type":"application/json", "Content-Length":str(len(payload)), "X-LotKing-Project-Authority":"local-disk", "X-LotKing-Confirm-Overwrite":"1", "X-LotKing-Allow-Project-Shrink":"1"})
                response = connection.getresponse(); response.read()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(state.read_text(encoding="utf-8"))["meta"]["projectName"], "Empty")
                connection.close()
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=5)

    def test_local_bridge_requires_explicit_disk_authority(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            LocalEditorHandler.root = root
            handler = lambda *args, **kwargs: LocalEditorHandler(*args, directory=str(root), **kwargs)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                project = {"format":"LKEP", "scene":{"added":[]}}
                payload = json.dumps(project).encode("utf-8")
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                connection.request("PUT", "/__lotking/project-state", body=payload, headers={"Content-Type":"application/json", "Content-Length":str(len(payload))})
                response = connection.getresponse(); response.read()
                self.assertEqual(response.status, 409)
                self.assertFalse((root / ".lotking-local" / "active-project.lkep.json").exists())
                connection.close()
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=5)

    def test_project_history_is_append_only_visible_and_confirmed(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            state = root / ".lotking-local" / "active-project.lkep.json"
            state.parent.mkdir(parents=True)
            old_project = {"format":"LKEP", "meta":{"projectName":"Old Project"}, "scene":{"added":[]}, "savedAt":"2026-01-01T00:00:00Z"}
            new_project = {"format":"LKEP", "meta":{"projectName":"New Project"}, "scene":{"added":[{"kind":"box"}]}, "savedAt":"2026-02-01T00:00:00Z"}
            state.write_text(json.dumps(old_project), encoding="utf-8")
            LocalEditorHandler.root = root
            handler = lambda *args, **kwargs: LocalEditorHandler(*args, directory=str(root), **kwargs)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                payload = json.dumps(new_project).encode("utf-8")
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                base_headers = {"Content-Type":"application/json", "Content-Length":str(len(payload)), "X-LotKing-Project-Authority":"local-disk"}
                connection.request("PUT", "/__lotking/project-state", body=payload, headers=base_headers)
                response = connection.getresponse(); response.read()
                self.assertEqual(response.status, 409)
                self.assertEqual(json.loads(state.read_text(encoding="utf-8"))["meta"]["projectName"], "Old Project")
                connection.request("PUT", "/__lotking/project-state", body=payload, headers={**base_headers, "X-LotKing-Confirm-Overwrite":"1"})
                response = connection.getresponse(); report = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(report["archived"]["name"], "Old Project")
                connection.request("GET", "/__lotking/project-history")
                response = connection.getresponse(); history = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(len(history["versions"]), 1)
                version_id = history["versions"][0]["id"]
                restore_payload = json.dumps({"id":version_id}).encode("utf-8")
                restore_headers = {"Content-Type":"application/json", "Content-Length":str(len(restore_payload)), "X-LotKing-Project-Authority":"local-disk"}
                connection.request("POST", "/__lotking/project-history/restore", body=restore_payload, headers=restore_headers)
                response = connection.getresponse(); response.read()
                self.assertEqual(response.status, 409)
                connection.request("POST", "/__lotking/project-history/restore", body=restore_payload, headers={**restore_headers, "X-LotKing-Confirm-Restore":"1"})
                response = connection.getresponse(); response.read()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(state.read_text(encoding="utf-8"))["meta"]["projectName"], "Old Project")
                self.assertEqual(len(list((state.parent / "project-history").glob("*.lkep.json"))), 2)
                connection.close()
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=5)

    def test_demo_publish_is_validated_atomic_and_backed_up(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            demo = root / "demo" / "demo-project.lkep.json"
            demo.parent.mkdir(parents=True)
            old_project = {"format":"LKEP", "meta":{"trackName":"Old"}, "scene":{}, "savedAt":"old"}
            new_project = {"format":"LKEP", "meta":{"trackId":"new", "trackName":"New"}, "scene":{"added":[]}, "savedAt":"new"}
            demo.write_text(json.dumps(old_project), encoding="utf-8")
            LocalEditorHandler.root = root
            handler = lambda *args, **kwargs: LocalEditorHandler(*args, directory=str(root), **kwargs)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                payload = json.dumps(new_project).encode("utf-8")
                connection.request("PUT", "/__lotking/publish-demo", body=payload, headers={"Content-Type":"application/json", "Content-Length":str(len(payload)), "X-LotKing-Confirm-Demo-Publish":"1"})
                response = connection.getresponse()
                report = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(report["trackName"], "New")
                self.assertEqual(json.loads(demo.read_text(encoding="utf-8"))["savedAt"], "new")
                backup = demo.with_name("demo-project.previous.lkep.json")
                self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))["savedAt"], "old")
                versions = list((root / ".lotking-local" / "project-history").glob("*.lkep.json"))
                self.assertEqual(len(versions), 1)
                self.assertEqual(json.loads(versions[0].read_text(encoding="utf-8"))["savedAt"], "old")
                connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)

    def test_split_demo_reconstructs_exact_project_and_keeps_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pointer = root / "demo" / "demo-project.lkep.json"
            pointer.parent.mkdir(parents=True)
            old_payload = json.dumps({"format":"LKEP", "meta":{"trackName":"Old"}, "scene":{}}).encode("utf-8")
            pointer.write_bytes(old_payload)
            project = {"format":"LKEP", "meta":{"trackName":"Nuova città 🚗"}, "scene":{"added":[]}, "savedAt":"now"}
            payload = json.dumps(project, ensure_ascii=False).encode("utf-8")

            report = write_split_demo(pointer, payload, project)

            descriptor = json.loads(pointer.read_text(encoding="utf-8"))
            manifest_path = pointer.parent / descriptor["manifest"]
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            reconstructed = b"".join((manifest_path.parent / chunk["file"]).read_bytes() for chunk in manifest["chunks"])
            self.assertTrue(report["split"])
            self.assertEqual(reconstructed, payload)
            self.assertEqual((pointer.parent / "demo-project.previous.lkep.json").read_bytes(), old_payload)


if __name__ == "__main__":
    unittest.main()
