"""Authenticated visual asset operations; bytes are read in the caller's context."""
from __future__ import annotations
import base64
import hashlib
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class VisualAssetFile:
    name: str
    media_type: str
    content: bytes
    expected_digest: str | None = None

    def read(self) -> bytes:
        return bytes(self.content)


class GraphVisualAssets:
    def __init__(self, client: Any) -> None:
        self._client = client

    async def scope(self) -> Mapping[str, Any]:
        return (await self._client._request("GET", "/api/graph/visual-assets/scope"))["scope"]

    async def _operation(self, kind: str, **fields: Any) -> Any:
        return await self._client._request("POST", "/api/graph/visual-assets/operations", {
            "operation": {"kind": kind, **fields},
        })

    async def add(self, *, file: VisualAssetFile, scope: Mapping[str, Any], name: str,
                  tag_ids: tuple[str, ...] = (), description: str | None = None, registry_id: str | None = None) -> Mapping[str, Any]:
        content = file.read()
        if not 0 < len(content) <= 8 * 1024 * 1024:
            raise ValueError("Visual assets must contain at most 8 MiB")
        fields: dict[str, Any] = {"scope": dict(scope), "name": name, "tagIds": list(tag_ids),
            "file": {"name": file.name, "mediaType": file.media_type,
                     "contentBase64": base64.b64encode(content).decode("ascii")}}
        if file.expected_digest is not None:
            fields["file"]["expectedDigest"] = file.expected_digest
        if description is not None:
            fields["description"] = description
        if registry_id is not None:
            fields["registryId"] = registry_id
        return await self._operation("add", **fields)

    async def list_assets(self, *, scope: Mapping[str, Any], **page: Any) -> Any:
        return await self._operation("list-assets", scope=scope, **page)

    async def list_tags(self, *, scope: Mapping[str, Any], parent_tag_id: str | None = None, **page: Any) -> Any:
        return await self._operation("list-tags", scope=scope, parentTagId=parent_tag_id, **page)

    async def list_registries(self, *, scope: Mapping[str, Any], **page: Any) -> Any:
        return await self._operation("list-registries", scope=scope, **page)

    async def find(self, *, scope: Mapping[str, Any], tag_id: str, **page: Any) -> Any:
        return await self._operation("find", scope=scope, tagId=tag_id, **page)

    async def inspect(self, asset_id: str, scope: Mapping[str, Any]) -> Any:
        result = await self._operation("inspect", assetId=asset_id, scope=scope)
        return {"asset": result["asset"], "preview": _decode_file(result["preview"])}

    async def download(self, asset_id: str, scope: Mapping[str, Any]) -> VisualAssetFile:
        return _decode_file(await self._operation("download", assetId=asset_id, scope=scope))

    async def create_tag(self, *, scope: Mapping[str, Any], name: str, parent_tag_id: str | None = None) -> Any:
        return await self._operation("create-tag", scope=scope, name=name, **({} if parent_tag_id is None else {"parentTagId": parent_tag_id}))

    async def move_tag(self, *, scope: Mapping[str, Any], tag_id: str, parent_tag_id: str | None) -> Any:
        return await self._operation("move-tag", scope=scope, tagId=tag_id, parentTagId=parent_tag_id)

    async def associate(self, *, scope: Mapping[str, Any], asset_id: str) -> Any:
        return await self._operation("associate", scope=scope, assetId=asset_id)

    async def organize(self, *, scope: Mapping[str, Any], asset_id: str, add_tag_ids: tuple[str, ...] = (), remove_tag_ids: tuple[str, ...] = ()) -> Any:
        return await self._operation("organize", scope=scope, assetId=asset_id, addTagIds=add_tag_ids, removeTagIds=remove_tag_ids)

    async def archive(self, asset_id: str, scope: Mapping[str, Any]) -> Any:
        return await self._operation("archive", assetId=asset_id, scope=scope)


def _decode_file(value: Any) -> VisualAssetFile:
    if not isinstance(value, Mapping) or not isinstance(value.get("name"), str) or not isinstance(value.get("mediaType"), str) or not isinstance(value.get("contentBase64"), str) or len(value["contentBase64"]) > 4 * ((8 * 1024 * 1024 + 2) // 3):
        raise ValueError("Invalid visual asset file")
    content = base64.b64decode(value["contentBase64"], validate=True)
    digest = value.get("expectedDigest")
    if not 0 < len(content) <= 8 * 1024 * 1024 or base64.b64encode(content).decode("ascii") != value["contentBase64"] or (digest is not None and digest != "sha256:" + hashlib.sha256(content).hexdigest()):
        raise ValueError("Corrupt visual asset bytes")
    return VisualAssetFile(value["name"], value["mediaType"], content, digest)
