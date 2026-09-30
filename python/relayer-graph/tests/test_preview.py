from __future__ import annotations

import asyncio
import base64
import json
import os
import tempfile
import threading
import unittest
import unittest.mock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from relayer_graph import (GraphPreview, LayerLayoutObject, LayerObject, NodeObject,
                           NodePlacementObject, RelayerGraphClient)

PNG = b"\x89PNG\r\n\x1a\n\x07"
FINGERPRINT = "sha256:" + "ab" * 32


class PreviewHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
        if self.path.endswith("/nodes"):
            value = {"node": {"id": 10, "kind": body["kind"], "icon": body["icon"], "title": body["title"],
                              "detail": body["detail"], "state": "draft"}}
        else:
            value = {"layer": {"id": 30, "nodes": body["nodes"], "edges": body["edges"], "layout": body["layout"],
                               "state": "draft"},
                     "preview": {"status": "rendered", "fingerprint": FINGERPRINT, "width": 1176, "height": 812,
                                 "pngBase64": base64.b64encode(PNG).decode()}}
        encoded = json.dumps(value).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


class DraftPreviewTest(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), PreviewHandler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.folder = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.folder.cleanup()

    def test_layer_preview_is_written_and_plain_writes_are_unchanged(self):
        client = RelayerGraphClient(f"http://127.0.0.1:{self.server.server_port}", "token", 1,
                                    preview_directory=self.folder.name)
        node = NodeObject("box", "Queue", "Waiting work", client_key="queue")
        submitted = asyncio.run(client.submit_node(node))
        self.assertIsNone(submitted.preview)

        layer = asyncio.run(client.submit_layer(LayerObject(
            [node], [], LayerLayoutObject([NodePlacementObject(node, 0.5, 0.5)], "default"), client_key="root")))
        path = os.path.join(self.folder.name, "layer-30-abababababababab.png")
        self.assertEqual(layer.preview, GraphPreview("rendered", path, 1176, 812))
        with open(path, "rb") as file:
            self.assertEqual(file.read(), PNG)

    def test_the_harness_environment_supplies_the_preview_folder(self):
        environment = {"RELAYER_GRAPH_URL": "http://127.0.0.1:1", "RELAYER_GRAPH_TOKEN": "token",
                       "RELAYER_NODE_ID": "1", "RELAYER_GRAPH_PREVIEW_DIR": "/tmp/previews-1"}
        with unittest.mock.patch.dict(os.environ, environment):
            self.assertEqual(RelayerGraphClient.from_env().preview_directory, "/tmp/previews-1")


if __name__ == "__main__":
    unittest.main()
