# Verification ledger

Date: 2026-09-28. macOS arm64, local deterministic fixtures; zero paid inference.
Product source is identified by `source.sha256`; reviewer scopes by their separate
manifests. Public capture inputs have their own adjacent manifest. Source files
were unchanged between the final full Vitest pass and final rendered proof;
the two capture drivers subsequently gained paint/content-settle waits.

| Actual command / entry point | Result |
| --- | --- |
| `npm run check` | **FAIL**, unchanged native persistence assertion; see below |
| `npm run build` | PASS, final build before the serial native scenarios |
| `npx vitest run` (serial, no concurrent build) | PASS: 220 files / 2,883 tests; 1 file / 3 tests skipped |
| `npx tsc --noEmit` and `npm run check --workspaces --if-present` | PASS, including built visual-assets smoke |
| `npm run test:codex-secret-boundary` | PASS: 2 tests |
| Python unittest discovery | PASS: 47 tests |
| `npm run lint:ladybug-receipt` | PASS including native receipts and contract probe |
| `npm run prd:check-readability` | PASS |
| `npm run test:eval-web` | PASS: interrupted startup, real fixture/tab independence/review authority, judge viewport/full capture |
| `npm run test:desktop:narrow-sidebar` | PASS: 59 scenarios, including Environment header reachability |
| `node scripts/run-interaction-context-lifecycle-test.mjs` after build | PASS, updated accepted-layer synchronization; cleanup/restart/authority assertions retained |
| `node scripts/run-project-new-thread-test.mjs` after build | PASS: thread and layer-selection persistence across product restart |
| `electron scripts/test-desktop-stop.mjs` after build | PASS: Codex and Prime deterministic stops, duplicate-click abort count 1 |
| `RELAYER_NODE_DETAIL_EVIDENCE_DIR=docs/evidence/issue-567-reading-layout node scripts/run-node-input-actions-test.mjs` after build | PASS: real drag, saved ratio/reload, close/reopen, Environment open/dismiss, pending/browsing/Result ready; final screenshots inspected |
| `npm run evidence:public-share-viewer` | PASS: 3 painted captures, read-only controls, nested/turn navigation, pan, unchanged URL, no external network; images inspected |

Native cache: verified trusted local Ladybug bundle for darwin-arm64 and rustc
1.98.0, from source identity `92a89d6a00efda5ca88492ae7a19c17c0b95375e`.
`LBUG_LIBRARY_DIR` / `LBUG_INCLUDE_DIR` pointed to that verified bundle. No build
cache result was treated as test evidence.

## Preserved failed/invalid runs

The final aggregate check stopped in `crates/relayer-app-server/tests/product_persistence_flow.rs:9604`:

```text
opening_a_quarantined_thread_accepts_its_attempt_without_releasing_again ... FAILED
assertion left == right failed
  left: 2
 right: 1
test result: FAILED. 35 passed; 1 failed
```

This observes duplicate provider DELETE calls before reopen. No Rust product source
changed in this PR. The isolated case passed (1 test); this is diagnostic only.
A possible concurrent reconciliation/completion release is unconfirmed and remains
an open full-check blocker. An earlier full check passed native coverage then
failed renderer expectations; those expectations were repaired and the complete
serial renderer suite above passed. There is no aggregate `npm run check` pass.

A renderer run performed concurrently with a clean-dist build failed imports and
is invalid evidence. An initial native context run timed out during startup; its
next run exposed an obsolete immediate-navigation assertion. The final corrected
runner passed. Native divider evidence initially exposed unsaved pointer release;
the production controller and document-release regression were repaired and the
final native runner passed. One public capture was blank despite DOM assertions;
visible-window paint settling repaired capture, and refreshed images were inspected.

## Review assertions

- `/root/review_mapping`: navigation, selection, user-intent races, PRD/test mapping;
  no unresolved findings in scope. Manifest `navigation-review.sha256`, aggregate
  `ed614f62a5cee54839b67a7e9d6da0654e302375e0d133210382bbc2435f9e72`.
- `/root/layout_proof`: layout, overlay, preference authority/persistence, pointer
  release, packaging/telemetry inventories, mappings and evidence drivers;
  source review passed. Manifest `layout-review.sha256`, aggregate
  `f059a20b425a864025b6104741bde752681b9686d36bfe6258252cdf8f63f730`.

Assertions are invalid if any inventoried file changes. They do not certify the
failed full native gate, untested platforms, release packaging, or human visual
acceptance. Dedicated human Eval review and desktop human approval remain pending.

Follow-up layout review found an unresolved product-contract mismatch: narrow
stacking is preserved from the baseline, but the issue assumes an existing
single-pane / Back to graph flow. This is an unmet acceptance item, not a new
layout regression. Human scope clarification is pending.
