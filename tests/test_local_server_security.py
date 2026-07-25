import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

from serve_local import LocalEditorHandler


class LocalBridgeBoundaryTests(unittest.TestCase):
    def handler_for(self, address: str) -> LocalEditorHandler:
        handler = object.__new__(LocalEditorHandler)
        handler.client_address = (address, 50000)
        return handler

    def test_loopback_can_use_disk_bridge(self) -> None:
        self.assertTrue(self.handler_for("127.0.0.1").is_loopback_client())

    def test_lan_client_cannot_use_disk_bridge(self) -> None:
        self.assertFalse(self.handler_for("192.168.1.42").is_loopback_client())

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
                connection.request("PUT", "/__lotking/publish-demo", body=payload, headers={"Content-Type":"application/json", "Content-Length":str(len(payload))})
                response = connection.getresponse()
                report = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(report["trackName"], "New")
                self.assertEqual(json.loads(demo.read_text(encoding="utf-8"))["savedAt"], "new")
                backup = demo.with_name("demo-project.previous.lkep.json")
                self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))["savedAt"], "old")
                connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
