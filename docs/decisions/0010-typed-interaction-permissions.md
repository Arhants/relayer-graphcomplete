# ADR 0010: Interactions own frozen typed permissions

Accepted for #517, with the Slice 1 rollout boundary below. Trusted preparation
translates product attachment and invocation rules into one closed, versioned
permission description on the interaction before `complete(inputGraph)`. Runtime
tokens select that interaction; caller payloads and prompts cannot add grants.
Native helpers share its authority. A semantic Complete child receives its own.

`invoke.resolve` names one exact source action. Successful atomic acceptance
changes that same action to `navigate`, relation `expand`, targeting the accepted
response. Its identity, source node, label, icon, variant, description, and original
source-layer provenance survive. Invocation text stays on the interaction and is
removed from the action. The graph records the exact conversion so an existing
compiled invoke binding can navigate after acceptance and reopen, without allowing
arbitrary kind substitution. All occurrences observe this node-owned transition.
Expand cycles are revalidated across node-owned traversal at acceptance. Rejection,
stop, and storage failure publish no conversion. Replay cannot redirect the action.

`navigate.add` names each exact attached context node, granting an ability rather
than requiring a change. It grants no invoke, input, removal, or general node edit.
Eligible targets are visible accepted layers or layers accepted by this interaction;
there is no frozen target allowlist. Future detail replacement must accompany at
least one authorized new navigate action, preserve existing actions, and bind every
addition. Source-layer data is provenance, never occurrence ownership. Scope remains
project-wide or, without a project, chat-local; imports and shared reads cannot mint
mutation authority. Terminal permissions remain provenance but cease authorizing.

## Rollout and supersession

Slice 1 is off by default. The trusted graph-server qualification switch
`--interaction-permissions` freezes the gate on newly prepared interactions.
Desktop runtime qualification may opt in through `interactionPermissions: true`;
there is no renderer setting. Existing preparations never acquire authority when a
process flag changes. Persistent attached-node mutation remains unavailable even
with this switch enabled. Permission authorization can be tested separately.

Slice 1 stores new descriptions and exact invoke-conversion receipts durably.
It does not backfill legacy records. Export of converted actions fails explicitly
until Slice 2 supplies portable versioned snapshots, identity remapping, migration,
and inert imported provenance. Legacy migration may derive only from unambiguous
origin and accepted context provenance; ambiguity fails closed. Historical records
must never become active just because they exist. The B3 navigator is separate.

This supersedes ADR 0005's retained-invoke resolution rule only for gated new
interactions. ADR 0007's control-authored context relation remains the input source;
attachment is no longer conceptually read-only authority, but Slice 1 does not yet
enable the new persistent edits. Temporal acceptance retains its atomic Return
boundary. Search publication carries each changed closure's own scope so conversion
cannot grant source-thread records to the result thread.

## Attached-navigation qualification successor

[ADR 0011](0011-attached-navigation.md) enables narrowly authorized persistent additions
and current presentation replacement behind the existing default-off gate. Its terminal
acceptance and B3 projection refine the earlier slice boundary without enabling general edits.
