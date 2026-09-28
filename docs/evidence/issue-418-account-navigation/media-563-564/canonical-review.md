# Canonical Mac supervisor review

Reviewer review_418_plus. **BLOCKED for launch preparation** at supervisor SHA256 `59bf1b4d6c0988fe7bb919d5d6756f8bfb77ea6e1a5d9c53196bcb0744b00721`, external `/Volumes/2T-SSD/evidence/temp/factory-418-navigation-repair/run-canonical-mac.py`. Read-only source review; no launch.

1. Expected index tree is checked, but unstaged tracked changes are not rejected. Matching pre/post receipts can therefore label execution of different worktree bytes as exact-tree proof. Require clean index/worktree agreement before launching.
2. Per-step cleanup return is ignored. A surviving group can be replaced by the next step's active_pgid. Failed timeout cleanup can also run20s and repeat20s in finally, exceeding30s reserve. Stop further launches on failed cleanup and enforce a shared absolute cleanup deadline. Poll/reap exited direct child while checking group existence to avoid zombie-induced false-alive results.
3. The comment promises grant revalidation before either gate, but grant_snapshot only runs before the loop. Revalidate owner/tree/cutoff before build if retaining that requirement.

Serial check/build commands, pinned runtime, separate logs, source receipts, signal finally handling and explicit timeout failures otherwise fit the intended scope. Actual inner canonical results still require later review; command exits alone are not a substitute.

## Revision1e8ab529

Source/grant revalidation, direct-child reaping and stopping after failed cleanup now address the original defects. Remaining preflight correction: cleanup deadline must additionally cap each owned group's cleanup at now+30s, while retaining that same deadline across finally/retries. Current min(started+900, initial grant cutoff) can wait nearly15min for an early orphan. Use the active gate's cutoff (conservatively bounded by initial grant) as well, because the per-gate refreshed grant may be shorter. Requested these narrow corrections from implementer; no launch approval yet.

## Final supervisor preflight

Reviewer `review_418_plus`: **preparation PASS; identified blockers resolved** for external supervisor SHA256 `f523796e7f24ec582ebabdb22af5c3dc93efceb0d5cd562e7ad1b3c83fa120c9`. Independently checked final source and hash. Tracked unstaged changes are rejected; each gate revalidates exact source and owner/change/worktree/tree/cutoff; active grant is assigned before launch. Cleanup polls/reaps the direct child and shares one deadline bounded by now+30s, start+900s, initial grant and active gate cutoff. Failed cleanup prevents another launch and finally does not reset its deadline. Serial logs, source receipts, signal cleanup and failure reporting retained.

This permits preparation for a matching coordinator-authorized grant, not a canonical outcome claim. No tests launched. Actual check/build inner logs, final receipts, deadline and process-group outcome require post-run review.

## Credential-isolated canonical preparation

Reviewer `review_418_plus`: **source preflight PASS** for external supervisor SHA256 `7caf0d581ac251d559ccd45bdfbd45d5c1c512dca081bdc9e8cd7226c08c04c3`. Removing only the added credential scrub and name-only receipt fields reconstructs prior reviewed f523796e hash exactly. Four known provider credential variables are removed from the child environment; values are neither logged nor changed in the parent. Grant, cleanup, commands and source binding remain identical.

Independently read canonical-mac-1 result: exact37be64 unchanged, check exit1 and build exit0, groups cleaned. Diagnostic log records inherited ANTHROPIC_API_KEY by name, auth=true and selected anthropic; targeted1 remains exit1. These support environment contamination as a concrete explanation, but do not establish the proposed clean correction passes. Reported clean auth probe was not independently inspected here. The default deterministic suite should not inherit live provider credentials; this correction does not waive assertions. Require the planned clean targeted result before interpreting diagnosis as confirmed, followed by complete corrected canonical evidence. Earlier failed logs remain failures, not superseded passes. No runs performed by reviewer.
