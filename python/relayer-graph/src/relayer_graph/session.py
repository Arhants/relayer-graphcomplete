"""Prime Agent entry point for the graph scope of the current run."""
from __future__ import annotations

import asyncio
from typing import Any, Mapping

from .authoring import GraphNode, NodeObject, RelayerGraphClient
from .exceptions import ConfigurationError, ValidationError


class GraphSession(RelayerGraphClient):
    """A graph client bound to the current ``complete()`` execution."""

    def __init__(self, url: str, token: str, node_id: int, *, timeout: float = 30.0) -> None:
        super().__init__(url, token, node_id, timeout=timeout)
        self._visual_submissions: dict[str, asyncio.Task[GraphNode]] = {}

    @classmethod
    async def current(cls, *, timeout: float = 30.0) -> "GraphSession":
        """Acquire the graph scope attached to the active Prime Agent run."""
        try:
            from rlm import host_request
        except ImportError as error:
            raise ConfigurationError(
                "GraphSession.current() is only available inside a Prime Agent IPython run"
            ) from error

        value: Any = await host_request("relayer.graph.current")
        if not isinstance(value, Mapping):
            raise ConfigurationError("relayer.graph.current returned an invalid graph scope")
        url = value.get("url")
        token = value.get("token")
        node_id = value.get("nodeId")
        if (
            not isinstance(url, str)
            or not url
            or not isinstance(token, str)
            or not token
            or isinstance(node_id, bool)
            or not isinstance(node_id, int)
            or node_id < 1
        ):
            raise ConfigurationError("relayer.graph.current returned an invalid graph scope")
        return cls(url, token, node_id, timeout=timeout)

    def _visual_payload(self, operation: str, node: NodeObject) -> Any:
        self.bind_node(node)
        # Serialize now: nested Python mutations cannot change an in-flight program.
        import json
        payload = json.loads(json.dumps({
            "version": 1, "objectId": node.detail_authoring._object_id, "token": self.token, "nodeId": self.node_id,
            "operation": operation,
            "node": {"clientKey": node.client_key, "icon": node.icon,
                     "title": node.title, "detail": node.detail, "kind": node.kind},
            "detail": node.detail_authoring.to_wire(node),
        }))
        return payload

    async def _visual_authoring(self, operation: str, node: NodeObject, payload: Any = None) -> Any:
        from rlm import host_request
        if payload is None:
            payload = self._visual_payload(operation, node)
        result = await host_request("relayer.graph.visual-authoring", payload)
        if result.get("frozen") is True:
            node.detail_authoring._frozen = True
        if result.get("ok") is not True:
            # Include compiler locations in the displayed exception as well as retaining
            # the exact structured response for programmatic repair.
            import json
            message = result.get("message", "Visual authoring failed")
            if result.get("issues"):
                message += "\n" + json.dumps(result["issues"], ensure_ascii=False)
            raise ValidationError(message, status=422, details=result)
        return result["value"]

    async def checkpoint_node_detail(self, node: NodeObject) -> Any:
        self.bind_node(node)
        return await self._visual_authoring("checkpoint", node)

    async def submit_node(self, node: NodeObject) -> GraphNode:
        self.bind_node(node)
        key = node.detail_authoring._object_id
        existing = self._visual_submissions.get(key)
        if existing is not None:
            return await asyncio.shield(existing)
        if node.detail_authoring._finalizing:
            raise ValueError("detail_finalization_in_progress")
        payload = self._visual_payload("submit", node)
        node.detail_authoring._finalizing = True

        async def submit() -> GraphNode:
            try:
                value = await self._visual_authoring("submit", node, payload)
                node.ref = GraphNode.from_dict(value)
                return node.ref
            except BaseException as error:
                # A lost host response may follow successful compilation. Keep
                # the local builder fixed until the same request is retried.
                if not isinstance(error, ValidationError):
                    node.detail_authoring._frozen = True
                self._visual_submissions.pop(key, None)
                raise
            finally:
                node.detail_authoring._finalizing = False

        task = asyncio.create_task(submit())
        task.add_done_callback(lambda done: None if done.cancelled() else done.exception())
        self._visual_submissions[key] = task
        return await asyncio.shield(task)

    def __getstate__(self) -> None:
        raise TypeError("GraphSession is run-scoped and cannot be serialized")

    def __reduce__(self) -> None:
        raise TypeError("GraphSession is run-scoped and cannot be serialized")
