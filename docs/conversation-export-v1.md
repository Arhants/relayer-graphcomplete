# Conversation export V1 contract

Relayer conversation export V1 is an authority-free JSONL representation of one durable
conversation. It is a product-state interchange format, not a SQLite backup, graph capability,
execution trace, or conversation-resume format.

The Rust source of truth is `relayer_app_server::conversation_export`.

## Stream organization

The first line is exactly one `header` record. Every remaining line is one `turn` record in the
same order as the header's complete turn manifest. No other V1 record types exist.

```jsonl
{"recordType":"header","exportVersion":1,"exportedAt":"1770000000000","producer":{"desktopVersion":"0.2.12","buildCommit":"1685e68","platform":"darwin","architecture":"arm64"},"conversation":{"id":"conversation:1","title":"Debug bad response","createdAt":"1769000000000","projectName":"assignment1-basics","harnessConfigurationName":"codex-basic","permissionProfileId":"auto"},"turns":[{"id":"turn:1","sequence":1}]}
{"recordType":"turn","id":"turn:1","sequence":1,"createdAt":"1769000001000","text":"Review this tokenizer","origin":{"kind":"user"},"completion":{"status":"failed","permissionProfileId":"auto","error":"Provider stopped"},"acceptedView":null}
```

`exportVersion` is the compatibility version for this contract. `producer.desktopVersion` is only
provenance. Adding an optional field without changing existing meaning may remain V1. Removing or
renaming a field, changing a field's meaning, or changing required structure requires a new export
version. Timestamps preserve the durable producer representation; V1 does not reinterpret them.

The producer may add optional fields. Readers must reject unknown `recordType` values but may ignore
unknown fields so compatible V1 additions remain possible.

## Header

The header contains producer provenance, export-local conversation metadata, and the exact ordered
turn inventory. Turn sequences are contiguous positive integers beginning at one. The project
display name is optional; a local project path is never part of this contract.

## Turn

A turn contains its export-local identity, durable sequence and timestamp, user-facing interaction
text, origin, and completion receipt. `completion.status` is exactly one of the current product
states: `not_started`, `running`, `submitted`, `waiting_for_approval`, `accepted`, `failed`, or
`stopped`. Approval requests and resolutions remain outside the V1 header-and-turn scope; these
statuses preserve the durable turn state without making imported approvals actionable.

An ordinary turn has `origin: {"kind":"user"}`. An action-created turn identifies an exact earlier
turn and an `invoke` action within that turn:

```json
{"kind":"action","sourceTurnId":"turn:1","sourceActionId":"action:4"}
```

Only an `accepted` turn has a non-null `acceptedView`. Every other status has
`acceptedView: null`; the exporter never converts a model turn ending into graph completion.

## Accepted view

An accepted view contains:

- the canonical interaction node's export-local ID;
- its one accepted root `expand` action, with no source layer;
- the root layer ID; and
- every accepted resolved layer reachable from the root through `expand` and `reference`, exactly
  once, with visited-layer tracking so shared destinations and reference cycles remain intact.

Each resolved layer preserves ordered node, edge, and action snapshot membership. All exported graph
records have state `accepted`. Layer membership, edge endpoints, action shape, navigation targets,
mixed target relations, expansion acyclicity, and complete root reachability are validated without
model inference.

An authored layer includes its versioned normalized `layout` with exactly one finite `x`/`y`
placement for every member node. The placement uses portable node IDs. The field is optional only
for coordinate-free accepted history created before authored layouts existed; importing such a
legacy file preserves the missing layout and uses the deterministic compatibility renderer.

Non-root actions retain their original `sourceLayerId`. A reused accepted node may expose an action
authored in an earlier layer that is not otherwise reachable from the current turn; in that case the
ID is provenance, not a promise that the source layer is embedded. Navigate `targetLayerId` values,
layer membership IDs, turn origins, and every other operational reference must resolve inside the
exported contract.

