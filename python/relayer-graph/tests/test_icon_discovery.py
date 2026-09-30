import base64
import unittest
from relayer_graph.icon_discovery import GraphIcons

class IconDiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovery_and_inspection_wire(self):
        sent = []
        class Client:
            async def _request(self, method, path, body):
                sent.append((method, path, body))
                if path.endswith("discover"):
                    return {"items": [{"id": "fish", "kind": "symbol", "icon": "fish"}], "candidateSource": "catalog-text-v1"}
                preview = {"name": "fish.svg", "mediaType": "image/svg+xml", "contentBase64": base64.b64encode(b"<svg/>").decode()}
                return {"previews": [preview], "contactSheet": preview}
        icons = GraphIcons(Client())
        result = await icons.discover("marine", kind="symbols", limit=2, scope={"kind": "thread", "threadId": 7})
        inspected = await icons.inspect([result["items"][0]["icon"]], contact_sheet=True)
        self.assertEqual(inspected["previews"][0].read(), b"<svg/>")
        self.assertEqual(inspected["contactSheet"].read(), b"<svg/>")
        self.assertEqual(sent[0][2]["scope"], {"kind": "thread", "threadId": 7})
        self.assertEqual(sent[1][2], {"icons": ["fish"], "contactSheet": True})


    async def test_static_symbol_detail_registers_pinned_preview_in_current_scope(self):
        from relayer_graph import symbol_icon_detail
        from relayer_graph.visual_assets import GraphVisualAssets
        sent = []
        class Client:
            async def _request(self, method, path, body=None):
                sent.append((method, path, body))
                if path.endswith("/scope"):
                    return {"scope": {"kind": "thread", "threadId": 7}}
                if path.endswith("/inspect"):
                    return {"previews": [{"name": "waves.svg", "mediaType": "image/svg+xml", "contentBase64": base64.b64encode(b'<svg stroke="currentColor"/>').decode()}], "contactSheet": None}
                return {"id": "registered-waves"}
        graph = Client()
        graph.icons = GraphIcons(graph)
        graph.visual_assets = GraphVisualAssets(graph)
        component = await symbol_icon_detail(graph, "waves")
        self.assertIn("object-fit: contain", component["css"])
        self.assertEqual(sent[2][2]["operation"]["file"]["contentBase64"], base64.b64encode(b'<svg stroke="#767676"/>').decode())
        self.assertEqual(sent[2][2]["operation"]["scope"], {"kind": "thread", "threadId": 7})
