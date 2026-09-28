# Conversation export V2 contract

V2 extends the [V1 contract](conversation-export-v1.md) with portable visual-asset content.
All V1 graph semantics, authority exclusions, validation rules, and bounds still apply.
The header declares `exportVersion: 2`. The stream contains one header, zero or more
`visualAssetContent` records, then the ordered turn records. Content records cannot follow a turn.
V1 remains header-and-turn only; V1 readers must reject this version. Current readers accept
both versions. The exporter uses V1 when no content records are needed and V2 otherwise.

Each content record contains `digestSha256`, `mediaType`, `byteLength`, and `contentBase64`.
Content is globally unique by SHA-256 digest, nonempty, and at most 8 MiB decoded. The existing
16 MiB line and 256 MiB archive bounds remain in force. Media type, decoded length, and digest
must agree. Supported media are PNG, JPEG, and SVG; runtime media validation still applies.

Accepted nodes carry `authoredDetailAssets` metadata associations. Each association preserves
its asset ID, digest, media type, length, and inert user/system filename provenance. Associations
must match the compiled package pins and a content record. Every content record must be referenced.
Shared digests store bytes once without merging distinct logical assets or their provenance.

Incremental upload validation retains content metadata only. Product import staging owns the
bytes, and graph publication validates and materializes them before accepting the imported graph.
The format grants no execution or asset-library authority. Public sharing uses V1 for an
asset-free accepted snapshot and V2 when an accepted authored Node Detail references visual
content. Both share forms retain the separate 16 MiB total snapshot limit.
