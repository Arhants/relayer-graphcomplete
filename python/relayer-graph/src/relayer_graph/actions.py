"""Shared action declarations for visual mounts and ordinary graph writes."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from .authoring import LayerObject, LayerReference, NodeObject


def _layer_declaration(layer: LayerReference, owner: NodeObject | None = None, *, _repair_source: NodeObject | None = None) -> Any:
    if not isinstance(layer, LayerObject):
        if owner is not None:
            raise ValueError("A visual action needs its exact authored source LayerObject")
        return layer if isinstance(layer, int) else layer.id
    if owner is not None and not any(node is owner or (_repair_source is not None and node is _repair_source) for node in layer.nodes):
        raise ValueError("The source layer must contain the exact owning NodeObject")
    return {"clientKey": layer.client_key, "nodes": [
        node.client_key for node in layer.nodes if isinstance(node, NodeObject)
    ]}


@dataclass(frozen=True, slots=True)
class ActionObject:
    kind: str
    label: str
    source_layer: LayerObject
    client_key: str
    target: LayerReference | None = None
    relation: str | None = None
    interaction_text: str | None = None
    control: str | None = None
    prompt: str | None = None
    options: tuple[tuple[str, str], ...] = ()
    minimum_selections: int | None = None
    variant: str = "pill"
    icon: str | None = None
    description: str | None = None

    def to_detail_wire(self, owner: NodeObject, *, _repair_source: NodeObject | None = None) -> dict[str, Any]:
        value: dict[str, Any] = {
            "kind": self.kind, "label": self.label, "clientKey": self.client_key,
            "sourceLayer": _layer_declaration(self.source_layer, owner, _repair_source=_repair_source), "variant": self.variant,
        }
        if self.icon is not None:
            value["icon"] = self.icon
        if self.description is not None:
            value["description"] = self.description
        if self.kind == "navigate":
            if self.target is None:
                raise ValueError("Navigate needs a target layer")
            value.update(relation=self.relation, target=_layer_declaration(self.target))
        elif self.kind == "invoke":
            value["interactionText"] = self.interaction_text
        elif self.kind == "input":
            value.update(control=self.control, prompt=self.prompt)
            if self.control != "text":
                value["options"] = [{"key": key, "label": label} for key, label in self.options]
            if self.minimum_selections is not None:
                value["minimumSelections"] = self.minimum_selections
        else:
            raise ValueError("Unknown graph action kind")
        return value
