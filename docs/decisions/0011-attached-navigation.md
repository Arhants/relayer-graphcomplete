# ADR 0011: Attached nodes receive atomic navigation additions

Accepted for the gated #517 qualification slice. PRD section 7.2B is authoritative.

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
presentation payloads while accepted mutation provenance remains available. Export of mutated records is explicitly unavailable until portability is defined.

B3 is a read projection of canonical context-layer owners and immutable invocation origins.
No chronology edge or second stored graph is introduced. Read-only B3 navigation is enabled independently of the mutation gate for native threads,
including packaged Desktop and existing interactions. Imported threads retain the turn picker, as do runtimes whose startup feature discovery
is absent or unavailable. It starts closed, and selection loads the response root
through the normal navigation controller. Enabling this read projection does not change
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
