# ADR 0011: Attached nodes receive atomic navigation additions

Accepted for #517 and the Desktop rollout in #604. PRD section 7.2B is authoritative.

This refines ADR 0010: the existing frozen `navigate.add` grant now authorizes exact
native attached-node additions. It does not enable general `submitNode` edits.
A dedicated presentation read returns an optimistic revision; a dedicated staging
operation accepts a full compiled replacement and durable asset snapshots. Revisions
are concurrency preconditions, never authority. Each operation revalidates the frozen
grant. Draft additions belong to the current completion and may lie outside its response.
Only terminal Return accepts them, atomically with the response. Advance cannot publish them.

Both expand and reference may target visible accepted or same-completion draft layers.
Source-layer metadata is provenance, not ownership. Prospective node-owned expand paths
must remain acyclic across all occurrences. Reference cycles are allowed. Existing action
identities are retained; replacement HTML must expose all old and new controls. Concurrent
adds accumulate; stale HTML requires reread and repair. No removal or semantic-node edit is granted.

This supersedes ADR 0005's immutable accepted node-action set only for these gated additions,
and ADR 0007's read-only attachment implication. Accepted layer topology stays fixed; its
node occurrences observe current node-owned actions and presentation. Historical HTML replay
is not promised. Successful acceptance consumes staged presentation payloads in the same
transaction; rejection retains them for repair. Stop or failure discards unpublished
presentation payloads while accepted mutation provenance remains available. The V3 current-snapshot portability decision below supersedes the original export restriction.

B3 is a read projection of canonical context-layer owners and immutable invocation origins.
No chronology edge or second stored graph is introduced. Read-only B3 navigation is enabled independently of the mutation gate for native threads,
including packaged Desktop and existing interactions. Imported threads retain the turn picker, as do runtimes whose startup feature discovery
is absent or unavailable. It starts closed. Accepted selection loads the response root through the normal
navigation controller. Local non-accepted turns remain selectable in their normal
status view; non-accepted provenance-only sources remain disabled. Enabling this read projection does not change
frozen permissions or enable attached-node mutations.

## Required response navigation for new preparations

New gated native preparations use frozen description version 2. Its existing exact
native attachment grants also identify the distinct nodes obligated to receive a new
usable navigation control targeting this completion's exact response root. Permission
remains ability; the versioned acceptance policy supplies the obligation without new
authority or caller-supplied lists. Multiple occurrences require one persistent addition.
Terminal submit and Return reject missing sources with repairable IDs before publication;
Advance remains independent. Existing binding, revision, and atomic publication checks apply.
Version 1, absent descriptions, and disabled snapshots retain prior semantics. Recovery
never upgrades an existing preparation. Imports and Eval behavior are unchanged; the
qualification gate applies to graph preparation, not a caller-asserted Product origin.

Normalized interaction input exposes the canonical frozen description read-only to all
harnesses. This supports pre-submission authoring and never accepts caller-supplied grants.


## Desktop rollout

Desktop enables typed interaction preparation and attached navigation for new native
completions in development and packaged builds. The generic runtime constructor and
graph-server CLI remain explicit opt-in for other hosts. This is startup policy,
not a renderer setting or a new graph authority source. Previously prepared V1,
absent and disabled snapshots retain their original semantics; reopening never
upgrades them. New eligible completions may add navigation to older native nodes.
Imported and shared read-only contexts still cannot grant mutation authority.


## V3 current-snapshot portability

The approved full attached-node rollout includes export, import, re-export and public
sharing. V3 captures current accepted node presentation and actions across the selected
conversation roots in one read transaction. Immutable layer topology and interaction
origins remain provenance; historical HTML is not reconstructed. Pinned assets must
resolve to matching content or capture fails. Local and public size limits remain unchanged.

Converted invokes export as navigate/expand with inert `convertedFromInvoke` provenance.
A matching included action-origin turn must target that exact accepted response. A source
conversation can retain the navigation when the result belongs to another conversation;
the reachable graph is included without importing unrelated conversation metadata.
Node-owned layerless navigation remains valid only from a member of its presenting layer.

Imports assign fresh identities and store conversion provenance separately from native
resolution receipts. Imports never mint execution or mutation authority. Read-only compiled
controls may navigate; re-export preserves their provenance. V1/V2 remain supported and
older readers reject V3. Public shares retain privacy filtering, sanitized public binding
aliases and compiled-detail integrity. The hosted service and viewer must accept V3 before
a desktop release publishes these snapshots; this source change does not authorize deployment.
