# Verification results and experimental desktop handoff

Source manifest: `final-source-manifest.json`, SHA-256 `f600ad0cbda6dea61cf49a0d414819b6d6dfabd4af000b24be7898c345e914c4`, 31 paths at base `c1db3d10825183c5ab7209b3abd22ef2ef7bbd97`. All hashes were checked again at handoff with no mismatch. Evidence files in this directory are separate from that manifest.

## Required plan versus actual results

| Required checkpoint / command | Actual result and evidence |
| --- | --- |
| Omission, target, repair, compatibility and rich bindings | Three new real core scenarios passed, `core-focused.log`. Response-only regression first failed against prior behavior, `red.log`. Final full workspace run includes all 100 graph-database tests. |
| Prompt delivery | 133 focused tests passed, `prompt-focused.log`; includes actual Codex boundary and shared input serialization. |
| `npm run check` | Exit 0, `full-check.log`. Rust workspace and crash-support stages pass; 207 JavaScript files / 2,684 tests pass, one file / three tests skipped; dedicated credential-boundary two tests pass; Python 43 tests pass; native receipt and PRD checks pass. Production sources stayed unchanged throughout this run. Final fixture session partition was in place before the JavaScript phase; the full command does not execute the gated desktop journey. |
| `npm run build` | Exit 0, `build.log`, after full check. No rebuild after launching the persistent inspection app. |
| Interaction-context lifecycle | Declared runner `node scripts/run-interaction-context-lifecycle-test.mjs` after build: exit 0 and inner lifecycle pass marker, `context-lifecycle.log`; zero paid inference calls. |
| Compiled Eval runtime | `npm run test:eval-compiled-runtime`: exit 0, three tests pass, `compiled-eval.log`. This is recursive runtime entry-point proof, not new-button UI proof. |
| Gated first-message with new button | **Indeterminate / failed capture run.** `gated-capture-recurrence.log`; no successful current-source inner new-button markers. Earlier fixture and capture failures are retained individually. |
| Default-off first-message and project restart | **Not rerun on final source.** These remaining windowed scenarios were held when the user requested a persistent inspection app, so test windows would not take focus from that handoff. Earlier-source results do not certify this change. |
| Independent review | Source-bound non-certifying assertions in `review-assertions.md`. No remaining static Spec/authority, Standards or renderer-mapping finding; this does not override missing assembled evidence. |

## Capture boundary

On the final attempted gated capture source (`234f2b...`, before the last session-isolation correction), last successful artifact was `.relayer/evidence/required-navigation/gated-canonical/05-revisited-source.png`. The subsequent ordinary Product root screenshot was absent. The native `UnknownVizError` has no stack; capture order and the produced files identify that interval, before B3/Eval/new required-button checks. The corrected final source is `f600ad...`; its separate Eval partition was not run through that journey.

An earlier superseded fixture produced `.relayer/evidence/required-navigation/gated-ready/12-required-product-button.png`, visually showing the new button and preserved control. Its subsequent predicate incorrectly required a turn-text switch. That image proves neither canonical destination nor Eval/reopen navigation. Ordinary reference navigation retains the source presenter; the final fixture correctly asserts exact canonical response-layer and rendered node IDs. No assembled Product/Eval/reopen pass is claimed.

The one unchanged capture retry passed the earlier failure point, then exposed a fixture readiness issue. Capture root cause remains unresolved. When `UnknownVizError` recurred, further gated capture retries and diagnosis were stopped as instructed. No timeout, assertion, or capture was removed to turn a failure into a pass.

## Persistent inspection instance

The user requested a visible app for inspection. A separate normal Desktop instance was started from the isolated checkout, with the new gate enabled, after check/build completed:

- App: `.relayer/desktop-launchers/Required Navigation Demo.app`
- Desktop PID at handoff: `43909`; app-server PID: `43980`
- Product origin: `http://127.0.0.1:59885`, HTTP root confirmed 200
- Profile: `.relayer/manual-required-luna`
- Exec session: `24070`, left running
- Managed Codex `0.147.0` runtime bytes copied from the verified prior installation and validated with the repository installer. Credentials were not copied; the supported existing Codex home was reused.
- Electron executable byte hash matched the installed trusted Electron binary.

This is an **experimental inspection handoff**, not a completed visual qualification. The parent chat owns raising the exact app and selecting Luna. No inference or submission was performed by this implementation chat.

The old manual desktop PID `15392`, profile and origin `55985` were preserved. Its 17-file source manifest still matches. Both PIDs were alive at handoff. No commit, push, PR metadata mutation, merge, deployment or release operation was performed.
