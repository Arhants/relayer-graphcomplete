import copy
import gc
import weakref
import unittest
import sys
import types
from unittest.mock import patch
from relayer_graph import NodeObject, GraphSession, html, asset_ref, LayerObject, LayerLayoutObject, ActionObject, action_capability
from relayer_graph.detail import DetailTemplate, NodeDetailAuthoring


def node(key):
    return NodeObject("info", key, "Fallback", client_key=key)


class DetailOwnershipTests(unittest.IsolatedAsyncioTestCase):
    def test_captured_loop_and_permanent_ownership(self):
        answer, mechanism = node("answer"), node("mechanism")
        page = html("<p>The sky is blue</p>")
        mechanism.detail_authoring.set_component("main", html("<p>Previous valid detail</p>"))
        before = mechanism.detail_authoring.to_wire(mechanism)
        answer.detail_authoring.set_component("main", page)
        for candidate in [page, copy.copy(page), copy.deepcopy(page)]:
            with self.assertRaisesRegex(ValueError, "detail_template_owner_mismatch.*answer.*mechanism"):
                mechanism.detail_authoring.set_component("other", candidate)
        answer.detail_authoring.clear()
        with self.assertRaisesRegex(ValueError, "detail_template_owner_mismatch"):
            mechanism.detail_authoring.set_component("main", page)
        self.assertEqual(before, mechanism.detail_authoring.to_wire(mechanism))
        answer.detail_authoring.set_component("again", page)
        with self.assertRaises(TypeError):
            html(["<section>", "</section>"], page)
        with self.assertRaisesRegex(ValueError, "unrecognized"):
            mechanism.detail_authoring.set_component("forged", DetailTemplate(page.strings, page.values))
        with self.assertRaisesRegex(TypeError, "owning node"):
            NodeDetailAuthoring()

    async def test_action_provenance_survives_checkpoint_and_submit_repair(self):
        graph = GraphSession("http://localhost", "token", 1)
        original, repair = graph.bind_node(node("answer")), graph.bind_node(node("answer"))
        layer = LayerObject([original], [], LayerLayoutObject([]), client_key="source")
        target = LayerObject([], [], LayerLayoutObject([]), client_key="target")
        actions = [ActionObject("navigate", "Expand", layer, "expand", target=target, relation="expand"),
                   ActionObject("navigate", "Reference", layer, "reference", target=target, relation="reference"),
                   ActionObject("invoke", "Run", layer, "run", interaction_text="Run"),
                   ActionObject("input", "Answer", layer, "answer", control="text", prompt="Answer")]
        page = html(["<button gc=", ">Expand</button><button gc=", ">Reference</button><button gc=", ">Run</button><textarea gc=", ' aria-label="Answer"></textarea>'],
                    *(action_capability(a.client_key, a) for a in actions))
        original.detail_authoring.set_component("main", page)
        expected = original.detail_authoring.to_wire(original)
        original.detail_authoring.clear()
        repair.detail_authoring.set_component("main", page)
        calls = []
        async def host_request(method, payload):
            calls.append(payload["operation"])
            self.assertEqual(payload["detail"], expected)
            return {"ok": True, "frozen": payload["operation"] == "submit", "value": {"id": 2, "kind": "concept", "icon": "info", "title": "answer", "detail": "Fallback", "state": "draft"}}
        with patch.dict(sys.modules, {"rlm": types.SimpleNamespace(host_request=host_request)}):
            await graph.checkpoint_node_detail(repair)
            await graph.submit_node(repair)
        self.assertEqual(calls, ["checkpoint", "submit"])
        second_repair = graph.bind_node(node("answer"))
        second_repair.detail_authoring.set_component("main", page)
        self.assertEqual(second_repair.detail_authoring.to_wire(second_repair), expected)

    def test_repair_provenance_is_per_template_and_requires_exact_unchanged_original(self):
        graph = GraphSession("http://localhost", "token", 1)
        original, repair, stranger = [graph.bind_node(node("answer")) for _ in range(3)]
        layer = LayerObject([original], [], LayerLayoutObject([]), client_key="source")
        capability = action_capability("run", ActionObject("invoke", "Run", layer, "run", interaction_text="Run"))
        page = html(["<button gc=", ">Run</button>"], capability)
        original.detail_authoring.set_component("main", page)
        repair.detail_authoring.set_component("main", page)
        repair.detail_authoring.set_component("fresh", html(["<button gc=", ">Run</button>"], capability))
        with self.assertRaisesRegex(ValueError, "exact owning"):
            repair.detail_authoring.to_wire(repair)
        repair.detail_authoring.clear()
        repair.detail_authoring.set_component("main", page)
        layer.nodes[:] = [stranger]
        with self.assertRaisesRegex(ValueError, "exact owning"):
            repair.detail_authoring.to_wire(repair)
        layer.nodes[:] = [original]
        original.client_key = "retargeted"
        with self.assertRaisesRegex(ValueError, "identity_changed"):
            repair.detail_authoring.to_wire(repair)

    def test_collected_original_never_disables_action_membership(self):
        graph = GraphSession("http://localhost", "token", 1)
        original, repair = graph.bind_node(node("answer")), graph.bind_node(node("answer"))
        layer = LayerObject([original], [], LayerLayoutObject([]), client_key="source")
        page = html(["<button gc=", ">Run</button>"], action_capability("run", ActionObject("invoke", "Run", layer, "run", interaction_text="Run")))
        plain = html("<p>Answer</p>")
        original.detail_authoring.set_component("main", page)
        original.detail_authoring.set_component("plain", plain)
        repair.detail_authoring.set_component("main", page)
        repair.detail_authoring.set_component("plain", plain)
        reference = weakref.ref(original)
        del original
        gc.collect()
        self.assertIsNotNone(reference())  # The action still has exact provenance.
        repair.detail_authoring.to_wire(repair)
        layer.nodes.clear()
        gc.collect()
        self.assertIsNone(reference())
        with self.assertRaisesRegex(ValueError, "exact owning"):
            repair.detail_authoring.to_wire(repair)
        repair.detail_authoring.clear()
        repair.detail_authoring.set_component("plain", plain)
        self.assertEqual(repair.detail_authoring.to_wire(repair)["components"][0]["markup"]["strings"], ["<p>Answer</p>"])

    async def test_bound_repair_and_scope_fences_before_transport(self):
        graph = GraphSession("http://localhost:1234", "token", 1)
        original, repair = node("answer"), node("answer")
        page = html("<p>Answer</p>")
        original.detail_authoring.set_component("main", page)
        with self.assertRaisesRegex(ValueError, "bind_node"):
            repair.detail_authoring.set_component("main", page)
        graph.bind_node(original)
        GraphSession("http://localhost:1234/", "rotated", 1).bind_node(repair)
        repair.detail_authoring.set_component("main", page)
        self.assertEqual(original.detail_authoring.to_wire(original), repair.detail_authoring.to_wire(repair))
        for foreign in [GraphSession("http://localhost:1234", "token", 2), GraphSession("http://localhost:5678", "token", 1)]:
            stranger = foreign.bind_node(node("answer"))
            with self.assertRaisesRegex(ValueError, "owner_mismatch"):
                stranger.detail_authoring.set_component("main", page)
            with self.assertRaisesRegex(ValueError, "scope_mismatch"):
                await foreign.submit_node(original)
            with self.assertRaisesRegex(ValueError, "scope_mismatch"):
                await foreign.checkpoint_node_detail(original)
        repair.detail_authoring = original.detail_authoring
        with self.assertRaisesRegex(ValueError, "node_envelope_invalid"):
            graph.bind_node(repair)
        original.client_key = "retargeted"
        with self.assertRaisesRegex(ValueError, "identity_changed"):
            graph.bind_node(original)

    def test_fresh_helpers_and_shared_styles(self):
        def fresh():
            return html("<p>Fresh markup</p>")
        styles = "p { color: blue; }"
        asset = asset_ref("shared-asset")
        for owner in [node("a"), node("b")]:
            owner.detail_authoring.set_component("main", fresh(), styles)
            self.assertEqual(owner.detail_authoring.to_wire(owner)["components"][0]["styles"], styles)
            owner.detail_authoring.set_component("image", html(["<img asset=", ' alt="Shared illustration">'], asset))
            self.assertEqual(owner.detail_authoring.to_wire(owner)["components"][1]["markup"]["values"][0]["logicalId"], "shared-asset")

    def test_private_state_and_serialization_cannot_transfer_templates(self):
        a, b = node("a"), node("b")
        page = html("<p>Owned</p>")
        a.detail_authoring.set_component("main", page)
        b.detail_authoring._components["main"] = (page, "")
        with self.assertRaisesRegex(ValueError, "owner_mismatch"):
            b.detail_authoring.to_wire(b)
        graph = GraphSession("http://localhost", "token", 1)
        graph.bind_node(a)
        self.assertIsNone(a.detail_authoring._validate_owner(a))
        self.assertIsNone(a.detail_authoring._check_template(page, attachment=False))
        a.detail_authoring._identity = types.SimpleNamespace(scope=None, client_key="b")
        with self.assertRaisesRegex(ValueError, "scope_mismatch"):
            GraphSession("http://localhost", "token", 2).bind_node(a)

    async def test_cached_submission_cannot_bypass_scope(self):
        owner = node("cached")
        owner.detail_authoring.set_component("main", html("<p>Cached</p>"))
        calls = []
        async def host_request(method, payload):
            calls.append(payload)
            return {"ok": True, "frozen": True, "value": {"id": 2, "kind": "concept", "icon": "info", "title": "cached", "detail": "Fallback", "state": "draft"}}
        with patch.dict(sys.modules, {"rlm": types.SimpleNamespace(host_request=host_request)}):
            graph = GraphSession("http://localhost", "token", 1)
            await graph.submit_node(owner)
            await graph.submit_node(owner)
            graph.node_id = 2
            with self.assertRaisesRegex(ValueError, "scope_mismatch"):
                await graph.submit_node(owner)
            with self.assertRaisesRegex(ValueError, "scope_mismatch"):
                await graph.checkpoint_node_detail(owner)
        self.assertEqual(len(calls), 1)
