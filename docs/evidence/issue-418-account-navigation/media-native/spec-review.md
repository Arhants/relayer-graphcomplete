# #477 composer/approval repair — provisional SPEC review

Reviewer `/root/review_418_final_spec`; inspected moving seven-file repair versus b88dfa57 in factory-418. No frozen-source assertion, source edits or heavy runs. Final adversarial review must bind the frozen source and actual proof.

Composer source/mapping is substantially repaired: full four-edge parent containment replaces horizontal-only claim; actual DOM mutations translate parent and children above/below viewport, proving child containment cannot establish viewport containment. Native Thread controls and375-expanded New Thread controls are individually scrolled and intersected with every overflow-clipping ancestor on both axes. This preserves approved vertical scroll while requiring real control reachability. Positive/rendered checks remain; expected control arrays are explicit.

Approval CSS uses actual workspace width <=600, stacking header/queue, metadata/action rows and three decision buttons. It preserves Deny, Approve once, Approve always and the session qualifier. No approval handler or capability/authority behavior changes. Reusing the real native approval runner with three pending requests is appropriate: existing held-decision, scope, request-selection, denial/history and provider observations protect real authority boundaries rather than a second mock approval implementation.

## Current mapping findings sent to implementer

1. Approval overlap audit compares rectangles collected after separately scrolling each control. These viewport coordinates may refer to different scroll positions. Measure overlap at a common offset, or normalize all controls to stable dock/content coordinates; keep per-control scroll reachability separate. Current comparison can report false overlap or miss actual overlap.
2. Approval reachability checks viewport and dock rectangles but not all clipping ancestors. Reuse the composer ancestor-clip intersection so a hidden/scroll-clipped parent cannot make a positive-size button pass.
3. Reason/action/cwd/scope checks currently assert only nonempty strings; they do not prove readable/reachable approval context. Scroll/check these rendered values and the “this session” qualifier, especially at165px workspace. Include realistic content already supplied by the native fixture; extend only if its content cannot exercise wrapping.
4. All decision clicks currently occur at1280 after narrow checks. Move the existing approveAlways dispatch before resizing back (at620) to prove the narrow composed action reaches existing real authority flow, without duplicating scenarios. CSS-only source preserves authority; this is a composition checkpoint improvement, not evidence of an authority regression.

Pending proof must show the actual native viewport375×640 collapsed/expanded and620 expanded, no horizontal clipping, per-control reachability, stable selected request/pending set through resize/queue navigation, and readable session scope. Preserve diagnostic failures and do not call outer exit alone a pass. Final reports for b88 remain historical while these findings are open. No merge clearance from this provisional review.

## Focus diagnostic scope assessment (source still moving)

Native focus failure is credible: boot refreshes Product state before desktop-account reveal; appShell initially has `hidden` and body `desktop-account-pending`. renderApprovalDock's first focus attempt can occur while hidden and its later same-request render does not repeat the focus condition. Timing remains to be instrumented; no unique cause certified. No explicit PRD sentence for automatic pending-dock focus after startup was found, but the behavior and existing focused-dock runner assertion must not simply be skipped.

Root proposed removing only the redundant second openThread reload after the first pending approval, allowing the already visible production workspace to receive and focus a live approval. This is acceptable as the narrow-scope fixture correction **provided** the focused-dock assertion remains and a genuine production update path observes the new receipt (no synthetic .focus or fake approval rendering). The later existing openThread with three pending requests must remain: docs/prd/assets/evidence/ask-profile-approval/README.md explicitly maps reload to deterministic tests, and that later scene preserves pending-reload queue hydration/authority. Subsequent resolved reloads preserve history/receipts. Require visible-shell readiness rather than only thread markup presence.

This separation does not fix or certify automatic dock focus when loading an already-pending approval at startup. Preserve that failed attempt and limitation explicitly; live-arrival success cannot be renamed reload-focus success. A future production fix would defer the existing focus intent until actual reveal, revalidate request/thread and avoid stealing real user focus. No production focus rewrite is required merely to test the current narrow-layout repair if the preserved reload/authority mapping and live focus checkpoint both pass.

## Frozen source review — 11e23dbf086f8e1aacd20a16f8ffa4a3bdd39c5e

Reviewer `/root/review_418_final_spec` verified staged tree identity, HEADb88dfa57 and the eight-file repair diff. **Source/mapping PASS for composer vertical containment and narrow pending-approval reflow, conditional on final frozen-source execution.** Earlier provisional geometry findings are resolved: overlap rectangles are now captured at one common scroll state; per-control and context reachability intersect viewport with every clipping ancestor; long reason/command/working-folder/scope and session qualifier are checked; the three enabled decision actions are simultaneously contained and separately captured. Approve always and subsequent denial occur at620 before returning to1280, preserving the existing real approval authority observations.

The fixture now uses a longer build command consistently for source, pending exact match and future grant consumption; opaque scope keys and distinct deploy near-match remain unchanged. A real long temporary project path exercises wrapping. Local account/draft/share IPC repairs setup only; external navigation and publication reject. No product approval handler/capability/decision policy changed. Actual CSS reflows against remaining workspace width, retaining all three labels and session scope. Inspected focused-12 expanded375 actions screenshot: all three are fully visible together, distinct, and the “THIS SESSION” qualifier remains readable. That focused image is diagnostic support, not a final canonical pass.

Focus/reload judgment: first live pending receipt is read through the real production `threads.refreshState` while the existing thread is open; no test-injected focus or fake approval render. Existing native focused-dock assertion remains. This proves production reconciliation can deliver live focus, not autonomous polling detection. Later three-request pending reload and resolved/history reloads remain, preserving their separate hydration/authority boundaries. The startup hidden-shell pending-approval focus failure is explicitly retained in README history and remains a limitation; it is not fixed or certified by the live-focus checkpoint. `openThread` readiness itself still checks thread markup rather than explicit shell visibility, so the focus assertion is the actual gate in this fixture; do not broaden the claim to startup readiness.

Final15-stage source-bound proof is running and not yet reviewed. No source edit or heavy run by reviewer. This exact source assertion must be rebound if the staged tree changes, and final execution/commit identity must be appended before handoff.

## Integration binding update — b78e747

The approval/composer repair is byte-preserved in frozen combined tree `b78e74783435ce787e2aa9f53224bca63d61029c` with latest main92a89d6a. Reviewer verified source/mapping PASS in the companion `factory-418-17b50d95-integration-spec.md` (latest appended section). Pending frozen-source gates and all prior approval startup-focus/evidence limitations still apply; no new runtime proof claimed.

## Final c3ed proof binding

Companion integration report now records final source/mapping PASS for `c3ed0fe9e6d734cfb445afdadfef854835ad163f`, explicit reuse of unchanged b78 canonical/non-theme execution, and fresh c3ed native sidebar58/approval3/mutation19/theme/capture proof. Final375 expanded action screenshot inspected. New mainf807 Models/Settings composition requires targeted combined proof; it is not covered by this source assertion. Startup pending-reload focus limitation and all previous failure history remain. Commit binding pending.

## Final commit binding

Final scoped review is bound to clean commit `695b6fa9ffa70e20c1e3a9b4f24a074e864f627b`, tree `d41f8895ed3298f7e8cbf8ebba15d6ff80367c67`. Companion integration report records fresh exact-d41 Linux check/build, composed targeted Models proof and explicit reuse of unchanged c3ed/b78 scenarios. SPEC/integration PASS within that documented scope; startup approval-reload-focus and historical failure/evidence limits remain unchanged.
