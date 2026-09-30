"""How a layer draws all its edges. "default" leaves the shape to the design.

Keep this list aligned with ``relayer-graph-core``, ``@relayer/graph-client`` and the renderer.
"""
from __future__ import annotations

from typing import Literal, get_args

EdgeShape = Literal[
    "default",
    "straight",
    "arc-outward",
    "arc-circle",
    "elbow-horizontal",
    "elbow-vertical",
]

EDGE_SHAPES: tuple[str, ...] = get_args(EdgeShape)
