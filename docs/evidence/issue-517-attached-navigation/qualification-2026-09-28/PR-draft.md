# Draft PR preparation — not published

Suggested title: Add gated persistent attached navigation and B3 interaction graph

## Behavior

Behind the existing default-off interaction-permissions gate, an exact attached native node can receive persistent expand/reference actions. A dedicated revisioned presentation API can stage a full compiled Node Detail replacement preserving every old/new control. Terminal acceptance publishes the response, actions, presentation and assets atomically across native occurrences; stale replacements require repair. A reference can target the same interaction's new response root. Shared/imported reads do not confer mutation authority, and mutated conversation export remains explicitly unavailable pending portability work.

The gated banner uses the B3 interaction graph, built from canonical context-layer owners and immutable invocation origins. Selection closes the popover and loads the selected response root, including current-interaction selection from a descendant. Default-off navigation and the read-only public viewer retain their existing turn selector.

Related: #517. Based on PR536 head `015e5058a25b7f191da3a3addf56454d0e34b6d0`; do not merge automatically or alter PR536.

## Verification and blockers

Required plan and seam mapping: `docs/evidence/issue-517-attached-navigation/README.md`. Detailed logs, snapshots and screenshots: `qualification-2026-09-28/`.

- Final build: PASS. Focused production core, route, Product projection, real Ladybug reopen, renderer/client, packaging and viewer checks passed on the documented snapshots.
- Final nonpaid gated/default desktop, context lifecycle, project/layer-selection restart, public viewer and compiled Eval results are recorded separately. Desktop runs use the declared non-native-input mode; screenshots are deterministic fixtures.
- Latest `npm run check`: **FAIL**. All preceding Rust and 2680 JavaScript tests passed, but the unchanged native Codex secret-boundary probe reported provider-variable presence in a model-requested shell. An isolated unchanged run later passed 2/2; it does not clear the failure. Root cause remains **UNKNOWN**. No assertions or runtime policy were weakened.
- **Live demo NOT RUN.** No model-authored replacement, real attached-context B3 walkthrough, live navigation/reopen execution-count proof, native keyboard/account proof, or human approval is claimed.
- Rich compiled detail plus a new unbound action without HTML replacement remains an unapproved product choice. The gated provisional behavior fails closed; this does not complete AN-003 for that case.

## Independent review assertions — non-certifying until a PR/source is pinned

Parent chat `01a0d9c7-e4af-7112-a0f6-92226b2a4201` coordinated independent Spec and Standards reviews of 52-file digest `1c5bf9f952bbb5834e60c898c9948a42612380ed832959f29fa7010b72b24572`. Both returned PASS with no new actionable findings after fixes. Spec inspected source and focused logs; Standards performed static review. The parent then verified documentation-only changes and unchanged executable hashes at digest `29eeda14452e722400023f2482855a4f0b573122b8592bce336152daaea20b01`.

Reviewed scope: attached authority, atomic acceptance, response-root references, package-wide matching mount uniqueness/runtime host compatibility, staging cleanup, affected-occurrence publication, B3 ownership/selection, and secondary packaging/viewer mappings. Remaining boundaries: latest native process failure, provisional rich-detail choice, unrun live/native/human proof. Evidence-only additions after the last frozen source require a final metadata review; these assertions do not certify an unpublished final commit.
