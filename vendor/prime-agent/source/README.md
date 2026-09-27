# Scoped retry source recovery

`scoped-retry.bundle` preserves source commits through
`3635b59066ebf4facf1a6d0285b005056644226b`, based on upstream
`f6130839ad3043f1cd3d5294fe03023035bfcd5c`. Fetch that upstream base before
fetching the bundle's `HEAD`. Nothing was pushed to the Prime repository.

The earlier local bridge commit was no longer available through its Git
backlink or GitHub. Its source was recovered from the existing
`372-prime-bridge` checkout into a fresh clone of the recorded upstream base.
Before editing, TypeScript compilation reproduced all 564 JavaScript and
TypeScript declaration files byte-for-byte against the sealed installed
coding-agent package. This verifies the recovered executable baseline; it
is not a claim that the lost Git commit itself was recovered.

The final change preserves the managed-kernel bridge and passes
`model: runScope.selectedModel` to native rate-limit retry continuation.
The scoped authority check remains unchanged. The source regression covers
an unset and a different ambient model, exact scoped credentials on both
attempts, and absence of persistent model changes.

Reproduction uses the pinned repository dependencies, TypeScript compilation,
`copy-assets`, `scripts/bundle.mjs`, and `npm pack --ignore-scripts` in the
coding-agent package. Relayer records the resulting archive and filtered
runtime-tree digests in its manifest and runtime verifier. The Git bundle
retains the source and tests needed to rebuild it.

An exploratory scoped context-compaction scenario uncovered a separate
continuation/lifecycle gap. Those unproven compaction changes are excluded
from this source snapshot. Rate-limit retry evidence does not prove
context-compaction recovery.