Portable IDs use `<kind>:<local-id>` (`conversation`, `turn`, `node`, `edge`, `layer`, or `action`).
They are deterministic mappings chosen by the exporter, stable only within one file, and confer no
read or write authority. A canonical exporter assigns them in durable turn order and stable graph
traversal/member order; raw SQLite IDs and graph capability tokens are never serialized.

## Public-share binding aliases

A shared V1/V2/V3 snapshot may use each export-local node, layer, and action ID as its
`clientKey` alias. These aliases are generated identities, not the original
harness-authored strings. Compiled action references use the same aliases in
`clientKey`, `sourceNode.clientKey`, and `sourceLayer.clientKey`; package integrity
covers the derived references. Ordinary conversation export retains its existing
keys and original package.

For an absent provenance layer, a public action whose `clientKey` equals its `id`
uses its `sourceLayerId` as its source-layer alias. Explicit layer keys take
precedence so older valid snapshots remain readable. Provenance still grants no
execution or mutation authority. The source node and action must match exactly.

## Bounds and exclusions

The Rust module publishes the V1 limits used by exporters and importers: 256 MiB per file, 16 MiB per
JSONL line, 10,000 turns, 10,000 layers per turn, 8 nodes, 28 edges, and 64 actions per layer,
4 MiB per string, and 64 KiB per normalized permission receipt.

V1 excludes artifacts, trace events, drafts, stopped graph records, credentials, graph capabilities,
hidden reasoning, private layer-size rationale, runtime session state, environment variables, and
local project paths. Importers treat every field as inert data and never execute an imported action.

Visual-asset content records require [conversation export V2](conversation-export-v2.md).
They are not an optional V1 field or a V1 record type. Current readers retain V1 support.


## V3 current accepted snapshots

V3 extends the V2 asset stream with current node-owned attached edits. All accepted roots
are read in one graph transaction. Nodes contain current accepted details, compiled packages,
actions and pinned assets, not historical HTML. Asset metadata and bytes must match pins;
a missing asset is an error. Existing local and public byte limits remain unchanged.

A converted invoke is an accepted navigate/expand action with a target and
`convertedFromInvoke: true`; it carries neither interaction text nor input. This marker is
for inert presentation only, never an execution receipt or grant. Root actions cannot carry
it. If its originating result turn is included, that turn must identify the exact source
action and accepted target root. A converted link may also lead to reachable graph from a
conversation outside the exported turn inventory. V3 allows node-owned navigate actions
without source-layer metadata when their source node belongs to the containing layer.

Import remaps all graph identities, preserves converted provenance in import-owned storage,
and remains read-only. Re-export keeps these semantics. V1/V2 rules and parsing remain
unchanged; older readers reject version 3. Public V3 shares retain sensitive-content filtering
and remap compiled bindings to public aliases. The share API remains contract version 1;
its service and viewer snapshot-version allowlists must include 3 before publication.


Imported storage uses distinct local keys while preserving authored node and layer keys
as immutable import provenance. This allows a closure to contain results from different
completions that reused the same authored key. Compiled package bytes remain unchanged.
A source layer outside the exported closure is provenance only: import materializes an
inert empty reference record, preserving an unambiguous compiled source-layer key when
present. It adds no response topology or authority. Conflicting provenance keys fail closed.
V3 re-export retains the originally imported format even without native mutation records.
V3 permits a Reference backlink to the response root; Expand cycles and mixed arrivals
at nonroot layers remain invalid.


### V3 portable attachment ownership

An exported context source may include `ownerTurnId`, the export-local identity of an
earlier included accepted turn that canonically owns its exact source layer. This is
distinct from `interactionNodeId`, which records the presenting occurrence. The owner
must include that layer and attached node in its accepted view. All declarations for
one layer must agree. The field is V3-only; exporting ownership promotes the snapshot
to V3. Omitted owners remain unknown, including outside-conversation and old-view cases.

Public graph navigation uses this inert provenance to group attachment edges and uses
validated action origins for invocation edges. Missing ownership never permits inference
from chronology, layer containment, or node creation. V1/V2 still render graph cards
and their provable invocation connections. Imports store and re-export remapped owner
turn identities without consulting imported materialization ownership or granting authority.
