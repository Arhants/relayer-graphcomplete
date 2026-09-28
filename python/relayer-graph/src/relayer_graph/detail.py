"""Declarative templates for Prime's canonical TypeScript detail compiler."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence
from uuid import uuid4
from weakref import WeakKeyDictionary, ref


@dataclass(frozen=True, slots=True)
class DetailBinding:
    kind: str
    value: Any
    key: str = ""

    def to_wire(self, owner: Any, *, _repair_source: Any = None) -> dict[str, Any]:
        if self.kind == "asset":
            return {"kind": "asset", "logicalId": self.value}
        if self.kind == "link":
            return {"kind": "link", "key": self.key, "href": self.value}
        return {"kind": "action", "key": self.key, "action": self.value.to_detail_wire(owner, _repair_source=_repair_source)}


def asset_ref(logical_id: str) -> DetailBinding:
    return DetailBinding("asset", logical_id)


def external_link(key: str, href: str) -> DetailBinding:
    return DetailBinding("link", href, key)


def action_capability(key: str, action: Any) -> DetailBinding:
    return DetailBinding("action", action, key)


@dataclass(frozen=True, eq=False)
class DetailTemplate:
    strings: tuple[str, ...]
    values: tuple[DetailBinding, ...]

    def __copy__(self) -> "DetailTemplate":
        return self

    def __deepcopy__(self, memo: Any) -> "DetailTemplate":
        return self

    def to_wire(self, owner: Any, *, _repair_source: Any = None) -> dict[str, Any]:
        return {"strings": list(self.strings), "values": [value.to_wire(owner, _repair_source=_repair_source) for value in self.values]}


def html(strings: str | Sequence[str], *values: DetailBinding) -> DetailTemplate:
    """Use html(['<a gc=', '>Read</a>'], external_link('read', url))."""
    parts = (strings,) if isinstance(strings, str) else tuple(strings)
    if len(parts) != len(values) + 1 or any(not isinstance(part, str) for part in parts):
        raise ValueError("html needs one more literal string than bindings")
    if any(not isinstance(value, DetailBinding) for value in values):
        raise TypeError("html bindings must be declarative capabilities or asset references")
    result = DetailTemplate(parts, tuple(values))
    _templates[result] = None
    return result


@dataclass
class _Owner:
    client_key: str
    node: Any
    scope: tuple[str, int] | None = None


_templates: WeakKeyDictionary[DetailTemplate, _Owner | None] = WeakKeyDictionary()
_authority = object()
_authoring: WeakKeyDictionary = WeakKeyDictionary()


class NodeDetailAuthoring:
    def __init__(self, owner: Any = None, authority: Any = None) -> None:
        if authority is not _authority:
            raise TypeError("Use node.detail_authoring; components require an owning node")
        _authoring[self] = (ref(owner), _Owner(owner.client_key, ref(owner)), {})
        self._components: dict[str, tuple[DetailTemplate, str]] = {}
        self._cleared = False
        self._frozen = False
        self._finalizing = False
        self._object_id = str(uuid4())

    def _validate_owner(self, owner: Any) -> None:
        registered = _authoring.get(self)
        if owner is None or registered is None or registered[0]() is not owner:
            raise ValueError("node_envelope_invalid: detail authoring belongs to another node")
        identity = registered[1]
        if owner.client_key != identity.client_key:
            raise ValueError("detail_owner_identity_changed: create a fresh NodeObject for a different client key")

    def _bind(self, owner: Any, url: str, node_id: int) -> None:
        self._validate_owner(owner)
        identity = _authoring[self][1]
        scope = (url.rstrip("/"), node_id)
        if identity.scope is not None and identity.scope != scope:
            raise ValueError(f"detail_owner_scope_mismatch: node {identity.client_key!r} belongs to {identity.scope!r}, not {scope!r}; create a fresh node and html(...) for another interaction")
        identity.scope = scope

    def _check_template(self, markup: DetailTemplate, *, attachment: bool) -> None:
        registered = _authoring.get(self)
        self._validate_owner(None if registered is None else registered[0]())
        attempted = _authoring[self][1]
        if type(markup) is not DetailTemplate or markup not in _templates:
            raise ValueError("detail_template_unrecognized: use html(...) to create fresh node-specific markup")
        original = _templates[markup]
        if original is None:
            if not attachment:
                raise ValueError("detail_template_unrecognized: attach HTML with set_component before serialization")
        elif original is not attempted and not (
                original.scope is not None and original.scope == attempted.scope
                and original.client_key == attempted.client_key):
            raise ValueError(f"detail_template_owner_mismatch: HTML belongs to node {original.client_key!r} ({original.scope!r}), not {attempted.client_key!r} ({attempted.scope!r}). Create fresh html(...) for this node; share CSS, assets, or helpers. For same-node repair, graph.bind_node both objects first.")

    def set_component(self, key: str, markup: DetailTemplate, styles: str = "") -> "NodeDetailAuthoring":
        if self._finalizing:
            raise ValueError("detail_finalization_in_progress")
        if self._frozen:
            raise ValueError("detail_finalized: create a fresh NodeObject to replace a draft")
        if type(key) is not str:
            raise TypeError("Component key must be a string")
        self._check_template(markup, attachment=True)
        identity = _authoring[self][1]
        if _templates[markup] is None:
            _templates[markup] = identity
        _authoring[self][2].setdefault(key, str(uuid4()))
        self._components[key] = (markup, styles)
        self._cleared = False
        return self

    def clear(self) -> "NodeDetailAuthoring":
        if self._finalizing:
            raise ValueError("detail_finalization_in_progress")
        if self._frozen:
            raise ValueError("detail_finalized: create a fresh NodeObject to replace a draft")
        self._components.clear()
        _authoring[self][2].clear()
        self._cleared = True
        return self

    def to_wire(self, owner: Any) -> dict[str, Any]:
        self._validate_owner(owner)
        for markup, _ in self._components.values():
            self._check_template(markup, attachment=False)
        components = []
        for key, (markup, styles) in self._components.items():
            original = _templates[markup]
            # _check_template authenticated the scope/key match. Preserve only this
            # template's first owner's exact provenance; never grant a key-wide alias.
            repair_source = None if original is None else original.node()
            if repair_source is None and any(binding.kind not in ("asset", "link") for binding in markup.values):
                raise ValueError("The source layer must contain the exact owning NodeObject; original template owner is unavailable")
            if repair_source is not None and repair_source.client_key != original.client_key:
                raise ValueError("detail_owner_identity_changed: the original template owner changed identity; create fresh node-specific HTML")
            components.append({"id": key, "markup": markup.to_wire(owner, _repair_source=repair_source), "styles": styles})
        return {"clear": self._cleared, "components": components}


def _create_owned_authoring(owner: Any) -> NodeDetailAuthoring:
    return NodeDetailAuthoring(owner, _authority)
