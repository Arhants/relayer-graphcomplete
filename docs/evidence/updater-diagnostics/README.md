# Updater diagnostic gap

Product authority: PRD §10.2 and §10.3. The September 30 user decision is to
fix the diagnostic gap after an intermittent MacBook retry failure. The earlier
failure is not reproduced; this change does not claim to fix its unknown cause.

## Changed seams and checkpoints

| Promise / failure boundary | Changed production seam | Deterministic checkpoint |
| --- | --- | --- |
| Settings and update prompt explain the failed operation and show an approved code; retry clears it | `services/updater.mjs` → renderer `updates.js` | `updater-diagnostics.test.mjs`: real service events/rejections through production DOM renderer, check/download/install and retry |
| Raw messages, request data and arbitrary codes never enter renderer state or history | `services/updater-diagnostics.mjs` | Same suite: credential-bearing exceptions, unknown code/status, Electron `net::` error, strict file record projection |
| History survives reopening, stays within 256 KiB, and keeps only phase/attempt transitions | updater → local bounded writer → `index.mjs` | Same suite: event plus rejection deduplication, real-file reopen, eviction, JSON validity and mode 0600 (smaller injected bound) |
| Storage rejection does not alter updating | updater diagnostic adapter | Same suite: synchronous and asynchronous storage failures leave successful discovery idle |
| Manual discovery does not misattribute a later download failure; asynchronous install errors retain their operation | updater operation ownership | Same suite: download/progress/discovery/error sequence and native install error event |
| Late install failure gets a bounded flush before forced exit | `update-restart.mjs` → `index.mjs` recovery callback | Same suite: real install failure record after recovery; `desktop-update-restart.test.mjs`: flush/relaunch/exit ordering, rejection and hang budget |
| Every packaged module remains in the sealed stack inventory; handled updater failures remain outside telemetry admission | `shared/telemetry-module-inventory.mjs` | `desktop-telemetry-module-inventory.test.mjs` and `npm run evidence:telemetry` |
| Existing renderer evidence remains bound to the actual served source | desktop social preview receipt and captures | Regenerate with `npm run evidence:share-preview`, inspect captures, run `desktop-social-preview-evidence.test.mjs` |
| An unrelated worktree fixture deterministically has no available default, regardless of developer Git defaults | test fixture only; production worktree code is unchanged | Existing `worktree-service.test.mjs` scenario uses a local default absent from fixture refs; its rejection, changed-base and recovery assertions remain intact |

Warm loop:

```sh
fnm exec --using 22.23.2 npx vitest run test/updater-diagnostics.test.mjs test/managed-runtime-updater.test.mjs test/desktop-update-restart.test.mjs
```

Required deterministic handoff gates: `npm run check` and `npm run build` with
the pinned Node version. Existing desktop-shell updater scenarios also cover
polling, protected staged updates, forward-only channels and monotonic progress.
The verification portfolio has no specific assignment for the new diagnostic
module, so the full check is the deterministic fallback.

Visual acceptance uses the real shell HTML/CSS and production renderer in an
isolated Electron fixture, with no account, user data or network update request.
Run `npm run test:desktop:updater-diagnostics` once before handoff. It observes
check/download/install failure details and the retry action at 1100px and 375px,
then saves screenshots and independent scenario results under
`.relayer/evidence/updater-diagnostics`.
This is renderer evidence, not signed packaged updater proof. Signed discovery,
download, signature verification and updater canary belong to a separately
authorized Preview or Stable release. No paid inference is needed.

Local history: `<Relayer userData>/logs/updater.jsonl`, at most 256 KiB. Handled
updater errors stay local and do not change ADR 0009 telemetry admission.

## Evidence

The initial DOM regression failed with Settings showing only “Couldn’t check for
updates” instead of the failure code. It passed after the production change.
An early broad desktop-shell invocation had three unrelated stale generated
harness-package failures (`Unknown graphCapabilityProfile field: preview`).
Package outputs were rebuilt before the final gates; those failures remain part
of the verification history.

The first full check passed Rust/package/type checks but failed three JavaScript
cases: the new module needed a sealed inventory entry; renderer changes required
fresh social-preview evidence; the unrelated worktree test inherited a global
Git default after unsetting its local default. Environment flags alone still
failed because the worktree service intentionally removes `GIT_*` variables.
A temporary Git wrapper passed the seven worktree cases but broke five Rust
cases that intentionally exercise global Git settings. That approach was
discarded. The single fixture now sets an explicit local default that is absent
from its refs; no production worktree behavior or assertion was changed. Final
gates run with the normal environment. The user's Git configuration is unchanged.
