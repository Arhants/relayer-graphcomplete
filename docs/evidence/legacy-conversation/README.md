# Legacy conversation compatibility: verification plan

User decision: 2026-09-28, PRD AGT-011/012. No provider-neutral storage, provider home migration, fresh-session fallback, paid inference, production data mutation, push or release is included.

## Changed seams and checkpoints

| Checkpoint | Production seam | Deterministic check |
| --- | --- | --- |
| Successful original route survives failed foreign attempts | SQLite root receipt resolver; semantic children excluded | `legacy_conversation_uses_success_receipt_not_failed_foreign_attempt_and_preserves_send` |
| Stale Send cannot change owner or prior text | Atomic ordinary/identified input insert and retry | `legacy_conversation_uses_success_receipt_not_failed_foreign_attempt_and_preserves_send` exercises ordinary Send and explicit foreign retry refusal; `legacy_conversation_excludes_children_and_rejects_changed_adapter_and_attached_send` preserves unconsumed attachment confirmation |
| Catalog/admission race cannot invoke foreign provider | `begin_interaction_attempt`, within its immediate transaction | `legacy_conversation_rejects_foreign_admission_after_successful_owner` |
| Reopen and missing owner do not make foreign routes selectable | Authoritative state/detail projection and model picker | `legacy_conversation_blocks_unknown_and_conflicting_successful_provenance`; independent-connection ownership resolution; `test/model-picker-model.test.mjs` |
| Compatible model changes preserve native conversation | Codex adapter state/identity and root continuity assertion | `codex-basic.test.ts` legacy continuity case |
| Native resume cannot bless a foreign overwritten legacy session | Codex `thread/resume` response checked against trusted accepted interaction input before `turn/start` | `codex-app-server.test.ts` matching/nonmatching native-history scenarios |
| Missing session or changed presentation cannot silently reset | Product continuation assertion passed through trusted runtime/host; all three adapters | Claude/Prime `requireNativeContinuity` regressions (missing history, changed pin, Claude changed storage and mismatched resumed ID); Codex legacy guard regressions |
| Registration preserves legacy pointers | Adapter state serialization or refusal before host persistence | `host-legacy-continuity.test.ts`: real host registration, close/reopen, malformed state refusal without persisted pointer replacement |
| Telemetry recognizes the new application module | Sealed module inventory | `desktop-telemetry-module-inventory.test.mjs` |
| Prime visual continuation survives runtime reopen | Durable fixture-native pointer and prompt history through real host | `prime-visual-integration.test.mjs`, both Prime harnesses |
| Composer input and draft behavior retains its prior guarantees | Real workspace with authoritative compatibility in fake server state | 120 tests across composer traces, authored input traces, Node Details and provider video |
| Useful no-route state and preserved visible history | Production desktop renderer/picker | Real Relayer Dev isolated fixture review; human gate remains pending |

No existing boundary is retired. Existing legacy tests that expected an unverified fresh replacement now assert refusal before a replacement session or inference; they still observe the same registration/restoration boundary.

`npm run check` is the deterministic fallback for this new mapping. `npm run build` is required. Desktop review is heavier, performed after the edit loop, with deterministic fixture execution only. Existing `evidence:model-selector` requires live catalog credentials, so it is not suitable for this isolated no-credential gate. The new fixture review uses the real development entry point and product services. It is not live provider proof.

## Coordination with #571 and #584

Read #571 and #584 comment 5878839399 on 2026-09-28. #571 owns root-session lifecycle and proposed effective-home binding; `claude/api-key-provider-homes` owns isolation of new conversations with a durable legacy marker. This P0 does not change provider homes, implement provider-neutral storage, or copy native state. #571's proposed fresh fallback plus visible notice conflicts with AGT-012 for legacy continuation: when the trusted product continuity requirement is present, fallback must refuse rather than run fresh. A shared home also requires compatible native provider configuration. Integration must preserve this guard; no merge is authorized here.

## Evidence status

**Closeout update:** the full `npm run check` passed under repository-pinned Node 22.23.2 on the unchanged human-accepted source. See “Successful full verification” below. Earlier failures are retained as historical evidence, not current blockers.

Reviewed source digest: `f7391574907b86705702940d615a8c3436ada12f11dcc6685cc136e90b2f7064`, base `c6813890b2fc3f5c0cb2807f3ce509ef31673931`. SHA-256 over sorted `UTF8(path) + NUL + raw SHA256(file bytes)` for 37 source/test/PRD files listed in `.relayer/legacy-compatibility-evidence/p0-reviewed-files.txt`. Evidence notes, research, and the new review driver are excluded. No commit or PR was created.

