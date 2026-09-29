import asyncio
import base64
import hashlib
import sys
import types
import unittest
from unittest.mock import patch
from relayer_graph import (ActionObject, GraphSession, NodeObject, LayerObject,
    LayerLayoutObject, NodePlacementObject, html, action_capability, external_link,
    VisualAssetFile, GraphVisualAssets)
from relayer_graph.visual_assets import _decode_file
from relayer_graph.exceptions import ValidationError


class VisualAuthoringTests(unittest.IsolatedAsyncioTestCase):
    async def test_presentation_read_and_frozen_policy_versions(self):
        from relayer_graph import InteractionInput
        node = {"id": 1, "kind": "interaction", "icon": "box", "title": "Ask", "detail": "Ask", "state": "accepted"}
        for policy in (None, {"version": "1", "enabled": True, "permissions": [{"kind": "navigate.add", "nodeId": 2}]},
                       {"version": "2", "enabled": True, "permissions": [{"kind": "navigate.add", "nodeId": 2}, {"kind": "invoke.resolve", "actionId": 3}]},
                       {"version": "2", "enabled": False, "permissions": []}):
            graph = GraphSession("http://unused", "run", 1)
            async def request(method, path, body=None):
                self.assertEqual(method, "GET")
                if path == "/api/graph/input":
                    return {"interaction": node, **({} if policy is None else {"interactionPermissions": policy})}
                self.assertEqual(path, "/api/graph/nodes/2/presentation")
                return {"node": {**node, "id": 2, "clientKey": "persistent"}, "revision": 4, "actions": []}
            graph._request = request
            self.assertEqual((await graph.get_interaction_input()).interaction_permissions, policy)
            self.assertEqual((await graph.get_node_presentation(2))["node"]["clientKey"], "persistent")

    async def test_session_binding_snapshot_and_frozen_submission(self):
        node = NodeObject('box', 'Answer', 'Fallback', client_key='answer')
        layer = LayerObject([node], [], LayerLayoutObject([NodePlacementObject(node, .5, .5)]), client_key='root')
        action = ActionObject('invoke', 'Continue', layer, 'continue', interaction_text='Continue')
        node.detail_authoring.set_component('main', html(['<button gc=', '>Continue</button>'], action_capability('continue', action)))
        requests = []
        async def host_request(method, payload=None):
            if method == 'relayer.graph.current':
                return {'url': 'http://unused', 'token': 'original-run', 'nodeId': 1}
            requests.append(payload)
            self.assertEqual(payload['token'], 'original-run')
            self.assertEqual(payload['detail']['components'][0]['markup']['values'][0]['action']['sourceLayer'], {'clientKey': 'root', 'nodes': ['answer']})
            return {'ok': True, 'frozen': True, 'value': {'id': 2, 'kind': 'concept', 'icon': 'box', 'title': 'Answer', 'detail': 'Fallback', 'state': 'draft', 'authoredDetail': {'version': 1}}}
        with patch.dict(sys.modules, {'rlm': types.SimpleNamespace(host_request=host_request)}):
            session = await GraphSession.current()
            await session.submit_node(node)
        self.assertEqual(node.ref.authored_detail, {'version': 1})
        with self.assertRaisesRegex(ValueError, 'detail_finalized'):
            node.detail_authoring.clear()

    async def test_concurrent_submit_locks_builder_and_joins_same_request(self):
        node = NodeObject('box', 'Answer', 'Fallback', client_key='answer')
        node.detail_authoring.set_component('main', html('<p>Original</p>'))
        entered, release = asyncio.Event(), asyncio.Event()
        calls = []
        async def host_request(method, payload):
            calls.append(payload)
            entered.set()
            await release.wait()
            return {'ok': True, 'frozen': True, 'value': {'id': 2, 'kind': 'concept', 'icon': 'box', 'title': 'Answer', 'detail': 'Fallback', 'state': 'draft'}}
        with patch.dict(sys.modules, {'rlm': types.SimpleNamespace(host_request=host_request)}):
            graph = GraphSession('http://unused', 'run', 1)
            first = asyncio.create_task(graph.submit_node(node))
            await entered.wait()
            node.client_key = "mutated-after-snapshot"
            node.detail_authoring._object_id = "mutated-after-snapshot"
            second = asyncio.create_task(graph.submit_node(node))
            with self.assertRaisesRegex(ValueError, 'in_progress'):
                node.detail_authoring.clear()
            release.set()
            left, right = await asyncio.gather(first, second)
            self.assertIs(left, right)
            self.assertEqual(calls[0]["node"]["clientKey"], "answer")
            self.assertIs(await graph.submit_node(node), left)
            graph.node_id = 2
            with self.assertRaisesRegex(ValueError, "scope_mismatch"):
                await graph.submit_node(node)
            self.assertEqual(len(calls), 1)
            graph.node_id = 1
            replacement = NodeObject('box', 'Replacement', 'Different', client_key='answer')
            replacement.detail_authoring._object_id = calls[0]["objectId"]
            replacement.detail_authoring.set_component('main', html('<p>Replacement</p>'))
            await graph.submit_node(replacement)
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[1]['node']['title'], 'Replacement')

    async def test_host_result_freezes_captured_builder_after_live_field_replacement(self):
        node = NodeObject('box', 'Original', 'Fallback', client_key='answer')
        other = NodeObject('box', 'Other', 'Fallback', client_key='other')
        original_authoring = node.detail_authoring
        original_authoring.set_component('main', html('<p>Original</p>'))
        async def host_request(method, payload):
            node.detail_authoring = other.detail_authoring
            return {'ok': True, 'frozen': True, 'value': {'id': 2, 'kind': 'concept', 'icon': 'box', 'title': 'Original', 'detail': 'Fallback', 'state': 'draft'}}
        with patch.dict(sys.modules, {'rlm': types.SimpleNamespace(host_request=host_request)}):
            await GraphSession('http://unused', 'run', 1).submit_node(node)
        node.detail_authoring = original_authoring
        with self.assertRaisesRegex(ValueError, "detail_finalized"):
            original_authoring.set_component('main', html('<p>Changed</p>'))
        other.detail_authoring.set_component('main', html('<p>Other</p>'))

    async def test_locked_failures_replay_exact_envelope_despite_live_mutation(self):
        for failure_kind in ("transport", "frozen-host"):
            with self.subTest(failure_kind=failure_kind):
                node = NodeObject('box', 'Original', 'Fallback', client_key='answer')
                node.detail_authoring.set_component('main', html('<p>Original</p>'))
                calls = []
                async def host_request(method, payload):
                    calls.append(payload)
                    if len(calls) == 1:
                        if failure_kind == "transport":
                            raise RuntimeError("lost response")
                        return {"ok": False, "frozen": True, "message": "lost graph response"}
                    return {'ok': True, 'frozen': True, 'value': {'id': 2, 'kind': 'concept', 'icon': 'box', 'title': 'Original', 'detail': 'Fallback', 'state': 'draft'}}
                with patch.dict(sys.modules, {'rlm': types.SimpleNamespace(host_request=host_request)}):
                    graph = GraphSession('http://unused', 'run', 1)
                    with self.assertRaises((RuntimeError, ValidationError)):
                        await graph.submit_node(node)
                    node.client_key, node.title = "changed", "Changed"
                    node.detail_authoring._object_id = "changed"
                    with self.assertRaisesRegex(ValueError, "detail_finalized"):
                        node.detail_authoring.clear()
                    graph.node_id = 2
                    with self.assertRaisesRegex(ValueError, "scope_mismatch"):
                        await graph.submit_node(node)
                    self.assertEqual(len(calls), 1)
                    graph.node_id = 1
                    result = await graph.submit_node(node)
                    self.assertEqual(calls[0], calls[1])
                    self.assertEqual(calls[1]["node"]["clientKey"], "answer")
                    self.assertEqual(result.title, "Original")

    async def test_checkpoint_and_submit_errors_preserve_guidance_and_allow_repair(self):
        for operation in ('checkpoint_node_detail', 'submit_node'):
            with self.subTest(operation=operation):
                node = NodeObject('box', 'Answer', 'Fallback', client_key='answer')
                node.detail_authoring.set_component('main', html('<script>bad</script>'))
                failure = {'ok': False, 'frozen': False, 'message': 'Invalid authored detail',
                    'issues': [{'code': 'forbidden_element', 'componentId': 'main',
                                'message': 'Remove script', 'location': {'line': 1, 'column': 1}}]}
                replies = [failure, {'ok': True, 'frozen': True, 'value': {
                    'id': 2, 'kind': 'concept', 'icon': 'box', 'title': 'Answer',
                    'detail': 'Fallback', 'state': 'draft'}}]
                async def host_request(method, payload):
                    return replies.pop(0)
                with patch.dict(sys.modules, {'rlm': types.SimpleNamespace(host_request=host_request)}):
                    graph = GraphSession('http://unused', 'run', 1)
                    with self.assertRaises(ValidationError) as caught:
                        await getattr(graph, operation)(node)
                    self.assertEqual(caught.exception.status, 422)
                    self.assertEqual(caught.exception.details, failure)
                    self.assertIn('Remove script', str(caught.exception))
                    self.assertIn('main', str(caught.exception))
                    node.detail_authoring.set_component('main', html('<p>Repaired</p>'))
                    await graph.submit_node(node)
                    self.assertEqual(node.ref.id, 2)

    async def test_owner_identity_and_clear_are_explicit(self):
        owner = NodeObject('box', 'Answer', 'Fallback', client_key='answer')
        impostor = NodeObject('box', 'Answer', 'Fallback', client_key='answer')
        layer = LayerObject([impostor], [], LayerLayoutObject([]), client_key='root')
        action = ActionObject('invoke', 'Continue', layer, 'continue', interaction_text='Continue')
        with self.assertRaisesRegex(ValueError, 'exact owning'):
            action.to_detail_wire(owner)
        owner.detail_authoring.set_component('main', html(['<button gc=', '>Continue</button>'], action_capability('continue', action)))
        with self.assertRaisesRegex(ValueError, 'exact owning'):
            await GraphSession('http://unused', 'run', 1).submit_node(owner)
        owner.detail_authoring.clear()
        with self.assertRaisesRegex(TypeError, "owning node"):
            type(owner.detail_authoring)()
        owner = NodeObject('box', 'Answer', 'Fallback', client_key='answer')

        self.assertEqual(owner.detail_authoring.to_wire(owner), {'clear': False, 'components': []})
        owner.detail_authoring.clear()
        self.assertEqual(owner.detail_authoring.to_wire(owner), {'clear': True, 'components': []})
        owner.detail_authoring.set_component('main', html('<p>Replaced</p>'))
        self.assertFalse(owner.detail_authoring.to_wire(owner)['clear'])

    async def test_asset_file_integrity_and_authenticated_routes(self):
        content = b'asset bytes'
        wire = {'name': 'a.png', 'mediaType': 'image/png', 'contentBase64': base64.b64encode(content).decode(), 'expectedDigest': 'sha256:' + hashlib.sha256(content).hexdigest()}
        self.assertEqual(_decode_file(wire).read(), content)
        with self.assertRaisesRegex(ValueError, 'Corrupt'):
            _decode_file({**wire, 'expectedDigest': 'sha256:wrong'})
        seen = []
        class Client:
            async def _request(self, method, path, body=None):
                seen.append((method, path, body))
                return {'id': 'asset'}
        assets = GraphVisualAssets(Client())
        await assets.add(file=VisualAssetFile('a.png', 'image/png', content), scope={'kind': 'thread', 'threadId': 1}, name='A')
        self.assertEqual(seen[0][1], '/api/graph/visual-assets/operations')
        self.assertEqual(seen[0][2]['operation']['file']['contentBase64'], wire['contentBase64'])
