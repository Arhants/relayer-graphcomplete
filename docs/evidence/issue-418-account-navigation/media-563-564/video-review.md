# #563/#564 video preparation review

Reviewer: review_418_plus. Verdict: **BLOCKED for launch preparation**, source review only; no execution or repository edits.

Reviewed external files under `/Volumes/2T-SSD/evidence/temp/factory-418-navigation-repair/video/`:
- prepare-video-runner.py SHA256 `4b69adafdea010af9c812e9ecccff715f90b9bad8942c6a17aaa2e63f1ee0ede`
- run-navigation-video.py SHA256 `a6db242b0f0228880375c415e9fa2beacd90fe41f32216e9fd96208eb5a33eef`

Concrete findings:
1. Preparation line61's Python raw string emits JavaScript double-backslash-n separators in ffconcat. Generated sample line154 confirms literal backslash-n output rather than newline-delimited concat records. Use single JS escape inside the Python raw string. Correct absolute frame paths alone do not repair this.
2. Finish replacement anchor line84 assumes old result object without scheduling metadata; regeneration from dfda73e will fail. Insert capture completion without stripping the new scheduling/visibility limitations or existing result fields/assertions.
3. Wrapper owns process group and performs TERM/KILL after normal completion/timeout, but has no enclosing finally or signal cleanup. SIGTERM/KeyboardInterrupt or an exception after Popen can bypass cleanup, leaving detached Electron/ffmpeg children. Add bounded cleanup for those exits before claiming absolute grant cleanup.

Otherwise, design retains checked-in assertions through exact-anchor derivation, verifies source tree/runner and derived-driver hashes at launch, rejects unstaged changes, requires matching coordinator owner/change/tree/worktree and cutoff, and checks inner result/timeline instead of outer exit alone. Frame loop is single-inflight with measured monotonic durations;650ms marker holds are actual live waits. Terminal median frame repetition is explicitly disclosed. Scale/pad retains aspect ratio without upscaling. Normal path reserves15s for group cleanup inside180s/grant budget.

Prepared sample is historical7a2493. Regeneration and inspection of final derived diff/manifest are required after repairs and final source freeze. Fresh native outcome is separate; media is supplemental and cannot replace canonical/native evidence.

## Corrected template review

Reviewer `review_418_plus`: **preparation design PASS; prior three blockers resolved**. Reviewed corrected generator SHA256 `5afb468b4a59bce416f34ccdda451374b9a07728088178dd6bcd6bbd41884a69`, wrapper SHA256 `bfa121aee4ee7bb9aac187a4e81107230ad9b059c9a4653348309276eef2b9ae`, generated dfda73e driver SHA256 `237cd5a939fc3cdb1bf95cbd09548d7f55405f828593f3653640e9f9c6533033`, and recorded derivation patch. Generated concat now uses actual newline escapes; result replacement retains scheduling limitations and original assertions; wrapper handles INT/TERM and exceptions through finally with bounded group TERM/KILL and ignores repeated termination during cleanup.

Single-inflight measured frame timing, disclosed actual marker holds/terminal frame, no-upscale canvas and prelaunch grant/hash controls remain. This is preparation approval only. Generated source is dfda73e, now superseded by3fd528; regenerate after final source passes, inspect refreshed hash/diff binding, and obtain the exact coordinator grant before launch. Actual video/inner result/cleanup/timing and representative frame inspection remain pending. No launch or tests performed by reviewer.

## Final145657 derivation verification

Preparation PASS bound to145657379a2092493d2a5718e225b55d6bee8522. Independently recomputed and matched source-runner SHA256 `eb6a58f47799ca5cb2b514df3eab9f119cc0142a62ad15fe2a2758d9ae513f45`, derived driver `2f98d48d9c91470a5aa6c64be1a38dd719be8a037024fa88b8845b24d1abd16b`, delta `600d55fc79d469bf5cf6a1f471b1cf9fa992b05bd4d788a39e661304bc231398`, and unchanged wrapper `bfa121aee4ee7bb9aac187a4e81107230ad9b059c9a4653348309276eef2b9ae`. Reviewed actual derivation removals/replacements: module paths/bootstrap, capture-marker wrapping and augmented result only; original assertions and scheduling metadata retained. Final draft-readiness/current-wheel corrections present. Capture is supplemental and unexecuted at review time; exact grant still required.

## Rebinding37be64

Reviewer `review_418_plus`: **video derivation preflight PASS** for tree `37be64cdfac01fad4301bdba717621bafe757341`. Recomputed source-runner SHA256 `20c130f8ebaaa70a4c470aff03a3d856bac55d525f64591ea00fd6006cdfb15a`, derived runner `8c4d692f3b452386b7666a110392a233e496ec64d9e77cf74da86bd91ad2534f`, delta `ab2668ac61e5e95dbe64698bc896f8049a7af31c4a6dacdfee9d65269a27faf3`, and unchanged wrapper `bfa121aee4ee7bb9aac187a4e81107230ad9b059c9a4653348309276eef2b9ae`; all match manifest. Actual source-to-driver diff removes no assertions. The new non-vacuous annotation/Turn2 overlap, native click/exact selection, and closed-badge hit assertions are preserved verbatim. Previous timing/input/foreground scheduling limits remain. Native pass and exact fresh grant are prerequisites; video execution/media verification still pending. No execution or repository edits.
