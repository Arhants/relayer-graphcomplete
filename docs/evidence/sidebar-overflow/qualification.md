# Merge qualification follow-up

The original `verification.json` remains the historical pre-PR attempt. This
follow-up records the successful qualification work without erasing its failures.

## Native production-window proof

The first CLI-launched Electron attempts could not retain application focus on
macOS. The driver now calls `app.focus({ steal: true })` on macOS between
`window.show()` and `window.focus()`. The production window factory, all 59
scenarios, timeouts, and assertions are unchanged, including the explicit native
window/webContents focus check and trusted wheel-event requirements.

One activated exploratory run changed from Advanced to Account during a Settings
audit and failed visibility; its cause was not established. A subsequent run with
input tracing passed all 59 scenarios. Tracing and its temporary launcher were
then removed. The final direct invocation, without a wrapper, background flags,
or diagnostic listeners, passed all 59 scenarios:

```sh
RELAYER_NARROW_EVIDENCE_DIR=.relayer/evidence/sidebar-overflow/native-final \
  ./node_modules/.bin/electron scripts/test-desktop-narrow-sidebar.mjs
```

The command reused the already-passed build and populated-layout stages of
`npm run test:desktop:narrow-sidebar`. See [all native results](native-result.json),
[trusted wheel receipts](native-wheel.json), and [last scope option capture](native-scope-last.png).
The existing fixture prints missing `layer-selections-remember` IPC handler
warnings; no layer-selection-persistence proof is claimed. All assertions in
this driver completed and the final scenario count was 59.

Tested source: `f13f53081817b56bcad9be5908971a92d8be07f5` plus only the
three-line native-driver launch adjustment. Native driver SHA-256:
`39b750e08850bd7d0b57b5ebb059a3281e4981200add439e499c3b29ee7cea36`.
Product CSS and all layout-proof sources remain byte-identical to the prior
reviewed and tested snapshot. The follow-up adds evidence, not product behavior.

## Other verification

- Hosted CI run `36518285786` passed for PR head
  `f13f53081817b56bcad9be5908971a92d8be07f5`. Its `check` and freshness gates
  passed; this is evidence for that head, not an advance claim for a later commit.
- The earlier macOS Homebrew-Node sealing timeout passed on an isolated rerun:
  `vitest run test/evidence-capture-integrity.test.mjs -t
  'executes a sealed private Homebrew Node closure without external Homebrew reads'
  --maxWorkers=1`: 1 passed, 129 deliberately unselected. This does not rewrite
  the historical full-check failure.
- No additional product changes or test deletions were made.

## Review

`/root/merge_standards` and `/root/merge_spec` independently reviewed `f13f5308`
against `fd24be07`: zero standards and zero product-contract findings.
`/root/merge_standards` also reviewed the exact native-driver hash above and found
no assertion weakening or substitute input path. New evidence artifacts are
recorded results, not a substitute for those source reviews. Final-head CI and
merge readiness are reported on the PR itself.
