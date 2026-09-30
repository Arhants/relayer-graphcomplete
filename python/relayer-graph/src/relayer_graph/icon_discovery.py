"""Typed catalog discovery, separate from accepted conversation search records."""
from __future__ import annotations
from typing import Any, Literal, Mapping, Sequence, TypedDict
from .visual_assets import _decode_file

class IconDiscoveryItem(TypedDict):
    id: str
    kind: Literal["symbol", "image"]
    name: str
    description: str
    aliases: list[str]
    categories: list[str]
    tags: list[str]
    useCases: list[str]
    icon: str | Mapping[str, Any]

class GraphIcons:
    def __init__(self, client: Any) -> None:
        self._client = client

    async def discover(self, query: str, *, kind: Literal["symbols", "images", "both"] = "both",
                       limit: int = 12, scope: Mapping[str, Any] | None = None) -> Mapping[str, Any]:
        return await self._client._request("POST", "/api/graph/icons/discover", {
            "query": query, "kind": kind, "limit": limit,
            **({} if scope is None else {"scope": dict(scope)}),
        })

    async def inspect(self, icons: Sequence[str | Mapping[str, Any]], *,
                      scope: Mapping[str, Any] | None = None, contact_sheet: bool = False) -> Mapping[str, Any]:
        result = await self._client._request("POST", "/api/graph/icons/inspect", {
            "icons": list(icons), "contactSheet": contact_sheet,
            **({} if scope is None else {"scope": dict(scope)}),
        })
        return {"previews": [_decode_file(item) for item in result["previews"]],
                "contactSheet": None if result["contactSheet"] is None else _decode_file(result["contactSheet"])}
