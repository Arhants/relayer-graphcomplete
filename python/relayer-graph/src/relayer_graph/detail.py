"""Declarative templates for Prime's canonical TypeScript detail compiler."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence
from uuid import uuid4


@dataclass(frozen=True, slots=True)
class DetailBinding:
    kind: str
    value: Any
    key: str = ""

    def to_wire(self, owner: Any) -> dict[str, Any]:
        if self.kind == "asset":
            return {"kind": "asset", "logicalId": self.value}
        if self.kind == "link":
            return {"kind": "link", "key": self.key, "href": self.value}
        return {"kind": "action", "key": self.key, "action": self.value.to_detail_wire(owner)}


def asset_ref(logical_id: str) -> DetailBinding:
    return DetailBinding("asset", logical_id)


def external_link(key: str, href: str) -> DetailBinding:
    return DetailBinding("link", href, key)


def action_capability(key: str, action: Any) -> DetailBinding:
    return DetailBinding("action", action, key)


@dataclass(frozen=True, slots=True)
class DetailTemplate:
    strings: tuple[str, ...]
    values: tuple[DetailBinding, ...]

    def to_wire(self, owner: Any) -> dict[str, Any]:
        return {"strings": list(self.strings), "values": [value.to_wire(owner) for value in self.values]}


def html(strings: str | Sequence[str], *values: DetailBinding) -> DetailTemplate:
    """Use html(['<a gc=', '>Read</a>'], external_link('read', url))."""
    parts = (strings,) if isinstance(strings, str) else tuple(strings)
    if len(parts) != len(values) + 1 or any(not isinstance(part, str) for part in parts):
        raise ValueError("html needs one more literal string than bindings")
    if any(not isinstance(value, DetailBinding) for value in values):
        raise TypeError("html bindings must be declarative capabilities or asset references")
    return DetailTemplate(parts, tuple(values))


@dataclass(slots=True)
class NodeDetailAuthoring:
    _components: dict[str, tuple[DetailTemplate, str]] = field(default_factory=dict)
    _cleared: bool = False
    _frozen: bool = False
    _finalizing: bool = False
    _object_id: str = field(default_factory=lambda: str(uuid4()))

    def set_component(self, key: str, markup: DetailTemplate, styles: str = "") -> "NodeDetailAuthoring":
        if self._finalizing:
            raise ValueError("detail_finalization_in_progress")
        if self._frozen:
            raise ValueError("detail_finalized: create a fresh NodeObject to replace a draft")
        self._components[key] = (markup, styles)
        self._cleared = False
        return self

    def clear(self) -> "NodeDetailAuthoring":
        if self._finalizing:
            raise ValueError("detail_finalization_in_progress")
        if self._frozen:
            raise ValueError("detail_finalized: create a fresh NodeObject to replace a draft")
        self._components.clear()
        self._cleared = True
        return self

    def to_wire(self, owner: Any) -> dict[str, Any]:
        return {"clear": self._cleared, "components": [
            {"id": key, "markup": markup.to_wire(owner), "styles": styles}
            for key, (markup, styles) in self._components.items()
        ]}