### Actual deterministic results

- `npm run build`: **passed** on final source (`p0-build-final.log`).
- Four production SQLite compatibility regressions: **passed**, including retry refusal, attachment preservation, child exclusion and conflicting provenance (`p0-rust-complete-2.log`).
- 209 adapter/host/picker tests: **passed** (`p0-final-native.log`).
- 65 app-server integration tests: **passed**, including persistence and process restart (`p0-check-remainder-2.log`).
- 120 composer/input/Node Details/provider-video tests: **passed** after their fake states were updated to the new API contract (`p0-ui-fixtures.log`).
- Prime visual reopen for both harnesses and telemetry inventory: **passed**; durable final log is `p0-prime-inventory-final.log`.
- Root and workspace TypeScript checks, 2 Codex secret-boundary tests, 59 Python tests, Ladybug receipt lints, PRD readability, and `git diff --check`: **passed**.

**The full `npm run check` aggregate is NOT green.** The final run stopped on the unchanged Git environment test `command_runner_clears_hostile_git_repository_environment` hitting its 500 ms timeout; the other 291 app-server unit tests passed. Its isolated diagnostic rerun passed (`p0-git-timeout-diagnostic.log`). Remaining stages were run explicitly and recorded separately in `p0-check-remainder-results.json`:
- Broader Rust graph tests and graph crash reconciliation could not finish compiling because disk space ran out. Only this worktree's generated incremental cache was cleared; the source, profiles and evidence were preserved. These stages remain **indeterminate**, not passed.
- The broad Vitest run reported 57 failures, 2,973 passes, 3 skips. All change-related failing files subsequently passed in focused reruns (120 UI tests, both Prime visual cases, telemetry inventory). The unchanged exact-port egress test remains **failed** under Node 26: `ERR_ACCESS_DENIED`, permission `Net`, for loopback. Its assertion was not weakened. The complete aggregate was not rerun or upgraded to a pass.

Earlier failures are retained: intended red regressions; synthetic accepted rows without provenance; missing fake API compatibility fields; fake Prime sessions lacking durable pointers; a duplicate fixture admission ID; the missing telemetry inventory entry; PRD sentence length; Git deadline failures; and the disk/network-permission failures above. There was no test deletion or removed assertion.

### Actual desktop evidence

Final actual development entry point: `desktop/main/index.mjs`, app **Relayer Dev**, PID 57905, route `http://127.0.0.1:50591/?threadId=1`. Profile: `/Users/vishaltandale/.codex/worktrees/p0-legacy-conversation-compatibility/relayer-graphcomplete/.relayer/legacy-compatibility-review-1790632994543`. Source is the isolated P0 worktree. `.relayer/legacy-compatibility-evidence/identity.json` records the reviewed digest, native binary hashes and executed driver hash.

The fixture replaces inference with the deterministic graph harness and uses inert credentials. Native UI inspection on the final build verified preserved accepted graph and failed foreign input, absence of the foreign Codex option, two selectable original-provider models, and an unavailable-original-provider state with reconnect/restore guidance. Screenshots are `compatible-history.png`, `compatible.png`, and `unavailable.png` in the evidence directory. This is **not** proof of live provider continuity.

Startup diagnostics are preserved. Under build load the default graph/app startup deadlines expired; the review-only driver uses a bounded 60-second budget. Its fake lease endpoint was corrected before successful fixture execution. No production startup deadline changed. The final run started successfully, authored both fixture graphs and was foregrounded through native UI control.

### Adversarial review and remaining gate

Reviewer `/root/compatibility_review` reviewed the exact digest above: ownership, Send/retry/admission, picker, native restoration, state preservation, fixture fidelity, telemetry inventory, PRD and checkpoint mapping. Verdict: **no outstanding actionable implementation finding or deterministic mapping gap**. The reviewer read the result logs; desktop observations were reported by the primary agent. Without a PR this review is **non-certifying** and is invalidated by a scoped source change.

Human acceptance is recorded below for the refined source snapshot. Live provider proof remains unproven. No paid inference, provider home repair, push, merge, or release occurred. The failed/indeterminate broad checks remain integration blockers and are separate from the local human review.

## Presented human review checklist (accepted)

In the foreground **Relayer Dev — Legacy compatibility review** window:
1. In “Legacy: compatible choices and preserved history,” inspect both turns. The accepted graph and failed foreign-provider input should both remain.
2. Open the model picker. Only the two `legacy-openrouter` models should appear; switch between them. The foreign Codex model must not appear.
3. Open “Legacy: no compatible route available.” Its graph should remain readable, with no selectable model and a reconnect/restore explanation.
4. The user accepted these restrictions and explanations with “ok lgtm.” The profile is isolated; any Send uses only the deterministic fixture, not paid inference.

