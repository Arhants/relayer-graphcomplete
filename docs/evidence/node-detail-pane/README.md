# Node detail pane evidence

The user accepted this layout after inspecting the local Electron result.

## Product checkpoints

- NDT-001: an authored layer default belongs to that layer; SQLite persistence, acceptance, reopen, and export/import preserve its identity.
- NDT-002: TypeScript and Python authoring clients transport the choice. Compiler descriptors preserve provenance checks. Harness guidance asks agents to choose deliberately; older clients remain compatible.
- NDT-003: opening a nonempty layer selects a detail automatically. Valid remembered selection precedes the authored default. History restoration does not become a new selection intent or retain transient input edits.
- NDT-004: details fill the pane; annotation editing overlays them. Collapsing the sidebar hides Environment, spans the heading across both columns, matches Turn to graph width, and raises the equal-width detail column beneath the heading. Expanding restores the original layout.

The executable mappings and required entry points are in PRD section 7.0.

## Executed verification

The final implementation, including the breadcrumb readability follow-up, passed these checks. This README was finalized afterward without further executable changes.

- `npm run check`: passed, including native, TypeScript, Python, packaging, and PRD checks.
- `npm run build`: passed.
- `node scripts/run-node-input-actions-test.mjs`: passed, zero paid inference.
- `node scripts/run-interaction-context-lifecycle-test.mjs`: passed, zero paid inference.
- Focused workspace keyboard, breadcrumb, and environment tests: passed.
- `git diff --check`: passed.

The desktop runners used the separately completed build prerequisite. A trusted Ladybug cache was restored and verified before compilation. Earlier failures during development were repaired; earlier aggregate runs also exposed a concurrent-build artifact race and a provider screenshot capture failure. The final aggregate run passed without those failures.

Reviewer `/root/review_contract` independently reviewed state, authority, responsive geometry, breadcrumb legibility checks, and test boundaries, with no unresolved identified findings. Runtime results were supplied by the primary agent. The exact source assertion belongs in the PR description; the local review is non-certifying without a PR. Breadcrumb horizontal scrolling is configured but the readability fixture does not exercise a long overflowing path.

## Visual evidence

These are actual Electron captures from the final breadcrumb and layout run:

![Full node detail pane](node-detail-full-pane.png)

![Annotation overlay](node-detail-annotation-overlay.png)

![Accepted collapsed-sidebar layout](node-detail-sidebar-collapsed.png)

![Readable breadcrumb on a nested layer](breadcrumb-readable.png)

## Limits

Remembered selection was tested through sidebar reopening and renderer reload. Full application restart onto a different local origin was not tested. No paid inference, live provider, signed release, or deployment proof is claimed.
