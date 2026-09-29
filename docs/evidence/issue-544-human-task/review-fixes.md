# PR #581 review resolution

This report supersedes combined-source verification for commit c47e9006 only for
the changed seams below. Earlier reports remain historical evidence. The merge
was blocked by unresolved review threads, not failed CI. No branch rules are
bypassed; threads are resolved only after their findings are addressed.

## Checkpoints and scope

Product authority: PRD 13.2.2, HUMAN-001 through HUMAN-004, profile-isolated
credentials, ordinary production retry semantics, and immutable evidence.

| Review finding / changed seam | Deterministic production-seam checkpoint |
| --- | --- |
| Initial reserved dispatch loses response | Human task service marks interrupted/unknown and retains spent budget; no success inferred |
| Retryable failed interaction cannot recover | Scoped retry admission, original model pin, fresh-attempt budget and replay accounting; failed unsent attempt does not deadlock finish |
| Live native annotations unavailable | Actual product annotation registration, owned-thread token, no general write cookie; browser save/reopen/export |
| Model validation gets read-only credential | Exact validation route uses serialized task control path with original harness/model constraints; real product browser call |
| Failed finish duplicates step checks | Export failure restores step-check count alongside grades/status before retry |
| Human steps silently select new models | Actual EvalService thread creation keeps initial route across steps |
| Existing Codex configuration permits shared login | Existing config must match owned file-auth configuration; reject safely before native adapter use and preserve bytes |
| Interrupted running work cannot export | Interrupted bundle is exportable and explicitly declares missing frozen conversation evidence |
| Configuration-owned harness rejected | Actual product harness descriptor retains configuration-owned route without generic family selection |
| Failed grade persistence commits in memory | Restore prior satisfaction/history; retry commits once; moment annotations also roll back |
| First visible timing belongs to wrong step | Match observed interaction to its own submission timestamp |
| CI misses explicit family-editor test mapping | Production affected-plan result explicitly names family refresh regression; new human-model regression mapped too |
| Session listing copies frozen conversations | Summary excludes full conversations, checks, annotations, grades, and response timeline payloads |

Service checkpoints use `test/eval-human-task.test.mjs`; provider/model checkpoints
use `test/eval-provider-setup.test.mjs` and `test/eval-service-human-model.test.mjs`.
Gateway and real UI proof use `test/eval-web-host.test.mjs` and
`npm run test:eval-web`. CI mapping uses `test/ci-affected-plan.test.mjs`.
No tests were retired. Full check and build are required before committing.

The old broad CI selection included the test directory; the mapping fix makes
the missing explicit regression ownership durable rather than claiming all prior
CI omitted the test.

## Intentional limits

Unknown dispatch can lose the created thread ID. Preserve the unknown outcome,
spent budget, and missing evidence instead of fabricating a recoverable ID.
Unsafe or customized existing Eval Codex config files are preserved and rejected;
this conservative check does not parse or rewrite arbitrary TOML.
External-catalog human authorization remains the previously documented scope gap.
No paid inference or real credential login is part of these regressions.

## Verification results

Targeted red regressions reproduced the reviewed failures. Focused service/host
checks passed 35 tests; provider/model checks passed 63. The reviewer also found
retry-response timing and initial finish-persistence recovery gaps. Those were
fixed, along with pre-dispatch write reservation rollback, before source freeze.
The gateway author's browser run passed all five chapters using older private
binaries; it is not the final current-native snapshot proof.

Final `npm run check` passed with bounded workers: Rust formatting, Clippy,
workspace and crash tests; package/workspace/type checks; 3,063 JavaScript tests
(three skipped); two secret-boundary tests; 59 Python tests; receipts and PRD
readability. `npm run build` passed afterward. Current-native `npm run test:eval-web` passed all five chapters, including live
native annotation save/reopen/export and semantic model-validation response.
App binary SHA-256 `20956f9009bf5328c9fe0d489876fc6ba24cd7d11d02e477a73dea0a56fd3ff4`;
graph binary `d2f3e6223e93f5df590dc68b5a004b5350f54cadbd24f8988ea8f8e28b94be64`.
`git diff --check` passed. Final source reviews below are clean in their scopes. Frozen 12-file source/test/config delta (excluding evidence docs):
`34fa6b9584418f2029c56816c0ccf820f8892ca184c2104c6c1040b10c5817d3`.
Digests use sorted relative path + NUL + bytes + NUL.

Reviewer `/root/slice1_authority` independently reviewed model pinning,
configuration-owned routes, credential fail-closed behavior, and CI mapping.
No blockers in six-file scope at digest
`c490afa063711b345dbcea277d7e13377e8a52b5d7c83150fbb945512aa5844c`:
eval-service, provider-setup, eval-service-human-model test, eval-provider-setup
test, affected-modules.v1.json, and ci-affected-plan test. Tests were not
independently rerun by this reviewer; the 63-test result belongs to the author.
Source edits invalidate these assertions.


Reviewer `/root/provider_backend` independently passed all 35 service/host tests
and found no unresolved findings in two scopes:

- Human task service and its test:
  `cad1ae71579bf63086fbf87fe464166fd837bd8194e4abf9effcd0aedc6218a7`.
  Covers retries, latest submission timing, unknown writes, interrupted export,
  reservation/finish/grade/annotation rollback, and summary size.
- web-host, index, eval-web-host test, and browser runner:
  `6d5273b7ab820a5ff16552a0df1968c81cfa272f9c7443e1e18de377ab8ee9a8`.
  Covers scoped annotation cookies, foreign-write rejection, serialized model
  validation, and browser native annotation save/reopen/export checkpoints.
  Browser evidence is separately run by the parent for the final native snapshot.