The app was left open. Acceptance comes from the user's explicit response, not from screenshots or automated tests.

## User-directed notice refinement

The user requested simpler wording, yellow instead of red, and the harness name instead of the synthetic model-family label. Changed seams: renderer notice copy/class/ARIA role; theme-aware warning CSS; isolated fixture family naming. PRD AGT-011 records the explicit notice decision.

The notice now reads “Only models from the original provider are available.” It uses the existing warning color token; actual errors retain alert/red styling. The review fixture family is “Codex Basic.” No compatibility/admission behavior changed.

Plan: existing picker tests and PRD readability, build, native UI inspection and adversarial incremental review. Actual: 37/37 picker tests, readability and build passed; native Relayer Dev force reload visibly showed the short yellow notice and Codex Basic label (`yellow-notice.png`). The current runtime uses these reloaded renderer files; native binaries are unchanged. Broader prior failures remain unresolved; earlier aggregate results are not claimed for this new snapshot.

Reviewer `/root/compatibility_review`: no actionable finding in copy, warning/error distinction, accessibility role, or theme-token treatment. Non-certifying 38-file source digest `fb0059ee681eb099b6c63fb791229dd12547dded459e68632c60758fef05e031`, same hash algorithm, scope `warning-reviewed-files.txt`. Previous whole-source digest is superseded. Rendered dark-theme appearance was inspected; light-theme styling uses the existing theme token and was source-reviewed, not visually requalified.

## Accepted human gate and closeout

On 2026-09-28 the user said **“ok lgtm”** after the shorter yellow notice and Codex Basic label were shown. This accepts the temporary legacy compatibility scenario at source digest `fb0059ee681eb099b6c63fb791229dd12547dded459e68632c60758fef05e031` (38-file manifest `warning-reviewed-files.txt`), on base `c6813890b2fc3f5c0cb2807f3ce509ef31673931`, branch `codex/p0-legacy-conversation-compatibility`. Closeout rehashed the current source and both native binaries: all still match the presented identities. `human-acceptance.json` captures the exact profile, route, binary hashes and screenshot hash. No repeat of this same human gate is required.

The accepted policy is **temporary original-provider-only containment** for legacy conversations. It is not a permanent ownership model for project/thread identity. Provider-neutral conversation continuity remains #584's separate scope; this fix does not implement or absorb it.

Required verification evidence was audited at closeout: final refined-source build, 37 picker tests and PRD check passed; the source-scoped non-certifying adversarial review remains valid. Earlier native/SQLite/integration checks remain recorded against their tested states. No full aggregate pass is claimed. Remaining actionable verification gap: rerun the full deterministic check with repository-pinned Node **22.23.2** (`.node-version`) and adequate disk space. Prior Node 26 loopback permission failure, disk-blocked graph/crash compilation, and the full-run Git deadline failure remain preserved; the isolated Git rerun passed. Free disk at closeout was approximately 10 GiB, which is not itself proof that the graph compilation has sufficient headroom.

Next step is that deterministic verification run, followed by recording its exact-source result. There is no authorization here to push, merge, release, deploy, or modify production data. Work remains uncommitted; no PR exists, so the review remains non-certifying.

## Successful full verification

After the user confirmed disk space was available, the complete unfiltered `npm run check` ran with repository-pinned Node **22.23.2**, `RUST_TEST_THREADS=1`, and `CARGO_BUILD_JOBS=2`. The Ladybug bundle was reverified before the run. The command completed with **exit 0**. No new skip or test filter was introduced; built-in suite skips remain.

Source digest before and after: `fb0059ee681eb099b6c63fb791229dd12547dded459e68632c60758fef05e031`. Durable log: `.relayer/legacy-compatibility-evidence/p0-check-node22.log`; result and environment: `verification-node22.json`. This supersedes the earlier aggregate failure: Rust workspace and graph crash checks, builds, TypeScript/workspace checks, broad Vitest, Codex secret-boundary tests, Python tests, receipt lints, and PRD readability all completed successfully. The previous disk exhaustion, Git deadline, and Node 26 network-permission failures are preserved for diagnosis and are no longer open verification blockers.

The accepted human gate and source-scoped adversarial review remain valid because executable source did not change. No required deterministic verification gap remains for this temporary containment change. Live provider proof is not claimed or authorized. The next workflow step is a local commit and subsequent separately authorized PR/integration work; no push, merge, release, deployment or production-data change occurred.
