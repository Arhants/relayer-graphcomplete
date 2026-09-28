# ADR 0012: Immutable shared-thread snapshots

Status: accepted; local production implementation in progress

## Context

Issue #461 settles public thread sharing as one frozen, read-only publication of
accepted history. Ordinary conversation export also carries drafts and local
recovery information, so publishing cannot be a renamed download route or a
renderer-owned network operation. Retries, viewer compatibility, redaction, and
owner-scoped service idempotency need one byte-stable boundary.

## Decision

Rust owns a share-export operation beside ordinary conversation export. At
`Create link` it reads the persisted product and graph state once and emits
conversation-export V1 JSONL containing only accepted completions when that history is
asset-free, or V2 when an accepted authored Node Detail carries visual content. It refuses
imported threads and threads without accepted history. Pending, draft, stopped,
and failed work is not promoted to accepted history.

The share export preserves the accepted turn order, nested layers, Node Details,
action provenance, and export-local references. It removes permission receipts,
execution and harness-configuration digests, and admitted model plans while
retaining completion status, model selection, and the harness configuration
name. Known secrets, credential shapes, and private paths are redacted from
conversation content, including text that becomes contiguous only after rich-detail HTML is
rendered. Unsafe rich detail is omitted as a unit rather than rewritten. The chosen public title
replaces the exported local title, while the chosen title and project display
name are published unchanged except for ordinary safe HTML and inert-data
handling. The local thread is not renamed.

Public graph records omit layer, node, and action client keys because those are
harness-authored strings. Export-local IDs preserve all graph references. Asset
collection applies the same detail-omission predicate as node export, so an
omitted private detail cannot emit unreachable visual content. V2 accepts the
canonical base64 expansion of an asset up to the 8 MiB decoded limit while the
snapshot retains its 16 MiB total bound.

The exporter returns one immutable byte sequence or a closed failure. It never
truncates. Bytes above 16 MiB fail before publication. Electron main owns those
bytes and the owner-bound attempt/reference identity. Renderer code receives a
closed progress/result presentation but no bearer token, signed upload fields,
or direct service authority. Every retry of one attempt reuses the exact bytes
and identity; a deliberate new Share action creates both anew.

The share service treats graph semantics as opaque. It validates version, total
bytes, line bounds, and per-line JSON syntax, binds finalization to the exact
staged object identity, and publishes one immutable object. The public viewer
uses a V1/V2 snapshot reader and the production ProductWorkspace in a
read-only host. It starts at the first accepted turn, leaves the URL unchanged
during navigation, disables execution, and has no client telemetry or snapshot
fetch authority.

Electron main durably persists the frozen attempt before publication. Recovery
is scoped to the original owner and the currently open source thread, reuses the
same bytes and attempt identity, and records handled-failure deduplication keys.
The renderer binds a new dialog to its source thread before account and preflight
awaits, then invalidates every continuation if navigation changes that source.
Success replaces the bytes with a lightweight URL receipt until the Link ready
dialog closes; failure remains until its owner explicitly dismisses it. A local
process-restart path may exercise this contract with deterministic storage,
authentication, cache, and transport fakes; it is not deployed-service evidence.

## Consequences

- `complete(inputGraph)`, graph acceptance, and draft/accepted/stopped semantics
  do not change.
- Ordinary conversation export remains independently compatible and testable.
- Every published format version remains readable; V2 visual content remains bound to its
  package pins and is digest-checked again before browser presentation.
- Real exports remain local test inputs and never enter committed fixtures or
  public evidence.
- Deployment, IAM, live Auth0, live Sentry, and full-size network proof remain
  separately authorized Gate C work.

## Embedded presentation (issue #558)

The accepted embed design reuses this reader and ProductWorkspace. An explicit
server-owned `presentation: "embed"` option changes only public shell chrome and
layout; standalone remains the default. Embed callers supply a validated canonical
`sharePath` (`/t/<32 lowercase hex characters>`) for Open full graph. Neither
snapshot content nor browser query parameters supplies host configuration. The
link opens a new tab at the ordinary first accepted turn. This is not a state
transfer or deep-link interface.

The local first slice provides compact attribution instead of the download card,
wide equal graph/details columns, and the same read-only navigation. It preserves
`publicViewerCsp()` and the versioned hosted artifact contract unchanged. Only the
synthetic loopback fixture server sets an HTTP framing exception for its own
parent. The hosted service must explicitly route/configure an embed surface and
admit only the two approved website origins in a later, separately authorized
slice. No publication, live policy change, network capability, or parent messaging
is introduced here. PRD section 8.4.1 records the complete accepted design and
remaining slices; local source/fixture proof is not hosted acceptance.
