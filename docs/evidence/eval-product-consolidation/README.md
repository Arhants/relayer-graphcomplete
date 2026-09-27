# Eval product consolidation

The approved scope extends ADR 0003 and PRD section 9: the product server owns
live, scoped browser review sessions. Eval retains evaluation execution, profiles,
traces, judges, and dashboard operations. Public shared snapshots remain separate.
No provider-native recursion, graph acceptance, or complete(inputGraph) changes.

## Required verification plan

| Changed production seam | Deterministic checkpoint | Required heavy proof |
| --- | --- | --- |
| Control registers immutable review context/roster and optional author; review bearer never inherits cookies; unknown and revoked tokens fail closed | `native_review_sessions_scope_reads_annotations_and_revoke_without_cookie_upgrade` in the real Rust router/persistence suite | `npm run test:eval-web`: human annotation lifecycle, judge write denial, empty browser cookie jar, shutdown/restart |
| Native completion broker retains execution-scoped bearer authority without cookie fallback | Existing `test/recursive-complete-e2e.test.mjs` and `test/eval-app-integration.test.mjs` exercise real recursive completion; Rust review scenario denies review tokens on completion reads | Included in `npm run check` |
| Scoped state, project metadata/environment, absent thread, encoded asset path, growing roster | Same Rust scenario includes two projects, separate threads, old/new rosters, removed thread, malformed/foreign requests, and opaque asset routing | Browser proof uses the production workspace and real data |
| Allowed source cannot disclose an unlisted resolved destination | Extended `resolved_invoke_destination_is_readable_cross_thread_in_review_mode` tests narrow/wide native sessions through runtime fixture | Existing native visual-detail proof retains graph presentation coverage |
| Tab-local bootstrap replaces HTML/Playwright context injection; host requests expose only scoped authority | `test/product-review.test.mjs`: registration snapshots, revocation, foreign-URL rejection, separate tab storage, reload, hash removal, cookie omission | Browser proof reloads human review and exercises isolated judge navigation and captures |
| Shared backend owns graph-before-product startup, partial failure, cancellation, product-before-graph shutdown | `test/product-backend.test.mjs`: concurrent starts/closes, partial startup and cleanup failures, pending startup, deferred product teardown | Browser proof interrupts native startup and deliberately stalls review registration before terminal shutdown |
| Shared provider composition owns runtime checkers and publish-to-product-before-runtime ordering | `test/product-provider-composition.test.mjs`, retained Eval Prime, readiness, installer and provider tests | No paid provider proof; runtime assembly is unchanged |
| Review controller is transport-neutral; native evidence supplies the Electron adapter | Retained `test/review-session.test.mjs` crosses the extracted adapter without retiring screenshot, provenance, sender, or navigation assertions | `npm run test:desktop:visual-node-details` |
| Conversation evidence uses production HTTP dashboard/upload and native review sessions; native export remains Electron | Retained conversation export/import service and end-to-end tests; dashboard auth/upload tests | `RELAYER_CAPTURE_CONVERSATION_EVAL_EVIDENCE=1 electron scripts/capture-conversation-eval-evidence.mjs` with temporary output override |
| CI inventory, telemetry inventory, packaging/bootstrap wiring | Existing planner/inventory/Desktop tests plus `npm run check` fallback | `npm run check` and `npm run build` before commit |

## Test subsumption

Only the removed Node review-proxy tests are retired. Their authority promises move
to the real Rust router scenarios, host/bootstrap tests, and browser proof above.
Dashboard authentication, host/origin rejection, upload cleanup, and all existing
review-controller tests remain. A pending registration cannot hold global shutdown:
backend shutdown revokes every review session without awaiting individual DELETEs.
The browser proof injects that stalled request through its test-only preload.

The old dashboard Electron preload is deletable after the migrated conversation
runner passes. Native product review IPC remains only in the evidence adapter,
where Electron rendering still needs distinct proof. No Electron evidence is
replaced by a browser screenshot claim. Adversarial subsumption review is recorded
in the PR against the final source identity.

## Evidence limits and acceleration

Use pinned Node 22.23.2. Reuse the local Cargo target; Cargo checks current inputs.
No downloaded unverified native artifacts, paid inference, deployment, signed
release, or unavailable-platform proof is claimed. Heavy runner outputs may use
`RELAYER_CONVERSATION_EVAL_EVIDENCE_DIR` and
`RELAYER_VISUAL_NODE_DETAIL_EVIDENCE_DIR` to avoid rewriting historical artifacts.
Actual command outcomes, preserved failures, and exact reviewed tree are recorded
separately in the PR.
