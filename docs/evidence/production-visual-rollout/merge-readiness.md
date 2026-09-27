# PR500 merge readiness

## Required verification

Integrate main at 76bfe5fe without changing canonical Complete, native recursion,
publication authority, or historical presentation pins. Resolve two demonstrated
merge blockers: duplicate migration 32 and an incorrect packaged Prime closure pin.
Theme-aware visual output is a separate follow-up, #519.

Changed seams:
- Migration33 publishes V4 after main's migration 32 for Stop requests. Existing
  migration/reopen and presentation pin tests observe upgrade compatibility.
- The packaged Prime closure pin must describe actual Electron output. Package
  manifest, runtime verifier and managed recipe must agree; integrity remains
  fail-closed. The existing real target-ASAR packaging job is the required
  packaging proof. Diagnostic assembly is only a root-cause tool.
- Integration of main's Stop/recursive lifecycle changes requires the full
  repository check/build plus real Prime KernelManager and product fixtures.

Required gates: npm run check, npm run build, native KernelManager integration,
current-head CI including actual macOS packaging, and independent standards/spec
reviews of the final PR diff. Prior live evidence remains bound to its recorded
source, model and prompt; integration tests do not retroactively change it.

## Migration and local integrity repair

The two migration 32 files collided in GitHub's merged snapshot. V4 is now 33;
main's previously published migration is unchanged. Focused personal-presentation
checks pass 8/8 and persistence/reopen passes 1/1. Earlier dev-only V4 profiles that
already applied the old migration 32 remain tied to their original snapshot;
no user databases or migration histories were rewritten.

The local Cargo failure was eight generated .cache entries inside the resolved
lbug source tree. All 2,770 archive files were byte-identical to the locked crate
SHA256 f52ee74966e323212747aa22fa8c01f73f1cbbb996187c3b08cbf96ff9f67562.
/root/cargo_integrity independently verified this and the source-build flag that
prevents cache regeneration. Only the generated cache was reversibly quarantined;
no integrity exclusion, source pin, or target artifact changed. Default-Cargo
artifact verification now passes 14/14.

## Packaging provenance

/root/packaging_provenance reproduced the CI digest using production Electron
assembly/filtering with extra resources and verification hooks disabled for
inspection only. Compared with the retained manual inventory, all 12,128 common
unchanged entries match. Two package.json files differ only by Electron's metadata
pruning (pi-coding-agent scripts/keywords; nested marked bugs/keywords/tags/scripts).
Six files from nested strip-ansi7.2.0 and ansi-regex6.3.0 were missing from the manual
inventory. Their code/license bytes and runtime metadata match the locked installed
packages; both dependencies already existed before the main integration.

The actual 12,136-entry packaged closure is
1253fd136c0d63e751fffdae68327a1b5cbb3176f2b9780de372744f8b83ef41.
The manifest, verifier and recipe now pin that reviewed inventory. Repository
closure 02f15fb2ce6366f1e9709e66336a94476dc6605bb8618885afea9e7d2e19766f
is unchanged. No dependency version or runtime code changes for this repair.
The eight-file before/after hash inventory is retained beside this receipt.

A diagnostic repeat after npm ci produced an unreadable ASAR in the reused output
directory; it is not counted as proof. A brand-new output directory after the fresh locked install reproduced the exact
12,136-entry closure successfully. Actual current-head CI packaging remains required. No signing or release claim.

The actual verifyPackagedPrimeAgent(resourcesPath) then passed on that fresh ASAR
with copied production resources, without stubs or digest overrides: all four
vendor packages, metadata, archive/tree hashes, harness/Python resources, closure,
required entries and development-artifact exclusions passed. Full native afterPack
and CI remain the final packaging gate.

## Final checks and reviews

/root/ready_standards and /root/ready_spec independently reviewed all 72 changed
non-evidence files against main 76bfe5fe. Both report no unresolved actionable
findings. Exact source digest (sorted path + NUL + bytes + NUL):
160945547fa9d1dca517ab8ef625f9ff15d2fadc73019e6391cc93b819e913b0.
Neither independently ran tests. Scope includes defaults/pins, native retry,
compiler/assets authority, publication, Stop integration, migration and corrected
package pins. Reviews do not certify unrun CI, scoped compaction, native-child
behavior or live image inspection. Historical Codex evidence used GPT-5.6 Sol/V3;
Prime's accepted live result used 5e99a302. Neither is a final-candidate GPT-6 claim.

The first integrated full check passed Rust/Clippy/crash/type stages and 2,439
Vitest cases, then 9 Stop fixture cases failed because main's injected Prime
session lacked the native reasoning-state interface now required at startup.
Adding agent.state.thinkingLevel and appendThinkingLevelChange to that fixture
restored all 12 Stop cases without altering behavior or assertions. Both reviewers
reviewed this final delta and renewed the digest above.

Final aggregate check passed Rust format/Clippy/workspace/crash, package/type
checks, and all 2,448 Vitest cases (3 skipped). The separate native Codex
secret-boundary stage then failed only in teardown with ENOTEMPTY inside a
background plugin-clone .git directory; its assertions had completed. The
aggregate remains failed, not retrospectively green. An attempted isolated
rerun overlapped package rebuilding and failed setup; excluded from proof.
After build finished, the unchanged isolated native Codex suite passed 2/2.
Remaining Python 34, receipt lint and PRD readability stages passed separately.
Final npm run build passed. Real Prime KernelManager integration passed 2/2.

Current-head CI, including actual macOS native packaging, is pending at commit;
its exact run and conclusion will be recorded in the PR without changing source.
