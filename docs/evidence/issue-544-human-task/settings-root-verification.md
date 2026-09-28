# Settings root URL initialization

The user's Chrome screenshot showed `Cannot read properties of undefined
(reading 'models')`. The settings server selected the production settings page,
but the bridge depended on `?evalSettings=1`. Without it, production state
captured an undefined desktop bridge.

The settings entrypoint now initializes the bridge before dynamically importing
production modules. Initialization is idempotent; model mutation notifications
use the initialized mode. Server capability checks remain unchanged.

## Required verification and actual evidence

The bridge/gateway regression went red before the fix because the initializer
did not exist. All nine host tests passed after the fix. The existing browser
runner now removes query parameters from the copied authenticated Settings URL,
opens it in fresh storage, opens Add provider, and checks model-family settings.

An initial heavy run timed out before Settings, waiting for dashboard cases.
That invocation omitted the private compatible CARGO_TARGET_DIR and did not
establish Settings proof. With the private verified native target selected,
`npm run test:eval-web` passed all five inner scenarios: interrupted startup,
human task, host lifecycle/authority, production Settings, and judge review.
No paid inference or live provider login was performed.

The running host served the corrected files without a restart. A live root URL
loaded providers and opened the six-option Add provider dialog in the in-app
browser. The user's Chrome window was navigated to a complete authenticated
Settings URL. Chrome's native accessibility tree exposed only browser chrome,
and screenshot capture was blank; actual Chrome page interaction remains
unverified. The original pending sign-in tab was not reloaded.

No compiled source changed in this delta. The earlier full-check Prime-agent
assertion failures remain unresolved; this is not a full-check pass claim.

## Adversarial review

Reviewer `/root/provider_backend` found no unresolved findings at four-file
workspace digest `ed819ab73866b213233f1fdd874421a347c4692b965209de5940bf5681def796`.
Scope: `desktop/eval-renderer/web-bridge.js`,
`desktop/eval-renderer/product-settings.js`, `test/eval-web-host.test.mjs`, and
`scripts/test-eval-web.mjs`. Review covered initialization/import order,
query-independent behavior, and unchanged server authority. The reviewer also
independently ran all nine host tests. Hash format is sorted relative path + NUL
+ contents + NUL. This review is non-certifying without a PR and is invalidated
by changes to those four files. Earlier delta digests are historical.
