"""Typed registered image icons; contain and no framing are the defaults."""
from typing import Literal, TypedDict

class _ImageIconIdentity(TypedDict):
    kind: Literal["image"]
    assetId: str

class ImageIcon(_ImageIconIdentity, total=False):
    fit: Literal["contain", "cover"]
    framing: Literal["none", "circle", "rounded"]
    digestSha256: str
    mediaType: str

GraphIcon = str | ImageIcon

def image_icon(asset_id: str, *, fit: Literal["contain", "cover"] = "contain", framing: Literal["none", "circle", "rounded"] = "none") -> ImageIcon:
    if not isinstance(asset_id, str) or not asset_id.strip() or fit not in ("contain", "cover") or framing not in ("none", "circle", "rounded"):
        raise ValueError("Use a registered image asset and valid fit/framing")
    return {"kind": "image", "assetId": asset_id, "fit": fit, "framing": framing}

def image_icon_detail(icon: ImageIcon):
    """Static Details recipe: pass markup and styles to set_component."""
    from .detail import html, asset_ref
    reference = image_icon(icon["assetId"], fit=icon.get("fit", "contain"), framing=icon.get("framing", "none"))
    radius = {"none": "0", "circle": "50%", "rounded": "25%"}[reference["framing"]]
    return {"html": html(("<img asset=", ' alt="">'), asset_ref(reference["assetId"])),
            "css": "img { width: 100%; height: 100%; object-fit: " + reference["fit"] + "; border-radius: " + radius + "; }"}

async def symbol_icon_detail(graph, name: str):
    """Register a pinned Lucide preview and return an ordinary static asset component."""
    scope = await graph.visual_assets.scope()
    inspected = await graph.icons.inspect([name], scope=scope)
    file = inspected["previews"][0]
    if file.media_type != "image/svg+xml":
        raise ValueError("Pinned symbol preview unavailable")
    from .visual_assets import VisualAssetFile
    static_file = VisualAssetFile(file.name, file.media_type, file.read().replace(b"currentColor", b"#767676"))
    asset = await graph.visual_assets.add(file=static_file, scope=scope, name=f"Lucide {name}",
                                         description=f"Pinned Lucide symbol {name}.")
    return image_icon_detail(image_icon(asset["id"]))
